import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.jsx'

/*
  Cooper Hewitt est la police officielle. On vérifie qu'elle est réellement
  chargée : si elle ne l'est pas — paquet absent, réseau coupé, politique de
  sécurité — on pose <html data-police="repli"> et la pile de repli de
  `--police` prend le relais. Aucune mesure ne change : seules les formes.
*/
function verifierLaPolice() {
  if (!('fonts' in document)) {
    document.documentElement.dataset.police = 'repli'
    return
  }
  document.fonts.ready
    .then(() => {
      const chargee = document.fonts.check('400 1em "Cooper Hewitt"')
      document.documentElement.dataset.police = chargee ? 'officielle' : 'repli'
      if (!chargee) {
        console.warn(
          "SIGL — Cooper Hewitt n'est pas chargée ; la pile de repli est employée. Vérifiez @fontsource/cooper-hewitt.",
        )
      }
    })
    .catch(() => {
      document.documentElement.dataset.police = 'repli'
    })
}

verifierLaPolice()

createRoot(document.getElementById('racine')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
