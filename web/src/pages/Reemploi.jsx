import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HandHeart, PackageOpen, RefreshCw } from 'lucide-react'
import Page from '../components/Page.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import Pagination from '../components/Pagination.jsx'
import Bouton from '../components/Bouton.jsx'
import Champ from '../components/Champ.jsx'
import Definitions from '../components/Definitions.jsx'
import Dialogue from '../components/Dialogue.jsx'
import Tiroir from '../components/Tiroir.jsx'
import Vide, { Chargement, Erreur, Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { depouillerListe, useRequete } from '../lib/requete.js'
import { useRoles } from '../lib/agent.jsx'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { date, dateEnClair, horodatage, libelle, nombre, texte } from '../lib/format.js'
import {
  ACTEURS,
  ROLES_DE_DEMANDE,
  estDeposee,
  motifDuVerdict,
  offrePubliee,
  tonDuStatutOffre,
  verdictDe,
} from '../lib/reforme.js'

/*
  Le catalogue des biens offerts au réemploi — GET /api/offres-reemploi
  ?ouvertes=&structure_origine=&q=&page=&parPage=

  C'est le seul objet économique du lot : sans cette entrée, du matériel encore
  utilisable serait réformé d'un côté et racheté de l'autre. L'offre est donc
  une PUBLICATION, lisible de toute session positionnée, seule table du SIGL
  dans ce cas — et elle porte sa propre copie de ce qu'elle publie :
  `bien_designation`, `bien_immatriculation`, `bien_categorie_code`,
  `bien_etat`, `structure_origine_code`, `structure_origine_nom`,
  `site_origine_nom`, `cloture_prevue_le`.

  On lit ces champs SUR L'OFFRE. Aller chercher le bien serait aller chercher
  une table cloisonnée : elle rendrait null hors périmètre, et l'offre serait
  vidée de son contenu par une politique de sécurité pourtant correcte.

  Le réemploi ne circule qu'entre structures de régime intégré : faire entrer
  un bien de la Primature dans le patrimoine d'un établissement autonome n'est
  pas un réemploi mais une cession, que le SIGL ne prononce jamais — RG-016,
  RG-018. Le serveur refuse, et dit pourquoi.
*/

const PAR_PAGE = 25

const OUVERTURE = [
  { valeur: 'ouvertes', libelle: 'Offres ouvertes' },
  { valeur: 'toutes', libelle: 'Ouvertes et closes' },
]

export default function Reemploi() {
  const [params, setParams] = useSearchParams()
  const { aLeRole } = useRoles()

  const q = params.get('q') ?? ''
  const origine = params.get('origine') ?? ''
  // Par défaut, le catalogue montre ce qui est encore prenable.
  const ouverture = params.get('ouverture') ?? 'ouvertes'
  const page = Number(params.get('page') ?? '1') || 1

  function poser(cle, valeur, remetAPage = true) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, String(valeur))
    else prochain.delete(cle)
    if (remetAPage && cle !== 'page') prochain.delete('page')
    setParams(prochain, { replace: true })
  }

  const liste = useRequete(
    (o) =>
      api.offresReemploi(
        {
          q,
          structure_origine: origine,
          ...(ouverture === 'ouvertes' ? { ouvertes: 'true' } : {}),
          page,
          parPage: PAR_PAGE,
        },
        o,
      ),
    [q, origine, ouverture, page],
  )
  const structures = useRequete((o) => api.structures(null, o), [])

  const [demande, setDemande] = useState(null)
  const [offreOuverte, setOffreOuverte] = useState(null)

  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant(['reemploi', 'reforme'], liste.recharger, marquer)

  const depouille = depouillerListe(liste.donnees)
  const lignes = depouille.lignes
  const listeStructures = depouillerListe(structures.donnees).lignes
  const sansListe = liste.chargement || Boolean(liste.erreur)

  const peutDemander = aLeRole(...ROLES_DE_DEMANDE)
  const raisonDemande = peutDemander
    ? null
    : `Demander un réemploi revient au chef de structure, au magasinier ou au comptable des matières de la structure demandeuse. ${ACTEURS.demande}.`

  const colonnes = [
    {
      cle: 'bien_designation',
      titre: 'Bien offert',
      largeur: '24%',
      rendu: (offre) => {
        const p = offrePubliee(offre)
        return (
          <span className="cellule-deux-lignes">
            <span>{texte(p.designation)}</span>
            <span className="texte-note mono">{texte(p.immatriculation)}</span>
          </span>
        )
      },
    },
    {
      cle: 'bien_categorie_code',
      titre: 'Catégorie',
      largeur: '10%',
      rendu: (offre) => <span className="cellule-faible">{texte(offre.bien_categorie_code)}</span>,
    },
    {
      cle: 'bien_etat',
      titre: 'État',
      largeur: '11%',
      rendu: (offre) =>
        offre.bien_etat ? (
          <Pastille valeur={offre.bien_etat} />
        ) : (
          <span className="texte-note">—</span>
        ),
    },
    {
      cle: 'structure_origine_nom',
      titre: 'Structure d’origine',
      largeur: '18%',
      rendu: (offre) => (
        <span className="cellule-deux-lignes">
          <span>{texte(offre.structure_origine_nom ?? offre.structure_origine_code)}</span>
          <span className="texte-note">{texte(offre.site_origine_nom)}</span>
        </span>
      ),
    },
    {
      cle: 'cloture_prevue_le',
      titre: 'Clôture prévue',
      largeur: '13%',
      nombre: true,
      valeur: (offre) => offre.cloture_prevue_le ?? '',
      rendu: (offre) => date(offre.cloture_prevue_le),
    },
    {
      cle: 'statut',
      titre: 'Offre',
      largeur: '10%',
      rendu: (offre) => <Pastille valeur={offre.statut} ton={tonDuStatutOffre(offre.statut)} />,
    },
    {
      cle: 'actions',
      titre: '',
      largeur: '14%',
      triable: false,
      rendu: (offre) => {
        if (offre.statut !== 'ouverte') return <span className="texte-note">Offre close</span>
        /*
          Ce que ma structure a déjà fait sur cette offre passe avant
          l’invitation à la demander. Le serveur le dit dans
          `ma_demande_statut` et `est_la_mienne` ; sans les lire, l’écran
          proposait « Demander » à qui avait déjà demandé — un geste que le
          serveur refuse aussitôt après l’avoir offert.
        */
        if (offre.est_la_mienne) {
          return <span className="texte-note" title="Cette offre vient de ma propre structure">Ma structure</span>
        }
        if (offre.ma_demande_statut) {
          return <Pastille valeur={offre.ma_demande_statut} />
        }
        return (
          <Bouton
            taille="petite"
            allure="principale"
            icone={HandHeart}
            desactive={Boolean(raisonDemande)}
            titre={raisonDemande ?? undefined}
            surClic={() => setDemande(offre)}
          >
            Demander
          </Bouton>
        )
      },
    },
  ]

  return (
    <Page
      titre="Biens offerts"
      sousTitre="Les biens dont une structure n'a plus l'usage, offerts aux autres avant toute réforme. Demander un bien ici, c'est éviter de l'acheter ailleurs."
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Biens offerts' }]}
      actions={
        <>
          <Bouton icone={RefreshCw} surClic={liste.recharger}>
            Actualiser
          </Bouton>
          <Bouton icone={PackageOpen} vers="/reforme">
            Dossiers de réforme
          </Bouton>
        </>
      }
    >
      <Filtres total={sansListe ? undefined : depouille.total} nom="bien offert" nomPluriel="biens offerts">
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Désignation, immatriculation, catégorie…"
        />
        <Filtre
          libelle="Offres"
          valeur={ouverture === 'ouvertes' ? '' : 'toutes'}
          surChangement={(v) => poser('ouverture', v === 'toutes' ? 'toutes' : '')}
          options={OUVERTURE.filter((o) => o.valeur === 'toutes')}
          toutes="Offres ouvertes"
        />
        <Filtre
          libelle="Structure d'origine"
          valeur={origine}
          surChangement={(v) => poser('origine', v)}
          // `structure_origine` est l'identifiant de la structure, pas son
          // code : le serveur le déclare en `format: uuid`.
          options={listeStructures.map((s) => ({ valeur: s.id, libelle: `${s.code} — ${s.nom}` }))}
          toutes="Toutes les structures"
        />
      </Filtres>

      <Etat
        chargement={liste.chargement}
        erreur={liste.erreur}
        recharger={liste.recharger}
        texteChargement="Lecture des biens offerts au réemploi…"
      >
        <Tableau
          colonnes={colonnes}
          lignes={lignes}
          nomDesLignes="bien offert"
          nomDesLignesPluriel="biens offerts"
          triInitial={{ cle: 'cloture_prevue_le', sens: 'asc' }}
          surClic={(offre) => setOffreOuverte(offre)}
          ligneMarquee={(offre) => estMarque(offre.id)}
          titreVide="Aucun bien offert"
          texteVide={
            q || origine || ouverture === 'toutes'
              ? 'Aucune offre ne répond à ces critères. Retirez un filtre pour voir le reste.'
              : "Aucune structure n'offre de bien en ce moment. Les offres sont publiées par la logistique centrale au cours d'un dossier de réforme, avant toute saisine des domaines."
          }
          pied={`${nombre(lignes.length)} offre(s) affichée(s)${
            typeof depouille.total === 'number' ? ` sur ${nombre(depouille.total)}` : ''
          } · une ligne s'ouvre pour lire l'offre, le bouton dépose la demande`}
        />

        <Pagination
          page={depouille.page}
          parPage={depouille.parPage}
          total={sansListe ? undefined : depouille.total}
          nom="bien offert"
          nomPluriel="biens offerts"
          surPage={(p) => poser('page', p, false)}
        />

        <p className="marge-dessus-3 texte-note largeur-propos">
          Les offres sont lisibles de toutes les structures, et chacune porte sa
          propre copie de ce qu'elle publie : ce qui a été offert reste ce qui a
          été offert. La demande est déposée par la structure demandeuse et
          tranchée par celle d'origine ; accepter prononce le réemploi en un
          seul geste.
        </p>
      </Etat>

      {demande ? (
        <DialogueDemande
          offre={demande}
          surFermeture={() => setDemande(null)}
          surSucces={() => {
            setDemande(null)
            liste.recharger()
          }}
        />
      ) : null}

      {offreOuverte ? (
        <TiroirOffre
          offre={offreOuverte}
          raisonDemande={raisonDemande}
          surFermeture={() => setOffreOuverte(null)}
          surDemande={() => {
            setDemande(offreOuverte)
            setOffreOuverte(null)
          }}
        />
      ) : null}
    </Page>
  )
}

/* --------------------------------------------------------------------- */
/* La fiche d'une offre — GET /api/offres-reemploi/:id                   */
/* --------------------------------------------------------------------- */

function TiroirOffre({ offre, raisonDemande, surFermeture, surDemande }) {
  const fiche = useRequete((o) => api.offreReemploi(offre.id, o), [offre.id])
  // Le serveur rend l'offre, et ses demandes quand il les sert. En attendant
  // sa réponse, on montre ce que la ligne de liste publiait déjà : l'offre
  // porte sa propre copie, elle est donc complète dès la liste.
  const servie = fiche.donnees?.offre ?? fiche.donnees ?? null
  const p = offrePubliee(servie ?? offre)
  const demandes = Array.isArray(fiche.donnees?.demandes) ? fiche.donnees.demandes : []
  const maDemande = fiche.donnees?.ma_demande ?? null
  const estLaMienne = fiche.donnees?.est_la_mienne === true
  /*
    Le serveur dit d'avance ce qu'il répondrait à une demande, dans
    `demande_possible` : offre close, structure autonome — ce ne serait pas un
    réemploi mais une cession —, demande déjà déposée, ou l'offre est la vôtre.
    Le bouton se grise là-dessus et affiche le motif TEL QUEL. Tant que la
    fiche n'est pas lue, c'est la raison de profil qui parle.
  */
  const verdict = fiche.donnees ? verdictDe(fiche.donnees, 'demande_possible') : null
  const raison = raisonDemande ?? (verdict && !verdict.possible ? motifDuVerdict(verdict) : null)

  return (
    <Tiroir
      ouvert
      surTitre="Bien offert au réemploi"
      titre={texte(p.designation)}
      sousTitre={`${texte(p.structure_origine_code)} — ${texte(p.structure_origine_nom)}`}
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Fermer</Bouton>
          {p.statut === 'ouverte' ? (
            <Bouton
              allure="principale"
              icone={HandHeart}
              desactive={Boolean(raison)}
              titre={raison ?? undefined}
              surClic={surDemande}
            >
              Demander ce bien
            </Bouton>
          ) : null}
        </>
      }
    >
      <Definitions
        entrees={[
          {
            cle: 'Statut de l’offre',
            valeur: <Pastille valeur={p.statut} ton={tonDuStatutOffre(p.statut)} />,
          },
          {
            cle: 'Immatriculation',
            valeur: <span className="mono">{texte(p.immatriculation)}</span>,
          },
          { cle: 'Catégorie', valeur: texte(p.categorie_code) },
          { cle: 'État publié', valeur: p.etat ? <Pastille valeur={p.etat} /> : '—' },
          { cle: 'Structure d’origine', valeur: texte(p.structure_origine_nom) },
          { cle: 'Site d’origine', valeur: texte(p.site_origine_nom) },
          { cle: 'Clôture prévue', valeur: dateEnClair(p.cloture_prevue_le) },
        ]}
      />

      <p className="marge-dessus-3 texte-note largeur-propos">
        Ces valeurs sont celles que l'offre publie, figées à sa publication :
        elles ne sont pas relues sur la fiche du bien, qui reste cloisonnée dans
        sa structure.
      </p>

      {estLaMienne ? (
        <p className="marge-dessus-3 sans-marge largeur-propos texte-faible">
          Cette offre est celle de votre structure : c'est vous qui la clôturez
          et qui tranchez les demandes reçues, depuis le dossier de réforme.
        </p>
      ) : null}

      {maDemande ? (
        <div className="marge-dessus-3 ligne-outils">
          <Pastille valeur={maDemande.statut} />
          <span className="texte-faible">
            Votre structure a déjà demandé ce bien le{' '}
            {horodatage(maDemande.cree_le ?? maDemande.deposee_le)}.
          </span>
        </div>
      ) : null}

      {verdict && !verdict.possible && !estLaMienne ? (
        <p className="marge-dessus-3 sans-marge largeur-propos texte-faible">
          {verdict.motif}
        </p>
      ) : null}

      <h3 className="section-titre separe-dessus">Les demandes reçues</h3>
      <div className="marge-dessus-3">
        {fiche.chargement ? (
          <Chargement texte="Lecture de l'offre et des demandes…" lignes={2} />
        ) : fiche.erreur ? (
          <Erreur
            erreur={fiche.erreur}
            surReessai={fiche.recharger}
            titre="L'offre n'a pas pu être relue"
          />
        ) : demandes.length === 0 ? (
          <Vide
            titre="Aucune demande servie"
            texte="Le serveur n'a rendu aucune demande pour cette offre : soit aucune n'a été déposée, soit les demandes se lisent depuis le dossier de réforme, du côté de la structure d'origine."
          />
        ) : (
          <Tableau
            lignes={demandes}
            nomDesLignes="demande"
            nomDesLignesPluriel="demandes"
            colonnes={[
              {
                cle: 'structure_demandeuse_nom',
                titre: 'Structure demandeuse',
                rendu: (d) => (
                  <span className="cellule-deux-lignes">
                    <span>{texte(d.structure_demandeuse_nom ?? d.structure_demandeuse_code)}</span>
                    <span className="texte-note">{horodatage(d.cree_le ?? d.deposee_le)}</span>
                  </span>
                ),
              },
              { cle: 'statut', titre: 'Statut', rendu: (d) => <Pastille valeur={d.statut} /> },
              {
                cle: 'motif',
                titre: 'Motif',
                triable: false,
                rendu: (d) => (
                  <span className="cellule-faible">
                    {estDeposee(d) ? texte(d.motif) : `${libelle(d.statut)} — ${texte(d.motif_decision ?? d.motif)}`}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>
    </Tiroir>
  )
}

/* --------------------------------------------------------------------- */
/* Demander un bien — POST /api/offres-reemploi/:id/demandes { motif }   */
/* --------------------------------------------------------------------- */

function DialogueDemande({ offre, surFermeture, surSucces }) {
  const [motif, setMotif] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const p = offrePubliee(offre)

  /*
    Avant de laisser déposer, on lit ce que le serveur répondrait :
    `demande_possible`, servi par la fiche de l'offre. Il connaît ce que
    l'écran ne juge pas — le régime de la structure demandeuse, une demande
    déjà déposée, une offre close entre-temps.
  */
  const fiche = useRequete((o) => api.offreReemploi(offre.id, o), [offre.id])
  const verdict = fiche.donnees ? verdictDe(fiche.donnees, 'demande_possible') : null
  const refus = verdict && !verdict.possible ? motifDuVerdict(verdict) : null

  const valide = motif.trim().length >= 5 && !refus

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.demanderReemploi(offre.id, { motif: motif.trim() })
      surSucces()
    } catch (cause) {
      setErreur(cause)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialogue
      ouvert
      titre="Demander ce bien en réemploi"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={HandHeart}
            desactive={!valide || envoi}
            surClic={envoyer}
            titre={valide ? undefined : (refus ?? 'Un motif en clair est attendu.')}
          >
            {envoi ? 'Envoi…' : 'Déposer la demande'}
          </Bouton>
        </>
      }
    >
      <Definitions
        entrees={[
          { cle: 'Bien offert', valeur: texte(p.designation) },
          {
            cle: 'Immatriculation',
            valeur: <span className="mono">{texte(p.immatriculation)}</span>,
          },
          { cle: 'État publié', valeur: p.etat ? <Pastille valeur={p.etat} /> : '—' },
          {
            cle: 'Structure d’origine',
            valeur: `${texte(p.structure_origine_code)} — ${texte(p.structure_origine_nom)}`,
          },
          { cle: 'Site d’origine', valeur: texte(p.site_origine_nom) },
          { cle: 'Clôture prévue', valeur: dateEnClair(p.cloture_prevue_le) },
        ]}
      />

      <p className="marge-dessus-3 texte-faible largeur-propos">
        La demande est déposée au nom de votre structure et tranchée par la
        structure d'origine. Si elle est acceptée, le bien est transféré par un
        mouvement de réemploi, un acte de transfert est émis et le dossier de
        réforme se clôt <strong>sans réforme</strong> : le bien repart en
        service au lieu de sortir du patrimoine.
      </p>

      {refus ? (
        <p className="marge-dessus-3 sans-marge largeur-propos">{refus}</p>
      ) : null}

      <div className="marge-dessus-3">
        <Champ
          libelle="Motif de la demande"
          type="zone"
          lignes={4}
          obligatoire
          valeur={motif}
          surChangement={setMotif}
          aide="À quoi ce bien servira dans votre structure, dit en clair. Conservé et lisible des deux côtés."
        />
      </div>

      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé la demande" />
        </div>
      ) : null}
    </Dialogue>
  )
}
