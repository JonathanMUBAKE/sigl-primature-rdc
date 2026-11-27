import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardCheck, Plus, RefreshCw } from 'lucide-react'
import Page from '../components/Page.jsx'
import Bento, { Bloc } from '../components/Bento.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import Bouton from '../components/Bouton.jsx'
import Champ from '../components/Champ.jsx'
import Chiffre, { RangeeChiffres } from '../components/Chiffre.jsx'
import Dialogue from '../components/Dialogue.jsx'
import Vide, { Erreur, Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { depouillerListe, useRequete } from '../lib/requete.js'
import { useRoles } from '../lib/agent.jsx'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { lienUi } from '../lib/liens.js'
import { date, jours, nombre, pourcentage, texte } from '../lib/format.js'
import {
  ACTEURS,
  attendDepuisTropLongtemps,
  avancementDe,
  estEnAttente,
  fileDAttente,
  tacheDeLEcart,
  tacheDeLaCampagne,
} from '../lib/inventaire.js'

/*
  L'inventaire physique — décret 13/050, article 120 : « des inventaires et
  comptes d'emplois sont établis à dates fixes ».

  Ce n'est pas un rapport : c'est l'entrée d'un poste de travail. En tête,
  ce qui attend, les plus vieilles attentes d'abord, avec le nom de celui qui
  doit agir. Puis la liste des campagnes, chacune menant à son poste.

  Rien n'est recalculé ici. L'avancement et le verdict de clôture viennent du
  serveur ; les écarts non tranchés sont comptés sur la liste que le serveur
  sert à `GET /api/ecarts-inventaire`, filtrée par son propre périmètre de
  lecture — RG-017. Un compte peut donc être plus court que la réalité d'une
  autre structure, et l'écran le dit.
*/

const STATUTS = [
  { valeur: 'preparee', libelle: 'Préparée' },
  { valeur: 'en_cours', libelle: 'En cours' },
  { valeur: 'close', libelle: 'Close' },
]

const ROLES_DE_PREPARATION = ['comptable_matieres', 'logistique']

export default function Inventaire() {
  const [params, setParams] = useSearchParams()
  const navigue = useNavigate()
  const { aLeRole } = useRoles()

  const q = params.get('q') ?? ''
  const statut = params.get('statut') ?? ''
  const structure = params.get('structure') ?? ''

  function poser(cle, valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, valeur)
    else prochain.delete(cle)
    setParams(prochain, { replace: true })
  }

  const campagnes = useRequete(
    (o) => api.campagnesInventaire({ statut, structure, parPage: 200 }, o),
    [statut, structure],
  )
  // Les écarts de tout le périmètre : ils nourrissent la file d'attente et la
  // colonne « écarts non tranchés ». Le serveur les sert déjà filtrés.
  const ecarts = useRequete((o) => api.ecartsInventaire({ structure, parPage: 200 }, o), [structure])
  const structures = useRequete((o) => api.structures(null, o), [])

  const [creation, setCreation] = useState(false)

  const recharger = () => {
    campagnes.recharger()
    ecarts.recharger()
  }

  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant(['inventaire', 'rapprochement'], recharger, marquer)

  const lignesCampagnes = depouillerListe(campagnes.donnees).lignes
  const lignesEcarts = depouillerListe(ecarts.donnees).lignes
  const listeStructures = depouillerListe(structures.donnees).lignes

  // Les écarts, rangés par campagne. Le serveur porte `campagne_id` sur chaque
  // ligne d'écart : c'est par lui que la route se filtre.
  const ecartsParCampagne = useMemo(() => {
    const table = new Map()
    for (const ecart of lignesEcarts) {
      const cle = String(ecart.campagne_id ?? ecart.campagne ?? '')
      if (!cle) continue
      if (!table.has(cle)) table.set(cle, [])
      table.get(cle).push(ecart)
    }
    return table
  }, [lignesEcarts])

  const enrichies = useMemo(
    () =>
      lignesCampagnes.map((campagne) => {
        const siens = ecartsParCampagne.get(String(campagne.id)) ?? []
        return {
          ...campagne,
          _ecarts: siens,
          _enAttente: siens.filter(estEnAttente).length,
          _avancement: avancementDe(campagne),
          _tache: tacheDeLaCampagne(campagne, siens),
        }
      }),
    [lignesCampagnes, ecartsParCampagne],
  )

  const filtrees = useMemo(() => {
    const motif = q.trim().toLocaleLowerCase('fr')
    if (!motif) return enrichies
    return enrichies.filter((c) =>
      [c.numero, c.libelle, c.structure_nom, c.site_nom]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase('fr').includes(motif)),
    )
  }, [enrichies, q])

  const attente = useMemo(() => fileDAttente(lignesEcarts), [lignesEcarts])

  // Sans réponse du serveur, il n'y a pas de chiffre : on montre un tiret, pas
  // un zéro. Un zéro inventé se lirait comme un fait.
  const sansCampagnes = campagnes.chargement || Boolean(campagnes.erreur)
  const sansEcarts = ecarts.chargement || Boolean(ecarts.erreur)

  const resume = useMemo(
    () => ({
      total: sansCampagnes ? null : enrichies.length,
      preparees: sansCampagnes ? null : enrichies.filter((c) => c.statut === 'preparee').length,
      en_cours: sansCampagnes ? null : enrichies.filter((c) => c.statut === 'en_cours').length,
      closes: sansCampagnes ? null : enrichies.filter((c) => c.statut === 'close').length,
      a_expliquer: sansEcarts ? null : lignesEcarts.filter((e) => e.statut === 'constate').length,
      a_trancher: sansEcarts ? null : lignesEcarts.filter((e) => e.statut === 'explique').length,
    }),
    [enrichies, lignesEcarts, sansCampagnes, sansEcarts],
  )

  const peutPreparer = aLeRole(...ROLES_DE_PREPARATION)
  const raisonCreation = peutPreparer
    ? null
    : `La préparation d'une campagne d'inventaire revient au comptable des matières. ${ACTEURS.preparation}.`

  const nomDeLaStructure = (id) =>
    listeStructures.find((s) => String(s.id) === String(id))?.nom ?? null

  const colonnes = useMemo(
    () => [
      {
        cle: 'numero',
        titre: 'Campagne',
        largeur: '17%',
        rendu: (c) => (
          <span className="cellule-deux-lignes">
            <span className="mono">{texte(c.numero)}</span>
            <span className="texte-note">{texte(c.libelle)}</span>
          </span>
        ),
      },
      {
        cle: 'structure_nom',
        titre: 'Structure',
        largeur: '16%',
        valeur: (c) => c.structure_nom ?? nomDeLaStructure(c.structure_id) ?? '',
        rendu: (c) => (
          <span className="cellule-deux-lignes">
            <span>{texte(c.structure_nom ?? nomDeLaStructure(c.structure_id))}</span>
            <span className="texte-note">{texte(c.site_nom) === '—' ? 'Tous les sites' : texte(c.site_nom)}</span>
          </span>
        ),
      },
      {
        cle: 'date_arretee',
        titre: 'Date arrêtée',
        largeur: '10%',
        valeur: (c) => c.date_arretee ?? '',
        rendu: (c) => date(c.date_arretee),
      },
      {
        cle: 'statut',
        titre: 'Statut',
        largeur: '9%',
        rendu: (c) => <Pastille valeur={c.statut} />,
      },
      {
        cle: 'avancement',
        titre: 'Avancement',
        largeur: '13%',
        valeur: (c) => (typeof c._avancement?.taux === 'number' ? c._avancement.taux : -1),
        rendu: (c) => <Avancement avancement={c._avancement} />,
      },
      {
        cle: 'ecarts',
        titre: 'Écarts non tranchés',
        nombre: true,
        largeur: '10%',
        valeur: (c) => c._enAttente,
        // Tant que la liste des écarts n'est pas servie, la colonne ne dit pas
        // « aucun » : elle ne sait pas. Un zéro inventé pendant une seconde se
        // lit comme une campagne saine, et c'est la faute que ce chantier a
        // déjà payée trois fois.
        rendu: (c) =>
          sansEcarts ? (
            <span className="texte-note">—</span>
          ) : c._enAttente === 0 ? (
            <span className="texte-note">aucun</span>
          ) : (
            <Link to={`/inventaire/${c.id}`}>{nombre(c._enAttente)}</Link>
          ),
      },
      {
        cle: 'tache',
        titre: 'Ce qui attend, et qui doit agir',
        largeur: '25%',
        triable: false,
        rendu: (c) => (
          <span className="cellule-deux-lignes">
            <span>{c._tache.quoi}</span>
            <span className="texte-note">{c._tache.acteur ?? '—'}</span>
          </span>
        ),
      },
    ],
    [listeStructures, sansEcarts],
  )

  return (
    <Page
      titre="Inventaire physique"
      sousTitre="Des inventaires et comptes d'emplois établis à dates fixes — décret 13/050, article 120. Le détenteur atteste les biens qui lui sont affectés — article 122."
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Inventaire' }]}
      actions={
        <>
          <Bouton icone={RefreshCw} surClic={recharger}>
            Actualiser
          </Bouton>
          <Bouton
            allure="principale"
            icone={Plus}
            desactive={Boolean(raisonCreation)}
            titre={raisonCreation ?? undefined}
            surClic={() => setCreation(true)}
          >
            Ouvrir une campagne
          </Bouton>
        </>
      }
    >
      <Bento>
        <Bloc
          large={12}
          titre="Ce qui attend"
          note="Les plus vieilles attentes d'abord — l'ancienneté est celle du serveur"
        >
          <RangeeChiffres>
            <Chiffre valeur={resume.total} libelle="Campagnes" vers="/inventaire" />
            <Chiffre
              valeur={resume.preparees}
              libelle="Préparées, pas encore ouvertes"
              vers="/inventaire?statut=preparee"
              ton={resume.preparees > 0 ? 'attente' : undefined}
            />
            <Chiffre
              valeur={resume.en_cours}
              libelle="En cours"
              vers="/inventaire?statut=en_cours"
              ton={resume.en_cours > 0 ? 'attente' : undefined}
            />
            <Chiffre
              valeur={resume.a_expliquer}
              libelle="Écarts à expliquer"
              appui={ACTEURS.explication}
              ton={resume.a_expliquer > 0 ? 'critique' : undefined}
            />
            <Chiffre
              valeur={resume.a_trancher}
              libelle="Écarts à trancher"
              appui={ACTEURS.decision}
              ton={resume.a_trancher > 0 ? 'attente' : undefined}
            />
            <Chiffre
              valeur={resume.closes}
              libelle="Campagnes closes"
              vers="/inventaire?statut=close"
              ton={resume.closes > 0 ? 'succes' : undefined}
            />
          </RangeeChiffres>

          <div className="marge-dessus-5">
            {ecarts.erreur ? (
              <Erreur
                erreur={ecarts.erreur}
                surReessai={ecarts.recharger}
                titre="La file des écarts n'a pas pu être lue"
              />
            ) : ecarts.chargement ? (
              <p className="texte-faible sans-marge">Lecture des écarts en attente…</p>
            ) : attente.length === 0 ? (
              <Vide
                titre="Aucun écart n'attend"
                texte="Aucun écart d'inventaire n'attend d'explication ni de décision dans votre périmètre de lecture. C'est l'état normal entre deux campagnes : un écart naît d'un constat qui diffère de la fiche du bien."
              />
            ) : (
              <FileDAttente ecarts={attente} estMarque={estMarque} />
            )}
          </div>
        </Bloc>
      </Bento>

      <Filtres
        total={campagnes.erreur || campagnes.chargement ? undefined : filtrees.length}
        nom="campagne"
        nomPluriel="campagnes"
        note={
          resume.a_expliquer > 0
            ? `${nombre(resume.a_expliquer)} écart(s) attendent encore le détenteur`
            : undefined
        }
      >
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Numéro, libellé, structure, site…"
        />
        <Filtre
          libelle="Statut"
          valeur={statut}
          surChangement={(v) => poser('statut', v)}
          options={STATUTS}
          toutes="Tous les statuts"
        />
        <Filtre
          libelle="Structure"
          valeur={structure}
          surChangement={(v) => poser('structure', v)}
          options={listeStructures.map((s) => ({ valeur: s.id, libelle: s.nom }))}
          toutes="Toutes les structures"
        />
      </Filtres>

      <Etat
        chargement={campagnes.chargement}
        erreur={campagnes.erreur}
        recharger={recharger}
        texteChargement="Lecture des campagnes d'inventaire…"
      >
        <Tableau
          colonnes={colonnes}
          lignes={filtrees}
          nomDesLignes="campagne"
          nomDesLignesPluriel="campagnes"
          triInitial={{ cle: 'date_arretee', sens: 'desc' }}
          surClic={(c) => navigue(`/inventaire/${c.id}`)}
          ligneSignalee={(c) => c._ecarts.some(attendDepuisTropLongtemps)}
          ligneMarquee={(c) => estMarque(c.id)}
          titreVide="Aucune campagne d'inventaire"
          texteVide={
            q || statut || structure
              ? "Aucune campagne ne répond à ces critères. Retirez un filtre pour voir le reste."
              : "Aucune campagne d'inventaire n'existe pour votre périmètre. L'article 120 du décret 13/050 veut un inventaire à date fixe : préparez-en une, désignez ses agents, puis ouvrez-la."
          }
          actionVide={
            peutPreparer ? (
              <Bouton allure="principale" icone={Plus} surClic={() => setCreation(true)}>
                Ouvrir une campagne
              </Bouton>
            ) : (
              <span className="texte-note">{raisonCreation}</span>
            )
          }
          pied={`${nombre(filtrees.length)} campagne(s) affichée(s) · les lignes signalées portent un écart qui attend depuis dix jours ou plus`}
        />
        <p className="marge-dessus-3 texte-note largeur-propos">
          L'avancement et le verdict de clôture sont calculés par le serveur :
          cet écran les affiche, il ne les refait pas. Les écarts comptés ici
          sont ceux que le serveur vous sert — une structure ne lit que ses
          propres données, RG-017 — et le poste de travail d'une campagne en
          montre le détail.
        </p>
      </Etat>

      {creation ? (
        <DialogueCampagne
          structures={listeStructures}
          surFermeture={() => setCreation(false)}
          surSucces={(campagne) => {
            setCreation(false)
            recharger()
            if (campagne?.id) navigue(`/inventaire/${campagne.id}`)
          }}
        />
      ) : null}
    </Page>
  )
}

/* --------------------------------------------------------------------- */
/* L'avancement, tel que le serveur le rend                              */
/* --------------------------------------------------------------------- */

export function Avancement({ avancement, dense = true }) {
  if (!avancement) {
    return <span className="texte-note">non servi</span>
  }
  /*
    Le serveur rend `taux` comme une PROPORTION entre 0 et 1, arrondie au
    dix-millième — « 0,4412 » pour 15 biens constatés sur 34. L'écran la met
    en forme en pourcentage : c'est une mise en forme, pas un calcul. La part
    est bornée à [0, 100] pour que la jauge ne déborde jamais du filet.
  */
  const taux = typeof avancement.taux === 'number' ? avancement.taux : null
  const centiemes = taux === null ? null : Math.max(0, Math.min(100, taux * 100))
  const dit = centiemes === null ? null : pourcentage(centiemes)
  return (
    <span className="cellule-deux-lignes">
      <span
        className="jauge"
        role="img"
        aria-label={dit === null ? 'Avancement non servi' : `Avancement ${dit}`}
      >
        <span className="jauge-barre" style={{ width: `${centiemes ?? 0}%` }} />
      </span>
      <span className="texte-note">
        {dit ?? 'taux non servi'}
        {dense &&
        typeof avancement.constates === 'number' &&
        typeof avancement.biens_du_perimetre === 'number'
          ? ` · ${nombre(avancement.constates)} / ${nombre(avancement.biens_du_perimetre)} constatés`
          : ''}
      </span>
    </span>
  )
}

/* --------------------------------------------------------------------- */
/* La file d'attente : ce qu'un agent doit faire, le plus vieux d'abord  */
/* --------------------------------------------------------------------- */

function FileDAttente({ ecarts, estMarque }) {
  const navigue = useNavigate()
  return (
    <Tableau
      lignes={ecarts}
      nomDesLignes="écart en attente"
      nomDesLignesPluriel="écarts en attente"
      triInitial={{ cle: 'anciennete_jours', sens: 'desc' }}
      surClic={(e) =>
        navigue(lienUi(e.lien) ?? (e.campagne_id ? `/inventaire/${e.campagne_id}` : '/inventaire'))
      }
      ligneSignalee={attendDepuisTropLongtemps}
      ligneMarquee={(e) => estMarque?.(e.id)}
      colonnes={[
        {
          cle: 'anciennete_jours',
          titre: 'Attend depuis',
          nombre: true,
          largeur: '11%',
          valeur: (e) => (typeof e.anciennete_jours === 'number' ? e.anciennete_jours : -1),
          rendu: (e) =>
            typeof e.anciennete_jours === 'number' ? (
              jours(e.anciennete_jours)
            ) : (
              <span className="texte-note">non servie</span>
            ),
        },
        {
          cle: 'immatriculation',
          titre: 'Bien',
          largeur: '22%',
          rendu: (e) => (
            <span className="cellule-deux-lignes">
              <span className="mono">{texte(e.immatriculation)}</span>
              <span className="texte-note">{texte(e.designation)}</span>
            </span>
          ),
        },
        {
          cle: 'nature',
          titre: 'Nature de l’écart',
          largeur: '14%',
          rendu: (e) => (
            <span className="cellule-deux-lignes">
              <span>{texte(e.nature) === '—' ? '—' : natureEnClair(e)}</span>
              <span className="texte-note">
                {typeof e.ecart_quantite === 'number' && e.ecart_quantite !== 0
                  ? `${e.ecart_quantite > 0 ? '+' : '−'}${nombre(Math.abs(e.ecart_quantite))} unité(s)`
                  : texte(e.campagne_numero) === '—'
                    ? ''
                    : texte(e.campagne_numero)}
              </span>
            </span>
          ),
        },
        {
          cle: 'statut',
          titre: 'Statut',
          largeur: '11%',
          rendu: (e) => {
            const tache = tacheDeLEcart(e)
            return <Pastille valeur={e.statut} ton={tache?.ton} />
          },
        },
        {
          cle: 'tache',
          titre: 'Ce qui attend, et qui doit agir',
          largeur: '42%',
          triable: false,
          rendu: (e) => {
            const tache = tacheDeLEcart(e)
            if (!tache) return <span className="texte-note">Rien : l’écart est tranché.</span>
            return (
              <span className="cellule-deux-lignes">
                <span>{tache.quoi}</span>
                <span className="texte-note">
                  {tache.acteur} · {tache.regle}
                </span>
              </span>
            )
          },
        },
      ]}
      pied={`${nombre(ecarts.length)} écart(s) en attente · les lignes signalées attendent depuis dix jours ou plus`}
    />
  )
}

/** La nature dite en français, avec la quantité quand elle est en cause. */
function natureEnClair(ecart) {
  const dits = {
    quantite: 'Quantité',
    etat: 'État constaté',
    detenteur: 'Détenteur',
    localisation: 'Localisation',
    introuvable: 'Bien introuvable',
  }
  return dits[String(ecart.nature)] ?? texte(ecart.nature)
}

/* --------------------------------------------------------------------- */
/* Préparer une campagne — POST /api/campagnes-inventaire                */
/* --------------------------------------------------------------------- */

function DialogueCampagne({ structures, surFermeture, surSucces }) {
  const [libelle, setLibelle] = useState('')
  const [structureId, setStructureId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [dateArretee, setDateArretee] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const sites = useRequete(
    (o) => (structureId ? api.sites({ structure: structureId }, o) : Promise.resolve(null)),
    [structureId],
  )
  const listeSites = depouillerListe(sites.donnees).lignes

  const valide = libelle.trim().length >= 3 && structureId !== '' && dateArretee !== ''

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      const reponse = await api.creerCampagneInventaire({
        libelle: libelle.trim(),
        structure_id: structureId,
        ...(siteId ? { site_id: siteId } : {}),
        date_arretee: dateArretee,
      })
      surSucces(reponse?.campagne ?? reponse)
    } catch (cause) {
      setErreur(cause)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialogue
      ouvert
      titre="Ouvrir une campagne d'inventaire"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={ClipboardCheck}
            desactive={!valide || envoi}
            surClic={envoyer}
            titre={valide ? undefined : 'Un libellé, une structure et une date arrêtée sont nécessaires.'}
          >
            {envoi ? 'Envoi…' : 'Préparer la campagne'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        La campagne naît <strong>préparée</strong> : elle ne compte encore aucun
        constat. Le poste de travail s'ouvre ensuite, pour désigner les agents —
        opérateurs, détenteurs, témoins — puis ouvrir la campagne. La date
        arrêtée est celle à laquelle l'inventaire est arrêté, au sens de
        l'article 120 du décret 13/050.
      </p>

      <div className="marge-dessus-3 pile largeur-formulaire">
        <Champ
          libelle="Libellé de la campagne"
          obligatoire
          valeur={libelle}
          surChangement={setLibelle}
          placeholder="Inventaire annuel des immobilisations"
          aide="Ce que la campagne couvre, dit en clair. Le numéro, lui, est attribué par le serveur."
        />
        <Champ
          libelle="Structure inventoriée"
          type="choix"
          obligatoire
          valeur={structureId}
          surChangement={(v) => {
            setStructureId(v)
            setSiteId('')
          }}
          options={structures.map((s) => ({ valeur: s.id, libelle: `${s.code} — ${s.nom}` }))}
          aide="Le serveur refuse une écriture hors de votre périmètre — RG-018."
        />
        <Champ
          libelle="Site (facultatif)"
          type="choix"
          valeur={siteId}
          surChangement={setSiteId}
          options={listeSites.map((s) => ({ valeur: s.id, libelle: `${s.nom} — ${s.ville ?? ''}`.trim() }))}
          desactive={!structureId || sites.chargement}
          aide={
            !structureId
              ? 'Choisissez d’abord une structure.'
              : 'Sans site, la campagne couvre tous les sites de la structure.'
          }
        />
        <Champ
          libelle="Date arrêtée"
          type="date"
          obligatoire
          valeur={dateArretee}
          surChangement={setDateArretee}
          aide="La date à laquelle l'inventaire est arrêté — décret 13/050, article 120."
        />
      </div>

      {sites.erreur ? (
        <div className="marge-dessus-3">
          <Erreur
            erreur={sites.erreur}
            surReessai={sites.recharger}
            titre="Les sites n'ont pas pu être lus"
          />
        </div>
      ) : null}

      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé la campagne" />
        </div>
      ) : null}
    </Dialogue>
  )
}
