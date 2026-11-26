import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme.js'

/*
  Le bouton du mode. Il dit ce qu'il fera, pas où l'on est : un agent qui
  travaille de nuit le trouvera sans y penser.
*/
export default function Theme() {
  const { effectif, basculer } = useTheme()
  const versSombre = effectif === 'clair'

  return (
    <button
      type="button"
      className="bandeau-action"
      onClick={basculer}
      title={versSombre ? 'Passer en mode sombre' : 'Passer en mode clair'}
      aria-label={versSombre ? 'Passer en mode sombre' : 'Passer en mode clair'}
    >
      {versSombre ? (
        <Moon size={15} aria-hidden="true" />
      ) : (
        <Sun size={15} aria-hidden="true" />
      )}
    </button>
  )
}
