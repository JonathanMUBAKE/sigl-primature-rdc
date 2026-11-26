// RG-001 — Un état de besoin sans justification ne peut pas être visé.
// Fonction pure : reçoit l'état de besoin déjà chargé, rend null ou une erreur.

export function rg001(besoin = {}) {
  const justification = (besoin.justification ?? '').toString().trim();
  if (justification.length === 0) {
    return {
      code: 'RG-001',
      message:
        "Renseignez la justification du besoin avant de le viser : expliquez en quelques lignes à quoi servent les articles demandés.",
      champ: 'justification',
    };
  }
  return null;
}
