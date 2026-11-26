import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import Page, { Section } from '../components/Page.jsx'
import Chiffre, { RangeeChiffres } from '../components/Chiffre.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Bouton from '../components/Bouton.jsx'
import Vide, { Chargement, Erreur } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete } from '../lib/requete.js'
import { useAgent } from '../lib/agent.jsx'
import { date, libelle, montantCourt, nombre, texte } from '../lib/format.js'

/*
  Le poste de commande central.

  Ce que cet écran lit dans GET /api/tableau-de-bord — rien de plus, et aucun
  chiffre n'est fabriqué ici : une valeur absente s'affiche « — ».

    decisions: [{ id, type, numero, objet, structure_nom, depuis_jours, lien }]
    attente:   { a_viser, a_examiner, a_receptionner, a_prendre_en_charge, a_accuser }
    patrimoine:{ biens, immobilisations, valeur_acquisition, a_reparer, hors_service, perdus }
    stocks:    { articles, sous_seuil, en_rupture }
    achats:    { dossiers_ouverts, bons_commande_en_cours, montant_engage }
    alertes:   { ouvertes, en_examen, critiques }
*/
export default function TableauDeBord() {
  const { agent } = useAgent()
  const { donnees, chargement, erreur, recharger } = useRequete((o) => api.tableauDeBord(o), [
    agent?.id,
  ])

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
  const decisions = Array.isArray(t.decisions) ? t.decisions : []

  return (
    <Page
      titre="Tableau de bord"
      sousTitre="Ce qui attend une décision, puis l'état du patrimoine, des stocks et des achats"
      actions={
        <Bouton icone={RefreshCw} surClic={recharger}>
          Actualiser
        </Bouton>
      }
    >
      <Section titre="Ce qui attend une décision" note="Chaque chiffre ouvre la liste correspondante">
        <RangeeChiffres>
          <Chiffre
            valeur={attente.a_viser}
            libelle="États de besoin à viser"
            appui="RG-001, RG-002"
            vers="/besoins?statut=brouillon"
            ton="attente"
          />
          <Chiffre
            valeur={attente.a_examiner}
            libelle="À examiner et arbitrer"
            appui="RG-003, RG-004"
            vers="/besoins?statut=vise"
            ton="attente"
          />
          <Chiffre
            valeur={attente.a_receptionner}
            libelle="Livraisons à réceptionner"
            vers="/besoins?statut=livrable"
          />
          <Chiffre
            valeur={attente.a_prendre_en_charge}
            libelle="Prises en charge à émettre"
            appui="RG-010"
            vers="/besoins?statut=livre"
          />
          <Chiffre
            valeur={attente.a_accuser}
            libelle="Accusés de réception attendus"
            appui="RG-006"
            vers="/besoins?statut=livre"
          />
        </RangeeChiffres>

        <div style={{ marginTop: 14 }}>
          {decisions.length === 0 ? (
            <Vide
              titre="Aucune décision en attente"
              texte="Rien n'est en attente d'un visa, d'un arbitrage ou d'une signature de votre part. Les listes restent consultables depuis la barre latérale."
            />
          ) : (
            <Tableau
              lignes={decisions}
              nomDesLignes="décision en attente"
              nomDesLignesPluriel="décisions en attente"
              triInitial={{ cle: 'depuis_jours', sens: 'desc' }}
              ligneSignalee={(l) => (l.depuis_jours ?? 0) >= 7}
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
                { cle: 'structure_nom', titre: 'Structure', rendu: (l) => texte(l.structure_nom) },
                {
                  cle: 'depuis_jours',
                  titre: 'En attente',
                  nombre: true,
                  rendu: (l) =>
                    typeof l.depuis_jours === 'number' ? `${nombre(l.depuis_jours)} j` : '—',
                },
              ]}
            />
          )}
        </div>
      </Section>

      <Section titre="Patrimoine">
        <RangeeChiffres>
          <Chiffre valeur={patrimoine.biens} libelle="Biens au registre" vers="/patrimoine" />
          <Chiffre
            valeur={patrimoine.immobilisations}
            libelle="Immobilisations"
            vers="/patrimoine?classement=immobilisation"
          />
          <Chiffre
            valeur={montantCourt(patrimoine.valeur_acquisition)}
            brut
            libelle="Valeur d'acquisition"
            appui="Francs congolais"
          />
          <Chiffre
            valeur={patrimoine.a_reparer}
            libelle="Biens à réparer"
            vers="/patrimoine?etat=a_reparer"
            ton="attente"
          />
          <Chiffre
            valeur={patrimoine.hors_service}
            libelle="Hors service"
            vers="/patrimoine?etat=hors_service"
            ton="critique"
          />
          <Chiffre
            valeur={patrimoine.perdus}
            libelle="Déclarés perdus"
            appui="RG-015 : le bien reste au registre"
            vers="/patrimoine?etat=perdu"
            ton="critique"
          />
        </RangeeChiffres>
      </Section>

      <Section titre="Stocks">
        <RangeeChiffres>
          <Chiffre valeur={stocks.articles} libelle="Articles suivis" vers="/stocks" />
          <Chiffre
            valeur={stocks.sous_seuil}
            libelle="Articles sous le seuil minimum"
            vers="/stocks?sous_seuil=1"
            ton="attente"
          />
          <Chiffre
            valeur={stocks.en_rupture}
            libelle="Articles en rupture"
            vers="/stocks?sous_seuil=1"
            ton="critique"
          />
        </RangeeChiffres>
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
          <Chiffre valeur={achats.dossiers_ouverts} libelle="Dossiers d'achat ouverts" />
          <Chiffre valeur={achats.bons_commande_en_cours} libelle="Bons de commande en cours" />
          <Chiffre
            valeur={montantCourt(achats.montant_engage)}
            brut
            libelle="Montant engagé"
            appui="Francs congolais"
          />
        </RangeeChiffres>
      </Section>

      <Section titre="Alertes" note="Aucune alerte ne décide : elle ouvre un examen — RG-022">
        <RangeeChiffres>
          <Chiffre
            valeur={alertes.ouvertes}
            libelle="Alertes ouvertes"
            vers="/alertes?statut=ouverte"
            ton="critique"
          />
          <Chiffre
            valeur={alertes.en_examen}
            libelle="Alertes en examen"
            vers="/alertes?statut=en_examen"
            ton="attente"
          />
          <Chiffre
            valeur={alertes.critiques}
            libelle="Gravité critique"
            vers="/alertes?gravite=critique"
            ton="critique"
          />
        </RangeeChiffres>
        {Array.isArray(t.dernieres_alertes) && t.dernieres_alertes.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <Tableau
              lignes={t.dernieres_alertes}
              nomDesLignes="alerte"
              colonnes={[
                { cle: 'code', titre: 'Code', rendu: (l) => <span className="mono">{texte(l.code)}</span> },
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
