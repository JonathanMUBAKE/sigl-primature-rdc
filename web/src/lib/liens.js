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
  /*
    La chaîne des achats — RG-038. Sans ces trois familles, les chiffres
    d'action des achats n'étaient cliquables nulle part. Le dossier d'achat et
    le bon de commande se lisent au même endroit : l'écran des achats porte la
    liste des dossiers, et les bons d'un dossier se déplient dans son tiroir.
    La réception a son écran à elle, celui de la chaîne bon de commande → PV →
    certificat de prise en charge → paiement.
  */
  'dossiers-achat': '/achats',
  'bons-commande': '/achats',
  receptions: '/receptions',
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
  // L'état de besoin et le dossier d'achat ouvrent leur fiche à l'adresse
  // `/besoins/:id` et `/achats/:id` : le lien du serveur porte l'identifiant,
  // autant mener à la pièce plutôt qu'à la liste qui la contient.
  'besoins',
  'dossiers-achat',
])

/*
  Les filtres de l'API ne sont pas toujours ceux de l'écran. Transmettre un
  mot que l'écran ne sait pas lire ouvrirait une liste vide, ou filtrée sur
  autre chose : un cul-de-sac déguisé, que RG-038 n'accepte pas plus qu'un
  chiffre sans lien. On traduit donc explicitement, famille par famille, et à
  défaut d'équivalent on ouvre l'écran sans filtre.

  Une fonction rend la requête d'écran ; les familles absentes de cette table
  gardent la requête du serveur telle quelle.
*/
const REQUETES = {
  /*
    `/api/receptions?sans_certificat=true` compte les PV de réception auxquels
    il manque le certificat de prise en charge. À l'écran, c'est mot pour mot
    l'étape « prise en charge » de la chaîne.
  */
  receptions: (p) => (p.get('sans_certificat') === 'true' ? 'etape=prise_en_charge' : ''),
  /*
    Le bon de commande se lit à deux endroits, et ce n'est pas une hésitation :
    l'écran des achats porte le **dossier**, dont les bons se déplient dans un
    tiroir ; l'écran des réceptions porte le **bon** lui-même, ligne par ligne,
    rangé par étape de la chaîne du décret 13/050, article 137.

    Un chiffre d'action qui compte des bons mène donc aux réceptions, où la
    liste qui le compose se lit telle quelle — c'est RG-038 prise au mot :

      — `?sans_pv=true`         → l'étape « réception » : le PV manque ;
      — `?attend_paiement=true` → l'étape « paiement » : le certificat est émis,
                                  le paiement n'est pas encore marqué possible.

    Et pas `?statut=receptionne`, qui s'en approche et n'est pas la même chose :
    l'émission du certificat ne change pas le statut du bon, donc un bon
    « réceptionné » peut encore attendre son comptable des matières — c'est la
    file du chiffre précédent, pas celle-ci.

    Pour tout autre filtre, on ouvre la liste des dossiers **sans filtre** : le
    `?statut=` d'un bon (`emis`, `livre`…) n'est pas celui d'un dossier
    (`ouvert`, `attribue`…), et le transmettre ouvrirait une liste vide, ce qui
    ferait douter du chiffre plutôt que de l'expliquer.
  */
  'bons-commande': (p) => {
    if (p.get('sans_pv') === 'true') return { ecran: '/receptions', requete: 'etape=reception' }
    if (p.get('attend_paiement') === 'true') {
      return { ecran: '/receptions', requete: 'etape=paiement' }
    }
    return ''
  },
}

/** Transforme un lien d'API en adresse d'écran, ou rend null. */
export function lienUi(lien) {
  if (!lien || typeof lien !== 'string') return null
  if (!lien.startsWith('/api/')) return lien
  const [chemin, requete] = lien.slice('/api/'.length).split('?')
  const segments = chemin.split('/')
  const famille = segments[0]
  const ecran = ECRANS[famille]
  if (!ecran) return null
  const traduire = REQUETES[famille]
  // Une traduction peut changer d'écran : le même objet se lit parfois à deux
  // endroits, et c'est la liste qui compose le chiffre qui décide (RG-038).
  const traduit = traduire ? traduire(new URLSearchParams(requete ?? '')) : requete
  const detourne = traduit !== null && typeof traduit === 'object'
  const base = detourne ? traduit.ecran : ecran
  const adresse =
    !detourne && GARDENT_IDENTIFIANT.has(famille) && segments[1]
      ? `${base}/${segments[1]}`
      : base
  const requeteEcran = detourne ? traduit.requete : traduit
  return requeteEcran ? `${adresse}?${requeteEcran}` : adresse
}
