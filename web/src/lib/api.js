/*
  Accès à l'API du SIGL — contrat technique, section 5.

  Préfixe /api, JSON uniquement, réponses en français.
  L'agent courant voyage dans l'en-tête X-Agent-Id : pas de mot de passe à ce
  stade, le serveur en déduit les rôles.

  Forme d'erreur, toujours celle-ci :
    { "erreur": { "code": "RG-002", "message": "…", "champ": "viseur_id" } }
  Le message français du serveur est remonté tel quel, sans réécriture.
*/

const CLE_AGENT = 'sigl.agent'

/** Erreur du SIGL : porte le code de la règle violée, le message et le champ. */
export class ErreurApi extends Error {
  constructor({ code, message, champ, statut }) {
    super(message)
    this.name = 'ErreurApi'
    this.code = code ?? 'erreur_inconnue'
    this.champ = champ ?? null
    this.statut = statut ?? 0
  }
}

export function agentCourant() {
  try {
    const brut = localStorage.getItem(CLE_AGENT)
    return brut ? JSON.parse(brut) : null
  } catch {
    return null
  }
}

export function definirAgentCourant(agent) {
  try {
    if (agent) localStorage.setItem(CLE_AGENT, JSON.stringify(agent))
    else localStorage.removeItem(CLE_AGENT)
  } catch {
    /* navigation privée : on continue sans mémoire */
  }
}

function construireUrl(chemin, parametres) {
  const url = `/api${chemin.startsWith('/') ? chemin : `/${chemin}`}`
  if (!parametres) return url
  const q = new URLSearchParams()
  for (const [cle, valeur] of Object.entries(parametres)) {
    if (valeur === undefined || valeur === null || valeur === '') continue
    q.set(cle, String(valeur))
  }
  const chaine = q.toString()
  return chaine ? `${url}?${chaine}` : url
}

async function appeler(methode, chemin, { parametres, corps, signal } = {}) {
  const agent = agentCourant()
  const entetes = { Accept: 'application/json' }
  if (corps !== undefined) entetes['Content-Type'] = 'application/json'
  if (agent?.id) entetes['X-Agent-Id'] = agent.id

  let reponse
  try {
    reponse = await fetch(construireUrl(chemin, parametres), {
      method: methode,
      headers: entetes,
      body: corps === undefined ? undefined : JSON.stringify(corps),
      signal,
    })
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause
    throw new ErreurApi({
      code: 'serveur_injoignable',
      message: "Le serveur du SIGL est injoignable. Vérifiez qu'il est démarré, puis réessayez.",
    })
  }

  if (reponse.status === 204) return null

  const typeContenu = reponse.headers.get('content-type') ?? ''
  let charge = null
  if (typeContenu.includes('application/json')) {
    try {
      charge = await reponse.json()
    } catch {
      charge = null
    }
  }

  if (!reponse.ok) {
    // Le serveur respecte la forme { erreur: { code, message, champ } }.
    const erreur = charge?.erreur
    if (erreur?.message) {
      throw new ErreurApi({ ...erreur, statut: reponse.status })
    }
    // Sinon : une réponse hors contrat. On le dit, en français, sans inventer.
    throw new ErreurApi({
      code: reponse.status === 404 ? 'non_trouve' : `http_${reponse.status}`,
      message:
        reponse.status === 404
          ? "Cette ressource n'existe pas, ou la route n'est pas encore servie par le serveur."
          : `Le serveur a répondu ${reponse.status} sans message exploitable.`,
      statut: reponse.status,
    })
  }

  return charge
}

const lire = (chemin, parametres, options) => appeler('GET', chemin, { parametres, ...options })
const poster = (chemin, corps, options) => appeler('POST', chemin, { corps, ...options })

/** Les routes du contrat, section 5. */
export const api = {
  sante: (o) => lire('/sante', null, o),

  structures: (p, o) => lire('/structures', p, o),

  // Les agents disponibles pour la démonstration : le serveur sert /profils.
  profils: (o) => lire('/profils', null, o),

  categories: (p, o) => lire('/categories', p, o),
  sites: (p, o) => lire('/sites', p, o),

  biens: (p, o) => lire('/biens', p, o),
  bien: (id, o) => lire(`/biens/${encodeURIComponent(id)}`, null, o),
  creerBien: (corps, o) => poster('/biens', corps, o),
  mouvementsDuBien: (id, o) => lire(`/biens/${encodeURIComponent(id)}/mouvements`, null, o),
  ajouterMouvement: (id, corps, o) =>
    poster(`/biens/${encodeURIComponent(id)}/mouvements`, corps, o),

  stocks: (p, o) => lire('/stocks', p, o),
  stock: (id, o) => lire(`/stocks/${encodeURIComponent(id)}`, null, o),

  besoins: (p, o) => lire('/besoins', p, o),
  besoin: (id, o) => lire(`/besoins/${encodeURIComponent(id)}`, null, o),
  cloreBesoin: (id, corps, o) => poster(`/besoins/${encodeURIComponent(id)}/clore`, corps, o),
  creerBesoin: (corps, o) => poster('/besoins', corps, o),
  viserBesoin: (id, corps, o) => poster(`/besoins/${encodeURIComponent(id)}/viser`, corps, o),
  examinerBesoin: (id, corps, o) => poster(`/besoins/${encodeURIComponent(id)}/examiner`, corps, o),
  accuserBesoin: (id, corps, o) => poster(`/besoins/${encodeURIComponent(id)}/accuser`, corps, o),

  fournisseurs: (p, o) => lire('/fournisseurs', p, o),

  creerDossierAchat: (corps, o) => poster('/dossiers-achat', corps, o),
  creerBonCommande: (corps, o) => poster('/bons-commande', corps, o),
  creerReception: (corps, o) => poster('/receptions', corps, o),
  creerPriseEnCharge: (corps, o) => poster('/prises-en-charge', corps, o),

  document: (id, o) => lire(`/documents/${encodeURIComponent(id)}`, null, o),

  alertes: (p, o) => lire('/alertes', p, o),
  alerte: (id, o) => lire(`/alertes/${encodeURIComponent(id)}`, null, o),
  traiterAlerte: (id, corps, o) => poster(`/alertes/${encodeURIComponent(id)}/traiter`, corps, o),

  tableauDeBord: (o) => lire('/tableau-de-bord', null, o),

  journal: (p, o) => lire('/journal', p, o),
}

export default api
