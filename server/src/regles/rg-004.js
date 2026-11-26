// RG-004 — Un rejet exige un motif non vide.

export function rg004({ decision, motif } = {}) {
  if (decision === 'rejet' && (motif ?? '').toString().trim().length === 0) {
    return {
      code: 'RG-004',
      message:
        "Motivez le rejet : écrivez la raison du refus, elle sera notifiée au demandeur et conservée au dossier.",
      champ: 'motif_decision',
    };
  }
  return null;
}
