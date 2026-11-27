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
  'journal', 'agent_role', 'mouvement', 'stock', 'bien',
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
      const entrees = await creerJournal(bd, agents, biens, besoins, stocks);

      return {
        structure: structures.length,
        site: sites.length,
        agent: agents.length,
        agent_role: roles,
        categorie: CATEGORIES.length,
        parametre: parametres,
        bien: biens.length,
        mouvement: mouvements,
        stock: stocks.length,
        fournisseur: fournisseurs.length,
        etat_besoin: besoins.length,
        dossier_achat: achats.dossiers.length,
        bon_commande: achats.bons.length,
        document: documents,
        alerte: alertes,
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
    'document', 'alerte', 'journal',
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
