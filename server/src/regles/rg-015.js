// RG-015 — Un bien ne disparaît jamais : perte et vol le laissent au registre
// dans un état distinct.

const ETATS_DE_SORTIE = { perte: 'perdu', reforme: 'reforme' };

export function rg015({ type_mouvement, supprime_la_fiche, etat_cible } = {}) {
  if (supprime_la_fiche === true) {
    return {
      code: 'RG-015',
      message:
        "N'effacez pas la fiche du bien : enregistrez un mouvement de perte ou de réforme, le bien reste au registre dans un état distinct.",
      champ: 'bien_id',
    };
  }
  const attendu = ETATS_DE_SORTIE[type_mouvement];
  if (attendu && etat_cible && etat_cible !== attendu) {
    return {
      code: 'RG-015',
      message:
        `Portez le bien à l'état « ${attendu} » : un mouvement de ${type_mouvement} ne retire pas le bien du registre, il change son état.`,
      champ: 'etat',
    };
  }
  return null;
}
