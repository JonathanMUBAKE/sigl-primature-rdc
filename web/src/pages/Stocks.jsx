import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { RefreshCw, SlidersHorizontal } from 'lucide-react'
import Page from '../components/Page.jsx'
import Bento, { Bloc } from '../components/Bento.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import Bouton from '../components/Bouton.jsx'
import Chiffre, { RangeeChiffres } from '../components/Chiffre.jsx'
import { Etat } from '../components/Vide.jsx'
import SeuilsStock from './SeuilsStock.jsx'
import api from '../lib/api.js'
import { useRequete } from '../lib/requete.js'
import { useFlux, useMarquage } from '../lib/flux.js'
import { date, horodatage, jours, libelle, nombre, texte } from '../lib/format.js'

/*
  Les stocks. GET /api/stocks ?site=&structure=&categorie=&q=&sous_seuil=
  &sous_critique=&rupture=&tri=

  L'écran le plus vivant du SIGL : le serveur trie déjà par criticité, les
  mouvements arrivent en direct par le flux, et chaque ligne dit combien de
  jours elle tient encore et quand la rupture est prévue.

  Les champs viennent du serveur tels quels : `criticite`, `jours_couverture`,
  `date_rupture_prevue`, `consommation_jour`. L'enveloppe porte un `resume`.
  Rien n'est recalculé ici.
*/

const CRITICITES = [
  { valeur: 'rupture', libelle: 'En rupture', parametre: 'rupture' },
  { valeur: 'sous_critique', libelle: 'Sous le seuil critique', parametre: 'sous_critique' },
  { valeur: 'sous_seuil', libelle: 'Sous le seuil minimum', parametre: 'sous_seuil' },
]

export default function Stocks() {
  const [params, setParams] = useSearchParams()
  const navigue = useNavigate()
  const { id: articleOuvert } = useParams()
  const q = params.get('q') ?? ''
  const site = params.get('site') ?? ''
  const tension = params.get('tension') ?? ''

  function poser(cle, valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, valeur)
    else prochain.delete(cle)
    setParams(prochain, { replace: true })
  }

  // Le serveur n'accepte que ses propres paramètres : on ne lui en envoie pas d'autres.
  const critere = CRITICITES.find((c) => c.valeur === tension)
  const { donnees, chargement, erreur, recharger } = useRequete(
    (o) =>
      api.stocks(
        {
          q: q || undefined,
          site: site || undefined,
          tri: 'criticite',
          ...(critere ? { [critere.parametre]: true } : {}),
        },
        o,
      ),
    [q, site, tension],
  )

  const lignes = Array.isArray(donnees?.donnees) ? donnees.donnees : []
  const total = donnees?.total ?? lignes.length
  const resume = donnees?.resume ?? {}

  // Les mouvements reçus en direct, dans l'ordre d'arrivée.
  const { marquer, estMarque } = useMarquage()
  const [mouvementsVivants, setMouvementsVivants] = useState([])
  useFlux(['stocks', 'patrimoine'], (evenement) => {
    marquer(evenement.id)
    setMouvementsVivants((anciens) => [evenement, ...anciens].slice(0, 10))
    recharger()
  })

  const sites = useMemo(() => {
    const vus = new Map()
    for (const l of lignes) if (l.site_id && !vus.has(l.site_id)) vus.set(l.site_id, l.site_nom)
    return [...vus.entries()].map(([valeur, libelleSite]) => ({ valeur, libelle: libelleSite }))
  }, [lignes])

  const colonnes = useMemo(
    () => [
      {
        cle: 'criticite',
        titre: 'Tension',
        rendu: (l) => <Pastille valeur={l.criticite} />,
      },
      {
        cle: 'designation',
        titre: 'Article',
        rendu: (l) => (
          <span className="cellule-deux-lignes">
            <span>{texte(l.designation ?? l.categorie_libelle)}</span>
            <span className="texte-note">
              {texte(l.categorie_libelle)} · {texte(l.site_nom)}
            </span>
          </span>
        ),
      },
      {
        cle: 'quantite',
        titre: 'En stock',
        nombre: true,
        valeur: (l) => Number(l.quantite ?? 0),
        rendu: (l) => (
          <>
            {nombre(l.quantite)} <span className="texte-note">{texte(l.unite)}</span>
          </>
        ),
      },
      {
        cle: 'seuil_minimum',
        titre: 'Seuil min.',
        nombre: true,
        valeur: (l) => Number(l.seuil_minimum ?? 0),
        rendu: (l) => <span className="cellule-faible">{nombre(l.seuil_minimum)}</span>,
      },
      {
        cle: 'seuil_critique',
        titre: 'Seuil crit.',
        nombre: true,
        valeur: (l) => Number(l.seuil_critique ?? 0),
        rendu: (l) => <span className="cellule-faible">{nombre(l.seuil_critique)}</span>,
      },
      {
        cle: 'consommation_jour',
        titre: 'Conso. / jour',
        nombre: true,
        valeur: (l) => Number(l.consommation_jour ?? 0),
        rendu: (l) => <span className="cellule-faible">{nombre(l.consommation_jour)}</span>,
      },
      {
        cle: 'jours_couverture',
        titre: 'Couverture',
        nombre: true,
        valeur: (l) =>
          l.jours_couverture === null || l.jours_couverture === undefined
            ? Number.MAX_SAFE_INTEGER
            : Number(l.jours_couverture),
        rendu: (l) =>
          l.jours_couverture === null || l.jours_couverture === undefined
            ? '—'
            : jours(l.jours_couverture),
      },
      {
        cle: 'date_rupture_prevue',
        titre: 'Rupture prévue',
        nombre: true,
        rendu: (l) => date(l.date_rupture_prevue),
      },
      {
        cle: 'seuils',
        titre: 'Seuils',
        triable: false,
        rendu: (l) => (
          <Bouton
            taille="petite"
            icone={SlidersHorizontal}
            vers={`/stocks/${l.id}${window.location.search}`}
            titre="Régler le seuil minimum et le seuil critique de cet article"
          >
            Régler
          </Bouton>
        ),
      },
    ],
    [],
  )

  return (
    <Page
      titre="Stocks"
      sousTitre="Triés par criticité : ce qui manque d'abord, la couverture restante, la rupture prévisible"
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Stocks' }]}
      actions={
        <Bouton icone={RefreshCw} surClic={recharger}>
          Actualiser
        </Bouton>
      }
    >
      <Bento>
        <Bloc
          large={12}
          titre="L'état des stocks"
          note={
            resume.fenetre_consommation_jours
              ? `Consommation observée sur ${jours(resume.fenetre_consommation_jours)}`
              : undefined
          }
        >
          <RangeeChiffres>
            <Chiffre valeur={total} libelle="Articles suivis" vers="/stocks" />
            <Chiffre
              valeur={resume.en_rupture}
              libelle="En rupture"
              vers="/stocks?tension=rupture"
              ton="critique"
            />
            <Chiffre
              valeur={resume.sous_critique}
              libelle="Sous le seuil critique"
              vers="/stocks?tension=sous_critique"
              ton="critique"
            />
            <Chiffre
              valeur={resume.sous_minimum}
              libelle="Sous le seuil minimum"
              vers="/stocks?tension=sous_seuil"
              ton="attente"
            />
            <Chiffre
              valeur={resume.rupture_sous_30_jours}
              libelle="Rupture sous 30 jours"
              ton="attente"
            />
          </RangeeChiffres>
        </Bloc>
      </Bento>

      <Filtres
        total={erreur || chargement ? undefined : lignes.length}
        nom="article"
        note={
          typeof resume.sous_critique === 'number' && resume.sous_critique > 0
            ? `${nombre(resume.sous_critique)} sous le seuil critique`
            : undefined
        }
      >
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Article, désignation, code de catégorie…"
        />
        <Filtre
          libelle="Site"
          valeur={site}
          surChangement={(v) => poser('site', v)}
          options={sites}
          toutes="Tous les sites"
        />
        <Filtre
          libelle="Tension"
          valeur={tension}
          surChangement={(v) => poser('tension', v)}
          options={CRITICITES}
          toutes="Tous les articles"
        />
      </Filtres>

      <Etat
        chargement={chargement}
        erreur={erreur}
        recharger={recharger}
        texteChargement="Lecture des stocks…"
      >
        <Tableau
          colonnes={colonnes}
          lignes={lignes}
          cleDeLigne={(l, i) => l.id ?? `${l.categorie_code}-${i}`}
          surClic={(l) => (l.id ? navigue(`/stocks/${l.id}${window.location.search}`) : undefined)}
          ligneChoisie={(l) => l.id === articleOuvert}
          ligneSignalee={(l) => ['rupture', 'critique', 'sous_critique'].includes(l.criticite)}
          ligneMarquee={(l) => estMarque(l.id)}
          nomDesLignes="article"
          titreVide="Aucun article de stock"
          texteVide={
            q || site || tension
              ? 'Aucun article ne répond à ces critères. Retirez un filtre pour voir le reste.'
              : "Aucun article n'est suivi en stock pour votre périmètre. Une structure ne lit que ses propres données — RG-017."
          }
          pied={`${nombre(lignes.length)} article(s) affiché(s) sur ${nombre(total)} · ouvrez une ligne pour régler ses seuils`}
        />
      </Etat>

      {articleOuvert ? (
        <SeuilsStock
          id={articleOuvert}
          fenetreJours={resume.fenetre_consommation_jours}
          surFermeture={() => navigue(`/stocks${window.location.search}`)}
          surEnregistrement={recharger}
        />
      ) : null}

      {mouvementsVivants.length > 0 ? (
        <div className="marge-dessus-5">
          <h2 className="section-titre">Mouvements reçus en direct</h2>
          <div className="marge-dessus-3">
            <Tableau
              lignes={mouvementsVivants}
              cleDeLigne={(m, i) => `${m.recu_le}-${i}`}
              nomDesLignes="mouvement reçu"
              nomDesLignesPluriel="mouvements reçus"
              colonnes={[
                {
                  cle: 'recu_le',
                  titre: 'Reçu à',
                  nombre: true,
                  rendu: (m) => horodatage(m.recu_le),
                },
                { cle: 'sujet', titre: 'Sujet', rendu: (m) => libelle(m.sujet) },
                { cle: 'type', titre: 'Nature', rendu: (m) => libelle(m.type) },
                {
                  cle: 'id',
                  titre: 'Objet',
                  rendu: (m) => <span className="mono cellule-faible">{texte(m.id)}</span>,
                },
              ]}
            />
          </div>
        </div>
      ) : null}
    </Page>
  )
}
