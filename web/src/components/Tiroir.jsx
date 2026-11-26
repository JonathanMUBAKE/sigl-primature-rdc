import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/*
  Le tiroir latéral : c'est ici que s'ouvrent les fiches — un bien, un état de
  besoin, l'instruction d'une alerte. On garde la liste sous les yeux, et on
  revient d'un geste. Le dialogue, lui, reste réservé aux confirmations.

  Échap ferme, le voile ferme, le focus entre dans le panneau.
*/
export default function Tiroir({
  ouvert,
  surTitre,
  titre,
  sousTitre,
  surFermeture,
  pied,
  children,
}) {
  const panneau = useRef(null)

  useEffect(() => {
    if (!ouvert) return undefined
    function surTouche(e) {
      if (e.key === 'Escape') surFermeture?.()
    }
    document.addEventListener('keydown', surTouche)
    panneau.current?.focus()
    const debordement = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', surTouche)
      document.body.style.overflow = debordement
    }
  }, [ouvert, surFermeture])

  if (!ouvert) return null

  return (
    <div
      className="tiroir-voile"
      onMouseDown={(e) => e.target === e.currentTarget && surFermeture?.()}
    >
      <aside
        className="tiroir"
        role="dialog"
        aria-modal="true"
        aria-label={typeof titre === 'string' ? titre : 'Fiche'}
        tabIndex={-1}
        ref={panneau}
      >
        <div className="tiroir-tete">
          <div className="tiroir-titres">
            {surTitre ? <div className="tiroir-sur-titre">{surTitre}</div> : null}
            <h2 className="tiroir-titre">{titre}</h2>
            {sousTitre ? <div className="tiroir-sous-titre">{sousTitre}</div> : null}
          </div>
          <button type="button" className="tiroir-fermer" onClick={surFermeture} aria-label="Fermer">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="tiroir-corps">{children}</div>
        {pied ? <div className="tiroir-pied">{pied}</div> : null}
      </aside>
    </div>
  )
}
