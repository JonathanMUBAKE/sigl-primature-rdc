import { useState } from 'react'
import clsx from 'clsx'
import { Check, FileSignature, Gavel, X } from 'lucide-react'
import Tiroir from '../components/Tiroir.jsx'
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
  Le détail d'un état de besoin, dans un tiroir latéral : son circuit, ses
  lignes, et les actions permises par le rôle de l'agent courant. Le dialogue
  ne sert qu'à confirmer une action et à en saisir le motif.

  Les règles restent au serveur — RG-001 à RG-006. L'interface les rappelle et
  grise ce qui n'est pas permis, mais c'est le serveur qui refuse, et son
  message français est affiché tel quel.
*/

const CIRCUIT = [
  { statut: 'brouillon', nom: 'Rédaction', note: 'Demandeur' },
  { statut: 'vise', nom: 'Visa du chef de structure', note: 'RG-001, RG-002' },
  { statut: 'recu', nom: 'Réception centrale', note: 'Logistique' },
  { statut: 'examine', nom: 'Examen et arbitrage', note: 'RG-003, RG-004' },
  { statut: 'en_achat', nom: 'Achat', note: 'RG-007 à RG-009' },
  { statut: 'livrable', nom: 'Réception', note: 'PV, puis RG-010' },
  { statut: 'livre', nom: 'Livraison', note: 'Accusé du demandeur' },
  { statut: 'clos', nom: 'Clôture', note: 'RG-006' },
]

const RANG = Object.fromEntries(CIRCUIT.map((etape, i) => [etape.statut, i]))

export default function FicheBesoin({ id, surFermeture }) {
  const { agent } = useAgent()
  const { aLeRole } = useRoles()

  const fiche = useRequete((o) => api.besoin(id, o), [id])
  useFlux('besoins', (evenement) => {
    if (!evenement.id || evenement.id === id) fiche.recharger()
  })

  const [action, setAction] = useState(null)
  const [motif, setMotif] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreurAction, setErreurAction] = useState(null)

  const e = fiche.donnees ?? {}
  const lignes = depouillerListe(e.lignes ?? []).lignes
  const rangCourant = RANG[e.statut] ?? -1

  const estLeDemandeur = agent?.id && agent.id === e.demandeur_id
  const peutViser = aLeRole('chef_structure') && e.statut === 'brouillon' && !estLeDemandeur
  const peutExaminer = aLeRole('logistique') && ['vise', 'recu'].includes(e.statut)
  const peutAccuser = (estLeDemandeur || aLeRole('demandeur')) && e.statut === 'livre'

  async function envoyer(quoi) {
    setEnvoi(true)
    setErreurAction(null)
    try {
      // Les corps attendus par le serveur : ils ne portent pas tous le même nom.
      if (quoi === 'viser') await api.viserBesoin(id, motif ? { justification: motif } : null)
      else if (quoi === 'examiner') await api.examinerBesoin(id, { decision: 'partielle', motif })
      else if (quoi === 'rejeter') await api.examinerBesoin(id, { decision: 'rejet', motif })
      else if (quoi === 'accuser')
        await api.accuserBesoin(id, motif ? { observations: motif } : null)
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
    <>
      <Tiroir
        ouvert
        surFermeture={surFermeture}
        surTitre="État de besoin"
        titre={fiche.chargement ? 'Chargement…' : <span className="mono">{texte(e.numero)}</span>}
        sousTitre={fiche.chargement ? null : texte(e.objet ?? e.justification)}
        pied={
          <>
            <Bouton
              icone={FileSignature}
              desactive={!peutViser}
              surClic={() => setAction('viser')}
              titre={
                estLeDemandeur
                  ? 'Un chef de structure ne vise pas sa propre demande — RG-002'
                  : peutViser
                    ? undefined
                    : "Votre profil ne peut pas viser cet état à ce stade"
              }
            >
              Viser
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
              icone={Gavel}
              desactive={!peutExaminer}
              surClic={() => setAction('examiner')}
              titre={peutExaminer ? undefined : "Votre profil ne peut pas examiner cet état"}
            >
              Examiner
            </Bouton>
            <Bouton
              allure="principale"
              icone={Check}
              desactive={!peutAccuser}
              surClic={() => setAction('accuser')}
              titre={
                peutAccuser ? undefined : "L'accusé de réception revient au demandeur, après livraison"
              }
            >
              Accuser réception
            </Bouton>
          </>
        }
      >
        {fiche.chargement ? (
          <Chargement texte="Lecture de l'état de besoin…" />
        ) : fiche.erreur ? (
          <Erreur
            erreur={fiche.erreur}
            surReessai={fiche.recharger}
            titre="L'état de besoin n'a pas pu être lu"
          />
        ) : (
          <>
            <h3 className="section-titre">Le circuit</h3>
            <div className="circuit marge-dessus-3">
              {CIRCUIT.map((etape, index) => (
                <div
                  key={etape.statut}
                  className={clsx(
                    'circuit-etape',
                    index < rangCourant && 'est-faite',
                    index === rangCourant && 'est-courante',
                  )}
                >
                  <span className="circuit-puce" aria-hidden="true" />
                  <span className="circuit-nom">{etape.nom}</span>
                  <span className="circuit-note">{etape.note}</span>
                </div>
              ))}
            </div>
            {['rejete', 'partiel'].includes(e.statut) ? (
              <div className="ligne-outils marge-dessus-3">
                <Pastille valeur={e.statut} />
                <span className="texte-faible">{texte(e.motif_decision)}</span>
              </div>
            ) : null}

            <h3 className="section-titre separe-dessus">La demande</h3>
            <div className="marge-dessus-3">
              <Definitions
                entrees={[
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

            <h3 className="section-titre separe-dessus">Justification</h3>
            <p className="marge-dessus-3 largeur-propos">
              {e.justification ? (
                e.justification
              ) : (
                <span className="texte-note">
                  Aucune justification saisie. Un état de besoin sans justification ne peut pas être
                  visé — RG-001.
                </span>
              )}
            </p>

            <h3 className="section-titre separe-dessus">Les lignes</h3>
            <div className="marge-dessus-3">
              <Tableau
                lignes={lignes}
                nomDesLignes="ligne"
                titreVide="Aucune ligne"
                texteVide="Cet état de besoin ne porte aucune ligne : il n'y a rien à arbitrer."
                colonnes={[
                  {
                    cle: 'designation',
                    titre: 'Désignation',
                    rendu: (l) => (
                      <span className="cellule-deux-lignes">
                        <span>{texte(l.designation)}</span>
                        <span className="texte-note">
                          {texte(l.categorie_libelle ?? l.categorie_code)}
                        </span>
                      </span>
                    ),
                  },
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
                ]}
              />
            </div>
          </>
        )}
      </Tiroir>

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
        <div className="marge-dessus-3">
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
        </div>
        {erreurAction ? <Erreur erreur={erreurAction} titre="Le serveur a refusé l'action" /> : null}
      </Dialogue>
    </>
  )
}
