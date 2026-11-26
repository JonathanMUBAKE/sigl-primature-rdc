import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Page from '../components/Page.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import { Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { date, libelle, montantCourt, nombre, texte } from '../lib/format.js'

const ETATS = ['neuf', 'bon', 'a_reparer', 'hors_service', 'en_maintenance', 'reforme', 'perdu']
const CLASSEMENTS = ['immobilisation', 'stock']

/*
  La liste filtrable des biens. GET /api/biens ?structure=&categorie=&etat=&q=&page=
  Le filtrage est fait par le serveur : l'écran lui passe les critères.
*/
export default function Patrimoine() {
  const [params, setParams] = useSearchParams()
  const navigue = useNavigate()

  const q = params.get('q') ?? ''
  const etat = params.get('etat') ?? ''
  const classement = params.get('classement') ?? ''
  const structure = params.get('structure') ?? ''

  function poser(cle, valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, valeur)
    else prochain.delete(cle)
    setParams(prochain, { replace: true })
  }

  const structures = useRequete((o) => api.structures(null, o), [])
  const listeStructures = depouillerListe(structures.donnees).lignes

  const { donnees, chargement, erreur, recharger } = useRequete(
    (o) => api.biens({ q, etat, classement, structure }, o),
    [q, etat, classement, structure],
  )
  const { lignes, total } = depouillerListe(donnees)

  const colonnes = useMemo(
    () => [
      {
        cle: 'immatriculation',
        titre: 'Immatriculation',
        rendu: (b) => <span className="mono">{texte(b.immatriculation)}</span>,
      },
      { cle: 'designation', titre: 'Désignation', rendu: (b) => texte(b.designation) },
      {
        cle: 'categorie_code',
        titre: 'Catégorie',
        rendu: (b) => (
          <span className="cellule-faible">{texte(b.categorie_libelle ?? b.categorie_code)}</span>
        ),
      },
      { cle: 'classement', titre: 'Classement', rendu: (b) => libelle(b.classement) },
      { cle: 'etat', titre: 'État', rendu: (b) => <Pastille valeur={b.etat} /> },
      {
        cle: 'structure_nom',
        titre: 'Structure',
        rendu: (b) => <span className="cellule-faible">{texte(b.structure_nom ?? b.structure_code)}</span>,
      },
      { cle: 'site_nom', titre: 'Site', rendu: (b) => <span className="cellule-faible">{texte(b.site_nom)}</span> },
      { cle: 'quantite', titre: 'Quantité', nombre: true, rendu: (b) => nombre(b.quantite) },
      {
        cle: 'valeur_acquisition',
        titre: "Valeur d'acquisition",
        nombre: true,
        valeur: (b) => Number(b.valeur_acquisition ?? 0),
        rendu: (b) => montantCourt(b.valeur_acquisition),
      },
      {
        cle: 'date_acquisition',
        titre: 'Acquis le',
        nombre: true,
        rendu: (b) => date(b.date_acquisition),
      },
    ],
    [],
  )

  return (
    <Page
      titre="Patrimoine"
      sousTitre="Le registre des biens de la Primature"
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Patrimoine' }]}
    >
      <Filtres total={erreur || chargement ? undefined : total} nom="bien">
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Immatriculation, désignation, marque, numéro de série…"
        />
        <Filtre
          libelle="État"
          valeur={etat}
          surChangement={(v) => poser('etat', v)}
          options={ETATS.map((code) => ({ valeur: code, libelle: libelle(code) }))}
          toutes="Tous les états"
        />
        <Filtre
          libelle="Classement"
          valeur={classement}
          surChangement={(v) => poser('classement', v)}
          options={CLASSEMENTS.map((code) => ({ valeur: code, libelle: libelle(code) }))}
          toutes="Tous"
        />
        <Filtre
          libelle="Structure"
          valeur={structure}
          surChangement={(v) => poser('structure', v)}
          options={listeStructures.map((s) => ({ valeur: s.code ?? s.id, libelle: s.nom }))}
          toutes="Toutes les structures"
        />
      </Filtres>

      <Etat
        chargement={chargement}
        erreur={erreur}
        recharger={recharger}
        vide={lignes.length === 0}
        texteChargement="Lecture du registre des biens…"
        titreVide="Aucun bien ne correspond"
        texteVide={
          q || etat || classement || structure
            ? 'Aucun bien du registre ne répond à ces critères. Élargissez la recherche ou retirez un filtre.'
            : "Le registre ne contient aucun bien pour votre périmètre. Une structure ne lit que ses propres données — RG-017."
        }
      >
        <Tableau
          colonnes={colonnes}
          lignes={lignes}
          nomDesLignes="bien"
          surClic={(b) => navigue(`/patrimoine/${b.id}`)}
          ligneSignalee={(b) => b.etat === 'hors_service' || b.etat === 'perdu'}
          pied={`${nombre(lignes.length)} bien(s) affiché(s) sur ${nombre(total)} au registre`}
        />
      </Etat>
    </Page>
  )
}
