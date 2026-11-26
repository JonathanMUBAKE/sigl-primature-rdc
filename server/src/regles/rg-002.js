// RG-002 — Un chef de structure ne peut pas viser un état de besoin dont il est le demandeur.
// Séparation des fonctions : qui demande ne vise pas.

export function rg002({ demandeur_id, viseur_id } = {}) {
  if (demandeur_id && viseur_id && String(demandeur_id) === String(viseur_id)) {
    return {
      code: 'RG-002',
      message:
        "Faites viser cette demande par un autre responsable : le demandeur ne peut pas viser son propre état de besoin.",
      champ: 'viseur_id',
    };
  }
  return null;
}
