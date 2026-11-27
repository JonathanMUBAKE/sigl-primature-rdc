import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Banknote, FileSignature, Plus, RefreshCw, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import Page from '../components/Page.jsx'
import Bento, { Bloc } from '../components/Bento.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import Bouton from '../components/Bouton.jsx'
import Champ from '../components/Champ.jsx'
import Chiffre, { RangeeChiffres } from '../components/Chiffre.jsx'
import Definitions from '../components/Definitions.jsx'
import Dialogue from '../components/Dialogue.jsx'
import Tiroir from '../components/Tiroir.jsx'
import { Chargement, Erreur, Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { useAgent, useRoles } from '../lib/agent.jsx'
import { useFlux, useMarquage } from '../lib/flux.js'
import { date, horodatage, jours, libelle, montant, montantCourt, nombre, texte } from '../lib/format.js'
import { delaiDuFournisseur, nomDuFournisseur } from '../lib/achats.js'

/*
  Les réceptions — le cœur du système, celui qui mène au paiement.

  La chaîne du décret 13/050, article 137, n'est pas contournable :
    bon de commande → PV de réception signé → prise en charge à l'inventaire
    → certificat de prise en charge → paiement possible.
  RG-010 interdit le certificat sans PV. RG-011 interdit le paiement sans
  certificat. Les deux sont tenues par le serveur ; l'écran les explique.

  Ce que le serveur rend, relevé sur l'API :
  — `GET /api/receptions` rend les **PV de réception**, pas les bons qui
    attendent la leur. Chaque PV porte `objet_id` (l'identifiant du bon),
    `signataire_nom`, `signe_le` et un `pris_en_charge` booléen ;
  — les certificats se lisent par `GET /api/documents?type=certificat_prise_en_charge` ;
  — la chaîne se reconstitue donc **autour du bon de commande**, et c'est lui
    qui est la ligne de cet écran.

  Les actions sont grisées avec leur raison quand le rôle courant ne les
  permet pas. Jamais cachées : un agent doit voir ce qu'il ne peut pas faire,
  et qui doit le faire.
*/

const ETAPES = [
  { valeur: 'reception', libelle: 'Attend sa réception', court: 'Réception à faire' },
  { valeur: 'prise_en_charge', libelle: 'Attend la prise en charge', court: 'Prise en charge' },
  { valeur: 'paiement', libelle: 'Attend le marquage du paiement', court: 'Marquage paiement' },
  { valeur: 'complete', libelle: 'Chaîne complète', court: 'Complète' },
]

const ACTEURS = {
  bon: 'Ordonnateur, chargé de logistique ou intendant',
  pv: 'Commission de réception — magasinier, comptable des matières, intendant ou chargé de logistique',
  certificat: 'Comptable des matières',
  paiement: 'Comptable public',
}

const TON_ETAPE = {
  reception: 'attente',
  prise_en_charge: 'attente',
  paiement: 'attente',
  complete: 'succes',
}

/** La chaîne d'un bon de commande, étape par étape, avec ce qui manque. */
function construireChaine(bon, pv, certificat) {
  const paye = ['payable', 'paye'].includes(bon.statut)
  const etapes = [
    {
      cle: 'bon',
      nom: 'Bon de commande émis',
      faite: true,
      note: `${texte(bon.numero)} · ${montantCourt(bon.montant)}`,
      acteur: ACTEURS.bon,
      regle: 'RG-009 — jamais vers un fournisseur en liste noire',
    },
    {
      cle: 'pv',
      nom: 'Procès-verbal de réception signé',
      faite: Boolean(pv),
      note: pv ? `${texte(pv.numero)} · ${texte(pv.signataire_nom)}` : null,
      manque:
        "Aucun procès-verbal : la commission doit contrôler la livraison ligne par ligne, relever les écarts, puis signer.",
      acteur: ACTEURS.pv,
      regle: 'Qui a émis le bon de commande ne signe pas ce procès-verbal',
    },
    {
      cle: 'certificat',
      nom: "Certificat de prise en charge à l'inventaire",
      faite: Boolean(certificat),
      note: certificat ? `${texte(certificat.numero)} · ${texte(certificat.signataire_nom)}` : null,
      manque: pv
        ? "Le procès-verbal est signé : le comptable des matières doit prendre les biens en charge à l'inventaire."
        : "Sans procès-verbal de réception, le certificat ne peut pas être émis — RG-010.",
      acteur: ACTEURS.certificat,
      regle: 'RG-010 — le certificat ne s’émet qu’après le PV · qui réceptionne ne certifie pas',
    },
    {
      cle: 'paiement',
      nom: 'Paiement possible',
      faite: paye,
      note: paye ? libelle(bon.statut) : null,
      manque: certificat
        ? 'Le certificat est émis : le comptable public peut marquer le paiement possible.'
        : "Aucun paiement n'est marqué possible sans certificat de prise en charge — décret 13/050, art. 137, RG-011.",
      acteur: ACTEURS.paiement,
      regle: 'RG-011 — qui engage ne paie pas',
    },
  ]
  const index = etapes.findIndex((e) => !e.faite)
  const etape = index === -1 ? 'complete' : etapes[index].cle === 'pv' ? 'reception' : etapes[index].cle === 'certificat' ? 'prise_en_charge' : 'paiement'
  return {
    etapes,
    rangCourant: index === -1 ? etapes.length : index,
    etape,
    manque: index === -1 ? null : etapes[index].manque,
    acteur: index === -1 ? null : etapes[index].acteur,
  }
}

export default function Receptions() {
  const [params, setParams] = useSearchParams()
  const navigue = useNavigate()
  const { id: bonOuvert } = useParams()

  const q = params.get('q') ?? ''
  const etape = params.get('etape') ?? ''

  function poser(cle, valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, valeur)
    else prochain.delete(cle)
    setParams(prochain, { replace: true })
  }

  const bons = useRequete((o) => api.bonsCommande({ parPage: 200 }, o), [])
  const pvs = useRequete((o) => api.receptions({ parPage: 200 }, o), [])
  const certificats = useRequete(
    (o) =>
      api.documents(
        { type: 'certificat_prise_en_charge', objet_type: 'bon_commande', parPage: 200 },
        o,
      ),
    [],
  )

  const recharger = () => {
    bons.recharger()
    pvs.recharger()
    certificats.recharger()
  }

  const { marquer, estMarque } = useMarquage()
  useFlux(['achats', 'documents', 'stocks'], (evenement) => {
    if (evenement.id) marquer(evenement.id)
    recharger()
  })

  const chargement = bons.chargement || pvs.chargement || certificats.chargement
  const erreur = bons.erreur ?? pvs.erreur ?? certificats.erreur

  const parBon = useMemo(() => {
    const lignesBons = depouillerListe(bons.donnees).lignes
    const lignesPv = depouillerListe(pvs.donnees).lignes
    const lignesCertificats = depouillerListe(certificats.donnees).lignes

    const pvParBon = new Map()
    for (const pv of lignesPv) {
      const cle = String(pv.objet_id)
      const existant = pvParBon.get(cle)
      // Le plus récent fait foi ; un PV figé ne se refait pas, il se rectifie.
      if (!existant || new Date(pv.cree_le) > new Date(existant.cree_le)) pvParBon.set(cle, pv)
    }
    const certificatParBon = new Map()
    for (const c of lignesCertificats) {
      const cle = String(c.objet_id)
      const existant = certificatParBon.get(cle)
      if (!existant || new Date(c.cree_le) > new Date(existant.cree_le)) certificatParBon.set(cle, c)
    }

    return lignesBons.map((bon) => {
      const pv = pvParBon.get(String(bon.id)) ?? null
      const certificat = certificatParBon.get(String(bon.id)) ?? null
      return { ...bon, pv, certificat, chaine: construireChaine(bon, pv, certificat) }
    })
  }, [bons.donnees, pvs.donnees, certificats.donnees])

  const filtrees = useMemo(() => {
    const motif = q.trim().toLocaleLowerCase('fr')
    return parBon.filter((b) => {
      if (etape && b.chaine.etape !== etape) return false
      if (!motif) return true
      return [b.numero, b.dossier_numero, b.fournisseur_nom, b.objet, b.pv?.numero, b.certificat?.numero]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase('fr').includes(motif))
    })
  }, [parBon, q, etape])

  const resume = useMemo(
    () => ({
      total: parBon.length,
      reception: parBon.filter((b) => b.chaine.etape === 'reception').length,
      prise_en_charge: parBon.filter((b) => b.chaine.etape === 'prise_en_charge').length,
      paiement: parBon.filter((b) => b.chaine.etape === 'paiement').length,
      complete: parBon.filter((b) => b.chaine.etape === 'complete').length,
      bloque: parBon
        .filter((b) => b.chaine.etape !== 'complete')
        .reduce((t, b) => t + Number(b.montant ?? 0), 0),
    }),
    [parBon],
  )

  const choisi = parBon.find((b) => b.id === bonOuvert) ?? null

  const colonnes = useMemo(
    () => [
      {
        cle: 'numero',
        titre: 'Bon de commande',
        largeur: '14%',
        rendu: (b) => (
          <span className="cellule-deux-lignes">
            <span className="mono">{texte(b.numero)}</span>
            <span className="texte-note mono">{texte(b.dossier_numero)}</span>
          </span>
        ),
      },
      {
        cle: 'fournisseur_nom',
        titre: 'Fournisseur',
        largeur: '19%',
        valeur: (b) => nomDuFournisseur(b) ?? '',
        rendu: (b) => {
          const delai = delaiDuFournisseur(b)
          return (
            <span className="cellule-deux-lignes">
              <span>{texte(nomDuFournisseur(b))}</span>
              <span className="texte-note">
                {delai.jours === null ? delai.note : `${delai.note} : ${jours(delai.jours)}`}
              </span>
            </span>
          )
        },
      },
      {
        cle: 'montant',
        titre: 'Montant',
        nombre: true,
        largeur: '11%',
        valeur: (b) => Number(b.montant ?? 0),
        rendu: (b) => montantCourt(b.montant),
      },
      {
        cle: 'etape',
        titre: 'Où en est la chaîne',
        largeur: '14%',
        valeur: (b) => b.chaine.rangCourant,
        rendu: (b) => (
          <Pastille
            valeur={b.chaine.etape}
            ton={TON_ETAPE[b.chaine.etape]}
            texte={ETAPES.find((e) => e.valeur === b.chaine.etape)?.court ?? b.chaine.etape}
            titre={ETAPES.find((e) => e.valeur === b.chaine.etape)?.libelle}
          />
        ),
      },
      {
        cle: 'manque',
        titre: 'Ce qui manque, et qui doit agir',
        largeur: '34%',
        triable: false,
        rendu: (b) =>
          b.chaine.manque ? (
            <span className="cellule-deux-lignes">
              <span>{b.chaine.manque}</span>
              <span className="texte-note">{b.chaine.acteur}</span>
            </span>
          ) : (
            <span className="cellule-deux-lignes">
              <span>Rien : le paiement est possible.</span>
              <span className="texte-note">
                {texte(b.pv?.numero)} · {texte(b.certificat?.numero)}
              </span>
            </span>
          ),
      },
      {
        cle: 'statut',
        titre: 'Bon',
        largeur: '8%',
        rendu: (b) => <Pastille valeur={b.statut} />,
      },
    ],
    [],
  )

  return (
    <Page
      titre="Réceptions"
      sousTitre="Du bon de commande au paiement possible : le procès-verbal, puis la prise en charge à l'inventaire — décret 13/050, art. 137"
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Réceptions' }]}
      actions={
        <Bouton icone={RefreshCw} surClic={recharger}>
          Actualiser
        </Bouton>
      }
    >
      <Bento>
        <Bloc
          large={12}
          titre="La chaîne, bon de commande par bon de commande"
          note="Chaque étape conditionne la suivante : rien ne se saute"
        >
          <RangeeChiffres>
            <Chiffre valeur={resume.total} libelle="Bons de commande" vers="/receptions" />
            <Chiffre
              valeur={resume.reception}
              libelle="Attendent leur réception"
              vers="/receptions?etape=reception"
              ton="attente"
            />
            <Chiffre
              valeur={resume.prise_en_charge}
              libelle="Attendent la prise en charge"
              vers="/receptions?etape=prise_en_charge"
              ton="attente"
            />
            <Chiffre
              valeur={resume.paiement}
              libelle="Attendent le marquage du paiement"
              vers="/receptions?etape=paiement"
              ton="attente"
            />
            <Chiffre
              valeur={resume.complete}
              libelle="Chaîne complète"
              vers="/receptions?etape=complete"
              ton="succes"
            />
            <Chiffre brut valeur={montantCourt(resume.bloque)} libelle="Engagé, pas encore payable" />
          </RangeeChiffres>
        </Bloc>
      </Bento>

      <Filtres
        total={erreur || chargement ? undefined : filtrees.length}
        nom="bon de commande"
        nomPluriel="bons de commande"
        note={
          resume.paiement > 0
            ? `${nombre(resume.paiement)} bon(s) n'attendent plus que le comptable public`
            : undefined
        }
      >
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Bon, dossier, fournisseur, PV, certificat…"
        />
        <Filtre
          libelle="Étape"
          valeur={etape}
          surChangement={(v) => poser('etape', v)}
          options={ETAPES}
          toutes="Toutes les étapes"
        />
      </Filtres>

      <Etat
        chargement={chargement}
        erreur={erreur}
        recharger={recharger}
        texteChargement="Reconstitution de la chaîne : bons de commande, procès-verbaux, certificats…"
      >
        <Tableau
          colonnes={colonnes}
          lignes={filtrees}
          nomDesLignes="bon de commande"
          nomDesLignesPluriel="bons de commande"
          triInitial={{ cle: 'etape', sens: 'asc' }}
          surClic={(b) => navigue(`/receptions/${b.id}${window.location.search}`)}
          ligneChoisie={(b) => b.id === bonOuvert}
          ligneSignalee={(b) => b.statut === 'livre_partiel'}
          ligneMarquee={(b) => estMarque(b.id) || estMarque(b.pv?.id) || estMarque(b.certificat?.id)}
          titreVide="Aucun bon de commande"
          texteVide={
            q || etape
              ? "Aucun bon de commande n'est à cette étape. Retirez un filtre pour voir le reste de la chaîne."
              : "Aucun bon de commande n'existe pour votre périmètre : il n'y a donc rien à réceptionner. Un bon naît d'un dossier d'achat attribué."
          }
          pied={`${nombre(filtrees.length)} bon(s) affiché(s) sur ${nombre(resume.total)} · les lignes signalées ont été livrées en partie`}
        />
      </Etat>

      {bonOuvert ? (
        choisi ? (
          <FicheChaine
            bon={choisi}
            surFermeture={() => navigue(`/receptions${window.location.search}`)}
            recharger={recharger}
          />
        ) : chargement ? null : (
          <Tiroir
            ouvert
            surFermeture={() => navigue(`/receptions${window.location.search}`)}
            surTitre="Bon de commande"
            titre="Introuvable"
          >
            <Erreur
              erreur={{
                code: 'non_trouve',
                message:
                  "Ce bon de commande n'est pas dans la liste servie pour votre périmètre : il n'existe pas, ou il relève d'une autre structure — RG-017.",
              }}
              titre="La chaîne n'a pas pu être ouverte"
            />
          </Tiroir>
        )
      ) : null}
    </Page>
  )
}

/* --------------------------------------------------------------------- */
/* La chaîne d'un bon de commande, en tiroir latéral                     */
/* --------------------------------------------------------------------- */

function FicheChaine({ bon, surFermeture, recharger }) {
  const { agent } = useAgent()
  const { aLeRole } = useRoles()
  const { pv, certificat, chaine } = bon

  // Le dossier, l'état de besoin regroupé — pour les quantités commandées —
  // et le document du bon de commande, pour savoir qui l'a émis : celui-là ne
  // signe pas le procès-verbal de réception.
  const source = useRequete(
    async (o) => {
      const dossier = await api.dossierAchat(bon.dossier_id, o)
      let besoin = null
      if (dossier?.etat_besoin_id) {
        try {
          besoin = await api.besoin(dossier.etat_besoin_id, o)
        } catch {
          besoin = null // hors périmètre de lecture : on le dira
        }
      }
      let emetteur = null
      try {
        const documents = await api.documents(
          { type: 'bon_commande', objet_type: 'bon_commande', objet_id: String(bon.id) },
          o,
        )
        emetteur = depouillerListe(documents).lignes[0] ?? null
      } catch {
        emetteur = null
      }
      return { dossier, besoin, emetteur }
    },
    [bon.id, bon.dossier_id],
  )

  const [action, setAction] = useState(null)

  const estEmetteur =
    agent?.id && source.donnees?.emetteur?.signataire_id &&
    String(source.donnees.emetteur.signataire_id) === String(agent.id)
  const aSigneLePv = agent?.id && pv?.signataire_nom && agent.nom === pv.signataire_nom

  const raisonReception = !aLeRole('magasinier', 'comptable_matieres', 'intendant', 'logistique')
    ? `Votre profil ne réceptionne pas. ${ACTEURS.pv}.`
    : pv
      ? `Le procès-verbal ${texte(pv.numero)} est déjà signé et figé : on ne le refait pas, on émet un document rectificatif — RG-019.`
      : estEmetteur
        ? "Vous avez émis ce bon de commande : celui qui engage ne signe pas le procès-verbal de sa propre commande."
        : bon.statut === 'annule'
          ? "Ce bon de commande est annulé : il n'y a rien à réceptionner."
          : null

  const raisonPriseEnCharge = !aLeRole('comptable_matieres')
    ? `Votre profil ne prend pas en charge à l'inventaire. ${ACTEURS.certificat}.`
    : !pv
      ? "Le certificat de prise en charge ne s'émet qu'après un procès-verbal de réception — RG-010."
      : certificat
        ? `Le certificat ${texte(certificat.numero)} existe déjà : un document figé ne se refait pas — RG-019.`
        : aSigneLePv
          ? "Vous avez signé le procès-verbal : qui réceptionne ne valide pas sa propre réception."
          : null

  const raisonPaiement = !aLeRole('comptable_public')
    ? `Votre profil ne marque pas le paiement. ${ACTEURS.paiement}.`
    : !certificat
      ? "Aucun paiement n'est marqué possible sans certificat de prise en charge — RG-011."
      : ['payable', 'paye'].includes(bon.statut)
        ? `Le paiement est déjà possible : ce bon est au statut « ${libelle(bon.statut)} ».`
        : null

  return (
    <>
      <Tiroir
        ouvert
        surFermeture={surFermeture}
        surTitre="Chaîne de la dépense"
        titre={<span className="mono">{texte(bon.numero)}</span>}
        sousTitre={`${texte(nomDuFournisseur(bon))} · ${montant(bon.montant)}`}
        pied={
          <>
            <Bouton
              icone={FileSignature}
              desactive={Boolean(raisonReception)}
              titre={raisonReception ?? undefined}
              surClic={() => setAction('reception')}
            >
              Contrôler et signer le PV
            </Bouton>
            <Bouton
              icone={BadgeCheck}
              desactive={Boolean(raisonPriseEnCharge)}
              titre={raisonPriseEnCharge ?? undefined}
              surClic={() => setAction('prise_en_charge')}
            >
              Prendre en charge
            </Bouton>
            <Bouton
              allure="principale"
              icone={Banknote}
              desactive={Boolean(raisonPaiement)}
              titre={raisonPaiement ?? undefined}
              surClic={() => setAction('paiement')}
            >
              Paiement possible
            </Bouton>
          </>
        }
      >
        <h3 className="section-titre">La chaîne</h3>
        <div className="circuit marge-dessus-3">
          {chaine.etapes.map((etape, index) => (
            <div
              key={etape.cle}
              className={clsx(
                'circuit-etape',
                etape.faite && 'est-faite',
                !etape.faite && index === chaine.rangCourant && 'est-courante',
              )}
            >
              <span className="circuit-puce" aria-hidden="true" />
              <span className="circuit-nom">
                {etape.nom}
                {etape.note ? <span className="texte-note"> — {etape.note}</span> : null}
              </span>
              <span className="circuit-note">{etape.faite ? 'Fait' : 'À faire'}</span>
            </div>
          ))}
        </div>
        {chaine.manque ? (
          <div className="marge-dessus-3 largeur-propos">
            <p className="sans-marge">{chaine.manque}</p>
            <div className="texte-note">Qui doit agir : {chaine.acteur}</div>
          </div>
        ) : (
          <p className="marge-dessus-3 largeur-propos texte-faible">
            La chaîne est complète : procès-verbal signé, biens pris en charge à
            l'inventaire, paiement possible au vu du certificat.
          </p>
        )}

        <h3 className="section-titre separe-dessus">Le bon de commande</h3>
        <div className="marge-dessus-3">
          <Definitions
            entrees={[
              { cle: 'Statut', valeur: <Pastille valeur={bon.statut} /> },
              { cle: 'Dossier', valeur: texte(bon.dossier_numero) },
              { cle: 'Objet', valeur: texte(bon.objet) },
              { cle: 'Procédure', valeur: libelle(bon.procedure) },
              { cle: 'Montant', valeur: montant(bon.montant) },
              { cle: 'Estimation du dossier', valeur: montant(bon.montant_estime) },
              { cle: 'Fournisseur', valeur: texte(nomDuFournisseur(bon)) },
              {
                cle: `${delaiDuFournisseur(bon).note} du fournisseur`,
                valeur:
                  delaiDuFournisseur(bon).jours === null
                    ? '—'
                    : jours(delaiDuFournisseur(bon).jours),
              },
              { cle: 'Émis le', valeur: horodatage(bon.emis_le) },
              { cle: 'Livré le', valeur: horodatage(bon.livre_le) },
              { cle: 'Payé le', valeur: horodatage(bon.paye_le) },
              {
                cle: 'Émis par',
                valeur: source.donnees?.emetteur?.signataire_nom
                  ? texte(source.donnees.emetteur.signataire_nom)
                  : 'Non servi par le serveur',
              },
            ]}
          />
        </div>

        <h3 className="section-titre separe-dessus">Le procès-verbal de réception</h3>
        {pv ? (
          <>
            <div className="marge-dessus-3">
              <Definitions
                entrees={[
                  { cle: 'Numéro', valeur: <span className="mono">{texte(pv.numero)}</span> },
                  { cle: 'Signé par', valeur: texte(pv.signataire_nom) },
                  { cle: 'Signé le', valeur: horodatage(pv.signe_le) },
                  { cle: 'Figé', valeur: pv.fige ? 'Oui — RG-019' : 'Non' },
                  {
                    cle: 'Pris en charge',
                    valeur: pv.pris_en_charge ? 'Oui' : 'Non — RG-010 ouvre la suite',
                  },
                ]}
              />
            </div>
            <LignesDuPv pv={pv} />
          </>
        ) : (
          <p className="marge-dessus-3 largeur-propos texte-faible">
            Aucun procès-verbal n'est établi pour ce bon de commande. Tant qu'il
            manque, ni la prise en charge ni le paiement ne sont possibles —
            RG-010, RG-011.
          </p>
        )}

        <h3 className="section-titre separe-dessus">Le certificat de prise en charge</h3>
        {certificat ? (
          <div className="marge-dessus-3">
            <Definitions
              entrees={[
                { cle: 'Numéro', valeur: <span className="mono">{texte(certificat.numero)}</span> },
                { cle: 'Certifié par', valeur: texte(certificat.signataire_nom) },
                { cle: 'Signé le', valeur: horodatage(certificat.signe_le) },
                {
                  cle: 'Émis sur le PV',
                  valeur: certificat.parent_document_id ? 'Oui, document lié' : '—',
                },
              ]}
            />
            <p className="marge-dessus-3 largeur-propos texte-faible">
              Les biens et matières sont pris en charge à l'inventaire. Le
              paiement devient possible au vu de ce certificat — décret 13/050,
              article 137.
            </p>
          </div>
        ) : (
          <p className="marge-dessus-3 largeur-propos texte-faible">
            Aucun certificat. {pv
              ? "Le procès-verbal est signé : la prise en charge à l'inventaire par le comptable des matières ouvre le paiement."
              : "Il ne peut pas être émis avant le procès-verbal de réception — RG-010."}
          </p>
        )}
      </Tiroir>

      {action === 'reception' ? (
        <DialogueReception
          bon={bon}
          source={source}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            recharger()
          }}
        />
      ) : null}

      {action === 'prise_en_charge' ? (
        <DialoguePriseEnCharge
          bon={bon}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            recharger()
          }}
        />
      ) : null}

      {action === 'paiement' ? (
        <DialoguePaiement
          bon={bon}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            recharger()
          }}
        />
      ) : null}
    </>
  )
}

/** Le contenu d'un PV : les PV émis par le SIGL portent leurs lignes et écarts. */
function LignesDuPv({ pv }) {
  const contenu = pv.contenu ?? {}
  const lignes = Array.isArray(contenu.lignes) ? contenu.lignes : []
  const ecarts = Array.isArray(contenu.ecarts) ? contenu.ecarts : []

  if (lignes.length === 0) {
    return (
      <p className="marge-dessus-3 largeur-propos texte-faible">
        Ce procès-verbal ne porte pas de contrôle ligne par ligne : il a été
        versé au dossier sans détail
        {contenu.conforme === true ? ', avec la seule mention « conforme »' : ''}
        {Array.isArray(contenu.reserves) && contenu.reserves.length > 0
          ? ` et ${nombre(contenu.reserves.length)} réserve(s)`
          : ''}
        . Les procès-verbaux signés depuis cet écran portent leurs lignes et leurs écarts.
      </p>
    )
  }

  return (
    <div className="marge-dessus-3">
      <Tableau
        lignes={lignes}
        cleDeLigne={(l, i) => `${l.designation}-${i}`}
        nomDesLignes="ligne contrôlée"
        nomDesLignesPluriel="lignes contrôlées"
        ligneSignalee={(l) => l.quantite_recue !== l.quantite_commandee || l.conforme === false}
        colonnes={[
          { cle: 'designation', titre: 'Désignation', rendu: (l) => texte(l.designation) },
          {
            cle: 'quantite_commandee',
            titre: 'Commandée',
            nombre: true,
            rendu: (l) => nombre(l.quantite_commandee),
          },
          {
            cle: 'quantite_recue',
            titre: 'Reçue',
            nombre: true,
            rendu: (l) => nombre(l.quantite_recue),
          },
          {
            cle: 'ecart',
            titre: 'Écart',
            nombre: true,
            valeur: (l) => Number(l.quantite_recue ?? 0) - Number(l.quantite_commandee ?? 0),
            rendu: (l) => direEcart(Number(l.quantite_recue ?? 0) - Number(l.quantite_commandee ?? 0)),
          },
          {
            cle: 'conforme',
            titre: 'État',
            rendu: (l) =>
              l.conforme === false ? (
                <Pastille valeur="rupture" texte="Non conforme" />
              ) : (
                <Pastille valeur="normal" texte="Conforme" />
              ),
          },
          {
            cle: 'observation',
            titre: 'Observation',
            triable: false,
            rendu: (l) => <span className="cellule-faible">{texte(l.observation)}</span>,
          },
        ]}
        pied={`${nombre(ecarts.length)} ligne(s) en écart sur ${nombre(lignes.length)}${
          contenu.observations ? ` · ${contenu.observations}` : ''
        }`}
      />
    </div>
  )
}

function direEcart(valeur) {
  if (!Number.isFinite(valeur) || valeur === 0) return '0'
  return valeur > 0 ? `+${nombre(valeur)}` : `−${nombre(Math.abs(valeur))}`
}

/* --------------------------------------------------------------------- */
/* Le contrôle ligne par ligne, puis la signature du PV                  */
/* --------------------------------------------------------------------- */

function DialogueReception({ bon, source, surFermeture, surSucces }) {
  const [lignes, setLignes] = useState([])
  const [observations, setObservations] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [prefait, setPrefait] = useState(false)

  // Les quantités commandées ne sont pas portées par le bon de commande : le
  // document du bon n'en garde que le montant. Elles viennent donc des lignes
  // d'origine « achat » de l'état de besoin regroupé. À défaut, une seule
  // ligne, reprise de l'objet du dossier, que la commission corrige.
  useEffect(() => {
    if (prefait || source.chargement) return
    const besoin = source.donnees?.besoin
    const dossier = source.donnees?.dossier
    const dAchat = (besoin?.lignes ?? []).filter((l) => l.origine === 'achat')
    const retenues = dAchat.length > 0 ? dAchat : (besoin?.lignes ?? [])
    const depart =
      retenues.length > 0
        ? retenues.map((l) => {
            const commandee = Number(l.quantite_accordee ?? l.quantite_demandee ?? 0)
            return {
              designation: String(l.designation ?? l.categorie_libelle ?? '').slice(0, 200),
              categorie_code: l.categorie_code ?? null,
              quantite_commandee: commandee,
              quantite_livree: commandee,
              quantite_recue: commandee,
              conforme: true,
              observation: '',
            }
          })
        : [
            {
              designation: String(dossier?.objet ?? bon.objet ?? 'Fourniture commandée').slice(0, 200),
              categorie_code: null,
              quantite_commandee: 1,
              quantite_livree: 1,
              quantite_recue: 1,
              conforme: true,
              observation: '',
            },
          ]
    setLignes(depart)
    setPrefait(true)
  }, [prefait, source.chargement, source.donnees, bon.objet])

  function modifier(index, champ, valeur) {
    setLignes((anciennes) =>
      anciennes.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)),
    )
  }

  function ajouter() {
    setLignes((anciennes) => [
      ...anciennes,
      {
        designation: '',
        categorie_code: null,
        quantite_commandee: 0,
        quantite_livree: 0,
        quantite_recue: 0,
        conforme: true,
        observation: '',
      },
    ])
  }

  function retirer(index) {
    setLignes((anciennes) => anciennes.filter((_, i) => i !== index))
  }

  const bilan = useMemo(() => {
    let manquantes = 0
    let excedentaires = 0
    let nonConformes = 0
    let enEcart = 0
    for (const l of lignes) {
      const commandee = Number(l.quantite_commandee ?? 0)
      const recue = Number(l.quantite_recue ?? 0)
      if (recue < commandee) manquantes += commandee - recue
      if (recue > commandee) excedentaires += recue - commandee
      if (l.conforme === false) nonConformes += 1
      if (recue !== commandee || l.conforme === false) enEcart += 1
    }
    return { manquantes, excedentaires, nonConformes, enEcart }
  }, [lignes])

  const valide =
    lignes.length > 0 &&
    lignes.every(
      (l) =>
        String(l.designation).trim().length >= 2 &&
        Number.isInteger(Number(l.quantite_commandee)) &&
        Number(l.quantite_commandee) >= 0 &&
        Number.isInteger(Number(l.quantite_recue)) &&
        Number(l.quantite_recue) >= 0,
    )

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.creerReception({
        bon_commande_id: bon.id,
        observations: observations.trim() === '' ? null : observations.trim(),
        lignes: lignes.map((l) => {
          // Le serveur ne retient au PV que la quantité commandée et la
          // quantité reçue. La quantité livrée annoncée, quand elle diffère,
          // est reportée dans l'observation : elle reste ainsi au dossier.
          const livree = Number(l.quantite_livree ?? l.quantite_recue ?? 0)
          const recue = Number(l.quantite_recue ?? 0)
          const mention =
            livree !== recue ? `Quantité livrée annoncée : ${nombre(livree)}.` : ''
          const observation = [String(l.observation ?? '').trim(), mention]
            .filter((t) => t !== '')
            .join(' ')
            .slice(0, 400)
          return {
            designation: String(l.designation).trim().slice(0, 200),
            ...(l.categorie_code ? { categorie_code: String(l.categorie_code).slice(0, 40) } : {}),
            quantite_commandee: Number(l.quantite_commandee),
            quantite_recue: recue,
            conforme: l.conforme !== false,
            ...(observation === '' ? {} : { observation }),
          }
        }),
      })
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
      titre="Contrôler la livraison, puis signer le procès-verbal"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton icone={Plus} surClic={ajouter}>
            Ajouter une ligne
          </Bouton>
          <Bouton allure="principale" desactive={!valide || envoi} surClic={envoyer}>
            {envoi ? 'Envoi…' : 'Signer le procès-verbal'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        La commission contrôle ligne par ligne. Les quantités commandées sont
        reprises des lignes d'origine « achat » de l'état de besoin regroupé :
        corrigez-les si le bon de commande en portait d'autres. Le procès-verbal
        est figé dès sa signature — RG-019.
      </p>

      {source.chargement ? (
        <Chargement texte="Lecture des lignes commandées…" lignes={2} />
      ) : source.erreur ? (
        <div className="marge-dessus-3">
          <Erreur
            erreur={source.erreur}
            surReessai={source.recharger}
            titre="Les lignes commandées n'ont pas pu être lues"
          />
        </div>
      ) : !source.donnees?.besoin ? (
        <div className="marge-dessus-3 texte-note largeur-propos">
          L'état de besoin regroupé n'est pas lisible dans votre périmètre, ou le
          dossier n'en porte aucun : la ligne de départ vient de l'objet du
          dossier. Saisissez les quantités réelles.
        </div>
      ) : null}

      <div className="marge-dessus-3">
        <Tableau
          lignes={lignes.map((l, i) => ({ ...l, _index: i }))}
          cleDeLigne={(l) => l._index}
          nomDesLignes="ligne contrôlée"
          nomDesLignesPluriel="lignes contrôlées"
          titreVide="Aucune ligne à contrôler"
          texteVide="Ajoutez une ligne : un procès-verbal sans ligne n'atteste rien, et le serveur le refusera."
          ligneSignalee={(l) =>
            Number(l.quantite_recue ?? 0) !== Number(l.quantite_commandee ?? 0) ||
            l.conforme === false
          }
          colonnes={[
            {
              cle: 'designation',
              titre: 'Désignation',
              largeur: '28%',
              triable: false,
              rendu: (l) => (
                <Champ
                  libelle="Désignation"
                  valeur={l.designation}
                  surChangement={(v) => modifier(l._index, 'designation', v)}
                />
              ),
            },
            {
              cle: 'quantite_commandee',
              titre: 'Commandée',
              nombre: true,
              largeur: '13%',
              triable: false,
              rendu: (l) => (
                <Champ
                  libelle="Commandée"
                  type="number"
                  min={0}
                  valeur={l.quantite_commandee}
                  surChangement={(v) => modifier(l._index, 'quantite_commandee', v === '' ? '' : Number(v))}
                />
              ),
            },
            {
              cle: 'quantite_livree',
              titre: 'Livrée',
              nombre: true,
              largeur: '13%',
              triable: false,
              rendu: (l) => (
                <Champ
                  libelle="Livrée"
                  type="number"
                  min={0}
                  valeur={l.quantite_livree}
                  surChangement={(v) => modifier(l._index, 'quantite_livree', v === '' ? '' : Number(v))}
                />
              ),
            },
            {
              cle: 'quantite_recue',
              titre: 'Reçue',
              nombre: true,
              largeur: '13%',
              triable: false,
              rendu: (l) => (
                <Champ
                  libelle="Reçue"
                  type="number"
                  min={0}
                  valeur={l.quantite_recue}
                  surChangement={(v) => modifier(l._index, 'quantite_recue', v === '' ? '' : Number(v))}
                />
              ),
            },
            {
              cle: 'ecart',
              titre: 'Écart',
              nombre: true,
              largeur: '9%',
              triable: false,
              rendu: (l) =>
                direEcart(Number(l.quantite_recue ?? 0) - Number(l.quantite_commandee ?? 0)),
            },
            {
              cle: 'conforme',
              titre: 'État',
              largeur: '14%',
              triable: false,
              rendu: (l) => (
                <Champ
                  libelle="État"
                  type="choix"
                  valeur={l.conforme === false ? 'non' : 'oui'}
                  surChangement={(v) => modifier(l._index, 'conforme', v !== 'non')}
                  options={[
                    { valeur: 'oui', libelle: 'Conforme' },
                    { valeur: 'non', libelle: 'Non conforme' },
                  ]}
                />
              ),
            },
            {
              cle: 'retirer',
              titre: '',
              largeur: '10%',
              triable: false,
              rendu: (l) => (
                <Bouton
                  taille="petite"
                  allure="discrete"
                  icone={Trash2}
                  surClic={() => retirer(l._index)}
                  titre="Retirer cette ligne du procès-verbal"
                >
                  Retirer
                </Bouton>
              ),
            },
          ]}
          pied={
            bilan.enEcart === 0
              ? 'Aucun écart : les quantités reçues correspondent aux quantités commandées, et tout est conforme.'
              : `${nombre(bilan.enEcart)} ligne(s) en écart · ${nombre(bilan.manquantes)} unité(s) manquante(s) · ${nombre(bilan.excedentaires)} en excédent · ${nombre(bilan.nonConformes)} ligne(s) non conforme(s)`
          }
        />
      </div>

      <div className="marge-dessus-3">
        <Champ
          libelle="Observations du procès-verbal"
          type="zone"
          lignes={3}
          valeur={observations}
          surChangement={setObservations}
          aide="Conservées au document figé. Un écart relevé ici ouvrira un examen, qui ne décide rien par lui-même — RG-022."
        />
      </div>

      {bilan.enEcart > 0 ? (
        <div className="marge-dessus-3 texte-note largeur-propos">
          Un écart fait passer le bon de commande au statut « Livré en partie »
          et ouvre un examen avant la prise en charge. Le procès-verbal reste
          signable : c'est son rôle que de constater.
        </div>
      ) : null}

      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé le procès-verbal" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* La prise en charge à l'inventaire — RG-010                            */
/* --------------------------------------------------------------------- */

function DialoguePriseEnCharge({ bon, surFermeture, surSucces }) {
  const [observations, setObservations] = useState('')
  const [articles, setArticles] = useState([])
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  // Les articles entrent au magasin de la structure réceptionnaire : le serveur
  // refuse un article d'une autre structure. On n'offre donc que les siens.
  const structure = bon.pv?.structure_id ?? null
  const stocks = useRequete(
    (o) => api.stocks({ structure: structure || undefined, parPage: 200 }, o),
    [structure],
  )
  const choixStocks = depouillerListe(stocks.donnees).lignes.map((s) => ({
    valeur: s.id,
    libelle: `${s.designation} — ${s.site_nom} (${nombre(s.quantite)} ${texte(s.unite)})`,
  }))

  const valide = articles.every(
    (a) => a.stock_id && Number.isInteger(Number(a.quantite)) && Number(a.quantite) >= 1,
  )

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.creerPriseEnCharge({
        bon_commande_id: bon.id,
        ...(bon.pv?.id ? { pv_reception_id: bon.pv.id } : {}),
        observations: observations.trim() === '' ? null : observations.trim(),
        ...(articles.length > 0
          ? {
              articles: articles.map((a) => ({
                stock_id: a.stock_id,
                quantite: Number(a.quantite),
              })),
            }
          : {}),
      })
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
      titre="Prendre en charge à l'inventaire"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            icone={Plus}
            surClic={() => setArticles((a) => [...a, { stock_id: '', quantite: 1 }])}
          >
            Ajouter un article
          </Bouton>
          <Bouton allure="principale" desactive={!valide || envoi} surClic={envoyer}>
            {envoi ? 'Envoi…' : 'Émettre le certificat'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        La prise en charge émet le <strong>certificat de prise en charge</strong>,
        lié au procès-verbal {texte(bon.pv?.numero)}. C'est lui, et lui seul, qui
        rend le paiement possible — décret 13/050, article 137, RG-011. Le
        certificat est figé dès son émission.
      </p>

      <h3 className="section-titre separe-dessus">Les articles qui entrent au magasin</h3>
      <p className="texte-note largeur-propos">
        Facultatif. Les quantités portées ici entrent à l'inventaire du magasin
        de la structure réceptionnaire, et le journal en garde l'avant et
        l'après. Sans article, le certificat atteste la prise en charge sans
        mouvement de stock.
      </p>

      {stocks.erreur ? (
        <div className="marge-dessus-3">
          <Erreur
            erreur={stocks.erreur}
            surReessai={stocks.recharger}
            titre="Les articles de stock n'ont pas pu être lus"
          />
        </div>
      ) : articles.length === 0 ? (
        <div className="marge-dessus-3 texte-note">Aucun article n'est déclaré.</div>
      ) : (
        <div className="marge-dessus-3 pile">
          {articles.map((a, i) => (
            <div className="ligne-outils" key={i}>
              <Champ
                libelle="Article de stock"
                type="choix"
                valeur={a.stock_id}
                surChangement={(v) =>
                  setArticles((anciens) =>
                    anciens.map((x, j) => (j === i ? { ...x, stock_id: v } : x)),
                  )
                }
                options={choixStocks}
              />
              <Champ
                libelle="Quantité entrée"
                type="number"
                min={1}
                valeur={a.quantite}
                surChangement={(v) =>
                  setArticles((anciens) =>
                    anciens.map((x, j) => (j === i ? { ...x, quantite: v === '' ? '' : Number(v) } : x)),
                  )
                }
              />
              <Bouton
                taille="petite"
                allure="discrete"
                icone={Trash2}
                surClic={() => setArticles((anciens) => anciens.filter((_, j) => j !== i))}
              >
                Retirer
              </Bouton>
            </div>
          ))}
        </div>
      )}

      <div className="marge-dessus-3">
        <Champ
          libelle="Observations du certificat"
          type="zone"
          lignes={3}
          valeur={observations}
          surChangement={setObservations}
          aide="Conservées au document figé, et lisibles par le contrôle externe."
        />
      </div>

      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé la prise en charge" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Le paiement possible — RG-011                                         */
/* --------------------------------------------------------------------- */

function DialoguePaiement({ bon, surFermeture, surSucces }) {
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.marquerPayable(bon.id)
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
      titre="Marquer le paiement possible"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton allure="principale" desactive={envoi} surClic={envoyer}>
            {envoi ? 'Envoi…' : 'Confirmer'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        Le comptable public contrôle la prise en charge et marque le paiement
        possible. Le certificat {texte(bon.certificat?.numero)} en est le seul
        titre — RG-011. L'action est journalisée avant d'être confirmée — RG-020.
      </p>
      <div className="marge-dessus-3">
        <Definitions
          entrees={[
            { cle: 'Bon de commande', valeur: <span className="mono">{texte(bon.numero)}</span> },
            { cle: 'Fournisseur', valeur: texte(nomDuFournisseur(bon)) },
            { cle: 'Montant', valeur: montant(bon.montant) },
            { cle: 'Procès-verbal', valeur: texte(bon.pv?.numero) },
            { cle: 'Certificat', valeur: texte(bon.certificat?.numero) },
            { cle: 'Émis le', valeur: date(bon.emis_le) },
          ]}
        />
      </div>
      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé le marquage" />
        </div>
      ) : null}
    </Dialogue>
  )
}
