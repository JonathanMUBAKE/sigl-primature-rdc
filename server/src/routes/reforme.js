// Le circuit de réforme : la proposition, la commission, l'offre, la saisine,
// la décision enregistrée. Lot « réforme », `docs/LOT-REFORME.md`.
//
// Décret 13/050 : « la cession et la mise au rebut des biens d'actif relèvent
// de la compétence de l'administration en charge des domaines privés et publics
// de l'État ». Le SIGL instruit, produit le procès-verbal, saisit les domaines
// et suit la décision. **Il ne la prend pas** — RG-016, et ce lot ne l'assouplit
// en rien.
//
// LES TROIS PRINCIPES QUI COMMANDENT CE FICHIER.
//
// 1. **C'est le serveur qui dit l'avancement.** `etapes`, `offre_possible`,
//    `saisine_possible` et `decision_possible` sont calculés ici et rendus tels
//    quels. L'écran grise son bouton et affiche le motif ; il ne rejuge aucune
//    règle. S'il le refaisait, il en détiendrait l'autorité, et les deux
//    jugements finiraient par diverger.
//
// 2. **Le bien ne passe à l'état `reforme` qu'à la décision des domaines, et
//    seulement si elle est une cession ou un rebut.** Pas à la saisine : à la
//    saisine, le bien est sous procès-verbal et *en attente*, il est toujours
//    au service de la structure. Et pas du tout sur un refus des domaines : le
//    bien revient au service, et le circuit doit savoir enregistrer cela. C'est
//    la conséquence exacte de RG-016 — l'état du registre suit la décision de
//    l'autorité, il ne la précède pas.
//
// 3. **L'IA alerte, un humain décide.** Rien ici ne tranche tout seul. Le
//    passage de `propose` à `examine` ou `rejete` est le dépouillement
//    arithmétique d'avis que des agents ont rendus et motivés — c'est un
//    constat, pas une décision —, et la règle de majorité qui l'opère est posée
//    à un seul endroit, `regles/commission.js`.
//
// Règles tenues ici : RG-028 (pas de saisine sans offre close), RG-029 (pas de
// réforme sous offre ouverte), RG-030 (qui propose ne siège pas), RG-031 (un
// avis exige un motif), RG-032 (la décision s'enregistre), RG-015 (le bien ne
// disparaît jamais), RG-016 (le SIGL instruit et ne prononce pas), RG-017 et
// RG-018 (la portée), RG-019 (le PV figé), RG-020 (le journal avant
// confirmation).

import { enEcriture, enLecture, lireTous, lireUn } from './_sql.js';
import {
  ecriture, lecture, structuresDe, verifierEcritureStructure, verifierLecture,
  verifierLectureStricte, SANS_ECRITURE_METIER,
} from './_droits.js';
import {
  appliquer, appliquerToutes, donneesInvalides, erreur, liste, nonAutorise, nonTrouve,
  pagination, schemaIdParam, schemaPagination,
} from './_commun.js';
import { journaliserDepuis } from './_journal.js';
import { prochainNumero } from './_numeros.js';
import { commissionMembresMinimum, dureeOffreReemploiJours } from './_parametres.js';
import { publier } from './_flux.js';
import { avisDeLaCommission, manqueALaCommission } from '../regles/commission.js';
import { dateEnFrancais } from '../regles/dates.js';
import { rg015 } from '../regles/rg-015.js';
import { rg016 } from '../regles/rg-016.js';
import { rg028 } from '../regles/rg-028.js';
import { rg029 } from '../regles/rg-029.js';
import { rg030 } from '../regles/rg-030.js';
import { rg031 } from '../regles/rg-031.js';
import { rg032 } from '../regles/rg-032.js';

export const STATUTS_DOSSIER = [
  'propose', 'examine', 'rejete', 'offert', 'reemploye', 'saisi', 'clos',
];
export const QUALITES_COMMISSION = ['president', 'rapporteur', 'membre', 'secretaire'];
export const AVIS = ['favorable', 'defavorable'];

// Les rôles qui proposent une réforme. Le **détenteur** du bien s'y ajoute à la
// ligne, parce que c'est une qualité portée par la fiche du bien et non un rôle
// du contrat §4 : c'est vérifié dans la route, comme pour le constat
// d'inventaire.
const ROLES_PROPOSITION = ['magasinier', 'comptable_matieres'];

// Qui convoque la commission. Le contrat ne le nomme pas : on prend le
// comptable des matières de la structure — c'est lui qui tient la comptabilité
// des matières dont le bien sort (art. 120) — et la logistique centrale, qui
// instruit les dossiers du périmètre intégré.
const ROLES_CONVOCATION = ['comptable_matieres', 'logistique'];

// Les suites que l'administration des domaines peut donner. La liste vit dans
// RG-032, qui en est la règle ; on l'y lit plutôt que de la redire.
export { SUITES } from '../regles/rg-032.js';

// Les deux **actions soumises au jugement d'une règle**, et non des actions de
// journal. La distinction compte : RG-016 et RG-032 répondent à la question
// « ce que vous me demandez de faire revient-il à prononcer la cession ? », et
// le nom qu'on leur passe est celui du geste, pas celui d'une écriture. Les
// actions de journal du lot, elles, s'appellent `saisine_domaines` et
// `enregistrement_decision_domaines` et sont déclarées dans `regles/rg-020.js`.
// Les nommer ici évite aussi de les confondre à la lecture — et l'essai
// structurel de `rg-020.test.js`, qui relit les routes, ne les prend plus pour
// des actions journalisées non déclarées.
const ACTION_SOUMISE_SAISINE = 'saisir_domaines';
const ACTION_SOUMISE_DECISION = 'enregistrer_decision_domaines';

// Les statuts, en français lisible, **pour les messages**. Le statut technique
// reste celui du contrat partout ailleurs — c'est lui que l'interface reçoit et
// qu'elle met en pastille. Mais « ce dossier est au statut « propose » » est une
// phrase écrite pour un développeur, et ces refus sont lus par un comptable des
// matières. Les deux vocabulaires cohabitent sans se mélanger : l'un est une
// donnée, l'autre est une phrase.
const LIBELLES_STATUT = {
  propose: 'proposé',
  examine: 'examiné',
  rejete: 'rejeté',
  offert: 'offert',
  reemploye: 'réemployé',
  saisi: 'saisi',
  clos: 'clos',
};

/** Le statut d'un dossier tel qu'on l'écrit dans une phrase. */
export const direStatut = (statut) => LIBELLES_STATUT[statut] ?? statut ?? 'inconnu';

// La suite donnée par les domaines, en mots. Elle finit dans le motif du
// mouvement inscrit au registre, que l'historique d'un bien affiche tel quel.
const LIBELLES_SUITE = {
  cession: 'cession',
  rebut: 'mise au rebut',
  refus: 'refus de la réforme',
};

const LIBELLES_ETAPES = [
  'Proposition de réforme',
  'Avis de la commission',
  'Offre de réemploi',
  'Demande de réemploi',
  'Réemploi prononcé',
  'Saisine des domaines',
  'Décision des domaines',
];

// ---------------------------------------------------------------------------
// Les fonctions de décision, pures. Elles ne touchent pas la base, et c'est
// pour cela qu'elles s'éprouvent sans serveur.
// ---------------------------------------------------------------------------

/**
 * Les sept étapes du circuit, et où en est chacune.
 *
 * **C'est le serveur qui dit l'avancement, pas l'écran.** Les quatre états :
 *   `faite`    l'étape a eu lieu, et la date le prouve ;
 *   `courante` c'est elle qu'on attend ;
 *   `a_venir`  elle viendra si le circuit continue ;
 *   `sautee`   elle n'aura pas lieu, et ce n'est pas un échec — un avis
 *              défavorable saute l'offre, un réemploi saute la saisine, une
 *              offre close sans demande saute la demande.
 *
 * `par_nom` de l'étape 7 est l'**autorité** qui a décidé, et non un agent du
 * SIGL : c'est tout le sens de RG-016. Celui de l'étape 6 est le signataire du
 * procès-verbal, qui est bien un agent.
 */
export function etapesDuDossier({
  dossier, offre = null, demandes = [], avis = [], pv = null,
} = {}) {
  const statut = dossier?.statut ?? 'propose';
  const rejete = statut === 'rejete';
  const reemploye = statut === 'reemploye';
  const sousPv = statut === 'saisi' || statut === 'clos';
  const acceptee = demandes.find((d) => d.statut === 'acceptee') ?? null;
  const dernierAvis = avis.length > 0 ? avis[avis.length - 1] : null;
  const temoinDemande = acceptee ?? demandes[0] ?? null;

  const etapes = [];
  const pousser = (numero, etat, le = null, parNom = null) => etapes.push({
    numero,
    libelle: LIBELLES_ETAPES[numero - 1],
    etat,
    le: le ?? null,
    par_nom: parNom ?? null,
  });

  // 1 — le dossier existe, donc la proposition a eu lieu.
  pousser(1, 'faite', dossier?.cree_le, dossier?.propose_par_nom);

  // 2 — l'avis de la commission.
  pousser(
    2,
    dossier?.avis_rendu_le ? 'faite' : (statut === 'propose' ? 'courante' : 'a_venir'),
    dossier?.avis_rendu_le,
    dernierAvis?.agent_nom,
  );

  // 3 — l'offre de réemploi. Un avis défavorable la saute : le bien reste en
  // service, il n'y a rien à offrir.
  pousser(
    3,
    dossier?.offert_le ? 'faite'
      : rejete ? 'sautee'
        : statut === 'examine' ? 'courante' : 'a_venir',
    dossier?.offert_le,
    offre?.ouverte_par_nom,
  );

  // 4 — la demande d'une autre structure. Personne ne peut l'y contraindre :
  // une offre close sans demande est une étape **sautée**, pas une étape ratée.
  pousser(
    4,
    demandes.length > 0 ? 'faite'
      : rejete ? 'sautee'
        : offre?.statut === 'ouverte' ? 'courante'
          : offre ? 'sautee' : 'a_venir',
    temoinDemande?.cree_le,
    temoinDemande?.demande_par_nom,
  );

  // 5 — le réemploi prononcé. Un dossier déjà sous PV ne l'atteindra plus
  // (RG-029).
  pousser(
    5,
    reemploye ? 'faite'
      : (rejete || sousPv) ? 'sautee'
        : demandes.some((d) => d.statut === 'deposee') ? 'courante' : 'a_venir',
    dossier?.reemploye_le,
    acceptee?.tranchee_par_nom,
  );

  // 6 — la saisine des domaines, faute de preneur.
  pousser(
    6,
    dossier?.saisi_le ? 'faite'
      : (rejete || reemploye) ? 'sautee'
        : offre?.statut === 'close' ? 'courante' : 'a_venir',
    dossier?.saisi_le,
    pv?.signataire_nom,
  );

  // 7 — la décision des domaines, enregistrée et jamais prononcée. L'acteur est
  // l'autorité qui l'a prise, et c'est bien pour cela qu'on la nomme.
  pousser(
    7,
    dossier?.close_le ? 'faite'
      : (rejete || reemploye) ? 'sautee'
        : statut === 'saisi' ? 'courante' : 'a_venir',
    dossier?.decision_date,
    dossier?.decision_autorite,
  );

  return etapes;
}

const possible = () => ({ possible: true, code: null, motif: null });
const impossible = (code, motif) => ({ possible: false, code, motif });

/** Ce qu'une demande d'ouverture d'offre recevrait, dit d'avance. */
export function offrePossible({ dossier, offre = null } = {}) {
  if (offre) {
    const sousOffre = rg029({ offre });
    if (sousOffre) return impossible(sousOffre.code, sousOffre.message);
    return impossible(
      'donnees_invalides',
      `Ce bien a déjà été offert : l'offre ${offre.numero} a été close. Un bien n'est offert qu'une fois par dossier.`,
    );
  }
  if (dossier?.statut === 'propose') {
    return impossible(
      'donnees_invalides',
      "La commission n'a pas encore rendu son avis : l'offre de réemploi s'ouvre sur un dossier examiné.",
    );
  }
  if (dossier?.statut === 'rejete') {
    return impossible(
      'donnees_invalides',
      "La commission a rendu un avis défavorable : le bien reste en service, il n'y a rien à offrir.",
    );
  }
  if (dossier?.statut !== 'examine') {
    return impossible(
      'donnees_invalides',
      `Ce dossier est au statut « ${direStatut(dossier?.statut)} » : l'offre de réemploi ne s'ouvre que sur un dossier examiné.`,
    );
  }
  return possible();
}

/**
 * Ce que RG-028 et RG-029 répondraient à une demande de saisine.
 *
 * `demandes` entre dans le jugement depuis la décision du 27 novembre 2026 :
 * une offre close sur une demande sans réponse ne prouve pas que le réemploi a
 * été cherché. L'écran reçoit donc le même code et le même motif que la route
 * opposerait, et peut nommer les structures qui attendent.
 */
export function saisinePossible({ dossier, offre = null, demandes = [] } = {}) {
  if (dossier?.statut === 'saisi') {
    return impossible('donnees_invalides', 'Les domaines sont déjà saisis : le procès-verbal est figé et transmis.');
  }
  if (dossier?.statut === 'clos') {
    return impossible('donnees_invalides', 'La décision des domaines est déjà enregistrée : ce dossier est clos.');
  }
  if (dossier?.statut === 'reemploye') {
    return impossible(
      'donnees_invalides',
      "Le bien a été repris par une autre structure : le dossier s'est clos sans réforme, et il n'y a personne à saisir.",
    );
  }
  if (dossier?.statut === 'rejete') {
    return impossible(
      'donnees_invalides',
      'La commission a rendu un avis défavorable : le bien reste en service.',
    );
  }
  // RG-029 avant RG-028 : quand l'offre court encore, c'est elle qui le dit le
  // mieux, en nommant le terme annoncé.
  for (const refus of [rg029({ offre }), rg028({ offre, demandes })]) {
    if (refus) return impossible(refus.code, refus.message);
  }
  if (dossier?.statut !== 'offert') {
    return impossible(
      'donnees_invalides',
      `Ce dossier est au statut « ${direStatut(dossier?.statut)} » : la saisine se fait sur un dossier offert dont l'offre est close.`,
    );
  }
  return possible();
}

/** Ce qu'un enregistrement de décision recevrait, dit d'avance. */
export function decisionPossible({ dossier } = {}) {
  if (dossier?.statut === 'clos') {
    return impossible(
      'donnees_invalides',
      `La décision est déjà enregistrée : ${dossier.decision_autorite}, acte ${dossier.decision_reference}. Une décision enregistrée ne se réécrit pas.`,
    );
  }
  if (dossier?.statut !== 'saisi') {
    return impossible(
      'donnees_invalides',
      "Les domaines ne sont pas saisis : il n'y a pas encore de décision à enregistrer.",
    );
  }
  return possible();
}

// ---------------------------------------------------------------------------
// Les lectures
// ---------------------------------------------------------------------------

// Le nom et la fonction d'un agent, **par la fonction de la migration 070000**
// et non par une jointure vers `agent`, qui est cloisonné. Un membre de la
// commission peut être un agent d'une autre structure — l'intendant général y
// siège couramment —, et une jointure interne l'aurait effacé de la liste,
// tandis qu'une jointure externe l'aurait affiché sans nom. C'est le même piège
// que celui du comptable général au rapprochement contradictoire, et on y
// répond de la même façon. La fonction ne rend que le nom, la fonction et
// l'activité : jamais le courriel, jamais la structure.
const NOM_AGENT = (colonne) => `(select nom from sigl_identite_agent(${colonne}))`;
const FONCTION_AGENT = (colonne) => `(select fonction from sigl_identite_agent(${colonne}))`;

const CHAMPS_DOSSIER = `
  d.id, d.numero, d.bien_id, d.structure_id,
  s.code as structure_code, s.nom as structure_nom, s.regime as structure_regime,
  d.propose_par, ${NOM_AGENT('d.propose_par')} as propose_par_nom,
  ${FONCTION_AGENT('d.propose_par')} as propose_par_fonction,
  d.motif_proposition, d.statut, d.avis_rendu_le, d.offert_le, d.reemploye_le,
  d.saisi_le, d.pv_document_id, d.decision_autorite, d.decision_reference,
  d.decision_date, d.decision_suite, d.close_le, d.cree_le, d.maj_le`;

const CHAMPS_OFFRE = `
  o.id, o.numero, o.dossier_id, o.structure_id, o.site_origine_id,
  o.bien_immatriculation, o.bien_designation, o.bien_categorie_code, o.bien_etat,
  o.structure_origine_code, o.structure_origine_nom, o.site_origine_nom,
  o.ouverte_le, o.close_le, o.cloture_prevue_le, o.duree_jours, o.statut,
  o.ouverte_par, ${NOM_AGENT('o.ouverte_par')} as ouverte_par_nom,
  o.close_par, ${NOM_AGENT('o.close_par')} as close_par_nom,
  greatest(0, ceil(extract(epoch from (o.cloture_prevue_le - now())) / 86400))::int as jours_restants`;

const CHAMPS_DEMANDE = `
  m.id, m.offre_id, m.structure_id, m.structure_demandeuse_id,
  sd.code as structure_demandeuse_code, sd.nom as structure_demandeuse_nom,
  sd.regime as structure_demandeuse_regime,
  m.demande_par, ${NOM_AGENT('m.demande_par')} as demande_par_nom,
  m.motif, m.statut, m.motif_decision, m.tranchee_le,
  m.tranchee_par, ${NOM_AGENT('m.tranchee_par')} as tranchee_par_nom, m.cree_le`;

/** L'offre d'un dossier, ou `null`. Lisible de tous : c'est une publication. */
export async function chargerOffreDuDossier(request, dossierId) {
  return lireUn(
    request,
    `select ${CHAMPS_OFFRE} from offre_reemploi o where o.dossier_id = $1`,
    [dossierId],
  );
}

/** Les demandes portées sur une offre, dans l'ordre de dépôt. */
export async function chargerDemandes(request, offreId) {
  if (!offreId) return [];
  return lireTous(
    request,
    `select ${CHAMPS_DEMANDE}
       from demande_reemploi m
       join structure sd on sd.id = m.structure_demandeuse_id
      where m.offre_id = $1
      order by m.cree_le`,
    [offreId],
  );
}

/**
 * Le détail complet d'un dossier : le bien, la commission, les avis, l'offre,
 * les demandes, la décision, les sept étapes et les trois « possible ».
 *
 * Le périmètre se lit sur la ligne du dossier — `verifierLectureStricte`, parce
 * qu'un dossier de réforme a toujours une structure de rattachement et qu'un
 * rattachement indéterminable doit être refusé, pas ignoré.
 */
export async function chargerDossier(request, id, { verifier = true } = {}) {
  const dossier = await lireUn(
    request,
    `select ${CHAMPS_DOSSIER}
       from dossier_reforme d
       join structure s on s.id = d.structure_id
      where d.id = $1`,
    [id],
  );
  if (!dossier) throw nonTrouve('Ce dossier de réforme');
  if (verifier) {
    await verifierLectureStricte(request, dossier.structure_id, 'Ce dossier de réforme');
  }

  const offre = await chargerOffreDuDossier(request, dossier.id);
  const demandes = await chargerDemandes(request, offre?.id);

  // La fiche du bien. Elle peut ne plus être lisible d'ici : un réemploi la
  // fait changer de structure, et le dossier reste à celle qui l'a instruit.
  // On retombe alors sur la **copie publiée** de l'offre, qui est faite pour
  // cela — et on le dit franchement par `hors_perimetre`, plutôt que de rendre
  // un bien vide de son contenu.
  const fiche = await lireUn(
    request,
    `select b.id, b.immatriculation, b.designation, b.marque, b.modele, b.categorie_code,
            c.libelle as categorie_libelle, b.classement, b.etat, b.quantite,
            b.valeur_acquisition, b.date_acquisition, b.structure_id, b.site_id,
            si.nom as site_nom, b.detenteur_id, b.suivi, b.reforme_le
       from bien b
       join categorie c on c.code = b.categorie_code
       left join site si on si.id = b.site_id
      where b.id = $1`,
    [dossier.bien_id],
  );
  const bien = fiche ?? (offre
    ? {
      id: dossier.bien_id,
      immatriculation: offre.bien_immatriculation,
      designation: offre.bien_designation,
      categorie_code: offre.bien_categorie_code,
      etat: offre.bien_etat,
      structure_id: null,
      hors_perimetre: true,
    }
    : null);

  const commission = await lireTous(
    request,
    `select m.id, m.agent_id, m.qualite, m.designe_le,
            ${NOM_AGENT('m.agent_id')} as nom,
            ${FONCTION_AGENT('m.agent_id')} as fonction,
            exists (
              select 1 from avis_commission a
               where a.dossier_id = m.dossier_id and a.agent_id = m.agent_id
            ) as a_rendu_son_avis
       from membre_commission m
      where m.dossier_id = $1
      order by m.designe_le`,
    [dossier.id],
  );

  const avis = await lireTous(
    request,
    `select a.id, a.agent_id, ${NOM_AGENT('a.agent_id')} as agent_nom,
            ${FONCTION_AGENT('a.agent_id')} as agent_fonction,
            a.avis, a.motif, a.rendu_le
       from avis_commission a
      where a.dossier_id = $1
      order by a.rendu_le`,
    [dossier.id],
  );

  const pv = dossier.pv_document_id
    ? await lireUn(
      request,
      `select g.id, g.type, g.numero, g.fige, g.signataire_id,
              ${NOM_AGENT('g.signataire_id')} as signataire_nom, g.signe_le, g.contenu
         from document g where g.id = $1`,
      [dossier.pv_document_id],
    )
    : null;

  // Le paramètre, jamais une constante. Il sert ici à dire où en est la
  // commission, et dans la route de l'avis à savoir si elle a conclu.
  const minimum = await enLecture(request, () => commissionMembresMinimum());
  const etatCommission = avisDeLaCommission({
    membres: commission, avis, membres_minimum: minimum,
  });

  return {
    dossier,
    bien,
    commission,
    avis,
    offre,
    demandes,
    decision: dossier.statut === 'clos'
      ? {
        autorite: dossier.decision_autorite,
        reference: dossier.decision_reference,
        date_acte: dossier.decision_date,
        suite: dossier.decision_suite,
        enregistree_le: dossier.close_le,
      }
      : null,
    pv,
    // Tout chiffre vient du serveur : l'écran affiche « 2 avis sur 3 », il ne
    // le recalcule pas.
    commission_etat: { ...etatCommission, manque: manqueALaCommission(etatCommission) },
    etapes: etapesDuDossier({ dossier, offre, demandes, avis, pv }),
    offre_possible: offrePossible({ dossier, offre }),
    saisine_possible: saisinePossible({ dossier, offre, demandes }),
    decision_possible: decisionPossible({ dossier }),
  };
}

/** Le dossier non clos qui porte sur ce bien, s'il y en a un. */
async function dossierOuvertDuBien(request, bienId) {
  return lireUn(
    request,
    `select d.id, d.numero, d.statut, d.structure_id
       from dossier_reforme d
      where d.bien_id = $1 and d.statut not in ('rejete', 'reemploye', 'clos')
      limit 1`,
    [bienId],
  );
}

/** L'offre encore ouverte qui porte sur ce bien, s'il y en a une. */
async function offreOuverteDuBien(request, bienId) {
  return lireUn(
    request,
    `select ${CHAMPS_OFFRE}
       from offre_reemploi o
       join dossier_reforme d on d.id = o.dossier_id
      where d.bien_id = $1 and o.statut = 'ouverte'
      limit 1`,
    [bienId],
  );
}

// ---------------------------------------------------------------------------
// Les routes
// ---------------------------------------------------------------------------

export default async function routesReforme(app) {
  // --- La liste des dossiers --------------------------------------------
  app.get('/api/dossiers-reforme', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          statut: { type: 'string', enum: STATUTS_DOSSIER },
          structure: { type: 'string', format: 'uuid' },
          q: { type: 'string', maxLength: 120 },
          ...schemaPagination,
        },
      },
    },
  }, async (request) => {
    const page = pagination(request.query);
    const params = [];
    let ou = 'where true';

    if (request.query.structure) {
      await verifierLecture(request, request.query.structure);
      params.push(request.query.structure);
      ou += ` and d.structure_id = $${params.length}`;
    } else {
      const permises = await structuresDe(request);
      if (permises !== null) {
        if (permises.length === 0) return liste([], 0, page);
        const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
        params.push(...permises);
        ou += ` and d.structure_id in (${places})`;
      }
    }
    if (request.query.statut) {
      params.push(request.query.statut);
      ou += ` and d.statut = $${params.length}`;
    }
    if (request.query.q) {
      params.push(`%${request.query.q.toLowerCase()}%`);
      ou += ` and (lower(d.numero) like $${params.length}
                   or lower(coalesce(b.immatriculation, o.bien_immatriculation, '')) like $${params.length}
                   or lower(coalesce(b.designation, o.bien_designation, '')) like $${params.length})`;
    }

    // `bien` est joint en **externe**, et la désignation retombe sur la copie
    // publiée de l'offre : après un réemploi, le bien n'est plus du périmètre
    // du dossier, et une jointure interne aurait fait disparaître de la liste
    // les dossiers qui ont le mieux marché.
    const base = `
      from dossier_reforme d
      join structure s on s.id = d.structure_id
      left join bien b on b.id = d.bien_id
      left join offre_reemploi o on o.dossier_id = d.id
      ${ou}`;

    const total = await lireUn(request, `select count(*)::int as n ${base}`, params);
    const donnees = await lireTous(
      request,
      `select d.id, d.numero, d.statut, d.bien_id,
              coalesce(b.immatriculation, o.bien_immatriculation) as immatriculation,
              coalesce(b.designation, o.bien_designation) as designation,
              coalesce(b.etat, o.bien_etat) as bien_etat,
              d.structure_id, s.code as structure_code, s.nom as structure_nom,
              s.regime as structure_regime,
              d.propose_par, ${NOM_AGENT('d.propose_par')} as propose_par_nom,
              d.motif_proposition, d.cree_le, d.avis_rendu_le, d.offert_le,
              d.reemploye_le, d.saisi_le, d.close_le, d.decision_suite,
              o.id as offre_id, o.numero as offre_numero, o.statut as offre_statut,
              o.cloture_prevue_le as offre_cloture_prevue_le,
              (select count(*)::int from membre_commission mc where mc.dossier_id = d.id) as membres,
              (select count(*)::int from avis_commission ac where ac.dossier_id = d.id) as avis_rendus,
              (select count(*)::int from avis_commission ac
                where ac.dossier_id = d.id and ac.avis = 'favorable') as avis_favorables,
              (select count(*)::int from demande_reemploi dm where dm.offre_id = o.id) as demandes,
              (select count(*)::int from demande_reemploi dm
                where dm.offre_id = o.id and dm.statut = 'deposee') as demandes_pendantes
         ${base}
        order by d.cree_le desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(donnees, total.n, page);
  });

  // --- Étape 1 : la proposition de réforme -------------------------------
  //
  // La garde de rôle est volontairement large, et le droit réel est vérifié
  // dans la route : le **détenteur** du bien propose, et il peut ne porter
  // aucun rôle du contrat §4. Un contrôle qui ne pourrait s'exprimer qu'en
  // `preHandler` aurait fermé la porte que le circuit lui ouvre.
  app.post('/api/dossiers-reforme', {
    preHandler: ecriture(),
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['bien_id', 'motif'],
        properties: {
          bien_id: { type: 'string', format: 'uuid' },
          motif: { type: 'string', minLength: 3, maxLength: 2000 },
        },
      },
    },
  }, async (request, reply) => {
    const bien = await lireUn(
      request,
      `select b.id, b.immatriculation, b.designation, b.categorie_code, b.etat, b.quantite,
              b.structure_id, b.site_id, b.detenteur_id, b.classement, b.suivi,
              s.code as structure_code, s.nom as structure_nom, s.regime as structure_regime
         from bien b join structure s on s.id = b.structure_id
        where b.id = $1`,
      [request.body.bien_id],
    );
    if (!bien) throw nonTrouve('Ce bien');
    // RG-018 : une structure autonome n'est jamais écrite par le niveau central.
    await verifierEcritureStructure(request, bien.structure_id);

    const autorise = ROLES_PROPOSITION.some((r) => request.agent.roles.includes(r))
      || String(bien.detenteur_id ?? '') === String(request.agent.id);
    if (!autorise) {
      throw nonAutorise(
        "Faites porter cette proposition par le détenteur du bien, un magasinier ou le comptable des matières : c'est celui qui détient le bien qui constate qu'il ne sert plus.",
      );
    }

    if (bien.etat === 'reforme') {
      throw donneesInvalides(
        'Ce bien est déjà réformé : il est sorti du service, et le registre en garde la trace (RG-015).',
        'bien_id',
      );
    }
    const deja = await dossierOuvertDuBien(request, bien.id);
    if (deja) {
      throw donneesInvalides(
        `Un dossier de réforme est déjà ouvert sur ce bien : ${deja.numero}, au statut « ${direStatut(deja.statut)} ». Reprenez-le plutôt que d'en ouvrir un second.`,
        'bien_id',
      );
    }
    // RG-029 : un bien sous offre de réemploi ouverte ne se réforme pas. Le cas
    // ne devrait pas se présenter — l'offre naît d'un dossier, qui serait donc
    // ouvert — mais la règle est contrôlée, pas supposée.
    appliquer(rg029({ offre: await offreOuverteDuBien(request, bien.id) }));

    const resultat = await enEcriture(request, async () => {
      const numero = await prochainNumero('dossier_reforme');
      // RG-020 : le journal est écrit avant que l'action soit confirmée.
      await journaliserDepuis(request, {
        action: 'proposition_reforme',
        objet_type: 'dossier_reforme',
        objet_id: numero,
        avant: { bien_etat: bien.etat, bien: bien.immatriculation ?? bien.designation },
        apres: {
          numero,
          bien_id: bien.id,
          structure_id: bien.structure_id,
          propose_par: request.agent.id,
          motif_proposition: request.body.motif,
          statut: 'propose',
        },
      });
      return lireUn(
        request,
        `insert into dossier_reforme (numero, bien_id, structure_id, propose_par,
             motif_proposition, statut)
         values ($1, $2, $3, $4, $5, 'propose') returning id, numero, structure_id, statut`,
        [numero, bien.id, bien.structure_id, request.agent.id, request.body.motif],
      );
    });

    publier({
      type: 'creation',
      objet: 'reforme',
      id: resultat.id,
      structure_id: resultat.structure_id,
      donnees: {
        numero: resultat.numero,
        statut: 'propose',
        bien: bien.immatriculation ?? bien.designation,
      },
    });
    reply.code(201);
    return chargerDossier(request, resultat.id);
  });

  // --- Le détail ---------------------------------------------------------
  app.get('/api/dossiers-reforme/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => chargerDossier(request, request.params.id));

  // --- Étape 2a : la désignation de la commission ------------------------
  app.post('/api/dossiers-reforme/:id/commission', {
    preHandler: ecriture(...ROLES_CONVOCATION),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['agent_id', 'qualite'],
        properties: {
          agent_id: { type: 'string', format: 'uuid' },
          qualite: { type: 'string', enum: QUALITES_COMMISSION },
        },
      },
    },
  }, async (request, reply) => {
    const detail = await chargerDossier(request, request.params.id);
    const { dossier } = detail;
    await verifierEcritureStructure(request, dossier.structure_id);

    if (dossier.statut !== 'propose') {
      throw donneesInvalides(
        `La commission de ce dossier a déjà conclu (statut « ${direStatut(dossier.statut)} ») : sa composition ne se rouvre pas après l'avis.`,
        'statut',
      );
    }

    // RG-030 : qui propose la réforme ne siège pas à la commission.
    appliquer(rg030({ propose_par: dossier.propose_par, agent_id: request.body.agent_id }));

    // L'identité du candidat vient de `sigl_identite_agent` et non d'une
    // jointure vers `agent` : un membre peut venir d'une autre structure, et
    // `agent` est cloisonné. Même précédent que la partie au rapprochement
    // contradictoire de la migration 070000.
    const identite = await lireUn(
      request,
      'select id, nom, fonction, actif from sigl_identite_agent($1)',
      [request.body.agent_id],
    );
    if (!identite) throw nonTrouve('Cet agent');
    if (identite.actif === false) {
      throw donneesInvalides(
        "Désignez un agent en activité : ce compte d'agent est désactivé.", 'agent_id',
      );
    }

    // Un siège à la commission est un acte métier : le contrôle externe, la
    // direction et l'administrateur n'y siègent pas. Le contrôle externe
    // **contrôle** la délibération, il n'y prend pas part.
    const roles = await lireTous(
      request, 'select role_code from agent_role where agent_id = $1', [request.body.agent_id],
    );
    const codes = roles.map((r) => r.role_code);
    if (codes.length > 0 && codes.every((r) => SANS_ECRITURE_METIER.includes(r))) {
      throw nonAutorise(
        `Désignez un agent du métier : ${identite.nom} ne porte que des rôles de consultation ou de contrôle, et ceux-là examinent la délibération au lieu d'y siéger.`,
        'agent_id',
      );
    }

    if (detail.commission.some((m) => String(m.agent_id) === String(request.body.agent_id))) {
      throw donneesInvalides(
        `${identite.nom} siège déjà à cette commission : un membre qui siègerait deux fois pèserait deux fois à la majorité.`,
        'agent_id',
      );
    }

    await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'designation_commission_reforme',
        objet_type: 'dossier_reforme',
        objet_id: dossier.id,
        avant: { membres: detail.commission.length },
        apres: {
          agent_id: request.body.agent_id,
          agent_nom: identite.nom,
          qualite: request.body.qualite,
          membres: detail.commission.length + 1,
        },
      });
      return lireUn(
        request,
        `insert into membre_commission (dossier_id, structure_id, agent_id, qualite)
         values ($1, $2, $3, $4) returning *`,
        [dossier.id, dossier.structure_id, request.body.agent_id, request.body.qualite],
      );
    });

    publier({
      type: 'designation',
      objet: 'reforme',
      id: dossier.id,
      structure_id: dossier.structure_id,
      donnees: { numero: dossier.numero, agent_nom: identite.nom, qualite: request.body.qualite },
    });
    reply.code(201);
    return chargerDossier(request, dossier.id);
  });

  // --- Étape 2b : l'avis d'un membre -------------------------------------
  //
  // `motif` n'a pas de `minLength` au schéma, et ce n'est pas un oubli : c'est
  // RG-031 qui doit répondre, avec son code et son message, et non la
  // validation de forme. Une règle de gestion dont le refus arrive sous le code
  // `donnees_invalides` est une règle qu'on ne peut pas éprouver.
  app.post('/api/dossiers-reforme/:id/avis', {
    preHandler: ecriture(),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['avis'],
        properties: {
          avis: { type: 'string', maxLength: 40 },
          motif: { type: ['string', 'null'], maxLength: 2000 },
        },
      },
    },
  }, async (request, reply) => {
    const detail = await chargerDossier(request, request.params.id);
    const { dossier } = detail;
    await verifierEcritureStructure(request, dossier.structure_id);

    if (dossier.statut !== 'propose') {
      throw donneesInvalides(
        `La commission a déjà conclu : ce dossier est au statut « ${direStatut(dossier.statut)} », et une délibération rendue ne se réécrit pas.`,
        'statut',
      );
    }

    const siege = detail.commission.find((m) => String(m.agent_id) === String(request.agent.id));
    if (!siege) {
      throw nonAutorise(
        "Seul un membre désigné de la commission rend un avis sur ce dossier : demandez à être désigné avant de vous prononcer.",
      );
    }
    // RG-030, redite ici volontairement : un proposant désigné par erreur ne
    // doit pas pouvoir se prononcer, même si la désignation a passé.
    // RG-031 ensuite : un avis exige un motif, favorable comme défavorable.
    appliquerToutes([
      rg030({ propose_par: dossier.propose_par, agent_id: request.agent.id }),
      rg031({ avis: request.body.avis, motif: request.body.motif }),
    ]);

    if (detail.avis.some((a) => String(a.agent_id) === String(request.agent.id))) {
      throw donneesInvalides(
        'Vous avez déjà rendu votre avis sur ce dossier : on ne se prononce pas deux fois.', 'avis',
      );
    }

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'avis_commission_reforme',
        objet_type: 'dossier_reforme',
        objet_id: dossier.id,
        avant: {
          statut: dossier.statut,
          avis_rendus: detail.avis.length,
          favorables: detail.commission_etat.favorables,
        },
        apres: {
          agent_id: request.agent.id,
          avis: request.body.avis,
          motif: request.body.motif,
          avis_rendus: detail.avis.length + 1,
        },
      });

      const ligne = await lireUn(
        request,
        `insert into avis_commission (dossier_id, structure_id, agent_id, avis, motif)
         values ($1, $2, $3, $4, $5) returning *`,
        [dossier.id, dossier.structure_id, request.agent.id, request.body.avis, request.body.motif],
      );

      // Le dépouillement : un constat arithmétique sur des avis que des agents
      // ont rendus et motivés, et la règle de majorité est posée à un seul
      // endroit — `regles/commission.js`. Aucune décision automatique : la
      // décision, ce sont les avis.
      const avis = [...detail.avis, ligne];
      const etat = avisDeLaCommission({
        membres: detail.commission,
        avis,
        membres_minimum: detail.commission_etat.membres_minimum,
      });
      let dossierApres = null;
      if (etat.conclu) {
        await journaliserDepuis(request, {
          action: 'conclusion_commission_reforme',
          objet_type: 'dossier_reforme',
          objet_id: dossier.id,
          avant: { statut: dossier.statut },
          apres: {
            statut: etat.statut_du_dossier,
            majorite: etat.majorite,
            favorables: etat.favorables,
            defavorables: etat.defavorables,
            membres: etat.membres,
          },
        });
        dossierApres = await lireUn(
          request,
          `update dossier_reforme
              set statut = $2, avis_rendu_le = now(), maj_le = now()
            where id = $1 returning id, statut`,
          [dossier.id, etat.statut_du_dossier],
        );
      }
      return { avis: ligne, etat, dossier: dossierApres };
    });

    publier({
      type: resultat.etat.conclu ? 'conclusion' : 'avis',
      objet: 'reforme',
      id: dossier.id,
      structure_id: dossier.structure_id,
      donnees: {
        numero: dossier.numero,
        avis: request.body.avis,
        statut: resultat.etat.statut_du_dossier ?? dossier.statut,
      },
    });
    reply.code(201);
    return chargerDossier(request, dossier.id);
  });

  // --- Étape 3 : l'offre de réemploi -------------------------------------
  //
  // L'étape la plus importante du lot, et la seule qui ne découle pas du
  // décret. Elle est ouverte par la logistique centrale, vers **toutes** les
  // structures : l'offre porte sa propre copie du bien et sa politique de
  // lecture est ouverte à toute session positionnée, parce qu'une offre que les
  // autres structures ne voient pas est une étape qui n'existe pas.
  app.post('/api/dossiers-reforme/:id/offrir', {
    preHandler: ecriture('logistique'),
    schema: {
      params: schemaIdParam,
      body: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: { duree_jours: { type: ['integer', 'null'], minimum: 1, maximum: 365 } },
      },
    },
  }, async (request) => {
    const detail = await chargerDossier(request, request.params.id);
    const { dossier, bien } = detail;
    await verifierEcritureStructure(request, dossier.structure_id);

    // Ce que le serveur annonçait à l'écran est exactement ce qu'il refuse :
    // `offre_possible` et ce refus sont la même fonction, lue deux fois.
    if (!detail.offre_possible.possible) {
      const { code, motif } = detail.offre_possible;
      throw erreur(code, motif, 'statut', String(code).startsWith('RG-') ? 422 : 400);
    }
    if (!bien || bien.hors_perimetre) {
      throw donneesInvalides(
        "La fiche du bien n'est pas lisible depuis ce dossier : l'offre ne peut pas publier ce qu'elle ne lit pas.",
        'bien_id',
      );
    }

    // La durée vient du paramètre horodaté, jamais d'une constante. Faute de
    // paramètre, on refuse plutôt que de deviner : fixer une durée d'offre est
    // une décision de l'institution, pas un réglage du serveur.
    const duree = request.body?.duree_jours
      ?? await enLecture(request, () => dureeOffreReemploiJours());
    if (!duree) {
      throw donneesInvalides(
        "Le paramètre « reemploi.duree_offre_jours » n'est pas renseigné : demandez à l'administrateur de le poser, ou indiquez une durée. Le serveur ne fixe pas de lui-même la durée d'une offre.",
        'duree_jours',
      );
    }

    const resultat = await enEcriture(request, async () => {
      const numero = await prochainNumero('offre_reemploi');
      await journaliserDepuis(request, {
        action: 'ouverture_offre_reemploi',
        objet_type: 'dossier_reforme',
        objet_id: dossier.id,
        avant: { statut: dossier.statut, offert_le: dossier.offert_le },
        apres: {
          statut: 'offert',
          offre: numero,
          duree_jours: duree,
          bien: bien.immatriculation ?? bien.designation,
          structure_origine: dossier.structure_code,
        },
      });

      // La copie publiée, résolue maintenant. Ce qui a été offert restera ce
      // qui a été offert, même si la fiche du bien bouge ensuite.
      const offre = await lireUn(
        request,
        `insert into offre_reemploi (numero, dossier_id, structure_id, site_origine_id,
             bien_immatriculation, bien_designation, bien_categorie_code, bien_etat,
             structure_origine_code, structure_origine_nom, site_origine_nom,
             ouverte_le, cloture_prevue_le, duree_jours, statut, ouverte_par)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 now(), now() + make_interval(days => $12::int), $12, 'ouverte', $13)
         returning id, numero, statut, cloture_prevue_le, duree_jours`,
        [
          numero, dossier.id, dossier.structure_id, bien.site_id ?? null,
          bien.immatriculation, bien.designation, bien.categorie_code, bien.etat,
          dossier.structure_code, dossier.structure_nom, bien.site_nom ?? null,
          duree, request.agent.id,
        ],
      );

      await lireUn(
        request,
        `update dossier_reforme set statut = 'offert', offert_le = now(), maj_le = now()
          where id = $1 returning id`,
        [dossier.id],
      );
      return offre;
    });

    publier({
      type: 'offre_ouverte',
      objet: 'reemploi',
      id: resultat.id,
      structure_id: dossier.structure_id,
      donnees: {
        numero: resultat.numero,
        dossier: dossier.numero,
        bien: bien.immatriculation ?? bien.designation,
        cloture_prevue_le: resultat.cloture_prevue_le,
      },
    });
    publier({
      type: 'offert',
      objet: 'reforme',
      id: dossier.id,
      structure_id: dossier.structure_id,
      donnees: { numero: dossier.numero, statut: 'offert', offre: resultat.numero },
    });
    return chargerDossier(request, dossier.id);
  });

  // --- Étape 6 : la saisine des domaines ---------------------------------
  app.post('/api/dossiers-reforme/:id/saisir', {
    preHandler: ecriture('logistique'),
    schema: {
      params: schemaIdParam,
      body: { type: ['object', 'null'], additionalProperties: false, properties: {} },
    },
  }, async (request) => {
    const detail = await chargerDossier(request, request.params.id);
    const { dossier, bien, offre } = detail;
    await verifierEcritureStructure(request, dossier.structure_id);

    // RG-016 : le SIGL instruit et produit le PV. Saisir n'est pas prononcer.
    appliquer(rg016({ action: ACTION_SOUMISE_SAISINE }));
    // RG-029 puis RG-028, dans l'ordre du circuit : l'offre encore ouverte
    // d'abord ; l'offre absente, puis les demandes laissées sans réponse,
    // ensuite. Les demandes passent à RG-028 parce que c'est elle qui exige que
    // le réemploi ait été **réellement cherché**, et non seulement annoncé.
    appliquerToutes([
      rg029({ offre, dossier_statut: dossier.statut, etat_bien: bien?.etat }),
      rg028({ offre, demandes: detail.demandes }),
    ]);
    if (!detail.saisine_possible.possible) {
      throw donneesInvalides(detail.saisine_possible.motif, 'statut');
    }

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'saisine_domaines',
        objet_type: 'dossier_reforme',
        objet_id: dossier.id,
        avant: { statut: dossier.statut, saisi_le: dossier.saisi_le },
        apres: {
          statut: 'saisi',
          offre: offre.numero,
          offre_close_le: offre.close_le,
          demandes_recues: detail.demandes.length,
          saisi_par: request.agent.id,
        },
      });

      // Le procès-verbal de réforme, **figé** (RG-019). C'est la pièce que la
      // saisine transmet, et son `signataire_id` nomme qui a instruit : c'est
      // lui que l'étape 6 montre à l'écran.
      const numero = await prochainNumero('pv_reforme');
      const document = await lireUn(
        request,
        `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
                               signataire_id, signe_le, fige)
         values ('pv_reforme', $1, $2, 'dossier_reforme', $3, $4, $5, now(), true)
         returning id, type, numero, fige, signe_le, contenu`,
        [
          numero, dossier.structure_id, String(dossier.id),
          JSON.stringify({
            dossier: dossier.numero,
            immatriculation: bien?.immatriculation ?? offre.bien_immatriculation,
            designation: bien?.designation ?? offre.bien_designation,
            categorie: bien?.categorie_libelle ?? offre.bien_categorie_code,
            quantite: bien?.quantite ?? null,
            etat: bien?.etat ?? offre.bien_etat,
            valeur_acquisition: bien?.valeur_acquisition ?? null,
            date_acquisition: bien?.date_acquisition ?? null,
            structure: dossier.structure_nom,
            site: offre.site_origine_nom,
            motif_proposition: dossier.motif_proposition,
            propose_par: dossier.propose_par_nom,
            commission: detail.commission.map((m) => ({ nom: m.nom, qualite: m.qualite })),
            avis: detail.avis.map((a) => ({ nom: a.agent_nom, avis: a.avis, motif: a.motif })),
            majorite: detail.commission_etat.majorite,
            offre_reemploi: {
              numero: offre.numero,
              ouverte_le: offre.ouverte_le,
              close_le: offre.close_le,
              duree_jours: offre.duree_jours,
              demandes: detail.demandes.length,
            },
            instruit_par: request.agent.nom,
            mention: "Le SIGL instruit et produit le procès-verbal ; la cession et la mise au rebut relèvent de l'administration en charge des domaines privés et publics de l'État (décret 13/050), qui décide seule de la suite.",
          }),
          request.agent.id,
        ],
      );

      // Le bien **ne passe pas** à l'état `reforme` ici : il est sous
      // procès-verbal et en attente. C'est la décision des domaines qui le
      // sortira du service, ou qui le rendra au service — voir le principe 2 en
      // tête de ce fichier.
      const apres = await lireUn(
        request,
        `update dossier_reforme
            set statut = 'saisi', saisi_le = now(), pv_document_id = $2, maj_le = now()
          where id = $1 returning id, statut, saisi_le`,
        [dossier.id, document.id],
      );
      return { document, dossier: apres };
    });

    publier({
      type: 'saisine',
      objet: 'reforme',
      id: dossier.id,
      structure_id: dossier.structure_id,
      donnees: { numero: dossier.numero, statut: 'saisi', document: resultat.document.numero },
    });
    return { ...(await chargerDossier(request, dossier.id)), document: resultat.document };
  });

  // --- Étape 7 : la décision des domaines, enregistrée -------------------
  //
  // Aucun champ du corps n'est `required` au schéma, et aucune énumération n'y
  // figure : c'est RG-032 qui répond, avec son code. Une règle de gestion dont
  // le refus arrive sous `donnees_invalides` est une règle qu'on ne peut pas
  // éprouver — et celle-ci est la garantie que le SIGL n'a pas décidé.
  app.post('/api/dossiers-reforme/:id/decision', {
    preHandler: ecriture('logistique'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          autorite: { type: ['string', 'null'], maxLength: 200 },
          reference: { type: ['string', 'null'], maxLength: 120 },
          // `format` est une question de forme, et la forme se vérifie au bord.
          // L'**absence** de la date, elle, est une question de fond : c'est
          // RG-032 qui la pose, et c'est pour cela que rien n'est `required`.
          date_acte: { type: ['string', 'null'], format: 'date' },
          suite: { type: ['string', 'null'], maxLength: 40 },
        },
      },
    },
  }, async (request) => {
    const corps = request.body ?? {};
    const detail = await chargerDossier(request, request.params.id);
    const { dossier, bien } = detail;
    await verifierEcritureStructure(request, dossier.structure_id);

    if (!detail.decision_possible.possible) {
      throw donneesInvalides(detail.decision_possible.motif, 'statut');
    }
    // RG-032, qui passe d'abord la main à RG-016 : enregistrer n'est pas
    // prononcer, et les trois champs exigés n'ont de sens que si la décision a
    // été prise ailleurs.
    appliquer(rg032({
      autorite: corps.autorite,
      reference: corps.reference,
      date_acte: corps.date_acte,
      suite: corps.suite,
      action: ACTION_SOUMISE_DECISION,
    }));

    const sortDuService = corps.suite === 'cession' || corps.suite === 'rebut';
    if (sortDuService) {
      // RG-015 : le bien ne disparaît jamais, c'est son état qui change.
      appliquer(rg015({ type_mouvement: 'reforme', etat_cible: 'reforme', supprime_la_fiche: false }));
    }

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'enregistrement_decision_domaines',
        objet_type: 'dossier_reforme',
        objet_id: dossier.id,
        avant: { statut: dossier.statut, bien_etat: bien?.etat, decision_suite: null },
        apres: {
          statut: 'clos',
          decision_autorite: corps.autorite,
          decision_reference: corps.reference,
          decision_date: corps.date_acte,
          decision_suite: corps.suite,
          bien_etat: sortDuService ? 'reforme' : bien?.etat,
          enregistree_par: request.agent.id,
        },
      });

      let mouvement = null;
      let bienApres = null;
      if (sortDuService) {
        // L'acte inscrit au registre porte la référence de la décision : c'est
        // elle, et non le SIGL, qui sort le bien du service.
        mouvement = await lireUn(
          request,
          `insert into mouvement (bien_id, structure_id, type, quantite, date,
                                  structure_source_code, motif, document_id)
           values ($1, $2, 'reforme', $3, $4::date, $5, $6, $7) returning *`,
          [
            bien.id, bien.structure_id, bien.quantite ?? 1, corps.date_acte,
            dossier.structure_code,
            // Le motif d'un mouvement se lit dans l'historique du bien : date
            // en français, et la suite en mots, pas en code d'énumération.
            `Réforme prononcée par ${corps.autorite} — acte ${corps.reference} du ${dateEnFrancais(corps.date_acte) ?? corps.date_acte} — suite : ${LIBELLES_SUITE[corps.suite] ?? corps.suite} — dossier ${dossier.numero}`,
            dossier.pv_document_id,
          ],
        );
        bienApres = await lireUn(
          request,
          `update bien set etat = 'reforme', reforme_le = $2::date, maj_le = now()
            where id = $1 returning id, etat, reforme_le, structure_id`,
          [bien.id, corps.date_acte],
        );
      }

      const clos = await lireUn(
        request,
        `update dossier_reforme
            set statut = 'clos', decision_autorite = $2, decision_reference = $3,
                decision_date = $4::date, decision_suite = $5, close_le = now(), maj_le = now()
          where id = $1 returning id, statut, close_le`,
        [dossier.id, corps.autorite, corps.reference, corps.date_acte, corps.suite],
      );
      return { dossier: clos, mouvement, bien: bienApres };
    });

    publier({
      type: 'decision_domaines',
      objet: 'reforme',
      id: dossier.id,
      structure_id: dossier.structure_id,
      donnees: {
        numero: dossier.numero, statut: 'clos', suite: corps.suite, autorite: corps.autorite,
      },
    });
    if (sortDuService) {
      publier({
        type: 'mouvement_reforme',
        objet: 'patrimoine',
        id: dossier.bien_id,
        structure_id: dossier.structure_id,
        donnees: { etat: 'reforme', origine: 'circuit de réforme', dossier: dossier.numero },
      });
    }
    return {
      ...(await chargerDossier(request, dossier.id)),
      mouvement: resultat.mouvement,
      bien_apres: resultat.bien,
    };
  });
}
