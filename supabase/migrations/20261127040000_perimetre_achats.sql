-- 20261127030000_perimetre_achats.sql — Le dossier d'achat et le bon de commande
-- portent désormais leur propre structure.
--
-- Ce qui a été constaté. Le contrôle de périmètre du bon de commande lisait sa
-- structure au bout d'une jointure externe : bon → dossier → état de besoin.
-- Or `etat_besoin` est cloisonnée par la sécurité au niveau des lignes. Quand le
-- bon relevait d'une structure hors périmètre, la base masquait l'état de besoin,
-- la jointure rendait `null`, et `verifierLecture` — qui sort sans rien contrôler
-- sur une structure vide — laissait passer. Le contrôle s'effaçait exactement
-- dans le cas où il devait mordre, et la route répondait ensuite « certificat
-- manquant » faute de voir un certificat qui existait pourtant.
--
-- Un contrôle de sécurité ne se lit pas au bout d'une jointure externe sur une
-- table cloisonnée : la base a le droit de rendre `null`, et un `null` ne se
-- distingue pas d'une absence de cloisonnement. La structure est donc inscrite
-- sur la ligne elle-même, `not null`, et résolue une fois pour toutes à
-- l'écriture.
--
-- Conséquence voulue : la suppression d'un état de besoin (`on delete set null`)
-- ne fait plus perdre au dossier son rattachement.

-- ---------------------------------------------------------------------------
-- La colonne, et le remplissage de l'existant.
-- ---------------------------------------------------------------------------
alter table dossier_achat
  add column if not exists structure_id uuid references structure (id) on delete restrict;
alter table bon_commande
  add column if not exists structure_id uuid references structure (id) on delete restrict;

update dossier_achat d
   set structure_id = e.structure_id
  from etat_besoin e
 where e.id = d.etat_besoin_id
   and d.structure_id is null;

update bon_commande b
   set structure_id = d.structure_id
  from dossier_achat d
 where d.id = b.dossier_id
   and b.structure_id is null;

-- On refuse de deviner. Si une ligne reste sans rattachement, la migration
-- échoue : mieux vaut un déploiement arrêté qu'un contrôle de périmètre muet.
do $$
declare
  orphelins integer;
begin
  select (select count(*) from dossier_achat where structure_id is null)
       + (select count(*) from bon_commande where structure_id is null)
    into orphelins;
  if orphelins > 0 then
    raise exception
      'Rattachement impossible pour % ligne(s) de la chaîne d''achat : renseignez structure_id avant d''appliquer cette migration.',
      orphelins;
  end if;
end
$$;

alter table dossier_achat alter column structure_id set not null;
alter table bon_commande  alter column structure_id set not null;

create index if not exists idx_dossier_structure     on dossier_achat (structure_id);
create index if not exists idx_bon_commande_structure on bon_commande (structure_id);

-- ---------------------------------------------------------------------------
-- Le rattachement se résout à l'écriture, une seule fois.
--
-- `security definer` : la résolution traverse `etat_besoin`, qui est cloisonnée.
-- Elle ne rend aucune donnée — seulement l'identifiant de la structure que la
-- ligne concerne, que tout agent peut déjà lire dans l'organigramme. Les droits
-- d'écriture restent ceux des routes (RG-017, RG-018) ; ce déclencheur ne les
-- élargit pas, il inscrit le fait.
-- ---------------------------------------------------------------------------
create or replace function sigl_rattacher_chaine_achat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.structure_id is not null then
    return new;
  end if;

  if tg_table_name = 'dossier_achat' then
    select e.structure_id into new.structure_id
      from etat_besoin e where e.id = new.etat_besoin_id;
  else
    select d.structure_id into new.structure_id
      from dossier_achat d where d.id = new.dossier_id;
  end if;

  if new.structure_id is null then
    raise exception
      'Indiquez la structure concernée : elle ne se déduit pas de cette ligne.'
      using errcode = 'not_null_violation';
  end if;

  return new;
end;
$$;

comment on function sigl_rattacher_chaine_achat() is
  'Inscrit sur la ligne la structure que le dossier ou le bon concerne, résolue une fois à l''écriture. Un contrôle de périmètre ne doit pas dépendre d''une jointure externe sur une table cloisonnée.';

drop trigger if exists sigl_rattacher_dossier on dossier_achat;
create trigger sigl_rattacher_dossier
  before insert on dossier_achat
  for each row execute function sigl_rattacher_chaine_achat();

drop trigger if exists sigl_rattacher_bon on bon_commande;
create trigger sigl_rattacher_bon
  before insert on bon_commande
  for each row execute function sigl_rattacher_chaine_achat();
