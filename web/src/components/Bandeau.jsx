import { Link } from 'react-router-dom'
import { UserCog } from 'lucide-react'
import Armoiries from './Armoiries.jsx'
import Liaison from './Liaison.jsx'
import { libelle } from '../lib/format.js'

/*
  Bandeau clair, séparé du contenu par un filet d'un pixel — pas par un aplat.
  À gauche le bloc-marque : les armoiries, « République démocratique du Congo »,
  « Primature ». C'est là que se tient l'identité de l'État, pas dans une
  surface de navigation colorée. À droite l'agent courant.
*/
export default function Bandeau({ agent }) {
  return (
    <header className="bandeau charpente-bandeau">
      <div className="bandeau-marque">
        {/* Le bloc-marque officiel, relevé sur le Rapport Annuel Général
            d'Activités de la Primature : sceau, ligne d'État et intitulé.
            Version bleue : le bandeau est clair. La version blanche sert
            la barre latérale et le mode sombre. L'ancien tracé SVG reste en repli. */}
        <img
          className="bandeau-logo"
          src="/primature-logo-bleu.png"
          alt="République démocratique du Congo — Primature"
          onError={(e) => { e.currentTarget.hidden = true; }}
        />
        <noscript>
          <Armoiries taille={30} />
        </noscript>
        <span className="bandeau-sigle">Système intégré de gestion logistique</span>
      </div>

      <div className="bandeau-agent">
        <Liaison />
        <div className="bandeau-agent-textes">
          <div className="bandeau-agent-nom">{agent ? agent.nom : 'Aucun agent choisi'}</div>
          {agent ? (
            <div className="bandeau-agent-fonction">
              {agent.fonction ||
                (agent.roles?.length
                  ? agent.roles.map(libelle).join(', ')
                  : 'Profil de démonstration')}
            </div>
          ) : null}
        </div>
        <Link className="bandeau-action" to="/profil" title="Changer d'agent courant">
          <UserCog size={15} aria-hidden="true" />
          Changer
        </Link>
      </div>
    </header>
  )
}
