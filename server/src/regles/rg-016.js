// RG-016 — Le SIGL ne prononce pas une cession ni une mise au rebut : il
// instruit et produit le PV. Décret 13/050.

const ACTIONS_INTERDITES = ['ceder', 'cession', 'mettre_au_rebut', 'rebut', 'vendre', 'aliener', 'declasser_definitivement'];

export function rg016({ action, decision_prononcee } = {}) {
  const demandee = String(action ?? '').toLowerCase();
  if (ACTIONS_INTERDITES.includes(demandee) || decision_prononcee === true) {
    return {
      code: 'RG-016',
      message:
        "Le SIGL n'arrête pas la cession ni la mise au rebut : instruisez le dossier et éditez le procès-verbal de réforme, la décision appartient à l'autorité compétente qui le signe.",
      champ: 'action',
    };
  }
  return null;
}
