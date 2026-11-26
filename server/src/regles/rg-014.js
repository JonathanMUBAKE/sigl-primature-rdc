// RG-014 — Un bien reçu sans contrepartie est évalué au coût réputé s'il est
// immobilisation, à la juste valeur s'il est stock. IPSAS 45 §12, IPSAS 12 §16.

export const BASES = {
  achat: 'cout',
  immobilisation: 'cout_repute',
  stock: 'juste_valeur',
};

export function baseEvaluationAttendue({ mode_entree, classement } = {}) {
  if (mode_entree === 'achat') return BASES.achat;
  if (mode_entree === 'don' || mode_entree === 'transfert') {
    return classement === 'stock' ? BASES.stock : BASES.immobilisation;
  }
  return null;
}

export function rg014(bien = {}) {
  const attendue = baseEvaluationAttendue(bien);
  if (!attendue) {
    return {
      code: 'RG-014',
      message:
        "Indiquez le mode d'entrée du bien — achat, don ou transfert : c'est lui qui commande la base d'évaluation.",
      champ: 'mode_entree',
    };
  }
  if (bien.base_evaluation && bien.base_evaluation !== attendue) {
    const libelle = attendue === 'juste_valeur' ? 'la juste valeur à la date d\'entrée' : attendue === 'cout_repute' ? 'le coût réputé' : 'le coût d\'acquisition';
    return {
      code: 'RG-014',
      message:
        `Évaluez ce bien à ${libelle} : c'est la base imposée pour un bien ${bien.mode_entree === 'achat' ? 'acheté' : 'reçu sans contrepartie'} classé en ${bien.classement ?? 'immobilisation'}.`,
      champ: 'base_evaluation',
    };
  }
  const brut = bien.valeur_acquisition;
  const valeur = brut === null || brut === undefined || brut === '' ? NaN : Number(brut);
  if (!Number.isFinite(valeur) || valeur <= 0) {
    return {
      code: 'RG-014',
      message:
        "Renseignez la valeur d'entrée du bien, même reçu gratuitement : un bien sans contrepartie entre au coût réputé ou à la juste valeur, jamais à zéro par défaut.",
      champ: 'valeur_acquisition',
    };
  }
  return null;
}
