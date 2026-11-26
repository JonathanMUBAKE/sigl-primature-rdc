// aleatoire.js — Un générateur pseudo-aléatoire à graine fixe.
// Le jeu de démonstration doit être le même d'une exécution à l'autre : on
// compare des copies d'écran, on écrit des tests sur des volumes connus.

let etat = 0x53494749; // « SIGI »

export function reinitialiser(graine = 0x53494749) {
  etat = graine >>> 0;
}

/** Un flottant dans [0, 1). Mulberry32. */
export function hasard() {
  etat = (etat + 0x6d2b79f5) >>> 0;
  let t = etat;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Un entier dans [min, max]. */
export function entier(min, max) {
  return min + Math.floor(hasard() * (max - min + 1));
}

/** Un élément du tableau. */
export function parmi(tableau) {
  return tableau[Math.floor(hasard() * tableau.length)];
}

/** `n` éléments distincts du tableau, au plus sa longueur. */
export function plusieursParmi(tableau, n) {
  const copie = [...tableau];
  const choisis = [];
  while (choisis.length < Math.min(n, tableau.length)) {
    choisis.push(...copie.splice(Math.floor(hasard() * copie.length), 1));
  }
  return choisis;
}

/** Vrai avec la probabilité donnée. */
export function chance(probabilite) {
  return hasard() < probabilite;
}

const JOUR = 86_400_000;

/** Une date entre `ilYaJours` et `jusquAJours` avant aujourd'hui. */
export function dateEntre(ilYaJours, jusquAJours = 0) {
  const jours = entier(jusquAJours, ilYaJours);
  return new Date(Date.now() - jours * JOUR);
}

/** Le format `YYYY-MM-DD`, celui qu'attend PostgreSQL pour une `date`. */
export function jour(date) {
  return date.toISOString().slice(0, 10);
}

/** Un montant en francs congolais, arrondi à la centaine. */
export function montant(min, max) {
  return Math.round(entier(min, max) / 100) * 100;
}
