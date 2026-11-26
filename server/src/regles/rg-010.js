// RG-010 — Le certificat de prise en charge à l'inventaire n'est émis qu'après
// un PV de réception. Décret 13/050 art. 137.

export function rg010({ pv_reception } = {}) {
  if (!pv_reception) {
    return {
      code: 'RG-010',
      message:
        "Faites établir le procès-verbal de réception avant la prise en charge : le certificat de prise en charge à l'inventaire ne s'émet qu'après lui.",
      champ: 'pv_reception_id',
    };
  }
  if (pv_reception.type && pv_reception.type !== 'pv_reception') {
    return {
      code: 'RG-010',
      message:
        "La pièce jointe n'est pas un procès-verbal de réception : rattachez le PV de réception du bien.",
      champ: 'pv_reception_id',
    };
  }
  if (!pv_reception.signe_le || !pv_reception.signataire_id) {
    return {
      code: 'RG-010',
      message:
        "Faites signer le procès-verbal de réception : tant qu'il n'est pas signé, la prise en charge à l'inventaire reste impossible.",
      champ: 'pv_reception_id',
    };
  }
  return null;
}
