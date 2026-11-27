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
  // L'inventaire physique : la campagne est le poste de travail, et l'écart
  // n'a pas d'écran à lui — il se tranche dans sa campagne.
  'campagnes-inventaire': '/inventaire',
  'ecarts-inventaire': '/inventaire',
  rapprochements: '/rapprochements',
  // Le circuit de réforme : le dossier est le poste de travail, et l'offre de
  // réemploi se lit au catalogue — celui-ci n'ouvre pas une offre par adresse,
  // il la montre dans un tiroir, donc le lien retombe sur le catalogue.
  'dossiers-reforme': '/reforme',
  'offres-reemploi': '/reemploi',
  'demandes-reemploi': '/reemploi',
}

/*
  Les familles dont l'écran de détail s'ouvre à `/ecran/:id` : le lien du
  serveur porte l'identifiant, et on le garde plutôt que de retomber sur la
  liste. Pour les autres, le comportement ne change pas.
*/
const GARDENT_IDENTIFIANT = new Set([
  'campagnes-inventaire',
  'rapprochements',
  'dossiers-reforme',
])

/** Transforme un lien d'API en adresse d'écran, ou rend null. */
export function lienUi(lien) {
  if (!lien || typeof lien !== 'string') return null
  if (!lien.startsWith('/api/')) return lien
  const [chemin, requete] = lien.slice('/api/'.length).split('?')
  const segments = chemin.split('/')
  const famille = segments[0]
  const ecran = ECRANS[famille]
  if (!ecran) return null
  const adresse =
    GARDENT_IDENTIFIANT.has(famille) && segments[1] ? `${ecran}/${segments[1]}` : ecran
  return requete ? `${adresse}?${requete}` : adresse
}
