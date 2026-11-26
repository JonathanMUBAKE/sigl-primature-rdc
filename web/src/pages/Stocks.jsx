import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import Page, { Section } from '../components/Page.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import { Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { nombre, texte } from '../lib/format.js'

/*
  Les stocks, par article et par site. GET /api/stocks ?site=&sous_seuil=
  Les articles sous le seuil passent en tête : c'est ce qui demande une
  décision, et le reste suit.
*/
function tension(ligne) {
  const quantite = Number(ligne.quantite ?? 0)
  const critique = Number(ligne.seuil_critique ?? 0)
  const minimum = Number(ligne.seuil_minimum ?? 0)
  if (quantite <= 0) return { rang: 0, ton: 'critique', texte: 'Rupture' }
  if (critique > 0 && quantite <= critique) return { rang: 1, ton: 'critique', texte: 'Sous le seuil critique' }
  if (minimum > 0 && quantite <= minimum) return { rang: 2, ton: 'attente', texte: 'Sous le seuil minimum' }
  return { rang: 3, ton: 'succes', texte: 'Suffisant' }
}

export default function Stocks() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const site = params.get('site') ?? ''
  const sousSeuil = params.get('sous_seuil') ?? ''

  function poser(cle, valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, valeur)
    else prochain.delete(cle)
    setParams(prochain, { replace: true })
  }

  const { donnees, chargement, erreur, recharger } = useRequete(
    (o) => api.stocks({ site, sous_seuil: sousSeuil || undefined }, o),
    [site, sousSeuil],
  )
  const { lignes, total } = depouillerListe(donnees)

  const filtrees = useMemo(() => {
    const motif = q.trim().toLocaleLowerCase('fr')
    const retenues = motif
      ? lignes.filter((l) =>
          [l.categorie_libelle, l.categorie_code, l.site_nom]
            .filter(Boolean)
            .some((v) => String(v).toLocaleLowerCase('fr').includes(motif)),
        )
      : lignes
    // Les articles sous seuil en tête, puis par quantité croissante.
    return [...retenues].sort((a, b) => {
      const ta = tension(a)
      const tb = tension(b)
      if (ta.rang !== tb.rang) return ta.rang - tb.rang
      return Number(a.quantite ?? 0) - Number(b.quantite ?? 0)
    })
  }, [lignes, q])

  const enTension = filtrees.filter((l) => tension(l).rang <= 2).length

  const colonnes = useMemo(
    () => [
      {
        cle: 'etat_stock',
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
    ],
    [],
  )

  return (
    <Page
      titre="Stocks"
      sousTitre="Les articles sous le seuil sont présentés en tête"
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Stocks' }]}
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
          options={[...new Set(lignes.map((l) => l.site_id).filter(Boolean))].map((idSite) => ({
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
      </Filtres>

      <Section>
        <Etat
          chargement={chargement}
          erreur={erreur}
          recharger={recharger}
          vide={filtrees.length === 0}
          texteChargement="Lecture des stocks…"
          titreVide="Aucun article de stock"
          texteVide={
            q || site || sousSeuil
              ? 'Aucun article ne répond à ces critères. Retirez un filtre pour voir le reste.'
              : "Aucun article n'est suivi en stock pour votre périmètre."
          }
        >
          <Tableau
            colonnes={colonnes}
            lignes={filtrees}
            cleDeLigne={(l, i) => `${l.categorie_code}-${l.site_id ?? i}`}
            ligneSignalee={(l) => tension(l).rang <= 1}
            nomDesLignes="article"
            pied={`${nombre(filtrees.length)} article(s) · ${nombre(enTension)} sous un seuil · ${nombre(total)} au total`}
          />
        </Etat>
      </Section>
    </Page>
  )
}
