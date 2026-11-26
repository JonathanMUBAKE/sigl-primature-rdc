import { Link, useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import Page from '../components/Page.jsx'
import Bento, { Bloc } from '../components/Bento.jsx'
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
  Le poste de commande central, en blocs bento.

  Le grand bloc porte la file de travail : ce qui attend une décision, le plus
  ancien d'abord, avec le nom de qui doit agir. Les petits blocs portent les
  chiffres clés, les stocks sous seuil et les alertes.

  Chaque chiffre se clique et mène à la liste filtrée qui le compose. L'API
  fournit le lien avec le chiffre ; à défaut, l'écran retombe sur la route
  correspondante.

  Ce que cet écran lit dans GET /api/tableau-de-bord — aucun chiffre n'est
  fabriqué ici, une valeur absente s'affiche « — » :

    file_de_travail: [{ id, type, numero, objet, structure_nom, responsable_nom,
                        responsable_role, depuis_jours, lien }]
    attente:    { a_viser, a_examiner, a_receptionner, a_prendre_en_charge, a_accuser }
    patrimoine: { biens, immobilisations, valeur_acquisition, a_reparer,
                  hors_service, perdus }
    stocks:     { articles, sous_seuil, en_rupture, ruptures_prevues }
    ruptures_prevues: [{ categorie_code, categorie_libelle, site_nom, quantite,
                         jours_de_couverture, rupture_le, lien }]
    achats:     { dossiers_ouverts, bons_commande_en_cours, montant_engage }
    alertes:    { ouvertes, en_examen, critiques }
    dernieres_alertes: [{ id, code, gravite, explication, statut, cree_le }]

  Chaque entrée peut être un nombre nu ou { valeur, lien, ton, appui }.
*/

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

function Chiffres({ bloc, entrees }) {
  return (
    <RangeeChiffres>
      {entrees.map((entree) => {
        const c = chiffreDe(bloc, entree.cle, entree.lien)
        return (
          <Chiffre
            key={entree.cle}
            valeur={entree.montant ? montantCourt(c.valeur) : c.valeur}
            brut={Boolean(entree.montant)}
            libelle={entree.libelle}
            appui={c.appui ?? entree.appui}
            vers={c.lien}
            ton={c.ton ?? entree.ton}
          />
        )
      })}
    </RangeeChiffres>
  )
}

export default function TableauDeBord() {
  const { agent } = useAgent()
  const navigue = useNavigate()
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
  const dernieresAlertes = Array.isArray(t.dernieres_alertes) ? t.dernieres_alertes : []

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
      <Bento>
        <Bloc large={8} titre="En attente d'une décision" note="Le plus ancien d'abord" serre>
          <Tableau
            lignes={file}
            nomDesLignes="décision en attente"
            nomDesLignesPluriel="décisions en attente"
            triInitial={{ cle: 'depuis_jours', sens: 'desc' }}
            ligneSignalee={(l) => (l.depuis_jours ?? 0) >= 7}
            ligneMarquee={(l) => estMarque(l.id)}
            surClic={(l) => navigue(l.lien ?? `/besoins/${l.id}`)}
            titreVide="Aucune décision en attente"
            texteVide="Rien n'attend un visa, un arbitrage ou une signature dans votre périmètre."
            colonnes={[
              {
                cle: 'numero',
                titre: 'Objet',
                rendu: (l) => (
                  <span className="cellule-deux-lignes">
                    <Link to={l.lien ?? `/besoins/${l.id}`} className="mono">
                      {texte(l.numero)}
                    </Link>
                    <span className="texte-note">{texte(l.objet)}</span>
                  </span>
                ),
              },
              { cle: 'type', titre: 'Décision attendue', rendu: (l) => libelle(l.type) },
              {
                cle: 'responsable_nom',
                titre: 'Qui doit agir',
                rendu: (l) => (
                  <span className="cellule-deux-lignes">
                    <span>{texte(l.responsable_nom)}</span>
                    <span className="texte-note">
                      {l.responsable_role ? libelle(l.responsable_role) : texte(l.structure_nom)}
                    </span>
                  </span>
                ),
              },
              {
                cle: 'depuis_jours',
                titre: 'Depuis',
                nombre: true,
                valeur: (l) => Number(l.depuis_jours ?? 0),
                rendu: (l) =>
                  l.depuis_jours === null || l.depuis_jours === undefined
                    ? '—'
                    : jours(l.depuis_jours),
              },
            ]}
          />
        </Bloc>

        <Bloc large={4} titre="À traiter" note="Chaque chiffre ouvre sa liste">
          <Chiffres
            bloc={attente}
            entrees={[
              {
                cle: 'a_viser',
                libelle: 'À viser',
                lien: '/besoins?statut=brouillon',
                appui: 'RG-001, RG-002',
              },
              {
                cle: 'a_examiner',
                libelle: 'À examiner',
                lien: '/besoins?statut=vise',
                appui: 'RG-003, RG-004',
              },
              {
                cle: 'a_receptionner',
                libelle: 'À réceptionner',
                lien: '/besoins?statut=livrable',
              },
              {
                cle: 'a_prendre_en_charge',
                libelle: 'À prendre en charge',
                lien: '/besoins?statut=livre',
                appui: 'RG-010',
              },
              {
                cle: 'a_accuser',
                libelle: 'À accuser',
                lien: '/besoins?statut=livre',
                appui: 'RG-006',
              },
            ]}
          />
        </Bloc>

        <Bloc
          large={7}
          titre="Patrimoine"
          actions={
            <Bouton taille="petite" allure="discrete" vers="/patrimoine">
              Ouvrir le registre
            </Bouton>
          }
        >
          <Chiffres
            bloc={patrimoine}
            entrees={[
              { cle: 'biens', libelle: 'Biens au registre', lien: '/patrimoine' },
              {
                cle: 'immobilisations',
                libelle: 'Immobilisations',
                lien: '/patrimoine?classement=immobilisation',
              },
              {
                cle: 'valeur_acquisition',
                libelle: "Valeur d'acquisition",
                montant: true,
                appui: 'Francs congolais',
              },
              {
                cle: 'a_reparer',
                libelle: 'À réparer',
                lien: '/patrimoine?etat=a_reparer',
                ton: 'attente',
              },
              {
                cle: 'hors_service',
                libelle: 'Hors service',
                lien: '/patrimoine?etat=hors_service',
                ton: 'critique',
              },
              {
                cle: 'perdus',
                libelle: 'Perdus',
                lien: '/patrimoine?etat=perdu',
                ton: 'critique',
                appui: 'RG-015',
              },
            ]}
          />
        </Bloc>

        <Bloc
          large={5}
          titre="Achats"
          actions={
            <Bouton taille="petite" allure="discrete" vers="/fournisseurs">
              Fournisseurs
            </Bouton>
          }
        >
          <Chiffres
            bloc={achats}
            entrees={[
              { cle: 'dossiers_ouverts', libelle: 'Dossiers ouverts' },
              { cle: 'bons_commande_en_cours', libelle: 'Bons en cours' },
              {
                cle: 'montant_engage',
                libelle: 'Montant engagé',
                montant: true,
                appui: 'Francs congolais',
              },
            ]}
          />
        </Bloc>

        <Bloc
          large={7}
          titre="Stocks"
          note="Ruptures prévisibles"
          actions={
            <Bouton taille="petite" allure="discrete" vers="/stocks">
              Ouvrir les stocks
            </Bouton>
          }
        >
          <Chiffres
            bloc={stocks}
            entrees={[
              { cle: 'articles', libelle: 'Articles suivis', lien: '/stocks' },
              {
                cle: 'sous_seuil',
                libelle: 'Sous le seuil',
                lien: '/stocks?sous_seuil=1',
                ton: 'attente',
              },
              {
                cle: 'en_rupture',
                libelle: 'En rupture',
                lien: '/stocks?sous_seuil=1',
                ton: 'critique',
              },
              {
                cle: 'ruptures_prevues',
                libelle: 'Rupture sous 30 j',
                lien: '/stocks?horizon=30',
                ton: 'attente',
              },
            ]}
          />
          {ruptures.length > 0 ? (
            <Tableau
              lignes={ruptures}
              nomDesLignes="rupture prévisible"
              nomDesLignesPluriel="ruptures prévisibles"
              triInitial={{ cle: 'jours_de_couverture', sens: 'asc' }}
              cleDeLigne={(l, i) => `${l.categorie_code ?? i}-${l.site_nom ?? i}`}
              ligneSignalee={(l) => Number(l.jours_de_couverture ?? 99) <= 7}
              surClic={(l) => navigue(l.lien ?? `/stocks?q=${encodeURIComponent(l.categorie_code ?? '')}`)}
              colonnes={[
                {
                  cle: 'categorie_libelle',
                  titre: 'Article',
                  rendu: (l) => (
                    <span className="cellule-deux-lignes">
                      <span>{texte(l.categorie_libelle ?? l.categorie_code)}</span>
                      <span className="texte-note">{texte(l.site_nom)}</span>
                    </span>
                  ),
                },
                {
                  cle: 'quantite',
                  titre: 'En stock',
                  nombre: true,
                  rendu: (l) => nombre(l.quantite),
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
                  titre: 'Rupture le',
                  nombre: true,
                  rendu: (l) => date(l.rupture_le),
                },
              ]}
            />
          ) : null}
        </Bloc>

        <Bloc
          large={5}
          titre="Alertes"
          note="Une alerte ouvre un examen — RG-022"
          actions={
            <Bouton taille="petite" allure="discrete" vers="/alertes">
              Ouvrir les alertes
            </Bouton>
          }
        >
          <Chiffres
            bloc={alertes}
            entrees={[
              {
                cle: 'ouvertes',
                libelle: 'Ouvertes',
                lien: '/alertes?statut=ouverte',
                ton: 'critique',
              },
              {
                cle: 'en_examen',
                libelle: 'En examen',
                lien: '/alertes?statut=en_examen',
                ton: 'attente',
              },
              {
                cle: 'critiques',
                libelle: 'Gravité critique',
                lien: '/alertes?gravite=critique',
                ton: 'critique',
              },
            ]}
          />
          {dernieresAlertes.length > 0 ? (
            <Tableau
              lignes={dernieresAlertes}
              nomDesLignes="alerte"
              ligneMarquee={(l) => estMarque(l.id)}
              surClic={(l) => navigue(`/alertes/${l.id}`)}
              colonnes={[
                {
                  cle: 'explication',
                  titre: 'Alerte',
                  rendu: (l) => (
                    <span className="cellule-deux-lignes">
                      <span>{texte(l.explication)}</span>
                      <span className="texte-note mono">{texte(l.code)}</span>
                    </span>
                  ),
                },
                { cle: 'gravite', titre: 'Gravité', rendu: (l) => <Pastille valeur={l.gravite} /> },
                { cle: 'cree_le', titre: 'Ouverte le', nombre: true, rendu: (l) => date(l.cree_le) },
              ]}
            />
          ) : null}
        </Bloc>
      </Bento>
    </Page>
  )
}
