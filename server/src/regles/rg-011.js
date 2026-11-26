// RG-011 — Aucun paiement n'est marqué possible sans certificat de prise en
// charge. Décret 13/050 art. 137.

export function rg011({ certificat } = {}) {
  if (!certificat) {
    return {
      code: 'RG-011',
      message:
        "Faites d'abord prendre le bien en charge à l'inventaire : le paiement ne devient possible qu'au vu du certificat de prise en charge.",
      champ: 'certificat_id',
    };
  }
  if (certificat.type && certificat.type !== 'certificat_prise_en_charge') {
    return {
      code: 'RG-011',
      message:
        "La pièce jointe n'est pas un certificat de prise en charge : rattachez le certificat de prise en charge à l'inventaire.",
      champ: 'certificat_id',
    };
  }
  if (!certificat.signe_le || !certificat.signataire_id) {
    return {
      code: 'RG-011',
      message:
        "Faites signer le certificat de prise en charge par le comptable des matières avant de marquer le paiement possible.",
      champ: 'certificat_id',
    };
  }
  return null;
}
