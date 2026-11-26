// RG-005 — Aucune sortie de stock supérieure à la quantité existante.

export function rg005({ quantite_demandee, quantite_disponible } = {}) {
  const demandee = Number(quantite_demandee);
  const disponible = Number(quantite_disponible ?? 0);
  if (!Number.isFinite(demandee) || demandee <= 0) {
    return {
      code: 'RG-005',
      message: "Saisissez une quantité à sortir strictement supérieure à zéro.",
      champ: 'quantite',
    };
  }
  if (demandee > disponible) {
    return {
      code: 'RG-005',
      message:
        `Réduisez la quantité à ${disponible} au plus, ou réapprovisionnez le magasin : le stock disponible est de ${disponible} pour ${demandee} demandée(s).`,
      champ: 'quantite',
    };
  }
  return null;
}
