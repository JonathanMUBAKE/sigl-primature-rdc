// RG-012 — Un bien de classement `stock` destiné à distribution gratuite doit
// porter un coût de remplacement. IPSAS 12 §17.

export function rg012(bien = {}) {
  const gratuit =
    bien.distribution_gratuite === true ||
    bien.objectif_detention === 'distribution_gratuite' ||
    bien.destination === 'distribution_gratuite';
  if (bien.classement === 'stock' && gratuit) {
    const cout = Number(bien.cout_remplacement);
    if (!Number.isFinite(cout) || cout <= 0) {
      return {
        code: 'RG-012',
        message:
          "Renseignez le coût de remplacement courant de cet article : un stock destiné à être distribué gratuitement s'évalue à ce coût (IPSAS 12 §17).",
        champ: 'cout_remplacement',
      };
    }
  }
  return null;
}
