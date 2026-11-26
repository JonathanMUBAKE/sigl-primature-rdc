/*
  Le serveur accompagne ses chiffres d'un lien vers l'API : « /api/biens?etat=
  a_reparer ». L'écran, lui, a ses propres adresses. On traduit ici, en un
  seul endroit, et on ne devine rien : une famille sans écran ne donne pas de
  lien, et le chiffre n'est alors pas cliquable.
*/
const ECRANS = {
  biens: '/patrimoine',
  stocks: '/stocks',
  besoins: '/besoins',
  alertes: '/alertes',
  fournisseurs: '/fournisseurs',
  journal: '/journal',
}

/** Transforme un lien d'API en adresse d'écran, ou rend null. */
export function lienUi(lien) {
  if (!lien || typeof lien !== 'string') return null
  if (!lien.startsWith('/api/')) return lien
  const [chemin, requete] = lien.slice('/api/'.length).split('?')
  const famille = chemin.split('/')[0]
  const ecran = ECRANS[famille]
  if (!ecran) return null
  return requete ? `${ecran}?${requete}` : ecran
}
