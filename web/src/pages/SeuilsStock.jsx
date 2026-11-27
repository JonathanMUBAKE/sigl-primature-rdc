import { useEffect, useMemo, useState } from 'react'
import { Save, Wand2 } from 'lucide-react'
import Tiroir from '../components/Tiroir.jsx'
import Definitions from '../components/Definitions.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Bouton from '../components/Bouton.jsx'
import Champ from '../components/Champ.jsx'
import { Chargement, Erreur } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete } from '../lib/requete.js'
import { useRoles } from '../lib/agent.jsx'
import { useFlux } from '../lib/flux.js'
import { date, dateEnClair, horodatage, jours, nombre, texte } from '../lib/format.js'
import { projeter, proposerSeuils, reglagesTraces } from '../lib/couverture.js'

/*
  Le réglage des seuils d'un article de stock — PATCH /api/stocks/:id/seuils.

  Trois exigences, et elles tiennent ensemble :
  — **la conséquence se voit avant d'être validée** : à partir de la
    consommation constatée que le serveur rend (`consommation_jour`, lue dans le
    journal des sorties), on dit combien de jours le nouveau seuil laisse et à
    quelle date l'alerte se déclencherait. Quand la consommation constatée est
    nulle, il n'y a pas de date à annoncer, et on le dit plutôt que d'en forger
    une ;
  — **une proposition est offerte**, calculée sur cette même consommation, que
    l'humain reprend ou corrige. Elle n'est jamais appliquée seule : rien ne
    part au serveur sans un clic ;
  — **le changement est tracé et visible** : le serveur journalise l'avant et
    l'après (action `reglage_seuils_stock`, RG-020) et les rend avec l'article.
    Un seuil abaissé juste avant une rupture est exactement ce qu'un contrôleur
    viendra regarder : les baisses sont signalées.

  Le serveur garde l'autorité : il refuse un seuil critique supérieur au seuil
  minimum, et son message français est affiché tel quel.
*/

const ROLES_DE_REGLAGE = ['magasinier', 'comptable_matieres', 'logistique']

export default function SeuilsStock({ id, fenetreJours, surFermeture, surEnregistrement }) {
  const { aLeRole } = useRoles()
  const fiche = useRequete((o) => api.stock(id, o), [id])
  useFlux(['stocks'], (evenement) => {
    if (!evenement.id || String(evenement.id) === String(id)) fiche.recharger()
  })

  const article = fiche.donnees ?? null

  const [minimum, setMinimum] = useState('')
  const [critique, setCritique] = useState('')
  const [charge, setCharge] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [enregistre, setEnregistre] = useState(null)

  // Les champs partent des valeurs en place, une seule fois : ensuite, c'est
  // la saisie de l'agent qui commande.
  useEffect(() => {
    if (charge || !article) return
    setMinimum(String(article.seuil_minimum ?? 0))
    setCritique(String(article.seuil_critique ?? 0))
    setCharge(true)
  }, [charge, article])

  const proposition = useMemo(
    () => (article ? proposerSeuils({ consommation_jour: article.consommation_jour }) : null),
    [article],
  )

  const nombreMinimum = entier(minimum)
  const nombreCritique = entier(critique)

  const apercuMinimum = useMemo(
    () =>
      article
        ? projeter({
            quantite: article.quantite,
            consommation_jour: article.consommation_jour,
            seuil: nombreMinimum,
          })
        : null,
    [article, nombreMinimum],
  )
  const apercuCritique = useMemo(
    () =>
      article
        ? projeter({
            quantite: article.quantite,
            consommation_jour: article.consommation_jour,
            seuil: nombreCritique,
          })
        : null,
    [article, nombreCritique],
  )

  const erreurCritique =
    nombreMinimum !== null && nombreCritique !== null && nombreCritique > nombreMinimum
      ? 'Le seuil critique est le plus bas des deux : portez-le au niveau du seuil minimum ou en dessous. Le serveur refuserait le réglage.'
      : null

  const inchange =
    article &&
    nombreMinimum === Number(article.seuil_minimum ?? 0) &&
    nombreCritique === Number(article.seuil_critique ?? 0)

  const peutRegler = aLeRole(...ROLES_DE_REGLAGE)
  const raison = !peutRegler
    ? 'Le réglage des seuils revient au magasinier, au comptable des matières ou au chargé de logistique.'
    : nombreMinimum === null || nombreCritique === null
      ? 'Saisissez deux entiers positifs.'
      : erreurCritique
        ? 'Corrigez le seuil critique avant d’enregistrer.'
        : inchange
          ? 'Les seuils sont inchangés : il n’y a rien à enregistrer.'
          : null

  async function enregistrer() {
    setEnvoi(true)
    setErreur(null)
    setEnregistre(null)
    try {
      const resultat = await api.reglerSeuils(id, {
        seuil_minimum: nombreMinimum,
        seuil_critique: nombreCritique,
      })
      setEnregistre(resultat)
      fiche.recharger()
      surEnregistrement?.()
    } catch (cause) {
      setErreur(cause)
    } finally {
      setEnvoi(false)
    }
  }

  const reglages = useMemo(() => reglagesTraces(article), [article])
  const fenetre = fenetreJours ?? 90

  return (
    <Tiroir
      ouvert
      surFermeture={surFermeture}
      surTitre="Seuils de l'article"
      titre={fiche.chargement ? 'Chargement…' : texte(article?.designation)}
      sousTitre={
        fiche.chargement
          ? null
          : `${texte(article?.categorie_libelle)} · ${texte(article?.site_nom)} · ${texte(article?.structure_code)}`
      }
      pied={
        <Bouton
          allure="principale"
          icone={Save}
          desactive={Boolean(raison) || envoi}
          titre={raison ?? undefined}
          surClic={enregistrer}
        >
          {envoi ? 'Enregistrement…' : 'Enregistrer les seuils'}
        </Bouton>
      }
    >
      {fiche.chargement ? (
        <Chargement texte="Lecture de l'article de stock…" />
      ) : fiche.erreur ? (
        <Erreur
          erreur={fiche.erreur}
          surReessai={fiche.recharger}
          titre="L'article de stock n'a pas pu être lu"
        />
      ) : (
        <>
          <h3 className="section-titre">Ce qui est constaté</h3>
          <div className="marge-dessus-3">
            <Definitions
              entrees={[
                { cle: 'Tension', valeur: <Pastille valeur={article.criticite} /> },
                {
                  cle: 'En stock',
                  valeur: `${nombre(article.quantite)} ${texte(article.unite)}`,
                },
                { cle: 'Seuil minimum en place', valeur: nombre(article.seuil_minimum) },
                { cle: 'Seuil critique en place', valeur: nombre(article.seuil_critique) },
                {
                  cle: 'Consommation constatée',
                  valeur:
                    Number(article.consommation_jour ?? 0) > 0
                      ? `${nombre(article.consommation_jour)} par jour · ${nombre(article.consommation_mois)} par mois`
                      : `Nulle sur les ${jours(fenetre)} observés`,
                },
                {
                  cle: 'Sorties relevées',
                  valeur: `${nombre(article.sorties_fenetre)} sur ${jours(fenetre)}`,
                },
                { cle: 'Dernière sortie', valeur: horodatage(article.derniere_sortie) },
                {
                  cle: 'Couverture restante',
                  valeur:
                    article.jours_couverture === null || article.jours_couverture === undefined
                      ? 'Non prévisible sans consommation'
                      : jours(article.jours_couverture),
                },
                { cle: 'Rupture prévue', valeur: date(article.date_rupture_prevue) },
                { cle: 'Dernière mise à jour', valeur: horodatage(article.maj_le) },
              ]}
            />
          </div>

          <h3 className="section-titre separe-dessus">La proposition</h3>
          {proposition ? (
            <>
              <p className="marge-dessus-3 largeur-propos texte-faible">
                Calculée sur la consommation constatée :{' '}
                <strong>{nombre(proposition.seuil_minimum)}</strong> pour le seuil
                minimum, soit {jours(proposition.horizon_minimum_jours)} de
                couverture, et <strong>{nombre(proposition.seuil_critique)}</strong>{' '}
                pour le seuil critique, soit {jours(proposition.horizon_critique_jours)}.
                Elle n'est jamais appliquée seule : reprenez-la, ou corrigez-la.
              </p>
              <div className="marge-dessus-3">
                <Bouton
                  icone={Wand2}
                  surClic={() => {
                    setMinimum(String(proposition.seuil_minimum))
                    setCritique(String(proposition.seuil_critique))
                  }}
                >
                  Reprendre la proposition
                </Bouton>
              </div>
            </>
          ) : (
            <p className="marge-dessus-3 largeur-propos texte-faible">
              Aucune sortie n'a été relevée au journal sur les {jours(fenetre)}{' '}
              observés : la consommation constatée est nulle, et aucune
              proposition ne peut être calculée sans elle. Réglez les seuils à la
              main, ou attendez les premières sorties.
            </p>
          )}

          <h3 className="section-titre separe-dessus">Le réglage, et sa conséquence</h3>
          <div className="marge-dessus-3 largeur-formulaire pile">
            <Champ
              libelle="Seuil minimum"
              type="number"
              min={0}
              valeur={minimum}
              surChangement={setMinimum}
              obligatoire
              aide="Au-dessous de ce niveau, l'article est signalé comme sous son seuil minimum."
            />
            <Champ
              libelle="Seuil critique"
              type="number"
              min={0}
              valeur={critique}
              surChangement={setCritique}
              obligatoire
              erreur={erreurCritique}
              aide="Le plus bas des deux : c'est le niveau où la tension devient critique."
            />
          </div>

          <div className="marge-dessus-3">
            <Tableau
              lignes={[
                { cle: 'minimum', nom: 'Seuil minimum', seuil: nombreMinimum, apercu: apercuMinimum },
                { cle: 'critique', nom: 'Seuil critique', seuil: nombreCritique, apercu: apercuCritique },
              ]}
              cleDeLigne={(l) => l.cle}
              nomDesLignes="seuil"
              ligneSignalee={(l) => Boolean(l.apercu?.dejaFranchi)}
              colonnes={[
                { cle: 'nom', titre: 'Seuil', triable: false, rendu: (l) => l.nom },
                {
                  cle: 'seuil',
                  titre: 'Niveau saisi',
                  nombre: true,
                  triable: false,
                  rendu: (l) => (l.seuil === null ? '—' : nombre(l.seuil)),
                },
                {
                  cle: 'marge',
                  titre: 'Jours de couverture laissés',
                  nombre: true,
                  triable: false,
                  rendu: (l) =>
                    l.apercu?.consommationNulle
                      ? 'Non prévisible'
                      : l.apercu?.joursAvantAlerte === null
                        ? '—'
                        : jours(l.apercu.joursAvantAlerte),
                },
                {
                  cle: 'alerte',
                  titre: "Date de déclenchement de l'alerte",
                  triable: false,
                  rendu: (l) =>
                    l.apercu?.consommationNulle
                      ? 'Aucune date prévisible'
                      : l.apercu?.dejaFranchi
                        ? 'Immédiatement : le seuil est déjà franchi'
                        : l.apercu?.dateAlerte
                          ? dateEnClair(l.apercu.dateAlerte)
                          : '—',
                },
              ]}
              pied={
                apercuMinimum?.consommationNulle
                  ? `Sans consommation constatée sur les ${jours(fenetre)} observés, aucune date d'alerte n'est prévisible : ces seuils ne s'appliqueront qu'à la prochaine sortie.`
                  : `Au rythme constaté, l'article tient encore ${jours(apercuMinimum?.joursCouverture ?? 0)} et serait en rupture le ${dateEnClair(apercuMinimum?.dateRupture)}.`
              }
            />
          </div>

          {enregistre ? (
            <div className="marge-dessus-3 texte-note largeur-propos">
              Enregistré : seuil minimum {nombre(enregistre.seuil_minimum)}, seuil
              critique {nombre(enregistre.seuil_critique)}. Le journal en garde
              l'avant et l'après, et le réglage apparaît ci-dessous.
            </div>
          ) : null}
          {erreur ? (
            <div className="marge-dessus-3">
              <Erreur erreur={erreur} titre="Le serveur a refusé le réglage" />
            </div>
          ) : null}

          <h3 className="section-titre separe-dessus">Les réglages déjà tracés</h3>
          <div className="marge-dessus-3">
            <Tableau
              lignes={reglages}
              cleDeLigne={(l, i) => `${l.horodatage}-${i}`}
              nomDesLignes="réglage"
              titreVide="Aucun réglage"
              texteVide="Les seuils de cet article n'ont jamais été modifiés : ce sont ceux de son initialisation. Tout changement serait journalisé — qui, quand, et les anciennes valeurs (RG-020)."
              ligneSignalee={(l) => l.variation_minimum < 0 || l.variation_critique < 0}
              triInitial={{ cle: 'horodatage', sens: 'desc' }}
              colonnes={[
                {
                  cle: 'horodatage',
                  titre: 'Quand',
                  nombre: true,
                  rendu: (l) => horodatage(l.horodatage),
                },
                {
                  cle: 'agent_nom',
                  titre: 'Qui',
                  rendu: (l) => (
                    <span className="cellule-deux-lignes">
                      <span>{texte(l.agent_nom)}</span>
                      <span className="texte-note">{texte(l.agent_fonction)}</span>
                    </span>
                  ),
                },
                {
                  cle: 'minimum',
                  titre: 'Seuil minimum',
                  nombre: true,
                  valeur: (l) => Number(l.variation_minimum ?? 0),
                  rendu: (l) =>
                    `${nombre(l.seuil_minimum_avant)} → ${nombre(l.seuil_minimum_apres)}`,
                },
                {
                  cle: 'critique',
                  titre: 'Seuil critique',
                  nombre: true,
                  valeur: (l) => Number(l.variation_critique ?? 0),
                  rendu: (l) =>
                    `${nombre(l.seuil_critique_avant)} → ${nombre(l.seuil_critique_apres)}`,
                },
                {
                  cle: 'sens',
                  titre: 'Sens',
                  triable: false,
                  rendu: (l) =>
                    l.variation_minimum < 0 || l.variation_critique < 0 ? (
                      <Pastille valeur="attention" texte="Seuil abaissé" />
                    ) : l.variation_minimum > 0 || l.variation_critique > 0 ? (
                      <Pastille valeur="normal" texte="Seuil relevé" />
                    ) : (
                      <Pastille valeur="classee" texte="Sans effet" />
                    ),
                },
              ]}
              pied={`${nombre(reglages.length)} réglage(s) journalisé(s) · les lignes signalées abaissent un seuil, ce qu'un contrôle viendra regarder`}
            />
          </div>
        </>
      )}
    </Tiroir>
  )
}

function entier(valeur) {
  if (valeur === '' || valeur === null || valeur === undefined) return null
  const n = Number(valeur)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null
  return n
}
