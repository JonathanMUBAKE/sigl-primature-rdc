// Les alertes. RG-022 : aucune alerte ne décide quoi que ce soit. Elle ouvre un
// examen, un humain tranche, et la suite est conservée.
// Lever une alerte n'écrit donc jamais dans un objet métier.

import { un } from '../db.js';

/**
 * Ouvre une alerte. Rien d'autre : l'état du dossier concerné n'est pas touché.
 * Appelée par les routes qui bloquent (RG-008) ou qui constatent un écart.
 */
export async function leverAlerte({
  code, gravite = 'attention', structure_id, objet_type, objet_id = null, explication, donnees = {},
}) {
  return un(
    `insert into alerte (code, gravite, structure_id, objet_type, objet_id, explication, donnees)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, code, gravite, structure_id, objet_type, objet_id, explication, donnees, statut, cree_le`,
    [
      code,
      gravite,
      structure_id,
      objet_type,
      objet_id === null ? null : String(objet_id),
      explication,
      JSON.stringify(donnees),
    ],
  );
}
