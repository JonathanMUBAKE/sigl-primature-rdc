import { Link } from 'react-router-dom'
import { UserCog } from 'lucide-react'
import Armoiries from './Armoiries.jsx'
import Liaison from './Liaison.jsx'
import { libelle } from '../lib/format.js'

/*
  Bandeau bleu profond, pleine largeur.
  À gauche le bloc-marque de la charte : les armoiries, « RÉPUBLIQUE
  DÉMOCRATIQUE DU CONGO », « PRIMATURE ». À droite l'agent courant.
*/
export default function Bandeau({ agent }) {
  return (
    <header className="bandeau charpente-bandeau">
      <div className="bandeau-marque">
        <Armoiries taille={34} />
        <div className="bandeau-titres">
          <span className="bandeau-pays">République démocratique du Congo</span>
          <span className="bandeau-institution">Primature</span>
        </div>
        <span className="bandeau-sigle">
          SIGL — Système intégré de gestion logistique
        </span>
      </div>

      <div className="bandeau-agent">
        <Liaison />
        {agent ? (
          <div className="bandeau-agent-textes">
            <div className="bandeau-agent-nom">{agent.nom}</div>
            <div className="bandeau-agent-fonction">
              {agent.fonction || (agent.roles?.length ? agent.roles.map(libelle).join(', ') : 'Profil de démonstration')}
            </div>
          </div>
        ) : (
          <div className="bandeau-agent-textes">
            <div className="bandeau-agent-nom">Aucun agent choisi</div>
          </div>
        )}
        <Link className="bandeau-action" to="/profil" title="Changer d'agent courant">
          <UserCog size={14} aria-hidden="true" />
          Changer de profil
        </Link>
      </div>
    </header>
  )
}
