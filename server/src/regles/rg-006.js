// RG-006 — Un état de besoin ne se clôt pas sans accusé de réception signé.

export function rg006({ accuse } = {}) {
  if (!accuse) {
    return {
      code: 'RG-006',
      message:
        "Faites établir l'accusé de réception par le demandeur avant de clore l'état de besoin.",
      champ: 'accuse_reception',
    };
  }
  if (accuse.type && accuse.type !== 'accuse_reception') {
    return {
      code: 'RG-006',
      message:
        "La pièce fournie n'est pas un accusé de réception : joignez l'accusé de réception signé du demandeur.",
      champ: 'accuse_reception',
    };
  }
  if (!accuse.signe_le || !accuse.signataire_id) {
    return {
      code: 'RG-006',
      message:
        "Faites signer l'accusé de réception : il est enregistré mais pas encore signé, la clôture reste impossible.",
      champ: 'accuse_reception',
    };
  }
  return null;
}
