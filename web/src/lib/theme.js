import { useCallback, useEffect, useState } from 'react'

/*
  Le mode clair et le mode sombre.

  Trois choix : « systeme » — on suit `prefers-color-scheme` —, « clair » et
  « sombre ». Le choix explicite est posé sur <html data-theme="…"> et
  mémorisé par le navigateur ; « systeme » retire l'attribut et laisse la
  feuille de style décider.
*/

const CLE = 'sigl.theme'
const MODES = ['systeme', 'clair', 'sombre']

export function themeMemorise() {
  try {
    const garde = localStorage.getItem(CLE)
    return MODES.includes(garde) ? garde : 'systeme'
  } catch {
    return 'systeme'
  }
}

/** Pose le mode sur la racine du document. Appelé aussi avant le rendu. */
export function appliquerTheme(mode) {
  const racine = document.documentElement
  if (mode === 'clair' || mode === 'sombre') racine.dataset.theme = mode
  else delete racine.dataset.theme
}

function systemeEstSombre() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  )
}

/** Le mode réellement affiché, une fois la préférence système résolue. */
export function modeEffectif(mode) {
  if (mode === 'clair' || mode === 'sombre') return mode
  return systemeEstSombre() ? 'sombre' : 'clair'
}

export function useTheme() {
  const [mode, setMode] = useState(() => themeMemorise())
  const [effectif, setEffectif] = useState(() => modeEffectif(themeMemorise()))

  useEffect(() => {
    appliquerTheme(mode)
    setEffectif(modeEffectif(mode))
    try {
      if (mode === 'systeme') localStorage.removeItem(CLE)
      else localStorage.setItem(CLE, mode)
    } catch {
      /* navigation privée : le mode vaut pour la session */
    }
  }, [mode])

  // Quand on suit le système, on suit aussi ses changements d'avis.
  useEffect(() => {
    if (mode !== 'systeme' || !window.matchMedia) return undefined
    const requete = window.matchMedia('(prefers-color-scheme: dark)')
    const surChangement = () => setEffectif(systemeEstSombre() ? 'sombre' : 'clair')
    requete.addEventListener('change', surChangement)
    return () => requete.removeEventListener('change', surChangement)
  }, [mode])

  /** Bascule entre clair et sombre, en partant de ce qui est affiché. */
  const basculer = useCallback(() => {
    setMode(modeEffectif(mode) === 'sombre' ? 'clair' : 'sombre')
  }, [mode])

  return { mode, effectif, choisir: setMode, basculer }
}
