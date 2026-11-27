import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Download, FileUp, Upload, Check, CircleAlert, Copy, Play } from 'lucide-react'
import Page from '../components/Page.jsx'
import Bento, { Bloc } from '../components/Bento.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Bouton from '../components/Bouton.jsx'
import Chiffre, { RangeeChiffres } from '../components/Chiffre.jsx'
import Definitions from '../components/Definitions.jsx'
import Dialogue from '../components/Dialogue.jsx'
import { Erreur, Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { depouillerListe, useRequete } from '../lib/requete.js'
import { useRoles } from '../lib/agent.jsx'
import { horodatage, nombre, texte } from '../lib/format.js'

/*
  La reprise des inventaires existants — `docs/LOT-REPRISE.md`.

  Deux temps, et l'écran les montre comme deux temps : le dépôt ANALYSE et
  n'écrit aucun bien (RG-034) ; l'application écrit, et seulement sur décision
  d'un humain. C'est la règle du projet — l'IA propose, un humain décide —
  appliquée à la seule opération du SIGL qui crée des milliers de lignes d'un
  coup.

  Le rapport ligne par ligne est la pièce maîtresse de cet écran, pas un
  accessoire : un import qui annonce « 412 lignes sur 1 500 importées » sans
  dire lesquelles ni pourquoi oblige l'agent à comparer deux listes à la main.
  Il abandonne, et c'est l'outil qu'il abandonne. Chaque ligne écartée nomme
  donc sa colonne et son motif, et chaque compteur du résumé mène aux lignes
  qu'il compte — aucun cul-de-sac.
*/

const COLONNES_DU_MODELE = [
  'immatriculation', 'designation', 'categorie', 'date_acquisition',
  'marque', 'modele', 'numero_serie', 'etat', 'valeur_acquisition',
  'site', 'detenteur_email', 'suivi', 'quantite',
]

const VERDICTS = [
  { valeur: 'a_creer', libelle: 'À créer', ton: 'info' },
  { valeur: 'creee', libelle: 'Créée', ton: 'succes' },
  { valeur: 'doublon', libelle: 'Déjà au registre', ton: 'attente' },
  { valeur: 'rejetee', libelle: 'Refusée', ton: 'danger' },
]

const TON_VERDICT = Object.fromEntries(VERDICTS.map((v) => [v.valeur, v.ton]))
const LIBELLE_VERDICT = Object.fromEntries(VERDICTS.map((v) => [v.valeur, v.libelle]))

const ROLES_DE_REPRISE = ['comptable_matieres', 'logistique', 'intendant']

/** Le modèle de fichier, fabriqué ici : l'institution n'attend rien de nous. */
function telechargerLeModele() {
  const contenu = [
    COLONNES_DU_MODELE.join(';'),
    'INV/2019/0041;Armoire métallique deux portes;MOB;12/04/2019;;;;bon;450000;Magasin central;;individuel;1',
    ';Chaises visiteur (lot);MOB;2021-02-02;;;;bon;;Magasin central;;lot;12',
  ].join('\n')
  // Le préfixe d'octets est là pour Excel, qui sans lui lit l'UTF-8 de travers
  // et affiche « Armoire mÃ©tallique » : l'agent croirait le modèle fautif.
  const blob = new Blob([`﻿${contenu}\n`], { type: 'text/csv;charset=utf-8' })
  const adresse = URL.createObjectURL(blob)
  const lien = document.createElement('a')
  lien.href = adresse
  lien.download = 'modele-reprise-inventaire.csv'
  lien.click()
  URL.revokeObjectURL(adresse)
}

export default function Reprises() {
  const { id: ouverte } = useParams()
  return ouverte ? <RapportDeReprise id={ouverte} /> : <ListeDesReprises />
}

// ---------------------------------------------------------------------------
// La liste, et le dépôt.
// ---------------------------------------------------------------------------
function ListeDesReprises() {
  const navigue = useNavigate()
  const { aLeRole } = useRoles()
  const peutReprendre = ROLES_DE_REPRISE.some((r) => aLeRole(r))

  const liste = useRequete((o) => api.reprises({ parPage: 100 }, o), [])
  const { lignes } = depouillerListe(liste.donnees)
  const [depot, setDepot] = useState(false)

  const colonnes = useMemo(() => [
    { cle: 'numero', titre: 'Reprise', largeur: '9rem' },
    {
      cle: 'fichier_nom',
      titre: 'Fichier déposé',
      rendu: (l) => texte(l.fichier_nom),
    },
    { cle: 'structure_code', titre: 'Structure', largeur: '7rem' },
    {
      cle: 'cree_le',
      titre: 'Déposée le',
      largeur: '11rem',
      rendu: (l) => horodatage(l.cree_le),
    },
    { cle: 'lignes_total', titre: 'Lignes', nombre: true, largeur: '6rem' },
    {
      cle: 'lignes_a_creer',
      titre: 'À créer',
      nombre: true,
      largeur: '6rem',
      rendu: (l) => nombre(l.lignes_a_creer),
    },
    {
      cle: 'lignes_creees',
      titre: 'Créées',
      nombre: true,
      largeur: '6rem',
      rendu: (l) => nombre(l.lignes_creees),
    },
    {
      cle: 'lignes_rejetees',
      titre: 'Refusées',
      nombre: true,
      largeur: '7rem',
      rendu: (l) => nombre(l.lignes_rejetees),
    },
    {
      cle: 'statut',
      titre: 'État',
      largeur: '8rem',
      rendu: (l) => (
        <Pastille
          ton={l.statut === 'appliquee' ? 'succes' : 'attente'}
          texte={l.statut === 'appliquee' ? 'Appliquée' : 'À décider'}
          titre={l.statut === 'appliquee'
            ? `Appliquée le ${horodatage(l.applique_le)}`
            : "Le dépôt a analysé le fichier ; aucun bien n'a encore été créé"}
        />
      ),
    },
  ], [])

  return (
    <Page
      titre="Reprise des inventaires existants"
      sousTitre="Le dépôt analyse le fichier et n'écrit rien. Les biens ne sont créés qu'après lecture du rapport."
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Reprise' }]}
      actions={(
        <>
          <Bouton icone={Download} surClic={telechargerLeModele}>
            Modèle de fichier
          </Bouton>
          <Bouton
            allure="principale"
            icone={FileUp}
            surClic={() => setDepot(true)}
            desactive={!peutReprendre}
            titre={peutReprendre
              ? undefined
              : "Seuls le comptable des matières, la logistique centrale et l'intendant déposent une reprise"}
          >
            Déposer un inventaire
          </Bouton>
        </>
      )}
    >
      <Bento>
        <Bloc large={12} titre="Les reprises déposées">
          <Etat
            chargement={liste.chargement}
            erreur={liste.erreur}
            recharger={liste.recharger}
            texteChargement="Lecture des reprises…"
            vide={lignes.length === 0}
            titreVide="Aucune reprise déposée"
            texteVide="La Primature tient déjà ses inventaires sur papier et en tableur. Déposez-en un : le fichier sera analysé ligne par ligne, et rien ne sera créé avant votre décision."
            actionVide={peutReprendre
              ? <Bouton allure="principale" icone={FileUp} surClic={() => setDepot(true)}>Déposer un inventaire</Bouton>
              : null}
          >
            <Tableau
              colonnes={colonnes}
              lignes={lignes}
              surClic={(l) => navigue(`/reprises/${l.id}`)}
              nomDesLignes="reprise"
              nomDesLignesPluriel="reprises"
              triInitial={{ cle: 'cree_le', sens: 'desc' }}
            />
          </Etat>
        </Bloc>
      </Bento>

      <DialogueDeDepot
        ouvert={depot}
        surFermeture={() => setDepot(false)}
        surSucces={(reprise) => {
          setDepot(false)
          navigue(`/reprises/${reprise.id}`)
        }}
      />
    </Page>
  )
}

function DialogueDeDepot({ ouvert, surFermeture, surSucces }) {
  const champFichier = useRef(null)
  const [nom, setNom] = useState('')
  const [contenu, setContenu] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function choisir(evenement) {
    const fichier = evenement.target.files?.[0]
    setErreur(null)
    if (!fichier) {
      setNom('')
      setContenu('')
      return
    }
    setNom(fichier.name)
    setContenu(await fichier.text())
  }

  async function deposer() {
    setEnvoi(true)
    setErreur(null)
    try {
      const reprise = await api.deposerReprise({ fichier_nom: nom, contenu })
      setNom('')
      setContenu('')
      if (champFichier.current) champFichier.current.value = ''
      surSucces?.(reprise)
    } catch (cause) {
      setErreur(cause)
    } finally {
      setEnvoi(false)
    }
  }

  const lignesLues = contenu
    ? contenu.split(/\r?\n/).filter((l) => l.replace(/;/g, '').trim()).length - 1
    : 0

  return (
    <Dialogue
      ouvert={ouvert}
      titre="Déposer un inventaire existant"
      surFermeture={surFermeture}
      large
      pied={(
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={Upload}
            surClic={deposer}
            desactive={!nom || !contenu || envoi}
          >
            {envoi ? 'Analyse…' : 'Analyser le fichier'}
          </Bouton>
        </>
      )}
    >
      <p className="texte-appui">
        Le fichier est lu et confronté à la nomenclature, aux sites et au registre existant.
        {' '}
        <strong>Aucun bien n&apos;est créé à cette étape.</strong>
        {' '}
        Vous lirez le rapport ligne par ligne avant de décider.
      </p>

      <div className="champ">
        <label className="champ-libelle" htmlFor="reprise-fichier">
          Fichier à séparateur point-virgule (UTF-8)
        </label>
        <input
          id="reprise-fichier"
          ref={champFichier}
          className="champ-saisie"
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={choisir}
        />
        <div className="champ-aide">
          Colonnes obligatoires : <code>designation</code>, <code>categorie</code>,{' '}
          <code>date_acquisition</code>. L&apos;ordre des colonnes est libre. Une colonne inconnue
          fait refuser le fichier, en la nommant — une colonne mal orthographiée est une donnée
          perdue en silence.
        </div>
      </div>

      {nom ? (
        <Definitions
          entrees={[
            { cle: 'Fichier', valeur: nom },
            { cle: 'Lignes de données lues', valeur: nombre(Math.max(0, lignesLues)) },
          ]}
        />
      ) : null}

      {erreur ? (
        <Erreur
          erreur={erreur}
          titre="Le fichier n’a pas été accepté"
        />
      ) : null}
    </Dialogue>
  )
}

// ---------------------------------------------------------------------------
// Le rapport : un poste de travail, donc un écran plein.
// ---------------------------------------------------------------------------
function RapportDeReprise({ id }) {
  const [params, setParams] = useSearchParams()
  const navigue = useNavigate()
  const { aLeRole } = useRoles()
  const peutAppliquer = ROLES_DE_REPRISE.some((r) => aLeRole(r))

  const verdict = params.get('verdict') ?? ''

  const fiche = useRequete((o) => api.reprise(id, o), [id])
  const rapport = useRequete(
    (o) => api.lignesDeReprise(id, { verdict: verdict || undefined, parPage: 200 }, o),
    [id, verdict],
  )
  const reprise = fiche.donnees ?? null
  const { lignes, total } = depouillerListe(rapport.donnees)

  const [confirmation, setConfirmation] = useState(false)
  const [application, setApplication] = useState({ enCours: false, erreur: null })

  function filtrer(valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set('verdict', valeur)
    else prochain.delete('verdict')
    setParams(prochain, { replace: true })
  }

  async function appliquer() {
    setApplication({ enCours: true, erreur: null })
    try {
      await api.appliquerReprise(id)
      setConfirmation(false)
      setApplication({ enCours: false, erreur: null })
      fiche.recharger()
      rapport.recharger()
    } catch (cause) {
      setApplication({ enCours: false, erreur: cause })
    }
  }

  const resume = reprise?.resume ?? { a_creer: 0, doublon: 0, rejetee: 0, creee: 0 }
  const appliquee = reprise?.statut === 'appliquee'

  // Aucune colonne n'annonce sa largeur, et c'est délibéré : dès qu'une seule
  // le fait, le tableau se fige et coupe ses cellules. Or le motif est la
  // raison d'être de cet écran — un motif tronqué à « Le code de catégorie
  // CATEGORIE-QUI-NEXIS… » ne dit pas quoi corriger, et l'agent retourne
  // comparer deux listes à la main. Ici, le motif se replie sur plusieurs
  // lignes plutôt que de disparaître.
  const colonnes = useMemo(() => [
    { cle: 'numero_ligne', titre: 'Ligne', nombre: true },
    {
      cle: 'verdict',
      titre: 'Verdict',
      rendu: (l) => (
        <Pastille ton={TON_VERDICT[l.verdict]} texte={LIBELLE_VERDICT[l.verdict] ?? l.verdict} />
      ),
    },
    {
      cle: 'designation',
      titre: 'Désignation lue',
      valeur: (l) => l.donnees?.designation ?? '',
      rendu: (l) => texte(l.donnees?.designation),
    },
    {
      cle: 'colonne',
      titre: 'Colonne en cause',
      rendu: (l) => (l.colonne ? <code>{l.colonne}</code> : <span className="texte-discret">—</span>),
    },
    {
      cle: 'motif',
      titre: 'Motif',
      prose: true,
      rendu: (l) => (l.motif
        ? <span className="texte-appui">{l.motif}</span>
        : <span className="texte-discret">—</span>),
    },
  ], [])

  return (
    <Page
      titre={reprise ? `Reprise ${reprise.numero}` : 'Reprise'}
      sousTitre={reprise
        ? `${texte(reprise.fichier_nom)} — déposé le ${horodatage(reprise.cree_le)}`
        : undefined}
      fil={[
        { libelle: 'SIGL', to: '/' },
        { libelle: 'Reprise', to: '/reprises' },
        { libelle: reprise?.numero ?? '…' },
      ]}
      actions={(
        <>
          <Bouton surClic={() => navigue('/reprises')}>Retour aux reprises</Bouton>
          {appliquee ? (
            <Pastille ton="succes" texte={`Appliquée le ${horodatage(reprise.applique_le)}`} />
          ) : (
            <Bouton
              allure="principale"
              icone={Play}
              surClic={() => setConfirmation(true)}
              desactive={!peutAppliquer || resume.a_creer === 0}
              titre={resume.a_creer === 0
                ? "Aucune ligne n'est à créer : corrigez le fichier et redéposez-le"
                : undefined}
            >
              {`Appliquer (${nombre(resume.a_creer)})`}
            </Bouton>
          )}
        </>
      )}
    >
      <Etat
        chargement={fiche.chargement}
        erreur={fiche.erreur}
        recharger={fiche.recharger}
        texteChargement="Lecture de la reprise et de son rapport…"
        vide={!reprise && !fiche.chargement && !fiche.erreur}
        titreVide="Cette reprise n'est pas lisible"
        texteVide="Le serveur n'a rendu aucune reprise pour cette adresse : elle n'existe pas, ou elle relève d'une autre structure — RG-017."
      >
        <RangeeChiffres>
          <Chiffre
            valeur={reprise?.lignes_total ?? 0}
            libelle="Lignes du fichier"
            appui="En-tête non comprise"
            vers={`/reprises/${id}`}
          />
          {VERDICTS.map((v) => (
            <Chiffre
              key={v.valeur}
              valeur={resume[v.valeur] ?? 0}
              libelle={v.libelle}
              ton={v.ton}
              appui={verdict === v.valeur ? 'Filtre posé' : 'Voir ces lignes'}
              vers={`/reprises/${id}?verdict=${v.valeur}`}
            />
          ))}
        </RangeeChiffres>

        {!appliquee && resume.a_creer > 0 ? (
          <p className="texte-appui">
            <CircleAlert size={15} aria-hidden="true" />
            {' '}
            Le dépôt a analysé le fichier. <strong>Aucun bien n&apos;a encore été créé.</strong>
            {' '}
            Lisez les lignes refusées, corrigez le fichier et redéposez-le, ou appliquez cette
            reprise telle quelle : elle créera {nombre(resume.a_creer)} biens.
          </p>
        ) : null}

        <Bento>
          <Bloc
            large={12}
            titre="Le rapport, ligne par ligne"
            note={verdict
              ? `${nombre(total)} ligne(s) — filtre : ${LIBELLE_VERDICT[verdict] ?? verdict}`
              : `${nombre(total)} ligne(s)`}
            actions={verdict ? (
              <span className="bento-note">
                {`${nombre(total)} ligne(s) — filtre : ${LIBELLE_VERDICT[verdict] ?? verdict}`}
                {' '}
                <Bouton taille="petite" surClic={() => filtrer('')}>Voir toutes les lignes</Bouton>
              </span>
            ) : null}
          >
            <Etat
              chargement={rapport.chargement}
              erreur={rapport.erreur}
              recharger={rapport.recharger}
              texteChargement="Lecture du rapport…"
              vide={lignes.length === 0}
              titreVide="Aucune ligne pour ce filtre"
              texteVide="Aucune ligne du fichier ne porte ce verdict."
              actionVide={verdict
                ? <Bouton surClic={() => filtrer('')}>Voir toutes les lignes</Bouton>
                : null}
            >
              <Tableau
                colonnes={colonnes}
                lignes={lignes}
                cleDeLigne={(l) => l.numero_ligne}
                nomDesLignes="ligne"
                nomDesLignesPluriel="lignes"
                triInitial={{ cle: 'numero_ligne', sens: 'asc' }}
              />
            </Etat>
          </Bloc>
        </Bento>
      </Etat>

      <Dialogue
        ouvert={confirmation}
        titre={`Appliquer la reprise ${reprise?.numero ?? ''}`}
        surFermeture={() => setConfirmation(false)}
        pied={(
          <>
            <Bouton surClic={() => setConfirmation(false)}>Annuler</Bouton>
            <Bouton
              allure="principale"
              icone={Check}
              surClic={appliquer}
              desactive={application.enCours}
            >
              {application.enCours ? 'Application…' : `Créer ${nombre(resume.a_creer)} biens`}
            </Bouton>
          </>
        )}
      >
        <p className="texte-appui">
          {nombre(resume.a_creer)} biens vont être inscrits au registre de votre structure. Les
          immatriculations portées par le fichier sont conservées telles quelles ; le SIGL n&apos;en
          génère que pour les biens qui n&apos;en avaient pas.
        </p>
        <p className="texte-appui">
          <Copy size={15} aria-hidden="true" />
          {' '}
          Une reprise ne s&apos;applique qu&apos;une fois (RG-036) : une seconde application
          doublerait le patrimoine, et rien ne distinguerait plus le doublon de l&apos;original.
        </p>
        {application.erreur ? (
          <Erreur erreur={application.erreur} titre="L’application a été refusée" />
        ) : null}
      </Dialogue>
    </Page>
  )
}
