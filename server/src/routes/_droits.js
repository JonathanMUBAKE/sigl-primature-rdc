// Les droits de la section 4, appliqués pour de bon.
//
// Pas de mot de passe à ce stade : l'en-tête `X-Agent-Id` désigne l'agent, le
// serveur charge ses rôles et en déduit sa portée. L'authentification réelle
// viendra plus tard ; les droits, eux, sont déjà en vigueur.
//
// Rien ici n'est décoré sur Fastify : ce sont des fonctions, appelées en
// `preHandler` ou en tête de route. Les règles RG-017 et RG-018 restent pures
// et vivent dans `regles/`.

import { consolidation, un as dbUn, tous as dbTous } from '../db.js';
import { lireTous, lireUn } from './_sql.js';
import { nonAutorise, nonTrouve, appliquer } from './_commun.js';
import { rg017 } from '../regles/rg-017.js';
import { rg018 } from '../regles/rg-018.js';
import { ROLES_LECTURE_SEULE, porteeTotale, aRole, structuresLisibles } from '../regles/roles.js';

// Les rôles qui n'écrivent jamais de métier : le contrôle externe (lecture
// seule stricte, journal compris), la direction (tableaux de bord consolidés),
// l'administrateur (référentiels, comptes et paramètres — jamais le métier,
// jamais le journal).
export const SANS_ECRITURE_METIER = ['controle_externe', 'direction', 'admin'];

const MOTIF_SANS_ECRITURE = {
  controle_externe: "le contrôle externe lit tout, y compris le journal, et n'écrit rien",
  direction: 'la direction consulte les tableaux de bord consolidés',
  admin: "l'administrateur tient les référentiels, les comptes et les paramètres, jamais une écriture métier",
};

export function estUuid(valeur) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(valeur ?? ''));
}

/** Charge l'agent désigné, ses rôles et sa structure. */
export async function chargerAgent(identifiant) {
  if (!estUuid(identifiant)) return null;
  // La lecture est consolidée : on ne sait pas encore de quelle structure
  // relève cet agent, donc aucun contexte ne peut être posé avant.
  return consolidation(() => chargerAgentEnContexte(identifiant));
}

async function chargerAgentEnContexte(identifiant) {
  const agent = await dbUn(
    `select a.id, a.nom, a.fonction, a.email, a.actif, a.structure_id,
            s.code as structure_code, s.nom as structure_nom,
            s.regime as structure_regime, s.type as structure_type
       from agent a join structure s on s.id = a.structure_id
      where a.id = $1`,
    [identifiant],
  );
  if (!agent) return null;
  const roles = await dbTous(
    'select role_code, structure_id, site_id from agent_role where agent_id = $1',
    [agent.id],
  );
  return {
    ...agent,
    roles: roles.map((r) => r.role_code),
    structures_de_portee: roles.map((r) => r.structure_id).filter(Boolean),
    sites_de_portee: roles.map((r) => r.site_id).filter(Boolean),
  };
}

/** Le hook posé une fois pour toutes dans app.js : l'identité de la requête.
 *
 *  L'en-tête `X-Agent-Id` est la voie normale. Mais `EventSource`, qui porte
 *  le flux temps réel, ne sait pas poser d'en-tête : le navigateur ne lui en
 *  donne pas le moyen. Le flux accepte donc l'agent en paramètre d'adresse.
 *
 *  Ce repli est **réservé au flux**, et il ne relâche aucun droit : l'agent
 *  ainsi désigné subit exactement les mêmes gardes et le même filtrage par
 *  structure. Il rend seulement lisible dans l'adresse ce qui serait sinon
 *  dans l'en-tête — ce qui, le jour où l'authentification réelle arrivera,
 *  devra passer par un jeton à usage unique plutôt que par un identifiant.
 */
export const CHEMIN_DU_REPLI = '/api/flux';

export async function identifier(request) {
  const enTete = request.headers['x-agent-id'];
  let parAdresse;
  if (!enTete && typeof request.url === 'string') {
    // `request.query` n'est pas encore peuplé au stade du hook : on lit
    // l'adresse. Le chemin est comparé **exactement**, pour qu'une route qui
    // commencerait par les mêmes lettres n'hérite pas du repli.
    const q = request.url.indexOf('?');
    const chemin = q === -1 ? request.url : request.url.slice(0, q);
    if (chemin === CHEMIN_DU_REPLI && q !== -1) {
      parAdresse = new URLSearchParams(request.url.slice(q + 1)).get('agent');
    }
  }
  request.agent = await chargerAgent(enTete || parAdresse || undefined);
}

// --- Les gardes ------------------------------------------------------------

/** Il faut un agent identifié et actif. */
export async function exigerAgent(request) {
  if (!request.agent) {
    throw nonAutorise(
      "Indiquez l'agent courant dans l'en-tête X-Agent-Id : choisissez votre profil pour accéder au SIGL.",
      'X-Agent-Id',
    );
  }
  if (request.agent.actif === false) {
    throw nonAutorise("Ce compte d'agent est désactivé : adressez-vous à l'administrateur.", 'X-Agent-Id');
  }
  return request.agent;
}

/** Garde de lecture : un agent, et l'un des rôles cités s'il en est demandé. */
export function lecture(...codes) {
  return async function gardeLecture(request) {
    await exigerAgent(request);
    if (codes.length > 0 && !aRole(request.agent, ...codes)) {
      throw nonAutorise(
        `Demandez cette consultation à un agent portant l'un des rôles suivants : ${codes.join(', ')}. Votre profil ne la permet pas.`,
      );
    }
  };
}

/** Garde d'écriture métier : le rôle, et jamais un rôle de lecture seule. */
export function ecriture(...codes) {
  return async function gardeEcriture(request) {
    await exigerAgent(request);
    const roles = request.agent.roles;
    const interdits = roles.filter((r) => SANS_ECRITURE_METIER.includes(r));
    const autorises = roles.filter((r) => !SANS_ECRITURE_METIER.includes(r));
    if (autorises.length === 0) {
      const motif = interdits.length > 0
        ? MOTIF_SANS_ECRITURE[interdits[0]]
        : 'aucun rôle métier ne vous est attribué';
      throw nonAutorise(`Faites porter cette écriture par un agent du métier : ${motif}.`);
    }
    if (codes.length > 0 && !aRole(request.agent, ...codes)) {
      throw nonAutorise(
        `Demandez cette opération à un agent portant l'un des rôles suivants : ${codes.join(', ')}. Votre profil ne la permet pas.`,
      );
    }
  };
}

// --- La portée : RG-017 en lecture, RG-018 en écriture --------------------

/** Les structures que l'agent peut lire, ou `null` quand il lit tout. */
export async function structuresDe(request) {
  if (porteeTotale(request.agent)) return null;
  const structures = await lireTous(request, 'select id, parent_id from structure');
  return structuresLisibles(request.agent, structures);
}

/** RG-017 — l'agent peut-il lire les données de cette structure ? */
export async function verifierLecture(request, structureId) {
  if (!structureId) return;
  if (porteeTotale(request.agent)) return;
  const structures = await lireTous(request, 'select id, parent_id from structure');
  appliquer(rg017({ agent: request.agent, structure_id: structureId, structures }), 403);
}

/**
 * RG-018 — l'agent peut-il écrire dans cette structure ?
 * Une structure de régime `autonome` n'est jamais écrite par le niveau
 * central : elle tient sa propre comptabilité des matières, le central n'en a
 * que la vue consolidée. Rend la structure cible.
 */
export async function verifierEcritureStructure(request, structureId) {
  if (!structureId) return null;
  const cible = await lireUn(request, 'select id, code, nom, regime from structure where id = $1', [structureId]);
  if (!cible) throw nonTrouve('La structure visée');
  appliquer(rg018({ agent: request.agent, structure_cible: cible }), 403);
  viser(request, cible.id);
  if (!porteeTotale(request.agent)) {
    const structures = await lireTous(request, 'select id, parent_id from structure');
    const permises = structuresLisibles(request.agent, structures).map(String);
    if (!permises.includes(String(structureId))) {
      throw nonAutorise(
        "Écrivez dans votre structure : cette opération concerne une structure qui n'est pas dans votre périmètre.",
        'structure_id',
      );
    }
  }
  return cible;
}

/**
 * Note à la transaction d'écriture : voici la structure visée par l'opération.
 * `enEcriture` s'y positionne quand son régime est `integre`. C'est ce qui
 * permet à une écriture du niveau central de se relire, sans jamais ouvrir la
 * porte d'un établissement autonome (RG-018, tenue aussi par la base).
 */
export function viser(request, structureId) {
  if (request && structureId) request.structureCible = String(structureId);
  return structureId;
}

export function estLectureSeule(agent) {
  return Boolean(agent) && agent.roles?.length > 0 &&
    agent.roles.every((r) => ROLES_LECTURE_SEULE.includes(r));
}

/** Le fragment SQL « structure_id dans mon périmètre », pour les listes. */
export function clauseStructures(structures, colonne = 'structure_id', indexDepart = 1) {
  if (structures === null) return { sql: '', params: [] };
  if (structures.length === 0) return { sql: 'and false', params: [] };
  const places = structures.map((_, i) => `$${indexDepart + i}`).join(', ');
  return { sql: `and ${colonne} in (${places})`, params: structures };
}
