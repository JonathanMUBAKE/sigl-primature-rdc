// Le journal. RG-020 : toute action sensible y est inscrite AVANT d'être
// confirmée, avec son auteur et ses valeurs avant et après.
// Aucune fonction d'écriture ni de suppression n'existe ici : insertion seule.

import { requete } from '../db.js';

import { estSensible, rg020 } from '../regles/rg-020.js';
import { appliquer } from './_commun.js';

/**
 * Inscrit une ligne au journal. À appeler dans la transaction, avant que
 * l'action soit confirmée : si l'inscription échoue, la transaction tombe et
 * l'action n'a pas eu lieu.
 */
export async function journaliser({ agent_id = null, action, objet_type, objet_id = null, avant = null, apres = null, ip = null }) {
  // Pas de `returning` : le journal n'est relisible qu'en consolidation
  // (politique `journal_lecture`), et une transaction métier ne se relit pas
  // elle-même. L'inscription est confirmée par l'absence d'erreur — si elle
  // échoue, la transaction tombe et l'action n'a pas eu lieu (RG-020).
  await requete(
    `insert into journal (agent_id, action, objet_type, objet_id, avant, apres, ip)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      agent_id,
      action,
      objet_type,
      objet_id === null ? null : String(objet_id),
      avant === null ? null : JSON.stringify(avant),
      apres === null ? null : JSON.stringify(apres),
      ip,
    ],
  );
  return { inscrit: true, action, objet_type, objet_id: objet_id === null ? null : String(objet_id) };
}

/** Journalise depuis une requête Fastify : l'auteur et l'adresse viennent d'elle. */
export async function journaliserDepuis(request, { action, objet_type, objet_id = null, avant = null, apres = null }) {
  const ligne = await journaliser({
    agent_id: request.agent?.id ?? null,
    action,
    objet_type,
    objet_id,
    avant,
    apres,
    ip: request.ip ?? null,
  });
  // Le garde-fou de la règle : l'action sensible est bien inscrite.
  appliquer(rg020({ action, journalise: Boolean(ligne), avant, apres }));
  return ligne;
}

export { estSensible };
