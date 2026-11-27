import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'

/*
  Un dialogue pour les actions qui demandent un motif ou une confirmation.
  Échap ferme, le voile ferme, le focus entre dans le dialogue.
*/
export default function Dialogue({ ouvert, titre, surFermeture, pied, large = false, children }) {
  const boite = useRef(null)

  useEffect(() => {
    if (!ouvert) return undefined
    function surTouche(e) {
      if (e.key === 'Escape') surFermeture?.()
    }
    document.addEventListener('keydown', surTouche)
    boite.current?.focus()
    return () => document.removeEventListener('keydown', surTouche)
  }, [ouvert, surFermeture])

  if (!ouvert) return null

  return (
    <div className="dialogue-voile" onMouseDown={(e) => e.target === e.currentTarget && surFermeture?.()}>
      <div
        className={clsx('dialogue', large && 'est-large')}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        tabIndex={-1}
        ref={boite}
      >
        <div className="dialogue-tete">
          <h2 className="dialogue-titre">{titre}</h2>
          <button
            type="button"
            className="dialogue-fermer"
            onClick={surFermeture}
            aria-label="Fermer"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="dialogue-corps">{children}</div>
        {pied ? <div className="dialogue-pied">{pied}</div> : null}
      </div>
    </div>
  )
}
