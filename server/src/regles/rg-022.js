// RG-022 — Une alerte ne change aucun état métier. Elle ouvre un examen, un
// humain tranche, et la suite est conservée.

const CHAMPS_ALERTE = ['statut', 'traite_par', 'traite_le', 'suite'];
const STATUTS = ['ouverte', 'en_examen', 'justifiee', 'confirmee', 'classee'];

export function rg022({ statut, suite, changements = {} } = {}) {
  const horsAlerte = Object.keys(changements).filter((c) => !CHAMPS_ALERTE.includes(c));
  if (horsAlerte.length > 0) {
    return {
      code: 'RG-022',
      message:
        `Traitez l'alerte sans toucher au dossier : le traitement d'une alerte n'écrit que son statut et sa suite, jamais ${horsAlerte.join(', ')}. Agissez sur le dossier par sa propre route.`,
      champ: 'changements',
    };
  }
  if (statut && !STATUTS.includes(statut)) {
    return {
      code: 'RG-022',
      message: `Choisissez un statut d'alerte parmi : ${STATUTS.join(', ')}.`,
      champ: 'statut',
    };
  }
  if ((statut === 'justifiee' || statut === 'confirmee' || statut === 'classee') &&
      (suite ?? '').toString().trim().length === 0) {
    return {
      code: 'RG-022',
      message:
        "Écrivez la suite donnée à l'alerte : la décision humaine est conservée avec elle, c'est tout ce que l'alerte produit.",
      champ: 'suite',
    };
  }
  return null;
}
