-- 20261127000200_patrimoine.sql — Patrimoine : nomenclature, biens, mouvements, stocks.
-- Références IPSAS 45 et IPSAS 12 rappelées dans les commentaires.

-- ---------------------------------------------------------------------------
-- categorie : la nomenclature des biens, hiérarchique par parent_code.
-- ---------------------------------------------------------------------------
create table if not exists categorie (
  code                  text primary key,
  libelle               text not null,
  parent_code           text null references categorie (code) on delete restrict,
  classement            text not null,
  duree_amortissement   int null,
  unite                 text null,
  actif                 boolean not null default true,
  constraint categorie_classement_valide check (classement in ('immobilisation', 'stock')),
  constraint categorie_duree_positive check (duree_amortissement is null or duree_amortissement > 0),
  constraint categorie_pas_son_propre_parent check (parent_code is null or parent_code <> code)
);

create index if not exists idx_categorie_parent on categorie (parent_code);
create index if not exists idx_categorie_classement on categorie (classement);

-- ---------------------------------------------------------------------------
-- bien : la fiche centrale du patrimoine.
-- Un bien ne disparaît jamais (RG-015) : la perte et la réforme sont des états.
-- ---------------------------------------------------------------------------
create table if not exists bien (
  id                   uuid primary key default gen_random_uuid(),
  immatriculation      text null unique,
  categorie_code       text not null references categorie (code) on delete restrict,
  designation          text not null,
  marque               text null,
  modele               text null,
  numero_serie         text null,
  classement           text not null default 'immobilisation',
  objectif_detention   text not null default 'operationnelle',
  mode_entree          text not null default 'achat',
  valeur_acquisition   numeric(18, 2) not null,
  cout_remplacement    numeric(18, 2) null,
  date_acquisition     date not null,
  etat                 text not null default 'bon',
  structure_id         uuid not null references structure (id) on delete restrict,
  site_id              uuid null,
  detenteur_id         uuid null,
  suivi                text not null default 'individuel',
  quantite             int not null default 1,
  distribution_gratuite boolean not null default false,
  photo_url            text null,
  reforme_le           date null,
  cree_le              timestamptz not null default now(),
  maj_le               timestamptz not null default now(),

  -- IPSAS 45 §AG12
  constraint bien_classement_valide check (classement in ('immobilisation', 'stock')),
  -- IPSAS 45 §27 : la base d'évaluation
  constraint bien_objectif_valide check (objectif_detention in ('operationnelle', 'financiere')),
  -- commande l'évaluation initiale (IPSAS 45 §12, IPSAS 12 §16)
  constraint bien_mode_entree_valide check (mode_entree in ('achat', 'don', 'transfert')),
  constraint bien_etat_valide check (
    etat in ('neuf', 'bon', 'a_reparer', 'hors_service', 'en_maintenance', 'reforme', 'perdu')
  ),
  -- IPSAS 45 §8 : le lot est autorisé pour les petits matériels
  constraint bien_suivi_valide check (suivi in ('individuel', 'lot')),
  constraint bien_quantite_positive check (quantite > 0),
  constraint bien_valeur_non_negative check (valeur_acquisition >= 0),
  -- RG-012 / IPSAS 12 §17 : coût de remplacement obligatoire pour un stock distribué gratuitement
  constraint bien_cout_remplacement_requis check (
    not (classement = 'stock' and distribution_gratuite) or cout_remplacement is not null
  ),
  -- RG-021 : un bien suivi en lot n'a pas d'immatriculation individuelle
  constraint bien_lot_sans_immatriculation check (
    suivi = 'individuel' or immatriculation is null
  ),
  constraint bien_immatriculation_si_individuel check (
    suivi <> 'individuel' or immatriculation is not null
  ),
  constraint bien_reforme_coherente check (
    (etat = 'reforme') = (reforme_le is not null)
  ),

  -- ADR-001, contrainte 1 : aucune référence technique ne traverse la
  -- frontière d'une structure. Un bien ne peut être ni posé sur le site
  -- d'une autre structure, ni confié à un agent d'une autre structure.
  constraint bien_site_meme_structure
    foreign key (structure_id, site_id) references site (structure_id, id)
    on delete set null (site_id),
  constraint bien_detenteur_meme_structure
    foreign key (structure_id, detenteur_id) references agent (structure_id, id)
    on delete set null (detenteur_id)
);

create index if not exists idx_bien_structure on bien (structure_id);
create index if not exists idx_bien_categorie on bien (categorie_code);
create index if not exists idx_bien_etat on bien (etat);
create index if not exists idx_bien_site on bien (site_id);
create index if not exists idx_bien_detenteur on bien (detenteur_id);
create index if not exists idx_bien_classement on bien (classement);
create index if not exists idx_bien_date_acquisition on bien (date_acquisition desc);
create index if not exists idx_bien_recherche on bien (lower(designation));

-- ---------------------------------------------------------------------------
-- sequence_immatriculation : le compteur par structure et catégorie.
-- Format GIAI simplifié : BRT-<structure>-<catégorie>-<séquence 5>
-- ---------------------------------------------------------------------------
create table if not exists sequence_immatriculation (
  structure_code  text not null,
  prefixe_cat     text not null,
  dernier         int not null default 0,
  primary key (structure_code, prefixe_cat)
);

-- ---------------------------------------------------------------------------
-- mouvement : tout ce qui arrive à un bien.
-- ---------------------------------------------------------------------------
-- `structure_id` porte la structure propriétaire du bien au moment du
-- mouvement : c'est la clé de partitionnement, nécessaire au RLS (ADR-001).
-- Les structures source et cible d'un transfert sont désignées par leur **code
-- stable**, et non par une clé étrangère : un transfert peut viser un
-- établissement autonome, et aucune clé étrangère ne doit traverser cette
-- frontière sur une table comptable (ADR-001, contrainte 1).
create table if not exists mouvement (
  id                     uuid primary key default gen_random_uuid(),
  bien_id                uuid not null references bien (id) on delete cascade,
  structure_id           uuid not null references structure (id) on delete restrict,
  type                   text not null,
  quantite               int not null default 1,
  date                   date not null default current_date,
  structure_source_code  text null,
  structure_cible_code   text null,
  detenteur_source       uuid null,
  detenteur_cible        uuid null,
  motif                  text null,
  document_id            uuid null,
  agent_id               uuid null,
  cree_le                timestamptz not null default now(),
  constraint mouvement_type_valide check (
    type in ('entree', 'sortie', 'transfert', 'maintenance', 'retour_maintenance',
             'perte', 'declassement', 'reforme', 'reemploi')
  ),
  constraint mouvement_quantite_positive check (quantite > 0),
  constraint mouvement_detenteur_source_meme_structure
    foreign key (structure_id, detenteur_source) references agent (structure_id, id)
    on delete set null (detenteur_source),
  constraint mouvement_detenteur_cible_meme_structure
    foreign key (structure_id, detenteur_cible) references agent (structure_id, id)
    on delete set null (detenteur_cible),
  constraint mouvement_agent_meme_structure
    foreign key (structure_id, agent_id) references agent (structure_id, id)
    on delete set null (agent_id)
);

create index if not exists idx_mouvement_bien on mouvement (bien_id);
create index if not exists idx_mouvement_structure on mouvement (structure_id);
create index if not exists idx_mouvement_type on mouvement (type);
create index if not exists idx_mouvement_date on mouvement (date desc);
create index if not exists idx_mouvement_structure_cible on mouvement (structure_cible_code);
create index if not exists idx_mouvement_document on mouvement (document_id);

-- ---------------------------------------------------------------------------
-- stock : la vue agrégée par article et par site, avec ses seuils.
-- ---------------------------------------------------------------------------
create table if not exists stock (
  id               uuid primary key default gen_random_uuid(),
  categorie_code   text not null references categorie (code) on delete restrict,
  structure_id     uuid not null references structure (id) on delete restrict,
  site_id          uuid not null,
  designation      text not null,
  unite            text not null default 'unité',
  quantite         int not null default 0,
  seuil_minimum    int not null default 0,
  seuil_critique   int not null default 0,
  maj_le           timestamptz not null default now(),
  constraint stock_article_unique unique (categorie_code, site_id, designation),
  -- RG-005 : aucune sortie au-delà de l'existant
  constraint stock_quantite_non_negative check (quantite >= 0),
  constraint stock_seuils_coherents check (seuil_critique <= seuil_minimum),
  constraint stock_seuils_non_negatifs check (seuil_minimum >= 0 and seuil_critique >= 0),
  constraint stock_site_meme_structure
    foreign key (structure_id, site_id) references site (structure_id, id)
    on delete cascade
);

create index if not exists idx_stock_site on stock (site_id);
create index if not exists idx_stock_structure on stock (structure_id);
create index if not exists idx_stock_categorie on stock (categorie_code);
create index if not exists idx_stock_sous_seuil on stock (site_id, quantite);
