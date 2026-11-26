import { useParams } from 'react-router-dom'
import Page, { Section } from '../components/Page.jsx'
import Definitions from '../components/Definitions.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Bouton from '../components/Bouton.jsx'
import Vide, { Chargement, Erreur } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { useRoles } from '../lib/agent.jsx'
import { date, horodatage, libelle, montant, nombre, texte } from '../lib/format.js'

/*
  La fiche d'un bien, et son historique de mouvements.
  GET /api/biens/:id puis GET /api/biens/:id/mouvements.
  Un bien ne disparaît jamais : perte et réforme le laissent au registre dans
  un état distinct — RG-015.
*/
export default function Bien() {
  const { id } = useParams()
  const { aLeRole } = useRoles()

  const fiche = useRequete((o) => api.bien(id, o), [id])
  const mouvements = useRequete((o) => api.mouvementsDuBien(id, o), [id])

  const fil = [
    { libelle: 'SIGL', to: '/' },
    { libelle: 'Patrimoine', to: '/patrimoine' },
    { libelle: fiche.donnees?.immatriculation ?? 'Bien' },
  ]

  if (fiche.chargement) {
    return (
      <Page titre="Bien" fil={fil}>
        <Chargement texte="Lecture de la fiche du bien…" />
      </Page>
    )
  }

  if (fiche.erreur) {
    return (
      <Page titre="Bien" fil={fil}>
        <Erreur
          erreur={fiche.erreur}
          surReessai={fiche.recharger}
          titre="La fiche du bien n'a pas pu être lue"
        />
      </Page>
    )
  }

  const b = fiche.donnees ?? {}
  const peutBouger = aLeRole('comptable_matieres', 'magasinier', 'intendant', 'logistique')
  const listeMouvements = depouillerListe(mouvements.donnees).lignes

  return (
    <Page
      titre={texte(b.designation)}
      sousTitre={
        <span className="mono">
          {texte(b.immatriculation)}
          {b.suivi === 'lot' ? ' · suivi par lot, sans immatriculation individuelle (RG-021)' : ''}
        </span>
      }
      fil={fil}
      actions={
        <>
          <Bouton vers="/patrimoine">Retour au registre</Bouton>
          <Bouton allure="principale" desactive={!peutBouger} titre={peutBouger ? undefined : "Votre profil n'a pas ce pouvoir"}>
            Enregistrer un mouvement
          </Bouton>
        </>
      }
    >
      <Section titre="Identification">
        <div className="carte">
          <Definitions
            entrees={[
              { cle: 'Immatriculation', valeur: <span className="mono">{texte(b.immatriculation)}</span> },
              { cle: 'Désignation', valeur: texte(b.designation) },
              { cle: 'Catégorie', valeur: texte(b.categorie_libelle ?? b.categorie_code) },
              { cle: 'Marque', valeur: texte(b.marque) },
              { cle: 'Modèle', valeur: texte(b.modele) },
              { cle: 'Numéro de série', valeur: <span className="mono">{texte(b.numero_serie)}</span> },
              { cle: 'État', valeur: <Pastille valeur={b.etat} /> },
              { cle: 'Classement', valeur: <Pastille valeur={b.classement} /> },
              { cle: 'Mode de suivi', valeur: libelle(b.suivi) },
              { cle: 'Quantité', valeur: nombre(b.quantite) },
            ]}
          />
        </div>
      </Section>

      <Section titre="Évaluation" note="IPSAS 45 et IPSAS 12">
        <div className="carte">
          <Definitions
            entrees={[
              { cle: "Mode d'entrée", valeur: libelle(b.mode_entree) },
              { cle: 'Objectif de détention', valeur: libelle(b.objectif_detention) },
              { cle: "Valeur d'acquisition", valeur: montant(b.valeur_acquisition) },
              {
                cle: 'Coût de remplacement',
                valeur:
                  b.cout_remplacement === null || b.cout_remplacement === undefined ? (
                    b.classement === 'stock' ? (
                      <span className="texte-note">
                        Non renseigné — obligatoire pour un stock distribué gratuitement (RG-012)
                      </span>
                    ) : (
                      '—'
                    )
                  ) : (
                    montant(b.cout_remplacement)
                  ),
              },
              { cle: "Date d'acquisition", valeur: date(b.date_acquisition) },
              { cle: 'Réformé le', valeur: b.reforme_le ? date(b.reforme_le) : '—' },
            ]}
          />
        </div>
      </Section>

      <Section titre="Affectation">
        <div className="carte">
          <Definitions
            entrees={[
              { cle: 'Structure', valeur: texte(b.structure_nom ?? b.structure_code) },
              { cle: 'Régime', valeur: b.structure_regime ? <Pastille valeur={b.structure_regime} /> : '—' },
              { cle: 'Site', valeur: texte(b.site_nom) },
              { cle: 'Détenteur', valeur: texte(b.detenteur_nom) },
              { cle: 'Créé le', valeur: horodatage(b.cree_le) },
              { cle: 'Dernière mise à jour', valeur: horodatage(b.maj_le) },
            ]}
          />
        </div>
      </Section>

      <Section
        titre="Historique des mouvements"
        note="Tout ce qui est arrivé au bien, du plus récent au plus ancien"
      >
        {mouvements.chargement ? (
          <Chargement texte="Lecture des mouvements…" />
        ) : mouvements.erreur ? (
          <Erreur
            erreur={mouvements.erreur}
            surReessai={mouvements.recharger}
            titre="L'historique n'a pas pu être lu"
          />
        ) : listeMouvements.length === 0 ? (
          <Vide
            titre="Aucun mouvement enregistré"
            texte="Ce bien n'a connu aucun mouvement depuis son entrée au registre. Un transfert, une maintenance, une perte ou une réforme apparaîtraient ici."
          />
        ) : (
          <Tableau
            lignes={listeMouvements}
            nomDesLignes="mouvement"
            triInitial={{ cle: 'date', sens: 'desc' }}
            colonnes={[
              { cle: 'date', titre: 'Date', nombre: true, rendu: (m) => date(m.date) },
              { cle: 'type', titre: 'Nature', rendu: (m) => libelle(m.type) },
              { cle: 'quantite', titre: 'Quantité', nombre: true, rendu: (m) => nombre(m.quantite) },
              {
                cle: 'origine',
                titre: 'De',
                rendu: (m) => (
                  <span className="cellule-faible">
                    {texte(m.structure_source_nom ?? m.detenteur_source_nom)}
                  </span>
                ),
              },
              {
                cle: 'destination',
                titre: 'Vers',
                rendu: (m) => (
                  <span className="cellule-faible">
                    {texte(m.structure_cible_nom ?? m.detenteur_cible_nom)}
                  </span>
                ),
              },
              { cle: 'motif', titre: 'Motif', rendu: (m) => texte(m.motif) },
              {
                cle: 'agent_nom',
                titre: 'Enregistré par',
                rendu: (m) => <span className="cellule-faible">{texte(m.agent_nom)}</span>,
              },
            ]}
          />
        )}
      </Section>
    </Page>
  )
}
