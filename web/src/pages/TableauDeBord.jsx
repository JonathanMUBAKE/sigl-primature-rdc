import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import Page, { Section } from '../components/Page.jsx'
import Chiffre, { RangeeChiffres } from '../components/Chiffre.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Bouton from '../components/Bouton.jsx'
import { Chargement, Erreur } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete } from '../lib/requete.js'
import { useAgent } from '../lib/agent.jsx'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { date, jours, libelle, montantCourt, nombre, texte } from '../lib/format.js'

/*
  Le poste de commande central. L'écran que l'on juge en premier.

  En tête, une file de travail : ce qui attend une décision, le plus ancien
  d'abord, avec le nom de qui doit agir. Puis le patrimoine, les stocks avec
  les ruptures prévisibles, les achats, les alertes.

  Chaque chiffre se clique et mène à la liste filtrée qui le compose. L'API
  fournit le lien avec le chiffre ; à défaut, l'écran retombe sur la route
  correspondante.

  Ce que cet écran lit dans GET /api/tableau-de-bord — rien de plus, et aucun
  chiffre n'est fabriqué ici : une valeur absente s'affiche « — ».

    file_de_travail: [{ id, type, numero, objet, structure_nom, responsable_nom,
                        responsable_role, depuis_jours, lien }]
    attente:    { a_viser, a_examiner, a_receptionner, a_prendre_en_charge, a_accuser }
    patrimoine: { biens, immobilisations, valeur_acquisition, a_reparer,
                  hors_service, perdus }
    stocks:     { articles, sous_seuil, en_rupture, ruptures_prevues }
    ruptures_prevues: [{ categorie_code, categorie_libelle, site_nom, quantite,
                         consommation_jour, jours_de_couverture, rupture_le, lien }]
    achats:     { dossiers_ouverts, bons_commande_en_cours, montant_engage }
    alertes:    { ouvertes, en_examen, critiques }
    dernieres_alertes: [{ id, code, gravite, explication, statut, cree_le }]

  Chaque entrée de ces blocs peut être un nombre, ou bien
  { valeur, lien, ton, appui } : les deux formes sont acceptées.
*/

/** Lit un chiffre, qu'il soit un nombre nu ou un objet { valeur, lien, … }. */
function chiffreDe(bloc, cle, lienDeRepli) {
  const brut = bloc?.[cle]
  if (brut !== null && typeof brut === 'object') {
    return {
      valeur: brut.valeur,
      lien: brut.lien ?? lienDeRepli,
      ton: brut.ton,
      appui: brut.appui,
    }
  }
  return { valeur: brut, lien: lienDeRepli, ton: undefined, appui: undefined }
}

export default function TableauDeBord() {
  const { agent } = useAgent()
  const { donnees, chargement, erreur, recharger } = useRequete((o) => api.tableauDeBord(o), [
    agent?.id,
  ])
  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant(
    ['tableau-de-bord', 'besoins', 'patrimoine', 'stocks', 'alertes', 'achats'],
    recharger,
    marquer,
  )

  if (chargement) {
    return (
      <Page titre="Tableau de bord" sousTitre="Poste de commande central">
        <Chargement texte="Lecture des chiffres du poste de commande…" />
      </Page>
    )
  }

  if (erreur) {
    return (
      <Page titre="Tableau de bord" sousTitre="Poste de commande central">
        <Erreur
          erreur={erreur}
          surReessai={recharger}
          titre="Le poste de commande n'a pas pu être chargé"
        />
      </Page>
    )
  }

  const t = donnees ?? {}
  const attente = t.attente ?? {}
  const patrimoine = t.patrimoine ?? {}
  const stocks = t.stocks ?? {}
  const achats = t.achats ?? {}
  const alertes = t.alertes ?? {}
  const file = Array.isArray(t.file_de_travail)
    ? t.file_de_travail
    : Array.isArray(t.decisions)
      ? t.decisions
      : []
  const ruptures = Array.isArray(t.ruptures_prevues) ? t.ruptures_prevues : []

  const aViser = chiffreDe(attente, 'a_viser', '/besoins?statut=brouillon')
  const aExaminer = chiffreDe(attente, 'a_examiner', '/besoins?statut=vise')
  const aReceptionner = chiffreDe(attente, 'a_receptionner', '/besoins?statut=livrable')
  const aPrendreEnCharge = chiffreDe(attente, 'a_prendre_en_charge', '/besoins?statut=livre')
  const aAccuser = chiffreDe(attente, 'a_accuser', '/besoins?statut=livre')

  return (
    <Page
      titre="Tableau de bord"
      sousTitre="Ce qui attend une décision, puis le patrimoine, les stocks, les achats et les alertes"
      actions={
        <Bouton icone={RefreshCw} surClic={recharger}>
          Actualiser
        </Bouton>
      }
    >
      <Section
        titre="Ce qui attend une décision"
        note="Chaque chiffre ouvre la liste filtrée qui le compose"
      >
        <RangeeChiffres>
          <Chiffre
            valeur={aViser.valeur}
            libelle="États de besoin à viser"
            appui={aViser.appui ?? 'RG-001, RG-002'}
            vers={aViser.lien}
            ton={aViser.ton ?? 'attente'}
          />
          <Chiffre
            valeur={aExaminer.valeur}
            libelle="À examiner et arbitrer"
            appui={aExaminer.appui ?? 'RG-003, RG-004'}
            vers={aExaminer.lien}
            ton={aExaminer.ton ?? 'attente'}
          />
          <Chiffre
            valeur={aReceptionner.valeur}
            libelle="Livraisons à réceptionner"
            appui={aReceptionner.appui}
            vers={aReceptionner.lien}
            ton={aReceptionner.ton}
          />
          <Chiffre
            valeur={aPrendreEnCharge.valeur}
            libelle="Prises en charge à émettre"
            appui={aPrendreEnCharge.appui ?? 'RG-010'}
            vers={aPrendreEnCharge.lien}
            ton={aPrendreEnCharge.ton}
          />
          <Chiffre
            valeur={aAccuser.valeur}
            libelle="Accusés de réception attendus"
            appui={aAccuser.appui ?? 'RG-006'}
            vers={aAccuser.lien}
            ton={aAccuser.ton}
          />
        </RangeeChiffres>

        <div className="marge-dessus-3">
          <Tableau
            lignes={file}
            nomDesLignes="décision en attente"
            nomDesLignesPluriel="décisions en attente"
            triInitial={{ cle: 'depuis_jours', sens: 'desc' }}
            ligneSignalee={(l) => (l.depuis_jours ?? 0) >= 7}
            ligneMarquee={(l) => estMarque(l.id)}
            titreVide="Aucune décision en attente"
            texteVide="Rien n'attend un visa, un arbitrage ou une signature dans votre périmètre. Les listes restent consultables depuis la barre latérale."
            colonnes={[
              {
                cle: 'numero',
                titre: 'Objet',
                rendu: (l) => (
                  <Link to={l.lien ?? `/besoins/${l.id}`} className="mono">
                    {texte(l.numero)}
                  </Link>
                ),
              },
              { cle: 'type', titre: 'Décision attendue', rendu: (l) => libelle(l.type) },
              { cle: 'objet', titre: 'Intitulé', rendu: (l) => texte(l.objet) },
              {
                cle: 'structure_nom',
                titre: 'Structure',
                rendu: (l) => <span className="cellule-faible">{texte(l.structure_nom)}</span>,
              },
              {
                cle: 'responsable_nom',
                titre: 'Qui doit agir',
                rendu: (l) => (
                  <>
                    <div>{texte(l.responsable_nom)}</div>
                    {l.responsable_role ? (
                      <div className="texte-note">{libelle(l.responsable_role)}</div>
                    ) : null}
                  </>
                ),
              },
              {
                cle: 'depuis_jours',
                titre: 'En attente depuis',
                nombre: true,
                valeur: (l) => Number(l.depuis_jours ?? 0),
                rendu: (l) =>
                  l.depuis_jours === null || l.depuis_jours === undefined
                    ? '—'
                    : jours(l.depuis_jours),
              },
            ]}
          />
        </div>
      </Section>

      <Section titre="Patrimoine">
        <RangeeChiffres>
          {[
            { cle: 'biens', libelle: 'Biens au registre', lien: '/patrimoine' },
            {
              cle: 'immobilisations',
              libelle: 'Immobilisations',
              lien: '/patrimoine?classement=immobilisation',
            },
            { cle: 'a_reparer', libelle: 'Biens à réparer', lien: '/patrimoine?etat=a_reparer', ton: 'attente' },
            {
              cle: 'hors_service',
              libelle: 'Hors service',
              lien: '/patrimoine?etat=hors_service',
              ton: 'critique',
            },
            {
              cle: 'perdus',
              libelle: 'Déclarés perdus',
              lien: '/patrimoine?etat=perdu',
              ton: 'critique',
              appui: 'RG-015 : le bien reste au registre',
            },
          ].map((entree) => {
            const c = chiffreDe(patrimoine, entree.cle, entree.lien)
            return (
              <Chiffre
                key={entree.cle}
                valeur={c.valeur}
                libelle={entree.libelle}
                appui={c.appui ?? entree.appui}
                vers={c.lien}
                ton={c.ton ?? entree.ton}
              />
            )
          })}
          <Chiffre
            valeur={montantCourt(chiffreDe(patrimoine, 'valeur_acquisition').valeur)}
            brut
            libelle="Valeur d'acquisition"
            appui="Francs congolais"
          />
        </RangeeChiffres>
      </Section>

      <Section
        titre="Stocks"
        actions={
          <Bouton taille="petite" allure="discrete" vers="/stocks">
            Ouvrir les stocks
          </Bouton>
        }
      >
        <RangeeChiffres>
          {[
            { cle: 'articles', libelle: 'Articles suivis', lien: '/stocks' },
            {
              cle: 'sous_seuil',
              libelle: 'Sous le seuil minimum',
              lien: '/stocks?sous_seuil=1',
              ton: 'attente',
            },
            { cle: 'en_rupture', libelle: 'En rupture', lien: '/stocks?sous_seuil=1', ton: 'critique' },
            {
              cle: 'ruptures_prevues',
              libelle: 'Ruptures prévisibles à 30 jours',
              lien: '/stocks?horizon=30',
              ton: 'attente',
            },
          ].map((entree) => {
            const c = chiffreDe(stocks, entree.cle, entree.lien)
            return (
              <Chiffre
                key={entree.cle}
                valeur={c.valeur}
                libelle={entree.libelle}
                appui={c.appui}
                vers={c.lien}
                ton={c.ton ?? entree.ton}
              />
            )
          })}
        </RangeeChiffres>

        {ruptures.length > 0 ? (
          <div className="marge-dessus-3">
            <Tableau
              lignes={ruptures}
              nomDesLignes="rupture prévisible"
              nomDesLignesPluriel="ruptures prévisibles"
              triInitial={{ cle: 'jours_de_couverture', sens: 'asc' }}
              cleDeLigne={(l, i) => `${l.categorie_code ?? i}-${l.site_nom ?? i}`}
              ligneSignalee={(l) => Number(l.jours_de_couverture ?? 99) <= 7}
              colonnes={[
                {
                  cle: 'categorie_libelle',
                  titre: 'Article',
                  rendu: (l) => (
                    <Link to={l.lien ?? `/stocks?q=${encodeURIComponent(l.categorie_code ?? '')}`}>
                      {texte(l.categorie_libelle ?? l.categorie_code)}
                    </Link>
                  ),
                },
                { cle: 'site_nom', titre: 'Site', rendu: (l) => texte(l.site_nom) },
                { cle: 'quantite', titre: 'En stock', nombre: true, rendu: (l) => nombre(l.quantite) },
                {
                  cle: 'consommation_jour',
                  titre: 'Consommation / jour',
                  nombre: true,
                  rendu: (l) => nombre(l.consommation_jour),
                },
                {
                  cle: 'jours_de_couverture',
                  titre: 'Couverture',
                  nombre: true,
                  valeur: (l) => Number(l.jours_de_couverture ?? 0),
                  rendu: (l) =>
                    l.jours_de_couverture === null || l.jours_de_couverture === undefined
                      ? '—'
                      : jours(l.jours_de_couverture),
                },
                {
                  cle: 'rupture_le',
                  titre: 'Rupture prévue le',
                  nombre: true,
                  rendu: (l) => date(l.rupture_le),
                },
              ]}
            />
          </div>
        ) : null}
      </Section>

      <Section
        titre="Achats"
        actions={
          <Bouton taille="petite" allure="discrete" vers="/fournisseurs">
            Voir les fournisseurs
          </Bouton>
        }
      >
        <RangeeChiffres>
          {[
            { cle: 'dossiers_ouverts', libelle: "Dossiers d'achat ouverts" },
            { cle: 'bons_commande_en_cours', libelle: 'Bons de commande en cours' },
          ].map((entree) => {
            const c = chiffreDe(achats, entree.cle)
            return (
              <Chiffre
                key={entree.cle}
                valeur={c.valeur}
                libelle={entree.libelle}
                appui={c.appui}
                vers={c.lien}
                ton={c.ton}
              />
            )
          })}
          <Chiffre
            valeur={montantCourt(chiffreDe(achats, 'montant_engage').valeur)}
            brut
            libelle="Montant engagé"
            appui="Francs congolais"
          />
        </RangeeChiffres>
      </Section>

      <Section titre="Alertes" note="Aucune alerte ne décide : elle ouvre un examen — RG-022">
        <RangeeChiffres>
          {[
            { cle: 'ouvertes', libelle: 'Alertes ouvertes', lien: '/alertes?statut=ouverte', ton: 'critique' },
            {
              cle: 'en_examen',
              libelle: 'Alertes en examen',
              lien: '/alertes?statut=en_examen',
              ton: 'attente',
            },
            {
              cle: 'critiques',
              libelle: 'Gravité critique',
              lien: '/alertes?gravite=critique',
              ton: 'critique',
            },
          ].map((entree) => {
            const c = chiffreDe(alertes, entree.cle, entree.lien)
            return (
              <Chiffre
                key={entree.cle}
                valeur={c.valeur}
                libelle={entree.libelle}
                appui={c.appui}
                vers={c.lien}
                ton={c.ton ?? entree.ton}
              />
            )
          })}
        </RangeeChiffres>

        {Array.isArray(t.dernieres_alertes) && t.dernieres_alertes.length > 0 ? (
          <div className="marge-dessus-3">
            <Tableau
              lignes={t.dernieres_alertes}
              nomDesLignes="alerte"
              ligneMarquee={(l) => estMarque(l.id)}
              colonnes={[
                {
                  cle: 'code',
                  titre: 'Code',
                  rendu: (l) => (
                    <Link to={`/alertes?q=${encodeURIComponent(l.code ?? '')}`} className="mono">
                      {texte(l.code)}
                    </Link>
                  ),
                },
                { cle: 'gravite', titre: 'Gravité', rendu: (l) => <Pastille valeur={l.gravite} /> },
                { cle: 'explication', titre: 'Explication', rendu: (l) => texte(l.explication) },
                { cle: 'statut', titre: 'Statut', rendu: (l) => <Pastille valeur={l.statut} /> },
                { cle: 'cree_le', titre: 'Ouverte le', nombre: true, rendu: (l) => date(l.cree_le) },
              ]}
            />
          </div>
        ) : null}
      </Section>
    </Page>
  )
}
