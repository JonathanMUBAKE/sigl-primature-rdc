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
import { lienUi } from '../lib/liens.js'
import { date, jours, libelle, montantCourt, nombre, texte } from '../lib/format.js'

/*
  Le poste de commande central, en blocs bento.

  Le grand bloc porte la file de travail : ce qui attend une décision, le plus
  ancien d'abord, avec le nom de qui doit agir. Les petits blocs portent les
  chiffres clés, le patrimoine, les stocks à surveiller, les achats et les
  alertes.

  Tout vient de GET /api/tableau-de-bord, et rien n'est recalculé ici. Le
  serveur accompagne chaque chiffre d'un lien vers son API ; `lienUi` le
  traduit en adresse d'écran, et le chiffre n'est cliquable que s'il mène
  quelque part.
*/
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
  const portee = t.portee ?? {}
  const tete = Array.isArray(t.chiffres_de_tete) ? t.chiffres_de_tete : []
  const attente = t.en_attente_de_decision ?? {}
  const file = Array.isArray(attente.lignes) ? attente.lignes : []
  const delai = t.delai_besoin_livraison ?? {}
  const patrimoine = t.patrimoine ?? {}
  const parCategorie = Array.isArray(patrimoine.par_categorie) ? patrimoine.par_categorie : []
  const parStructure = Array.isArray(patrimoine.par_structure) ? patrimoine.par_structure : []
  const stocks = t.stocks ?? {}
  const aSurveiller = Array.isArray(stocks.articles_a_surveiller) ? stocks.articles_a_surveiller : []
  const achats = t.achats ?? {}
  const ecarts = achats.ecarts ?? {}
  const alertes = t.alertes ?? {}
  const parGravite = Array.isArray(alertes.par_gravite) ? alertes.par_gravite : []

  const porteeDite = portee.consolide
    ? typeof portee.structures === 'number'
      ? `vue consolidée sur ${nombre(portee.structures)} structures`
      : 'vue consolidée'
    : texte(portee.structure)

  return (
    <Page
      titre="Tableau de bord"
      sousTitre={`Ce qui attend une décision, puis le patrimoine, les stocks, les achats et les alertes — ${porteeDite}`}
      actions={
        <Bouton icone={RefreshCw} surClic={recharger}>
          Actualiser
        </Bouton>
      }
    >
      {tete.length > 0 ? (
        <Bento>
          <Bloc large={12}>
            <RangeeChiffres>
              {tete.map((c) => (
                <Chiffre
                  key={c.libelle}
                  valeur={
                    /FC\)?$/.test(c.libelle) ? montantCourt(c.valeur) : c.valeur
                  }
                  brut={/FC\)?$/.test(c.libelle)}
                  libelle={c.libelle.replace(' (FC)', '')}
                  appui={/FC\)?$/.test(c.libelle) ? 'Francs congolais' : undefined}
                  vers={lienUi(c.lien)}
                />
              ))}
            </RangeeChiffres>
          </Bloc>
        </Bento>
      ) : null}

      <Bento>
        <Bloc
          large={8}
          titre="En attente d'une décision"
          note={
            attente.total
              ? `${nombre(attente.au_dela_de_7_jours)} au-delà de 7 jours · la plus ancienne : ${jours(attente.plus_ancienne_jours)}`
              : 'Le plus ancien d’abord'
          }
          serre
        >
          <Tableau
            lignes={file}
            nomDesLignes="décision en attente"
            nomDesLignesPluriel="décisions en attente"
            triInitial={{ cle: 'anciennete_jours', sens: 'desc' }}
            ligneSignalee={(l) => (l.anciennete_jours ?? 0) > 7}
            ligneMarquee={(l) => estMarque(l.id)}
            surClic={(l) => navigue(lienUi(l.lien) ?? `/besoins/${l.id}`)}
            titreVide="Aucune décision en attente"
            texteVide="Rien n'attend un visa, un arbitrage ou une signature dans votre périmètre."
            colonnes={[
              {
                cle: 'numero',
                titre: 'Objet',
                largeur: '34%',
                rendu: (l) => (
                  <span className="cellule-deux-lignes">
                    <Link to={lienUi(l.lien) ?? `/besoins/${l.id}`} className="mono">
                      {texte(l.numero)}
                    </Link>
                    <span className="texte-note">
                      {texte(l.structure_code)} · demandé par {texte(l.demandeur)}
                    </span>
                  </span>
                ),
              },
              {
                cle: 'attend',
                titre: 'Décision attendue',
                largeur: '28%',
                rendu: (l) => (
                  <span className="cellule-deux-lignes">
                    <span>{texte(l.attend)}</span>
                    <span className="texte-note">
                      <Pastille valeur={l.statut} />
                    </span>
                  </span>
                ),
              },
              {
                cle: 'qui_doit_agir',
                titre: 'Qui doit agir',
                largeur: '26%',
                rendu: (l) => (
                  <span className="cellule-deux-lignes">
                    <span>{texte(l.qui_doit_agir)}</span>
                    <span className="texte-note">{libelle(l.role_attendu)}</span>
                  </span>
                ),
              },
              {
                cle: 'anciennete_jours',
                titre: 'Depuis',
                largeur: '104px',
                nombre: true,
                valeur: (l) => Number(l.anciennete_jours ?? 0),
                rendu: (l) => jours(l.anciennete_jours),
              },
            ]}
          />
        </Bloc>

        <Bloc large={4} titre="Délai de la demande à la livraison" note="Sur les états clos">
          <RangeeChiffres>
            <Chiffre
              valeur={delai.jours_moyens === null ? '—' : jours(delai.jours_moyens)}
              brut
              libelle="Délai moyen"
              appui={`${nombre(delai.nombre_mesures)} mesure(s)`}
              vers={lienUi(delai.lien)}
            />
            <Chiffre
              valeur={delai.jours_minimum === null ? '—' : jours(delai.jours_minimum)}
              brut
              libelle="Le plus court"
            />
            <Chiffre
              valeur={delai.jours_maximum === null ? '—' : jours(delai.jours_maximum)}
              brut
              libelle="Le plus long"
              ton="attente"
            />
          </RangeeChiffres>
        </Bloc>

        <Bloc
          large={7}
          titre="Patrimoine par catégorie"
          actions={
            <Bouton taille="petite" allure="discrete" vers="/patrimoine">
              Ouvrir le registre
            </Bouton>
          }
          serre
        >
          <Tableau
            lignes={parCategorie}
            cleDeLigne={(c) => c.categorie_code}
            nomDesLignes="catégorie"
            triInitial={{ cle: 'valeur', sens: 'desc' }}
            surClic={(c) => {
              const vers = lienUi(c.lien)
              if (vers) navigue(vers)
            }}
            titreVide="Aucun bien au registre"
            texteVide="Votre périmètre ne contient aucun bien — RG-017."
            colonnes={[
              {
                cle: 'libelle',
                titre: 'Catégorie',
                rendu: (c) => (
                  <span className="cellule-deux-lignes">
                    <span>{texte(c.libelle)}</span>
                    <span className="texte-note mono">{texte(c.categorie_code)}</span>
                  </span>
                ),
              },
              {
                cle: 'classement',
                titre: 'Classement',
                rendu: (c) => <Pastille valeur={c.classement} />,
              },
              { cle: 'nombre', titre: 'Biens', nombre: true, rendu: (c) => nombre(c.nombre) },
              {
                cle: 'valeur',
                titre: 'Valeur',
                nombre: true,
                valeur: (c) => Number(c.valeur ?? 0),
                rendu: (c) => montantCourt(c.valeur),
              },
              {
                cle: 'taux_immatriculation',
                titre: 'Immatriculés',
                nombre: true,
                rendu: (c) =>
                  c.taux_immatriculation === null || c.taux_immatriculation === undefined
                    ? '—'
                    : `${nombre(c.taux_immatriculation)} %`,
              },
            ]}
          />
        </Bloc>

        <Bloc large={5} titre="Patrimoine par structure" serre>
          <Tableau
            lignes={parStructure}
            cleDeLigne={(s) => s.id}
            nomDesLignes="structure"
            triInitial={{ cle: 'valeur', sens: 'desc' }}
            surClic={(s) => {
              const vers = lienUi(s.lien)
              if (vers) navigue(vers)
            }}
            titreVide="Aucune structure"
            texteVide="Aucune structure n'est lisible depuis votre profil."
            colonnes={[
              {
                cle: 'nom',
                titre: 'Structure',
                rendu: (s) => (
                  <span className="cellule-deux-lignes">
                    <span>{texte(s.code)}</span>
                    <span className="texte-note">{libelle(s.regime)}</span>
                  </span>
                ),
              },
              { cle: 'nombre', titre: 'Biens', nombre: true, rendu: (s) => nombre(s.nombre) },
              {
                cle: 'a_soigner',
                titre: 'À soigner',
                nombre: true,
                rendu: (s) =>
                  s.a_soigner ? (
                    <Link to={lienUi(s.lien_a_soigner) ?? '/patrimoine?etat=a_reparer'}>
                      {nombre(s.a_soigner)}
                    </Link>
                  ) : (
                    nombre(s.a_soigner)
                  ),
              },
              {
                cle: 'valeur',
                titre: 'Valeur',
                nombre: true,
                valeur: (s) => Number(s.valeur ?? 0),
                rendu: (s) => montantCourt(s.valeur),
              },
            ]}
          />
        </Bloc>

        <Bloc
          large={7}
          titre="Stocks"
          note={
            stocks.fenetre_consommation_jours
              ? `Consommation observée sur ${jours(stocks.fenetre_consommation_jours)}`
              : undefined
          }
          actions={
            <Bouton taille="petite" allure="discrete" vers="/stocks">
              Ouvrir les stocks
            </Bouton>
          }
        >
          <RangeeChiffres>
            <Chiffre valeur={stocks.articles} libelle="Articles suivis" vers="/stocks" />
            <Chiffre
              valeur={stocks.en_rupture?.valeur}
              libelle="En rupture"
              vers={lienUi(stocks.en_rupture?.lien) ?? '/stocks?tension=rupture'}
              ton="critique"
            />
            <Chiffre
              valeur={stocks.sous_seuil_critique?.valeur}
              libelle="Sous le seuil critique"
              vers={lienUi(stocks.sous_seuil_critique?.lien) ?? '/stocks?tension=sous_critique'}
              ton="critique"
            />
            <Chiffre
              valeur={stocks.rupture_prevue_30_jours?.valeur}
              libelle="Rupture sous 30 jours"
              vers={lienUi(stocks.rupture_prevue_30_jours?.lien) ?? '/stocks'}
              ton="attente"
            />
          </RangeeChiffres>
          {aSurveiller.length > 0 ? (
            <Tableau
              lignes={aSurveiller}
              cleDeLigne={(a) => a.id}
              nomDesLignes="article à surveiller"
              nomDesLignesPluriel="articles à surveiller"
              triInitial={{ cle: 'jours_couverture', sens: 'asc' }}
              ligneSignalee={(a) => Number(a.jours_couverture ?? 99) <= 7}
              surClic={() => navigue('/stocks')}
              colonnes={[
                {
                  cle: 'designation',
                  titre: 'Article',
                  rendu: (a) => (
                    <span className="cellule-deux-lignes">
                      <span>{texte(a.designation)}</span>
                      <span className="texte-note">{texte(a.site)}</span>
                    </span>
                  ),
                },
                {
                  cle: 'quantite',
                  titre: 'En stock',
                  nombre: true,
                  rendu: (a) => nombre(a.quantite),
                },
                {
                  cle: 'jours_couverture',
                  titre: 'Couverture',
                  nombre: true,
                  valeur: (a) => Number(a.jours_couverture ?? 0),
                  rendu: (a) => jours(a.jours_couverture),
                },
                {
                  cle: 'date_rupture_prevue',
                  titre: 'Rupture le',
                  nombre: true,
                  rendu: (a) => date(a.date_rupture_prevue),
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
          serre
        >
          <Tableau
            lignes={parGravite}
            cleDeLigne={(a, i) => `${a.gravite}-${a.statut}-${i}`}
            nomDesLignes="groupe d'alertes"
            nomDesLignesPluriel="groupes d'alertes"
            surClic={(a) => {
              const vers = lienUi(a.lien)
              if (vers) navigue(vers)
            }}
            titreVide="Aucune alerte"
            texteVide="Aucune alerte n'est ouverte sur votre périmètre."
            colonnes={[
              { cle: 'gravite', titre: 'Gravité', rendu: (a) => <Pastille valeur={a.gravite} /> },
              { cle: 'statut', titre: 'Statut', rendu: (a) => <Pastille valeur={a.statut} /> },
              { cle: 'nombre', titre: 'Nombre', nombre: true, rendu: (a) => nombre(a.nombre) },
              {
                cle: 'plus_ancienne_jours',
                titre: 'La plus ancienne',
                nombre: true,
                valeur: (a) => Number(a.plus_ancienne_jours ?? 0),
                rendu: (a) => jours(a.plus_ancienne_jours),
              },
            ]}
          />
        </Bloc>

        <Bloc large={12} titre="Achats" note="Engagé, livré, réceptionné, payé">
          <RangeeChiffres>
            <Chiffre
              valeur={montantCourt(ecarts.montant_commande)}
              brut
              libelle="Commandé"
              appui={`${nombre(ecarts.bons)} bon(s) de commande`}
              vers={lienUi(ecarts.lien)}
            />
            <Chiffre valeur={montantCourt(ecarts.montant_livre)} brut libelle="Livré" />
            <Chiffre
              valeur={montantCourt(ecarts.montant_receptionne)}
              brut
              libelle="Réceptionné"
            />
            <Chiffre valeur={montantCourt(ecarts.montant_paye)} brut libelle="Payé" />
            <Chiffre
              valeur={montantCourt(ecarts.ecart_commande_livre)}
              brut
              libelle="Écart commandé / livré"
              ton="attente"
            />
            <Chiffre
              valeur={montantCourt(ecarts.ecart_livre_receptionne)}
              brut
              libelle="Écart livré / réceptionné"
              ton="attente"
            />
          </RangeeChiffres>
        </Bloc>
      </Bento>
    </Page>
  )
}
