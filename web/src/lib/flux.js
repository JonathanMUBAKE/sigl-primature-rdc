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

const SUJETS = [
  'patrimoine',
  'stocks',
  'besoins',
  'alertes',
  'achats',
  'journal',
  'tableau-de-bord',
]

const auditeurs = new Set() // (evenement) => void
const veilleursDeLiaison = new Set() // (etat) => void

let source = null
let etatLiaison = LIAISON_EN_ATTENTE
let essais = 0
let minuterie = null
let agentDeLaLiaison = null

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
  const sujet = charge?.sujet ?? charge?.domaine ?? nomDeLEvenement ?? 'inconnu'
  return {
    sujet,
    type: charge?.type ?? nomDeLEvenement ?? 'changement',
    id: charge?.id ?? charge?.objet_id ?? null,
    donnees: charge,
    recu_le: Date.now(),
  }
}

function programmerUneReprise() {
  if (minuterie) return
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
  if (source) return

  const agent = agentCourant()
  agentDeLaLiaison = agent?.id ?? null
  const adresse = agentDeLaLiaison
    ? `/api/flux?agent=${encodeURIComponent(agentDeLaLiaison)}`
    : '/api/flux'

  direEtat(LIAISON_EN_ATTENTE)
  source = new EventSource(adresse)

  source.onopen = () => {
    essais = 0
    direEtat(LIAISON_OUVERTE)
  }

  source.onmessage = (message) => distribuer(lireCharge(message, null))

  // Le serveur peut nommer ses événements : on écoute les sujets connus.
  for (const sujet of SUJETS) {
    source.addEventListener(sujet, (message) => distribuer(lireCharge(message, sujet)))
  }

  source.onerror = () => {
    // EventSource se reconnecte seul, mais pas après une erreur fatale.
    if (source && source.readyState === EventSource.CLOSED) {
      source.close()
      source = null
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
  direEtat(LIAISON_EN_ATTENTE)
}

function reprendreSiBesoin() {
  const agent = agentCourant()
  if ((agent?.id ?? null) !== agentDeLaLiaison) {
    fermer()
    essais = 0
    ouvrir()
    return
  }
  if (etatLiaison === LIAISON_ROMPUE) {
    essais = 0
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
      if (retenus.size > 0 && !retenus.has(evenement.sujet)) return
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
