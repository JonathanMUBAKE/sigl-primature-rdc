// RG-009 — Aucun bon de commande vers un fournisseur en liste noire. R046.

export function rg009({ fournisseur } = {}) {
  if (!fournisseur) {
    return {
      code: 'RG-009',
      message: "Choisissez le fournisseur attributaire avant d'émettre le bon de commande.",
      champ: 'fournisseur_id',
    };
  }
  if (fournisseur.liste_noire === true) {
    return {
      code: 'RG-009',
      message:
        `Choisissez un autre fournisseur : « ${fournisseur.denomination ?? 'ce fournisseur'} » est en liste noire. Sa radiation de la liste doit être décidée avant tout nouveau bon de commande.`,
      champ: 'fournisseur_id',
    };
  }
  if (fournisseur.actif === false) {
    return {
      code: 'RG-009',
      message:
        `Réactivez la fiche du fournisseur « ${fournisseur.denomination ?? '' }» ou choisissez-en un autre : elle est inactive.`,
      champ: 'fournisseur_id',
    };
  }
  return null;
}
