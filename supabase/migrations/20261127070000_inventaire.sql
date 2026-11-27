-- 20261127070000_inventaire.sql — L'inventaire physique et le rapprochement
-- contradictoire. Lot « inventaire », contrat `docs/LOT-INVENTAIRE.md`.
--
-- FONDEMENTS. Décret n° 13/050 du 6 février 2013 :
--   art. 120 — « des inventaires et comptes d'emplois sont établis à dates
--               fixes et à l'occasion des contrôles effectués par les organes
--               habilités » ;
--   art. 122 — le détenteur atteste les biens qui lui sont affectés ;
--   art. 123 — « des rapprochements périodiques contradictoires sont effectués
--               entre les données de la comptabilité des matières et celles de
--               la comptabilité générale de l'État ».
--
-- CE QUE LA BASE TIENT ICI, ET POURQUOI ELLE LE TIENT.
--
-- 1. Le cloisonnement. Les sept tables portent `structure_id not null` **sur
--    leur propre ligne**, et entrent dans les politiques de l'ADR-001. C'est la
--    leçon de la migration 20261127040000 : un périmètre lu au bout d'une
--    jointure externe vers une table cloisonnée rend `null`, et un `null` ne se
--    distingue pas d'une absence de cloisonnement. Un contrôle qui s'efface là
--    où il devait mordre est pire qu'un contrôle absent, parce qu'on le croit
--    présent.
--
-- 2. La cohérence du périmètre, par clé étrangère composite. Chaque table fille
--    référence sa mère par `(structure_id, id)` et non par `id` seul : un
--    constat ne peut donc pas porter un `structure_id` différent de celui de sa
--    campagne, même si une route se trompait. C'est la contrainte 1 de
--    l'ADR-001 — aucune référence technique ne traverse la frontière d'une
--    structure — appliquée au lot. Elle exige, sur les tables mères, un
--    `unique (structure_id, id)` : c'est à cela que servent les contraintes
--    `*_id_par_structure` ci-dessous, comme `site_id_par_structure` et
--    `agent_id_par_structure` de la migration 000100.
--
-- 3. Les états. Les enchaînements de statuts sont contrôlés par `check`, pas
--    seulement par les routes : une campagne `en_cours` porte sa date
--    d'ouverture, un écart `tranche` porte sa décision et son explication
--    (RG-025, tenue aussi ici), un rapprochement `clos` porte sa conclusion.
--
-- CE QUE LA BASE NE TIENT PAS, et qui reste aux règles de gestion du serveur :
--   RG-023, RG-024 (la clôture d'une campagne : elles portent sur un décompte
--   de lignes), RG-026 (qui constate ne tranche pas : les deux colonnes sont
--   sur deux tables), RG-027 (le contradictoire : il porte sur deux lignes de
--   `rapprochement_partie`). Un `check` ne voit qu'une ligne ; ces quatre
--   règles en voient plusieurs, et elles vivent donc dans `server/src/regles/`.

-- ---------------------------------------------------------------------------
-- campagne_inventaire — un périmètre, une date arrêtée, des agents, un état.
-- ---------------------------------------------------------------------------
create table if not exists campagne_inventaire (
  id            uuid primary key default gen_random_uuid(),
  numero        text not null unique,
  libelle       text not null,
  structure_id  uuid not null references structure (id) on delete restrict,
  site_id       uuid null,
  -- art. 120 : la date à laquelle l'inventaire est arrêté. Elle fixe le
  -- périmètre : un bien acquis après elle n'est pas de cette campagne.
  date_arretee  date not null,
  statut        text not null default 'preparee',
  ouverte_le    timestamptz null,
  ouverte_par   uuid null references agent (id) on delete set null,
  close_le      timestamptz null,
  close_par     uuid null references agent (id) on delete set null,
  cree_par      uuid not null references agent (id) on delete restrict,
  cree_le       timestamptz not null default now(),
  maj_le        timestamptz null,

  constraint campagne_statut_valide check (statut in ('preparee', 'en_cours', 'close')),
  -- Un état ne s'affirme pas sans la date qui le prouve.
  constraint campagne_ouverture_coherente check (
    statut = 'preparee' or ouverte_le is not null
  ),
  constraint campagne_cloture_coherente check (
    (statut = 'close') = (close_le is not null)
  ),
  -- ADR-001, contrainte 1 : le site est nécessairement un site de la structure.
  constraint campagne_site_meme_structure
    foreign key (structure_id, site_id) references site (structure_id, id)
    on delete set null (site_id),
  -- Permet aux tables filles leur clé étrangère composite.
  constraint campagne_id_par_structure unique (structure_id, id)
);

create index if not exists idx_campagne_structure on campagne_inventaire (structure_id);
create index if not exists idx_campagne_statut on campagne_inventaire (statut);
create index if not exists idx_campagne_site on campagne_inventaire (site_id);
create index if not exists idx_campagne_date_arretee on campagne_inventaire (date_arretee desc);

comment on table campagne_inventaire is
  'Décret 13/050 art. 120 — une campagne d''inventaire physique : un périmètre, une date arrêtée, des agents désignés, un avancement.';

-- ---------------------------------------------------------------------------
-- campagne_agent — les agents désignés, et à quel titre.
--
-- `qualite` n'est pas un rôle du contrat §4 : c'est une désignation propre à la
-- campagne. Un agent peut être désigné `detenteur` sans porter aucun rôle
-- métier particulier — c'est lui que l'art. 122 fait attester.
-- ---------------------------------------------------------------------------
create table if not exists campagne_agent (
  id            uuid primary key default gen_random_uuid(),
  campagne_id   uuid not null,
  agent_id      uuid not null references agent (id) on delete restrict,
  structure_id  uuid not null references structure (id) on delete restrict,
  qualite       text not null,
  designe_le    timestamptz not null default now(),
  designe_par   uuid null references agent (id) on delete set null,

  constraint campagne_agent_qualite_valide check (
    qualite in ('operateur', 'detenteur', 'temoin')
  ),
  constraint campagne_agent_unique unique (campagne_id, agent_id, qualite),
  constraint campagne_agent_meme_structure
    foreign key (structure_id, campagne_id) references campagne_inventaire (structure_id, id)
    on delete cascade
);

create index if not exists idx_campagne_agent_campagne on campagne_agent (campagne_id);
create index if not exists idx_campagne_agent_agent on campagne_agent (agent_id);
create index if not exists idx_campagne_agent_structure on campagne_agent (structure_id);

comment on table campagne_agent is
  'Décret 13/050 art. 122 — les agents désignés d''une campagne : opérateur, détenteur, témoin.';

-- ---------------------------------------------------------------------------
-- constat_inventaire — un par bien constaté. Trois résultats possibles.
--
-- Le constat ne modifie **jamais** la fiche du bien : il dit ce qui a été vu.
-- C'est la décision humaine, prise sur l'écart, qui régularise.
-- ---------------------------------------------------------------------------
create table if not exists constat_inventaire (
  id                     uuid primary key default gen_random_uuid(),
  campagne_id            uuid not null,
  bien_id                uuid not null references bien (id) on delete cascade,
  structure_id           uuid not null references structure (id) on delete restrict,
  resultat               text not null,
  quantite_comptee       int null,
  etat_constate          text null,
  detenteur_constate_id  uuid null,
  site_constate_id       uuid null,
  observation            text null,
  constate_par           uuid not null references agent (id) on delete restrict,
  constate_le            timestamptz not null default now(),

  constraint constat_resultat_valide check (resultat in ('conforme', 'ecart', 'introuvable')),
  constraint constat_quantite_non_negative check (quantite_comptee is null or quantite_comptee >= 0),
  -- Les mêmes états que la fiche du bien : on constate dans le vocabulaire du
  -- registre, pas dans un autre.
  constraint constat_etat_valide check (
    etat_constate is null or etat_constate in (
      'neuf', 'bon', 'a_reparer', 'hors_service', 'en_maintenance', 'reforme', 'perdu'
    )
  ),
  -- Un bien introuvable n'a ni quantité comptée ni état constaté : on ne
  -- décrit pas ce qu'on n'a pas vu.
  constraint constat_introuvable_sans_mesure check (
    resultat <> 'introuvable' or (quantite_comptee is null and etat_constate is null)
  ),
  constraint constat_bien_unique_par_campagne unique (campagne_id, bien_id),
  constraint constat_meme_structure
    foreign key (structure_id, campagne_id) references campagne_inventaire (structure_id, id)
    on delete cascade,
  -- ADR-001, contrainte 1 : le détenteur et le site constatés sont
  -- nécessairement de la structure de la campagne.
  constraint constat_detenteur_meme_structure
    foreign key (structure_id, detenteur_constate_id) references agent (structure_id, id)
    on delete set null (detenteur_constate_id),
  constraint constat_site_meme_structure
    foreign key (structure_id, site_constate_id) references site (structure_id, id)
    on delete set null (site_constate_id),
  constraint constat_id_par_structure unique (structure_id, id)
);

create index if not exists idx_constat_campagne on constat_inventaire (campagne_id);
create index if not exists idx_constat_bien on constat_inventaire (bien_id);
create index if not exists idx_constat_structure on constat_inventaire (structure_id);
create index if not exists idx_constat_resultat on constat_inventaire (resultat);
create index if not exists idx_constat_agent on constat_inventaire (constate_par);

comment on table constat_inventaire is
  'Le constat d''un bien dans une campagne : conforme, écart ou introuvable. Ne modifie jamais la fiche du bien.';

-- ---------------------------------------------------------------------------
-- ecart_inventaire — le circuit de l'anomalie : constat, explication, décision.
--
-- `decision` n'est renseignée qu'au moment où un humain tranche. **Aucune
-- décision automatique**, nulle part : le SIGL instruit, il ne prononce pas
-- (RG-016).
-- ---------------------------------------------------------------------------
create table if not exists ecart_inventaire (
  id              uuid primary key default gen_random_uuid(),
  constat_id      uuid not null unique,
  campagne_id     uuid not null,
  bien_id         uuid not null references bien (id) on delete cascade,
  structure_id    uuid not null references structure (id) on delete restrict,
  nature          text not null,
  ecart_quantite  int null,
  statut          text not null default 'constate',
  explication     text null,
  explique_par    uuid null references agent (id) on delete set null,
  explique_le     timestamptz null,
  decision        text null,
  motif_decision  text null,
  tranche_par     uuid null references agent (id) on delete set null,
  tranche_le      timestamptz null,
  document_id     uuid null references document (id) on delete set null,
  mouvement_id    uuid null references mouvement (id) on delete set null,
  cree_le         timestamptz not null default now(),

  constraint ecart_nature_valide check (
    nature in ('quantite', 'etat', 'detenteur', 'localisation', 'introuvable')
  ),
  constraint ecart_statut_valide check (statut in ('constate', 'explique', 'tranche')),
  constraint ecart_decision_valide check (
    decision is null or decision in ('regularisation', 'perte', 'maintien')
  ),
  -- Un écart `explique` porte son explication, et elle n'est pas vide.
  constraint ecart_explication_coherente check (
    statut = 'constate' or (explication is not null and btrim(explication) <> '')
  ),
  -- RG-025, tenue aussi par la base : on ne tranche qu'après l'explication du
  -- détenteur, et la décision tranchée porte son motif et son auteur.
  constraint ecart_tranche_coherent check (
    statut <> 'tranche' or (
      decision is not null
      and motif_decision is not null and btrim(motif_decision) <> ''
      and tranche_par is not null and tranche_le is not null
      and explication is not null
    )
  ),
  -- À l'inverse : pas de décision sans le statut qui l'annonce.
  constraint ecart_decision_apres_statut check (statut = 'tranche' or decision is null),
  constraint ecart_meme_structure
    foreign key (structure_id, constat_id) references constat_inventaire (structure_id, id)
    on delete cascade,
  constraint ecart_campagne_meme_structure
    foreign key (structure_id, campagne_id) references campagne_inventaire (structure_id, id)
    on delete cascade
);

create index if not exists idx_ecart_campagne on ecart_inventaire (campagne_id);
create index if not exists idx_ecart_constat on ecart_inventaire (constat_id);
create index if not exists idx_ecart_bien on ecart_inventaire (bien_id);
create index if not exists idx_ecart_structure on ecart_inventaire (structure_id);
create index if not exists idx_ecart_statut on ecart_inventaire (statut);
create index if not exists idx_ecart_nature on ecart_inventaire (nature);

comment on table ecart_inventaire is
  'Le circuit d''un écart d''inventaire : constaté, expliqué par le détenteur (art. 122), tranché par un humain. Aucune décision automatique.';

-- ---------------------------------------------------------------------------
-- rapprochement — art. 123, le rapprochement périodique contradictoire.
-- ---------------------------------------------------------------------------
create table if not exists rapprochement (
  id             uuid primary key default gen_random_uuid(),
  numero         text not null unique,
  structure_id   uuid not null references structure (id) on delete restrict,
  periode_debut  date not null,
  periode_fin    date not null,
  statut         text not null default 'ouvert',
  conclusion     text null,
  clos_le        timestamptz null,
  clos_par       uuid null references agent (id) on delete set null,
  cree_par       uuid not null references agent (id) on delete restrict,
  cree_le        timestamptz not null default now(),

  constraint rapprochement_statut_valide check (statut in ('ouvert', 'constate', 'clos')),
  constraint rapprochement_periode_ordonnee check (periode_fin >= periode_debut),
  constraint rapprochement_cloture_coherente check (
    (statut = 'clos') = (clos_le is not null)
  ),
  constraint rapprochement_conclusion_si_clos check (
    statut <> 'clos' or (conclusion is not null and btrim(conclusion) <> '')
  ),
  constraint rapprochement_id_par_structure unique (structure_id, id)
);

create index if not exists idx_rapprochement_structure on rapprochement (structure_id);
create index if not exists idx_rapprochement_statut on rapprochement (statut);
create index if not exists idx_rapprochement_periode on rapprochement (periode_fin desc);

comment on table rapprochement is
  'Décret 13/050 art. 123 — le rapprochement périodique contradictoire entre la comptabilité des matières et la comptabilité générale.';

-- ---------------------------------------------------------------------------
-- rapprochement_poste — la liste des écarts, poste par poste.
--
-- `valeur_matieres` est **calculée par le système** depuis `bien` ;
-- `valeur_generale` est **saisie**, parce que la comptabilité générale de la
-- Primature n'est pas interfacée et que personne ne sait encore comment elle
-- est tenue (CONCEPTION.md §9, ⟨H⟩).
-- ---------------------------------------------------------------------------
create table if not exists rapprochement_poste (
  id                 uuid primary key default gen_random_uuid(),
  rapprochement_id   uuid not null,
  structure_id       uuid not null references structure (id) on delete restrict,
  categorie_code     text not null references categorie (code) on delete restrict,
  valeur_matieres    numeric(18, 2) not null,
  valeur_generale    numeric(18, 2) null,
  explication        text null,

  constraint poste_valeur_matieres_non_negative check (valeur_matieres >= 0),
  constraint poste_valeur_generale_non_negative check (
    valeur_generale is null or valeur_generale >= 0
  ),
  constraint poste_unique_par_rapprochement unique (rapprochement_id, categorie_code),
  constraint poste_meme_structure
    foreign key (structure_id, rapprochement_id) references rapprochement (structure_id, id)
    on delete cascade
);

create index if not exists idx_poste_rapprochement on rapprochement_poste (rapprochement_id);
create index if not exists idx_poste_structure on rapprochement_poste (structure_id);
create index if not exists idx_poste_categorie on rapprochement_poste (categorie_code);

comment on table rapprochement_poste is
  'Un poste du rapprochement : la valeur en comptabilité des matières, calculée, face à la valeur en comptabilité générale, saisie.';

-- ---------------------------------------------------------------------------
-- rapprochement_partie — le contradictoire, et sa preuve.
--
-- Deux qualités, et deux seulement : le comptable des matières et le comptable
-- général. « Contradictoire » veut dire que les deux signent, chacun pouvant
-- porter sa réserve. RG-027 l'exige pour la clôture.
-- ---------------------------------------------------------------------------
create table if not exists rapprochement_partie (
  id                uuid primary key default gen_random_uuid(),
  rapprochement_id  uuid not null,
  structure_id      uuid not null references structure (id) on delete restrict,
  agent_id          uuid not null references agent (id) on delete restrict,
  qualite           text not null,
  atteste_le        timestamptz null,
  reserve           text null,

  constraint partie_qualite_valide check (
    qualite in ('comptable_matieres', 'comptable_general')
  ),
  constraint partie_unique_par_qualite unique (rapprochement_id, qualite),
  constraint partie_meme_structure
    foreign key (structure_id, rapprochement_id) references rapprochement (structure_id, id)
    on delete cascade
);

create index if not exists idx_partie_rapprochement on rapprochement_partie (rapprochement_id);
create index if not exists idx_partie_structure on rapprochement_partie (structure_id);
create index if not exists idx_partie_agent on rapprochement_partie (agent_id);

comment on table rapprochement_partie is
  'Décret 13/050 art. 123 — une partie au rapprochement contradictoire, son attestation et sa réserve éventuelle.';

-- ---------------------------------------------------------------------------
-- L'identité d'un agent d'une autre structure, pour le contradictoire.
--
-- POURQUOI IL FAUT CELA. Le comptable général n'est **pas** un agent de la
-- structure inventoriée : il est mis à disposition par le ministère du Budget
-- ou des Finances, et la comptabilité générale qu'il tient est celle de l'État
-- (décret 13/050 art. 123). Un rapprochement de la CGIG a donc pour seconde
-- partie un agent du Secrétariat général — que la CGIG, cloisonnée, ne lit pas.
--
-- Sans cette fonction, la jointure vers `agent` ne rendait rien, et la ligne de
-- la partie **disparaissait** de l'écran : c'est le même piège que celui de la
-- migration 20261127040000, pris par l'autre bout — là un `null` valait
-- autorisation, ici une jointure interne valait effacement. Le contradictoire
-- serait devenu invisible, donc RG-027 incompréhensible à l'écran.
--
-- CE QU'ELLE REND, ET RIEN DE PLUS. Le nom, la fonction et l'activité — de
-- l'organigramme, que `GET /api/profils` sert déjà sans aucune garde pour
-- l'écran de choix de profil. Jamais le courriel, jamais la structure, jamais
-- une donnée du patrimoine. Même précédent et même prudence que
-- `sigl_structure_rattachement` de la migration 20261127050000.
-- ---------------------------------------------------------------------------
create or replace function sigl_identite_agent(cible uuid)
returns table (id uuid, nom text, fonction text, actif boolean)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.nom, a.fonction, a.actif from agent a where a.id = cible
$$;

revoke all on function sigl_identite_agent(uuid) from public;
grant execute on function sigl_identite_agent(uuid) to sigl_agent, sigl_consolidation;

comment on function sigl_identite_agent(uuid) is
  'Rend le nom, la fonction et l''activité d''un agent, et rien d''autre, pour nommer une partie au rapprochement contradictoire qui n''est pas de la structure (décret 13/050 art. 123).';

-- ---------------------------------------------------------------------------
-- Les droits des deux rôles de l'ADR-001.
--
-- `alter default privileges` de la migration 000500 les accorde déjà aux
-- tables créées ensuite par `postgres`. On les redonne explicitement : une
-- migration doit se suffire à elle-même, et un privilège par défaut qui
-- changerait ne doit pas rendre ce lot inopérant en silence.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'campagne_inventaire', 'campagne_agent', 'constat_inventaire', 'ecart_inventaire',
    'rapprochement', 'rapprochement_poste', 'rapprochement_partie'
  ] loop
    execute format('grant select, insert, update, delete on %I to sigl_agent', t);
    execute format('grant select on %I to sigl_consolidation', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Le cloisonnement, ADR-001. Exactement la forme de la migration 000500.
--
-- Lecture : `sigl_lecture_permise(structure_id)` — la portée transversale du
-- comptable public y est comprise, puisqu'elle vit dans cette fonction.
--
-- Écriture : `sigl_ecriture_permise(structure_id)`, et **non**
-- `sigl_ecriture_chaine_achat`. La raison est de fond : le prédicat de la
-- chaîne d'achat existe pour que le comptable **public** puisse marquer un bon
-- payable dans tout le périmètre intégré, parce que la chaîne de la dépense est
-- celle de la Primature. L'inventaire n'est pas de la dépense : c'est la
-- comptabilité des matières, que l'art. 120 confie au comptable des matières de
-- la structure. Le comptable public la contrôle, il ne la tient pas. Il n'a
-- donc rien à écrire ici, et le prédicat ordinaire suffit.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'campagne_inventaire', 'campagne_agent', 'constat_inventaire', 'ecart_inventaire',
    'rapprochement', 'rapprochement_poste', 'rapprochement_partie'
  ] loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists %I on %I', t || '_lecture', t);
    execute format(
      'create policy %I on %I for select using (sigl_lecture_permise(structure_id))',
      t || '_lecture', t);

    execute format('drop policy if exists %I on %I', t || '_insertion', t);
    execute format(
      'create policy %I on %I for insert with check (sigl_ecriture_permise(structure_id))',
      t || '_insertion', t);

    -- Le droit sur la ligne avant **et** après : on ne déplace pas un constat
    -- hors de son cloisonnement.
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
-- Le temps réel.
--
-- Deux mécanismes, comme pour les tables du socle : la publication
-- `supabase_realtime` pour les clients qui parlent à Supabase, et le
-- déclencheur `sigl_notifier_flux` pour le flux SSE du serveur.
--
-- L'`objet` est **au singulier** — `inventaire` et `rapprochement` — parce que
-- c'est la convention du serveur et que l'interface écoute ces noms-là. La
-- campagne, le constat et l'écart se présentent sous le même objet
-- `inventaire` : un écran d'inventaire se recharge, il ne distingue pas la
-- table qui a bougé.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : temps réel non configuré.';
  else
    foreach t in array array[
      'campagne_inventaire', 'campagne_agent', 'constat_inventaire', 'ecart_inventaire',
      'rapprochement', 'rapprochement_poste', 'rapprochement_partie'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;

-- L'ancienne valeur doit partir avec l'événement sur les tables qui changent
-- d'état : un écran doit pouvoir montrer « passé de constaté à expliqué ».
alter table campagne_inventaire   replica identity full;
alter table constat_inventaire    replica identity full;
alter table ecart_inventaire      replica identity full;
alter table rapprochement         replica identity full;
alter table rapprochement_poste   replica identity full;
alter table rapprochement_partie  replica identity full;

do $$
declare
  cible record;
begin
  for cible in
    select * from (values
      ('campagne_inventaire',   'inventaire'),
      ('campagne_agent',        'inventaire'),
      ('constat_inventaire',    'inventaire'),
      ('ecart_inventaire',      'inventaire'),
      ('rapprochement',         'rapprochement'),
      ('rapprochement_poste',   'rapprochement'),
      ('rapprochement_partie',  'rapprochement')
    ) as t(nom_table, nom_objet)
  loop
    execute format(
      'drop trigger if exists sigl_flux_%1$s on public.%1$I',
      cible.nom_table
    );
    execute format(
      'create trigger sigl_flux_%1$s
         after insert or update or delete on public.%1$I
         for each row execute function sigl_notifier_flux(%2$L)',
      cible.nom_table, cible.nom_objet
    );
  end loop;
end
$$;
