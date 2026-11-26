// RG-003 — Une validation partielle exige un motif non vide.

export function rg003({ decision, motif } = {}) {
  if (decision === 'partielle' && (motif ?? '').toString().trim().length === 0) {
    return {
      code: 'RG-003',
      message:
        "Indiquez le motif de la validation partielle : dites pourquoi les quantités accordées sont inférieures aux quantités demandées.",
      champ: 'motif_decision',
    };
  }
  return null;
}
