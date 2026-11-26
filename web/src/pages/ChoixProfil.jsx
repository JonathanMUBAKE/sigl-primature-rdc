import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { LogIn } from 'lucide-react'
import Armoiries from '../components/Armoiries.jsx'
import Bouton from '../components/Bouton.jsx'
import Champ from '../components/Champ.jsx'
import { Chargement, Erreur } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { useAgent } from '../lib/agent.jsx'
import { libelle } from '../lib/format.js'

/*
  Sélection de l'agent courant, pour la démonstration. Pas d'authentification
  à ce stade : l'agent choisi voyage dans l'en-tête X-Agent-Id et le serveur
  en déduit les rôles. L'authentification réelle viendra plus tard.
*/
export default function ChoixProfil() {
  const { agent, choisir } = useAgent()
  const navigue = useNavigate()
  const { donnees, chargement, erreur, recharger } = useRequete(
    (o) => api.agents({ actif: true }, o),
    [],
  )
  const { lignes } = depouillerListe(donnees)
  const [identifiantSaisi, setIdentifiantSaisi] = useState('')

  function entrer(prochain) {
    choisir(prochain)
    navigue('/', { replace: true })
  }

  return (
    <div className="profil-cadre">
      <div className="profil-boite">
        <div className="profil-tete">
          <Armoiries taille={38} />
          <div className="bandeau-titres">
            <span className="bandeau-pays">République démocratique du Congo</span>
            <span className="bandeau-institution">Primature</span>
          </div>
        </div>

        <div className="profil-corps">
          <h1 className="page-titre">Choisir l'agent courant</h1>
          <p className="texte-faible" style={{ maxWidth: '62ch', marginTop: 6 }}>
            Le SIGL n'a pas encore de mot de passe. L'agent choisi ici désigne l'identité de travail :
            le serveur en déduit les rôles et applique les droits pour de bon. Changez d'agent pour
            voir le même dossier avec d'autres pouvoirs.
          </p>

          <h2 className="section-titre" style={{ marginTop: 22 }}>
            Agents enregistrés
          </h2>

          {chargement ? (
            <div style={{ marginTop: 10 }}>
              <Chargement texte="Lecture de la liste des agents…" />
            </div>
          ) : erreur ? (
            <div style={{ marginTop: 10 }}>
              <Erreur
                erreur={erreur}
                surReessai={recharger}
                titre="La liste des agents n'a pas pu être lue"
              />
            </div>
          ) : lignes.length === 0 ? (
            <p className="texte-faible" style={{ marginTop: 8 }}>
              Le serveur ne renvoie aucun agent. Chargez le jeu de démonstration, ou saisissez
              directement un identifiant ci-dessous.
            </p>
          ) : (
            <div className="profil-liste">
              {lignes.map((candidat) => (
                <button
                  key={candidat.id}
                  type="button"
                  className={clsx('profil-choix', agent?.id === candidat.id && 'est-actif')}
                  onClick={() => entrer(candidat)}
                >
                  <div className="profil-choix-nom">{candidat.nom}</div>
                  <div className="profil-choix-fonction">
                    {candidat.fonction || '—'}
                    {candidat.structure_nom ? ` · ${candidat.structure_nom}` : ''}
                  </div>
                  {Array.isArray(candidat.roles) && candidat.roles.length > 0 ? (
                    <div className="texte-note" style={{ marginTop: 4 }}>
                      {candidat.roles.map(libelle).join(' · ')}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          )}

          <div
            style={{
              marginTop: 24,
              paddingTop: 18,
              borderTop: '1px solid var(--ligne)',
              maxWidth: 420,
            }}
          >
            <h2 className="section-titre">Saisir un identifiant d'agent</h2>
            <p className="texte-note" style={{ margin: '6px 0 10px' }}>
              Utile quand la liste n'est pas servie : collez l'identifiant technique de l'agent.
            </p>
            <Champ
              libelle="Identifiant de l'agent"
              valeur={identifiantSaisi}
              surChangement={setIdentifiantSaisi}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
            <Bouton
              allure="principale"
              icone={LogIn}
              desactive={identifiantSaisi.trim().length === 0}
              surClic={() =>
                entrer({ id: identifiantSaisi.trim(), nom: 'Agent ' + identifiantSaisi.trim().slice(0, 8) })
              }
            >
              Entrer dans le SIGL
            </Bouton>
          </div>
        </div>
      </div>
    </div>
  )
}
