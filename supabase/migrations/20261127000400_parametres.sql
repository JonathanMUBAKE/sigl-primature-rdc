-- 20261127000400_parametres.sql — Paramètres administrables et alertes.
-- Les seuils sont horodatés et versionnés : une décision prise hier doit
-- rester jugeable avec les seuils d'hier (RG-007).

-- ---------------------------------------------------------------------------
-- parametre : la valeur en vigueur.
-- ---------------------------------------------------------------------------
create table if not exists parametre (
  cle        text primary key,
  valeur     jsonb not null,
  libelle    text null,
  maj_le     timestamptz not null default now(),
  maj_par    uuid null references agent (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- parametre_version : l'historique, pour rejuger une décision ancienne.
-- ---------------------------------------------------------------------------
create table if not exists parametre_version (
  id            uuid primary key default gen_random_uuid(),
  cle           text not null,
  valeur        jsonb not null,
  en_vigueur_du timestamptz not null,
  en_vigueur_au timestamptz null,
  maj_par       uuid null references agent (id) on delete set null,
  cree_le       timestamptz not null default now()
);

create index if not exists idx_parametre_version_cle on parametre_version (cle, en_vigueur_du desc);

-- ---------------------------------------------------------------------------
-- alerte : RG-022. Aucune alerte ne décide quoi que ce soit.
-- Elle ouvre un examen, un humain tranche, et la suite est conservée.
-- ---------------------------------------------------------------------------
create table if not exists alerte (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  gravite       text not null,
  -- Clé de partitionnement : la structure concernée par l'alerte (ADR-001).
  structure_id  uuid not null references structure (id) on delete restrict,
  objet_type    text not null,
  objet_id      text null,
  explication   text not null,
  donnees       jsonb not null default '{}'::jsonb,
  statut        text not null default 'ouverte',
  traite_par    uuid null references agent (id) on delete set null,
  traite_le     timestamptz null,
  suite         text null,
  cree_le       timestamptz not null default now(),
  constraint alerte_gravite_valide check (gravite in ('information', 'attention', 'critique')),
  constraint alerte_statut_valide check (
    statut in ('ouverte', 'en_examen', 'justifiee', 'confirmee', 'classee')
  ),
  -- une alerte sortie de l'examen porte sa suite et son instructeur
  constraint alerte_suite_si_tranchee check (
    statut in ('ouverte', 'en_examen')
    or (traite_par is not null and traite_le is not null
        and suite is not null and length(trim(suite)) > 0)
  )
);

create index if not exists idx_alerte_statut on alerte (statut);
create index if not exists idx_alerte_structure on alerte (structure_id);
create index if not exists idx_alerte_gravite on alerte (gravite);
create index if not exists idx_alerte_code on alerte (code);
create index if not exists idx_alerte_objet on alerte (objet_type, objet_id);
create index if not exists idx_alerte_cree_le on alerte (cree_le desc);
