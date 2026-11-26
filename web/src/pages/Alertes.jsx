import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Gavel } from 'lucide-react'
import Page from '../components/Page.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import Bouton from '../components/Bouton.jsx'
import Dialogue from '../components/Dialogue.jsx'
import Champ from '../components/Champ.jsx'
import { Etat, Erreur } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { horodatage, libelle, nombre, texte } from '../lib/format.js'

const STATUTS = ['ouverte', 'en_examen', 'justifiee', 'confirmee', 'classee']
const GRAVITES = ['basse', 'moyenne', 'haute', 'critique']
const SUITES = [
  { valeur: 'justifiee', libelle: 'Justifiée — rien à redresser' },
  { valeur: 'confirmee', libelle: 'Confirmée — le fait est établi' },
  { valeur: 'en_examen', libelle: 'En examen — instruction en cours' },
  { valeur: 'classee', libelle: 'Classée — sans suite' },
]

/*
  Les alertes. GET /api/alertes ?statut=&gravite=
  Aucune alerte ne décide quoi que ce soit : elle ouvre un examen, un humain
  tranche, et la suite est conservée — RG-022.
*/
export default function Alertes() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const statut = params.get('statut') ?? ''
  const gravite = params.get('gravite') ?? ''

  function poser(cle, valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, valeur)
    else prochain.delete(cle)
    setParams(prochain, { replace: true })
  }

  const { donnees, chargement, erreur, recharger } = useRequete(
    (o) => api.alertes({ statut, gravite }, o),
    [statut, gravite],
  )
  const { lignes, total } = depouillerListe(donnees)

  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant('alertes', recharger, marquer)

  const [enExamen, setEnExamen] = useState(null)
  const [suite, setSuite] = useState('')
  const [note, setNote] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreurAction, setErreurAction] = useState(null)

  const filtrees = useMemo(() => {
    const motif = q.trim().toLocaleLowerCase('fr')
    if (!motif) return lignes
    return lignes.filter((a) =>
      [a.code, a.explication, a.objet_type]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase('fr').includes(motif)),
    )
  }, [lignes, q])

  async function traiter() {
    setEnvoi(true)
    setErreurAction(null)
    try {
      await api.traiterAlerte(enExamen.id, { statut: suite, suite: note })
      setEnExamen(null)
      setSuite('')
      setNote('')
      recharger()
    } catch (cause) {
      setErreurAction(cause)
    } finally {
      setEnvoi(false)
    }
  }

  const colonnes = useMemo(
    () => [
      { cle: 'code', titre: 'Code', rendu: (a) => <span className="mono">{texte(a.code)}</span> },
      { cle: 'gravite', titre: 'Gravité', rendu: (a) => <Pastille valeur={a.gravite} /> },
      { cle: 'explication', titre: 'Explication', rendu: (a) => texte(a.explication) },
      {
        cle: 'objet_type',
        titre: 'Porte sur',
        rendu: (a) => <span className="cellule-faible">{libelle(a.objet_type)}</span>,
      },
      { cle: 'statut', titre: 'Statut', rendu: (a) => <Pastille valeur={a.statut} /> },
      {
        cle: 'traite_par_nom',
        titre: 'Traitée par',
        rendu: (a) => <span className="cellule-faible">{texte(a.traite_par_nom)}</span>,
      },
      { cle: 'traite_le', titre: 'Traitée le', nombre: true, rendu: (a) => horodatage(a.traite_le) },
      {
        cle: 'suite',
        titre: 'Suite donnée',
        rendu: (a) => <span className="cellule-faible">{texte(a.suite)}</span>,
      },
      {
        cle: 'action',
        titre: '',
        triable: false,
        rendu: (a) => (
          <Bouton
            taille="petite"
            icone={Gavel}
            desactive={['justifiee', 'classee'].includes(a.statut)}
            surClic={() => {
              setEnExamen(a)
              setSuite(a.statut === 'ouverte' ? 'en_examen' : a.statut)
              setNote(a.suite ?? '')
            }}
          >
            Instruire
          </Bouton>
        ),
      },
    ],
    [],
  )

  return (
    <Page
      titre="Alertes"
      sousTitre="Une alerte ouvre un examen ; c'est un humain qui tranche, et la suite est conservée — RG-022"
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Alertes' }]}
    >
      <Filtres total={erreur || chargement ? undefined : filtrees.length} nom="alerte">
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Code, explication, objet…"
        />
        <Filtre
          libelle="Statut"
          valeur={statut}
          surChangement={(v) => poser('statut', v)}
          options={STATUTS.map((code) => ({ valeur: code, libelle: libelle(code) }))}
          toutes="Tous les statuts"
        />
        <Filtre
          libelle="Gravité"
          valeur={gravite}
          surChangement={(v) => poser('gravite', v)}
          options={GRAVITES.map((code) => ({ valeur: code, libelle: libelle(code) }))}
          toutes="Toutes les gravités"
        />
      </Filtres>

      <Etat chargement={chargement} erreur={erreur} recharger={recharger} texteChargement="Lecture des alertes…">
        <Tableau
          colonnes={colonnes}
          lignes={filtrees}
          nomDesLignes="alerte"
          triInitial={{ cle: 'gravite', sens: 'desc' }}
          ligneSignalee={(a) => a.statut === 'ouverte' && ['haute', 'critique'].includes(a.gravite)}
          ligneMarquee={(a) => estMarque(a.id)}
          titreVide="Aucune alerte"
          texteVide={
            q || statut || gravite
              ? 'Aucune alerte ne répond à ces critères.'
              : "Aucune alerte n'est ouverte sur votre périmètre. C'est une bonne nouvelle, pas une absence de contrôle."
          }
          pied={`${nombre(filtrees.length)} affichée(s) sur ${nombre(total)}`}
        />
      </Etat>

      <Dialogue
        ouvert={enExamen !== null}
        titre={`Instruire l'alerte ${enExamen?.code ?? ''}`}
        surFermeture={() => {
          setEnExamen(null)
          setErreurAction(null)
        }}
        pied={
          <>
            <Bouton
              surClic={() => {
                setEnExamen(null)
                setErreurAction(null)
              }}
            >
              Annuler
            </Bouton>
            <Bouton
              allure="principale"
              desactive={envoi || suite === '' || note.trim() === ''}
              surClic={traiter}
            >
              {envoi ? 'Envoi…' : 'Enregistrer la suite'}
            </Bouton>
          </>
        }
      >
        <p className="texte-faible sans-marge">
          {texte(enExamen?.explication)}
        </p>
        <Champ
          libelle="Suite retenue"
          type="choix"
          valeur={suite}
          surChangement={setSuite}
          options={SUITES}
          obligatoire
        />
        <Champ
          libelle="Motivation"
          type="zone"
          valeur={note}
          surChangement={setNote}
          obligatoire
          aide="Conservée au journal : elle explique la décision à qui la relira."
        />
        {erreurAction ? <Erreur erreur={erreurAction} titre="Le serveur a refusé l'action" /> : null}
      </Dialogue>
    </Page>
  )
}
