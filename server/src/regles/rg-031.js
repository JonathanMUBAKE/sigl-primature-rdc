// RG-031 — Un avis de commission exige un motif, favorable comme défavorable.
//
// Le « comme défavorable » n'est pas une précaution de rédaction : c'est tout
// le sens de la règle. Un avis défavorable motivé est banal — on explique
// pourquoi le bien sert encore. Un avis **favorable** non motivé est le vrai
// risque : c'est la signature de complaisance par laquelle un matériel en état
// sort du service. Le motif est la pièce qui permettra, deux ans plus tard, de
// relire la délibération et de juger si elle tenait.
//
// Même exigence que RG-003 et RG-004 pour la validation partielle et le rejet
// d'un état de besoin : une décision sans motif est une décision illisible.

const AVIS = ['favorable', 'defavorable'];

export function rg031({ avis, motif } = {}) {
  if (!AVIS.includes(avis)) {
    return {
      code: 'RG-031',
      message: "Indiquez l'avis de la commission : « favorable » ou « defavorable ».",
      champ: 'avis',
    };
  }
  if ((motif ?? '').toString().trim().length === 0) {
    return {
      code: 'RG-031',
      message:
        avis === 'favorable'
          ? "Écrivez pourquoi la commission est favorable à la réforme : un avis favorable non motivé est celui qu'on ne pourra pas relire."
          : "Écrivez pourquoi la commission est défavorable : le bien reste en service, et le dossier doit dire sur quoi cet avis s'appuie.",
      champ: 'motif',
    };
  }
  return null;
}

export { AVIS };
