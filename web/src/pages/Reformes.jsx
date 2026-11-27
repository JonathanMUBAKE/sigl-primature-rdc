import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FileWarning, PackageOpen, Plus, RefreshCw } from 'lucide-react'
import Page from '../components/Page.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import Pagination from '../components/Pagination.jsx'
import Bouton from '../components/Bouton.jsx'
import Champ from '../components/Champ.jsx'
import Dialogue from '../components/Dialogue.jsx'
import { Erreur, Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { depouillerListe, useRequete } from '../lib/requete.js'
import { useRoles } from '../lib/agent.jsx'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { date, libelle, nombre, texte } from '../lib/format.js'
import {
  ACTEURS,
  ROLES_DE_PROPOSITION,
  STATUTS_DOSSIER,
  bienDuDossier,
  motifDeLaProposition,
} from '../lib/reforme.js'

/*
  La liste des dossiers de réforme — GET /api/dossiers-reforme
  ?statut=&structure=&q=&page=&parPage=

  Le décret 13/050 donne la cession et la mise au rebut à l'administration des
  domaines : le SIGL instruit, produit le procès-verbal, saisit les domaines et
  suit la décision. Il ne la prend pas — RG-016.

  Le filtrage, le compte et la pagination sont ceux du SERVEUR : l'écran lui
  passe les critères et affiche `total`, `page` et `parPage` tels qu'il les
  rend. Aucun chiffre n'est recalculé ici, et aucun statut n'est déduit.
*/

const PAR_PAGE = 25

export default function Reformes() {
  const [params, setParams] = useSearchParams()
  const navigue = useNavigate()
  const { aLeRole } = useRoles()

  const q = params.get('q') ?? ''
  const statut = params.get('statut') ?? ''
  const structure = params.get('structure') ?? ''
  const page = Number(params.get('page') ?? '1') || 1

  function poser(cle, valeur, remetAPage = true) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, String(valeur))
    else prochain.delete(cle)
    // Changer un critère remet à la première page : rester en page 4 d'une
    // liste qui vient de se raccourcir montrerait un écran vide sans raison.
    if (remetAPage && cle !== 'page') prochain.delete('page')
    setParams(prochain, { replace: true })
  }

  const liste = useRequete(
    (o) => api.dossiersReforme({ q, statut, structure, page, parPage: PAR_PAGE }, o),
    [q, statut, structure, page],
  )
  const structures = useRequete((o) => api.structures(null, o), [])
  const [creation, setCreation] = useState(false)

  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant(['reforme', 'reemploi'], liste.recharger, marquer)

  const depouille = depouillerListe(liste.donnees)
  const lignes = depouille.lignes
  const listeStructures = depouillerListe(structures.donnees).lignes

  // Sans réponse du serveur, pas de compte : un tiret, jamais un zéro inventé.
  const sansListe = liste.chargement || Boolean(liste.erreur)

  const peutProposer = aLeRole(...ROLES_DE_PROPOSITION)
  const raisonProposition = peutProposer
    ? null
    : `Proposer une réforme revient au détenteur du bien, au magasinier ou au comptable des matières. ${ACTEURS.proposition}.`

  const colonnes = [
    {
      cle: 'numero',
      titre: 'Dossier',
      largeur: '15%',
      rendu: (d) => (
        <span className="cellule-deux-lignes">
          <span className="mono">{texte(d.numero)}</span>
          <span className="texte-note">{date(d.cree_le ?? d.propose_le)}</span>
        </span>
      ),
    },
    {
      cle: 'bien',
      titre: 'Bien concerné',
      largeur: '22%',
      valeur: (d) => bienDuDossier(d).designation ?? '',
      rendu: (d) => {
        const bien = bienDuDossier(d)
        return (
          <span className="cellule-deux-lignes">
            {bien.id ? (
              <Link className="mono" to={`/patrimoine/${bien.id}`}>
                {texte(bien.immatriculation)}
              </Link>
            ) : (
              <span className="mono">{texte(bien.immatriculation)}</span>
            )}
            <span className="texte-note">{texte(bien.designation)}</span>
          </span>
        )
      },
    },
    {
      cle: 'structure',
      titre: 'Structure',
      largeur: '15%',
      valeur: (d) => bienDuDossier(d).structure_nom ?? '',
      rendu: (d) => {
        const bien = bienDuDossier(d)
        return (
          <span className="cellule-deux-lignes">
            <span>{texte(bien.structure_nom ?? bien.structure_code)}</span>
            <span className="texte-note">{texte(bien.structure_code)}</span>
          </span>
        )
      },
    },
    {
      cle: 'statut',
      titre: 'Statut',
      largeur: '18%',
      // La note sous la pastille est un CHIFFRE DU SERVEUR, affiché tel quel :
      // la liste rend `demandes_pendantes`, `avis_rendus` et `membres`. Rien
      // n'est recompté ici.
      rendu: (d) => (
        <span className="cellule-deux-lignes">
          <Pastille valeur={d.statut} />
          <span className="texte-note">{noteDuStatut(d)}</span>
        </span>
      ),
    },
    {
      cle: 'bien_etat',
      titre: 'État du bien',
      largeur: '13%',
      valeur: (d) => bienDuDossier(d).etat ?? '',
      rendu: (d) => {
        const etat = bienDuDossier(d).etat
        return etat ? <Pastille valeur={etat} /> : <span className="texte-note">—</span>
      },
    },
    {
      cle: 'motif',
      titre: 'Motif de la proposition',
      largeur: '17%',
      triable: false,
      rendu: (d) => (
        <span className="cellule-faible">{texte(motifDeLaProposition(d))}</span>
      ),
    },
  ]

  return (
    <Page
      titre="Réformes"
      sousTitre="Le circuit d'un bien qui sort du service : proposition, avis de la commission, offre de réemploi, puis saisine des domaines. Le SIGL instruit et produit le PV ; il ne prononce ni la cession ni la mise au rebut — RG-016."
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Réformes' }]}
      actions={
        <>
          <Bouton icone={RefreshCw} surClic={liste.recharger}>
            Actualiser
          </Bouton>
          <Bouton icone={PackageOpen} vers="/reemploi">
            Biens offerts
          </Bouton>
          <Bouton
            allure="principale"
            icone={Plus}
            desactive={Boolean(raisonProposition)}
            titre={raisonProposition ?? undefined}
            surClic={() => setCreation(true)}
          >
            Proposer une réforme
          </Bouton>
        </>
      }
    >
      <Filtres
        total={sansListe ? undefined : depouille.total}
        nom="dossier"
        nomPluriel="dossiers"
      >
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Numéro, immatriculation, désignation, motif…"
        />
        <Filtre
          libelle="Statut"
          valeur={statut}
          surChangement={(v) => poser('statut', v)}
          options={STATUTS_DOSSIER}
          toutes="Tous les statuts"
        />
        <Filtre
          libelle="Structure"
          valeur={structure}
          surChangement={(v) => poser('structure', v)}
          options={listeStructures.map((s) => ({ valeur: s.id, libelle: `${s.code} — ${s.nom}` }))}
          toutes="Toutes les structures"
        />
      </Filtres>

      <Etat
        chargement={liste.chargement}
        erreur={liste.erreur}
        recharger={liste.recharger}
        texteChargement="Lecture des dossiers de réforme…"
      >
        <Tableau
          colonnes={colonnes}
          lignes={lignes}
          nomDesLignes="dossier"
          nomDesLignesPluriel="dossiers"
          triInitial={{ cle: 'numero', sens: 'desc' }}
          surClic={(d) => navigue(`/reforme/${d.id}`)}
          ligneMarquee={(d) => estMarque(d.id)}
          titreVide="Aucun dossier de réforme"
          texteVide={
            q || statut || structure
              ? 'Aucun dossier ne répond à ces critères. Retirez un filtre pour voir le reste.'
              : "Aucun dossier de réforme n'existe pour votre périmètre de lecture — RG-017. Un bien ne sort du service que par ce circuit : le mouvement direct de réforme est fermé par RG-033."
          }
          actionVide={
            peutProposer ? (
              <Bouton allure="principale" icone={Plus} surClic={() => setCreation(true)}>
                Proposer une réforme
              </Bouton>
            ) : (
              <span className="texte-note">{raisonProposition}</span>
            )
          }
          pied={`${nombre(lignes.length)} dossier(s) affiché(s)${
            typeof depouille.total === 'number' ? ` sur ${nombre(depouille.total)}` : ''
          } · chaque ligne mène au dossier`}
        />

        <Pagination
          page={depouille.page}
          parPage={depouille.parPage}
          total={sansListe ? undefined : depouille.total}
          nom="dossier"
          nomPluriel="dossiers"
          surPage={(p) => poser('page', p, false)}
        />

        <p className="marge-dessus-3 texte-note largeur-propos">
          L'avancement du circuit, et ce que chaque règle répondrait à une
          action, sont dits par le serveur dans le dossier lui-même : cet écran
          ne les refait pas. Les dossiers listés sont ceux que le serveur vous
          sert — une structure ne lit que ses propres données, RG-017 — tandis
          que les biens offerts au réemploi, eux, sont lisibles de tous.
        </p>
      </Etat>

      {creation ? (
        <DialogueProposition
          surFermeture={() => setCreation(false)}
          surSucces={(dossier) => {
            setCreation(false)
            liste.recharger()
            if (dossier?.id) navigue(`/reforme/${dossier.id}`)
          }}
        />
      ) : null}
    </Page>
  )
}

/*
  Ce que la ligne dit sous son statut : les comptes que le serveur sert avec
  elle. Une demande non tranchée passe devant, parce que c'est elle qui attend
  un humain.
*/
function noteDuStatut(d) {
  if (typeof d.demandes_pendantes === 'number' && d.demandes_pendantes > 0) {
    return `${nombre(d.demandes_pendantes)} demande(s) à trancher`
  }
  if (typeof d.membres === 'number' && d.membres === 0) {
    return 'Commission à désigner'
  }
  if (typeof d.avis_rendus === 'number' && typeof d.membres === 'number') {
    return `${nombre(d.avis_rendus)} avis sur ${nombre(d.membres)} membre(s)`
  }
  return ''
}

/* --------------------------------------------------------------------- */
/* Proposer une réforme — POST /api/dossiers-reforme { bien_id, motif }  */
/* --------------------------------------------------------------------- */

function DialogueProposition({ surFermeture, surSucces }) {
  const [recherche, setRecherche] = useState('')
  const [bienId, setBienId] = useState('')
  const [motif, setMotif] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const biens = useRequete((o) => api.biens({ q: recherche, parPage: 100 }, o), [recherche])
  const lignesBiens = depouillerListe(biens.donnees).lignes
  const bien = lignesBiens.find((b) => String(b.id) === String(bienId)) ?? null

  const valide = bienId !== '' && motif.trim().length >= 5

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      const reponse = await api.proposerReforme({ bien_id: bienId, motif: motif.trim() })
      surSucces(reponse?.dossier ?? reponse)
    } catch (cause) {
      setErreur(cause)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialogue
      ouvert
      titre="Proposer la réforme d'un bien"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={FileWarning}
            desactive={!valide || envoi}
            surClic={envoyer}
            titre={valide ? undefined : 'Un bien et un motif en clair sont attendus.'}
          >
            {envoi ? 'Envoi…' : 'Proposer la réforme'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        La proposition ouvre un dossier au statut « proposé ». Elle ne réforme
        rien : la commission donne ensuite son avis, le bien est offert aux
        autres structures, et les domaines ne sont saisis qu'à défaut de
        preneur. Qui propose ne siège pas à la commission qui examine —
        RG-030 — et le mouvement direct de réforme est fermé, RG-033.
      </p>

      <div className="marge-dessus-3 ligne-outils">
        <Recherche
          valeur={recherche}
          surChangement={setRecherche}
          placeholder="Immatriculation, désignation, marque, n° de série…"
        />
        <span className="texte-note">
          {biens.chargement
            ? 'Lecture des biens de votre périmètre…'
            : `${nombre(lignesBiens.length)} bien(s) servis`}
        </span>
      </div>

      {biens.erreur ? (
        <div className="marge-dessus-3">
          <Erreur
            erreur={biens.erreur}
            surReessai={biens.recharger}
            titre="Les biens n'ont pas pu être lus"
          />
        </div>
      ) : null}

      <div className="marge-dessus-3 pile">
        <Champ
          libelle="Bien à réformer"
          type="choix"
          obligatoire
          valeur={bienId}
          surChangement={setBienId}
          options={lignesBiens.map((b) => ({
            valeur: b.id,
            libelle: `${texte(b.immatriculation)} — ${texte(b.designation)} (${libelle(b.etat)})`,
          }))}
          aide={
            bien
              ? `La fiche porte l'état « ${libelle(bien.etat)} », structure ${texte(
                  bien.structure_code ?? bien.structure_nom,
                )}.`
              : 'Le serveur refuse un bien hors de votre périmètre, et un bien déjà sous offre ouverte — RG-029.'
          }
        />
        <Champ
          libelle="Motif de la proposition"
          type="zone"
          lignes={4}
          obligatoire
          valeur={motif}
          surChangement={setMotif}
          aide="Pourquoi ce bien n'est plus utilisable, dit en clair. Conservé au dossier et lisible par le contrôle externe."
        />
      </div>

      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé la proposition" />
        </div>
      ) : null}
    </Dialogue>
  )
}
