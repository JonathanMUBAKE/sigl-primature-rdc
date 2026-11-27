// index.js — Le jeu de démonstration du SIGL. `npm run seed`.
//
// Idempotent : il vide les tables métier et les recrée à l'identique, à graine
// fixe. On peut le relancer autant de fois qu'on veut.
//
// Il s'exécute sous le rôle propriétaire, qui porte `rolbypassrls` et contourne
// donc le cloisonnement de l'ADR-001. C'est le seul chemin du dépôt qui le
// fait, et il est **fermé par défaut** depuis le verrou posé dans `db.js`.
//
// Ce script est le seul du dépôt à l'ouvrir, et il l'ouvre ici, en toutes
// lettres : la variable ne vit que dans ce processus, le serveur
// (`server/src/index.js`) ne la pose jamais, et `verifierPrivilegeAutorise`
// refuse de toute façon en production. Un seed lancé contre une base de
// production échoue donc avant d'écrire la première ligne.
//
// TOUT EST FICTIF. Aucune donnée réelle de la Primature.

import {
  CLE_PRIVILEGE, SESAME_PRIVILEGE,
  enPrivilegie, executerPrivilegie, fermer, verifierConnexion,
} from '../src/db.js';
import {
  AGENTS, FOURNISSEURS, MARQUES, MOTIFS_BESOIN, MOTIFS_DECISION,
  PARENTS, SITES, STRUCTURES, ARTICLES_STOCK,
} from './donnees.js';
import { CATEGORIES, prefixeCategorie } from './nomenclature.js';
import {
  chance, dateEntre, entier, hasard, jour, montant, parmi, plusieursParmi,
  reinitialiser,
} from './aleatoire.js';

// L'ouverture du chemin privilégié, en toutes lettres et dans ce processus
// seulement. `verifierPrivilegeAutorise` la refusera quand même en production.
process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

// 18 mois d'historique.
const HORIZON_JOURS = 548;

const TABLES_A_VIDER = [
  'journal', 'agent_role',
  // Le lot « inventaire » se vide avant le patrimoine qu'il constate.
  'ecart_inventaire', 'constat_inventaire', 'campagne_agent', 'campagne_inventaire',
  'rapprochement_partie', 'rapprochement_poste', 'rapprochement',
  // Le lot « réforme » se vide avant le patrimoine qu'il instruit et avant les
  // documents qu'il référence.
  'demande_reemploi', 'offre_reemploi', 'avis_commission', 'membre_commission',
  'dossier_reforme',
  'mouvement', 'stock', 'bien',
  'ligne_besoin', 'bon_commande', 'dossier_achat', 'etat_besoin',
  'document', 'alerte', 'fournisseur',
  'sequence_immatriculation', 'sequence_document',
  'parametre_version', 'parametre', 'categorie', 'agent', 'site', 'structure',
];

const ETATS_BIEN = ['neuf', 'bon', 'bon', 'bon', 'a_reparer', 'en_maintenance', 'hors_service'];

async function principal() {
  const info = await verifierConnexion();
  console.log(`Base : ${info.current_database} — rôle ${info.current_user}`);
  console.log(info.version.split(' ').slice(0, 2).join(' '));

  reinitialiser();

  // Les déclencheurs de stock sont suspendus le temps du chargement : ils
  // recalculeraient les quantités et lèveraient des alertes au fil des
  // mouvements, alors que le jeu de démonstration pose des quantités et des
  // alertes choisies. Ils sont rétablis à la fin, et c'est
  // `server/src/stock.test.js` qui prouve qu'ils fonctionnent.
  await executerPrivilegie(`
    alter table mouvement disable trigger trg_mouvement_maj_stock;
    alter table stock     disable trigger trg_stock_alerte_seuil;
  `);

  try {
    const comptes = await enPrivilegie(async (bd) => {
      await vider(bd);
      const structures = await creerStructures(bd);
      const sites = await creerSites(bd, structures);
      const agents = await creerAgents(bd, structures);
      const roles = await creerRoles(bd, agents, structures, sites);
      await creerCategories(bd);
      const parametres = await creerParametres(bd, agents);
      const biens = await creerBiens(bd, structures, sites, agents);
      const mouvements = await creerMouvements(bd, biens, structures, agents);
      const stocks = await creerStocks(bd, structures, sites);
      const fournisseurs = await creerFournisseurs(bd);
      const besoins = await creerBesoins(bd, structures, agents);
      const achats = await creerAchats(bd, besoins, fournisseurs);
      const documents = await creerDocuments(bd, structures, agents, biens, besoins, achats);
      const alertes = await creerAlertes(bd, structures, agents, biens, fournisseurs, stocks);
      const inventaires = await creerInventaires(bd, structures, sites, agents);
      const rapprochements = await creerRapprochements(bd, structures, agents);
      const reformes = await creerReformes(bd, structures, sites, agents);
      const entrees = await creerJournal(bd, agents, biens, besoins, stocks);

      return {
        structure: structures.length,
        site: sites.length,
        agent: agents.length,
        agent_role: roles,
        categorie: CATEGORIES.length,
        parametre: parametres,
        bien: biens.length,
        mouvement: mouvements + inventaires.mouvements + reformes.mouvements,
        stock: stocks.length,
        fournisseur: fournisseurs.length,
        etat_besoin: besoins.length,
        dossier_achat: achats.dossiers.length,
        bon_commande: achats.bons.length,
        document: documents + inventaires.documents + reformes.documents,
        alerte: alertes,
        campagne_inventaire: inventaires.campagnes,
        campagne_agent: inventaires.agents,
        constat_inventaire: inventaires.constats,
        ecart_inventaire: inventaires.ecarts,
        rapprochement: rapprochements.rapprochements,
        rapprochement_poste: rapprochements.postes,
        rapprochement_partie: rapprochements.parties,
        dossier_reforme: reformes.dossiers,
        membre_commission: reformes.membres,
        avis_commission: reformes.avis,
        offre_reemploi: reformes.offres,
        demande_reemploi: reformes.demandes,
        journal: entrees,
      };
    });

    await rapporter(comptes);
  } finally {
    await executerPrivilegie(`
      alter table mouvement enable trigger trg_mouvement_maj_stock;
      alter table stock     enable trigger trg_stock_alerte_seuil;
    `);
  }
}

async function vider(bd) {
  await bd.requete(`truncate table ${TABLES_A_VIDER.join(', ')} cascade`);
}

// ---------------------------------------------------------------------------
// Le socle
// ---------------------------------------------------------------------------

async function creerStructures(bd) {
  const parCode = new Map();

  // Deux passes : les parents d'abord, puis le rattachement.
  for (const s of STRUCTURES) {
    const ligne = await bd.un(
      `insert into structure (code, nom, type, regime)
       values ($1, $2, $3, $4) returning id, code, nom, type, regime`,
      [s.code, s.nom, s.type, s.regime],
    );
    parCode.set(s.code, ligne);
  }
  for (const [enfant, parent] of Object.entries(PARENTS)) {
    await bd.requete('update structure set parent_id = $1 where code = $2', [
      parCode.get(parent).id, enfant,
    ]);
  }

  const liste = [...parCode.values()];
  liste.parCode = parCode;
  return liste;
}

async function creerSites(bd, structures) {
  const sites = [];
  for (const s of SITES) {
    const structure = structures.parCode.get(s.structure);
    const ligne = await bd.un(
      `insert into site (structure_id, nom, adresse, ville)
       values ($1, $2, $3, $4) returning id, structure_id, nom, ville`,
      [structure.id, s.nom, s.adresse, s.ville],
    );
    sites.push(ligne);
  }
  return sites;
}

/** `prenom.nom@gouv.cd` — fictif, le domaine n'est pas celui de l'institution. */
function courriel(nom, index) {
  const morceaux = nom.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .split(/\s+/);
  const base = `${morceaux[morceaux.length - 1]}.${morceaux[0]}`;
  return `${base}${index}@exemple.gouv.cd`;
}

async function creerAgents(bd, structures) {
  const agents = [];
  for (const [index, a] of AGENTS.entries()) {
    const structure = structures.parCode.get(a.structure);
    const ligne = await bd.un(
      `insert into agent (structure_id, nom, fonction, email, telephone)
       values ($1, $2, $3, $4, $5)
       returning id, structure_id, nom, fonction, email`,
      [
        structure.id, a.nom, a.fonction, courriel(a.nom, index + 1),
        `+243 8${entier(10, 99)} ${entier(100, 999)} ${entier(100, 999)}`,
      ],
    );
    ligne.roles = a.roles;
    ligne.codeStructure = a.structure;
    agents.push(ligne);
  }
  return agents;
}

async function creerRoles(bd, agents, structures, sites) {
  const centraux = new Set([
    'logistique', 'intendant', 'ordonnateur', 'controle_budget',
    'comptable_public', 'direction', 'controle_externe', 'admin',
  ]);
  let total = 0;
  for (const agent of agents) {
    for (const code of agent.roles) {
      // Un rôle central n'est pas borné à une structure ; les autres le sont.
      const structureId = centraux.has(code) ? null : agent.structure_id;
      const siteId = code === 'magasinier'
        ? (sites.find((s) => s.structure_id === agent.structure_id)?.id ?? null)
        : null;
      await bd.requete(
        `insert into agent_role (agent_id, role_code, structure_id, site_id)
         values ($1, $2, $3, $4)`,
        [agent.id, code, structureId, siteId],
      );
      total += 1;
    }
  }
  return total;
}

async function creerCategories(bd) {
  // Les parents d'abord : `parent_code` est une clé étrangère.
  for (const c of CATEGORIES.filter((x) => !x.parent)) {
    await bd.requete(
      `insert into categorie (code, libelle, parent_code, classement, duree_amortissement, unite)
       values ($1, $2, null, $3, $4, $5)`,
      [c.code, c.libelle, c.classement, c.duree ?? null, c.unite ?? null],
    );
  }
  for (const c of CATEGORIES.filter((x) => x.parent)) {
    await bd.requete(
      `insert into categorie (code, libelle, parent_code, classement, duree_amortissement, unite)
       values ($1, $2, $3, $4, $5, $6)`,
      [c.code, c.libelle, c.parent, c.classement, c.duree ?? null, c.unite ?? null],
    );
  }
}

// ---------------------------------------------------------------------------
// Les paramètres — les seuils de passation de la loi 10/010, en CDF.
// Horodatés et versionnés : RG-007 juge un dossier avec les seuils de sa date.
// ---------------------------------------------------------------------------

const SEUILS_2025 = {
  gre_a_gre: 0,
  consultation: 25_000_000,
  aon: 150_000_000,
  aoi: 1_500_000_000,
  devise: 'CDF',
};

const SEUILS_2026 = {
  gre_a_gre: 0,
  consultation: 30_000_000,
  aon: 180_000_000,
  aoi: 1_800_000_000,
  devise: 'CDF',
};

async function creerParametres(bd, agents) {
  const admin = agents.find((a) => a.roles.includes('admin'));
  const parametres = [
    ['seuils_passation', SEUILS_2026,
      'Seuils de passation des marchés, en francs congolais (loi 10/010).'],
    ['seuil_suivi_individuel', { montant: 500_000, devise: 'CDF' },
      'En deçà de ce montant, un bien peut être suivi en lot (IPSAS 45 §8).'],
    ['delais_alerte', { etat_besoin_sans_visa_jours: 7, reception_sans_prise_en_charge_jours: 15, maintenance_sans_retour_jours: 30 },
      'Délais au-delà desquels une alerte est ouverte.'],
    ['seuils_stock_defaut', { minimum: 20, critique: 8 },
      'Seuils appliqués à un nouvel article de stock, à défaut de seuils propres.'],
    ['decoupage_marche', { fenetre_jours: 90, ecart_tolere: 0.1 },
      'Fenêtre d’observation du découpage d’un achat sous un seuil (RG-008).'],
    ['amortissement', { methode: 'lineaire', prorata_temporis: true },
      'Méthode d’amortissement des immobilisations.'],
    // Lot « réforme ». Ni le quorum de la commission ni la durée de l'offre ne
    // sont arrêtés par l'institution (`docs/LOT-REFORME.md`, « Ce qui reste à
    // trancher ») : ce sont des paramètres, et les routes refusent d'agir si on
    // les retire plutôt que de deviner une valeur à sa place.
    ['reforme.commission_membres_minimum', 3,
      'Nombre minimal de membres de la commission de réforme, et nombre minimal d’avis pour qu’elle ait conclu.'],
    ['reemploi.duree_offre_jours', 30,
      'Durée d’ouverture d’une offre de réemploi, en jours.'],
  ];

  for (const [cle, valeur, libelle] of parametres) {
    await bd.requete(
      'insert into parametre (cle, valeur, libelle, maj_par) values ($1, $2, $3, $4)',
      [cle, JSON.stringify(valeur), libelle, admin.id],
    );
  }

  // L'historique : les seuils de 2025 ont été en vigueur, puis relevés.
  const bascule = new Date(Date.now() - 300 * 86_400_000);
  await bd.requete(
    `insert into parametre_version (cle, valeur, en_vigueur_du, en_vigueur_au, maj_par)
     values ($1, $2, $3, $4, $5)`,
    [
      'seuils_passation', JSON.stringify(SEUILS_2025),
      new Date(Date.now() - HORIZON_JOURS * 86_400_000).toISOString(),
      bascule.toISOString(), admin.id,
    ],
  );
  await bd.requete(
    `insert into parametre_version (cle, valeur, en_vigueur_du, en_vigueur_au, maj_par)
     values ($1, $2, $3, null, $4)`,
    ['seuils_passation', JSON.stringify(SEUILS_2026), bascule.toISOString(), admin.id],
  );

  return parametres.length;
}

/** RG-007 : la procédure découle du montant et des seuils en vigueur. */
function procedurePour(montantEstime, seuils) {
  if (montantEstime >= seuils.aoi) return 'aoi';
  if (montantEstime >= seuils.aon) return 'aon';
  if (montantEstime >= seuils.consultation) return 'consultation';
  return 'gre_a_gre';
}

// ---------------------------------------------------------------------------
// Les biens — environ 400, immatriculés au format du contrat.
// ---------------------------------------------------------------------------

// Combien de biens par structure. Les structures intégrées de la Primature en
// portent le plus ; les établissements autonomes tiennent leur propre registre,
// plus modeste dans la démonstration.
const REPARTITION_BIENS = {
  CAB: 58, SGP: 96, SGG: 54, CGIG: 44, CAID: 26, DU: 22, CNDSI: 20,
  ARMP: 32, APCSC: 18, ARCCSU: 16, CNP: 22,
};

// Les catégories plausibles par type de structure, avec leur poids.
const CATEGORIES_COURANTES = [
  ['MOB-BUR', 10], ['MOB-SIE', 14], ['MOB-ARM', 9], ['MOB-SAL', 4], ['MOB-CLI', 8],
  ['INF-ORD', 14], ['INF-POR', 10], ['INF-IMP', 7], ['INF-RES', 4], ['INF-SRV', 2],
  ['INF-TEL', 5], ['CHA-BER', 3], ['CHA-TTR', 3], ['CHA-UTI', 2], ['CHA-MOT', 2],
  ['TEC-GRP', 2], ['TEC-ELE', 4], ['TEC-SON', 3], ['TEC-SEC', 5], ['IMM-AME', 2],
];

const ROUE_CATEGORIES = CATEGORIES_COURANTES.flatMap(([code, poids]) => Array(poids).fill(code));

// Les ordres de grandeur, en francs congolais.
const VALEURS = {
  'MOB-BUR': [450_000, 3_200_000], 'MOB-SIE': [180_000, 1_400_000],
  'MOB-ARM': [320_000, 1_800_000], 'MOB-SAL': [2_400_000, 9_500_000],
  'MOB-CLI': [1_100_000, 3_800_000], 'INF-ORD': [1_350_000, 2_900_000],
  'INF-POR': [1_900_000, 4_600_000], 'INF-IMP': [850_000, 7_200_000],
  'INF-RES': [1_200_000, 6_500_000], 'INF-SRV': [9_500_000, 32_000_000],
  'INF-TEL': [320_000, 4_100_000], 'CHA-BER': [38_000_000, 72_000_000],
  'CHA-TTR': [78_000_000, 165_000_000], 'CHA-UTI': [42_000_000, 88_000_000],
  'CHA-MOT': [3_800_000, 7_500_000], 'TEC-GRP': [28_000_000, 95_000_000],
  'TEC-ELE': [1_800_000, 12_000_000], 'TEC-SON': [2_200_000, 18_000_000],
  'TEC-SEC': [650_000, 8_400_000], 'IMM-AME': [8_000_000, 45_000_000],
};

async function immatriculer(bd, codeStructure, codeCategorie) {
  const prefixe = prefixeCategorie(codeCategorie);
  const ligne = await bd.un(
    `insert into sequence_immatriculation (structure_code, prefixe_cat, dernier)
     values ($1, $2, 1)
     on conflict (structure_code, prefixe_cat)
       do update set dernier = sequence_immatriculation.dernier + 1
     returning dernier`,
    [codeStructure, prefixe],
  );
  return `BRT-${codeStructure}-${prefixe}-${String(ligne.dernier).padStart(5, '0')}`;
}

async function creerBiens(bd, structures, sites, agents) {
  const biens = [];

  for (const structure of structures) {
    const combien = REPARTITION_BIENS[structure.code] ?? 20;
    const sitesStructure = sites.filter((s) => s.structure_id === structure.id);
    const agentsStructure = agents.filter((a) => a.structure_id === structure.id);

    for (let i = 0; i < combien; i += 1) {
      const codeCategorie = parmi(ROUE_CATEGORIES);
      const [marque, modele] = parmi(MARQUES[codeCategorie] ?? [['—', '—']]);
      const [min, max] = VALEURS[codeCategorie] ?? [200_000, 2_000_000];

      // Le mode d'entrée commande l'évaluation initiale (IPSAS 45 §12).
      const modeEntree = chance(0.76) ? 'achat' : (chance(0.6) ? 'don' : 'transfert');
      const etat = parmi(ETATS_BIEN);
      const reforme = chance(0.04);
      const perdu = !reforme && chance(0.02);
      const etatFinal = reforme ? 'reforme' : (perdu ? 'perdu' : etat);

      const dateAcq = dateEntre(HORIZON_JOURS, 20);
      const site = sitesStructure.length > 0 ? parmi(sitesStructure) : null;
      // Un détenteur nommé seulement pour le matériel personnel.
      const detenteur = ['INF-POR', 'INF-ORD', 'INF-TEL', 'MOB-BUR', 'MOB-SIE'].includes(codeCategorie)
        && agentsStructure.length > 0 && chance(0.55)
        ? parmi(agentsStructure) : null;

      // RG-021 : un bien suivi en lot n'a pas d'immatriculation individuelle.
      // Le seuil de suivi individuel est un paramètre, pas une constante.
      const valeur = montant(min, max);
      const enLot = valeur < 500_000 && chance(0.7);
      const suivi = enLot ? 'lot' : 'individuel';
      const immatriculation = suivi === 'individuel'
        ? await immatriculer(bd, structure.code, codeCategorie)
        : null;

      const ligne = await bd.un(
        `insert into bien (
           immatriculation, categorie_code, designation, marque, modele, numero_serie,
           classement, objectif_detention, mode_entree, valeur_acquisition,
           cout_remplacement, date_acquisition, etat, structure_id, site_id,
           detenteur_id, suivi, quantite, reforme_le, cree_le, maj_le)
         values ($1,$2,$3,$4,$5,$6,'immobilisation','operationnelle',$7,$8,null,$9,$10,
                 $11,$12,$13,$14,$15,$16,$17,$17)
         returning id, immatriculation, structure_id, site_id, categorie_code,
                   designation, etat, valeur_acquisition, date_acquisition, quantite`,
        [
          immatriculation, codeCategorie,
          libelleBien(codeCategorie, marque, modele),
          marque, modele,
          chance(0.8) ? `SN${entier(100_000, 999_999)}` : null,
          modeEntree, valeur, jour(dateAcq), etatFinal,
          structure.id, site?.id ?? null, detenteur?.id ?? null,
          suivi, enLot ? entier(2, 24) : 1,
          etatFinal === 'reforme' ? jour(dateEntre(120, 10)) : null,
          dateAcq.toISOString(),
        ],
      );
      ligne.codeStructure = structure.code;
      biens.push(ligne);
    }
  }
  return biens;
}

function libelleBien(code, marque, modele) {
  const racine = CATEGORIES.find((c) => c.code === code)?.libelle ?? 'Bien';
  const singulier = racine
    .replace(/^Ordinateurs de bureau$/, 'Ordinateur de bureau')
    .replace(/^Ordinateurs portables$/, 'Ordinateur portable')
    .replace(/^Imprimantes et multifonctions$/, 'Imprimante multifonction')
    .replace(/^Sièges et fauteuils$/, 'Siège de bureau')
    .replace(/^Bureaux et plans de travail$/, 'Bureau')
    .replace(/^Armoires et classeurs$/, 'Armoire de classement')
    .replace(/^Berlines de service$/, 'Berline de service')
    .replace(/^Véhicules tout-terrain$/, 'Véhicule tout-terrain')
    .replace(/^Véhicules utilitaires et camionnettes$/, 'Véhicule utilitaire')
    .replace(/^Motocyclettes$/, 'Motocyclette')
    .replace(/^Groupes électrogènes$/, 'Groupe électrogène')
    .replace(/^Serveurs et stockage$/, 'Serveur')
    .replace(/^Climatisation et ventilation$/, 'Climatiseur');
  return marque === '—' ? singulier : `${singulier} ${marque} ${modele}`;
}

// ---------------------------------------------------------------------------
// Les mouvements
// ---------------------------------------------------------------------------

async function creerMouvements(bd, biens, structures, agents) {
  let total = 0;

  const parStructure = new Map(structures.map((s) => [s.id, s]));

  for (const bien of biens) {
    const structure = parStructure.get(bien.structure_id);
    const agentsStructure = agents.filter((a) => a.structure_id === bien.structure_id);
    const operateur = agentsStructure.length > 0 ? parmi(agentsStructure) : null;

    // Tout bien entre au patrimoine : c'est son premier mouvement.
    await bd.requete(
      `insert into mouvement (bien_id, structure_id, type, quantite, date,
         structure_cible_code, motif, agent_id, cree_le)
       values ($1, $2, 'entree', $3, $4, $5, $6, $7, $8)`,
      [
        bien.id, bien.structure_id, bien.quantite, bien.date_acquisition,
        structure.code, 'Entrée au patrimoine et prise en charge à l’inventaire.',
        operateur?.id ?? null, new Date(bien.date_acquisition).toISOString(),
      ],
    );
    total += 1;

    // Puis la vie du bien, selon l'état où il est arrivé.
    const suite = [];
    if (bien.etat === 'en_maintenance') {
      suite.push(['maintenance', 'Envoi en atelier après panne signalée par le service.']);
    } else if (bien.etat === 'a_reparer') {
      suite.push(['maintenance', 'Diagnostic demandé après dysfonctionnement répété.']);
      suite.push(['retour_maintenance', 'Retour d’atelier : réparation à programmer, pièce indisponible.']);
    } else if (bien.etat === 'hors_service') {
      suite.push(['maintenance', 'Immobilisation pour expertise technique.']);
      suite.push(['declassement', 'Déclassé après expertise : réparation non économiquement justifiée.']);
    } else if (bien.etat === 'reforme') {
      suite.push(['declassement', 'Déclassement prononcé après expertise technique.']);
      suite.push(['reforme', 'Réforme instruite ; le bien reste au registre (RG-015).']);
    } else if (bien.etat === 'perdu') {
      suite.push(['perte', 'Perte déclarée ; procès-verbal établi, le bien reste au registre (RG-015).']);
    } else if (chance(0.18)) {
      suite.push(['transfert', 'Transfert interne après réaffectation d’un agent.']);
    }

    for (const [type, motif] of suite) {
      await bd.requete(
        `insert into mouvement (bien_id, structure_id, type, quantite, date,
           structure_source_code, structure_cible_code, motif, agent_id, cree_le)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          bien.id, bien.structure_id, type, bien.quantite,
          jour(dateEntre(300, 5)),
          structure.code,
          type === 'transfert' ? structure.code : null,
          motif, operateur?.id ?? null, dateEntre(300, 5).toISOString(),
        ],
      );
      total += 1;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Les stocks — 60 articles, dont quelques-uns sous le seuil critique.
// ---------------------------------------------------------------------------

async function creerStocks(bd, structures, sites) {
  // Les magasins où le stock vit réellement.
  const magasins = [
    sites.find((s) => s.nom === 'Magasin central de la Primature'),
    sites.find((s) => s.nom === 'Garage central'),
    sites.find((s) => s.nom === 'Dépôt de matériaux'),
    sites.find((s) => s.nom === 'Atelier technique CGIG'),
    sites.find((s) => s.nom === 'Siège ARMP'),
    sites.find((s) => s.nom === 'Siège CNP'),
  ].filter(Boolean);

  const parSite = new Map(sites.map((s) => [s.id, s]));
  const articles = ARTICLES_STOCK.slice(0, 60);
  const stocks = [];

  for (const [index, [designation, codeCategorie, unite]] of articles.entries()) {
    // Le carburant et les pièces vont au garage, les matériaux au dépôt,
    // le reste au magasin central.
    let site;
    if (codeCategorie.startsWith('CHA-')) {
      site = magasins.find((s) => s.nom === 'Garage central') ?? magasins[0];
    } else if (codeCategorie === 'TEC-OUT') {
      site = magasins.find((s) => s.nom === 'Atelier technique CGIG') ?? magasins[0];
    } else if (index % 11 === 0 && magasins.length > 4) {
      // Quelques articles tenus par un établissement autonome, pour que la
      // démonstration montre un stock cloisonné.
      site = magasins[4 + (index % 2)];
    } else {
      site = magasins[0];
    }

    const seuilMinimum = entier(12, 60);
    const seuilCritique = Math.max(3, Math.floor(seuilMinimum * 0.35));

    // Huit articles sous le seuil critique, six entre les deux seuils : le
    // tableau de bord a de quoi montrer quelque chose dès la première ouverture.
    let quantite;
    if (index < 8) {
      quantite = entier(0, seuilCritique);
    } else if (index < 14) {
      quantite = entier(seuilCritique + 1, seuilMinimum);
    } else {
      quantite = entier(seuilMinimum + 5, seuilMinimum * 6);
    }

    const ligne = await bd.un(
      `insert into stock (categorie_code, structure_id, site_id, designation,
         unite, quantite, seuil_minimum, seuil_critique)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, designation, quantite, seuil_minimum, seuil_critique,
                 structure_id, site_id, unite, categorie_code`,
      [
        codeCategorie, parSite.get(site.id).structure_id, site.id,
        designation, unite, quantite, seuilMinimum, seuilCritique,
      ],
    );
    stocks.push(ligne);
  }
  return stocks;
}

// ---------------------------------------------------------------------------
// Les fournisseurs
// ---------------------------------------------------------------------------

async function creerFournisseurs(bd) {
  const fournisseurs = [];
  for (const [index, f] of FOURNISSEURS.entries()) {
    const ligne = await bd.un(
      `insert into fournisseur (denomination, rccm, id_nat, nif, adresse, telephone,
         email, categories, liste_noire, motif_liste_noire, delai_moyen_jours)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning id, denomination, liste_noire, categories, delai_moyen_jours`,
      [
        f.denomination,
        `CD/KNG/RCCM/${23 + (index % 3)}-B-${String(1200 + index * 37).padStart(4, '0')}`,
        `01-${entier(100, 999)}-N${entier(10_000, 99_999)}`,
        `A${entier(1_000_000, 9_999_999)}${String.fromCharCode(65 + index)}`,
        `${entier(1, 240)}, avenue ${parmi(['Kasa-Vubu', 'du Commerce', 'Lukusa', 'Bas-Congo', 'Kabambare'])}, ${parmi(['Gombe', 'Kintambo', 'Limete', 'Barumbu'])}, Kinshasa`,
        `+243 8${entier(10, 99)} ${entier(100, 999)} ${entier(100, 999)}`,
        `contact@${f.denomination.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '').slice(0, 18)}.cd`,
        f.categories, f.liste_noire, f.motif ?? null, f.delai,
      ],
    );
    fournisseurs.push(ligne);
  }
  return fournisseurs;
}

// ---------------------------------------------------------------------------
// Le circuit du besoin — 30 états répartis sur les dix statuts.
// ---------------------------------------------------------------------------

const STATUTS = [
  'brouillon', 'vise', 'recu', 'examine', 'partiel',
  'rejete', 'en_achat', 'livrable', 'livre', 'clos',
];

async function numeroDocument(bd, prefixe, date) {
  const annee = new Date(date).getFullYear();
  const ligne = await bd.un(
    `insert into sequence_document (prefixe, annee, dernier) values ($1, $2, 1)
     on conflict (prefixe, annee) do update set dernier = sequence_document.dernier + 1
     returning dernier`,
    [prefixe, annee],
  );
  return `${prefixe}/${annee}/${String(ligne.dernier).padStart(4, '0')}`;
}

async function creerBesoins(bd, structures, agents) {
  const besoins = [];
  const feuilles = CATEGORIES.filter((c) => c.parent);

  // Trois états par statut : les dix statuts du contrat sont tous peuplés.
  for (const statut of STATUTS) {
    for (let k = 0; k < 3; k += 1) {
      // Une structure qui a au moins un demandeur et un chef distinct.
      const candidates = structures.filter((s) => {
        const equipe = agents.filter((a) => a.structure_id === s.id);
        return equipe.some((a) => a.roles.includes('demandeur'))
          && equipe.some((a) => a.roles.includes('chef_structure'));
      });
      const structure = parmi(candidates);
      const equipe = agents.filter((a) => a.structure_id === structure.id);
      const demandeur = parmi(equipe.filter((a) => a.roles.includes('demandeur')));
      // RG-002 : qui demande ne vise pas.
      const viseurs = equipe.filter(
        (a) => a.roles.includes('chef_structure') && a.id !== demandeur.id,
      );
      const viseur = viseurs.length > 0 ? parmi(viseurs) : null;
      const examinateur = agents.find((a) => a.roles.includes('logistique'));

      const creeLe = dateEntre(HORIZON_JOURS, 10);
      const numero = await numeroDocument(bd, 'EB', creeLe);

      // RG-001 : pas de visa sans justification. Un brouillon peut en manquer.
      const justification = statut === 'brouillon' && chance(0.4)
        ? null : parmi(MOTIFS_BESOIN);

      const apresVisa = !['brouillon'].includes(statut);
      const apresExamen = ['examine', 'partiel', 'rejete', 'en_achat', 'livrable', 'livre', 'clos'].includes(statut);

      // RG-003 et RG-004 : partiel et rejet exigent un motif.
      let motifDecision = null;
      if (statut === 'partiel') motifDecision = parmi(MOTIFS_DECISION.partiel);
      else if (statut === 'rejete') motifDecision = parmi(MOTIFS_DECISION.rejete);
      else if (apresExamen) motifDecision = 'Demande fondée et conforme à la nomenclature ; servie en totalité.';

      const viseLe = apresVisa && viseur
        ? new Date(creeLe.getTime() + entier(1, 6) * 86_400_000) : null;
      const examineLe = apresExamen && viseLe
        ? new Date(viseLe.getTime() + entier(2, 14) * 86_400_000) : null;

      const ligne = await bd.un(
        `insert into etat_besoin (numero, structure_id, demandeur_id, statut,
           justification, cree_le, vise_le, viseur_id, examine_le, examinateur_id,
           motif_decision, accuse_le, clos_le)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         returning id, numero, statut, structure_id, demandeur_id, cree_le`,
        [
          numero, structure.id, demandeur.id, statut, justification,
          creeLe.toISOString(),
          viseLe?.toISOString() ?? null, apresVisa ? viseur?.id ?? null : null,
          examineLe?.toISOString() ?? null, apresExamen ? examinateur.id : null,
          motifDecision,
          // RG-006 : on ne clôt pas sans accusé de réception signé.
          ['livre', 'clos'].includes(statut) && examineLe
            ? new Date(examineLe.getTime() + entier(5, 30) * 86_400_000).toISOString() : null,
          statut === 'clos' && examineLe
            ? new Date(examineLe.getTime() + entier(31, 45) * 86_400_000).toISOString() : null,
        ],
      );
      ligne.codeStructure = structure.code;
      ligne.examinateurId = apresExamen ? examinateur.id : null;
      ligne.viseurId = apresVisa ? viseur?.id ?? null : null;

      // Les lignes de la demande, aiguillées une à une après examen.
      const combien = entier(1, 5);
      for (const [rang, categorie] of plusieursParmi(feuilles, combien).entries()) {
        const demandee = entier(1, 40);
        let accordee = null;
        let origine = null;
        if (apresExamen) {
          if (statut === 'rejete') {
            accordee = 0;
            origine = 'refuse';
          } else if (statut === 'partiel') {
            accordee = chance(0.35) ? 0 : entier(1, demandee);
            origine = accordee === 0 ? 'refuse' : (chance(0.5) ? 'stock' : 'achat');
          } else {
            accordee = demandee;
            origine = categorie.classement === 'stock' ? 'stock' : 'achat';
          }
        }
        await bd.requete(
          `insert into ligne_besoin (etat_besoin_id, structure_id, categorie_code,
             designation, quantite_demandee, quantite_accordee, motif, origine, rang)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            ligne.id, structure.id, categorie.code, categorie.libelle,
            demandee, accordee,
            origine === 'refuse' ? 'Écarté lors de l’examen, voir le motif de la décision.' : null,
            origine, rang + 1,
          ],
        );
      }
      besoins.push(ligne);
    }
  }
  return besoins;
}

// ---------------------------------------------------------------------------
// Les achats
// ---------------------------------------------------------------------------

async function creerAchats(bd, besoins, fournisseurs) {
  const dossiers = [];
  const bons = [];

  // RG-009 : aucun bon de commande vers un fournisseur en liste noire.
  const recommandables = fournisseurs.filter((f) => !f.liste_noire);
  const aAcheter = besoins.filter(
    (b) => ['en_achat', 'livrable', 'livre', 'clos'].includes(b.statut),
  );

  for (const besoin of aAcheter) {
    const montantEstime = montant(4_000_000, 420_000_000);
    const creeLe = new Date(new Date(besoin.cree_le).getTime() + entier(10, 40) * 86_400_000);
    // Les seuils applicables sont ceux de la date du dossier (RG-007).
    const seuils = creeLe.getTime() < Date.now() - 300 * 86_400_000 ? SEUILS_2025 : SEUILS_2026;
    const procedure = procedurePour(montantEstime, seuils);

    const statutDossier = besoin.statut === 'en_achat'
      ? parmi(['ouvert', 'en_consultation', 'attribue'])
      : (besoin.statut === 'clos' ? 'clos' : 'execute');

    const dossier = await bd.un(
      `insert into dossier_achat (numero, etat_besoin_id, objet, montant_estime,
         procedure, statut, seuils_appliques, cree_le, clos_le)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning id, numero, montant_estime, procedure, statut`,
      [
        await numeroDocument(bd, 'DA', creeLe), besoin.id,
        `Acquisition de biens et fournitures au titre de l’état de besoin ${besoin.numero}`,
        montantEstime, procedure, statutDossier,
        JSON.stringify(seuils), creeLe.toISOString(),
        statutDossier === 'clos'
          ? new Date(creeLe.getTime() + entier(45, 120) * 86_400_000).toISOString() : null,
      ],
    );
    dossiers.push(dossier);

    if (['attribue', 'execute', 'clos'].includes(statutDossier)) {
      const fournisseur = parmi(recommandables.filter(
        (f) => f.categories.length === 0 || chance(0.9),
      ));
      const emisLe = new Date(creeLe.getTime() + entier(15, 60) * 86_400_000);
      const statutBon = statutDossier === 'clos'
        ? 'paye'
        : (statutDossier === 'execute' ? parmi(['receptionne', 'payable', 'livre']) : 'emis');

      const bon = await bd.un(
        `insert into bon_commande (numero, dossier_id, fournisseur_id, montant,
           statut, emis_le, livre_le, paye_le)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning id, numero, montant, statut, fournisseur_id, dossier_id`,
        [
          await numeroDocument(bd, 'BC', emisLe), dossier.id, fournisseur.id,
          Math.round(montantEstime * (0.88 + hasard() * 0.18) / 100) * 100,
          statutBon, emisLe.toISOString(),
          ['livre', 'receptionne', 'payable', 'paye'].includes(statutBon)
            ? new Date(emisLe.getTime() + (fournisseur.delai_moyen_jours ?? 20) * 86_400_000).toISOString()
            : null,
          statutBon === 'paye'
            ? new Date(emisLe.getTime() + entier(60, 140) * 86_400_000).toISOString() : null,
        ],
      );
      bon.besoin = besoin;
      bons.push(bon);
    }
  }
  return { dossiers, bons };
}

// ---------------------------------------------------------------------------
// Les documents — dont les certificats de prise en charge (RG-010).
// ---------------------------------------------------------------------------

async function creerDocuments(bd, structures, agents, biens, besoins, achats) {
  let total = 0;
  const parStructure = new Map(structures.map((s) => [s.id, s]));
  const comptables = agents.filter((a) => a.roles.includes('comptable_matieres'));
  const comptablePublic = agents.find((a) => a.roles.includes('comptable_public'));
  const ordonnateur = agents.find((a) => a.roles.includes('ordonnateur'));

  const emettre = async (type, prefixe, structureId, objetType, objetId,
    contenu, signataire, date, parent = null) => {
    const ligne = await bd.un(
      `insert into document (type, numero, structure_id, objet_type, objet_id,
         contenu, signataire_id, signe_le, fige, parent_document_id, cree_le)
       values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$8)
       returning id`,
      [
        type, await numeroDocument(bd, prefixe, date), structureId, objetType,
        objetId, JSON.stringify(contenu), signataire?.id ?? null,
        new Date(date).toISOString(), parent,
      ],
    );
    total += 1;
    return ligne.id;
  };

  // L'état de besoin et la décision d'examen, pour les demandes instruites.
  for (const besoin of besoins) {
    if (besoin.statut === 'brouillon') continue;
    const structure = parStructure.get(besoin.structure_id);
    const dateBesoin = new Date(besoin.cree_le);

    const pieceBesoin = await emettre(
      'etat_besoin', 'EB-D', besoin.structure_id, 'etat_besoin', besoin.id,
      { numero: besoin.numero, structure: structure.nom, statut: besoin.statut },
      { id: besoin.viseurId }, dateBesoin,
    );

    if (besoin.examinateurId) {
      await emettre(
        'decision_examen', 'DE', besoin.structure_id, 'etat_besoin', besoin.id,
        {
          numero_etat_besoin: besoin.numero,
          decision: besoin.statut === 'rejete' ? 'rejet' : (besoin.statut === 'partiel' ? 'accord partiel' : 'accord'),
        },
        { id: besoin.examinateurId },
        new Date(dateBesoin.getTime() + entier(5, 20) * 86_400_000),
        pieceBesoin,
      );
    }

    // RG-006 : la clôture suppose un accusé de réception signé.
    if (['livre', 'clos'].includes(besoin.statut)) {
      await emettre(
        'accuse_reception', 'AR', besoin.structure_id, 'etat_besoin', besoin.id,
        { numero_etat_besoin: besoin.numero, reserve: false },
        { id: besoin.demandeur_id },
        new Date(dateBesoin.getTime() + entier(25, 60) * 86_400_000),
      );
    }
  }

  // Le bon de commande, le PV de réception, puis le certificat de prise en
  // charge. RG-010 : le certificat n'est émis qu'après un PV de réception.
  // RG-011 : rien n'est marqué payable sans ce certificat.
  for (const bon of achats.bons) {
    const structureId = bon.besoin.structure_id;
    const emisLe = dateEntre(400, 20);

    const pieceBon = await emettre(
      'bon_commande', 'BC-D', structureId, 'bon_commande', bon.id,
      { numero: bon.numero, montant: bon.montant, devise: 'CDF' },
      ordonnateur, emisLe,
    );

    if (['livre', 'receptionne', 'payable', 'paye'].includes(bon.statut)) {
      const comptable = parmi(comptables);
      const recuLe = new Date(emisLe.getTime() + entier(15, 45) * 86_400_000);

      const pv = await emettre(
        'pv_reception', 'PV-R', structureId, 'bon_commande', bon.id,
        { numero_bon_commande: bon.numero, conforme: true, reserves: [] },
        comptable, recuLe, pieceBon,
      );

      if (['receptionne', 'payable', 'paye'].includes(bon.statut)) {
        const certificat = await emettre(
          'certificat_prise_en_charge', 'CPC', structureId, 'bon_commande', bon.id,
          {
            numero_bon_commande: bon.numero,
            numero_pv_reception: pv,
            fondement: 'Décret n° 13/050 du 6 novembre 2013, article 137',
            prise_en_charge_inventaire: true,
          },
          comptable, new Date(recuLe.getTime() + entier(2, 12) * 86_400_000), pv,
        );

        if (bon.statut === 'paye') {
          await emettre(
            'bon_livraison', 'BL', structureId, 'bon_commande', bon.id,
            { numero_bon_commande: bon.numero, certificat_prise_en_charge: certificat },
            comptablePublic, new Date(recuLe.getTime() + entier(13, 40) * 86_400_000),
            certificat,
          );
        }
      }
    }
  }

  // Les procès-verbaux attachés aux biens perdus et réformés (RG-015, RG-016).
  for (const bien of biens.filter((b) => ['perdu', 'reforme'].includes(b.etat))) {
    const comptable = comptables.find((c) => c.structure_id === bien.structure_id)
      ?? parmi(comptables);
    await emettre(
      bien.etat === 'perdu' ? 'pv_perte' : 'pv_reforme',
      bien.etat === 'perdu' ? 'PV-P' : 'PV-RF',
      bien.structure_id, 'bien', bien.id,
      {
        immatriculation: bien.immatriculation,
        designation: bien.designation,
        valeur_acquisition: bien.valeur_acquisition,
        maintien_au_registre: true,
      },
      comptable, dateEntre(200, 10),
    );
  }

  // Un état d'inventaire par structure, celui du dernier exercice clos.
  for (const structure of structures) {
    const comptable = comptables.find((c) => c.structure_id === structure.id)
      ?? parmi(comptables);
    const bienStructure = biens.filter((b) => b.structure_id === structure.id);
    await emettre(
      'etat_inventaire', 'INV', structure.id, 'structure', structure.id,
      {
        structure: structure.nom,
        regime: structure.regime,
        exercice: 2025,
        nombre_de_biens: bienStructure.length,
        valeur_totale: bienStructure.reduce((somme, b) => somme + Number(b.valeur_acquisition), 0),
        devise: 'CDF',
      },
      comptable, new Date('2026-01-31T10:00:00Z'),
    );
  }

  return total;
}

// ---------------------------------------------------------------------------
// Les alertes — dix, de types variés. RG-022 : elles ne décident rien.
// ---------------------------------------------------------------------------

async function creerAlertes(bd, structures, agents, biens, fournisseurs, stocks) {
  const logistique = agents.find((a) => a.roles.includes('logistique'));
  const sgp = structures.parCode.get('SGP');
  const enListeNoire = fournisseurs.filter((f) => f.liste_noire);
  const sousCritique = stocks.filter((s) => s.quantite <= s.seuil_critique);
  const sousMinimum = stocks.filter(
    (s) => s.quantite > s.seuil_critique && s.quantite <= s.seuil_minimum,
  );
  const enMaintenance = biens.filter((b) => b.etat === 'en_maintenance');
  const perdus = biens.filter((b) => b.etat === 'perdu');

  const alertes = [];

  if (sousCritique.length > 0) {
    const article = sousCritique[0];
    alertes.push({
      code: 'STOCK_CRITIQUE', gravite: 'critique', structure_id: article.structure_id,
      objet_type: 'stock', objet_id: article.id,
      explication: `Le stock de « ${article.designation} » est à ${article.quantite} ${article.unite} pour un seuil critique de ${article.seuil_critique}. La rupture est imminente.`,
      donnees: { quantite: article.quantite, seuil_critique: article.seuil_critique },
      statut: 'ouverte',
    });
  }
  if (sousCritique.length > 1) {
    const article = sousCritique[1];
    alertes.push({
      code: 'STOCK_CRITIQUE', gravite: 'critique', structure_id: article.structure_id,
      objet_type: 'stock', objet_id: article.id,
      explication: `Rupture constatée sur « ${article.designation} » : ${article.quantite} ${article.unite} en magasin.`,
      donnees: { quantite: article.quantite, seuil_critique: article.seuil_critique },
      statut: 'confirmee',
      traite_par: logistique.id,
      suite: 'Rupture confirmée. Un état de besoin a été ouvert et le dossier d’achat est en consultation.',
    });
  }
  if (sousMinimum.length > 0) {
    const article = sousMinimum[0];
    alertes.push({
      code: 'STOCK_SOUS_MINIMUM', gravite: 'attention', structure_id: article.structure_id,
      objet_type: 'stock', objet_id: article.id,
      explication: `« ${article.designation} » est passé sous le seuil minimum : ${article.quantite} ${article.unite} pour un minimum de ${article.seuil_minimum}.`,
      donnees: { quantite: article.quantite, seuil_minimum: article.seuil_minimum },
      statut: 'en_examen',
    });
  }

  if (enListeNoire.length > 0) {
    alertes.push({
      code: 'FOURNISSEUR_LISTE_NOIRE', gravite: 'critique', structure_id: sgp.id,
      objet_type: 'fournisseur', objet_id: enListeNoire[0].id,
      explication: `Une consultation a été adressée à « ${enListeNoire[0].denomination} », qui figure en liste noire. Aucun bon de commande ne peut lui être émis (RG-009).`,
      donnees: { denomination: enListeNoire[0].denomination, regle: 'RG-009' },
      statut: 'ouverte',
    });
  }

  alertes.push({
    code: 'DECOUPAGE_SUSPECT', gravite: 'critique', structure_id: sgp.id,
    objet_type: 'dossier_achat', objet_id: null,
    explication: 'Trois dossiers d’achat de même objet, passés en gré à gré sur une fenêtre de 90 jours, totalisent un montant qui aurait exigé une consultation. Découpage possible (RG-008, drapeau rouge R011).',
    donnees: { nombre_de_dossiers: 3, total_cdf: 71_400_000, seuil_consultation_cdf: 30_000_000, regle: 'RG-008' },
    statut: 'en_examen',
  });

  alertes.push({
    code: 'RECEPTION_SANS_PRISE_EN_CHARGE', gravite: 'attention', structure_id: sgp.id,
    objet_type: 'bon_commande', objet_id: null,
    explication: 'Un procès-verbal de réception a plus de quinze jours sans certificat de prise en charge à l’inventaire. Aucun paiement ne peut être marqué possible (RG-010, RG-011).',
    donnees: { jours_ecoules: 23, delai_parametre: 15, regles: ['RG-010', 'RG-011'] },
    statut: 'ouverte',
  });

  if (enMaintenance.length > 0) {
    alertes.push({
      code: 'MAINTENANCE_SANS_RETOUR', gravite: 'attention', structure_id: enMaintenance[0].structure_id,
      objet_type: 'bien', objet_id: enMaintenance[0].id,
      explication: `Le bien ${enMaintenance[0].immatriculation ?? enMaintenance[0].designation} est en maintenance depuis plus de trente jours sans retour d’atelier.`,
      donnees: { jours_ecoules: entier(31, 90), delai_parametre: 30 },
      statut: 'justifiee',
      traite_par: logistique.id,
      suite: 'Délai justifié : la pièce de rechange est en commande à l’étranger. Échéance communiquée au service.',
    });
  }

  if (perdus.length > 0) {
    alertes.push({
      code: 'BIEN_PERDU_SANS_PV', gravite: 'critique', structure_id: perdus[0].structure_id,
      objet_type: 'bien', objet_id: perdus[0].id,
      explication: `Le bien ${perdus[0].immatriculation ?? perdus[0].designation} est déclaré perdu. Le bien reste au registre dans un état distinct (RG-015) et la suite donnée doit être tracée.`,
      donnees: { valeur_acquisition: perdus[0].valeur_acquisition, regle: 'RG-015' },
      statut: 'classee',
      traite_par: logistique.id,
      suite: 'Procès-verbal de perte établi et joint au dossier. Le bien demeure au registre à l’état « perdu ».',
    });
  }

  alertes.push({
    code: 'ETAT_BESOIN_SANS_VISA', gravite: 'information', structure_id: sgp.id,
    objet_type: 'etat_besoin', objet_id: null,
    explication: 'Quatre états de besoin attendent le visa de leur chef de structure depuis plus de sept jours.',
    donnees: { nombre: 4, delai_parametre: 7 },
    statut: 'ouverte',
  });

  alertes.push({
    code: 'ECART_INVENTAIRE', gravite: 'attention', structure_id: sgp.id,
    objet_type: 'site', objet_id: null,
    explication: 'L’inventaire physique du magasin central relève un écart sur six articles entre la quantité comptée et la quantité en comptabilité des matières.',
    donnees: { articles_en_ecart: 6, sens: 'manquant' },
    statut: 'en_examen',
  });

  for (const a of alertes) {
    const tranchee = !['ouverte', 'en_examen'].includes(a.statut);
    await bd.requete(
      `insert into alerte (code, gravite, structure_id, objet_type, objet_id,
         explication, donnees, statut, traite_par, traite_le, suite, cree_le)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        a.code, a.gravite, a.structure_id, a.objet_type, a.objet_id ?? null,
        a.explication, JSON.stringify(a.donnees), a.statut,
        tranchee ? a.traite_par : null,
        tranchee ? dateEntre(60, 2).toISOString() : null,
        tranchee ? a.suite : null,
        dateEntre(120, 1).toISOString(),
      ],
    );
  }
  return alertes.length;
}

// ---------------------------------------------------------------------------
// L'inventaire physique — décret 13/050 art. 120 et 122.
//
// Deux campagnes, pour qu'aucun écran ne soit vide et que les deux bouts du
// circuit se voient :
//   — une campagne **close sans écart** sur une petite structure : c'est à quoi
//     ressemble un inventaire qui s'est bien passé, et c'est la seule forme qui
//     prouve que RG-023 et RG-024 laissent passer quand tout est en ordre ;
//   — une campagne **en cours** sur le magasin central, avec une quinzaine de
//     constats et trois écarts aux trois stades du circuit : un constaté sans
//     explication, un expliqué qui attend qu'on tranche, un tranché en
//     régularisation. L'écran des écarts a donc une ligne par colonne.
//
// TOUT EST FICTIF. Les écarts, les explications et les motifs sont inventés.
// ---------------------------------------------------------------------------

/**
 * Un numéro de série au format du serveur : `CI-2026-00001`.
 *
 * Il **consomme** `sequence_document`, comme le fait `prochainNumero` dans
 * `server/src/routes/_numeros.js`. Un numéro posé à la main sans toucher au
 * compteur ferait que la première campagne créée par la route porterait un
 * numéro déjà pris, et l'unicité la refuserait — exactement le genre de panne
 * qu'on ne voit qu'en démonstration.
 */
async function numeroSerie(bd, prefixe, annee) {
  const ligne = await bd.un(
    `insert into sequence_document (prefixe, annee, dernier) values ($1, $2, 1)
     on conflict (prefixe, annee) do update set dernier = sequence_document.dernier + 1
     returning dernier`,
    [prefixe, annee],
  );
  return `${prefixe}-${annee}-${String(ligne.dernier).padStart(5, '0')}`;
}

/** Les biens du périmètre d'une campagne, dans l'ordre du registre. */
async function perimetreDeCampagne(bd, { structureId, siteId, dateArretee }) {
  return bd.tous(
    `select b.id, b.immatriculation, b.designation, b.quantite, b.etat,
            b.detenteur_id, b.site_id, b.classement, b.suivi
       from bien b
      where b.structure_id = $1
        and ($2::uuid is null or b.site_id = $2::uuid)
        and b.etat <> 'reforme'
        and b.date_acquisition <= $3::date
      order by b.immatriculation nulls last, b.id`,
    [structureId, siteId ?? null, dateArretee],
  );
}

/** Un agent de la structure portant ce rôle, ou le premier agent actif. */
function agentDe(agents, codeStructure, role) {
  return agents.find((a) => a.codeStructure === codeStructure && a.roles.includes(role))
    ?? agents.find((a) => a.codeStructure === codeStructure);
}

async function creerInventaires(bd, structures, sites, agents) {
  // `mouvements` et `documents` : ce que le lot ajoute aux tables du socle,
  // pour que le rapport de fin ne signale pas un faux écart de comptage.
  const comptes = { campagnes: 0, agents: 0, constats: 0, ecarts: 0, mouvements: 0, documents: 0 };

  const inserer = async (campagne) => {
    comptes.campagnes += 1;
    return bd.un(
      `insert into campagne_inventaire (numero, libelle, structure_id, site_id, date_arretee,
          statut, ouverte_le, ouverte_par, close_le, close_par, cree_par, cree_le, maj_le)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) returning *`,
      [campagne.numero, campagne.libelle, campagne.structure_id, campagne.site_id,
        campagne.date_arretee, campagne.statut, campagne.ouverte_le ?? null,
        campagne.ouverte_par ?? null, campagne.close_le ?? null, campagne.close_par ?? null,
        campagne.cree_par, campagne.cree_le],
    );
  };

  const designer = async (campagne, agent, qualite, designePar) => {
    comptes.agents += 1;
    return bd.un(
      `insert into campagne_agent (campagne_id, agent_id, structure_id, qualite, designe_le, designe_par)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [campagne.id, agent.id, campagne.structure_id, qualite, campagne.cree_le, designePar.id],
    );
  };

  const constater = async (campagne, bien, constat) => {
    comptes.constats += 1;
    return bd.un(
      `insert into constat_inventaire (campagne_id, bien_id, structure_id, resultat,
          quantite_comptee, etat_constate, detenteur_constate_id, site_constate_id,
          observation, constate_par, constate_le)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [campagne.id, bien.id, campagne.structure_id, constat.resultat,
        constat.quantite_comptee ?? null, constat.etat_constate ?? null,
        constat.detenteur_constate_id ?? null, constat.site_constate_id ?? null,
        constat.observation ?? null, constat.constate_par, constat.constate_le],
    );
  };

  const ecarter = async (campagne, constat, bien, ecart) => {
    comptes.ecarts += 1;
    return bd.un(
      `insert into ecart_inventaire (constat_id, campagne_id, bien_id, structure_id,
          nature, ecart_quantite, statut, explication, explique_par, explique_le,
          decision, motif_decision, tranche_par, tranche_le, document_id, mouvement_id, cree_le)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,
      [constat.id, campagne.id, bien.id, campagne.structure_id, ecart.nature,
        ecart.ecart_quantite ?? null, ecart.statut, ecart.explication ?? null,
        ecart.explique_par ?? null, ecart.explique_le ?? null, ecart.decision ?? null,
        ecart.motif_decision ?? null, ecart.tranche_par ?? null, ecart.tranche_le ?? null,
        ecart.document_id ?? null, ecart.mouvement_id ?? null, ecart.cree_le],
    );
  };

  // --- 1. La campagne close, sans écart : CGIG, atelier technique ---------
  const cgig = structures.parCode.get('CGIG');
  const atelier = sites.find((s) => s.structure_id === cgig.id && s.nom.includes('Atelier'));
  const comptableCgig = agentDe(agents, 'CGIG', 'comptable_matieres');
  const magasinierCgig = agentDe(agents, 'CGIG', 'magasinier');
  const chefCgig = agentDe(agents, 'CGIG', 'chef_structure');

  const arreteeClose = jour(dateEntre(300, 290));
  const close = await inserer({
    numero: await numeroSerie(bd, 'CI', new Date(arreteeClose).getFullYear()),
    libelle: `Inventaire annuel de l'atelier technique de la CGIG au ${arreteeClose}`,
    structure_id: cgig.id,
    site_id: atelier.id,
    date_arretee: arreteeClose,
    statut: 'close',
    ouverte_le: dateEntre(289, 288),
    ouverte_par: comptableCgig.id,
    close_le: dateEntre(282, 280),
    close_par: comptableCgig.id,
    cree_par: comptableCgig.id,
    cree_le: dateEntre(295, 292),
  });
  await designer(close, magasinierCgig, 'operateur', comptableCgig);
  await designer(close, chefCgig, 'detenteur', comptableCgig);
  await designer(close, comptableCgig, 'temoin', comptableCgig);

  // Tout le périmètre est constaté conforme : c'est ce qui permet à la
  // campagne d'être close (RG-023), et l'absence d'écart ce qui permet de ne
  // rien avoir à trancher (RG-024).
  const perimetreClose = await perimetreDeCampagne(bd, {
    structureId: cgig.id, siteId: atelier.id, dateArretee: arreteeClose,
  });
  for (const bien of perimetreClose) {
    await constater(close, bien, {
      resultat: 'conforme',
      quantite_comptee: bien.quantite,
      etat_constate: bien.etat,
      detenteur_constate_id: bien.detenteur_id,
      site_constate_id: bien.site_id,
      constate_par: magasinierCgig.id,
      constate_le: dateEntre(288, 283),
    });
  }

  // L'état d'inventaire, figé : la pièce que l'art. 120 fait établir.
  comptes.documents += 1;
  await bd.requete(
    `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
        signataire_id, signe_le, fige)
     values ('etat_inventaire', $1, $2, 'campagne_inventaire', $3, $4, $5, $6, true)`,
    [await numeroDocument(bd, 'INV', arreteeClose), cgig.id, String(close.id),
      JSON.stringify({
        campagne: close.numero,
        libelle: close.libelle,
        date_arretee: arreteeClose,
        structure: cgig.nom,
        site: atelier.nom,
        avancement: {
          biens_du_perimetre: perimetreClose.length,
          constates: perimetreClose.length,
          conformes: perimetreClose.length,
          ecarts: 0, introuvables: 0, restants: 0, taux: 1,
        },
        ecarts: [],
        conclusion: "Aucun écart constaté. L'atelier technique tient son registre à jour.",
        mention: "État d'inventaire établi à la date arrêtée, décret 13/050 art. 120.",
      }),
      comptableCgig.id, dateEntre(282, 280)],
  );

  // --- 2. La campagne en cours : SGP, magasin central --------------------
  const sgp = structures.parCode.get('SGP');
  const magasin = sites.find((s) => s.structure_id === sgp.id && s.nom.includes('Magasin'));
  const comptableSgp = agentDe(agents, 'SGP', 'comptable_matieres');
  const magasinierSgp = agents.find(
    (a) => a.codeStructure === 'SGP' && a.roles.includes('magasinier'),
  );
  const intendanteSgp = agentDe(agents, 'SGP', 'intendant');
  const autreAgentSgp = agents.find(
    (a) => a.codeStructure === 'SGP' && a.id !== magasinierSgp.id && a.id !== comptableSgp.id,
  );

  const arreteeEnCours = jour(dateEntre(40, 35));
  const enCours = await inserer({
    numero: await numeroSerie(bd, 'CI', new Date(arreteeEnCours).getFullYear()),
    libelle: `Inventaire du magasin central de la Primature au ${arreteeEnCours}`,
    structure_id: sgp.id,
    site_id: magasin.id,
    date_arretee: arreteeEnCours,
    statut: 'en_cours',
    ouverte_le: dateEntre(30, 28),
    ouverte_par: comptableSgp.id,
    cree_par: comptableSgp.id,
    cree_le: dateEntre(34, 32),
  });
  await designer(enCours, magasinierSgp, 'operateur', comptableSgp);
  await designer(enCours, intendanteSgp, 'detenteur', comptableSgp);
  await designer(enCours, comptableSgp, 'temoin', comptableSgp);

  const perimetreEnCours = await perimetreDeCampagne(bd, {
    structureId: sgp.id, siteId: magasin.id, dateArretee: arreteeEnCours,
  });

  // Trois écarts, aux trois stades du circuit. Les biens sont pris en tête du
  // périmètre pour que le jeu soit reproductible d'une exécution à l'autre.
  const [pourEtat, pourDetenteur, pourQuantite, ...conformes] = perimetreEnCours;

  // a) Un écart d'état, **constaté sans explication** : l'écran doit montrer
  //    une ligne sur laquelle personne n'a encore rien dit.
  const etatAutre = pourEtat.etat === 'hors_service' ? 'a_reparer' : 'hors_service';
  const constatEtat = await constater(enCours, pourEtat, {
    resultat: 'ecart',
    quantite_comptee: pourEtat.quantite,
    etat_constate: etatAutre,
    detenteur_constate_id: pourEtat.detenteur_id,
    site_constate_id: pourEtat.site_id,
    observation: `Carter fendu et alimentation absente ; la fiche porte « ${pourEtat.etat} ».`,
    constate_par: magasinierSgp.id,
    constate_le: dateEntre(20, 18),
  });
  await ecarter(enCours, constatEtat, pourEtat, {
    nature: 'etat',
    statut: 'constate',
    cree_le: dateEntre(20, 18),
  });

  // b) Un écart de détenteur, **expliqué**, qui attend qu'on tranche.
  const constatDetenteur = await constater(enCours, pourDetenteur, {
    resultat: 'ecart',
    quantite_comptee: pourDetenteur.quantite,
    etat_constate: pourDetenteur.etat,
    detenteur_constate_id: autreAgentSgp.id,
    site_constate_id: pourDetenteur.site_id,
    observation: `Matériel trouvé en service chez ${autreAgentSgp.nom}, sans acte de transfert.`,
    constate_par: magasinierSgp.id,
    constate_le: dateEntre(19, 17),
  });
  await ecarter(enCours, constatDetenteur, pourDetenteur, {
    nature: 'detenteur',
    statut: 'explique',
    explication:
      `Le matériel a été prêté en urgence pour une mission de terrain, avec l'accord verbal de l'intendance. Aucun acte n'a été établi.`,
    explique_par: intendanteSgp.id,
    explique_le: dateEntre(14, 12),
    cree_le: dateEntre(19, 17),
  });

  // c) Un écart de quantité, **tranché en régularisation** : la fiche a été
  //    alignée sur le comptage, et le mouvement d'entrée jamais inscrit l'a
  //    été. Qui a constaté n'a pas tranché (RG-026) : le magasinier a compté,
  //    la comptable des matières a décidé.
  const compte = Number(pourQuantite.quantite) + 2;
  const constatQuantite = await constater(enCours, pourQuantite, {
    resultat: 'ecart',
    quantite_comptee: compte,
    etat_constate: pourQuantite.etat,
    detenteur_constate_id: pourQuantite.detenteur_id,
    site_constate_id: pourQuantite.site_id,
    observation: `Deux unités de plus que la fiche : comptage contradictoire fait deux fois.`,
    constate_par: magasinierSgp.id,
    constate_le: dateEntre(18, 16),
  });
  comptes.mouvements += 1;
  const mouvementRegularise = await bd.un(
    `insert into mouvement (bien_id, structure_id, type, quantite, date,
        structure_source_code, motif, agent_id, cree_le)
     values ($1, $2, 'entree', 2, $3, 'SGP', $4, $5, $6) returning id`,
    [pourQuantite.id, sgp.id, jour(dateEntre(10, 9)),
      `Régularisation d'inventaire ${enCours.numero} — écart de quantite — Deux unités reçues en 2026 sans bon d'entrée ; la pièce a été retrouvée au magasin.`,
      comptableSgp.id, dateEntre(10, 9)],
  );
  await bd.requete(
    'update bien set quantite = $2, maj_le = now() where id = $1',
    [pourQuantite.id, compte],
  );
  await ecarter(enCours, constatQuantite, pourQuantite, {
    nature: 'quantite',
    ecart_quantite: 2,
    statut: 'tranche',
    explication:
      "Deux unités reçues en fin d'exercice ont été rangées au magasin sans que le bon d'entrée soit saisi.",
    explique_par: intendanteSgp.id,
    explique_le: dateEntre(13, 11),
    decision: 'regularisation',
    motif_decision:
      "Les deux unités sont physiquement présentes et leur origine est établie : la fiche est alignée sur le comptage et l'entrée est inscrite au registre.",
    tranche_par: comptableSgp.id,
    tranche_le: dateEntre(10, 9),
    mouvement_id: mouvementRegularise.id,
    cree_le: dateEntre(18, 16),
  });

  // Douze constats conformes : la campagne est engagée sans être finie, donc
  // RG-023 refuse encore sa clôture — et l'écran le dit, motif compris.
  for (const bien of conformes.slice(0, 12)) {
    await constater(enCours, bien, {
      resultat: 'conforme',
      quantite_comptee: bien.quantite,
      etat_constate: bien.etat,
      detenteur_constate_id: bien.detenteur_id,
      site_constate_id: bien.site_id,
      constate_par: magasinierSgp.id,
      constate_le: dateEntre(22, 8),
    });
  }

  return comptes;
}

// ---------------------------------------------------------------------------
// Le rapprochement contradictoire — décret 13/050 art. 123.
//
// Deux rapprochements, pour que les deux états du contradictoire se voient :
//   — un **ouvert**, avec ses postes et **une seule** partie attestante : c'est
//     là qu'on voit RG-027 mordre, et l'écran affiche son bouton de clôture
//     grisé avec son motif ;
//   — un **clos**, attesté des deux côtés, l'un avec réserve : une réserve
//     n'empêche pas d'attester, elle est ce que le contradictoire conserve.
//
// `valeur_matieres` est calculée depuis le registre, comme le fait la route.
// `valeur_generale` est inventée : la comptabilité générale n'est pas
// interfacée, et ces chiffres ne sortent d'aucun système réel.
// ---------------------------------------------------------------------------

async function creerRapprochements(bd, structures, agents) {
  const comptes = { rapprochements: 0, postes: 0, parties: 0 };

  /** La valeur du poste en comptabilité des matières, comme la calcule la route. */
  const valeurMatieres = async (structureId, categorieCode, periodeFin) => {
    const ligne = await bd.un(
      `with recursive famille as (
          select code from categorie where code = $2
          union all
          select c.code from categorie c join famille f on c.parent_code = f.code
        )
        select coalesce(sum(b.valeur_acquisition), 0) as valeur
          from bien b
         where b.structure_id = $1
           and b.categorie_code in (select code from famille)
           and b.etat <> 'reforme'
           and b.date_acquisition <= $3::date`,
      [structureId, categorieCode, periodeFin],
    );
    return Number(ligne.valeur);
  };

  const ouvrir = async (r) => {
    comptes.rapprochements += 1;
    return bd.un(
      `insert into rapprochement (numero, structure_id, periode_debut, periode_fin, statut,
          conclusion, clos_le, clos_par, cree_par, cree_le)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [r.numero, r.structure_id, r.periode_debut, r.periode_fin, r.statut,
        r.conclusion ?? null, r.clos_le ?? null, r.clos_par ?? null, r.cree_par, r.cree_le],
    );
  };

  /**
   * Pose un poste. `pourcentage` est la valeur en comptabilité **générale**
   * exprimée en pourcentage de la valeur en comptabilité des matières : c'est
   * ainsi qu'on fabrique un écart plausible sans inventer un montant de toutes
   * pièces. `null` laisse la colonne vide — la comptabilité générale n'a pas
   * encore communiqué ce poste.
   */
  const poser = async (r, categorieCode, pourcentage, explication) => {
    comptes.postes += 1;
    const matieres = await valeurMatieres(r.structure_id, categorieCode, r.periode_fin);
    const generale = pourcentage === null
      ? null
      : Math.round(matieres * pourcentage / 10_000) * 100;
    return bd.un(
      `insert into rapprochement_poste (rapprochement_id, structure_id, categorie_code,
          valeur_matieres, valeur_generale, explication)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [r.id, r.structure_id, categorieCode, matieres, generale, explication ?? null],
    );
  };

  const partie = async (r, agent, qualite, atteste, reserve) => {
    comptes.parties += 1;
    return bd.un(
      `insert into rapprochement_partie (rapprochement_id, structure_id, agent_id, qualite,
          atteste_le, reserve)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [r.id, r.structure_id, agent.id, qualite, atteste ?? null, reserve ?? null],
    );
  };

  const sgp = structures.parCode.get('SGP');
  const cgig = structures.parCode.get('CGIG');
  const comptableSgp = agentDe(agents, 'SGP', 'comptable_matieres');
  const comptableCgig = agentDe(agents, 'CGIG', 'comptable_matieres');
  // Le comptable général n'est pas un agent de la structure : il est mis à
  // disposition par le ministère du Budget ou des Finances, et sa comptabilité
  // est celle de l'État. C'est pourquoi la même personne figure des deux côtés.
  const comptablePublic = agentDe(agents, 'SGP', 'comptable_public');

  // --- 1. Ouvert, attesté d'un seul côté : RG-027 mord -------------------
  const ouvert = await ouvrir({
    numero: await numeroSerie(bd, 'RAP', 2026),
    structure_id: sgp.id,
    periode_debut: '2026-07-01',
    periode_fin: '2026-09-30',
    statut: 'ouvert',
    cree_par: comptableSgp.id,
    cree_le: dateEntre(50, 45),
  });
  // Deux postes confrontés, et un troisième encore muet du côté de la
  // comptabilité générale : le rapprochement n'a pas fini de constater.
  await poser(ouvert, 'INF', 94, 'Écart de 6 % : trois unités prises en charge après la clôture du trimestre.');
  await poser(ouvert, 'MOB', 101, 'Écart de 1 % : arrondi de valorisation sur un lot de sièges.');
  await poser(ouvert, 'CHA', null, "La comptabilité générale n'a pas encore communiqué la valeur du charroi.");
  await partie(ouvert, comptableSgp, 'comptable_matieres', dateEntre(40, 38), null);
  await partie(ouvert, comptablePublic, 'comptable_general', null, null);

  // --- 2. Clos, attesté des deux côtés, dont un avec réserve ------------
  const clos = await ouvrir({
    numero: await numeroSerie(bd, 'RAP', 2026),
    structure_id: cgig.id,
    periode_debut: '2026-04-01',
    periode_fin: '2026-06-30',
    statut: 'clos',
    conclusion:
      "Écart résiduel de moins de 2 %, expliqué par deux prises en charge tardives. Le rapprochement est arrêté sous la réserve portée par le comptable général.",
    clos_le: dateEntre(70, 68),
    clos_par: comptableCgig.id,
    cree_par: comptableCgig.id,
    cree_le: dateEntre(100, 95),
  });
  await poser(clos, 'TEC', 98, 'Deux groupes électrogènes pris en charge le 2 juillet, hors période.');
  await poser(clos, 'MOB', 100, 'Les deux comptabilités concordent.');
  await partie(clos, comptableCgig, 'comptable_matieres', dateEntre(80, 78), null);
  await partie(clos, comptablePublic, 'comptable_general', dateEntre(75, 73),
    'Sous réserve de la valorisation des aménagements intérieurs, en cours de reprise.');

  return comptes;
}

// ---------------------------------------------------------------------------
// Le journal — quelques actions sensibles déjà tracées, pour que l'écran du
// contrôle externe ne soit pas vide. Insertion seule (contrat §1, règle 2).
// ---------------------------------------------------------------------------

/**
 * L'historique de consommation des stocks — ce qui manquait.
 *
 * Les jours de couverture, la date de rupture prévisible et la proposition de
 * seuil se calculent tous à partir de la **consommation constatée**, lue dans
 * le journal : c'est lui qui garde chaque sortie avec ses valeurs avant et
 * après (RG-020), et aucune table parallèle n'est nécessaire. Mais le jeu de
 * démonstration ne posait aucune sortie : `consommation_jour` valait 0 sur
 * toute la ligne, donc ni couverture, ni rupture, ni seuil proposé — et c'est
 * le magasinier, celui qui ouvre cet écran et règle les seuils, qui se
 * retrouvait devant des colonnes vides.
 *
 * On pose donc une consommation plausible sur la fenêtre de 90 jours que lit
 * `GET /api/stocks` : deux à sept sorties par article, d'un volume tiré de sa
 * quantité, chacune horodatée dans la fenêtre. Les quantités de `stock` ne sont
 * pas retouchées — ce sont elles que la démonstration a choisies.
 *
 * L'agent porté est un magasinier ou un comptable des matières **de la
 * structure de l'article** quand il en existe un : le journal est une preuve,
 * et une sortie signée par quelqu'un d'une autre structure n'en serait pas une.
 */
// ---------------------------------------------------------------------------
// Le circuit de réforme et l'offre de réemploi — lot « réforme ».
//
// CE QUE CE JEU DOIT MONTRER, ET POURQUOI IL EST FAIT AINSI.
//
// Un dossier à chaque stade, pour que l'écran de la réforme ne soit jamais vide
// et que les sept étapes se voient toutes au moins une fois. Et surtout : **au
// moins trois offres ouvertes, venant de trois structures différentes** — la
// CGIG, le Secrétariat général à la Primature et le Secrétariat général du
// Gouvernement. L'écran du réemploi n'a d'intérêt que si un chef de structure y
// trouve des biens offerts *par les autres* ; avec une seule offre, le profil de
// démonstration qui se trouverait être celui de la structure d'origine verrait
// une page vide et le lot paraîtrait manqué.
//
// La commission mêle des agents de la structure et l'intendante générale du
// SGP : avec un quorum de trois membres, les petites cellules ne peuvent pas le
// réunir autrement, et `membre_commission` l'autorise exprès (voir la migration
// 20261127080000). RG-030 est tenue partout : le proposant ne siège jamais.
//
// TOUT EST FICTIF. Aucune donnée réelle de la Primature.
// ---------------------------------------------------------------------------

// --- Les motifs et les avis, accordés au bien -------------------------------
//
// POURQUOI CE TABLEAU EXISTE. Les premiers motifs de ce jeu étaient tirés d'une
// liste indépendante de celle des biens, et cela donnait « Climatiseur noyé
// lors des pluies de novembre » sur un ordinateur portable, ou « Mobilier
// démodé mais solide » dans l'avis d'une commission réunie sur un véhicule
// tout-terrain. Ce n'est pas un défaut de code, et c'est pourtant ce qu'un
// testeur voit en premier : il cesse alors de croire les données, et tout
// l'écran perd son crédit. Le motif se choisit donc d'après `categorie_code`,
// et les avis avec lui.
//
// Trois tons, parce que le circuit a trois issues à montrer :
//   `irreparable` le bien est hors d'usage — le dossier ira jusqu'aux domaines ;
//   `remplace`    il sert encore, mais plus ici — c'est celui qu'on offre ;
//   `commodite`   il gêne sans être hors d'usage — la commission refuse.
//
// Chaque ton porte trois avis, dans l'ordre où la commission les rend, et une
// `reserve` : l'avis défavorable du membre qui n'a pas suivi la majorité. Une
// délibération unanime sur chaque dossier ne ressemblerait pas à une
// commission.

/** La famille d'un bien, d'après son code de catégorie. */
function familleDuBien(codeCategorie) {
  const code = String(codeCategorie ?? '');
  if (code.startsWith('CHA')) return 'charroi';
  // Les deux sous-familles qui ne parlent pas comme leur parent.
  if (code.startsWith('INF-IMP')) return 'imprimerie';
  if (code.startsWith('INF')) return 'informatique';
  if (code.startsWith('MOB-CLI')) return 'climatisation';
  if (code.startsWith('MOB')) return 'mobilier';
  if (code.startsWith('TEC')) return 'technique';
  return 'divers';
}

const DISCOURS = {
  charroi: {
    irreparable: {
      motif: "Châssis déformé après un accident ; l'expertise de l'atelier est défavorable à la remise en circulation.",
      avis: [
        "Véhicule examiné à l'atelier : le châssis est déformé et la géométrie ne se reprend pas.",
        'La remise en circulation serait dangereuse pour le conducteur comme pour les passagers.',
        "Avis favorable à la réforme, sous réserve que le véhicule soit d'abord offert aux autres structures.",
      ],
      reserve: 'Avis défavorable : une seconde expertise serait prudente avant de sortir ce véhicule du parc.',
    },
    remplace: {
      motif: 'Véhicule remplacé par un modèle de la dotation nouvelle ; celui-ci roule encore et son entretien est à jour.',
      avis: [
        'Véhicule en état de marche, entretien suivi au carnet.',
        'Il ne correspond plus aux missions du service, mais il peut servir ailleurs.',
        "Avis favorable, à condition de l'offrir au réemploi avant toute saisine.",
      ],
      reserve: 'Avis défavorable : le parc du service est déjà juste, ce véhicule pourrait y rester une saison de plus.',
    },
    commodite: {
      motif: 'Véhicule encombrant au parking et peu utilisé ; proposé à la réforme pour libérer une place.',
      avis: [
        "Le véhicule roule et passe le contrôle technique : l'encombrement n'est pas un motif de réforme.",
        'Aucun remplacement n’est prévu au charroi ; le réformer créerait un manque.',
        'Avis favorable par commodité de stationnement, ce qui ne suffit pas à fonder une réforme.',
      ],
      reserve: 'Avis défavorable : le véhicule est en état de rouler.',
    },
  },
  informatique: {
    irreparable: {
      motif: "Carte mère hors d'usage après une surtension ; le réparateur annonce quatre mois de délai sur les pièces.",
      avis: [
        "Appareil ouvert et testé : l'alimentation et la carte mère sont touchées.",
        "Le coût de la réparation dépasse celui d'un appareil neuf de même capacité.",
        "Avis favorable à la réforme, le matériel ayant dépassé sa durée d'amortissement.",
      ],
      reserve: 'Avis défavorable : le disque pourrait être récupéré et remonté sur un autre poste.',
    },
    remplace: {
      motif: "Poste remplacé lors du renouvellement du parc ; il fonctionne et sa mémoire a été augmentée l'an dernier.",
      avis: [
        'Appareil fonctionnel : démarrage, écran et périphériques vérifiés.',
        "Il est en deçà des besoins de ce service, pas de ceux d'un poste de saisie.",
        'Avis favorable, à offrir au réemploi : plusieurs cellules travaillent sur du matériel plus ancien.',
      ],
      reserve: 'Avis défavorable : cet appareil peut encore tenir le rôle de poste de secours ici.',
    },
    commodite: {
      motif: 'Appareil lent et bruyant ; proposé à la réforme pour dégager le bureau.',
      avis: [
        'La lenteur vient du disque, qui se remplace pour une somme modique.',
        "L'appareil fonctionne et aucun remplacement n'est budgété.",
        'Avis favorable pour le confort du poste, ce qui n’est pas un motif de réforme.',
      ],
      reserve: 'Avis défavorable : le matériel est réparable à peu de frais.',
    },
  },
  imprimerie: {
    irreparable: {
      motif: "Bloc d'impression hors service ; les consommables du modèle ne sont plus distribués sur le marché local.",
      avis: [
        "Mécanisme d'entraînement cassé, pièces introuvables chez le fournisseur.",
        'Appareil immobilisé depuis six mois ; les tirages sont faits dans un autre service.',
        'Avis favorable à la réforme.',
      ],
      reserve: 'Avis défavorable : un atelier spécialisé pourrait encore tenter la réparation.',
    },
    remplace: {
      motif: "Photocopieur de forte capacité remplacé par un contrat de location ; l'appareil fonctionne et son compteur est bas.",
      avis: [
        'Appareil en service jusqu’au changement de contrat, sans panne signalée.',
        'Son volume dépasse nos besoins ; il reste utile à un service plus sollicité.',
        "Avis favorable, à condition de l'offrir au réemploi.",
      ],
      reserve: "Avis défavorable : le contrat de location n'est pas encore signé, et cet appareil assure l'intérim.",
    },
    commodite: {
      motif: 'Imprimante encombrante dans un bureau partagé ; proposée à la réforme faute de place.',
      avis: [
        "L'appareil imprime et ses consommables sont en stock.",
        'Le manque de place se règle par un déplacement, pas par une réforme.',
        'Avis favorable pour l’aménagement du bureau, ce qui ne fonde pas une réforme.',
      ],
      reserve: 'Avis défavorable : l’appareil est en état de marche.',
    },
  },
  mobilier: {
    irreparable: {
      motif: "Piétement rompu et plateau fendu après un dégât d'eau ; l'ensemble ne se répare pas.",
      avis: [
        'Bois gonflé et délité : le plateau ne tient plus la charge.',
        'Une réparation coûterait davantage que le remplacement du meuble.',
        'Avis favorable à la réforme.',
      ],
      reserve: 'Avis défavorable : la quincaillerie mériterait d’être récupérée avant la sortie.',
    },
    remplace: {
      motif: 'Mobilier déclassé lors du réaménagement du troisième niveau ; en état correct, sans dégradation structurelle.',
      avis: [
        'Mobilier démodé mais solide, sans dégradation structurelle.',
        "Le réaménagement l'a rendu inutile ici, pas inutilisable.",
        'À offrir avant toute saisine : plusieurs cellules en manquent.',
      ],
      reserve: "Avis défavorable : le réaménagement n'est pas terminé, et ce mobilier sert encore aux agents déplacés.",
    },
    commodite: {
      motif: "Mobilier démodé ; proposé à la réforme pour harmoniser l'ameublement du service.",
      avis: [
        'Le meuble est en état et ne gêne aucun usage.',
        "L'harmonisation de l'ameublement n'est pas un motif de sortie du patrimoine.",
        'Avis favorable par souci de cohérence visuelle, ce qui ne suffit pas.',
      ],
      reserve: 'Avis défavorable : le mobilier est utilisable tel quel.',
    },
  },
  climatisation: {
    irreparable: {
      motif: 'Circuit électrique entièrement corrodé après les pluies ; aucun réparateur ne garantit le résultat.',
      avis: [
        'Corrosion généralisée du tableau de commande et du compresseur.',
        "Appareil irrécupérable : l'eau a séjourné plusieurs jours dans le caisson.",
        'Avis favorable à la réforme.',
      ],
      reserve: 'Avis défavorable : le caisson extérieur pourrait être conservé en pièce de rechange.',
    },
    remplace: {
      motif: 'Climatiseur remplacé par un appareil de plus forte puissance ; celui-ci refroidit encore correctement.',
      avis: [
        'Appareil testé : il refroidit et le compresseur est silencieux.',
        'Sa puissance ne couvre plus le volume de la salle, mais conviendrait à un bureau.',
        'Avis favorable, à offrir au réemploi en priorité.',
      ],
      reserve: 'Avis défavorable : il peut rester en appoint dans la salle voisine.',
    },
    commodite: {
      motif: 'Appareil bruyant ; proposé à la réforme pour le confort du bureau.',
      avis: [
        'Le bruit vient du ventilateur, qui se remplace pour une somme modique.',
        "L'appareil refroidit et aucun remplacement n'est budgété.",
        'Avis favorable pour le confort acoustique, ce qui ne fonde pas une réforme.',
      ],
      reserve: 'Avis défavorable : l’appareil fonctionne.',
    },
  },
  technique: {
    irreparable: {
      motif: "Matériel noyé lors des pluies ; alternateur et tableau de commande hors d'usage.",
      avis: [
        'Alternateur grillé et tableau de commande corrodé.',
        'La remise en service demanderait de tout remplacer sauf le châssis.',
        'Avis favorable à la réforme.',
      ],
      reserve: 'Avis défavorable : le châssis et le réservoir sont intacts et pourraient servir.',
    },
    remplace: {
      motif: 'Matériel de secours remplacé par un modèle de plus forte puissance ; celui-ci démarre et tient la charge.',
      avis: [
        'Essai de charge concluant : le matériel démarre et tient deux heures.',
        'Il ne couvre plus les besoins du site, mais conviendrait à une installation plus modeste.',
        'Matériel entretenu, à proposer en priorité aux autres structures.',
      ],
      reserve: 'Avis défavorable : il pourrait rester en second secours sur ce site.',
    },
    commodite: {
      motif: 'Matériel peu utilisé et encombrant dans le local technique ; proposé à la réforme.',
      avis: [
        'Le matériel est en état et a été entretenu cette année.',
        "L'encombrement du local ne justifie pas une sortie du patrimoine.",
        'Avis favorable pour dégager le local, ce qui n’est pas un motif de réforme.',
      ],
      reserve: 'Avis défavorable : le matériel sert encore ponctuellement.',
    },
  },
  divers: {
    irreparable: {
      motif: 'Matériel en panne répétée ; trois interventions en six mois sans résultat durable.',
      avis: [
        'Pannes répétées malgré trois interventions de l’atelier.',
        'Le coût cumulé des réparations dépasse la valeur résiduelle du bien.',
        'Avis favorable à la réforme.',
      ],
      reserve: 'Avis défavorable : une dernière intervention mériterait d’être tentée.',
    },
    remplace: {
      motif: 'Matériel devenu inutile au service après réorganisation ; il est en état de fonctionner.',
      avis: [
        'Matériel vérifié : il fonctionne et son entretien est à jour.',
        'La réorganisation l’a rendu inutile ici, pas inutilisable.',
        'Avis favorable, à offrir au réemploi avant toute saisine.',
      ],
      reserve: 'Avis défavorable : le service pourrait encore en avoir besoin.',
    },
    commodite: {
      motif: 'Matériel encombrant mais en état ; proposé à la réforme pour libérer de la place.',
      avis: [
        'Le bien est en état et ne présente aucune avarie.',
        'Le manque de place ne justifie pas une sortie du patrimoine.',
        'Avis favorable par commodité de rangement, ce qui n’est pas un motif de réforme.',
      ],
      reserve: 'Avis défavorable : le bien est utilisable.',
    },
  },
};

/** Le motif et les avis qui conviennent à ce bien, pour ce ton. */
function discours(bien, ton) {
  return DISCOURS[familleDuBien(bien?.categorie_code)][ton];
}

/** Les trois avis d'une délibération, dont le dernier peut être une réserve. */
function avisDe(bien, ton, { avecReserve = false } = {}) {
  const d = discours(bien, ton);
  return avecReserve ? [d.avis[0], d.avis[1], d.reserve] : d.avis;
}

// Ce qu'une structure écrit quand elle demande le bien au réemploi. Deux
// formulations par famille, pour que deux demandeuses sur la même offre ne
// disent pas la même phrase.
const BESOINS = {
  charroi: [
    'Notre service partage un seul véhicule pour trois missions de terrain par semaine.',
    'Aucun véhicule affecté à la cellule : les déplacements se font par taxi.',
  ],
  informatique: [
    'Deux agents se relaient sur le même poste depuis la rentrée.',
    'Trois postes à équiper avant l’arrivée des nouveaux chargés de suivi.',
  ],
  imprimerie: [
    'Aucune imprimante de service à la cellule ; les tirages sont faits au Secrétariat général.',
    'Notre appareil est en panne depuis deux mois et les dossiers partent en retard.',
  ],
  mobilier: [
    'Les agents travaillent sur des tables d’appoint depuis l’ouverture des bureaux.',
    'Deux postes de travail à meubler dans le bureau du fond.',
  ],
  climatisation: [
    'La salle de réunion n’a aucune climatisation et devient inutilisable l’après-midi.',
    'Notre appareil ne refroidit plus la salle des archives, où l’humidité abîme les dossiers.',
  ],
  technique: [
    'Notre aile n’a aucun secours électrique ; ce matériel conviendrait à la salle des serveurs.',
    'Les coupures interrompent les traitements de données chaque semaine.',
  ],
  divers: [
    'Besoin établi et inscrit à notre état de besoin du trimestre, resté sans réponse.',
    'Ce matériel comblerait un manque que nous signalons depuis deux exercices.',
  ],
};

/** Le motif d'une demande de réemploi, accordé au bien offert. */
function besoinDe(bien, rang = 0) {
  const liste = BESOINS[familleDuBien(bien?.categorie_code)];
  return liste[rang % liste.length];
}

async function creerReformes(bd, structures, sites, agents) {
  const comptes = {
    dossiers: 0, membres: 0, avis: 0, offres: 0, demandes: 0, mouvements: 0, documents: 0,
  };
  const pris = new Set();

  const nomSite = (id) => sites.find((s) => String(s.id) === String(id))?.nom ?? null;
  const intendante = agentDe(agents, 'SGP', 'intendant');
  const logistique = agents.find((a) => a.roles.includes('logistique'));

  /**
   * Un bien encore libre de la structure, dans l'un des états demandés.
   *
   * Le repli sur les états « en service » n'est pas une facilité : les petites
   * cellules du jeu de démonstration n'ont parfois aucun matériel hors service,
   * et un dossier manquant ferait croire à l'écran qu'une étape du circuit n'a
   * pas été écrite. On ne touche jamais aux biens déjà réformés ou perdus : eux
   * sont sortis du service, et un dossier posé dessus serait faux.
   */
  const choisirBien = async (structure, etats, famille = null) => {
    const lignes = await bd.tous(
      `select b.id, b.immatriculation, b.designation, b.categorie_code, b.etat, b.quantite,
              b.structure_id, b.site_id, b.detenteur_id, b.valeur_acquisition, b.date_acquisition
         from bien b
        where b.structure_id = $1 and b.suivi = 'individuel'
          and b.etat not in ('reforme', 'perdu')
        order by (b.etat = any($2)) desc, b.immatriculation`,
      [structure.id, etats],
    );
    const libres = lignes.filter((b) => !pris.has(String(b.id)));
    // La famille demandée d'abord. Sans cette préférence, le tri par
    // immatriculation — qui commence par le code de catégorie — ramenait le
    // charroi à chaque fois, et les dix dossiers de démonstration parlaient
    // tous de véhicules. Un jeu monotone se remarque autant qu'un jeu faux.
    const choisi = (famille ? libres.find((b) => familleDuBien(b.categorie_code) === famille) : null)
      ?? libres[0]
      ?? null;
    if (choisi) pris.add(String(choisi.id));
    return choisi;
  };

  const poserDossier = async (champs) => {
    comptes.dossiers += 1;
    return bd.un(
      `insert into dossier_reforme (numero, bien_id, structure_id, propose_par,
           motif_proposition, statut, avis_rendu_le, offert_le, reemploye_le, saisi_le,
           pv_document_id, decision_autorite, decision_reference, decision_date,
           decision_suite, close_le, cree_le, maj_le)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
       returning *`,
      [
        champs.numero, champs.bien_id, champs.structure_id, champs.propose_par,
        champs.motif_proposition, champs.statut, champs.avis_rendu_le ?? null,
        champs.offert_le ?? null, champs.reemploye_le ?? null, champs.saisi_le ?? null,
        champs.pv_document_id ?? null, champs.decision_autorite ?? null,
        champs.decision_reference ?? null, champs.decision_date ?? null,
        champs.decision_suite ?? null, champs.close_le ?? null, champs.cree_le,
      ],
    );
  };

  /** Trois membres : deux de la structure, hors proposant, plus l'intendante. */
  const commissionDe = (codeStructure, proposant) => {
    const locaux = agents.filter(
      (a) => a.codeStructure === codeStructure
        && String(a.id) !== String(proposant.id)
        && !a.roles.includes('controle_externe')
        && !a.roles.includes('admin'),
    );
    const retenus = [...locaux.slice(0, 2)];
    // Les renforts du niveau central. Une cellule d'un seul agent ne peut pas
    // réunir trois membres sans eux, et `membre_commission` autorise exprès un
    // membre d'une autre structure.
    const renforts = [
      intendante, logistique,
      agentDe(agents, 'SGP', 'comptable_matieres'),
      agentDe(agents, 'CAB', 'chef_structure'),
    ];
    for (const renfort of renforts) {
      if (retenus.length >= 3) break;
      if (renfort && !retenus.some((a) => String(a.id) === String(renfort.id))
          && String(renfort.id) !== String(proposant.id)) {
        retenus.push(renfort);
      }
    }
    return retenus.slice(0, 3).map((agent, index) => ({
      agent,
      qualite: ['president', 'rapporteur', 'membre'][index] ?? 'membre',
    }));
  };

  const poserCommission = async (dossier, composition, date) => {
    for (const { agent, qualite } of composition) {
      comptes.membres += 1;
      await bd.requete(
        `insert into membre_commission (dossier_id, structure_id, agent_id, qualite, designe_le)
         values ($1, $2, $3, $4, $5)`,
        [dossier.id, dossier.structure_id, agent.id, qualite, date],
      );
    }
  };

  const poserAvis = async (dossier, composition, sens, motifs, date) => {
    for (const [index, { agent }] of composition.entries()) {
      if (index >= sens.length) break;
      comptes.avis += 1;
      await bd.requete(
        `insert into avis_commission (dossier_id, structure_id, agent_id, avis, motif, rendu_le)
         values ($1, $2, $3, $4, $5, $6)`,
        [dossier.id, dossier.structure_id, agent.id, sens[index],
          motifs[index] ?? motifs[motifs.length - 1], date],
      );
    }
  };

  const poserOffre = async (dossier, bien, structure, champs) => {
    comptes.offres += 1;
    return bd.un(
      `insert into offre_reemploi (numero, dossier_id, structure_id, site_origine_id,
           bien_immatriculation, bien_designation, bien_categorie_code, bien_etat,
           structure_origine_code, structure_origine_nom, site_origine_nom,
           ouverte_le, close_le, cloture_prevue_le, duree_jours, statut,
           ouverte_par, close_par)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       returning *`,
      [
        champs.numero, dossier.id, structure.id, bien.site_id ?? null,
        bien.immatriculation, bien.designation, bien.categorie_code, bien.etat,
        structure.code, structure.nom, nomSite(bien.site_id),
        champs.ouverte_le, champs.close_le ?? null, champs.cloture_prevue_le,
        champs.duree_jours, champs.statut, logistique.id, champs.close_par ?? null,
      ],
    );
  };

  const poserDemande = async (offre, structureDemandeuse, champs) => {
    comptes.demandes += 1;
    return bd.un(
      `insert into demande_reemploi (offre_id, structure_id, structure_demandeuse_id,
           demande_par, motif, statut, motif_decision, tranchee_le, tranchee_par, cree_le)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [
        offre.id, offre.structure_id, structureDemandeuse.id, champs.demande_par,
        champs.motif, champs.statut, champs.motif_decision ?? null,
        champs.tranchee_le ?? null, champs.tranchee_par ?? null, champs.cree_le,
      ],
    );
  };

  /** Le procès-verbal de réforme, figé (RG-019). */
  const poserPv = async (dossier, bien, structure, { date, offre, composition, avis }) => {
    comptes.documents += 1;
    return bd.un(
      `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
           signataire_id, signe_le, fige, cree_le)
       values ('pv_reforme', $1, $2, 'dossier_reforme', $3, $4, $5, $6, true, $6)
       returning id, numero`,
      [
        await numeroDocument(bd, 'PVR', date), structure.id, String(dossier.id),
        JSON.stringify({
          dossier: dossier.numero,
          immatriculation: bien.immatriculation,
          designation: bien.designation,
          etat: bien.etat,
          valeur_acquisition: bien.valeur_acquisition,
          date_acquisition: bien.date_acquisition,
          structure: structure.nom,
          site: nomSite(bien.site_id),
          motif_proposition: dossier.motif_proposition,
          commission: composition.map((m) => ({ qualite: m.qualite })),
          avis,
          offre_reemploi: offre ? { numero: offre.numero, close_le: offre.close_le } : null,
          mention: "Le SIGL instruit et produit le procès-verbal ; la cession et la mise au rebut relèvent de l'administration en charge des domaines privés et publics de l'État (décret 13/050), qui décide seule de la suite.",
        }),
        logistique.id, date,
      ],
    );
  };

  const cgig = structures.parCode.get('CGIG');
  const sgp = structures.parCode.get('SGP');
  const sgg = structures.parCode.get('SGG');
  const caid = structures.parCode.get('CAID');
  const du = structures.parCode.get('DU');

  const annee = (date) => new Date(date).getFullYear();
  const ETATS_REFORMABLES = ['hors_service', 'a_reparer'];

  // --- 1. Un dossier proposé, dont la commission n'a pas fini -------------
  {
    const structure = cgig;
    const bien = await choisirBien(structure, ETATS_REFORMABLES, 'informatique');
    const proposant = agentDe(agents, 'CGIG', 'magasinier');
    const creeLe = dateEntre(12, 9);
    const dossier = await poserDossier({
      numero: await numeroSerie(bd, 'DR', annee(creeLe)),
      bien_id: bien.id,
      structure_id: structure.id,
      propose_par: proposant.id,
      motif_proposition: discours(bien, 'irreparable').motif,
      statut: 'propose',
      cree_le: creeLe.toISOString(),
    });
    const composition = commissionDe('CGIG', proposant);
    await poserCommission(dossier, composition, dateEntre(8, 7).toISOString());
    // Un seul avis sur trois : la commission n'a pas conclu, et l'écran doit
    // afficher « 1 avis sur 3 » sans rien décider de lui-même.
    await poserAvis(dossier, composition, ['favorable'],
      avisDe(bien, 'irreparable').slice(0, 1),
      dateEntre(6, 5).toISOString());
  }

  // --- 2. Un dossier rejeté : le bien reste en service --------------------
  {
    const structure = caid;
    const bien = await choisirBien(structure, ETATS_REFORMABLES, 'mobilier');
    const proposant = agentDe(agents, 'CAID', 'demandeur') ?? agentDe(agents, 'CAID', 'chef_structure');
    const creeLe = dateEntre(70, 65);
    const dossier = await poserDossier({
      numero: await numeroSerie(bd, 'DR', annee(creeLe)),
      bien_id: bien.id,
      structure_id: structure.id,
      propose_par: proposant.id,
      // Le ton « commodité » : le bien gêne sans être hors d'usage, et la
      // commission le dit. Les deux premiers avis sont défavorables, le
      // troisième favorable mais mal fondé — c'est la majorité qui tranche.
      motif_proposition: discours(bien, 'commodite').motif,
      statut: 'rejete',
      avis_rendu_le: dateEntre(58, 56).toISOString(),
      cree_le: creeLe.toISOString(),
    });
    const composition = commissionDe('CAID', proposant);
    await poserCommission(dossier, composition, dateEntre(63, 61).toISOString());
    await poserAvis(dossier, composition,
      ['defavorable', 'defavorable', 'favorable'],
      avisDe(bien, 'commodite'),
      dateEntre(59, 57).toISOString());
  }

  // --- 3. Un dossier examiné, qui attend son offre -----------------------
  {
    const structure = sgp;
    const bien = await choisirBien(structure, ETATS_REFORMABLES, 'imprimerie');
    const proposant = agentDe(agents, 'SGP', 'magasinier');
    const creeLe = dateEntre(20, 18);
    const dossier = await poserDossier({
      numero: await numeroSerie(bd, 'DR', annee(creeLe)),
      bien_id: bien.id,
      structure_id: structure.id,
      propose_par: proposant.id,
      motif_proposition: discours(bien, 'irreparable').motif,
      statut: 'examine',
      avis_rendu_le: dateEntre(14, 13).toISOString(),
      cree_le: creeLe.toISOString(),
    });
    const composition = commissionDe('SGP', proposant);
    await poserCommission(dossier, composition, dateEntre(17, 16).toISOString());
    await poserAvis(dossier, composition,
      ['favorable', 'favorable', 'favorable'],
      avisDe(bien, 'irreparable'),
      dateEntre(15, 14).toISOString());
  }

  // --- 4 à 6. Trois offres ouvertes, de trois structures différentes -----
  //
  // C'est le cœur de la démonstration : un chef de structure, quel que soit son
  // rattachement, doit voir au moins une offre venue d'ailleurs.
  // Le motif, les avis et les demandes ne sont pas écrits ici : ils se
  // déduisent de la catégorie du bien tiré pour chaque structure. C'est tout
  // l'objet de `DISCOURS` — un motif de climatiseur sur un ordinateur portable
  // décrédibilise l'écran entier.
  const offresOuvertes = [
    {
      structure: cgig, code: 'CGIG', role: 'magasinier', famille: 'technique',
      demandeuses: [{ structure: sgg, role: 'chef_structure' }],
    },
    {
      structure: sgp, code: 'SGP', role: 'comptable_matieres', famille: 'mobilier',
      demandeuses: [
        { structure: caid, role: 'chef_structure' },
        { structure: du, role: 'chef_structure' },
      ],
    },
    {
      structure: sgg, code: 'SGG', role: 'chef_structure', famille: 'imprimerie',
      demandeuses: [],
    },
  ];

  for (const cas of offresOuvertes) {
    const bien = await choisirBien(cas.structure, ETATS_REFORMABLES, cas.famille);
    if (!bien) continue;
    const proposant = agentDe(agents, cas.code, cas.role) ?? agentDe(agents, cas.code);
    const creeLe = dateEntre(26, 24);
    const offertLe = dateEntre(11, 10);
    const dossier = await poserDossier({
      numero: await numeroSerie(bd, 'DR', annee(creeLe)),
      bien_id: bien.id,
      structure_id: cas.structure.id,
      propose_par: proposant.id,
      // Le ton « remplacé » : le bien sert encore, mais plus ici. C'est celui
      // qu'on offre, et le seul qui rende l'étape 3 vraisemblable.
      motif_proposition: discours(bien, 'remplace').motif,
      statut: 'offert',
      avis_rendu_le: dateEntre(16, 15).toISOString(),
      offert_le: offertLe.toISOString(),
      cree_le: creeLe.toISOString(),
    });
    const composition = commissionDe(cas.code, proposant);
    await poserCommission(dossier, composition, dateEntre(22, 20).toISOString());
    await poserAvis(dossier, composition, ['favorable', 'favorable', 'favorable'],
      avisDe(bien, 'remplace'), dateEntre(17, 16).toISOString());

    // Trente jours à compter de l'ouverture : la durée vient du paramètre
    // `reemploi.duree_offre_jours`, et le jeu de démonstration la reprend.
    const cloture = new Date(offertLe.getTime() + 30 * 86_400_000);
    const offre = await poserOffre(dossier, bien, cas.structure, {
      numero: await numeroSerie(bd, 'OR', annee(offertLe)),
      ouverte_le: offertLe.toISOString(),
      cloture_prevue_le: cloture.toISOString(),
      duree_jours: 30,
      statut: 'ouverte',
    });
    for (const [rang, demandeuse] of cas.demandeuses.entries()) {
      const demandeur = agentDe(agents, demandeuse.structure.code, demandeuse.role)
        ?? agentDe(agents, demandeuse.structure.code);
      await poserDemande(offre, demandeuse.structure, {
        demande_par: demandeur.id,
        // Le besoin aussi se dit dans les termes du bien offert : on ne demande
        // pas une table d'appoint pour un groupe électrogène.
        motif: besoinDe(bien, rang),
        statut: 'deposee',
        cree_le: dateEntre(8, 4).toISOString(),
      });
    }
  }

  // --- 7. Un dossier réemployé : le bien a changé de main ----------------
  //
  // L'issue que le lot cherche. Le dossier se clôt **sans réforme**, le bien
  // reste au registre (RG-015) et passe à la structure qui l'a repris, avec son
  // acte de transfert et son mouvement de type `reemploi`.
  {
    const structure = sgp;
    const bien = await choisirBien(structure, ETATS_REFORMABLES, 'informatique');
    const proposant = agentDe(agents, 'SGP', 'magasinier');
    const creeLe = dateEntre(140, 135);
    const offertLe = dateEntre(120, 118);
    const closeLe = dateEntre(96, 94);
    const dossier = await poserDossier({
      numero: await numeroSerie(bd, 'DR', annee(creeLe)),
      bien_id: bien.id,
      structure_id: structure.id,
      propose_par: proposant.id,
      motif_proposition: discours(bien, 'remplace').motif,
      statut: 'reemploye',
      avis_rendu_le: dateEntre(126, 124).toISOString(),
      offert_le: offertLe.toISOString(),
      reemploye_le: closeLe.toISOString(),
      cree_le: creeLe.toISOString(),
    });
    const composition = commissionDe('SGP', proposant);
    await poserCommission(dossier, composition, dateEntre(132, 130).toISOString());
    // Le troisième membre n'a pas suivi la majorité : sa réserve est portée au
    // dossier, comme toute délibération réelle en garde une.
    await poserAvis(dossier, composition, ['favorable', 'favorable', 'defavorable'],
      avisDe(bien, 'remplace', { avecReserve: true }),
      dateEntre(127, 125).toISOString());

    const offre = await poserOffre(dossier, bien, structure, {
      numero: await numeroSerie(bd, 'OR', annee(offertLe)),
      ouverte_le: offertLe.toISOString(),
      close_le: closeLe.toISOString(),
      cloture_prevue_le: new Date(offertLe.getTime() + 30 * 86_400_000).toISOString(),
      duree_jours: 30,
      statut: 'close',
      close_par: logistique.id,
    });

    const beneficiaire = caid;
    const demandeurCaid = agentDe(agents, 'CAID', 'chef_structure');
    await poserDemande(offre, beneficiaire, {
      demande_par: demandeurCaid.id,
      motif: besoinDe(bien, 0),
      statut: 'acceptee',
      motif_decision: 'Besoin établi et antérieur aux autres demandes : le bien est attribué à la CAID.',
      tranchee_le: closeLe.toISOString(),
      tranchee_par: logistique.id,
      cree_le: dateEntre(110, 108).toISOString(),
    });
    const demandeurDu = agentDe(agents, 'DU', 'chef_structure');
    await poserDemande(offre, du, {
      demande_par: demandeurDu.id,
      motif: besoinDe(bien, 1),
      statut: 'ecartee',
      motif_decision: "Le bien a été attribué à la Cellule d'Analyse des Indicateurs de Développement.",
      tranchee_le: closeLe.toISOString(),
      tranchee_par: logistique.id,
      cree_le: dateEntre(105, 103).toISOString(),
    });

    // L'acte de transfert, émis au nom de la structure qui **reçoit** : c'est
    // son titre de détention, et il doit rester lisible avec la fiche du bien.
    comptes.documents += 1;
    const acte = await bd.un(
      `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
           signe_le, fige, cree_le)
       values ('acte_transfert', $1, $2, 'bien', $3, $4, $5, true, $5) returning id, numero`,
      [
        await numeroDocument(bd, 'AT', closeLe), beneficiaire.id, String(bien.id),
        JSON.stringify({
          origine: 'réemploi interne',
          dossier_reforme: dossier.numero,
          offre_reemploi: offre.numero,
          immatriculation: bien.immatriculation,
          designation: bien.designation,
          structure_cedante: structure.nom,
          structure_beneficiaire: beneficiaire.nom,
          mention: "Transfert interne au patrimoine de la Primature au titre du réemploi : le bien change de structure détentrice et ne sort pas du registre (RG-015). Ce n'est pas une cession.",
        }),
        closeLe.toISOString(),
      ],
    );

    await bd.requete(
      `update bien set structure_id = $2, site_id = null, detenteur_id = null, maj_le = $3
        where id = $1`,
      [bien.id, beneficiaire.id, closeLe.toISOString()],
    );
    comptes.mouvements += 1;
    await bd.requete(
      `insert into mouvement (bien_id, structure_id, type, quantite, date,
           structure_source_code, structure_cible_code, motif, document_id, cree_le)
       values ($1, $2, 'reemploi', $3, $4::date, $5, $6, $7, $8, $9)`,
      [
        bien.id, beneficiaire.id, bien.quantite ?? 1, jour(closeLe),
        structure.code, beneficiaire.code,
        `Réemploi interne : bien repris par ${beneficiaire.nom} au titre de l'offre ${offre.numero} (dossier ${dossier.numero})`,
        acte.id, closeLe.toISOString(),
      ],
    );
  }

  // --- 8. Un dossier saisi : le PV est figé, on attend les domaines ------
  {
    const structure = cgig;
    const bien = await choisirBien(structure, ETATS_REFORMABLES, 'charroi');
    const proposant = agentDe(agents, 'CGIG', 'comptable_matieres');
    const creeLe = dateEntre(100, 96);
    const offertLe = dateEntre(86, 84);
    const offreCloseLe = dateEntre(55, 53);
    const saisiLe = dateEntre(50, 48);
    const dossier = await poserDossier({
      numero: await numeroSerie(bd, 'DR', annee(creeLe)),
      bien_id: bien.id,
      structure_id: structure.id,
      propose_par: proposant.id,
      motif_proposition: discours(bien, 'irreparable').motif,
      statut: 'propose',
      cree_le: creeLe.toISOString(),
    });
    const composition = commissionDe('CGIG', proposant);
    await poserCommission(dossier, composition, dateEntre(94, 92).toISOString());
    await poserAvis(dossier, composition, ['favorable', 'favorable', 'favorable'],
      avisDe(bien, 'irreparable'), dateEntre(90, 88).toISOString());
    const offre = await poserOffre(dossier, bien, structure, {
      numero: await numeroSerie(bd, 'OR', annee(offertLe)),
      ouverte_le: offertLe.toISOString(),
      close_le: offreCloseLe.toISOString(),
      cloture_prevue_le: new Date(offertLe.getTime() + 30 * 86_400_000).toISOString(),
      duree_jours: 30,
      statut: 'close',
      close_par: logistique.id,
    });
    const pv = await poserPv(dossier, bien, structure, {
      date: saisiLe.toISOString(),
      offre,
      composition,
      avis: [{ avis: 'favorable' }, { avis: 'favorable' }, { avis: 'favorable' }],
    });
    await bd.requete(
      `update dossier_reforme
          set statut = 'saisi', avis_rendu_le = $2, offert_le = $3, saisi_le = $4,
              pv_document_id = $5, maj_le = $4
        where id = $1`,
      [dossier.id, dateEntre(90, 88).toISOString(), offertLe.toISOString(),
        saisiLe.toISOString(), pv.id],
    );
  }

  // --- 9. Un dossier clos sur un rebut : le bien est sorti du service ----
  {
    const structure = cgig;
    const bien = await choisirBien(structure, ETATS_REFORMABLES, 'climatisation');
    const proposant = agentDe(agents, 'CGIG', 'magasinier');
    const creeLe = dateEntre(300, 295);
    const offertLe = dateEntre(280, 278);
    const offreCloseLe = dateEntre(249, 247);
    const saisiLe = dateEntre(245, 243);
    const decisionLe = dateEntre(215, 213);
    const dossier = await poserDossier({
      numero: await numeroSerie(bd, 'DR', annee(creeLe)),
      bien_id: bien.id,
      structure_id: structure.id,
      propose_par: proposant.id,
      motif_proposition: discours(bien, 'irreparable').motif,
      statut: 'propose',
      cree_le: creeLe.toISOString(),
    });
    const composition = commissionDe('CGIG', proposant);
    await poserCommission(dossier, composition, dateEntre(293, 291).toISOString());
    await poserAvis(dossier, composition, ['favorable', 'favorable', 'favorable'],
      avisDe(bien, 'irreparable'), dateEntre(288, 286).toISOString());
    const offre = await poserOffre(dossier, bien, structure, {
      numero: await numeroSerie(bd, 'OR', annee(offertLe)),
      ouverte_le: offertLe.toISOString(),
      close_le: offreCloseLe.toISOString(),
      cloture_prevue_le: new Date(offertLe.getTime() + 30 * 86_400_000).toISOString(),
      duree_jours: 30,
      statut: 'close',
      close_par: logistique.id,
    });
    const pv = await poserPv(dossier, bien, structure, {
      date: saisiLe.toISOString(),
      offre,
      composition,
      avis: [{ avis: 'favorable' }, { avis: 'favorable' }, { avis: 'favorable' }],
    });
    // La décision est **enregistrée** : autorité, référence, date. Le SIGL ne
    // l'a pas prise (RG-016, RG-032).
    await bd.requete(
      `update dossier_reforme
          set statut = 'clos', avis_rendu_le = $2, offert_le = $3, saisi_le = $4,
              pv_document_id = $5, decision_autorite = $6, decision_reference = $7,
              decision_date = $8::date, decision_suite = 'rebut', close_le = $9, maj_le = $9
        where id = $1`,
      [
        dossier.id, dateEntre(288, 286).toISOString(), offertLe.toISOString(),
        saisiLe.toISOString(), pv.id,
        "Direction des domaines privés et publics de l'État",
        `DDPPE/${annee(decisionLe)}/${entier(100, 399)}`,
        jour(decisionLe), decisionLe.toISOString(),
      ],
    );
    // L'état du registre suit la décision de l'autorité, il ne la précède pas.
    await bd.requete(
      "update bien set etat = 'reforme', reforme_le = $2::date, maj_le = $3 where id = $1",
      [bien.id, jour(decisionLe), decisionLe.toISOString()],
    );
    comptes.mouvements += 1;
    await bd.requete(
      `insert into mouvement (bien_id, structure_id, type, quantite, date,
           structure_source_code, motif, document_id, cree_le)
       values ($1, $2, 'reforme', $3, $4::date, $5, $6, $7, $8)`,
      [
        bien.id, structure.id, bien.quantite ?? 1, jour(decisionLe), structure.code,
        `Réforme prononcée par la Direction des domaines — suite : rebut — dossier ${dossier.numero}`,
        pv.id, decisionLe.toISOString(),
      ],
    );
  }

  // --- 10. Un dossier clos sur un refus : le bien revient au service -----
  //
  // L'issue qu'on oublie toujours de prévoir. Les domaines refusent la réforme,
  // et le bien **reste en service** : le circuit doit savoir l'enregistrer sans
  // que personne ne touche à l'état du registre.
  {
    const structure = du;
    const bien = await choisirBien(structure, ETATS_REFORMABLES, 'informatique');
    if (bien) {
      const proposant = agentDe(agents, 'DU', 'chef_structure');
      const creeLe = dateEntre(260, 255);
      const offertLe = dateEntre(240, 238);
      const offreCloseLe = dateEntre(209, 207);
      const saisiLe = dateEntre(205, 203);
      const decisionLe = dateEntre(175, 173);
      const dossier = await poserDossier({
        numero: await numeroSerie(bd, 'DR', annee(creeLe)),
        bien_id: bien.id,
        structure_id: structure.id,
        propose_par: proposant.id,
        motif_proposition: discours(bien, 'irreparable').motif,
        statut: 'propose',
        cree_le: creeLe.toISOString(),
      });
      const composition = commissionDe('DU', proposant);
      await poserCommission(dossier, composition, dateEntre(252, 250).toISOString());
      await poserAvis(dossier, composition, ['favorable', 'favorable', 'favorable'],
        avisDe(bien, 'irreparable'), dateEntre(248, 246).toISOString());
      const offre = await poserOffre(dossier, bien, structure, {
        numero: await numeroSerie(bd, 'OR', annee(offertLe)),
        ouverte_le: offertLe.toISOString(),
        close_le: offreCloseLe.toISOString(),
        cloture_prevue_le: new Date(offertLe.getTime() + 30 * 86_400_000).toISOString(),
        duree_jours: 30,
        statut: 'close',
        close_par: logistique.id,
      });
      const pv = await poserPv(dossier, bien, structure, {
        date: saisiLe.toISOString(),
        offre,
        composition,
        avis: [{ avis: 'favorable' }, { avis: 'favorable' }, { avis: 'favorable' }],
      });
      await bd.requete(
        `update dossier_reforme
            set statut = 'clos', avis_rendu_le = $2, offert_le = $3, saisi_le = $4,
                pv_document_id = $5, decision_autorite = $6, decision_reference = $7,
                decision_date = $8::date, decision_suite = 'refus', close_le = $9, maj_le = $9
          where id = $1`,
        [
          dossier.id, dateEntre(248, 246).toISOString(), offertLe.toISOString(),
          saisiLe.toISOString(), pv.id,
          "Direction des domaines privés et publics de l'État",
          `DDPPE/${annee(decisionLe)}/${entier(400, 699)}`,
          jour(decisionLe), decisionLe.toISOString(),
        ],
      );
      // Rien n'est touché sur la fiche : le bien n'a jamais été réformé.
    }
  }

  return comptes;
}

function entreesDeConsommation(agents, stocks) {
  const entrees = [];
  const aUnRole = (a, ...codes) => codes.some((c) => a.roles.includes(c));
  const secours = agents.find((a) => aUnRole(a, 'comptable_matieres', 'magasinier', 'logistique'));

  for (const article of stocks) {
    const sortants = agents.filter(
      (a) => a.structure_id === article.structure_id && aUnRole(a, 'magasinier', 'comptable_matieres'),
    );
    const auteur = sortants.length > 0 ? parmi(sortants) : secours;
    if (!auteur) continue;

    // Le volume mensuel : une fraction de ce qui est en rayon, jamais zéro.
    const base = Math.max(1, Math.round(Number(article.quantite) / entier(4, 14)));
    let quantite = Number(article.quantite);
    for (let n = entier(2, 7); n > 0; n -= 1) {
      const sortie = Math.max(1, entier(Math.ceil(base / 3), base));
      const avant = quantite + sortie;
      entrees.push([
        auteur.id, 'sortie_stock', 'stock', article.id,
        { quantite: avant },
        {
          quantite,
          quantite_sortie: sortie,
          motif: `Sortie au profit d’un service — ${article.designation}`,
          etat_besoin_id: null,
          beneficiaire_id: null,
        },
        // Dans la fenêtre de 90 jours que lit l'écran des stocks.
        dateEntre(88, 2).toISOString(),
      ]);
      quantite = avant;
    }
  }
  return entrees;
}

async function creerJournal(bd, agents, biens, besoins, stocks = []) {
  const entrees = [];
  const comptable = agents.find((a) => a.roles.includes('comptable_matieres'));
  const logistique = agents.find((a) => a.roles.includes('logistique'));
  const admin = agents.find((a) => a.roles.includes('admin'));

  for (const bien of plusieursParmi(biens, 18)) {
    entrees.push([
      comptable.id, 'bien.cree', 'bien', bien.id, null,
      { immatriculation: bien.immatriculation, designation: bien.designation },
    ]);
  }
  for (const besoin of besoins.filter((b) => b.statut !== 'brouillon').slice(0, 12)) {
    entrees.push([
      logistique.id, 'etat_besoin.examine', 'etat_besoin', besoin.id,
      { statut: 'recu' }, { statut: besoin.statut },
    ]);
  }
  entrees.push([
    admin.id, 'parametre.modifie', 'parametre', 'seuils_passation',
    { consultation: 25_000_000 }, { consultation: 30_000_000 },
  ]);
  entrees.push(...entreesDeConsommation(agents, stocks));

  for (const [agentId, action, objetType, objetId, avant, apres, horodatage] of entrees) {
    await bd.requete(
      `insert into journal (agent_id, action, objet_type, objet_id, avant, apres, ip, horodatage)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        agentId, action, objetType, String(objetId),
        avant ? JSON.stringify(avant) : null,
        apres ? JSON.stringify(apres) : null,
        `10.${entier(0, 3)}.${entier(0, 255)}.${entier(2, 254)}`,
        horodatage ?? dateEntre(HORIZON_JOURS, 1).toISOString(),
      ],
    );
  }
  return entrees.length;
}

// ---------------------------------------------------------------------------
// Le compte rendu : on recompte les lignes réellement présentes.
// ---------------------------------------------------------------------------

async function rapporter(attendus) {
  const tables = [
    'structure', 'site', 'agent', 'agent_role', 'categorie', 'parametre',
    'parametre_version', 'bien', 'mouvement', 'stock', 'fournisseur',
    'etat_besoin', 'ligne_besoin', 'dossier_achat', 'bon_commande',
    'document', 'alerte',
    'campagne_inventaire', 'campagne_agent', 'constat_inventaire', 'ecart_inventaire',
    'rapprochement', 'rapprochement_poste', 'rapprochement_partie',
    'dossier_reforme', 'membre_commission', 'avis_commission',
    'offre_reemploi', 'demande_reemploi',
    'journal',
  ];

  console.log('\nLignes insérées');
  console.log('-'.repeat(46));
  for (const table of tables) {
    const { rows } = await executerPrivilegie(`select count(*)::int as n from ${table}`);
    const n = rows[0].n;
    const attendu = attendus[table];
    const marque = attendu !== undefined && attendu !== n ? `  (attendu ${attendu})` : '';
    console.log(`${table.padEnd(20)} ${String(n).padStart(6)}${marque}`);
  }

  const { rows: seuils } = await executerPrivilegie(`
    select
      count(*) filter (where quantite <= seuil_critique)                       as critiques,
      count(*) filter (where quantite > seuil_critique and quantite <= seuil_minimum) as sous_minimum
    from stock`);
  console.log('-'.repeat(46));
  console.log(`Stock sous le seuil critique : ${seuils[0].critiques}`);
  console.log(`Stock entre les deux seuils  : ${seuils[0].sous_minimum}`);

  const { rows: cpc } = await executerPrivilegie(
    "select count(*)::int as n from document where type = 'certificat_prise_en_charge'",
  );
  console.log(`Certificats de prise en charge : ${cpc[0].n}`);

  const { rows: statuts } = await executerPrivilegie(
    'select statut, count(*)::int as n from etat_besoin group by statut order by statut',
  );
  console.log(`États de besoin par statut : ${statuts.map((r) => `${r.statut} ${r.n}`).join(', ')}`);
}

principal()
  .then(() => fermer())
  .then(() => {
    console.log('\nJeu de démonstration en place.');
    process.exit(0);
  })
  .catch(async (erreur) => {
    console.error('\nÉchec du chargement :', erreur.message);
    if (erreur.detail) console.error('Détail :', erreur.detail);
    if (erreur.where) console.error('Où :', erreur.where);
    await fermer().catch(() => {});
    process.exit(1);
  });
