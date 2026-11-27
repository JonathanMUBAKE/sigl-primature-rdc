-- 20261127090000_reprise.sql — La reprise des inventaires existants.
--
-- POURQUOI. Le SIGL n'arrive pas dans un vide : la Primature tient déjà ses
-- inventaires sur papier et en tableur. Un registre qui démarre vide renvoie
-- les agents à leurs classeurs. Contrat du lot : `docs/LOT-REPRISE.md`.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS. Aucun `drop`, aucune colonne retirée,
-- aucune donnée touchée. Elle ajoute une colonne à `bien` avec une valeur par
-- défaut qui laisse le patrimoine déjà saisi inchangé, et deux tables neuves.
-- Migration en deux temps (RESULTAT-A-ATTEINDRE §7.10) : la version
-- précédente du serveur continue de fonctionner sur ce schéma.

-- ---------------------------------------------------------------------------
-- Une valeur d'acquisition inconnue se dit inconnue.
--
-- `bien.valeur_acquisition` est `not null`, et un inventaire papier ne porte
-- presque jamais la valeur d'entrée. Exiger la colonne ferait rejeter
-- l'essentiel des lignes; écrire zéro en silence serait pire, car zéro est le
-- prix d'un don et le registre affirmerait une fausseté qu'aucun écran ne
-- pourrait démentir.
--
-- Le défaut est `true` : tout ce qui a été saisi par les écrans porte une
-- valeur voulue par son auteur, et reste donc réputé documenté.
-- ---------------------------------------------------------------------------
alter table bien
  add column if not exists valeur_acquisition_connue boolean not null default true;

comment on column bien.valeur_acquisition_connue is
  'Faux quand la valeur d''entrée n''est pas documentée — reprise d''un inventaire qui ne la portait pas. Les écrans affichent alors « non documentée », jamais un montant.';

-- ---------------------------------------------------------------------------
-- reprise : un dépôt de fichier, analysé et pas encore appliqué.
--
-- `structure_id` est la clé de partitionnement (ADR-001) : une reprise ne
-- crée de biens que dans sa structure (RG-037).
-- ---------------------------------------------------------------------------
create table if not exists reprise (
  id                  uuid primary key default gen_random_uuid(),
  numero              text not null unique,
  structure_id        uuid not null references structure (id) on delete restrict,
  nature              text not null default 'bien',
  fichier_nom         text not null,
  -- L'empreinte du fichier déposé. Elle sert à reconnaître un dépôt identique
  -- et prépare le scellement vérifiable des pièces (RESULTAT-A-ATTEINDRE §7.4).
  fichier_empreinte   text not null,
  lignes_total        int not null default 0,
  statut              text not null default 'analysee',
  depose_par          uuid null references agent (id) on delete set null,
  applique_par        uuid null references agent (id) on delete set null,
  cree_le             timestamptz not null default now(),
  applique_le         timestamptz null,
  constraint reprise_nature_valide check (nature in ('bien')),
  constraint reprise_statut_valide check (statut in ('analysee', 'appliquee')),
  constraint reprise_lignes_non_negatives check (lignes_total >= 0),
  -- RG-036, premier verrou : le statut et l'horodatage ne se contredisent pas.
  constraint reprise_application_coherente check (
    (statut = 'appliquee') = (applique_le is not null)
  )
);

create index if not exists idx_reprise_structure on reprise (structure_id);
create index if not exists idx_reprise_statut on reprise (statut);
create index if not exists idx_reprise_empreinte on reprise (fichier_empreinte);

comment on table reprise is
  'Un dépôt de fichier d''inventaire existant. RG-034 : le dépôt analyse et propose, l''application écrit.';

-- ---------------------------------------------------------------------------
-- reprise_ligne : le rapport, ligne par ligne.
--
-- `donnees` garde la ligne telle qu'elle a été lue, y compris quand elle est
-- rejetée : c'est ce qui permet à l'agent de voir ce qu'il avait écrit, et non
-- seulement qu'il s'était trompé. `colonne` nomme la colonne en cause — un
-- refus qui ne dit pas où regarder est un refus inutilisable.
--
-- `structure_id` est redondant avec `reprise.structure_id`, et c'est voulu : un
-- contrôle de périmètre ne se lit jamais au bout d'une jointure vers une table
-- cloisonnée, la base ayant le droit de rendre `null` (leçon du 27 novembre).
-- ---------------------------------------------------------------------------
create table if not exists reprise_ligne (
  id             uuid primary key default gen_random_uuid(),
  reprise_id     uuid not null references reprise (id) on delete cascade,
  structure_id   uuid not null references structure (id) on delete restrict,
  numero_ligne   int not null,
  donnees        jsonb not null default '{}'::jsonb,
  verdict        text not null,
  motif          text null,
  colonne        text null,
  bien_id        uuid null references bien (id) on delete set null,
  constraint reprise_ligne_unique unique (reprise_id, numero_ligne),
  constraint reprise_ligne_verdict_valide check (
    verdict in ('a_creer', 'doublon', 'rejetee', 'creee')
  ),
  constraint reprise_ligne_numero_positif check (numero_ligne > 0),
  -- Une ligne rejetée ou en doublon dit pourquoi. Sans cela, le rapport
  -- compte sans expliquer, et l'agent compare deux listes à la main.
  constraint reprise_ligne_motif_requis check (
    verdict not in ('rejetee', 'doublon') or motif is not null
  ),
  -- Une ligne créée porte le bien qu'elle a produit : c'est le lien qui rend
  -- la reprise vérifiable après coup.
  constraint reprise_ligne_bien_si_creee check (
    (verdict = 'creee') = (bien_id is not null)
  )
);

create index if not exists idx_reprise_ligne_reprise on reprise_ligne (reprise_id, numero_ligne);
create index if not exists idx_reprise_ligne_structure on reprise_ligne (structure_id);
create index if not exists idx_reprise_ligne_verdict on reprise_ligne (reprise_id, verdict);

comment on table reprise_ligne is
  'Le rapport d''une reprise, ligne par ligne, avec son verdict, son motif et la colonne en cause.';

-- ---------------------------------------------------------------------------
-- RG-036 — Une reprise appliquée est figée.
--
-- Une deuxième application doublerait le patrimoine, et c'est l'erreur dont on
-- ne revient pas : rien ne distingue ensuite le doublon de l'original. Le
-- verrou est en base, et non dans la route, parce qu'une règle qui ne tient
-- qu'à la vigilance du code finit par céder (ADR-001).
-- ---------------------------------------------------------------------------
create or replace function sigl_reprise_figee() returns trigger
language plpgsql
as $$
begin
  if old.statut = 'appliquee' then
    raise exception 'RG-036 : la reprise % est déjà appliquée et ne se modifie plus.', old.numero
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reprise_figee on reprise;
create trigger trg_reprise_figee
  before update on reprise
  for each row execute function sigl_reprise_figee();

comment on function sigl_reprise_figee() is
  'RG-036 : une reprise appliquée ne se modifie plus. Une deuxième application doublerait le patrimoine.';

-- ---------------------------------------------------------------------------
-- Le cloisonnement. Même forme que la migration 000500.
--
-- RG-037 en base : l'écriture suit `sigl_ecriture_permise`, qui s'arrête à la
-- frontière d'un établissement autonome (RG-018). La portée transversale du
-- comptable public n'est pas ajoutée ici : reprendre un inventaire est un acte
-- de la comptabilité des matières d'une structure, pas de la chaîne de la
-- dépense de la Primature — l'exception consentie à `bon_commande` ne se
-- transporte pas à l'identique.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['reprise', 'reprise_ligne'] loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists %I on %I', t || '_lecture', t);
    execute format(
      'create policy %I on %I for select using (sigl_lecture_permise(structure_id))',
      t || '_lecture', t);

    execute format('drop policy if exists %I on %I', t || '_insertion', t);
    execute format(
      'create policy %I on %I for insert with check (sigl_ecriture_permise(structure_id))',
      t || '_insertion', t);

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

grant select, insert, update, delete on reprise, reprise_ligne to sigl_agent;
grant select on reprise, reprise_ligne to sigl_consolidation;
