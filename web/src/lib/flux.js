import { useCallback, useEffect, useRef, useState } from 'react'
import { agentCourant } from './api.js'

/*
  Le temps réel du SIGL — GET /api/flux, en Server-Sent Events.

  Une seule liaison pour toute l'application, partagée par tous les écrans.
  EventSource ne sait pas porter d'en-tête : l'agent courant voyage donc en
  paramètre `agent`, et le serveur applique les mêmes droits qu'ailleurs.

  Forme attendue d'un événement — on reste tolérant, et rien n'est inventé :
    { sujet: "patrimoine", type: "mouvement", id: "<uuid>", ... }
  `sujet` ∈ patrimoine, stocks, besoins, alertes, achats, journal, tableau-de-bord
  À défaut de `sujet` dans la charge, le nom de l'événement SSE fait office.

  Reconnexion : 1 s, 2 s, 4 s, 8 s, puis 15 s au plus. Une fenêtre qui revient
  au premier plan tente immédiatement.
*/

export const LIAISON_EN_ATTENTE = 'en_attente'
export const LIAISON_OUVERTE = 'ouverte'
export const LIAISON_ROMPUE = 'rompue'

/*
  Le serveur nomme ses événements d'après le champ `objet` de la charge —
  `stock`, `achat`, `bon_commande`, `document`… — au singulier, tandis que les
  écrans s'abonnent à des sujets au pluriel. On traduit ici, en un seul
  endroit, et on écoute les deux écritures : sans cela, `addEventListener`
  n'entend rien et le temps réel reste muet.
*/
const SUJETS = [
  'patrimoine',
  'stocks',
  'besoins',
  'alertes',
  'achats',
  'documents',
  'journal',
  'tableau-de-bord',
  // L'inventaire et le rapprochement sont nommés AU SINGULIER par le serveur,
  // qui les pose tels quels dans `objet` et dans `event:`. On s'y abonne sous
  // ce nom-là : écouter « inventaires » ne rendrait qu'un flux muet.
  'inventaire',
  'rapprochement',
  // Le circuit de réforme et l'offre de réemploi, eux aussi AU SINGULIER :
  // `reforme` (dossier, avis, décision) et `reemploi` (offre, demande). Au
  // singulier, parce qu'un flux silencieux ressemble à un flux calme — la
  // faute a déjà été payée une fois sur l'inventaire.
  'reforme',
  'reemploi',
]

/** Les sujets qu'un `objet` du serveur concerne. Le premier est le principal. */
const SUJETS_PAR_OBJET = {
  patrimoine: ['patrimoine'],
  bien: ['patrimoine'],
  mouvement: ['patrimoine'],
  stock: ['stocks'],
  stocks: ['stocks'],
  besoin: ['besoins'],
  besoins: ['besoins'],
  etat_besoin: ['besoins', 'documents'],
  alerte: ['alertes'],
  alertes: ['alertes'],
  achat: ['achats'],
  achats: ['achats'],
  dossier_achat: ['achats'],
  bon_commande: ['achats'],
  pv_reception: ['documents', 'achats'],
  document: ['documents', 'achats'],
  documents: ['documents'],
  journal: ['journal'],
  'tableau-de-bord': ['tableau-de-bord'],
  // L'inventaire physique — campagne, constat, écart — et le rapprochement
  // contradictoire. Le serveur publie `objet: 'inventaire'` et
  // `objet: 'rapprochement'` ; les noms de table sont admis par prudence, pour
  // qu'un événement nommé autrement ne tombe pas dans le vide.
  inventaire: ['inventaire'],
  campagne_inventaire: ['inventaire'],
  constat_inventaire: ['inventaire'],
  ecart_inventaire: ['inventaire'],
  rapprochement: ['rapprochement'],
  rapprochement_poste: ['rapprochement'],
  rapprochement_partie: ['rapprochement'],
  pv_perte: ['documents', 'inventaire'],
  // Le circuit de réforme et l'offre de réemploi. Le serveur publie
  // `objet: 'reforme'` et `objet: 'reemploi'` ; les noms de table sont admis
  // par prudence. Un réemploi prononcé touche aussi le patrimoine : le bien
  // change de structure dans la même transaction.
  reforme: ['reforme'],
  dossier_reforme: ['reforme'],
  avis_commission: ['reforme'],
  commission_reforme: ['reforme'],
  decision_domaines: ['reforme'],
  pv_reforme: ['documents', 'reforme'],
  reemploi: ['reemploi'],
  offre_reemploi: ['reemploi'],
  demande_reemploi: ['reemploi'],
  acte_transfert: ['documents', 'reemploi', 'patrimoine'],
}

/** Tous les noms d'événement que le serveur peut poser dans `event:`. */
const NOMS_ECOUTES = [...new Set([...SUJETS, ...Object.keys(SUJETS_PAR_OBJET)])]

function sujetsDe(charge, nomDeLEvenement) {
  const candidats = [charge?.sujet, charge?.domaine, charge?.objet, nomDeLEvenement]
  for (const candidat of candidats) {
    if (!candidat) continue
    const trouves = SUJETS_PAR_OBJET[String(candidat)]
    if (trouves) return trouves
  }
  const premier = candidats.find(Boolean)
  return premier ? [String(premier)] : ['inconnu']
}

const auditeurs = new Set() // (evenement) => void
const veilleursDeLiaison = new Set() // (etat) => void

// Au-delà de ce nombre d'échecs d'affilée, on cesse d'appeler : si le
// serveur refuse la liaison — il lit l'agent dans un en-tête, et EventSource
// ne sait pas en poser —, insister ne la fera pas aboutir et noierait le
// journal du serveur. La reprise se fait au retour de l'onglet, au retour du
// réseau, ou sur un changement d'agent.
const ESSAIS_MAXIMUM = 4

let source = null
let etatLiaison = LIAISON_EN_ATTENTE
let essais = 0
let minuterie = null
let agentDeLaLiaison = null
let ouvertureEnCours = false
let abandonnee = false

function direEtat(prochain) {
  if (etatLiaison === prochain) return
  etatLiaison = prochain
  for (const veilleur of veilleursDeLiaison) veilleur(prochain)
}

function distribuer(evenement) {
  for (const auditeur of auditeurs) {
    try {
      auditeur(evenement)
    } catch (cause) {
      console.error('SIGL — un auditeur du flux a échoué', cause)
    }
  }
}

function lireCharge(message, nomDeLEvenement) {
  let charge = null
  if (message?.data) {
    try {
      charge = JSON.parse(message.data)
    } catch {
      charge = { texte: message.data }
    }
  }
  const sujets = sujetsDe(charge, nomDeLEvenement)
  return {
    // `sujet` reste le sujet principal, pour les écrans déjà écrits ;
    // `sujets` porte tous ceux que l'événement concerne.
    sujet: sujets[0],
    sujets,
    objet: charge?.objet ?? nomDeLEvenement ?? null,
    type: charge?.type ?? nomDeLEvenement ?? 'changement',
    id: charge?.id ?? charge?.objet_id ?? null,
    donnees: charge,
    recu_le: Date.now(),
  }
}

function programmerUneReprise() {
  if (minuterie || abandonnee) return
  if (essais >= ESSAIS_MAXIMUM) {
    abandonnee = true
    direEtat(LIAISON_ROMPUE)
    return
  }
  const attente = Math.min(1000 * 2 ** essais, 15000)
  essais += 1
  minuterie = setTimeout(() => {
    minuterie = null
    ouvrir()
  }, attente)
}

function ouvrir() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    direEtat(LIAISON_ROMPUE)
    return
  }
  if (source || ouvertureEnCours || abandonnee) return
  ouvertureEnCours = true

  const agent = agentCourant()
  agentDeLaLiaison = agent?.id ?? null
  const adresse = agentDeLaLiaison
    ? `/api/flux?agent=${encodeURIComponent(agentDeLaLiaison)}`
    : '/api/flux'

  direEtat(LIAISON_EN_ATTENTE)
  source = new EventSource(adresse)

  source.onopen = () => {
    essais = 0
    ouvertureEnCours = false
    direEtat(LIAISON_OUVERTE)
  }

  source.onmessage = (message) => distribuer(lireCharge(message, null))

  // Le serveur nomme ses événements : on écoute tous les noms qu'il emploie.
  for (const nom of NOMS_ECOUTES) {
    source.addEventListener(nom, (message) => distribuer(lireCharge(message, nom)))
  }

  source.onerror = () => {
    // EventSource se reconnecte seul, mais pas après une erreur fatale.
    if (source && source.readyState === EventSource.CLOSED) {
      source.close()
      source = null
      ouvertureEnCours = false
      direEtat(LIAISON_ROMPUE)
      programmerUneReprise()
    } else {
      direEtat(LIAISON_EN_ATTENTE)
    }
  }
}

function fermer() {
  if (minuterie) {
    clearTimeout(minuterie)
    minuterie = null
  }
  if (source) {
    source.close()
    source = null
  }
  ouvertureEnCours = false
  direEtat(LIAISON_EN_ATTENTE)
}

function reprendreSiBesoin() {
  const agent = agentCourant()
  if ((agent?.id ?? null) !== agentDeLaLiaison) {
    fermer()
    essais = 0
    abandonnee = false
    ouvrir()
    return
  }
  if (etatLiaison === LIAISON_ROMPUE) {
    essais = 0
    abandonnee = false
    if (minuterie) {
      clearTimeout(minuterie)
      minuterie = null
    }
    ouvrir()
  }
}

function brancherLaFenetre() {
  if (typeof document === 'undefined') return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reprendreSiBesoin()
  })
  window.addEventListener('online', reprendreSiBesoin)
}

let fenetreBranchee = false

function sabonner(auditeur) {
  auditeurs.add(auditeur)
  if (!fenetreBranchee) {
    fenetreBranchee = true
    brancherLaFenetre()
  }
  ouvrir()
  return () => {
    auditeurs.delete(auditeur)
    if (auditeurs.size === 0 && veilleursDeLiaison.size === 0) fermer()
  }
}

/** Relance la liaison : après un changement d'agent courant, par exemple. */
export function relancerLeFlux() {
  fermer()
  essais = 0
  abandonnee = false
  if (auditeurs.size > 0 || veilleursDeLiaison.size > 0) ouvrir()
}

/**
 * Abonne un écran à un ou plusieurs sujets.
 * `surChangement(evenement)` est appelé à chaque événement retenu.
 */
export function useFlux(sujets, surChangement) {
  const sujetsVoulus = Array.isArray(sujets) ? sujets : [sujets]
  const cle = sujetsVoulus.join('|')
  const rappel = useRef(surChangement)
  rappel.current = surChangement

  useEffect(() => {
    const retenus = new Set(cle.split('|').filter(Boolean))
    return sabonner((evenement) => {
      const portes = evenement.sujets ?? [evenement.sujet]
      if (retenus.size > 0 && !portes.some((sujet) => retenus.has(sujet))) return
      rappel.current?.(evenement)
    })
  }, [cle])
}

/** L'état de la liaison, pour l'indicateur du bandeau. */
export function useEtatLiaison() {
  const [etat, setEtat] = useState(etatLiaison)
  useEffect(() => {
    veilleursDeLiaison.add(setEtat)
    setEtat(etatLiaison)
    return () => {
      veilleursDeLiaison.delete(setEtat)
      if (auditeurs.size === 0 && veilleursDeLiaison.size === 0) fermer()
    }
  }, [])
  return etat
}

/**
 * Marque brièvement ce qui vient de changer sous les yeux de l'utilisateur.
 * Une teinte qui s'efface, pas une animation : la classe `vient-de-changer`
 * est posée puis retirée au bout de `--duree-marquage`.
 */
export function useMarquage(duree = 2000) {
  const [marques, setMarques] = useState(() => new Set())
  const minuteries = useRef(new Map())

  const marquer = useCallback(
    (identifiant) => {
      if (!identifiant) return
      setMarques((anciennes) => new Set(anciennes).add(identifiant))
      const precedente = minuteries.current.get(identifiant)
      if (precedente) clearTimeout(precedente)
      minuteries.current.set(
        identifiant,
        setTimeout(() => {
          minuteries.current.delete(identifiant)
          setMarques((anciennes) => {
            const prochaines = new Set(anciennes)
            prochaines.delete(identifiant)
            return prochaines
          })
        }, duree),
      )
    },
    [duree],
  )

  useEffect(
    () => () => {
      for (const minuterie of minuteries.current.values()) clearTimeout(minuterie)
      minuteries.current.clear()
    },
    [],
  )

  const estMarque = useCallback((identifiant) => marques.has(identifiant), [marques])

  return { marquer, estMarque }
}

/**
 * Le raccourci dont tous les écrans se servent : se rafraîchir sans
 * rechargement quand le sujet bouge, et marquer la ligne qui a changé.
 */
export function useRafraichissementVivant(sujets, recharger, marquer) {
  useFlux(sujets, (evenement) => {
    if (evenement.id && marquer) marquer(evenement.id)
    recharger?.()
  })
}

/*
  Quels sujets viennent de bouger, pour que l'écran le montre.

  `useRafraichissementVivant` marque l'**objet** touché, ce qui convient à une
  liste : la ligne concernée s'éclaire. Un indicateur, lui, n'a pas d'objet — il
  compte. Ce qu'il doit faire battre, c'est son sujet : « besoins », « stocks »,
  « achats ». Sans cela un chiffre se met à jour sans qu'on le voie se mettre à
  jour, et un écran vivant ne se distingue pas d'un écran figé.

  Même durée et même animation que le marquage des lignes : un seul langage
  pour dire « ceci vient de changer ».
*/
export function useSujetsVivants(sujets, surChangement, duree = 2000) {
  const { marquer, estMarque } = useMarquage(duree)
  useFlux(sujets, (evenement) => {
    const portes = evenement?.sujets ?? [evenement?.sujet]
    for (const sujet of portes) if (sujet) marquer(String(sujet))
    surChangement?.(evenement)
  })
  return { estVif: estMarque }
}
