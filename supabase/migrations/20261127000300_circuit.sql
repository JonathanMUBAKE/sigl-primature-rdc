-- 20261127000300_circuit.sql — Circuit du besoin : états de besoin, achats, documents.

-- ---------------------------------------------------------------------------
-- etat_besoin : la demande, de son brouillon à sa clôture.
-- ---------------------------------------------------------------------------
create table if not exists etat_besoin (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique,
  structure_id     uuid not null references structure (id) on delete restrict,
  demandeur_id     uuid not null,
  statut           text not null default 'brouillon',
  justification    text null,
  cree_le          timestamptz not null default now(),
  vise_le          timestamptz null,
  viseur_id        uuid null references agent (id) on delete set null,
  examine_le       timestamptz null,
  examinateur_id   uuid null references agent (id) on delete set null,
  motif_decision   text null,
  accuse_le        timestamptz null,
  clos_le          timestamptz null,
  constraint etat_besoin_statut_valide check (
    statut in ('brouillon', 'vise', 'recu', 'examine', 'partiel', 'rejete',
               'en_achat', 'livrable', 'livre', 'clos')
  ),
  -- RG-002 : qui demande ne vise pas
  constraint etat_besoin_viseur_distinct check (viseur_id is null or viseur_id <> demandeur_id),
  -- RG-001 : un état visé porte une justification
  constraint etat_besoin_justification_si_vise check (
    statut = 'brouillon' or (justification is not null and length(trim(justification)) > 0)
  ),
  -- RG-003 / RG-004 : partiel et rejet exigent un motif
  constraint etat_besoin_motif_si_partiel_ou_rejete check (
    statut not in ('partiel', 'rejete')
    or (motif_decision is not null and length(trim(motif_decision)) > 0)
  ),
  -- ADR-001, contrainte 1 : le demandeur est un agent de la structure demandeuse.
  constraint besoin_demandeur_meme_structure
    foreign key (structure_id, demandeur_id) references agent (structure_id, id)
    on delete restrict
);

create index if not exists idx_besoin_statut on etat_besoin (statut);
create index if not exists idx_besoin_structure on etat_besoin (structure_id);
create index if not exists idx_besoin_demandeur on etat_besoin (demandeur_id);
create index if not exists idx_besoin_cree_le on etat_besoin (cree_le desc);

-- ---------------------------------------------------------------------------
-- ligne_besoin : l'aiguillage se fait ligne par ligne.
-- ---------------------------------------------------------------------------
create table if not exists ligne_besoin (
  id                  uuid primary key default gen_random_uuid(),
  etat_besoin_id      uuid not null references etat_besoin (id) on delete cascade,
  -- Clé de partitionnement recopiée depuis l'état de besoin, pour que le RLS
  -- s'applique à la ligne sans jointure (ADR-001).
  structure_id        uuid not null references structure (id) on delete restrict,
  categorie_code      text not null references categorie (code) on delete restrict,
  designation         text not null,
  quantite_demandee   int not null,
  quantite_accordee   int null,
  motif               text null,
  origine             text null,
  rang                int not null default 1,
  constraint ligne_origine_valide check (origine is null or origine in ('stock', 'achat', 'refuse')),
  constraint ligne_quantite_demandee_positive check (quantite_demandee > 0),
  constraint ligne_quantite_accordee_coherente check (
    quantite_accordee is null
    or (quantite_accordee >= 0 and quantite_accordee <= quantite_demandee)
  )
);

create index if not exists idx_ligne_besoin on ligne_besoin (etat_besoin_id);
create index if not exists idx_ligne_structure on ligne_besoin (structure_id);
create index if not exists idx_ligne_categorie on ligne_besoin (categorie_code);
create index if not exists idx_ligne_origine on ligne_besoin (origine);

-- ---------------------------------------------------------------------------
-- fournisseur : RG-009 interdit tout bon de commande vers la liste noire.
-- ---------------------------------------------------------------------------
create table if not exists fournisseur (
  id                  uuid primary key default gen_random_uuid(),
  denomination        text not null,
  rccm                text null unique,
  id_nat              text null,
  nif                 text null,
  adresse             text null,
  telephone           text null,
  email               text null,
  categories          text[] not null default '{}',
  liste_noire         boolean not null default false,
  motif_liste_noire   text null,
  delai_moyen_jours   int null,
  actif               boolean not null default true,
  cree_le             timestamptz not null default now(),
  constraint fournisseur_delai_positif check (delai_moyen_jours is null or delai_moyen_jours > 0),
  constraint fournisseur_motif_si_liste_noire check (
    not liste_noire or (motif_liste_noire is not null and length(trim(motif_liste_noire)) > 0)
  )
);

create index if not exists idx_fournisseur_liste_noire on fournisseur (liste_noire);
create index if not exists idx_fournisseur_recherche on fournisseur (lower(denomination));

-- ---------------------------------------------------------------------------
-- dossier_achat : RG-007, la procédure découle des seuils en vigueur à la date.
-- ---------------------------------------------------------------------------
create table if not exists dossier_achat (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique,
  etat_besoin_id   uuid null references etat_besoin (id) on delete set null,
  objet            text not null,
  montant_estime   numeric(18, 2) not null,
  procedure        text not null,
  statut           text not null default 'ouvert',
  seuils_appliques jsonb null,
  cree_le          timestamptz not null default now(),
  clos_le          timestamptz null,
  constraint dossier_procedure_valide check (
    procedure in ('gre_a_gre', 'consultation', 'aon', 'aoi')
  ),
  constraint dossier_statut_valide check (
    statut in ('ouvert', 'en_consultation', 'attribue', 'execute', 'clos', 'annule')
  ),
  constraint dossier_montant_positif check (montant_estime > 0)
);

create index if not exists idx_dossier_statut on dossier_achat (statut);
create index if not exists idx_dossier_procedure on dossier_achat (procedure);
create index if not exists idx_dossier_besoin on dossier_achat (etat_besoin_id);
create index if not exists idx_dossier_cree_le on dossier_achat (cree_le desc);

-- ---------------------------------------------------------------------------
-- bon_commande
-- ---------------------------------------------------------------------------
create table if not exists bon_commande (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique,
  dossier_id       uuid not null references dossier_achat (id) on delete restrict,
  fournisseur_id   uuid not null references fournisseur (id) on delete restrict,
  montant          numeric(18, 2) not null,
  statut           text not null default 'emis',
  emis_le          timestamptz not null default now(),
  livre_le         timestamptz null,
  paye_le          timestamptz null,
  constraint bon_commande_statut_valide check (
    statut in ('emis', 'accepte', 'livre_partiel', 'livre', 'receptionne', 'payable', 'paye', 'annule')
  ),
  constraint bon_commande_montant_positif check (montant > 0)
);

create index if not exists idx_bon_commande_dossier on bon_commande (dossier_id);
create index if not exists idx_bon_commande_fournisseur on bon_commande (fournisseur_id);
create index if not exists idx_bon_commande_statut on bon_commande (statut);

-- ---------------------------------------------------------------------------
-- document : toute pièce émise. RG-019 : un document figé ne se modifie pas,
-- on en émet un autre, lié par parent_document_id.
-- ---------------------------------------------------------------------------
create table if not exists document (
  id                   uuid primary key default gen_random_uuid(),
  type                 text not null,
  numero               text not null unique,
  -- Clé de partitionnement : la structure que la pièce concerne (ADR-001).
  structure_id         uuid not null references structure (id) on delete restrict,
  objet_type           text not null,
  objet_id             text null,
  contenu              jsonb not null default '{}'::jsonb,
  signataire_id        uuid null references agent (id) on delete set null,
  signe_le             timestamptz null,
  fige                 boolean not null default true,
  parent_document_id   uuid null references document (id) on delete set null,
  cree_le              timestamptz not null default now(),
  constraint document_type_valide check (
    type in ('etat_besoin', 'decision_examen', 'bon_commande', 'pv_reception',
             'certificat_prise_en_charge', 'bon_livraison', 'accuse_reception',
             'acte_transfert', 'pv_perte', 'pv_reforme', 'etat_inventaire')
  ),
  constraint document_pas_son_propre_parent check (
    parent_document_id is null or parent_document_id <> id
  )
);

create index if not exists idx_document_type on document (type);
create index if not exists idx_document_structure on document (structure_id);
create index if not exists idx_document_objet on document (objet_type, objet_id);
create index if not exists idx_document_signataire on document (signataire_id);
create index if not exists idx_document_parent on document (parent_document_id);
create index if not exists idx_document_cree_le on document (cree_le desc);

-- Le lien mouvement → document, déclaré ici puisque document naît en 003.
alter table mouvement drop constraint if exists mouvement_document_fk;
alter table mouvement add constraint mouvement_document_fk
  foreign key (document_id) references document (id) on delete set null;

-- ---------------------------------------------------------------------------
-- sequence_document : les numéros métier lisibles, générés par le serveur.
-- ---------------------------------------------------------------------------
create table if not exists sequence_document (
  prefixe   text not null,
  annee     int not null,
  dernier   int not null default 0,
  primary key (prefixe, annee)
);
