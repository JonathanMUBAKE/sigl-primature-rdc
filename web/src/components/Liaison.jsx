import clsx from 'clsx'
import { useEtatLiaison, LIAISON_OUVERTE, LIAISON_ROMPUE } from '../lib/flux.js'

/*
  L'état de la liaison temps réel, discret, dans le bandeau.
  Un point et un mot : pas d'icône clignotante, pas d'alarme.
*/
const MOTS = {
  ouverte: { texte: 'En direct', titre: 'Les écrans se mettent à jour sans rechargement.' },
  en_attente: { texte: 'Connexion…', titre: 'La liaison temps réel est en cours d’établissement.' },
  rompue: {
    texte: 'Hors direct',
    titre: 'La liaison temps réel est rompue. Les écrans se rechargent à la demande.',
  },
}

export default function Liaison() {
  const etat = useEtatLiaison()
  const mot = MOTS[etat] ?? MOTS.en_attente
  return (
    <span
      className={clsx(
        'liaison',
        etat === LIAISON_OUVERTE && 'est-ouverte',
        etat === LIAISON_ROMPUE && 'est-rompue',
        etat !== LIAISON_OUVERTE && etat !== LIAISON_ROMPUE && 'est-en-attente',
      )}
      title={mot.titre}
      role="status"
      aria-live="polite"
    >
      <span className="liaison-point" aria-hidden="true" />
      <span className="liaison-libelle">{mot.texte}</span>
    </span>
  )
}
