// RG-028 — Aucune saisine des domaines sans offre de réemploi close.
// `docs/LOT-REFORME.md`, étapes 3 et 6 ; CONCEPTION §13.
//
// POURQUOI CETTE RÈGLE EXISTE. L'offre de réemploi est le seul objet
// économique du lot : avant qu'un bien sorte du patrimoine de la Primature, les
// autres structures doivent avoir eu l'occasion de le reprendre. Saisir les
// domaines sans être passé par là, c'est réformer d'un côté ce qu'on rachètera
// de l'autre — et aucune pièce du dossier ne prouverait que le bien était
// inutilisable **pour toute la Primature**, et pas seulement pour la structure
// qui s'en lasse.
//
// CE QUE « SANS OFFRE DE RÉEMPLOI CLOSE » VEUT DIRE, ET QUI A ÉTÉ TRANCHÉ.
//
// L'esprit de la règle n'est pas « une offre close » mais **« le réemploi a été
// réellement cherché »**. Une offre close sur une demande laissée sans réponse
// prouve le contraire : on réformerait ce qu'une autre structure voulait
// reprendre — précisément le gaspillage que ce lot existe pour empêcher — et on
// laisserait cette structure sans réponse pour toujours, ce qui est un défaut de
// l'outil et non une rigueur.
//
// Décision du chef de projet, 27 novembre 2026 : la règle compte donc aussi les
// demandes **pendantes**, et son refus nomme ce qu'il faut faire — les
// trancher, en les écartant si elles ne sont pas retenues. Écarter une demande
// n'est plus une politesse, c'est un passage obligé du circuit.
//
// La règle ne juge que l'offre et les demandes qui s'y rattachent. Qu'une offre
// encore ouverte interdise la réforme est le fait de RG-029, qui le dit mieux :
// elle nomme la date de clôture annoncée. Les deux règles se complètent, et
// l'une refuse encore ce que l'autre refuse déjà — c'est voulu : retirer l'une
// ne doit pas ouvrir la porte.

/** Les demandes qui attendent encore une réponse. */
export function demandesPendantes(demandes = []) {
  return demandes.filter((d) => d?.statut === 'deposee');
}

export function rg028({ offre, demandes = [] } = {}) {
  if (!offre) {
    return {
      code: 'RG-028',
      message:
        "Offrez d'abord le bien aux autres structures : les domaines ne se saisissent qu'après une offre de réemploi close, qui prouve qu'aucune autre structure n'en voulait.",
      champ: 'offre',
    };
  }
  if (offre.statut !== 'close') {
    return {
      code: 'RG-028',
      message:
        `L'offre de réemploi ${offre.numero ?? ''} n'est pas close : clôturez-la, ou attendez son terme, avant de saisir les domaines.`.replace(/\s{2,}/g, ' '),
      champ: 'offre',
    };
  }
  const pendantes = demandesPendantes(demandes);
  if (pendantes.length > 0) {
    const nommees = pendantes
      .map((d) => d.structure_demandeuse_nom)
      .filter(Boolean);
    const qui = nommees.length > 0 ? ` — ${nommees.join(', ')}` : '';
    return {
      code: 'RG-028',
      message:
        `${pendantes.length} demande${pendantes.length > 1 ? 's' : ''} de réemploi ${pendantes.length > 1 ? 'attendent' : 'attend'} encore une réponse${qui}. `
        + `Tranchez-${pendantes.length > 1 ? 'les' : 'la'} avant de saisir les domaines : acceptez-${pendantes.length > 1 ? 'en' : 'la'} une, ou écartez-${pendantes.length > 1 ? 'les' : 'la'} en disant pourquoi. `
        + "Réformer un bien qu'une autre structure a demandé, c'est jeter ce que quelqu'un voulait reprendre.",
      champ: 'demandes',
    };
  }
  return null;
}
