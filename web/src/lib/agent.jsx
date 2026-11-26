import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { agentCourant, definirAgentCourant } from './api.js'
import { relancerLeFlux } from './flux.js'

/*
  L'agent courant de la démonstration. Il voyage dans l'en-tête X-Agent-Id ;
  les droits, eux, sont appliqués par le serveur — jamais ici.
*/
const Contexte = createContext({ agent: null, choisir: () => {}, quitter: () => {} })

export function FournisseurAgent({ children }) {
  const [agent, setAgent] = useState(() => agentCourant())

  const choisir = useCallback((prochain) => {
    definirAgentCourant(prochain)
    setAgent(prochain)
    relancerLeFlux() // la liaison temps réel porte l'agent : elle se rouvre
  }, [])

  const quitter = useCallback(() => {
    definirAgentCourant(null)
    setAgent(null)
    relancerLeFlux()
  }, [])

  const valeur = useMemo(() => ({ agent, choisir, quitter }), [agent, choisir, quitter])
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useAgent() {
  return useContext(Contexte)
}

/** Les rôles de l'agent courant, tels que le serveur les a renvoyés. */
export function useRoles() {
  const { agent } = useAgent()
  const roles = Array.isArray(agent?.roles) ? agent.roles : []
  return {
    roles,
    aLeRole: (...codes) => codes.some((code) => roles.includes(code)),
  }
}
