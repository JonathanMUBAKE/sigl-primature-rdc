import { Link } from 'react-router-dom'
import { UserCog } from 'lucide-react'
import Liaison from './Liaison.jsx'
import Theme from './Theme.jsx'
import { libelle } from '../lib/format.js'

/*
  Bandeau clair, séparé du contenu par un filet d'un pixel — pas par un aplat.

  À gauche le bloc-marque OFFICIEL de la Primature, relevé sur son Rapport
  Annuel Général d'Activités 2023 : le sceau « République Démocratique du
  Congo / Le Gouvernement », la ligne d'État tricolore et « PRIMATURE ».
  Deux fichiers, un par mode : le bleu sur surface claire, le blanc sur
  surface sombre. C'est la feuille de style qui choisit, par les jetons
  --logo-sur-clair et --logo-sur-sombre : aucun calcul de thème ici.

  À droite l'agent courant, l'état de la liaison et le mode d'affichage.
*/
export default function Bandeau({ agent }) {
  return (
    <header className="bandeau charpente-bandeau">
      <div className="bandeau-marque">
        <img
          className="bandeau-logo logo-sur-clair"
          src="/primature-logo-bleu.png"
          width="1200"
          height="483"
          alt="République démocratique du Congo — Primature"
        />
        <img
          className="bandeau-logo logo-sur-sombre"
          src="/primature-logo-blanc.png"
          width="1200"
          height="483"
          alt=""
          aria-hidden="true"
        />
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
        <Theme />
        <Link className="bandeau-action" to="/profil" title="Changer d'agent courant">
          <UserCog size={15} aria-hidden="true" />
          Changer
        </Link>
      </div>
    </header>
  )
}
