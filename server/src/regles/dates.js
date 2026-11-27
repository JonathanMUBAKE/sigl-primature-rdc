// Les dates, en français, dans les messages du serveur.
//
// POURQUOI CE FICHIER EXISTE. Les messages de refus sont **affichés tels
// quels** par l'interface : c'est le contrat, et c'est ce qui garantit qu'un
// seul jugement est rendu, du côté serveur. La contrepartie est que ces phrases
// sont lues par un comptable des matières, pas par un développeur — et qu'il
// n'y a personne en aval pour rattraper une date mal formée.
//
// Un `Date.toString()` tronqué a déjà fait écrire « jusqu'au Wed Dec 16 » dans
// le verdict d'une offre de réemploi. C'est le genre de défaut qui ne casse
// rien et qui discrédite tout l'écran. La fonction ci-dessous est donc le seul
// endroit où une date devient du texte dans une règle de gestion.
//
// Fonctions pures, sans dépendance : pas d'`Intl`, pour que le texte ne change
// pas selon la locale de la machine qui exécute le serveur.

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/**
 * Une date en français : « 16 décembre 2026 », « 1er janvier 2027 ».
 *
 * Accepte un `Date` — ce que le pilote PostgreSQL rend pour `date` et
 * `timestamptz` —, une chaîne ISO, ou une chaîne `AAAA-MM-JJ`. Rend `null` sur
 * ce qu'elle ne sait pas lire, pour que l'appelant puisse **omettre** la
 * mention plutôt qu'écrire une date fausse.
 *
 * Une chaîne est lue **telle qu'elle est écrite**, chiffre par chiffre, et non
 * passée à `new Date` : une chaîne de jour seule y serait interprétée en UTC et
 * reculerait d'un jour à l'ouest de Greenwich. Un objet `Date`, lui, est lu
 * dans le fuseau du serveur, qui est celui de l'institution.
 */
export function dateEnFrancais(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;

  let annee;
  let mois;
  let jour;

  if (typeof valeur === 'string') {
    const lu = valeur.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!lu) return null;
    annee = Number(lu[1]);
    mois = Number(lu[2]);
    jour = Number(lu[3]);
  } else if (valeur instanceof Date) {
    if (Number.isNaN(valeur.getTime())) return null;
    annee = valeur.getFullYear();
    mois = valeur.getMonth() + 1;
    jour = valeur.getDate();
  } else {
    // Ni chaîne ni `Date` : on ne devine pas. Un nombre passé par erreur serait
    // lu comme un instant depuis 1970 et écrirait « 1er janvier 1970 » au
    // milieu d'une phrase, ce qui est pire qu'une mention absente.
    return null;
  }

  const nomDuMois = MOIS[mois - 1];
  if (!nomDuMois || jour < 1 || jour > 31) return null;
  // « le 1er », et non « le 1 ».
  return `${jour === 1 ? '1er' : jour} ${nomDuMois} ${annee}`;
}

/**
 * La mention « jusqu'au 16 décembre 2026 », ou la chaîne vide quand la date est
 * illisible. C'est la forme dont les messages ont besoin : une date absente ne
 * doit pas laisser un « jusqu'au » orphelin au milieu d'une phrase.
 */
export function mentionDeDate(prefixe, valeur) {
  const texte = dateEnFrancais(valeur);
  return texte ? ` ${prefixe} ${texte}` : '';
}

export { MOIS };
