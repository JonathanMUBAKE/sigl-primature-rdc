// RG-007 — La procédure de passation découle du montant estimé et des seuils
// en vigueur à la date du dossier. Loi 10/010.
// Les seuils sont passés en argument : ils proviennent de la table `parametre`.

import { procedurePourMontant } from './seuils.js';

export function rg007({ montant_estime, seuils, procedure_proposee } = {}) {
  const montant = Number(montant_estime);
  if (!Number.isFinite(montant) || montant <= 0) {
    return {
      code: 'RG-007',
      message: "Saisissez le montant estimé du dossier, en francs congolais, strictement positif.",
      champ: 'montant_estime',
    };
  }
  const attendue = procedurePourMontant(montant, seuils);
  if (!attendue) {
    return {
      code: 'RG-007',
      message:
        "Faites renseigner les seuils de passation dans les paramètres avant d'ouvrir un dossier : la procédure ne peut pas être déterminée.",
      champ: 'procedure',
    };
  }
  if (procedure_proposee && procedure_proposee !== attendue) {
    return {
      code: 'RG-007',
      message:
        `Laissez la procédure déterminée par les seuils : pour ce montant la procédure applicable est « ${attendue} », non « ${procedure_proposee} ».`,
      champ: 'procedure',
    };
  }
  return null;
}
