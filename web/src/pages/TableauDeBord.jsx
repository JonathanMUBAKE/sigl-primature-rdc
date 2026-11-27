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
import {
  date,
  horodatage as direHorodatage,
  jours,
  libelle,
  montantCourt,
  nombre,
  texte,
} from '../lib/format.js'

/*
  Le poste de commande — `docs/LOT-POSTE-DE-COMMANDE.md`, § 3.

  L'en-tête dit de quand datent les chiffres : sans l'heure d'actualisation, un
  écran qui ne bouge pas ne se distingue pas d'un écran qui n'a plus de
  nouvelles.

  Le premier rang porte six chiffres d'action, dans l'ordre que le serveur rend.
  On ne les réordonne pas, on ne les recalcule pas, on ne les complète pas : un
  chiffre que le profil n'a pas le droit de lire s'affiche « — » avec son motif,
  jamais un zéro — RG-039, parce qu'un zéro se lit comme « rien à faire ».

  Viennent ensuite la file de travail, le patrimoine, les stocks, les achats,
  les alertes et le contexte du réemploi.

  Tout vient de GET /api/tableau-de-bord, et rien n'est recalculé ici. Le
  serveur accompagne chaque chiffre d'un lien vers son API ; `lienUi` le
  traduit en adresse d'écran, et le chiffre n'est cliquable que s'il mène
  quelque part — RG-038.

  Les montants sont en francs congolais, seule devise du schéma : `montantCourt`
  les libelle « FC » lui-même.
*/

/*
  La file de travail mêle trois sortes d'objets, et chacun a son écran. Le lien
  du serveur suffit pour l'état de besoin et le bon de commande. Le PV de
  réception, lui, est rendu comme un document : la famille `documents` n'a pas
  d'écran à elle, et la suite d'un PV se joue sur l'écran des réceptions. On ne
  retombe donc plus sur la fiche d'un besoin pour un objet qui n'en est pas un.
*/
function ecranDeLaLigne(ligne) {
  const traduit = lienUi(ligne?.lien)
  if (traduit) return traduit
  if (ligne?.objet === 'pv_reception') return '/receptions'
  if (ligne?.objet === 'etat_besoin' && ligne.id) return `/besoins/${ligne.id}`
  return null
}
export default function TableauDeBord() {
  const { agent } = useAgent()
  const navigue = useNavigate()
  const { donnees, chargement, erreur, recharger } = useRequete((o) => api.tableauDeBord(o), [
    agent?.id,
  ])
  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant(
    [
      'tableau-de-bord',
      'besoins',
      'patrimoine',
      'stocks',
      'alertes',
      'achats',
      'reforme',
      'reemploi',
    ],
    () => {
      recharger()
    },
    marquer,
  )

  if (chargement) {
    return (
      <Page titre="Poste de commande" sousTitre="Ce qui attend une décision dans votre périmètre">
        <Chargement texte="Lecture des chiffres du poste de commande…" />
      </Page>
    )
  }

  if (erreur) {
    return (
      <Page titre="Poste de commande" sousTitre="Ce qui attend une décision dans votre périmètre">
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
  // Les totaux du registre — § 2.2 du contrat. Le bloc ne s'affiche que si le
  // serveur les rend : trois tirets ne diraient rien à personne.
  const totaux = patrimoine.totaux ?? null
  const stocks = t.stocks ?? {}
  const aSurveiller = Array.isArray(stocks.articles_a_surveiller) ? stocks.articles_a_surveiller : []
  const achats = t.achats ?? {}
  const ecarts = achats.ecarts ?? {}
  const parProcedure = Array.isArray(achats.par_procedure) ? achats.par_procedure : []
  const reemploi = t.reemploi ?? {}
  const alertes = t.alertes ?? {}
  const parGravite = Array.isArray(alertes.par_gravite) ? alertes.par_gravite : []
  const periode = t.periode ?? {}

  const porteeDite = portee.consolide
    ? typeof portee.structures === 'number'
      ? `vue consolidée sur ${nombre(portee.structures)} structures`
      : 'vue consolidée'
    : texte(portee.structure)

  /*
    L'en-tête : qui regarde, quel périmètre, quelle période, et de quand datent
    les chiffres. La période ne s'invente pas — si le serveur ne la rend pas, la
    mention disparaît au lieu d'annoncer une fenêtre fausse.
  */
  const enTete = [
    portee.agent ? texte(portee.agent) : null,
    portee.consolide || portee.structure ? porteeDite : null,
    periode.libelle ? texte(periode.libelle) : null,
    t.horodatage ? `actualisé le ${direHorodatage(t.horodatage)}` : null,
  ].filter(Boolean)

  return (
    <Page
      titre="Poste de commande"
      sousTitre={enTete.join(' · ')}
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
              {tete.map((c, rang) => {
                /*
                  RG-039 : une donnée que le profil n'a pas le droit de lire se
                  dit « — » avec son motif en appui. Elle ne mène pas non plus à
                  la liste qui la compose : ce serait un refus de plus au clic.
                  Le champ absent vaut « lisible », puisque seul `false` dit
                  l'interdiction.
                */
                const indisponible = c.disponible === false
                /*
                  Un libellé qui annonce « (FC) » porte un montant, non un
                  décompte : il se lit en francs congolais. Les six chiffres
                  d'action du contrat sont des décomptes ; ce garde-fou sert tout
                  autre chiffre que le serveur libellerait ainsi.
                */
                const estMontant = /\(FC\)\s*$/.test(c.libelle ?? '')
                return (
                  <Chiffre
                    key={`${rang}-${c.libelle}`}
                    valeur={
                      indisponible ? '—' : estMontant ? montantCourt(c.valeur) : c.valeur
                    }
                    brut={indisponible || estMontant}
                    libelle={texte(c.libelle).replace(' (FC)', '')}
                    appui={(indisponible ? c.motif : c.appui) ?? undefined}
                    vers={indisponible ? undefined : lienUi(c.lien)}
                  />
                )
              })}
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
            surClic={(l) => {
              const vers = ecranDeLaLigne(l)
              if (vers) navigue(vers)
            }}
            titreVide="Aucune décision en attente"
            texteVide="Rien n'attend un visa, un arbitrage ou une signature dans votre périmètre."
            colonnes={[
              {
                cle: 'numero',
                titre: 'Objet',
                largeur: '34%',
                rendu: (l) => (
                  <span className="cellule-deux-lignes">
                    {ecranDeLaLigne(l) ? (
                      <Link to={ecranDeLaLigne(l)} className="mono">
                        {texte(l.numero)}
                      </Link>
                    ) : (
                      <span className="mono">{texte(l.numero)}</span>
                    )}
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

        {/*
          Le registre en trois nombres — § 2.2. « Biens au registre » et
          « Valeur d'acquisition » ont quitté le premier rang, qui ne porte plus
          que des chiffres d'action : ils restent lisibles ici. Le troisième dit
          la leçon du lot de reprise — une valeur partielle additionnée n'est pas
          un inventaire valorisé, et le chiffre qui le disait manquait.
        */}
        {totaux ? (
          <Bloc large={7} titre="Patrimoine" note="Le registre, tel qu'il est tenu">
            <RangeeChiffres>
              <Chiffre
                valeur={totaux.biens}
                libelle="Biens au registre"
                vers={lienUi(totaux.lien)}
              />
              <Chiffre
                valeur={montantCourt(totaux.valeur_acquisition)}
                brut
                libelle="Valeur d'acquisition"
                appui="Francs congolais"
                vers={lienUi(totaux.lien)}
              />
              <Chiffre
                valeur={totaux.biens_valeur_non_documentee}
                libelle="Valeur non documentée"
                appui={
                  totaux.biens_valeur_non_documentee
                    ? `pour ${nombre(totaux.biens_valeur_non_documentee)} biens : le total ci-contre n'est pas un inventaire valorisé`
                    : undefined
                }
                ton={totaux.biens_valeur_non_documentee ? 'attente' : undefined}
              />
            </RangeeChiffres>
          </Bloc>
        ) : null}

        {/*
          Le réemploi, en contexte. Le chiffre des offres ouvertes ailleurs a
          quitté le premier rang : il n'appelle pas une décision du jour, mais il
          était la seule présence du réemploi sur cet écran, et le gisement
          d'économies du lot « réforme » se perdrait sans lui. Il reste donc
          visible et cliquable, avec ce qui l'éclaire.
        */}
        <Bloc
          large={totaux ? 5 : 12}
          titre="Réemploi"
          note="Avant d'acheter, regarder ce que les autres offrent"
          actions={
            <Bouton taille="petite" allure="discrete" vers="/reemploi">
              Ouvrir le catalogue
            </Bouton>
          }
        >
          <RangeeChiffres>
            <Chiffre
              valeur={reemploi.offres_ouvertes_ailleurs}
              libelle="Offerts par d’autres structures"
              vers={lienUi(reemploi.lien)}
            />
            <Chiffre
              valeur={reemploi.offres_bientot_closes}
              libelle="Offres bientôt closes"
              vers={lienUi(reemploi.lien)}
              ton="attente"
            />
            <Chiffre
              valeur={reemploi.mes_demandes_deposees}
              libelle="Mes demandes déposées"
              vers={lienUi(reemploi.lien_mes_demandes)}
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
          {/*
            Les dossiers par procédure : le serveur les rend depuis le premier
            jour et l'écran ne les avait jamais montrés. C'est là que se lit le
            choix de la procédure — RG-008 reproche le découpage d'un achat, et
            on ne voit un découpage qu'en voyant la répartition.
          */}
          {parProcedure.length > 0 ? (
            <Tableau
              lignes={parProcedure}
              cleDeLigne={(d, i) => `${d.procedure}-${d.statut}-${i}`}
              nomDesLignes="procédure"
              nomDesLignesPluriel="procédures"
              triInitial={{ cle: 'montant_estime', sens: 'desc' }}
              surClic={(d) => {
                const vers = lienUi(d.lien)
                if (vers) navigue(vers)
              }}
              colonnes={[
                {
                  cle: 'procedure',
                  titre: 'Procédure',
                  rendu: (d) => texte(libelle(d.procedure)),
                },
                { cle: 'statut', titre: 'Statut', rendu: (d) => <Pastille valeur={d.statut} /> },
                {
                  cle: 'nombre',
                  titre: 'Dossiers',
                  nombre: true,
                  valeur: (d) => Number(d.nombre ?? 0),
                  rendu: (d) => nombre(d.nombre),
                },
                {
                  cle: 'montant_estime',
                  titre: 'Montant estimé',
                  nombre: true,
                  valeur: (d) => Number(d.montant_estime ?? 0),
                  rendu: (d) => montantCourt(d.montant_estime),
                },
              ]}
            />
          ) : null}
        </Bloc>
      </Bento>
    </Page>
  )
}
