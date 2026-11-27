-- 20261127090100_rattachement_reprise.sql — `sigl_structure_rattachement`
-- connaît désormais la reprise.
--
-- POURQUOI. Depuis que `reprise` est cloisonnée par la base (migration
-- 090000), une reprise hors périmètre n'est plus rendue : la route répondrait
-- « introuvable » là où elle doit répondre « cette reprise relève d'une autre
-- structure ». Un « introuvable » se lit comme une panne du logiciel, et
-- l'agent appelle le support pour un refus qui était volontaire.
--
-- C'est exactement le besoin déjà tranché pour `dossier_achat` et
-- `bon_commande` (migration 050000). La fonction est donc **étendue**, pas
-- redoublée : une fonctionnalité s'écrit une fois et s'appelle partout, seul
-- l'objet varie d'un appel à l'autre.
--
-- Elle reste volontairement étroite : elle ne rend que l'identifiant de la
-- structure concernée — une donnée que tout agent lit déjà dans
-- l'organigramme — et jamais une donnée de la pièce elle-même.
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
  elsif objet = 'reprise' then
    return (select r.structure_id from reprise r where r.id = cible);
  end if;
  raise exception 'Objet inconnu pour la résolution de rattachement : %', objet;
end;
$$;

revoke all on function sigl_structure_rattachement(text, uuid) from public;
grant execute on function sigl_structure_rattachement(text, uuid) to sigl_agent, sigl_consolidation;

comment on function sigl_structure_rattachement(text, uuid) is
  'Rend la seule structure de rattachement d''un dossier d''achat, d''un bon de commande ou d''une reprise, pour que la route refuse en nommant la règle plutôt qu''en répondant « introuvable ».';
