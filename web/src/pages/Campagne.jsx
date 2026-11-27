import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  ClipboardCheck,
  ClipboardList,
  Gavel,
  Lock,
  MessageSquareQuote,
  PlayCircle,
  RefreshCw,
  UserPlus,
} from 'lucide-react'
import Page, { Section } from '../components/Page.jsx'
import Bento, { Bloc } from '../components/Bento.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Bouton from '../components/Bouton.jsx'
import Champ from '../components/Champ.jsx'
import Chiffre, { RangeeChiffres } from '../components/Chiffre.jsx'
import Definitions from '../components/Definitions.jsx'
import Dialogue from '../components/Dialogue.jsx'
import Vide, { Erreur, Etat } from '../components/Vide.jsx'
import { Avancement } from './Inventaire.jsx'
import api from '../lib/api.js'
import { depouillerListe, useRequete } from '../lib/requete.js'
import { useAgent, useRoles } from '../lib/agent.jsx'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { date, dateEnClair, horodatage, jours, libelle, nombre, texte } from '../lib/format.js'
import {
  ACTEURS,
  attendDepuisTropLongtemps,
  avancementDe,
  estEnAttente,
  fileDAttente,
  fonctionDeLAgent,
  nomDeLAgent,
  nomDeLaCampagne,
  tacheDeLEcart,
  tacheDeLaCampagne,
  verdictDeCloture,
} from '../lib/inventaire.js'

/*
  Le poste de travail d'une campagne d'inventaire.

  Décret 13/050 : article 120 — l'inventaire est arrêté à date fixe ;
  article 122 — le détenteur atteste les biens qui lui sont affectés.

  Ce que le serveur rend, et que cet écran se contente d'afficher :
    { campagne, agents[], avancement, constats[], ecarts[], clotures_possible }
  `clotures_possible` dit d'avance ce que RG-023 et RG-024 répondraient. Le
  bouton de clôture est grisé d'après `possible`, et affiche `motif` TEL QUEL.
  Aucune de ces deux règles n'est réimplémentée ici : si le serveur ne rend
  pas son verdict, l'action reste fermée et l'écran le dit.

  Le constat n'engendre que l'écart. Il ne modifie jamais la fiche du bien :
  c'est la décision humaine — régularisation, perte, maintien — qui régularise.
*/

const RESULTATS = [
  { valeur: 'conforme', libelle: 'Conforme — le bien est là, tel que la fiche le dit' },
  { valeur: 'ecart', libelle: 'Écart — le bien est là, mais autrement' },
  { valeur: 'introuvable', libelle: 'Introuvable — le bien n’a pas été retrouvé' },
]

const ETATS_CONSTATES = ['neuf', 'bon', 'a_reparer', 'hors_service', 'en_maintenance', 'reforme', 'perdu']

const QUALITES = [
  { valeur: 'operateur', libelle: 'Opérateur — il compte et constate' },
  { valeur: 'detenteur', libelle: 'Détenteur — il atteste les biens affectés (art. 122)' },
  { valeur: 'temoin', libelle: 'Témoin — il assiste au constat' },
]

const DECISIONS = [
  {
    valeur: 'regularisation',
    libelle: 'Régularisation — aligner la fiche du bien sur le constat',
    effet:
      'La fiche du bien est alignée sur le constat — quantité, état, détenteur, site — et un mouvement en porte le motif.',
  },
  {
    valeur: 'perte',
    libelle: 'Perte — le bien reste au registre, à l’état « perdu »',
    effet:
      "Le bien passe à l'état « perdu » et reste au registre — RG-015. Un mouvement de perte est inscrit et un PV de perte est figé. Le SIGL ne prononce pas la responsabilité : il instruit et produit le PV — RG-016.",
  },
  {
    valeur: 'maintien',
    libelle: 'Maintien en l’état — la fiche ne bouge pas',
    effet: 'La fiche du bien ne bouge pas. Le motif est obligatoire et conservé.',
  },
]

const ROLES_DE_TENUE = ['comptable_matieres', 'logistique']
const ROLES_DE_CONSTAT = ['magasinier', 'comptable_matieres']
const ROLES_DE_DECISION = ['comptable_matieres', 'logistique']

export default function Campagne() {
  const { id } = useParams()
  const navigue = useNavigate()
  const { agent } = useAgent()
  const { aLeRole } = useRoles()

  const fiche = useRequete((o) => api.campagneInventaire(id, o), [id])
  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant(['inventaire', 'rapprochement'], fiche.recharger, marquer)

  const [action, setAction] = useState(null) // 'constat' | 'agent' | 'ouverture' | 'cloture'
  const [ecartOuvert, setEcartOuvert] = useState(null) // { ecart, mode: 'expliquer' | 'trancher' }

  const detail = fiche.donnees ?? null
  const campagne = detail?.campagne ?? null
  const agents = Array.isArray(detail?.agents) ? detail.agents : []
  const constats = Array.isArray(detail?.constats) ? detail.constats : []
  const ecarts = Array.isArray(detail?.ecarts) ? detail.ecarts : []
  const avancement = avancementDe(detail)
  const verdict = verdictDeCloture(detail)

  const attente = useMemo(() => fileDAttente(ecarts), [ecarts])
  const tache = useMemo(
    () => tacheDeLaCampagne(campagne, ecarts, avancement),
    [campagne, ecarts, avancement],
  )

  // L'agent courant est-il désigné « détenteur » de cette campagne ? C'est lui,
  // avec le détenteur du bien, qui porte l'explication d'un écart.
  const estDetenteurDesigne = agents.some(
    (a) => String(a.agent_id) === String(agent?.id) && a.qualite === 'detenteur',
  )
  const estOperateurDesigne = agents.some(
    (a) => String(a.agent_id) === String(agent?.id) && a.qualite === 'operateur',
  )

  const raisonTenue = aLeRole(...ROLES_DE_TENUE)
    ? null
    : `La tenue d'une campagne d'inventaire revient au comptable des matières. ${ACTEURS.preparation}.`

  const raisonOuverture =
    raisonTenue ??
    (campagne?.statut !== 'preparee'
      ? `Cette campagne n'est plus préparée : elle est « ${libelle(campagne?.statut)} ». Une campagne ne s'ouvre qu'une fois.`
      : agents.length === 0
        ? "Aucun agent n'est désigné : désignez au moins un opérateur et le détenteur avant d'ouvrir — décret 13/050, article 122."
        : null)

  const raisonConstat =
    campagne?.statut !== 'en_cours'
      ? `Un constat ne se saisit que sur une campagne en cours. Celle-ci est « ${libelle(campagne?.statut)} ».`
      : aLeRole(...ROLES_DE_CONSTAT) || estDetenteurDesigne || estOperateurDesigne
        ? null
        : `Votre profil ne saisit pas de constat, et vous n'êtes pas désigné sur cette campagne. ${ACTEURS.constat}.`

  // La clôture : le verdict est celui du serveur, et lui seul. On ajoute
  // seulement la raison de profil, que le serveur appliquerait aussi.
  const raisonCloture = raisonTenue ?? (verdict.possible ? null : verdict.motif)

  if (fiche.chargement || fiche.erreur || !campagne) {
    return (
      <Page
        titre="Campagne d'inventaire"
        fil={[
          { libelle: 'SIGL', to: '/' },
          { libelle: 'Inventaire', to: '/inventaire' },
          { libelle: 'Campagne' },
        ]}
        actions={
          <Bouton icone={RefreshCw} surClic={fiche.recharger}>
            Actualiser
          </Bouton>
        }
      >
        <Etat
          chargement={fiche.chargement}
          erreur={fiche.erreur}
          recharger={fiche.recharger}
          texteChargement="Lecture de la campagne, de ses agents, de ses constats et de ses écarts…"
          vide={!campagne}
          titreVide="Cette campagne n'est pas lisible"
          texteVide="Le serveur n'a rendu aucune campagne pour cette adresse : elle n'existe pas, ou elle relève d'une autre structure — RG-017."
          actionVide={
            <Bouton allure="principale" vers="/inventaire">
              Revenir aux campagnes
            </Bouton>
          }
        >
          {null}
        </Etat>
      </Page>
    )
  }

  return (
    <Page
      titre={nomDeLaCampagne(campagne) ?? 'Campagne'}
      sousTitre={`${texte(campagne.structure_nom)} · ${
        texte(campagne.site_nom) === '—' ? 'tous les sites' : texte(campagne.site_nom)
      } · inventaire arrêté au ${dateEnClair(campagne.date_arretee)}`}
      fil={[
        { libelle: 'SIGL', to: '/' },
        { libelle: 'Inventaire', to: '/inventaire' },
        { libelle: texte(campagne.numero) },
      ]}
      actions={
        <>
          <Bouton icone={RefreshCw} surClic={fiche.recharger}>
            Actualiser
          </Bouton>
          <Bouton
            icone={UserPlus}
            desactive={Boolean(raisonTenue)}
            titre={raisonTenue ?? undefined}
            surClic={() => setAction('agent')}
          >
            Désigner un agent
          </Bouton>
          <Bouton
            icone={PlayCircle}
            desactive={Boolean(raisonOuverture)}
            titre={raisonOuverture ?? undefined}
            surClic={() => setAction('ouverture')}
          >
            Ouvrir la campagne
          </Bouton>
          <Bouton
            icone={ClipboardCheck}
            desactive={Boolean(raisonConstat)}
            titre={raisonConstat ?? undefined}
            surClic={() => setAction('constat')}
          >
            Saisir un constat
          </Bouton>
          <Bouton
            allure="principale"
            icone={Lock}
            desactive={Boolean(raisonCloture)}
            titre={raisonCloture ?? undefined}
            surClic={() => setAction('cloture')}
          >
            Clore la campagne
          </Bouton>
        </>
      }
    >
      <Bento>
        <Bloc large={7} titre="Ce qui attend" note="Les plus vieilles attentes d'abord">
          <div className={clsx('circuit-etape', tache.ton === 'succes' && 'est-faite', tache.ton !== 'succes' && 'est-courante')}>
            <span className="circuit-puce" aria-hidden="true" />
            <span className="circuit-nom">
              {tache.quoi}
              {tache.acteur ? <span className="texte-note"> — {tache.acteur}</span> : null}
            </span>
          </div>

          <div className="marge-dessus-3">
            <Definitions
              entrees={[
                { cle: 'Statut', valeur: <Pastille valeur={campagne.statut} /> },
                { cle: 'Numéro', valeur: <span className="mono">{texte(campagne.numero)}</span> },
                { cle: 'Date arrêtée', valeur: date(campagne.date_arretee) },
                {
                  cle: 'Structure',
                  valeur: (
                    <Link to={`/patrimoine?structure=${encodeURIComponent(campagne.structure_id ?? '')}`}>
                      {texte(campagne.structure_nom)}
                    </Link>
                  ),
                },
                { cle: 'Site', valeur: texte(campagne.site_nom) === '—' ? 'Tous les sites' : texte(campagne.site_nom) },
                { cle: 'Agents désignés', valeur: nombre(agents.length) },
              ]}
            />
          </div>

          <h3 className="section-titre separe-dessus">La clôture</h3>
          <p className="marge-dessus-3 sans-marge largeur-propos">
            {verdict.possible
              ? "Le serveur annonce la clôture possible : aucun bien du périmètre n'est resté hors constat, et aucun écart n'est resté non tranché — RG-023, RG-024."
              : verdict.motif}
          </p>
          <div className="texte-note marge-dessus-1">
            {verdict.servi
              ? 'Verdict rendu par le serveur dans « clotures_possible ». Cet écran l’affiche sans le refaire.'
              : "Aucun verdict n'est servi par le serveur : par prudence, la clôture reste fermée."}
          </div>
        </Bloc>

        <Bloc large={5} titre="L'avancement" note="Les chiffres viennent du serveur">
          {avancement ? (
            <>
              <Avancement avancement={avancement} dense={false} />
              <div className="marge-dessus-3">
                <RangeeChiffres>
                  <Chiffre
                    valeur={avancement.biens_du_perimetre}
                    libelle="Biens du périmètre"
                    vers={
                      campagne.structure_id
                        ? `/patrimoine?structure=${encodeURIComponent(campagne.structure_id)}`
                        : '/patrimoine'
                    }
                  />
                  <Chiffre valeur={avancement.constates} libelle="Constatés" />
                  <Chiffre valeur={avancement.conformes} libelle="Conformes" ton="succes" />
                  <Chiffre
                    valeur={avancement.ecarts}
                    libelle="En écart"
                    ton={avancement.ecarts > 0 ? 'attente' : undefined}
                  />
                  <Chiffre
                    valeur={avancement.introuvables}
                    libelle="Introuvables"
                    ton={avancement.introuvables > 0 ? 'critique' : undefined}
                  />
                  <Chiffre
                    valeur={avancement.restants}
                    libelle="Restent à constater"
                    appui={avancement.restants > 0 ? ACTEURS.constat : undefined}
                    ton={avancement.restants > 0 ? 'attente' : 'succes'}
                  />
                </RangeeChiffres>
              </div>
            </>
          ) : (
            <Vide
              titre="L'avancement n'est pas servi"
              texte="Le serveur n'a pas rendu d'objet « avancement » pour cette campagne. Rien n'est recalculé ici : il n'y a donc aucun chiffre à montrer."
            />
          )}
        </Bloc>
      </Bento>

      <Section
        titre="Les écarts et leur circuit"
        note="Constaté → expliqué par le détenteur → tranché par un humain"
      >
        {ecarts.length === 0 ? (
          <Vide
            titre="Aucun écart"
            texte={
              constats.length === 0
                ? "Aucun constat n'est encore saisi : il n'y a donc aucun écart. Un écart naît d'un constat « écart » ou « introuvable », dans la même transaction — jamais d'un constat conforme."
                : "Tous les constats saisis sont conformes : la comptabilité des matières correspond au terrain. C'est le résultat que l'on cherche."
            }
          />
        ) : (
          <Tableau
            lignes={ecarts}
            nomDesLignes="écart"
            nomDesLignesPluriel="écarts"
            triInitial={{ cle: 'anciennete_jours', sens: 'desc' }}
            ligneSignalee={attendDepuisTropLongtemps}
            ligneMarquee={(e) => estMarque(e.id)}
            colonnes={[
              {
                cle: 'anciennete_jours',
                titre: 'Attend depuis',
                nombre: true,
                largeur: '10%',
                valeur: (e) => (typeof e.anciennete_jours === 'number' ? e.anciennete_jours : -1),
                rendu: (e) =>
                  !estEnAttente(e) ? (
                    <span className="texte-note">—</span>
                  ) : typeof e.anciennete_jours === 'number' ? (
                    jours(e.anciennete_jours)
                  ) : (
                    <span className="texte-note">non servie</span>
                  ),
              },
              {
                cle: 'immatriculation',
                titre: 'Bien',
                largeur: '18%',
                rendu: (e) => (
                  <span className="cellule-deux-lignes">
                    <Link className="mono" to={e.bien_id ? `/patrimoine/${e.bien_id}` : '/patrimoine'}>
                      {texte(e.immatriculation)}
                    </Link>
                    <span className="texte-note">{texte(e.designation)}</span>
                  </span>
                ),
              },
              {
                cle: 'nature',
                titre: 'Nature',
                largeur: '11%',
                rendu: (e) => (
                  <span className="cellule-deux-lignes">
                    <span>{libelle(e.nature)}</span>
                    <span className="texte-note">
                      {typeof e.ecart_quantite === 'number' && e.ecart_quantite !== 0
                        ? `${e.ecart_quantite > 0 ? '+' : '−'}${nombre(Math.abs(e.ecart_quantite))}`
                        : ''}
                    </span>
                  </span>
                ),
              },
              {
                cle: 'statut',
                titre: 'Statut',
                largeur: '10%',
                rendu: (e) => <Pastille valeur={e.statut} ton={tacheDeLEcart(e)?.ton} />,
              },
              {
                cle: 'explication',
                titre: 'Explication et décision',
                largeur: '33%',
                triable: false,
                rendu: (e) => (
                  <span className="cellule-deux-lignes">
                    <span>
                      {texte(e.explication) === '—'
                        ? tacheDeLEcart(e)?.quoi ?? '—'
                        : texte(e.explication)}
                    </span>
                    <span className="texte-note">
                      {e.decision
                        ? `${libelle(e.decision)} — ${texte(e.motif_decision)}`
                        : (tacheDeLEcart(e)?.acteur ?? '—')}
                    </span>
                  </span>
                ),
              },
              {
                cle: 'actions',
                titre: '',
                largeur: '18%',
                triable: false,
                rendu: (e) => (
                  <ActionsDeLEcart
                    ecart={e}
                    aLeRole={aLeRole}
                    estDetenteurDesigne={estDetenteurDesigne}
                    surExpliquer={() => setEcartOuvert({ ecart: e, mode: 'expliquer' })}
                    surTrancher={() => setEcartOuvert({ ecart: e, mode: 'trancher' })}
                  />
                ),
              },
            ]}
            pied={`${nombre(attente.length)} écart(s) en attente sur ${nombre(ecarts.length)} · les lignes signalées attendent depuis dix jours ou plus`}
          />
        )}
      </Section>

      <Section titre="Les agents désignés" note="Décret 13/050, article 122">
        {agents.length === 0 ? (
          <Vide
            titre="Aucun agent n'est désigné"
            texte="Une campagne d'inventaire se mène à plusieurs : un opérateur compte, le détenteur atteste les biens qui lui sont affectés, un témoin assiste. Désignez-les avant d'ouvrir la campagne."
            action={
              <Bouton
                allure="principale"
                icone={UserPlus}
                desactive={Boolean(raisonTenue)}
                titre={raisonTenue ?? undefined}
                surClic={() => setAction('agent')}
              >
                Désigner un agent
              </Bouton>
            }
          />
        ) : (
          <Tableau
            lignes={agents}
            cleDeLigne={(a, i) => `${a.agent_id}-${a.qualite}-${i}`}
            nomDesLignes="agent désigné"
            nomDesLignesPluriel="agents désignés"
            colonnes={[
              { cle: 'nom', titre: 'Agent', rendu: (a) => texte(nomDeLAgent(a)) },
              {
                cle: 'fonction',
                titre: 'Fonction',
                rendu: (a) => <span className="cellule-faible">{texte(fonctionDeLAgent(a))}</span>,
              },
              { cle: 'qualite', titre: 'Qualité', rendu: (a) => libelle(a.qualite) },
            ]}
          />
        )}
      </Section>

      <Section
        titre="Les constats"
        note="Le constat ne modifie jamais la fiche du bien : c'est la décision qui régularise"
      >
        {constats.length === 0 ? (
          <Vide
            titre="Aucun constat n'est saisi"
            texte={
              campagne.statut === 'preparee'
                ? "La campagne est encore préparée : ouvrez-la, et les opérateurs désignés pourront constater bien par bien."
                : "La campagne est ouverte et aucun bien n'a encore été constaté. Une campagne ne se clôt pas tant qu'un bien de son périmètre n'a pas été constaté — RG-023."
            }
            action={
              <Bouton
                allure="principale"
                icone={ClipboardCheck}
                desactive={Boolean(raisonConstat)}
                titre={raisonConstat ?? undefined}
                surClic={() => setAction('constat')}
              >
                Saisir un constat
              </Bouton>
            }
          />
        ) : (
          <Tableau
            lignes={constats}
            nomDesLignes="constat"
            nomDesLignesPluriel="constats"
            triInitial={{ cle: 'constate_le', sens: 'desc' }}
            ligneSignalee={(c) => c.resultat !== 'conforme'}
            ligneMarquee={(c) => estMarque(c.id)}
            colonnes={[
              {
                cle: 'immatriculation',
                titre: 'Bien',
                largeur: '22%',
                rendu: (c) => (
                  <span className="cellule-deux-lignes">
                    <Link className="mono" to={c.bien_id ? `/patrimoine/${c.bien_id}` : '/patrimoine'}>
                      {texte(c.immatriculation)}
                    </Link>
                    <span className="texte-note">{texte(c.designation)}</span>
                  </span>
                ),
              },
              {
                cle: 'resultat',
                titre: 'Résultat',
                largeur: '12%',
                rendu: (c) => <Pastille valeur={c.resultat} />,
              },
              {
                cle: 'quantite_comptee',
                titre: 'Comptée',
                nombre: true,
                largeur: '9%',
                valeur: (c) => (typeof c.quantite_comptee === 'number' ? c.quantite_comptee : -1),
                rendu: (c) =>
                  typeof c.quantite_comptee === 'number' ? nombre(c.quantite_comptee) : '—',
              },
              {
                cle: 'etat_constate',
                titre: 'État constaté',
                largeur: '13%',
                rendu: (c) => (c.etat_constate ? libelle(c.etat_constate) : '—'),
              },
              {
                cle: 'constate_par_nom',
                titre: 'Constaté par',
                largeur: '18%',
                rendu: (c) => (
                  <span className="cellule-deux-lignes">
                    <span>{texte(c.constate_par_nom)}</span>
                    <span className="texte-note">{horodatage(c.constate_le)}</span>
                  </span>
                ),
              },
              {
                cle: 'observation',
                titre: 'Observation',
                largeur: '26%',
                triable: false,
                rendu: (c) => <span className="cellule-faible">{texte(c.observation)}</span>,
              },
            ]}
            pied={`${nombre(constats.length)} constat(s) · les lignes signalées ont ouvert un écart`}
          />
        )}
      </Section>

      {action === 'agent' ? (
        <DialogueDesignation
          campagne={campagne}
          dejaDesignes={agents}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
          }}
        />
      ) : null}

      {action === 'ouverture' ? (
        <DialogueOuverture
          campagne={campagne}
          agents={agents}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
          }}
        />
      ) : null}

      {action === 'constat' ? (
        <DialogueConstat
          campagne={campagne}
          constats={constats}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
          }}
        />
      ) : null}

      {action === 'cloture' ? (
        <DialogueCloture
          campagne={campagne}
          verdict={verdict}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
          }}
        />
      ) : null}

      {ecartOuvert ? (
        <DialogueEcart
          ecart={ecartOuvert.ecart}
          mode={ecartOuvert.mode}
          surFermeture={() => setEcartOuvert(null)}
          surSucces={() => {
            setEcartOuvert(null)
            fiche.recharger()
          }}
        />
      ) : null}
    </Page>
  )
}

/* --------------------------------------------------------------------- */
/* Les deux gestes d'un écart, grisés avec leur raison                   */
/* --------------------------------------------------------------------- */

function ActionsDeLEcart({ ecart, aLeRole, estDetenteurDesigne, surExpliquer, surTrancher }) {
  if (ecart.statut === 'tranche') {
    return <span className="texte-note">Tranché — {libelle(ecart.decision)}</span>
  }

  if (ecart.statut === 'constate') {
    const raison =
      aLeRole('comptable_matieres', 'magasinier', 'logistique') || estDetenteurDesigne
        ? null
        : `L'explication d'un écart est portée par le détenteur du bien, ou par un agent désigné « détenteur » de la campagne. ${ACTEURS.explication}.`
    return (
      <Bouton
        taille="petite"
        icone={MessageSquareQuote}
        desactive={Boolean(raison)}
        titre={raison ?? undefined}
        surClic={surExpliquer}
      >
        Expliquer
      </Bouton>
    )
  }

  const raison = aLeRole(...ROLES_DE_DECISION)
    ? null
    : `Trancher est réservé au comptable des matières et au chargé de logistique centrale. ${ACTEURS.decision}.`
  return (
    <Bouton
      taille="petite"
      allure="principale"
      icone={Gavel}
      desactive={Boolean(raison)}
      titre={raison ?? undefined}
      surClic={surTrancher}
    >
      Trancher
    </Bouton>
  )
}

/* --------------------------------------------------------------------- */
/* Désigner un agent — POST /api/campagnes-inventaire/:id/agents         */
/* --------------------------------------------------------------------- */

function DialogueDesignation({ campagne, dejaDesignes, surFermeture, surSucces }) {
  const [agentId, setAgentId] = useState('')
  const [qualite, setQualite] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const profils = useRequete((o) => api.profils(o), [])
  const liste = depouillerListe(profils.donnees).lignes

  /*
    Les agents de la structure inventoriée d'abord : c'est eux que l'on
    désigne. Les autres restent offerts — le serveur tranchera.
    `GET /api/profils` ne rend pas `structure_id` mais `structure_code` et
    `structure_nom` : on rapproche sur ce que les deux réponses portent
    réellement, plutôt que sur un champ qui n'existe que d'un côté.
  */
  const options = useMemo(() => {
    const dedans = []
    const dehors = []
    const nom = String(campagne.structure_nom ?? '')
    for (const a of liste) {
      const etiquette = `${texte(a.nom)} — ${texte(a.fonction)} (${texte(a.structure_code)})`
      const sienne =
        (a.structure_id && String(a.structure_id) === String(campagne.structure_id ?? '')) ||
        (nom !== '' && String(a.structure_nom ?? '') === nom)
      ;(sienne ? dedans : dehors).push({ valeur: a.id, libelle: etiquette })
    }
    return [...dedans, ...dehors]
  }, [liste, campagne.structure_id, campagne.structure_nom])

  const doublon = dejaDesignes.some(
    (a) => String(a.agent_id) === String(agentId) && a.qualite === qualite,
  )
  const valide = agentId !== '' && qualite !== '' && !doublon

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.designerAgentInventaire(campagne.id, { agent_id: agentId, qualite })
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
      titre="Désigner un agent sur la campagne"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={UserPlus}
            desactive={!valide || envoi}
            surClic={envoyer}
            titre={doublon ? 'Cet agent est déjà désigné dans cette qualité.' : undefined}
          >
            {envoi ? 'Envoi…' : 'Désigner'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        Le détenteur atteste les biens qui lui sont affectés — décret 13/050,
        article 122. Un même agent peut être désigné dans deux qualités
        différentes, jamais deux fois dans la même.
      </p>

      {profils.erreur ? (
        <div className="marge-dessus-3">
          <Erreur
            erreur={profils.erreur}
            surReessai={profils.recharger}
            titre="La liste des agents n'a pas pu être lue"
          />
        </div>
      ) : null}

      <div className="marge-dessus-3 pile largeur-formulaire">
        <Champ
          libelle="Agent"
          type="choix"
          obligatoire
          valeur={agentId}
          surChangement={setAgentId}
          options={options}
          aide={`Les agents de ${texte(campagne.structure_nom)} sont en tête de liste.`}
        />
        <Champ
          libelle="Qualité"
          type="choix"
          obligatoire
          valeur={qualite}
          surChangement={setQualite}
          options={QUALITES}
          erreur={doublon ? 'Cet agent est déjà désigné dans cette qualité.' : undefined}
        />
      </div>

      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé la désignation" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Ouvrir la campagne — POST /api/campagnes-inventaire/:id/ouvrir        */
/* --------------------------------------------------------------------- */

function DialogueOuverture({ campagne, agents, surFermeture, surSucces }) {
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.ouvrirCampagneInventaire(campagne.id)
      surSucces()
    } catch (cause) {
      setErreur(cause)
    } finally {
      setEnvoi(false)
    }
  }

  const parQualite = QUALITES.map((q) => ({
    qualite: q.valeur,
    combien: agents.filter((a) => a.qualite === q.valeur).length,
  }))

  return (
    <Dialogue
      ouvert
      titre="Ouvrir la campagne d'inventaire"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton allure="principale" icone={PlayCircle} desactive={envoi} surClic={envoyer}>
            {envoi ? 'Envoi…' : 'Ouvrir'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        L'ouverture rend la campagne « en cours » : les agents désignés peuvent
        alors constater bien par bien. L'action est journalisée avant d'être
        confirmée — RG-020.
      </p>
      <div className="marge-dessus-3">
        <Definitions
          entrees={[
            { cle: 'Campagne', valeur: <span className="mono">{texte(campagne.numero)}</span> },
            { cle: 'Libellé', valeur: texte(campagne.libelle) },
            { cle: 'Structure', valeur: texte(campagne.structure_nom) },
            { cle: 'Date arrêtée', valeur: dateEnClair(campagne.date_arretee) },
            ...parQualite.map((p) => ({
              cle: libelle(p.qualite),
              valeur: p.combien === 0 ? 'Aucun' : nombre(p.combien),
            })),
          ]}
        />
      </div>
      {parQualite.find((p) => p.qualite === 'detenteur')?.combien === 0 ? (
        <p className="marge-dessus-3 texte-note largeur-propos">
          Aucun détenteur n'est désigné. L'article 122 du décret 13/050 veut que
          le détenteur atteste les biens qui lui sont affectés : sans lui,
          l'explication d'un écart n'aura personne pour la porter.
        </p>
      ) : null}
      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé l'ouverture" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Saisir un constat — POST /api/campagnes-inventaire/:id/constats       */
/* --------------------------------------------------------------------- */

function DialogueConstat({ campagne, constats, surFermeture, surSucces }) {
  const [q, setQ] = useState('')
  const [bienId, setBienId] = useState('')
  const [resultat, setResultat] = useState('conforme')
  const [quantite, setQuantite] = useState('')
  const [etat, setEtat] = useState('')
  const [detenteur, setDetenteur] = useState('')
  const [site, setSite] = useState('')
  const [observation, setObservation] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const biens = useRequete(
    (o) =>
      api.biens(
        {
          structure: campagne.structure_id,
          ...(campagne.site_id ? { site: campagne.site_id } : {}),
          q,
          parPage: 100,
        },
        o,
      ),
    [campagne.structure_id, campagne.site_id, q],
  )
  const sites = useRequete((o) => api.sites({ structure: campagne.structure_id }, o), [
    campagne.structure_id,
  ])
  const profils = useRequete((o) => api.profils(o), [])

  const dejaConstates = useMemo(
    () => new Set(constats.map((c) => String(c.bien_id))),
    [constats],
  )
  const lignesBiens = depouillerListe(biens.donnees).lignes
  const aConstater = lignesBiens.filter((b) => !dejaConstates.has(String(b.id)))
  const bien = lignesBiens.find((b) => String(b.id) === String(bienId)) ?? null

  const valide = bienId !== '' && resultat !== ''

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.constaterInventaire(campagne.id, {
        bien_id: bienId,
        resultat,
        ...(quantite === '' ? {} : { quantite_comptee: Number(quantite) }),
        ...(etat === '' ? {} : { etat_constate: etat }),
        ...(detenteur === '' ? {} : { detenteur_constate_id: detenteur }),
        ...(site === '' ? {} : { site_constate_id: site }),
        ...(observation.trim() === '' ? {} : { observation: observation.trim() }),
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
      large
      titre="Constater un bien"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={ClipboardList}
            desactive={!valide || envoi}
            surClic={envoyer}
            titre={valide ? undefined : 'Choisissez un bien et un résultat.'}
          >
            {envoi ? 'Envoi…' : 'Enregistrer le constat'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        Un résultat « écart » ou « introuvable » ouvre une ligne d'écart dans la
        même transaction, avec sa nature déduite de ce qui diffère réellement
        entre le constat et la fiche du bien. Un constat conforme n'en ouvre
        aucune. <strong>Le constat ne modifie jamais la fiche du bien</strong> :
        c'est la décision humaine qui régularise.
      </p>

      <div className="marge-dessus-3 ligne-outils">
        <Recherche
          valeur={q}
          surChangement={setQ}
          placeholder="Immatriculation, désignation, marque, n° de série…"
        />
        <span className="texte-note">
          {biens.chargement
            ? 'Lecture des biens du périmètre…'
            : `${nombre(aConstater.length)} bien(s) non encore constatés parmi les ${nombre(lignesBiens.length)} servis`}
        </span>
      </div>

      {biens.erreur ? (
        <div className="marge-dessus-3">
          <Erreur
            erreur={biens.erreur}
            surReessai={biens.recharger}
            titre="Les biens du périmètre n'ont pas pu être lus"
          />
        </div>
      ) : null}

      <div className="marge-dessus-3 pile">
        <Champ
          libelle="Bien constaté"
          type="choix"
          obligatoire
          valeur={bienId}
          surChangement={(v) => {
            setBienId(v)
            const choisi = lignesBiens.find((b) => String(b.id) === String(v))
            // Les champs partent de la fiche : l'agent ne corrige que ce qui
            // diffère réellement. Rien n'est envoyé sans son clic.
            setQuantite(choisi?.quantite === null || choisi?.quantite === undefined ? '' : String(choisi.quantite))
            setEtat(choisi?.etat ?? '')
            setDetenteur(choisi?.detenteur_id ?? '')
            setSite(choisi?.site_id ?? '')
          }}
          options={aConstater.map((b) => ({
            valeur: b.id,
            libelle: `${texte(b.immatriculation)} — ${texte(b.designation)}`,
          }))}
          aide={
            aConstater.length === 0 && !biens.chargement
              ? 'Aucun bien non constaté dans les biens servis : affinez la recherche, ou la campagne a déjà tout couvert.'
              : 'Les biens déjà constatés sur cette campagne sont retirés de la liste : un bien ne se constate qu’une fois.'
          }
        />

        <Champ
          libelle="Résultat du constat"
          type="choix"
          obligatoire
          valeur={resultat}
          surChangement={setResultat}
          options={RESULTATS}
        />

        {resultat === 'introuvable' ? (
          <p className="texte-note sans-marge largeur-propos">
            Un bien introuvable ouvre un écart de nature « introuvable ». La
            fiche n'est pas touchée : seule une décision de perte fera passer le
            bien à l'état « perdu », et il restera au registre — RG-015.
          </p>
        ) : (
          <>
            <Champ
              libelle="Quantité comptée"
              type="number"
              min={0}
              valeur={quantite}
              surChangement={setQuantite}
              aide={
                bien
                  ? `La fiche porte ${nombre(bien.quantite)}. Laissez tel quel si le compte correspond.`
                  : 'Reprise de la fiche du bien dès qu’un bien est choisi.'
              }
            />
            <Champ
              libelle="État constaté"
              type="choix"
              valeur={etat}
              surChangement={setEtat}
              options={ETATS_CONSTATES.map((e) => ({ valeur: e, libelle: libelle(e) }))}
              aide={bien ? `La fiche porte « ${libelle(bien.etat)} ».` : undefined}
            />
            <Champ
              libelle="Détenteur constaté"
              type="choix"
              valeur={detenteur}
              surChangement={setDetenteur}
              options={depouillerListe(profils.donnees).lignes.map((a) => ({
                valeur: a.id,
                libelle: `${texte(a.nom)} — ${texte(a.fonction)}`,
              }))}
              aide={bien ? `La fiche porte « ${texte(bien.detenteur_nom)} ».` : undefined}
            />
            <Champ
              libelle="Site constaté"
              type="choix"
              valeur={site}
              surChangement={setSite}
              options={depouillerListe(sites.donnees).lignes.map((s) => ({
                valeur: s.id,
                libelle: `${texte(s.nom)} — ${texte(s.ville)}`,
              }))}
              aide={bien ? `La fiche porte « ${texte(bien.site_nom)} ».` : undefined}
            />
          </>
        )}

        <Champ
          libelle="Observation"
          type="zone"
          lignes={3}
          valeur={observation}
          surChangement={setObservation}
          aide="Ce que l'opérateur a vu, dit en clair. Conservée au constat et lisible par le contrôle externe."
        />
      </div>

      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé le constat" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Expliquer, puis trancher — RG-025, RG-026                             */
/* --------------------------------------------------------------------- */

function DialogueEcart({ ecart, mode, surFermeture, surSucces }) {
  const [explication, setExplication] = useState('')
  const [decision, setDecision] = useState('')
  const [motif, setMotif] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const expliquer = mode === 'expliquer'
  const effet = DECISIONS.find((d) => d.valeur === decision)?.effet ?? null

  const valide = expliquer
    ? explication.trim().length >= 5
    : decision !== '' && motif.trim().length >= 5

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      if (expliquer) {
        await api.expliquerEcartInventaire(ecart.id, { explication: explication.trim() })
      } else {
        await api.trancherEcartInventaire(ecart.id, {
          decision,
          motif_decision: motif.trim(),
        })
      }
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
      titre={expliquer ? "Expliquer l'écart" : "Trancher l'écart"}
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={expliquer ? MessageSquareQuote : Gavel}
            desactive={!valide || envoi}
            surClic={envoyer}
            titre={
              valide
                ? undefined
                : expliquer
                  ? 'Une explication en clair est attendue.'
                  : 'Une décision et son motif sont attendus.'
            }
          >
            {envoi ? 'Envoi…' : expliquer ? "Porter l'explication" : 'Trancher'}
          </Bouton>
        </>
      }
    >
      <div>
        <Definitions
          entrees={[
            {
              cle: 'Bien',
              valeur: (
                <span className="mono">
                  {texte(ecart.immatriculation)} — {texte(ecart.designation)}
                </span>
              ),
            },
            { cle: 'Nature de l’écart', valeur: libelle(ecart.nature) },
            {
              cle: 'Écart de quantité',
              valeur:
                typeof ecart.ecart_quantite === 'number'
                  ? `${ecart.ecart_quantite > 0 ? '+' : ''}${nombre(ecart.ecart_quantite)}`
                  : '—',
            },
            { cle: 'Statut', valeur: <Pastille valeur={ecart.statut} /> },
            {
              cle: 'Attend depuis',
              valeur:
                typeof ecart.anciennete_jours === 'number' ? jours(ecart.anciennete_jours) : '—',
            },
            ...(expliquer ? [] : [{ cle: 'Explication portée', valeur: texte(ecart.explication) }]),
          ]}
        />
      </div>

      {expliquer ? (
        <>
          <p className="marge-dessus-3 texte-faible largeur-propos">
            Le détenteur atteste les biens qui lui sont affectés — décret 13/050,
            article 122. Son explication est la pièce qui ouvre la décision :
            un écart ne se tranche qu'après elle — RG-025.
          </p>
          <div className="marge-dessus-3">
            <Champ
              libelle="Explication du détenteur"
              type="zone"
              lignes={5}
              obligatoire
              valeur={explication}
              surChangement={setExplication}
              aide="Ce qui explique l'écart, dit en clair. Conservée et lisible par le contrôle externe."
            />
          </div>
        </>
      ) : (
        <>
          <p className="marge-dessus-3 texte-faible largeur-propos">
            Le SIGL ne prononce rien de lui-même : il instruit et produit les
            actes. Qui a constaté l'écart ne le tranche pas — RG-026 — et rien
            ne se tranche avant l'explication du détenteur — RG-025. Le serveur
            vérifie les deux et refuse en le disant.
          </p>
          <div className="marge-dessus-3 pile">
            <Champ
              libelle="Décision"
              type="choix"
              obligatoire
              valeur={decision}
              surChangement={setDecision}
              options={DECISIONS}
            />
            {effet ? <p className="texte-note sans-marge largeur-propos">{effet}</p> : null}
            <Champ
              libelle="Motif de la décision"
              type="zone"
              lignes={4}
              obligatoire
              valeur={motif}
              surChangement={setMotif}
              aide="Obligatoire et conservé, quelle que soit la décision. C'est lui qu'un contrôleur viendra lire."
            />
          </div>
        </>
      )}

      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur
            erreur={erreur}
            titre={expliquer ? "Le serveur a refusé l'explication" : 'Le serveur a refusé la décision'}
          />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Clore la campagne — RG-023, RG-024, vérifiées par le serveur          */
/* --------------------------------------------------------------------- */

function DialogueCloture({ campagne, verdict, surFermeture, surSucces }) {
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.cloreCampagneInventaire(campagne.id)
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
      titre="Clore la campagne d'inventaire"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={Lock}
            desactive={envoi || !verdict.possible}
            titre={verdict.possible ? undefined : verdict.motif ?? undefined}
            surClic={envoyer}
          >
            {envoi ? 'Envoi…' : 'Clore'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        Une campagne ne se clôt pas tant qu'un bien de son périmètre n'a pas été
        constaté — RG-023 — ni sur un écart non tranché — RG-024. Les deux règles
        sont tenues par le serveur ; ce que l'écran affiche ici est son verdict.
      </p>
      <p className="marge-dessus-3 sans-marge largeur-propos">
        {verdict.possible
          ? 'Le serveur annonce la clôture possible.'
          : verdict.motif}
      </p>
      <div className="marge-dessus-3">
        <Definitions
          entrees={[
            { cle: 'Campagne', valeur: <span className="mono">{texte(campagne.numero)}</span> },
            { cle: 'Libellé', valeur: texte(campagne.libelle) },
            { cle: 'Date arrêtée', valeur: dateEnClair(campagne.date_arretee) },
          ]}
        />
      </div>
      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé la clôture" />
        </div>
      ) : null}
    </Dialogue>
  )
}
