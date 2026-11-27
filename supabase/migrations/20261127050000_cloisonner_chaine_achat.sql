-- 20261127050000_cloisonner_chaine_achat.sql — `dossier_achat` et
-- `bon_commande` entrent dans le cloisonnement tenu par la base.
--
-- DÉCISION ASSUMÉE, ET PAR QUI. Cette décision était ouverte et laissée à
-- l'arbitrage de la conception. Faute d'arbitre, elle est tranchée ici et
-- assumée : voir `docs/JOURNAL-DU-CHANTIER.md`, 27 novembre 2026.
--
-- POURQUOI. Ces deux tables portent l'engagement de la dépense publique et
-- étaient les seules de la chaîne à rester hors de `tables_cloisonnees`
-- (migration 000500). Leur isolation ne tenait qu'au code des routes, et deux
-- oublis successifs l'ont prouvé coûteux :
--
--   * le contrôle de périmètre du paiement, lu au bout d'une jointure externe
--     vers une table cloisonnée, s'effaçait là où il devait mordre
--     (migration 040000) ;
--   * la liste des dossiers ne filtrait rien du tout, et rendait les dossiers
--     de toutes les structures sous une étiquette annonçant le contraire.
--
-- Une règle qui ne tient qu'à la vigilance du code finit par céder. Celle-ci
-- descend dans la base, comme le veut l'ADR-001.
--
-- CE QUE CELA NE FAIT PAS. Cela ne remplace pas le refus motivé des routes. Une
-- ligne devenue invisible ferait répondre « introuvable » à un comptable public
-- qui a besoin de lire « ce bon relève de l'ARMP, qui tient ses propres
-- écritures ». `sigl_structure_rattachement()` ci-dessous rend **l'identifiant
-- de structure et rien d'autre**, pour que la route conserve son 403 / RG-017.

-- ---------------------------------------------------------------------------
-- L'écriture sur la chaîne d'achat.
--
-- `sigl_ecriture_permise` borne l'écriture à sa propre structure et à ses
-- filles intégrées. Appliquée telle quelle à `bon_commande`, elle interdirait
-- au comptable public de marquer payable un bon hors de sa portée propre — et
-- la chaîne de la commande au paiement resterait rompue pour l'institution,
-- ce qui était le défaut d'origine.
--
-- Le prédicat ci-dessous ajoute donc le périmètre **intégré** du comptable
-- public, et lui seul. La raison n'est pas de commodité : marquer un bon
-- payable est un acte de la chaîne de la dépense de la Primature, dont il est
-- le comptable (décret 13/050 art. 137). Ce n'est pas une écriture dans la
-- comptabilité des matières d'une personnalité juridique distincte, et c'est
-- cela que RG-018 protège.
--
-- RG-018 tient donc entière : la branche ajoutée exige `regime = 'integre'`,
-- donc un établissement `autonome` n'est jamais écrit d'en haut — chaîne
-- d'achat comprise. Qui peut appeler quelle route reste décidé par les routes ;
-- cette politique est un plancher, pas la règle de gestion.
-- ---------------------------------------------------------------------------
create or replace function sigl_ecriture_chaine_achat(cible uuid) returns boolean
  language sql stable security definer set search_path = public as
$$
  select sigl_ecriture_permise(cible)
      or (
        cible is not null
        and not sigl_consolide()
        and sigl_portee_integre()
        and sigl_structure_courante() is not null
        and exists (select 1 from structure s where s.id = cible and s.regime = 'integre')
      )
$$;

revoke all on function sigl_ecriture_chaine_achat(uuid) from public;
grant execute on function sigl_ecriture_chaine_achat(uuid) to sigl_agent, sigl_consolidation;

comment on function sigl_ecriture_chaine_achat(uuid) is
  'RG-018 pour la chaîne d''achat : l''écriture de sigl_ecriture_permise, plus le périmètre intégré du comptable public. Jamais un établissement autonome.';

-- ---------------------------------------------------------------------------
-- La résolution du rattachement, pour que le refus reste motivé.
--
-- `security definer`, et volontairement étroite : elle ne rend que
-- l'identifiant de la structure concernée — que tout agent lit déjà dans
-- l'organigramme — et jamais une donnée du dossier ou du bon. C'est le prix du
-- 403 / RG-017 explicite, préféré à un 404 qui se lit comme une panne.
-- ---------------------------------------------------------------------------
create or replace function sigl_structure_rattachement(objet text, cible uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if cible is null then
    return null;
  end if;
  if objet = 'dossier_achat' then
    return (select d.structure_id from dossier_achat d where d.id = cible);
  elsif objet = 'bon_commande' then
    return (select b.structure_id from bon_commande b where b.id = cible);
  end if;
  raise exception 'Objet inconnu pour la résolution de rattachement : %', objet;
end;
$$;

revoke all on function sigl_structure_rattachement(text, uuid) from public;
grant execute on function sigl_structure_rattachement(text, uuid) to sigl_agent, sigl_consolidation;

comment on function sigl_structure_rattachement(text, uuid) is
  'Rend la seule structure de rattachement d''un dossier d''achat ou d''un bon de commande, pour que la route refuse en nommant la règle plutôt qu''en répondant « introuvable ».';

-- ---------------------------------------------------------------------------
-- Les politiques. Même forme que la migration 000500, à l'écriture près.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['dossier_achat', 'bon_commande'] loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists %I on %I', t || '_lecture', t);
    execute format(
      'create policy %I on %I for select using (sigl_lecture_permise(structure_id))',
      t || '_lecture', t);

    execute format('drop policy if exists %I on %I', t || '_insertion', t);
    execute format(
      'create policy %I on %I for insert with check (sigl_ecriture_chaine_achat(structure_id))',
      t || '_insertion', t);

    -- Le droit sur la ligne avant **et** après : on ne déplace pas un dossier
    -- hors de son cloisonnement.
    execute format('drop policy if exists %I on %I', t || '_maj', t);
    execute format(
      'create policy %I on %I for update using (sigl_ecriture_chaine_achat(structure_id))
         with check (sigl_ecriture_chaine_achat(structure_id))',
      t || '_maj', t);

    execute format('drop policy if exists %I on %I', t || '_suppression', t);
    execute format(
      'create policy %I on %I for delete using (sigl_ecriture_chaine_achat(structure_id))',
      t || '_suppression', t);
  end loop;
end
$$;
