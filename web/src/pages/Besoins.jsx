import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FilePlus2 } from 'lucide-react'
import Page from '../components/Page.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import Bouton from '../components/Bouton.jsx'
import { Etat } from '../components/Vide.jsx'
import FicheBesoin from './Besoin.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { useRoles } from '../lib/agent.jsx'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { date, libelle, nombre, texte } from '../lib/format.js'

const STATUTS = [
  'brouillon',
  'vise',
  'recu',
  'examine',
  'partiel',
  'rejete',
  'en_achat',
  'livrable',
  'livre',
  'clos',
]

/*
  Les états de besoin, par statut. GET /api/besoins ?statut=&structure=
*/
export default function Besoins() {
  const [params, setParams] = useSearchParams()
  const navigue = useNavigate()
  const { id: besoinOuvert } = useParams()
  const { aLeRole } = useRoles()

  const statut = params.get('statut') ?? ''
  const structure = params.get('structure') ?? ''
  const q = params.get('q') ?? ''

  function poser(cle, valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, valeur)
    else prochain.delete(cle)
    setParams(prochain, { replace: true })
  }

  const structures = useRequete((o) => api.structures(null, o), [])
  const listeStructures = depouillerListe(structures.donnees).lignes

  const { donnees, chargement, erreur, recharger } = useRequete(
    (o) => api.besoins({ statut, structure, q }, o),
    [statut, structure, q],
  )
  const { lignes, total } = depouillerListe(donnees)

  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant('besoins', recharger, marquer)

  const colonnes = useMemo(
    () => [
      {
        cle: 'numero',
        titre: 'Numéro',
        rendu: (e) => <span className="mono">{texte(e.numero)}</span>,
      },
      { cle: 'statut', titre: 'Statut', rendu: (e) => <Pastille valeur={e.statut} /> },
      { cle: 'objet', titre: 'Objet', rendu: (e) => texte(e.objet ?? e.justification) },
      {
        cle: 'structure_nom',
        titre: 'Structure',
        rendu: (e) => <span className="cellule-faible">{texte(e.structure_nom)}</span>,
      },
      {
        cle: 'demandeur_nom',
        titre: 'Demandeur',
        rendu: (e) => <span className="cellule-faible">{texte(e.demandeur_nom)}</span>,
      },
      {
        cle: 'nombre_lignes',
        titre: 'Lignes',
        nombre: true,
        valeur: (e) => Number(e.nombre_lignes ?? 0),
        rendu: (e) => nombre(e.nombre_lignes),
      },
      { cle: 'cree_le', titre: 'Créé le', nombre: true, rendu: (e) => date(e.cree_le) },
      { cle: 'vise_le', titre: 'Visé le', nombre: true, rendu: (e) => date(e.vise_le) },
    ],
    [],
  )

  return (
    <Page
      titre="États de besoin"
      sousTitre="Le circuit de la demande, de la rédaction à la clôture"
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'États de besoin' }]}
      actions={
        <Bouton
          allure="principale"
          icone={FilePlus2}
          desactive={!aLeRole('demandeur', 'chef_structure')}
          titre={
            aLeRole('demandeur', 'chef_structure')
              ? undefined
              : "Seul un agent demandeur ou un chef de structure rédige un état de besoin"
          }
        >
          Nouvel état de besoin
        </Bouton>
      }
    >
      <Filtres total={erreur || chargement ? undefined : total} nom="état de besoin" nomPluriel="états de besoin">
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Numéro, objet, demandeur…"
        />
        <Filtre
          libelle="Statut"
          valeur={statut}
          surChangement={(v) => poser('statut', v)}
          options={STATUTS.map((code) => ({ valeur: code, libelle: libelle(code) }))}
          toutes="Tous les statuts"
        />
        <Filtre
          libelle="Structure"
          valeur={structure}
          surChangement={(v) => poser('structure', v)}
          options={listeStructures.map((s) => ({ valeur: s.code ?? s.id, libelle: s.nom }))}
          toutes="Toutes les structures"
        />
      </Filtres>

      <Etat chargement={chargement} erreur={erreur} recharger={recharger} texteChargement="Lecture des états de besoin…">
        <Tableau
          colonnes={colonnes}
          lignes={lignes}
          nomDesLignes="état de besoin"
          nomDesLignesPluriel="états de besoin"
          triInitial={{ cle: 'cree_le', sens: 'desc' }}
          surClic={(e) => navigue(`/besoins/${e.id}${window.location.search}`)}
          ligneChoisie={(e) => e.id === besoinOuvert}
          ligneSignalee={(e) => e.statut === 'rejete'}
          ligneMarquee={(e) => estMarque(e.id)}
          titreVide="Aucun état de besoin"
          texteVide={
            statut || structure || q
              ? 'Aucun état de besoin ne répond à ces critères.'
              : "Aucun état de besoin n'existe pour votre périmètre. Une structure ne lit que ses propres données — RG-017."
          }
          pied={`${nombre(lignes.length)} affiché(s) sur ${nombre(total)}`}
        />
      </Etat>

      {besoinOuvert ? (
        <FicheBesoin
          id={besoinOuvert}
          surFermeture={() => navigue(`/besoins${window.location.search}`)}
        />
      ) : null}
    </Page>
  )
}
