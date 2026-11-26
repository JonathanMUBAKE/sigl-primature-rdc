import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Page from '../components/Page.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import Bouton from '../components/Bouton.jsx'
import Tiroir from '../components/Tiroir.jsx'
import Champ from '../components/Champ.jsx'
import Definitions from '../components/Definitions.jsx'
import { Etat, Erreur } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { horodatage, libelle, nombre, texte } from '../lib/format.js'

const STATUTS = ['ouverte', 'en_examen', 'justifiee', 'confirmee', 'classee']
const GRAVITES = ['information', 'attention', 'critique']
const SUITES = [
  { valeur: 'en_examen', libelle: 'En examen — instruction en cours' },
  { valeur: 'justifiee', libelle: 'Justifiée — rien à redresser' },
  { valeur: 'confirmee', libelle: 'Confirmée — le fait est établi' },
  { valeur: 'classee', libelle: 'Classée — sans suite' },
]

/*
  Les alertes. GET /api/alertes ?statut=&gravite=
  Aucune alerte ne décide quoi que ce soit : elle ouvre un examen, un humain
  tranche, et la suite est conservée — RG-022.
  L'instruction se fait dans un tiroir latéral, la liste restant sous les yeux.
*/
export default function Alertes() {
  const [params, setParams] = useSearchParams()
  const navigue = useNavigate()
  const { id: alerteOuverte } = useParams()

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

  const filtrees = useMemo(() => {
    const motif = q.trim().toLocaleLowerCase('fr')
    if (!motif) return lignes
    return lignes.filter((a) =>
      [a.code, a.explication, a.objet_type]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase('fr').includes(motif)),
    )
  }, [lignes, q])

  const alerte = filtrees.find((a) => a.id === alerteOuverte) ?? null

  const colonnes = useMemo(
    () => [
      {
        cle: 'explication',
        titre: 'Alerte',
        rendu: (a) => (
          <span className="cellule-deux-lignes">
            <span>{texte(a.explication)}</span>
            <span className="texte-note mono">{texte(a.code)}</span>
          </span>
        ),
      },
      { cle: 'gravite', titre: 'Gravité', rendu: (a) => <Pastille valeur={a.gravite} /> },
      {
        cle: 'objet_type',
        titre: 'Porte sur',
        rendu: (a) => <span className="cellule-faible">{libelle(a.objet_type)}</span>,
      },
      { cle: 'statut', titre: 'Statut', rendu: (a) => <Pastille valeur={a.statut} /> },
      {
        cle: 'traite_par_nom',
        titre: 'Traitée par',
        rendu: (a) => (
          <span className="cellule-deux-lignes">
            <span className="cellule-faible">{texte(a.traite_par_nom)}</span>
            <span className="texte-note">{a.traite_le ? horodatage(a.traite_le) : ''}</span>
          </span>
        ),
      },
      {
        cle: 'suite',
        titre: 'Suite donnée',
        rendu: (a) => <span className="cellule-faible">{texte(a.suite)}</span>,
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

      <Etat
        chargement={chargement}
        erreur={erreur}
        recharger={recharger}
        texteChargement="Lecture des alertes…"
      >
        <Tableau
          colonnes={colonnes}
          lignes={filtrees}
          nomDesLignes="alerte"
          triInitial={{ cle: 'gravite', sens: 'desc' }}
          ligneSignalee={(a) => a.statut === 'ouverte' && a.gravite === 'critique'}
          ligneMarquee={(a) => estMarque(a.id)}
          ligneChoisie={(a) => a.id === alerteOuverte}
          surClic={(a) => navigue(`/alertes/${a.id}${window.location.search}`)}
          titreVide="Aucune alerte"
          texteVide={
            q || statut || gravite
              ? 'Aucune alerte ne répond à ces critères.'
              : "Aucune alerte n'est ouverte sur votre périmètre. C'est une bonne nouvelle, pas une absence de contrôle."
          }
          pied={`${nombre(filtrees.length)} affichée(s) sur ${nombre(total)}`}
        />
      </Etat>

      {alerteOuverte ? (
        <Instruction
          alerte={alerte}
          surFermeture={() => navigue(`/alertes${window.location.search}`)}
          surSucces={recharger}
        />
      ) : null}
    </Page>
  )
}

/* Le tiroir d'instruction : ce que dit l'alerte, et la suite qu'on lui donne. */
function Instruction({ alerte, surFermeture, surSucces }) {
  const [suite, setSuite] = useState('')
  const [note, setNote] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreurAction, setErreurAction] = useState(null)

  useEffect(() => {
    if (!alerte) return
    setSuite(alerte.statut === 'ouverte' ? 'en_examen' : alerte.statut)
    setNote(alerte.suite ?? '')
  }, [alerte])

  const close = ['justifiee', 'classee'].includes(alerte?.statut)

  async function traiter() {
    setEnvoi(true)
    setErreurAction(null)
    try {
      await api.traiterAlerte(alerte.id, { statut: suite, suite: note })
      surSucces?.()
      surFermeture()
    } catch (cause) {
      setErreurAction(cause)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Tiroir
      ouvert
      surFermeture={surFermeture}
      surTitre="Alerte"
      titre={alerte ? texte(alerte.explication) : 'Alerte'}
      sousTitre={alerte ? <span className="mono">{texte(alerte.code)}</span> : null}
      pied={
        <>
          <Bouton surClic={surFermeture}>Fermer</Bouton>
          <Bouton
            allure="principale"
            desactive={!alerte || close || envoi || suite === '' || note.trim() === ''}
            surClic={traiter}
            titre={close ? 'Cette alerte est close' : undefined}
          >
            {envoi ? 'Envoi…' : 'Enregistrer la suite'}
          </Bouton>
        </>
      }
    >
      {!alerte ? (
        <p className="texte-faible sans-marge">
          Cette alerte ne figure pas dans la liste affichée. Retirez un filtre, ou revenez à la liste
          complète.
        </p>
      ) : (
        <>
          <Definitions
            entrees={[
              { cle: 'Gravité', valeur: <Pastille valeur={alerte.gravite} /> },
              { cle: 'Statut', valeur: <Pastille valeur={alerte.statut} /> },
              { cle: 'Porte sur', valeur: libelle(alerte.objet_type) },
              {
                cle: 'Objet',
                valeur: <span className="mono">{texte(alerte.objet_id)}</span>,
              },
              { cle: 'Traitée par', valeur: texte(alerte.traite_par_nom) },
              { cle: 'Traitée le', valeur: horodatage(alerte.traite_le) },
            ]}
          />

          <h3 className="section-titre separe-dessus">La suite à donner</h3>
          <p className="texte-note marge-dessus-1">
            L'alerte ne change aucun état métier — RG-022. Ce qui est enregistré ici, c'est la
            décision d'un agent, et elle est conservée au journal.
          </p>
          <div className="marge-dessus-3">
            <Champ
              libelle="Suite retenue"
              type="choix"
              valeur={suite}
              surChangement={setSuite}
              options={SUITES}
              obligatoire
              desactive={close}
            />
            <Champ
              libelle="Motivation"
              type="zone"
              valeur={note}
              surChangement={setNote}
              obligatoire
              desactive={close}
              aide="Elle explique la décision à qui la relira."
            />
          </div>
          {erreurAction ? (
            <Erreur erreur={erreurAction} titre="Le serveur a refusé l'action" />
          ) : null}
        </>
      )}
    </Tiroir>
  )
}
