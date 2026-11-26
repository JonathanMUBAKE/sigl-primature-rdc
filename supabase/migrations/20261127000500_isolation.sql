-- 20261127000500_isolation.sql — Isolation des structures par la sécurité au niveau des
-- lignes. Applique ADR-001.
--
-- RG-017 : une structure ne lit que ses propres données.
-- RG-018 : une structure `autonome` n'est jamais écrite par le niveau central.
--
-- Ces deux règles sont tenues **par la base**, pas par le code des routes. Une
-- requête métier qui oublierait son filtre ne renvoie rien ; une écriture du
-- niveau central dans un établissement autonome est refusée par PostgreSQL.
--
-- ATTENTION — ce qui fait réellement tenir le dispositif. Un rôle qui porte
-- `rolbypassrls` **contourne le RLS**, et `force row level security` n'y change
-- rien. C'est le cas de `postgres` et de `service_role` sous Supabase. La
-- bascule `set local role sigl_agent` au début de chaque transaction métier est
-- donc la pièce maîtresse, pas un détail d'implémentation : sans elle les
-- politiques ci-dessous sont inertes et tout est visible. Voir
-- `server/src/db.js` et `server/src/isolation.test.js`.

-- ---------------------------------------------------------------------------
-- Les trois rôles.
-- `sigl_agent`          : non privilégié, les requêtes métier.
-- `sigl_consolidation`  : lecture seule sur tout, poste de commande central et
--                         contrôle externe.
-- Le propriétaire (`postgres` en local) : migrations et jeu de démonstration.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sigl_agent') then
    create role sigl_agent nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'sigl_consolidation') then
    create role sigl_consolidation nologin;
  end if;
end
$$;

grant usage on schema public to sigl_agent, sigl_consolidation;

-- Le rôle métier écrit ; le rôle de consolidation ne fait que lire.
grant select, insert, update, delete on all tables in schema public to sigl_agent;
grant select on all tables in schema public to sigl_consolidation;
alter default privileges in schema public
  grant select, insert, update, delete on tables to sigl_agent;
alter default privileges in schema public
  grant select on tables to sigl_consolidation;

-- Le journal est en insertion seule pour tout le monde (contrat §1, règle 2).
revoke update, delete on journal from sigl_agent;

-- Personne d'autre que le propriétaire ne touche aux paramètres ni aux rôles.
revoke insert, update, delete on parametre, parametre_version, "role" from sigl_agent;

-- ---------------------------------------------------------------------------
-- Le contexte de session, posé par `db.js` à chaque transaction.
-- ---------------------------------------------------------------------------

/** La structure sur laquelle la session est positionnée, ou null. */
create or replace function sigl_structure_courante() returns uuid
  language sql stable as
$$ select nullif(current_setting('sigl.structure', true), '')::uuid $$;

/** L'agent courant, pour le journal. */
create or replace function sigl_agent_courant() returns uuid
  language sql stable as
$$ select nullif(current_setting('sigl.agent', true), '')::uuid $$;

/** Vrai quand la session est en mode consolidation (lecture de tout). */
create or replace function sigl_consolide() returns boolean
  language sql stable as
$$ select coalesce(nullif(current_setting('sigl.consolidation', true), ''), 'non') = 'oui' $$;

/**
 * La lecture est permise sur sa propre structure, ou en mode consolidation.
 * Sans contexte, la fonction rend faux : la session échoue fermée plutôt que
 * de tout montrer.
 */
create or replace function sigl_lecture_permise(cible uuid) returns boolean
  language sql stable as
$$ select sigl_consolide() or (cible is not null and cible = sigl_structure_courante()) $$;

/**
 * RG-018, tenue par la base. L'écriture est permise :
 *   - dans sa propre structure, quelle qu'elle soit ;
 *   - dans une structure `integre` depuis le niveau central, car son
 *     patrimoine est celui de la Primature.
 * Elle est refusée dans une structure `autonome` dès que le contexte n'est pas
 * cette structure elle-même, et refusée en mode consolidation.
 *
 * `security definer` : la politique doit pouvoir lire `structure` pour juger du
 * régime, sans qu'on accorde ce droit au rôle appelant.
 */
create or replace function sigl_ecriture_permise(cible uuid) returns boolean
  language sql stable security definer set search_path = public as
$$
  select cible is not null
     and not sigl_consolide()
     and sigl_structure_courante() is not null
     and (
       cible = sigl_structure_courante()
       or exists (select 1 from structure s where s.id = cible and s.regime = 'integre')
     )
$$;

revoke all on function sigl_ecriture_permise(uuid) from public;
grant execute on function sigl_ecriture_permise(uuid) to sigl_agent, sigl_consolidation;

-- ---------------------------------------------------------------------------
-- Les politiques. Lecture et écriture distinctes, sur chaque table portant une
-- clé de partitionnement `structure_id`.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables_cloisonnees text[] := array[
    'site', 'agent', 'bien', 'mouvement', 'stock',
    'etat_besoin', 'ligne_besoin', 'document', 'alerte'
  ];
begin
  foreach t in array tables_cloisonnees loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists %I on %I', t || '_lecture', t);
    execute format(
      'create policy %I on %I for select using (sigl_lecture_permise(structure_id))',
      t || '_lecture', t);

    execute format('drop policy if exists %I on %I', t || '_insertion', t);
    execute format(
      'create policy %I on %I for insert with check (sigl_ecriture_permise(structure_id))',
      t || '_insertion', t);

    -- La mise à jour exige le droit sur la ligne avant **et** après : on ne
    -- déplace pas une ligne hors de son cloisonnement.
    execute format('drop policy if exists %I on %I', t || '_maj', t);
    execute format(
      'create policy %I on %I for update using (sigl_ecriture_permise(structure_id))
         with check (sigl_ecriture_permise(structure_id))',
      t || '_maj', t);

    execute format('drop policy if exists %I on %I', t || '_suppression', t);
    execute format(
      'create policy %I on %I for delete using (sigl_ecriture_permise(structure_id))',
      t || '_suppression', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Le journal : chacun lit ce qui concerne sa structure, le contrôle externe
-- lit tout, et personne ne modifie (contrat §1, règle 2).
-- ---------------------------------------------------------------------------
alter table journal enable row level security;

drop policy if exists journal_lecture on journal;
create policy journal_lecture on journal for select using (sigl_consolide());

drop policy if exists journal_insertion on journal;
create policy journal_insertion on journal for insert with check (true);
