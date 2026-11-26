// RG-021 — Un bien suivi en `lot` n'a pas d'immatriculation individuelle.
// IPSAS 45 §8. Le seuil de suivi individuel est un paramètre, pas une constante :
// il est passé en argument.

export function suiviAttendu({ valeur_acquisition, seuil_suivi_individuel, suivi } = {}) {
  if (suivi) return suivi;
  const seuil = Number(seuil_suivi_individuel);
  const valeur = Number(valeur_acquisition);
  if (!Number.isFinite(seuil) || !Number.isFinite(valeur)) return 'individuel';
  return valeur >= seuil ? 'individuel' : 'lot';
}

export function rg021(bien = {}) {
  if (bien.suivi === 'lot') {
    if (bien.immatriculation) {
      return {
        code: 'RG-021',
        message:
          "Retirez l'immatriculation : un bien suivi en lot est compté en quantité, il ne porte pas de numéro individuel. Suivez-le en individuel si vous voulez l'immatriculer.",
        champ: 'immatriculation',
      };
    }
    const quantite = Number(bien.quantite ?? 0);
    if (!Number.isFinite(quantite) || quantite < 1) {
      return {
        code: 'RG-021',
        message: "Indiquez la quantité du lot : un bien suivi en lot se compte, au moins une unité.",
        champ: 'quantite',
      };
    }
  }
  return null;
}
