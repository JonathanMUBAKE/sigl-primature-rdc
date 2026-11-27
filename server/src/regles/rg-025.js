// RG-025 — Un écart ne se tranche qu'après l'explication du détenteur.
// Décret 13/050 art. 122 : le détenteur atteste les biens qui lui sont affectés.
//
// L'ordre n'est pas une commodité de circuit, c'est le fond de l'article : celui
// qui détient le bien répond d'abord, et la décision se prend sur sa réponse.
// Trancher avant, c'est décider sans entendre.
//
// La règle refuse aussi un second arbitrage : un écart tranché est tranché, et
// la trace de la décision ne se réécrit pas (RG-019, même esprit).

export function rg025({ statut, explication } = {}) {
  if (statut === 'tranche') {
    return {
      code: 'RG-025',
      message:
        "Cet écart est déjà tranché : la décision est prise et conservée. Pour la reprendre, ouvrez un nouveau constat sur le bien.",
      champ: 'statut',
    };
  }
  if ((explication ?? '').toString().trim().length === 0) {
    return {
      code: 'RG-025',
      message:
        "Recueillez d'abord l'explication du détenteur : il atteste les biens qui lui sont affectés, et la décision se prend sur sa réponse.",
      champ: 'explication',
    };
  }
  return null;
}
