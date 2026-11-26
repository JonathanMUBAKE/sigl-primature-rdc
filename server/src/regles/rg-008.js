// RG-008 — Le système bloque et alerte si un découpage ferait passer un achat
// sous un seuil. Drapeau rouge R011.
// `dossiers_lies` : les dossiers récents de même objet, même structure, dans la
// fenêtre de surveillance, déjà chargés par la route.

import { procedurePourMontant, rangProcedure, plancherFranchi } from './seuils.js';

export function rg008({ montant_estime, seuils, dossiers_lies = [] } = {}) {
  const montant = Number(montant_estime);
  if (!Number.isFinite(montant) || montant <= 0) return null;

  const cumulLies = dossiers_lies.reduce((somme, d) => somme + Number(d.montant_estime ?? 0), 0);
  if (cumulLies <= 0) return null;

  const cumul = montant + cumulLies;
  const procedureSeule = procedurePourMontant(montant, seuils);
  const procedureCumul = procedurePourMontant(cumul, seuils);
  if (!procedureSeule || !procedureCumul) return null;

  if (rangProcedure(procedureCumul, seuils) > rangProcedure(procedureSeule, seuils)) {
    return {
      code: 'RG-008',
      message:
        `Regroupez ces achats en un seul dossier en procédure « ${procedureCumul} », ou justifiez l'écart : ` +
        `avec les ${dossiers_lies.length} dossier(s) de même objet ouvert(s) récemment, le cumul atteint ` +
        `${cumul.toLocaleString('fr-FR')} FC et franchit le seuil de ${plancherFranchi(cumul, seuils).toLocaleString('fr-FR')} FC, ` +
        `alors que ce dossier seul resterait en « ${procedureSeule} ».`,
      champ: 'montant_estime',
      alerte: {
        code: 'R011',
        gravite: 'critique',
        explication: "Découpage suspecté d'un achat pour rester sous un seuil de passation.",
        donnees: {
          montant_estime: montant,
          cumul,
          procedure_seule: procedureSeule,
          procedure_cumul: procedureCumul,
          dossiers_lies: dossiers_lies.map((d) => d.id ?? d.numero ?? null),
        },
      },
    };
  }
  return null;
}
