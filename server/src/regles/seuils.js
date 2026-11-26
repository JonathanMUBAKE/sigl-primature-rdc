// Lecture des seuils de passation. Les seuils viennent toujours de la table
// `parametre`, jamais d'une constante : ces fonctions ne font que les interpréter.
// Fonctions pures.

export const PROCEDURES = ['gre_a_gre', 'consultation', 'aon', 'aoi'];

// Normalise les seuils, quelle que soit leur écriture dans `parametre.valeur` :
//   { gre_a_gre: 0, consultation: 10000000, aon: 100000000, aoi: 2000000000 }
// ou [ { procedure: 'aon', plancher: 100000000 }, … ]
// Rend une liste triée du plancher le plus haut au plus bas.
export function normaliserSeuils(valeur) {
  let liste = [];
  if (Array.isArray(valeur)) {
    liste = valeur.map((s) => ({
      procedure: s.procedure ?? s.code,
      plancher: Number(s.plancher ?? s.seuil ?? s.montant ?? 0),
    }));
  } else if (valeur && typeof valeur === 'object') {
    liste = Object.entries(valeur).map(([procedure, plancher]) => ({
      procedure,
      plancher: Number(plancher),
    }));
  }
  return liste
    .filter((s) => PROCEDURES.includes(s.procedure) && Number.isFinite(s.plancher))
    .sort((a, b) => b.plancher - a.plancher);
}

// La procédure que commande un montant, au regard des seuils fournis.
// Rend null si les seuils sont absents ou illisibles : la route refuse alors
// de deviner plutôt que d'appliquer une constante.
export function procedurePourMontant(montant, seuils) {
  const echelle = normaliserSeuils(seuils);
  if (echelle.length === 0) return null;
  const valeur = Number(montant);
  if (!Number.isFinite(valeur) || valeur < 0) return null;
  const trouvee = echelle.find((s) => valeur >= s.plancher);
  return trouvee ? trouvee.procedure : echelle[echelle.length - 1].procedure;
}

// Le plancher au-dessus duquel un montant se situe, pour expliquer une alerte.
export function plancherFranchi(montant, seuils) {
  const echelle = normaliserSeuils(seuils);
  const valeur = Number(montant);
  const trouve = echelle.find((s) => valeur >= s.plancher);
  return trouve ? trouve.plancher : 0;
}

// Le rang d'une procédure : plus il est haut, plus la procédure est exigeante.
export function rangProcedure(procedure, seuils) {
  const echelle = normaliserSeuils(seuils).slice().sort((a, b) => a.plancher - b.plancher);
  const index = echelle.findIndex((s) => s.procedure === procedure);
  return index === -1 ? -1 : index;
}
