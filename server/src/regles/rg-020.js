// RG-020 — Toute action sensible est journalisée avant d'être confirmée.
// La règle est pure : elle juge un état d'écriture, la route s'en sert comme
// garde-fou avant de confirmer quoi que ce soit.

export const ACTIONS_SENSIBLES = [
  'creation_bien', 'mouvement_bien', 'immatriculation', 'visa_besoin', 'examen_besoin',
  'accuse_besoin', 'cloture_besoin', 'sortie_stock', 'entree_stock', 'ouverture_dossier_achat',
  'emission_bon_commande', 'reception', 'prise_en_charge', 'paiement_possible',
  'emission_document', 'traitement_alerte', 'reforme', 'perte',
];

export function estSensible(action) {
  return ACTIONS_SENSIBLES.includes(action);
}

export function rg020({ action, journalise, avant, apres } = {}) {
  if (!estSensible(action)) return null;
  if (journalise !== true) {
    return {
      code: 'RG-020',
      message:
        `Journalisez l'action « ${action} » avant de la confirmer : toute action sensible est inscrite au journal, avec son auteur et ses valeurs avant et après.`,
      champ: 'journal',
    };
  }
  if (avant === undefined || apres === undefined) {
    return {
      code: 'RG-020',
      message:
        `Complétez l'entrée du journal pour « ${action} » : les valeurs avant et après doivent y figurer, même nulles.`,
      champ: 'journal',
    };
  }
  return null;
}
