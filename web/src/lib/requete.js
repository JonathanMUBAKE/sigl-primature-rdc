import { useCallback, useEffect, useRef, useState } from 'react'

/*
  Un seul endroit pour l'attente, l'erreur et le rechargement.
  Aucune donnée inventée : tant que le serveur n'a pas répondu, il n'y a rien
  à montrer, et on le dit.
*/
export function useRequete(appel, dependances = []) {
  const [donnees, setDonnees] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [rang, setRang] = useState(0)
  const appelRef = useRef(appel)
  appelRef.current = appel

  useEffect(() => {
    const controleur = new AbortController()
    let vivant = true
    setChargement(true)
    setErreur(null)

    Promise.resolve()
      .then(() => appelRef.current({ signal: controleur.signal }))
      .then((resultat) => {
        if (!vivant) return
        setDonnees(resultat)
        setChargement(false)
      })
      .catch((cause) => {
        if (!vivant || cause?.name === 'AbortError') return
        setErreur(cause)
        setDonnees(null)
        setChargement(false)
      })

    return () => {
      vivant = false
      controleur.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependances, rang])

  const recharger = useCallback(() => setRang((r) => r + 1), [])

  return { donnees, chargement, erreur, recharger }
}

/** Les listes du contrat : { donnees, total, page, parPage }. */
export function depouillerListe(charge) {
  if (!charge) return { lignes: [], total: 0, page: 1, parPage: 50 }
  if (Array.isArray(charge)) {
    return { lignes: charge, total: charge.length, page: 1, parPage: charge.length }
  }
  const lignes = Array.isArray(charge.donnees) ? charge.donnees : []
  return {
    lignes,
    total: typeof charge.total === 'number' ? charge.total : lignes.length,
    page: charge.page ?? 1,
    parPage: charge.parPage ?? 50,
  }
}
