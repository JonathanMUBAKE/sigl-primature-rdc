import clsx from 'clsx'
import { Inbox, TriangleAlert } from 'lucide-react'
import Bouton from './Bouton.jsx'

/*
  Un état vide s'explique : ce qui est absent, pourquoi, et ce qu'on peut faire.
*/
export default function Vide({ titre = 'Aucun élément', texte, action }) {
  return (
    <div className="vide">
      <Inbox className="vide-icone" size={20} aria-hidden="true" />
      <div className="vide-titre">{titre}</div>
      {texte ? <p className="vide-texte">{texte}</p> : null}
      {action ? <div className="vide-action">{action}</div> : null}
    </div>
  )
}

/**
 * L'attente, dite franchement — et montrée par un squelette, pas par une
 * roue qui tourne : la page garde sa forme, et rien ne saute quand les
 * données arrivent.
 */
export function Chargement({ texte = 'Chargement…', lignes = 4 }) {
  return (
    <div className="chargement" role="status" aria-live="polite" aria-busy="true">
      <div className="chargement-dit">{texte}</div>
      {Array.from({ length: lignes }, (_, i) => (
        <div className="squelette-ligne" key={i} aria-hidden="true">
          <span className="squelette" />
          <span className="squelette" />
          <span className="squelette" />
        </div>
      ))}
    </div>
  )
}

/**
 * L'erreur du serveur, remontée telle quelle : son message français et, s'il
 * y en a un, le code de la règle violée.
 */
export function Erreur({ erreur, surReessai, titre = 'Les données ne sont pas disponibles' }) {
  const message =
    erreur?.message ?? "Une erreur sans message est remontée du serveur. Réessayez, puis signalez-le."
  return (
    <div className={clsx('vide', 'est-erreur')} role="alert">
      <div className="ligne-outils">
        <TriangleAlert size={18} aria-hidden="true" />
        <span className="vide-titre">{titre}</span>
      </div>
      <p className="vide-texte">{message}</p>
      {erreur?.code && erreur.code !== 'erreur_inconnue' ? (
        <span className="vide-code">{erreur.code}</span>
      ) : null}
      {erreur?.champ ? <div className="texte-note">Champ en cause : {erreur.champ}</div> : null}
      {surReessai ? (
        <div className="vide-action">
          <Bouton surClic={surReessai}>Réessayer</Bouton>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Le trio attente / erreur / vide, au même endroit pour tous les écrans.
 * Rien n'est inventé : s'il n'y a pas de données, il n'y a pas de tableau.
 */
export function Etat({
  chargement,
  erreur,
  vide,
  recharger,
  texteChargement,
  titreVide,
  texteVide,
  actionVide,
  children,
}) {
  if (chargement) return <Chargement texte={texteChargement} />
  if (erreur) return <Erreur erreur={erreur} surReessai={recharger} />
  if (vide) return <Vide titre={titreVide} texte={texteVide} action={actionVide} />
  return children
}
