import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import Page, { Section } from '../components/Page.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import Bouton from '../components/Bouton.jsx'
import { Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { useFlux, useMarquage } from '../lib/flux.js'
import { date, horodatage, jours, libelle, nombre, texte } from '../lib/format.js'

/*
  Les stocks, par article et par site. GET /api/stocks ?site=&sous_seuil=

  L'écran le plus vivant du SIGL : les mouvements arrivent en direct par le
  flux, les articles sous seuil passent en tête, et chaque ligne dit combien
  de jours elle tient encore et quand la rupture est prévue.

  Les jours de couverture et la date de rupture viennent du serveur
  (`jours_de_couverture`, `rupture_le`, `consommation_jour`). S'il ne les
  fournit pas, l'écran les déduit de la consommation journalière quand elle
  est connue — et sinon affiche « — » : rien n'est inventé.
*/

function tension(ligne) {
  const quantite = Number(ligne.quantite ?? 0)
  const critique = Number(ligne.seuil_critique ?? 0)
  const minimum = Number(ligne.seuil_minimum ?? 0)
  if (quantite <= 0) return { rang: 0, ton: 'critique', texte: 'Rupture' }
  if (critique > 0 && quantite <= critique)
    return { rang: 1, ton: 'critique', texte: 'Sous le seuil critique' }
  if (minimum > 0 && quantite <= minimum)
    return { rang: 2, ton: 'attente', texte: 'Sous le seuil minimum' }
  return { rang: 3, ton: 'succes', texte: 'Suffisant' }
}

/** La couverture restante, en jours, telle que le serveur la donne ou la déduit. */
function couverture(ligne) {
  if (typeof ligne.jours_de_couverture === 'number') return ligne.jours_de_couverture
  const consommation = Number(ligne.consommation_jour ?? 0)
  const quantite = Number(ligne.quantite ?? 0)
  if (consommation > 0) return Math.floor(quantite / consommation)
  return null
}

export default function Stocks() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const site = params.get('site') ?? ''
  const sousSeuil = params.get('sous_seuil') ?? ''
  const horizon = params.get('horizon') ?? ''

  function poser(cle, valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, valeur)
    else prochain.delete(cle)
    setParams(prochain, { replace: true })
  }

  const { donnees, chargement, erreur, recharger } = useRequete(
    (o) => api.stocks({ site, sous_seuil: sousSeuil || undefined, horizon: horizon || undefined }, o),
    [site, sousSeuil, horizon],
  )
  const { lignes, total } = depouillerListe(donnees)

  // Les mouvements reçus en direct, dans l'ordre d'arrivée.
  const { marquer, estMarque } = useMarquage()
  const [mouvementsVivants, setMouvementsVivants] = useState([])
  useFlux(['stocks', 'patrimoine'], (evenement) => {
    marquer(evenement.id)
    marquer(evenement.donnees?.categorie_code)
    setMouvementsVivants((anciens) => [evenement, ...anciens].slice(0, 12))
    recharger()
  })

  const filtrees = useMemo(() => {
    const motif = q.trim().toLocaleLowerCase('fr')
    let retenues = motif
      ? lignes.filter((l) =>
          [l.categorie_libelle, l.categorie_code, l.site_nom]
            .filter(Boolean)
            .some((v) => String(v).toLocaleLowerCase('fr').includes(motif)),
        )
      : lignes

    if (horizon) {
      const borne = Number(horizon)
      retenues = retenues.filter((l) => {
        const c = couverture(l)
        return c !== null && c <= borne
      })
    }

    // Les articles sous seuil en tête, puis la couverture la plus courte.
    return [...retenues].sort((a, b) => {
      const ta = tension(a)
      const tb = tension(b)
      if (ta.rang !== tb.rang) return ta.rang - tb.rang
      const ca = couverture(a)
      const cb = couverture(b)
      if (ca !== null && cb !== null && ca !== cb) return ca - cb
      return Number(a.quantite ?? 0) - Number(b.quantite ?? 0)
    })
  }, [lignes, q, horizon])

  const enTension = filtrees.filter((l) => tension(l).rang <= 2).length
  const sites = useMemo(
    () => [...new Set(lignes.map((l) => l.site_id).filter(Boolean))],
    [lignes],
  )

  const colonnes = useMemo(
    () => [
      {
        cle: 'tension',
        titre: 'Tension',
        triable: false,
        rendu: (l) => {
          const t = tension(l)
          return <Pastille ton={t.ton} texte={t.texte} valeur={t.texte} />
        },
      },
      {
        cle: 'categorie_libelle',
        titre: 'Article',
        rendu: (l) => texte(l.categorie_libelle ?? l.categorie_code),
      },
      {
        cle: 'categorie_code',
        titre: 'Code',
        rendu: (l) => <span className="mono cellule-faible">{texte(l.categorie_code)}</span>,
      },
      { cle: 'site_nom', titre: 'Site', rendu: (l) => texte(l.site_nom) },
      {
        cle: 'quantite',
        titre: 'En stock',
        nombre: true,
        valeur: (l) => Number(l.quantite ?? 0),
        rendu: (l) => nombre(l.quantite),
      },
      {
        cle: 'seuil_minimum',
        titre: 'Seuil minimum',
        nombre: true,
        valeur: (l) => Number(l.seuil_minimum ?? 0),
        rendu: (l) => <span className="cellule-faible">{nombre(l.seuil_minimum)}</span>,
      },
      {
        cle: 'seuil_critique',
        titre: 'Seuil critique',
        nombre: true,
        valeur: (l) => Number(l.seuil_critique ?? 0),
        rendu: (l) => <span className="cellule-faible">{nombre(l.seuil_critique)}</span>,
      },
      {
        cle: 'consommation_jour',
        titre: 'Consommation / jour',
        nombre: true,
        valeur: (l) => Number(l.consommation_jour ?? 0),
        rendu: (l) => <span className="cellule-faible">{nombre(l.consommation_jour)}</span>,
      },
      {
        cle: 'couverture',
        titre: 'Couverture',
        nombre: true,
        valeur: (l) => couverture(l) ?? Number.MAX_SAFE_INTEGER,
        rendu: (l) => {
          const c = couverture(l)
          return c === null ? '—' : jours(c)
        },
      },
      {
        cle: 'rupture_le',
        titre: 'Rupture prévue le',
        nombre: true,
        rendu: (l) => date(l.rupture_le),
      },
    ],
    [],
  )

  return (
    <Page
      titre="Stocks"
      sousTitre="Les articles sous le seuil en tête, la couverture restante et la rupture prévisible"
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Stocks' }]}
      actions={
        <Bouton icone={RefreshCw} surClic={recharger}>
          Actualiser
        </Bouton>
      }
    >
      <Filtres
        total={erreur || chargement ? undefined : filtrees.length}
        nom="article"
        note={enTension > 0 ? `dont ${nombre(enTension)} sous un seuil` : undefined}
      >
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Article, code de catégorie, site…"
        />
        <Filtre
          libelle="Site"
          valeur={site}
          surChangement={(v) => poser('site', v)}
          options={sites.map((idSite) => ({
            valeur: idSite,
            libelle: lignes.find((l) => l.site_id === idSite)?.site_nom ?? idSite,
          }))}
          toutes="Tous les sites"
        />
        <Filtre
          libelle="Sous seuil"
          valeur={sousSeuil}
          surChangement={(v) => poser('sous_seuil', v)}
          options={[{ valeur: '1', libelle: 'Seulement sous seuil' }]}
          toutes="Tous les articles"
        />
        <Filtre
          libelle="Rupture sous"
          valeur={horizon}
          surChangement={(v) => poser('horizon', v)}
          options={[
            { valeur: '7', libelle: '7 jours' },
            { valeur: '15', libelle: '15 jours' },
            { valeur: '30', libelle: '30 jours' },
            { valeur: '60', libelle: '60 jours' },
          ]}
          toutes="Sans horizon"
        />
      </Filtres>

      <Section>
        <Etat
          chargement={chargement}
          erreur={erreur}
          recharger={recharger}
          texteChargement="Lecture des stocks…"
        >
          <Tableau
            colonnes={colonnes}
            lignes={filtrees}
            cleDeLigne={(l, i) => `${l.categorie_code ?? i}-${l.site_id ?? i}`}
            ligneSignalee={(l) => tension(l).rang <= 1}
            ligneMarquee={(l) => estMarque(l.categorie_code) || estMarque(l.id)}
            nomDesLignes="article"
            titreVide="Aucun article de stock"
            texteVide={
              q || site || sousSeuil || horizon
                ? 'Aucun article ne répond à ces critères. Retirez un filtre pour voir le reste.'
                : "Aucun article n'est suivi en stock pour votre périmètre. Une structure ne lit que ses propres données — RG-017."
            }
            pied={`${nombre(filtrees.length)} article(s) affiché(s) · ${nombre(enTension)} sous un seuil · ${nombre(total)} au total`}
          />
        </Etat>
      </Section>

      {mouvementsVivants.length > 0 ? (
        <Section titre="Mouvements reçus en direct" note="Arrivés par le flux depuis l'ouverture de l'écran">
          <Tableau
            lignes={mouvementsVivants}
            cleDeLigne={(m, i) => `${m.recu_le}-${i}`}
            nomDesLignes="mouvement reçu"
            nomDesLignesPluriel="mouvements reçus"
            colonnes={[
              { cle: 'recu_le', titre: 'Reçu à', nombre: true, rendu: (m) => horodatage(m.recu_le) },
              { cle: 'sujet', titre: 'Sujet', rendu: (m) => libelle(m.sujet) },
              { cle: 'type', titre: 'Nature', rendu: (m) => libelle(m.type) },
              {
                cle: 'id',
                titre: 'Objet',
                rendu: (m) => <span className="mono cellule-faible">{texte(m.id)}</span>,
              },
            ]}
          />
        </Section>
      ) : null}
    </Page>
  )
}
