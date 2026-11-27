// RG-020 — Toute action sensible est journalisée avant d'être confirmée.
// La règle est pure : elle juge un état d'écriture, la route s'en sert comme
// garde-fou avant de confirmer quoi que ce soit.

export const ACTIONS_SENSIBLES = [
  // `immatriculation` a été retirée : aucune route ne l'a jamais émise. Le
  // numéro d'immatriculation est attribué dans `POST /api/biens` et figure dans
  // les valeurs « après » de l'action `creation_bien` — il est donc tracé, et
  // une seconde ligne de journal l'aurait seulement redoublé. Une déclaration
  // qu'aucun code n'émet donne l'illusion d'une garde qui n'existe pas.
  'creation_bien', 'mouvement_bien', 'visa_besoin', 'examen_besoin',
  'accuse_besoin', 'cloture_besoin', 'sortie_stock', 'entree_stock', 'ouverture_dossier_achat',
  'emission_bon_commande', 'reception', 'prise_en_charge', 'paiement_possible',
  'emission_document', 'traitement_alerte', 'reforme', 'perte',
  // Quatre actions qui manquaient depuis l'origine, découvertes par l'essai
  // structurel de `rg-020.test.js` : la création d'un état de besoin, le
  // réglage des seuils d'un article — un minimum porté de 40 à 5 la veille
  // d'une rupture est précisément ce que le journal doit retenir —, la mise en
  // liste noire d'un fournisseur et le blocage d'un découpage d'achat
  // (RG-008). Toutes étaient déjà inscrites au journal par leurs routes ; elles
  // n'étaient pas déclarées, donc la règle ne les gardait pas.
  'creation_besoin', 'reglage_seuils_stock', 'liste_noire_fournisseur',
  'blocage_decoupage_achat',
  // L'inventaire physique et le rapprochement contradictoire. Ces douze
  // actions étaient journalisées par leurs routes dès leur écriture, mais
  // n'étaient pas **déclarées** ici : le garde-fou de la règle ne mordait donc
  // pas sur elles. Une action sensible absente de cette liste est une action
  // que le serveur a le droit de confirmer sans trace, et personne ne le voit.
  'creation_campagne_inventaire', 'designation_agent_inventaire',
  'ouverture_campagne_inventaire', 'constat_inventaire', 'cloture_campagne_inventaire',
  'explication_ecart_inventaire', 'arbitrage_ecart_inventaire',
  'ouverture_rapprochement', 'poste_rapprochement', 'partie_rapprochement',
  'attestation_rapprochement', 'cloture_rapprochement',
  // Le circuit de réforme et l'offre de réemploi. Onze actions, et aucune n'est
  // anodine : chacune rapproche un bien de la sortie du service, ou le fait
  // changer de main. `enregistrement_decision_domaines` et `reemploi_prononce`
  // sont les deux plus lourdes du lot — l'une sort le bien du service, l'autre
  // le transfère d'une structure à une autre —, et c'est pour celles-là surtout
  // que le journal doit porter l'avant et l'après.
  'proposition_reforme', 'designation_commission_reforme', 'avis_commission_reforme',
  'conclusion_commission_reforme', 'ouverture_offre_reemploi', 'saisine_domaines',
  'enregistrement_decision_domaines',
  'demande_reemploi', 'cloture_offre_reemploi', 'arbitrage_demande_reemploi',
  'reemploi_prononce',
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
