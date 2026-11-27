// RG-033 — L'état `reforme` ne s'atteint que par le circuit de réforme, jamais
// par un mouvement direct. `docs/LOT-REFORME.md`.
//
// CE QUE CETTE RÈGLE FERME. Avant le lot « réforme », `POST
// /api/biens/:id/mouvements` acceptait le type `reforme` : un motif, un
// mouvement, l'état `reforme`, un PV, et c'était fini. C'était juste et c'était
// un raccourci — il n'y avait ni proposition, ni commission, ni offre de
// réemploi, ni saisine, ni suivi de la décision. Un bien sortait du service
// sans qu'aucune pièce ne prouve qu'il était inutilisable **pour toute la
// Primature**, et pas seulement pour la structure qui s'en lassait.
//
// Le refus **nomme la route du circuit**. Un refus qui ne dit pas par où
// passer n'est pas un contrôle, c'est un mur : celui qui le reçoit cherche le
// contournement au lieu de la bonne porte.

export const ROUTE_DU_CIRCUIT = 'POST /api/dossiers-reforme';

export function rg033({ type_mouvement, etat_cible, par_le_circuit = false } = {}) {
  if (par_le_circuit) return null;
  if (type_mouvement === 'reforme' || etat_cible === 'reforme') {
    return {
      code: 'RG-033',
      message:
        `Ouvrez un dossier de réforme (${ROUTE_DU_CIRCUIT}) : l'état « reforme » ne s'atteint que par le circuit — proposition, avis de la commission, offre de réemploi aux autres structures, saisine des domaines, puis enregistrement de leur décision. Un mouvement direct ne prouverait pas que le bien était inutilisable pour toute la Primature.`,
      champ: 'type',
    };
  }
  return null;
}
