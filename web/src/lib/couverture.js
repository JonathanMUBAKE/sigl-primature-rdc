/*
  La conséquence d'un seuil, calculée avant qu'il soit validé.

  Tout part de la **consommation constatée** que le serveur rend avec chaque
  article : `consommation_jour`, lue dans le journal des sorties sur la fenêtre
  qu'il annonce (`resume.fenetre_consommation_jours`, 90 jours à ce jour). Rien
  n'est inventé : quand cette consommation est nulle, il n'y a pas de date
  d'alerte à annoncer, et on le dit.

  Le serveur reste seul juge de la criticité d'un article (champ `criticite`) :
  ces fonctions ne servent qu'à montrer à l'avance l'effet d'un réglage, pour
  que l'humain décide en connaissance. Elles ne décident rien.
*/

const JOUR_MS = 86_400_000

/** Les horizons de la proposition, dits à l'écran et jamais cachés. */
export const HORIZON_MINIMUM_JOURS = 30
export const HORIZON_CRITIQUE_JOURS = 10

function versNombre(valeur) {
  const n = typeof valeur === 'number' ? valeur : Number(valeur)
  return Number.isFinite(n) ? n : null
}

/**
 * Ce qu'un seuil laisse comme marge, au rythme constaté.
 * Rend `null` pour les dates et les durées quand la consommation est nulle :
 * sans sortie relevée, aucune date d'alerte n'est prévisible.
 */
export function projeter({ quantite, consommation_jour, seuil }) {
  const stock = versNombre(quantite) ?? 0
  const conso = versNombre(consommation_jour) ?? 0
  const borne = versNombre(seuil)

  if (conso <= 0) {
    return {
      consommationNulle: true,
      dejaFranchi: borne !== null && stock <= borne,
      joursAvantAlerte: null,
      dateAlerte: null,
      joursCouverture: null,
      dateRupture: null,
    }
  }

  const joursCouverture = Math.floor(stock / conso)
  const dateRupture = new Date(Date.now() + (stock / conso) * JOUR_MS)

  if (borne === null) {
    return {
      consommationNulle: false,
      dejaFranchi: false,
      joursAvantAlerte: null,
      dateAlerte: null,
      joursCouverture,
      dateRupture,
    }
  }

  const dejaFranchi = stock <= borne
  const joursAvantAlerte = dejaFranchi ? 0 : Math.floor((stock - borne) / conso)
  return {
    consommationNulle: false,
    dejaFranchi,
    joursAvantAlerte,
    dateAlerte: new Date(Date.now() + joursAvantAlerte * JOUR_MS),
    joursCouverture,
    dateRupture,
  }
}

/**
 * La proposition offerte à l'humain, calculée sur la consommation constatée.
 * Jamais appliquée seule : elle se recopie dans les champs, où elle se corrige.
 * Rend `null` quand la consommation constatée est nulle — on ne propose pas un
 * chiffre tiré de rien.
 */
export function proposerSeuils({ consommation_jour }) {
  const conso = versNombre(consommation_jour) ?? 0
  if (conso <= 0) return null
  const minimum = Math.max(1, Math.ceil(conso * HORIZON_MINIMUM_JOURS))
  const critique = Math.max(1, Math.ceil(conso * HORIZON_CRITIQUE_JOURS))
  return {
    seuil_minimum: minimum,
    // Le critique est, par construction du serveur, le plus bas des deux.
    seuil_critique: Math.min(critique, minimum),
    horizon_minimum_jours: HORIZON_MINIMUM_JOURS,
    horizon_critique_jours: HORIZON_CRITIQUE_JOURS,
  }
}

/** Les réglages de seuil déjà tracés, quelle que soit la route qui les sert. */
export function reglagesTraces(article) {
  if (Array.isArray(article?.historique_seuils)) return article.historique_seuils
  const historique = Array.isArray(article?.historique) ? article.historique : []
  return historique
    .filter((l) => l.action === 'reglage_seuils_stock')
    .map((l) => ({
      horodatage: l.horodatage,
      agent_id: l.agent_id ?? null,
      agent_nom: l.agent_nom ?? null,
      agent_fonction: null,
      seuil_minimum_avant: l.avant?.seuil_minimum ?? null,
      seuil_minimum_apres: l.apres?.seuil_minimum ?? null,
      seuil_critique_avant: l.avant?.seuil_critique ?? null,
      seuil_critique_apres: l.apres?.seuil_critique ?? null,
      variation_minimum:
        Number(l.apres?.seuil_minimum ?? 0) - Number(l.avant?.seuil_minimum ?? 0),
      variation_critique:
        Number(l.apres?.seuil_critique ?? 0) - Number(l.avant?.seuil_critique ?? 0),
    }))
}

export default { projeter, proposerSeuils, reglagesTraces, HORIZON_MINIMUM_JOURS, HORIZON_CRITIQUE_JOURS }
