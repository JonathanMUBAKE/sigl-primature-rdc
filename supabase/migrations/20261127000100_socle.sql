-- 20261127000100_socle.sql — Socle : structures, sites, agents, rôles, journal.
-- SIGL — Primature de la RDC. PostgreSQL 17 (Supabase local et production).

-- ---------------------------------------------------------------------------
-- structure : les entités de la Primature.
-- Le régime (integre / autonome) est la distinction majeure du modèle.
-- ---------------------------------------------------------------------------
create table if not exists structure (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  nom         text not null,
  type        text not null,
  regime      text not null,
  parent_id   uuid null references structure (id) on delete set null,
  actif       boolean not null default true,
  cree_le     timestamptz not null default now(),
  constraint structure_type_valide check (
    type in ('cabinet', 'secretariat_general', 'cellule', 'etablissement_public', 'service')
  ),
  constraint structure_regime_valide check (regime in ('integre', 'autonome')),
  constraint structure_pas_son_propre_parent check (parent_id is null or parent_id <> id)
);

create index if not exists idx_structure_regime on structure (regime);
create index if not exists idx_structure_type on structure (type);
create index if not exists idx_structure_parent on structure (parent_id);

-- ---------------------------------------------------------------------------
-- site : les implantations physiques d'une structure.
-- ---------------------------------------------------------------------------
create table if not exists site (
  id            uuid primary key default gen_random_uuid(),
  structure_id  uuid not null references structure (id) on delete cascade,
  nom           text not null,
  adresse       text null,
  ville         text not null default 'Kinshasa',
  actif         boolean not null default true,
  constraint site_nom_unique_par_structure unique (structure_id, nom),
  -- Permet aux tables comptables une clé étrangère composite qui interdit
  -- de référencer un site d'une autre structure (ADR-001, contrainte 1).
  constraint site_id_par_structure unique (structure_id, id)
);

create index if not exists idx_site_structure on site (structure_id);
create index if not exists idx_site_ville on site (ville);

-- ---------------------------------------------------------------------------
-- agent : les personnes. L'identité courante est portée par X-Agent-Id.
-- ---------------------------------------------------------------------------
create table if not exists agent (
  id            uuid primary key default gen_random_uuid(),
  structure_id  uuid not null references structure (id) on delete restrict,
  nom           text not null,
  fonction      text not null,
  email         text not null unique,
  telephone     text null,
  actif         boolean not null default true,
  cree_le       timestamptz not null default now(),
  -- Même raison que pour `site` : la frontière d'un établissement autonome
  -- ne doit pas être traversée par une référence technique (ADR-001).
  constraint agent_id_par_structure unique (structure_id, id)
);

create index if not exists idx_agent_structure on agent (structure_id);
create index if not exists idx_agent_actif on agent (actif);

-- ---------------------------------------------------------------------------
-- role : le référentiel des douze rôles du contrat, §4.
-- ---------------------------------------------------------------------------
create table if not exists role (
  code     text primary key,
  libelle  text not null,
  portee   text not null,
  rang     int not null default 100,
  constraint role_portee_valide check (portee in ('structure', 'perimetre', 'site', 'central', 'tout'))
);

insert into role (code, libelle, portee, rang) values
  ('demandeur',         'Agent demandeur',                'structure', 10),
  ('chef_structure',    'Chef de structure',              'structure', 20),
  ('comptable_matieres','Comptable des matières',         'perimetre', 30),
  ('magasinier',        'Magasinier',                     'site',      40),
  ('logistique',        'Chargé de logistique centrale',  'tout',      50),
  ('intendant',         'Intendant général',              'central',   55),
  ('ordonnateur',       'Ordonnateur',                    'central',   60),
  ('controle_budget',   'Contrôleur de budget',           'central',   65),
  ('comptable_public',  'Comptable public',               'central',   70),
  ('direction',         'Cabinet, Première ministre',     'tout',      80),
  ('controle_externe',  'IGF, Cour des comptes',          'tout',      90),
  ('admin',             'Administrateur',                 'central',   99)
on conflict (code) do update set
  libelle = excluded.libelle,
  portee  = excluded.portee,
  rang    = excluded.rang;

-- ---------------------------------------------------------------------------
-- agent_role : l'attribution d'un rôle, avec sa portée éventuelle.
-- ---------------------------------------------------------------------------
create table if not exists agent_role (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references agent (id) on delete cascade,
  role_code     text not null references role (code) on delete restrict,
  structure_id  uuid null references structure (id) on delete cascade,
  site_id       uuid null references site (id) on delete set null,
  attribue_le   timestamptz not null default now()
);

-- Un agent ne porte pas deux fois le même rôle sur la même portée.
create unique index if not exists idx_agent_role_unique
  on agent_role (agent_id, role_code, coalesce(structure_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists idx_agent_role_agent on agent_role (agent_id);
create index if not exists idx_agent_role_code on agent_role (role_code);
create index if not exists idx_agent_role_structure on agent_role (structure_id);

-- ---------------------------------------------------------------------------
-- journal : insertion seule. Aucune route de modification ni de suppression.
-- ---------------------------------------------------------------------------
create table if not exists journal (
  id           uuid primary key default gen_random_uuid(),
  horodatage   timestamptz not null default now(),
  agent_id     uuid null references agent (id) on delete set null,
  action       text not null,
  objet_type   text not null,
  objet_id     text null,
  avant        jsonb null,
  apres        jsonb null,
  ip           text null
);

create index if not exists idx_journal_horodatage on journal (horodatage desc);
create index if not exists idx_journal_agent on journal (agent_id);
create index if not exists idx_journal_objet on journal (objet_type, objet_id);
create index if not exists idx_journal_action on journal (action);
