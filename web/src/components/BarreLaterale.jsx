import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import {
  LayoutDashboard,
  Boxes,
  Warehouse,
  ClipboardList,
  ShoppingCart,
  PackageCheck,
  Truck,
  TriangleAlert,
  ScrollText,
} from 'lucide-react'

const GROUPES = [
  {
    titre: 'Pilotage',
    liens: [{ to: '/', libelle: 'Tableau de bord', icone: LayoutDashboard, exact: true }],
  },
  {
    titre: 'Patrimoine',
    liens: [
      { to: '/patrimoine', libelle: 'Biens', icone: Boxes },
      { to: '/stocks', libelle: 'Stocks', icone: Warehouse },
    ],
  },
  {
    titre: 'Approvisionnement',
    liens: [
      { to: '/besoins', libelle: 'États de besoin', icone: ClipboardList },
      { to: '/achats', libelle: 'Achats', icone: ShoppingCart },
      { to: '/receptions', libelle: 'Réceptions', icone: PackageCheck },
      { to: '/fournisseurs', libelle: 'Fournisseurs', icone: Truck },
    ],
  },
  {
    titre: 'Contrôle',
    liens: [
      { to: '/alertes', libelle: 'Alertes', icone: TriangleAlert, compte: 'alertes' },
      { to: '/journal', libelle: 'Journal', icone: ScrollText },
    ],
  },
]

/*
  Barre latérale fixe, bleu profond. Icône et libellé, jamais l'icône seule.
  Les comptes affichés viennent du serveur ; sans réponse, rien n'est affiché.
*/
export default function BarreLaterale({ comptes = {} }) {
  return (
    <nav className="laterale charpente-laterale" aria-label="Navigation principale">
      {GROUPES.map((groupe) => (
        <div key={groupe.titre}>
          <div className="laterale-groupe">{groupe.titre}</div>
          {groupe.liens.map((lien) => {
            const Icone = lien.icone
            const compte = lien.compte ? comptes[lien.compte] : undefined
            return (
              <NavLink
                key={lien.to}
                to={lien.to}
                end={lien.exact}
                className={({ isActive }) => clsx('laterale-lien', isActive && 'est-actif')}
              >
                <Icone className="laterale-lien-icone" size={16} aria-hidden="true" />
                <span className="laterale-lien-libelle">{lien.libelle}</span>
                {typeof compte === 'number' && compte > 0 ? (
                  <span className="laterale-compte">{compte}</span>
                ) : null}
              </NavLink>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
