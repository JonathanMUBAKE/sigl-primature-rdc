import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import Page from '../components/Page.jsx'
import Tableau from '../components/Tableau.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import { Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { horodatage, libelle, nombre, texte } from '../lib/format.js'

/*
  Le journal. GET /api/journal — contrôle externe seulement.
  Insertion seule : aucune route ne le modifie, aucune ne le supprime.
  L'écran est en lecture, et il le dit.
*/
export default function Journal() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const objetType = params.get('objet_type') ?? ''

  function poser(cle, valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, valeur)
    else prochain.delete(cle)
    setParams(prochain, { replace: true })
  }

  const { donnees, chargement, erreur, recharger } = useRequete(
    (o) => api.journal({ q, objet_type: objetType }, o),
    [q, objetType],
  )
  const { lignes, total } = depouillerListe(donnees)

  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant('journal', recharger, marquer)

  const typesVus = useMemo(
    () => [...new Set(lignes.map((l) => l.objet_type).filter(Boolean))],
    [lignes],
  )

  const colonnes = useMemo(
    () => [
      {
        cle: 'horodatage',
        titre: 'Horodatage',
        nombre: true,
        rendu: (l) => horodatage(l.horodatage),
      },
      {
        cle: 'agent_nom',
        titre: 'Agent',
        rendu: (l) => (
          <>
            <div>{texte(l.agent_nom)}</div>
            {l.agent_fonction ? <div className="texte-note">{l.agent_fonction}</div> : null}
          </>
        ),
      },
      { cle: 'action', titre: 'Action', rendu: (l) => libelle(l.action) },
      {
        cle: 'objet_type',
        titre: 'Objet',
        rendu: (l) => (
          <>
            <div>{libelle(l.objet_type)}</div>
            <div className="texte-note mono">{texte(l.objet_id)}</div>
          </>
        ),
      },
      {
        cle: 'avant',
        titre: 'Avant',
        triable: false,
        rendu: (l) => <Valeurs valeur={l.avant} />,
      },
      {
        cle: 'apres',
        titre: 'Après',
        triable: false,
        rendu: (l) => <Valeurs valeur={l.apres} />,
      },
      { cle: 'ip', titre: 'Adresse', rendu: (l) => <span className="mono cellule-faible">{texte(l.ip)}</span> },
    ],
    [],
  )

  return (
    <Page
      titre="Journal"
      sousTitre="Qui, quoi, quand, et les valeurs avant et après. Insertion seule : personne ne le modifie."
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Journal' }]}
    >
      <Filtres total={erreur || chargement ? undefined : total} nom="écriture">
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Agent, action, identifiant d'objet…"
        />
        <Filtre
          libelle="Type d'objet"
          valeur={objetType}
          surChangement={(v) => poser('objet_type', v)}
          options={typesVus.map((code) => ({ valeur: code, libelle: libelle(code) }))}
          toutes="Tous les objets"
        />
      </Filtres>

      <Etat chargement={chargement} erreur={erreur} recharger={recharger} texteChargement="Lecture du journal…">
        <Tableau
          colonnes={colonnes}
          lignes={lignes}
          nomDesLignes="écriture"
          triInitial={{ cle: 'horodatage', sens: 'desc' }}
          ligneMarquee={(l) => estMarque(l.id)}
          titreVide="Aucune écriture au journal"
          texteVide="Le journal est vide pour ces critères, ou votre profil n'y a pas accès : il est ouvert au contrôle externe."
          pied={`${nombre(lignes.length)} affichée(s) sur ${nombre(total)}`}
        />
      </Etat>
    </Page>
  )
}

/** Les valeurs avant/après, serrées, sans décorer. */
function Valeurs({ valeur }) {
  if (valeur === null || valeur === undefined) return <span className="texte-note">—</span>
  if (typeof valeur !== 'object') return <span className="mono cellule-faible">{String(valeur)}</span>
  const entrees = Object.entries(valeur)
  if (entrees.length === 0) return <span className="texte-note">—</span>
  return (
    <div className="pile">
      {entrees.slice(0, 6).map(([cle, v]) => (
        <div key={cle} className="texte-note">
          <span className="cle-valeur">{cle}</span> :{' '}
          <span className="mono">{v === null ? '—' : String(v)}</span>
        </div>
      ))}
      {entrees.length > 6 ? (
        <div className="texte-note">… et {nombre(entrees.length - 6)} autre(s) champ(s)</div>
      ) : null}
    </div>
  )
}
