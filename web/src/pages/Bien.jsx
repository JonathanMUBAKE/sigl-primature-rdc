import Tiroir from '../components/Tiroir.jsx'
import Definitions from '../components/Definitions.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Bouton from '../components/Bouton.jsx'
import { Chargement, Erreur } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { useRoles } from '../lib/agent.jsx'
import { date, horodatage, libelle, montant, nombre, texte } from '../lib/format.js'

/*
  La fiche d'un bien, dans un tiroir latéral : la liste reste sous les yeux.
  GET /api/biens/:id puis GET /api/biens/:id/mouvements.
  Un bien ne disparaît jamais : perte et réforme le laissent au registre dans
  un état distinct — RG-015.
*/
export default function FicheBien({ id, surFermeture }) {
  const { aLeRole } = useRoles()
  const fiche = useRequete((o) => api.bien(id, o), [id])
  const mouvements = useRequete((o) => api.mouvementsDuBien(id, o), [id])

  const b = fiche.donnees ?? {}
  const peutBouger = aLeRole('comptable_matieres', 'magasinier', 'intendant', 'logistique')
  const listeMouvements = depouillerListe(mouvements.donnees).lignes

  return (
    <Tiroir
      ouvert
      surFermeture={surFermeture}
      surTitre="Bien du registre"
      titre={fiche.chargement ? 'Chargement…' : texte(b.designation)}
      sousTitre={
        fiche.chargement ? null : (
          <span className="mono">
            {texte(b.immatriculation)}
            {b.suivi === 'lot' ? ' · suivi par lot — RG-021' : ''}
          </span>
        )
      }
      pied={
        <>
          <Bouton surClic={surFermeture}>Fermer</Bouton>
          <Bouton
            allure="principale"
            desactive={!peutBouger || fiche.chargement}
            titre={peutBouger ? undefined : "Votre profil n'a pas ce pouvoir"}
          >
            Enregistrer un mouvement
          </Bouton>
        </>
      }
    >
      {fiche.chargement ? (
        <Chargement texte="Lecture de la fiche du bien…" />
      ) : fiche.erreur ? (
        <Erreur
          erreur={fiche.erreur}
          surReessai={fiche.recharger}
          titre="La fiche du bien n'a pas pu être lue"
        />
      ) : (
        <>
          <h3 className="section-titre">Identification</h3>
          <div className="marge-dessus-3">
            <Definitions
              entrees={[
                {
                  cle: 'Immatriculation',
                  valeur: <span className="mono">{texte(b.immatriculation)}</span>,
                },
                { cle: 'Catégorie', valeur: texte(b.categorie_libelle ?? b.categorie_code) },
                { cle: 'Marque', valeur: texte(b.marque) },
                { cle: 'Modèle', valeur: texte(b.modele) },
                {
                  cle: 'Numéro de série',
                  valeur: <span className="mono">{texte(b.numero_serie)}</span>,
                },
                { cle: 'État', valeur: <Pastille valeur={b.etat} /> },
                { cle: 'Classement', valeur: <Pastille valeur={b.classement} /> },
                { cle: 'Mode de suivi', valeur: libelle(b.suivi) },
                { cle: 'Quantité', valeur: nombre(b.quantite) },
              ]}
            />
          </div>

          <h3 className="section-titre separe-dessus">Évaluation</h3>
          <div className="marge-dessus-3">
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
                        <span className="texte-note">Non renseigné — RG-012</span>
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

          <h3 className="section-titre separe-dessus">Affectation</h3>
          <div className="marge-dessus-3">
            <Definitions
              entrees={[
                { cle: 'Structure', valeur: texte(b.structure_nom ?? b.structure_code) },
                {
                  cle: 'Régime',
                  valeur: b.structure_regime ? <Pastille valeur={b.structure_regime} /> : '—',
                },
                { cle: 'Site', valeur: texte(b.site_nom) },
                { cle: 'Détenteur', valeur: texte(b.detenteur_nom) },
                { cle: 'Créé le', valeur: horodatage(b.cree_le) },
                { cle: 'Mis à jour le', valeur: horodatage(b.maj_le) },
              ]}
            />
          </div>

          <h3 className="section-titre separe-dessus">Historique des mouvements</h3>
          <div className="marge-dessus-3">
            {mouvements.chargement ? (
              <Chargement texte="Lecture des mouvements…" />
            ) : mouvements.erreur ? (
              <Erreur
                erreur={mouvements.erreur}
                surReessai={mouvements.recharger}
                titre="L'historique n'a pas pu être lu"
              />
            ) : (
              <Tableau
                lignes={listeMouvements}
                nomDesLignes="mouvement"
                triInitial={{ cle: 'date', sens: 'desc' }}
                titreVide="Aucun mouvement"
                texteVide="Ce bien n'a connu aucun mouvement depuis son entrée au registre."
                colonnes={[
                  { cle: 'date', titre: 'Date', nombre: true, rendu: (m) => date(m.date) },
                  {
                    cle: 'type',
                    titre: 'Nature',
                    rendu: (m) => (
                      <span className="cellule-deux-lignes">
                        <span>{libelle(m.type)}</span>
                        <span className="texte-note">{texte(m.motif)}</span>
                      </span>
                    ),
                  },
                  {
                    cle: 'quantite',
                    titre: 'Quantité',
                    nombre: true,
                    rendu: (m) => nombre(m.quantite),
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
                ]}
              />
            )}
          </div>
        </>
      )}
    </Tiroir>
  )
}
