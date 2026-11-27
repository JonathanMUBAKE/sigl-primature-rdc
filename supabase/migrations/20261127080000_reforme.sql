-- 20261127080000_reforme.sql — Le circuit de réforme, et l'offre de réemploi.
-- Lot « réforme », contrat `docs/LOT-REFORME.md` et section « Le circuit de
-- réforme, et l'offre de réemploi » de `docs/CONTRAT-TECHNIQUE.md`, gelée.
--
-- FONDEMENTS. Décret n° 13/050 du 6 février 2013 : « la cession et la mise au
-- rebut des biens d'actif relèvent de la compétence de l'administration en
-- charge des domaines privés et publics de l'État ». Le SIGL instruit, produit
-- le procès-verbal, saisit les domaines et suit la décision. **Il ne la prend
-- pas** — c'est RG-016, et ce lot ne l'assouplit en rien. C'est pourquoi
-- `dossier_reforme` porte `decision_autorite`, `decision_reference` et
-- `decision_date` : trois colonnes qui n'auraient aucun sens si la décision
-- était prise ici, et qui ne servent qu'à **enregistrer** un acte pris ailleurs.
--
-- POURQUOI CE LOT EXISTE. Avant lui, la réforme tenait en un seul geste : un
-- mouvement de type `reforme` sur la fiche du bien. C'était juste et c'était
-- insuffisant : un bien sortait du service sur la lassitude d'une seule
-- structure, sans qu'aucune pièce ne prouve qu'il était inutilisable **pour
-- toute la Primature**. Les sept étapes du lot intercalent une proposition, un
-- avis de commission, une offre de réemploi aux autres structures, et la
-- saisine. RG-033 ferme l'ancien raccourci.
--
-- CE QUE LA BASE TIENT ICI, ET POURQUOI.
--
-- 1. Le cloisonnement. Les cinq tables portent `structure_id not null` **sur
--    leur propre ligne**, et entrent dans les politiques de l'ADR-001. C'est la
--    leçon de la migration 20261127040000 : un périmètre lu au bout d'une
--    jointure externe vers une table cloisonnée rend `null`, et un `null` ne se
--    distingue pas d'une absence de cloisonnement.
--
-- 2. La cohérence du périmètre, par clé étrangère composite : chaque fille
--    référence sa mère par `(structure_id, id)`, ce qui exige sur les mères un
--    `unique (structure_id, id)` — les contraintes `*_id_par_structure`
--    ci-dessous, comme `site_id_par_structure` de la migration 000100.
--
--    **Une exception, et elle est voulue** : `dossier_reforme.bien_id` est une
--    clé étrangère **simple** vers `bien (id)`, et non composite vers
--    `bien (structure_id, id)`. La raison est l'objet même du lot : le réemploi
--    **fait changer le bien de structure**. Une clé composite aurait rendu la
--    cinquième étape du circuit impossible — le dossier reste à la structure
--    d'origine, qui l'a instruit, tandis que le bien passe à celle qui le
--    reprend. Le cloisonnement du dossier n'en souffre pas : il tient à son
--    propre `structure_id`, pas à celui du bien.
--
-- 3. Les états. Les enchaînements de statuts sont contrôlés par `check`, pas
--    seulement par les routes, et chaque état porte la date qui le prouve —
--    même forme que `campagne_inventaire` de la migration 070000.
--
-- CE QUE LA BASE NE TIENT PAS, et qui reste aux règles du serveur : RG-028
-- (pas de saisine sans offre close), RG-029 (pas de réforme sous offre
-- ouverte), RG-030 (qui propose ne siège pas), RG-031 (un avis exige un motif
-- — tenue ici aussi par un `check`, parce qu'elle ne voit qu'une ligne),
-- RG-032 (la décision s'enregistre) et RG-033 (l'état `reforme` ne s'atteint
-- que par le circuit). Un `check` ne voit qu'une ligne ; ces règles en voient
-- plusieurs, et elles vivent donc dans `server/src/regles/`.

-- ---------------------------------------------------------------------------
-- dossier_reforme — le circuit, de la proposition à la décision enregistrée.
--
-- Sept statuts, et chacun dit où en est le dossier :
--   `propose`   le détenteur ou le comptable des matières a proposé ;
--   `examine`   la commission a rendu un avis favorable ;
--   `rejete`    la commission a rendu un avis défavorable — le bien reste en
--               service, et c'est une issue aussi légitime que les autres ;
--   `offert`    le bien est offert aux autres structures ;
--   `reemploye` une autre structure l'a repris : le dossier **se clôt sans
--               réforme**, et c'est le gisement d'économies du lot ;
--   `saisi`     faute de preneur, les domaines sont saisis, le PV est figé ;
--   `clos`      leur décision est enregistrée.
-- ---------------------------------------------------------------------------
create table if not exists dossier_reforme (
  id                  uuid primary key default gen_random_uuid(),
  numero              text not null unique,
  -- Clé étrangère simple, et non composite : voir le point 2 de l'en-tête.
  bien_id             uuid not null references bien (id) on delete restrict,
  -- La structure qui instruit, c'est-à-dire celle qui détenait le bien à la
  -- proposition. Elle ne change pas, même si le bien change de main.
  structure_id        uuid not null references structure (id) on delete restrict,
  propose_par         uuid not null references agent (id) on delete restrict,
  motif_proposition   text not null,
  statut              text not null default 'propose',
  avis_rendu_le       timestamptz null,
  offert_le           timestamptz null,
  reemploye_le        timestamptz null,
  saisi_le            timestamptz null,
  -- Le procès-verbal de réforme, figé à la saisine (RG-019).
  --
  -- `on delete restrict`, et non `set null` : un dossier saisi **doit** porter
  -- son procès-verbal, c'est la contrainte `dossier_reforme_pv_a_la_saisine`
  -- plus bas. Les deux réunies disent la même chose dans les deux sens — la
  -- pièce qui prouve la saisine ne s'efface pas, et la base refuse de la
  -- supprimer au lieu d'accepter un dossier saisi sans preuve. Un `set null`
  -- aurait été un ordre impossible à exécuter : la base l'aurait tenté, puis
  -- aurait buté sur son propre `check`, et l'erreur serait apparue loin de sa
  -- cause.
  pv_document_id      uuid null references document (id) on delete restrict,
  -- Les trois colonnes de l'étape 7. Elles **enregistrent** un acte pris par
  -- l'administration des domaines ; aucune route du SIGL ne le prononce.
  decision_autorite   text null,
  decision_reference  text null,
  decision_date       date null,
  decision_suite      text null,
  close_le            timestamptz null,
  cree_le             timestamptz not null default now(),
  maj_le              timestamptz null,

  constraint dossier_reforme_statut_valide check (
    statut in ('propose', 'examine', 'rejete', 'offert', 'reemploye', 'saisi', 'clos')
  ),
  constraint dossier_reforme_motif_non_vide check (btrim(motif_proposition) <> ''),
  constraint dossier_reforme_suite_valide check (
    decision_suite is null or decision_suite in ('cession', 'rebut', 'refus')
  ),

  -- Un état ne s'affirme pas sans la date qui le prouve. Même forme que
  -- `campagne_ouverture_coherente` de la migration 070000.
  constraint dossier_reforme_avis_coherent check (
    statut = 'propose' or avis_rendu_le is not null
  ),
  -- Tout ce qui vient après l'offre suppose qu'une offre a eu lieu : le
  -- réemploi en découle, et la saisine n'est permise qu'après elle (RG-028).
  constraint dossier_reforme_offre_coherente check (
    statut in ('propose', 'examine', 'rejete') or offert_le is not null
  ),
  constraint dossier_reforme_reemploi_coherent check (
    (statut = 'reemploye') = (reemploye_le is not null)
  ),
  -- Le PV part avec la saisine, et il ne part qu'avec elle.
  constraint dossier_reforme_saisine_coherente check (
    (statut in ('saisi', 'clos')) = (saisi_le is not null)
  ),
  constraint dossier_reforme_pv_a_la_saisine check (
    statut not in ('saisi', 'clos') or pv_document_id is not null
  ),
  -- RG-032, tenue aussi par la base : un dossier clos porte l'autorité, la
  -- référence, la date et la suite de la décision. Une décision sans autorité
  -- serait une décision prise par le SIGL, ce que RG-016 interdit.
  constraint dossier_reforme_cloture_coherente check (
    (statut = 'clos') = (close_le is not null)
  ),
  constraint dossier_reforme_decision_si_clos check (
    statut <> 'clos' or (
      decision_autorite is not null and btrim(decision_autorite) <> ''
      and decision_reference is not null and btrim(decision_reference) <> ''
      and decision_date is not null
      and decision_suite is not null
    )
  ),
  -- Et l'inverse : pas de décision enregistrée sans le statut qui l'annonce.
  constraint dossier_reforme_decision_apres_statut check (
    statut = 'clos' or (
      decision_autorite is null and decision_reference is null
      and decision_date is null and decision_suite is null
    )
  ),

  -- Permet aux tables filles leur clé étrangère composite.
  constraint dossier_reforme_id_par_structure unique (structure_id, id)
);

create index if not exists idx_dossier_reforme_structure on dossier_reforme (structure_id);
create index if not exists idx_dossier_reforme_bien on dossier_reforme (bien_id);
create index if not exists idx_dossier_reforme_statut on dossier_reforme (statut);
create index if not exists idx_dossier_reforme_propose_par on dossier_reforme (propose_par);
create index if not exists idx_dossier_reforme_cree_le on dossier_reforme (cree_le desc);

-- Un seul dossier **non clos** par bien : deux circuits ouverts sur le même
-- bien aboutiraient à deux PV contradictoires, et l'un des deux offrirait un
-- bien que l'autre vient de réformer. Les trois issues terminales — `rejete`,
-- `reemploye`, `clos` — libèrent le bien : un bien rendu au service peut être
-- proposé de nouveau plus tard, et c'est sain.
create unique index if not exists idx_dossier_reforme_un_seul_ouvert_par_bien
  on dossier_reforme (bien_id)
  where statut not in ('rejete', 'reemploye', 'clos');

comment on table dossier_reforme is
  'Décret 13/050 — le circuit de réforme d''un bien : proposition, avis de commission, offre de réemploi, saisine des domaines, décision enregistrée. Le SIGL instruit et ne prononce pas (RG-016).';

-- ---------------------------------------------------------------------------
-- membre_commission — qui siège, et à quel titre.
--
-- `qualite` n'est pas un rôle du contrat §4 : c'est une désignation propre au
-- dossier, comme `campagne_agent.qualite` pour l'inventaire. Un membre peut
-- être un agent d'une autre structure — l'intendant général ou la logistique
-- centrale siègent couramment à une commission de réforme —, et c'est pourquoi
-- `agent_id` n'est **pas** une clé étrangère composite : l'exiger de la
-- structure du dossier aurait, dans les petites cellules, rendu le quorum
-- inatteignable et la séparation des fonctions (RG-030) impossible à tenir.
-- ---------------------------------------------------------------------------
create table if not exists membre_commission (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid not null,
  structure_id  uuid not null references structure (id) on delete restrict,
  agent_id      uuid not null references agent (id) on delete restrict,
  qualite       text not null,
  designe_le    timestamptz not null default now(),

  constraint membre_commission_qualite_valide check (
    qualite in ('president', 'rapporteur', 'membre', 'secretaire')
  ),
  -- Un agent ne siège qu'une fois au même dossier, quelle que soit sa qualité :
  -- un membre qui siègerait deux fois pèserait deux fois à la majorité.
  constraint membre_commission_unique unique (dossier_id, agent_id),
  constraint membre_commission_meme_structure
    foreign key (structure_id, dossier_id) references dossier_reforme (structure_id, id)
    on delete cascade
);

create index if not exists idx_membre_commission_dossier on membre_commission (dossier_id);
create index if not exists idx_membre_commission_agent on membre_commission (agent_id);
create index if not exists idx_membre_commission_structure on membre_commission (structure_id);

comment on table membre_commission is
  'Les membres désignés de la commission qui examine un dossier de réforme. Le proposant n''y siège pas (RG-030).';

-- ---------------------------------------------------------------------------
-- avis_commission — un avis motivé par membre, et un seul.
--
-- RG-031 est tenue ici aussi par un `check` : un avis exige un motif,
-- favorable comme défavorable. La règle ne voit qu'une ligne, donc la base
-- peut la tenir — et un avis non motivé n'est pas un avis, c'est un vote.
-- ---------------------------------------------------------------------------
create table if not exists avis_commission (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid not null,
  structure_id  uuid not null references structure (id) on delete restrict,
  agent_id      uuid not null references agent (id) on delete restrict,
  avis          text not null,
  motif         text not null,
  rendu_le      timestamptz not null default now(),

  constraint avis_commission_valeur_valide check (avis in ('favorable', 'defavorable')),
  -- RG-031.
  constraint avis_commission_motif_non_vide check (btrim(motif) <> ''),
  -- Un avis par membre : on ne se prononce pas deux fois, et on ne revient pas
  -- sur un avis rendu — la trace d'une délibération ne se réécrit pas (RG-019,
  -- même esprit).
  constraint avis_commission_unique unique (dossier_id, agent_id),
  constraint avis_commission_meme_structure
    foreign key (structure_id, dossier_id) references dossier_reforme (structure_id, id)
    on delete cascade
);

create index if not exists idx_avis_commission_dossier on avis_commission (dossier_id);
create index if not exists idx_avis_commission_agent on avis_commission (agent_id);
create index if not exists idx_avis_commission_structure on avis_commission (structure_id);

comment on table avis_commission is
  'L''avis motivé d''un membre de la commission de réforme, favorable ou défavorable (RG-031). Un avis par membre.';

-- ---------------------------------------------------------------------------
-- offre_reemploi — UNE PUBLICATION, et c'est ce qui commande toute sa forme.
--
-- POURQUOI ELLE EST LA SEULE TABLE DU SIGL LISIBLE HORS PÉRIMÈTRE.
--
-- L'objet économique de l'étape 3 est que *les autres* structures voient le
-- bien offert : une offre invisible aux autres structures est une étape qui
-- n'existe pas. Si `offre_reemploi` entrait dans le cloisonnement ordinaire,
-- une offre de la CGIG ne serait lisible que de la CGIG et de ses filles — et
-- le seul gisement d'économies immédiat du projet (du matériel encore
-- utilisable réformé d'un côté et racheté de l'autre) resterait fermé. Sa
-- politique de lecture est donc `sigl_consolide() or
-- sigl_structure_courante() is not null` : lisible de **toute session
-- positionnée**, quelle que soit sa structure, et de personne d'autre. Une
-- session sans contexte ne lit rien — la base échoue fermée, comme partout
-- ailleurs.
--
-- L'écriture, elle, reste cloisonnée : `sigl_ecriture_permise(structure_id)`.
-- Publier n'est pas abandonner. Seule la structure d'origine — ou le niveau
-- central dans le périmètre intégré — ouvre et clôt son offre.
--
-- POURQUOI ELLE PORTE SA PROPRE COPIE DU BIEN.
--
-- Parce qu'une jointure vers `bien`, qui est cloisonné, rendrait `null` hors
-- périmètre : l'offre serait lisible de tous et **vide de son contenu** pour
-- tous. Une fonction vidée par une politique de sécurité correcte est le piège
-- déjà pris deux fois sur ce chantier — la migration 040000, où un périmètre lu
-- au bout d'une jointure externe valait autorisation, et la ligne du comptable
-- général de la migration 070000, où une jointure interne valait effacement.
-- C'est le même bout, pris une troisième fois : ici, un `null` vaudrait
-- disparition de la marchandise. La copie est résolue à la publication, et cela
-- fige accessoirement ce qui a été offert — ce qui a été publié reste ce qui a
-- été publié, même si la fiche du bien bouge ensuite.
-- ---------------------------------------------------------------------------
create table if not exists offre_reemploi (
  id                      uuid primary key default gen_random_uuid(),
  numero                  text not null unique,
  dossier_id              uuid not null,
  -- La structure d'origine, celle qui offre. Clé de cloisonnement en écriture.
  structure_id            uuid not null references structure (id) on delete restrict,
  site_origine_id         uuid null,

  -- --- La copie publiée, résolue à l'ouverture de l'offre ------------------
  bien_immatriculation    text null,
  bien_designation        text not null,
  bien_categorie_code     text not null references categorie (code) on delete restrict,
  bien_etat               text not null,
  structure_origine_code  text not null,
  structure_origine_nom   text not null,
  site_origine_nom        text null,

  ouverte_le              timestamptz not null default now(),
  close_le                timestamptz null,
  -- La date de clôture annoncée. Elle vient du paramètre horodaté
  -- `reemploi.duree_offre_jours`, jamais d'une constante.
  cloture_prevue_le       timestamptz not null,
  duree_jours             int not null,
  statut                  text not null default 'ouverte',
  ouverte_par             uuid not null references agent (id) on delete restrict,
  close_par               uuid null references agent (id) on delete set null,

  constraint offre_reemploi_statut_valide check (statut in ('ouverte', 'close')),
  constraint offre_reemploi_duree_positive check (duree_jours > 0),
  constraint offre_reemploi_designation_non_vide check (btrim(bien_designation) <> ''),
  constraint offre_reemploi_etat_valide check (
    bien_etat in ('neuf', 'bon', 'a_reparer', 'hors_service', 'en_maintenance', 'reforme', 'perdu')
  ),
  constraint offre_reemploi_cloture_coherente check (
    (statut = 'close') = (close_le is not null)
  ),
  constraint offre_reemploi_clos_par_nomme check (
    statut <> 'close' or close_par is not null
  ),
  constraint offre_reemploi_cloture_apres_ouverture check (cloture_prevue_le > ouverte_le),
  -- Une offre par dossier : le bien est offert une fois, et l'offre close
  -- ouvre la saisine (RG-028). Deux offres laisseraient RG-028 sans réponse.
  constraint offre_reemploi_une_par_dossier unique (dossier_id),
  constraint offre_reemploi_meme_structure
    foreign key (structure_id, dossier_id) references dossier_reforme (structure_id, id)
    on delete cascade,
  -- ADR-001, contrainte 1 : le site d'origine est un site de la structure
  -- d'origine. Le site ne change pas de main, lui, donc la clé composite tient.
  constraint offre_reemploi_site_meme_structure
    foreign key (structure_id, site_origine_id) references site (structure_id, id)
    on delete set null (site_origine_id),
  -- Permet à `demande_reemploi` sa clé étrangère composite.
  constraint offre_reemploi_id_par_structure unique (structure_id, id)
);

create index if not exists idx_offre_reemploi_structure on offre_reemploi (structure_id);
create index if not exists idx_offre_reemploi_statut on offre_reemploi (statut);
create index if not exists idx_offre_reemploi_dossier on offre_reemploi (dossier_id);
create index if not exists idx_offre_reemploi_cloture on offre_reemploi (cloture_prevue_le);
create index if not exists idx_offre_reemploi_recherche on offre_reemploi (lower(bien_designation));

comment on table offre_reemploi is
  'L''offre de réemploi d''un bien aux autres structures. Seule table du SIGL lisible de toute session positionnée : une offre invisible aux autres structures serait une étape qui n''existe pas. Elle porte sa propre copie du bien, parce qu''une jointure vers une table cloisonnée la viderait hors périmètre.';

-- ---------------------------------------------------------------------------
-- demande_reemploi — la demande d'une autre structure, et son arbitrage.
--
-- Deux structures y figurent, et les deux comptent :
--   `structure_id`            celle de l'offre, pour que la clé étrangère
--                             composite de l'ADR-001 tienne ;
--   `structure_demandeuse_id` celle qui demande.
--
-- La ligne est lisible **des deux côtés**, déposée par la demandeuse, tranchée
-- par l'origine. La politique de lecture couvre donc les deux colonnes — ce qui
-- est aussi ce qui permet à l'`insert … returning` de la route de se relire :
-- la session est positionnée sur la structure demandeuse, et sans ce second
-- membre, l'insertion serait acceptée puis invisible à son auteur.
-- ---------------------------------------------------------------------------
create table if not exists demande_reemploi (
  id                       uuid primary key default gen_random_uuid(),
  offre_id                 uuid not null,
  structure_id             uuid not null references structure (id) on delete restrict,
  structure_demandeuse_id  uuid not null references structure (id) on delete restrict,
  demande_par              uuid not null references agent (id) on delete restrict,
  motif                    text not null,
  statut                   text not null default 'deposee',
  motif_decision           text null,
  tranchee_le              timestamptz null,
  tranchee_par             uuid null references agent (id) on delete set null,
  cree_le                  timestamptz not null default now(),

  constraint demande_reemploi_statut_valide check (
    statut in ('deposee', 'acceptee', 'ecartee')
  ),
  constraint demande_reemploi_motif_non_vide check (btrim(motif) <> ''),
  -- On ne demande pas un bien qu'on offre déjà : la demande vient d'ailleurs.
  constraint demande_reemploi_autre_structure check (
    structure_demandeuse_id <> structure_id
  ),
  -- Une demande par structure et par offre : deux demandes de la même
  -- structure ne lui donneraient pas deux chances.
  constraint demande_reemploi_une_par_structure unique (offre_id, structure_demandeuse_id),
  -- Une demande tranchée porte sa date et son auteur.
  constraint demande_reemploi_arbitrage_coherent check (
    (statut = 'deposee') = (tranchee_le is null)
  ),
  constraint demande_reemploi_tranchee_par_nomme check (
    statut = 'deposee' or tranchee_par is not null
  ),
  -- Un refus exige un motif : même invariant que RG-004 pour le rejet d'un
  -- état de besoin. Une structure écartée a le droit de savoir pourquoi.
  constraint demande_reemploi_refus_motive check (
    statut <> 'ecartee' or (motif_decision is not null and btrim(motif_decision) <> '')
  ),
  constraint demande_reemploi_meme_structure
    foreign key (structure_id, offre_id) references offre_reemploi (structure_id, id)
    on delete cascade
);

create index if not exists idx_demande_reemploi_offre on demande_reemploi (offre_id);
create index if not exists idx_demande_reemploi_structure on demande_reemploi (structure_id);
create index if not exists idx_demande_reemploi_demandeuse on demande_reemploi (structure_demandeuse_id);
create index if not exists idx_demande_reemploi_statut on demande_reemploi (statut);

comment on table demande_reemploi is
  'La demande de réemploi d''un bien offert, déposée par une autre structure et tranchée par celle d''origine. Lisible des deux côtés.';

-- ---------------------------------------------------------------------------
-- Les deux paramètres du lot, horodatés comme les seuils de passation.
--
-- Ni le quorum de la commission ni la durée de l'offre ne sont des constantes :
-- l'un et l'autre attendent une décision de l'institution (`LOT-REFORME.md`,
-- « Ce qui reste à trancher »), et une valeur codée en dur aurait fait d'un
-- choix provisoire une règle du logiciel. Ils se lisent comme les seuils de
-- passation — `server/src/routes/_parametres.js` —, et la règle de majorité qui
-- s'appuie sur le premier est posée à un seul endroit,
-- `server/src/regles/commission.js`, pour être renversée à peu de frais.
--
-- `on conflict do nothing` : le jeu de démonstration vide et repose la table
-- `parametre`, et il pose les deux mêmes clés. La migration ne doit ni écraser
-- une valeur administrée ni échouer si elle est déjà là.
-- ---------------------------------------------------------------------------
insert into parametre (cle, valeur, libelle) values
  ('reforme.commission_membres_minimum', '3'::jsonb,
   'Nombre minimal de membres de la commission de réforme, et nombre minimal d''avis pour qu''elle ait conclu. À défaut d''arrêté connu : trois.'),
  ('reemploi.duree_offre_jours', '30'::jsonb,
   'Durée d''ouverture d''une offre de réemploi, en jours. Valeur de départ : trente.')
on conflict (cle) do nothing;

insert into parametre_version (cle, valeur, en_vigueur_du, en_vigueur_au)
select p.cle, p.valeur, p.maj_le, null
  from parametre p
 where p.cle in ('reforme.commission_membres_minimum', 'reemploi.duree_offre_jours')
   and not exists (
     select 1 from parametre_version v where v.cle = p.cle and v.en_vigueur_au is null
   );

-- ---------------------------------------------------------------------------
-- Les droits des deux rôles de l'ADR-001.
--
-- `alter default privileges` de la migration 000500 les accorde déjà aux tables
-- créées ensuite par `postgres`. On les redonne explicitement : une migration
-- doit se suffire à elle-même, et un privilège par défaut qui changerait ne
-- doit pas rendre ce lot inopérant en silence.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'dossier_reforme', 'membre_commission', 'avis_commission',
    'offre_reemploi', 'demande_reemploi'
  ] loop
    execute format('grant select, insert, update, delete on %I to sigl_agent', t);
    execute format('grant select on %I to sigl_consolidation', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Le cloisonnement ordinaire, ADR-001 : le dossier, la commission, les avis.
--
-- Exactement la forme de la migration 000500 et de la 070000. Écriture par
-- `sigl_ecriture_permise(structure_id)`, et non par
-- `sigl_ecriture_chaine_achat` : la réforme n'est pas de la dépense, c'est de
-- la comptabilité des matières, que l'art. 120 confie au comptable des matières
-- de la structure. Le comptable public la contrôle, il ne la tient pas.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['dossier_reforme', 'membre_commission', 'avis_commission'] loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists %I on %I', t || '_lecture', t);
    execute format(
      'create policy %I on %I for select using (sigl_lecture_permise(structure_id))',
      t || '_lecture', t);

    execute format('drop policy if exists %I on %I', t || '_insertion', t);
    execute format(
      'create policy %I on %I for insert with check (sigl_ecriture_permise(structure_id))',
      t || '_insertion', t);

    -- Le droit sur la ligne avant **et** après : on ne déplace pas un dossier
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
-- La publication : `offre_reemploi`.
--
-- Lecture ouverte à toute session positionnée — voir le commentaire long de la
-- table. Écriture cloisonnée comme le reste. C'est la seule table du SIGL dans
-- ce cas, et elle l'est parce qu'elle publie.
-- ---------------------------------------------------------------------------
alter table offre_reemploi enable row level security;

drop policy if exists offre_reemploi_lecture on offre_reemploi;
create policy offre_reemploi_lecture on offre_reemploi
  for select using (sigl_consolide() or sigl_structure_courante() is not null);

drop policy if exists offre_reemploi_insertion on offre_reemploi;
create policy offre_reemploi_insertion on offre_reemploi
  for insert with check (sigl_ecriture_permise(structure_id));

drop policy if exists offre_reemploi_maj on offre_reemploi;
create policy offre_reemploi_maj on offre_reemploi
  for update using (sigl_ecriture_permise(structure_id))
  with check (sigl_ecriture_permise(structure_id));

drop policy if exists offre_reemploi_suppression on offre_reemploi;
create policy offre_reemploi_suppression on offre_reemploi
  for delete using (sigl_ecriture_permise(structure_id));

comment on policy offre_reemploi_lecture on offre_reemploi is
  'Une offre de réemploi est une publication : elle est lisible de toute session positionnée, quelle que soit sa structure, parce qu''une offre que les autres structures ne voient pas est une étape qui n''existe pas.';

-- ---------------------------------------------------------------------------
-- Les deux côtés : `demande_reemploi`.
--
-- Lisible de l'origine et de la demandeuse. Déposée par la demandeuse — et
-- c'est bien `structure_demandeuse_id` que la politique d'insertion contrôle,
-- puisque c'est elle qui écrit. Modifiable des deux côtés : l'origine tranche,
-- et la demandeuse doit pouvoir retirer sa demande le jour où la route le
-- permettra.
-- ---------------------------------------------------------------------------
alter table demande_reemploi enable row level security;

drop policy if exists demande_reemploi_lecture on demande_reemploi;
create policy demande_reemploi_lecture on demande_reemploi
  for select using (
    sigl_lecture_permise(structure_id) or sigl_lecture_permise(structure_demandeuse_id)
  );

drop policy if exists demande_reemploi_insertion on demande_reemploi;
create policy demande_reemploi_insertion on demande_reemploi
  for insert with check (sigl_ecriture_permise(structure_demandeuse_id));

drop policy if exists demande_reemploi_maj on demande_reemploi;
create policy demande_reemploi_maj on demande_reemploi
  for update using (
    sigl_ecriture_permise(structure_id) or sigl_ecriture_permise(structure_demandeuse_id)
  )
  with check (
    sigl_ecriture_permise(structure_id) or sigl_ecriture_permise(structure_demandeuse_id)
  );

drop policy if exists demande_reemploi_suppression on demande_reemploi;
create policy demande_reemploi_suppression on demande_reemploi
  for delete using (sigl_ecriture_permise(structure_demandeuse_id));

-- ---------------------------------------------------------------------------
-- Le temps réel.
--
-- Deux mécanismes, comme pour les tables du socle et celles de l'inventaire :
-- la publication `supabase_realtime` pour les clients qui parlent à Supabase,
-- et le déclencheur `sigl_notifier_flux` de la migration 010000 pour le flux
-- SSE du serveur.
--
-- L'`objet` est **au singulier** — `reforme` et `reemploi` — parce que c'est la
-- convention du serveur et que l'interface écoute ces noms-là. Le dossier, la
-- commission et les avis se présentent sous `reforme` ; l'offre et les demandes
-- sous `reemploi` : un écran se recharge, il ne distingue pas la table qui a
-- bougé.
--
-- Rappel utile : le flux n'est pas protégé par le RLS. C'est
-- `server/src/routes/_flux.js` qui filtre par structure. Un événement
-- `reemploi` porte le `structure_id` de l'origine, donc une offre nouvelle
-- n'atteint pour l'instant en temps réel que l'origine et le niveau central ;
-- les autres structures la voient à la lecture de la liste. Ouvrir le flux des
-- publications à tous demandera une exception explicite côté serveur, et c'est
-- une décision de conception, pas un réglage.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : temps réel non configuré.';
  else
    foreach t in array array[
      'dossier_reforme', 'membre_commission', 'avis_commission',
      'offre_reemploi', 'demande_reemploi'
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
-- d'état : un écran doit pouvoir montrer « passé d'offert à réemployé ».
alter table dossier_reforme   replica identity full;
alter table offre_reemploi    replica identity full;
alter table demande_reemploi  replica identity full;

do $$
declare
  cible record;
begin
  for cible in
    select * from (values
      ('dossier_reforme',   'reforme'),
      ('membre_commission', 'reforme'),
      ('avis_commission',   'reforme'),
      ('offre_reemploi',    'reemploi'),
      ('demande_reemploi',  'reemploi')
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
