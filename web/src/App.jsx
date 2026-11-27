import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Bandeau from './components/Bandeau.jsx'
import BarreLaterale from './components/BarreLaterale.jsx'
import { FournisseurAgent, useAgent } from './lib/agent.jsx'
import TableauDeBord from './pages/TableauDeBord.jsx'
import Patrimoine from './pages/Patrimoine.jsx'
import Stocks from './pages/Stocks.jsx'
import Besoins from './pages/Besoins.jsx'
import Achats from './pages/Achats.jsx'
import Receptions from './pages/Receptions.jsx'
import Fournisseurs from './pages/Fournisseurs.jsx'
import Alertes from './pages/Alertes.jsx'
import Journal from './pages/Journal.jsx'
import ChoixProfil from './pages/ChoixProfil.jsx'
import Page from './components/Page.jsx'
import Vide from './components/Vide.jsx'
import Bouton from './components/Bouton.jsx'

function Charpente() {
  const { agent } = useAgent()
  return (
    <div className="charpente">
      <Bandeau agent={agent} />
      <BarreLaterale />
      <main className="charpente-contenu">
        <Routes>
          <Route path="/" element={<TableauDeBord />} />
          {/* Les fiches s'ouvrent en tiroir par-dessus leur liste :
              la même page sert les deux adresses. */}
          <Route path="/patrimoine" element={<Patrimoine />} />
          <Route path="/patrimoine/:id" element={<Patrimoine />} />
          <Route path="/stocks" element={<Stocks />} />
          <Route path="/stocks/:id" element={<Stocks />} />
          <Route path="/besoins" element={<Besoins />} />
          <Route path="/besoins/:id" element={<Besoins />} />
          <Route path="/achats" element={<Achats />} />
          <Route path="/achats/:id" element={<Achats />} />
          <Route path="/receptions" element={<Receptions />} />
          <Route path="/receptions/:id" element={<Receptions />} />
          <Route path="/fournisseurs" element={<Fournisseurs />} />
          <Route path="/alertes" element={<Alertes />} />
          <Route path="/alertes/:id" element={<Alertes />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="*" element={<Introuvable />} />
        </Routes>
      </main>
    </div>
  )
}

function Introuvable() {
  const { pathname } = useLocation()
  return (
    <Page titre="Écran introuvable" fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Introuvable' }]}>
      <Vide
        titre="Cette adresse ne correspond à aucun écran"
        texte={`L'adresse « ${pathname} » n'existe pas dans le SIGL. Revenez au tableau de bord.`}
        action={<Bouton allure="principale" vers="/">Aller au tableau de bord</Bouton>}
      />
    </Page>
  )
}

/** Sans agent courant, rien n'est lisible : le serveur attend X-Agent-Id. */
function Garde() {
  const { agent } = useAgent()
  const { pathname } = useLocation()
  if (!agent && pathname !== '/profil') return <Navigate to="/profil" replace />
  return <Charpente />
}

export default function App() {
  return (
    <FournisseurAgent>
      <Routes>
        <Route path="/profil" element={<ChoixProfil />} />
        <Route path="*" element={<Garde />} />
      </Routes>
    </FournisseurAgent>
  )
}
