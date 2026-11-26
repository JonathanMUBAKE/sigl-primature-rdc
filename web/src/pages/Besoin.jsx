import { useState } from 'react'
import { useParams } from 'react-router-dom'
import clsx from 'clsx'
import { Check, FileSignature, Gavel, X } from 'lucide-react'
import Page, { Section } from '../components/Page.jsx'
import Definitions from '../components/Definitions.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Bouton from '../components/Bouton.jsx'
import Dialogue from '../components/Dialogue.jsx'
import Champ from '../components/Champ.jsx'
import { Chargement, Erreur } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { useAgent, useRoles } from '../lib/agent.jsx'
import { useFlux } from '../lib/flux.js'
import { horodatage, libelle, nombre, texte } from '../lib/format.js'

/*
  Le détail d'un état de besoin : son circuit, ses lignes, et les actions
  permises par le rôle de l'agent courant.

  Les règles restent au serveur — RG-001 à RG-006. L'interface les rappelle
  pour le confort et grise ce qui n'est pas permis, mais c'est le serveur qui
  refuse, et son message français est affiché tel quel.
*/

const CIRCUIT = [
  { statut: 'brouillon', nom: 'Rédaction', note: 'Le demandeur justifie son besoin' },
  { statut: 'vise', nom: 'Visa du chef de structure', note: 'RG-001, RG-002' },
  { statut: 'recu', nom: 'Réception centrale', note: 'La logistique prend le dossier' },
  { statut: 'examine', nom: 'Examen et arbitrage', note: 'RG-003, RG-004 — ligne par ligne' },
  { statut: 'en_achat', nom: 'Achat', note: 'RG-007 à RG-009' },
  { statut: 'livrable', nom: 'Réception', note: 'PV de réception, puis RG-010' },
  { statut: 'livre', nom: 'Livraison', note: "Accusé de réception du demandeur" },
  { statut: 'clos', nom: 'Clôture', note: 'RG-006 — pas de clôture sans accusé signé' },
]

const RANG = Object.fromEntries(CIRCUIT.map((etape, i) => [etape.statut, i]))

export default function Besoin() {
  const { id } = useParams()
  const { agent } = useAgent()
  const { aLeRole } = useRoles()

  const fiche = useRequete((o) => api.besoin(id, o), [id])
  useFlux('besoins', (evenement) => {
    if (!evenement.id || evenement.id === id) fiche.recharger()
  })

  const [action, setAction] = useState(null) // 'viser' | 'examiner' | 'rejeter' | 'accuser'
  const [motif, setMotif] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreurAction, setErreurAction] = useState(null)

  const fil = [
    { libelle: 'SIGL', to: '/' },
    { libelle: 'États de besoin', to: '/besoins' },
    { libelle: fiche.donnees?.numero ?? 'État de besoin' },
  ]

  if (fiche.chargement) {
    return (
      <Page titre="État de besoin" fil={fil}>
        <Chargement texte="Lecture de l'état de besoin…" />
      </Page>
    )
  }

  if (fiche.erreur) {
    return (
      <Page titre="État de besoin" fil={fil}>
        <Erreur
          erreur={fiche.erreur}
          surReessai={fiche.recharger}
          titre="L'état de besoin n'a pas pu être lu"
        />
      </Page>
    )
  }

  const e = fiche.donnees ?? {}
  const lignes = depouillerListe(e.lignes ?? e.ligne_besoin ?? []).lignes
  const rangCourant = RANG[e.statut] ?? -1

  // Ce que le rôle permet. Le serveur reste l'autorité : RG-002 y est contrôlée.
  const estLeDemandeur = agent?.id && agent.id === e.demandeur_id
  const peutViser = aLeRole('chef_structure') && e.statut === 'brouillon' && !estLeDemandeur
  const peutExaminer = aLeRole('logistique') && ['vise', 'recu'].includes(e.statut)
  const peutAccuser = (estLeDemandeur || aLeRole('demandeur')) && e.statut === 'livre'

  async function envoyer(quoi) {
    setEnvoi(true)
    setErreurAction(null)
    try {
      if (quoi === 'viser') await api.viserBesoin(id, { motif: motif || undefined })
      else if (quoi === 'examiner') await api.examinerBesoin(id, { motif, decision: 'partiel' })
      else if (quoi === 'rejeter') await api.examinerBesoin(id, { motif, decision: 'rejete' })
      else if (quoi === 'accuser') await api.accuserBesoin(id, { motif: motif || undefined })
      setAction(null)
      setMotif('')
      fiche.recharger()
    } catch (cause) {
      setErreurAction(cause)
    } finally {
      setEnvoi(false)
    }
  }

  const titresDaction = {
    viser: "Viser l'état de besoin",
    examiner: 'Accorder en partie',
    rejeter: "Rejeter l'état de besoin",
    accuser: 'Accuser réception',
  }

  const motifObligatoire = action === 'examiner' || action === 'rejeter'

  return (
    <Page
      titre={<span className="mono">{texte(e.numero)}</span>}
      sousTitre={texte(e.objet ?? e.justification)}
      fil={fil}
      actions={
        <>
          <Bouton vers="/besoins">Retour à la liste</Bouton>
          <Bouton
            icone={FileSignature}
            desactive={!peutViser}
            surClic={() => setAction('viser')}
            titre={
              estLeDemandeur
                ? 'Un chef de structure ne vise pas sa propre demande — RG-002'
                : peutViser
                  ? undefined
                  : "Votre profil ne peut pas viser cet état de besoin à ce stade"
            }
          >
            Viser
          </Bouton>
          <Bouton
            icone={Gavel}
            desactive={!peutExaminer}
            surClic={() => setAction('examiner')}
            titre={peutExaminer ? undefined : "Votre profil ne peut pas examiner cet état de besoin"}
          >
            Examiner
          </Bouton>
          <Bouton
            allure="danger"
            icone={X}
            desactive={!peutExaminer}
            surClic={() => setAction('rejeter')}
            titre={peutExaminer ? 'Un rejet exige un motif — RG-004' : undefined}
          >
            Rejeter
          </Bouton>
          <Bouton
            allure="principale"
            icone={Check}
            desactive={!peutAccuser}
            surClic={() => setAction('accuser')}
            titre={peutAccuser ? undefined : "L'accusé de réception revient au demandeur, après livraison"}
          >
            Accuser réception
          </Bouton>
        </>
      }
    >
      <Section titre="Le circuit" note="RG-006 : pas de clôture sans accusé de réception signé">
        <div className="circuit">
          {CIRCUIT.map((etape, index) => (
            <div
              key={etape.statut}
              className={clsx(
                'circuit-etape',
                index < rangCourant && 'est-faite',
                index === rangCourant && 'est-courante',
              )}
            >
              <div className="circuit-rang">Étape {index + 1}</div>
              <div className="circuit-nom">{etape.nom}</div>
              <div className="circuit-note">{etape.note}</div>
            </div>
          ))}
        </div>
        {['rejete', 'partiel'].includes(e.statut) ? (
          <div className="marge-dessus-3 ligne-outils">
            <Pastille valeur={e.statut} />
            <span className="texte-faible">{texte(e.motif_decision)}</span>
          </div>
        ) : null}
      </Section>

      <Section titre="La demande">
        <div className="carte">
          <Definitions
            entrees={[
              { cle: 'Numéro', valeur: <span className="mono">{texte(e.numero)}</span> },
              { cle: 'Statut', valeur: <Pastille valeur={e.statut} /> },
              { cle: 'Structure', valeur: texte(e.structure_nom) },
              { cle: 'Demandeur', valeur: texte(e.demandeur_nom) },
              { cle: 'Créé le', valeur: horodatage(e.cree_le) },
              { cle: 'Visé le', valeur: horodatage(e.vise_le) },
              { cle: 'Viseur', valeur: texte(e.viseur_nom) },
              { cle: 'Examiné le', valeur: horodatage(e.examine_le) },
              { cle: 'Examinateur', valeur: texte(e.examinateur_nom) },
            ]}
          />
        </div>
        <div className="carte marge-dessus-3">
          <div className="carte-tete">Justification</div>
          <div className="carte-corps">
            {e.justification ? (
              <p className="sans-marge">{e.justification}</p>
            ) : (
              <p className="texte-note sans-marge">
                Aucune justification saisie. Un état de besoin sans justification ne peut pas être
                visé — RG-001.
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section titre="Les lignes" note="L'arbitrage se fait ligne par ligne : stock, achat ou refus">
        <Tableau
          lignes={lignes}
          nomDesLignes="ligne"
          titreVide="Aucune ligne"
          texteVide="Cet état de besoin ne porte aucune ligne. Un état sans ligne n'a rien à arbitrer."
          colonnes={[
            {
              cle: 'categorie_code',
              titre: 'Catégorie',
              rendu: (l) => (
                <span className="cellule-faible">{texte(l.categorie_libelle ?? l.categorie_code)}</span>
              ),
            },
            { cle: 'designation', titre: 'Désignation', rendu: (l) => texte(l.designation) },
            {
              cle: 'quantite_demandee',
              titre: 'Demandée',
              nombre: true,
              rendu: (l) => nombre(l.quantite_demandee),
            },
            {
              cle: 'quantite_accordee',
              titre: 'Accordée',
              nombre: true,
              rendu: (l) =>
                l.quantite_accordee === null || l.quantite_accordee === undefined
                  ? '—'
                  : nombre(l.quantite_accordee),
            },
            {
              cle: 'origine',
              titre: 'Origine',
              rendu: (l) => (l.origine ? <Pastille valeur={l.origine} /> : '—'),
            },
            { cle: 'motif', titre: 'Motif', rendu: (l) => texte(l.motif) },
          ]}
        />
      </Section>

      <Dialogue
        ouvert={action !== null}
        titre={titresDaction[action] ?? 'Action'}
        surFermeture={() => {
          setAction(null)
          setErreurAction(null)
        }}
        pied={
          <>
            <Bouton
              surClic={() => {
                setAction(null)
                setErreurAction(null)
              }}
            >
              Annuler
            </Bouton>
            <Bouton
              allure={action === 'rejeter' ? 'danger' : 'principale'}
              desactive={envoi || (motifObligatoire && motif.trim() === '')}
              surClic={() => envoyer(action)}
            >
              {envoi ? 'Envoi…' : 'Confirmer'}
            </Bouton>
          </>
        }
      >
        <p className="texte-faible sans-marge">
          {action === 'viser'
            ? "Le visa engage le chef de structure. Le serveur vérifie la justification et l'identité du viseur — RG-001, RG-002."
            : action === 'examiner'
              ? 'Une validation partielle exige un motif non vide — RG-003.'
              : action === 'rejeter'
                ? 'Un rejet exige un motif non vide — RG-004.'
                : "L'accusé de réception clôt le circuit. Sans lui, l'état de besoin ne se clôt pas — RG-006."}
        </p>
        <Champ
          libelle="Motif"
          type="zone"
          valeur={motif}
          surChangement={setMotif}
          obligatoire={motifObligatoire}
          aide={
            motifObligatoire
              ? 'Le motif est conservé et figure sur le document émis.'
              : 'Facultatif, mais conservé au journal.'
          }
        />
        {erreurAction ? <Erreur erreur={erreurAction} titre="Le serveur a refusé l'action" /> : null}
      </Dialogue>
    </Page>
  )
}
