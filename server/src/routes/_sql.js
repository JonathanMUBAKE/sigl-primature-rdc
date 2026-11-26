// Le contexte de cloisonnement, vu des routes.
//
// `db.js` (ADR-001) refuse toute requête hors de l'une de ses trois portes :
// `transaction(contexte, fn)` pour le métier, `consolidation(fn)` pour la
// lecture de tout, `enPrivilegie(fn)` pour les scripts — qu'aucune route
// n'appelle. Ce module choisit la bonne porte à partir de l'agent courant, et
// la choisit **une seule fois** : si un contexte est déjà ouvert, on y reste.
//
// La règle du choix :
//   — portée totale (logistique, direction, contrôle externe) → consolidation,
//     lecture de toutes les structures, écriture d'aucune ;
//   — tout autre rôle → transaction positionnée sur **sa** structure.
//
// L'écriture, elle, est toujours une transaction positionnée sur la structure
// de l'agent. C'est ce positionnement qui fait tenir RG-018 dans la base :
// `sigl_ecriture_permise` n'autorise que sa propre structure et les structures
// de régime `integre`. Un agent du niveau central ne peut donc pas écrire chez
// un établissement autonome, quoi qu'il demande.

import {
  consolidation, contexteCourant, transaction,
  un as dbUn, tous as dbTous, requete as dbRequete,
} from '../db.js';
import { nonAutorise } from './_commun.js';
import { porteeTotale } from '../regles/roles.js';

/** Ouvre, si besoin, le contexte de lecture qui convient à l'agent. */
export async function enLecture(request, fn) {
  if (contexteCourant()) return fn();
  const agent = request?.agent ?? null;
  if (!agent) {
    // Les routes sans agent (santé, profils) lisent le référentiel en consolidé.
    return consolidation(() => fn());
  }
  if (porteeTotale(agent)) {
    return consolidation(() => fn(), { agentId: agent.id });
  }
  return transaction({ agentId: agent.id, structureId: agent.structure_id }, () => fn());
}

/**
 * Ouvre, si besoin, la transaction d'écriture.
 *
 * Elle se positionne sur la structure **visée** quand celle-ci est de régime
 * `integre` : son patrimoine est celui de la Primature, le niveau central y
 * écrit, et la transaction peut alors relire ce qu'elle vient d'écrire.
 * Sinon elle se positionne sur la structure de l'agent — et c'est ainsi que
 * RG-018 tient dans la base : vers un établissement autonome dont on n'est pas
 * membre, `sigl_ecriture_permise` refuse, en plus du refus déjà prononcé par la
 * règle côté serveur.
 */
export async function enEcriture(request, fn, cibleDemandee = null) {
  const structureCible = cibleDemandee ?? request?.structureCible ?? null;
  if (contexteCourant()) return fn();
  const agent = request?.agent ?? null;
  if (!agent) {
    throw nonAutorise(
      "Indiquez l'agent courant dans l'en-tête X-Agent-Id : aucune écriture n'est possible sans agent identifié.",
      'X-Agent-Id',
    );
  }
  let structureId = agent.structure_id;
  if (structureCible && String(structureCible) !== String(agent.structure_id)) {
    const cible = await consolidation(
      () => dbUn('select id, regime from structure where id = $1', [structureCible]),
    );
    if (cible?.regime === 'integre') structureId = cible.id;
  }
  return transaction({ agentId: agent.id, structureId }, () => fn());
}

// --- Les aides de lecture, qui ouvrent le contexte si nécessaire ---------
// Elles rendent exactement ce que rendent celles de `db.js`, et s'emploient
// partout : dans une phase de lecture comme au milieu d'une écriture.

export async function lireUn(request, sql, params = []) {
  return enLecture(request, () => dbUn(sql, params));
}

export async function lireTous(request, sql, params = []) {
  return enLecture(request, () => dbTous(sql, params));
}

export async function lireRequete(request, sql, params = []) {
  return enLecture(request, () => dbRequete(sql, params));
}

/** La consolidation nommée : lecture de toutes les structures, sans écriture. */
export async function enConsolidation(request, fn) {
  if (contexteCourant()) return fn();
  return consolidation(() => fn(), { agentId: request?.agent?.id ?? null });
}
