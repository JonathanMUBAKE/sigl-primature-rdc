// La consommation constatée, lue dans le journal — une seule fois pour tout le
// serveur.
//
// POURQUOI CE MODULE EXISTE. La politique `journal_lecture` de l'ADR-001
// réserve le journal au mode consolidation : le journal ne porte pas de
// `structure_id`, il ne peut donc pas être filtré par structure dans la
// politique, et il est fermé plutôt qu'entrouvert. Lu sous une transaction
// métier ordinaire, il ne rend **rien** — sans erreur, sans trace, zéro ligne.
//
// Conséquence constatée : le magasinier et le comptable des matières, qui sont
// précisément ceux qui règlent les seuils et tiennent l'inventaire, voyaient
// leur consommation constatée toujours vide. Donc ni jours de couverture, ni
// date de rupture prévisible, ni proposition de seuil. Une politique de
// sécurité correcte vidait une fonction métier de son contenu, et aucun essai
// ne le voyait parce que les essais interrogeaient le serveur avec les droits
// qu'il faut.
//
// L'écran des stocks avait été corrigé par une lecture nommée. Le tableau de
// bord, lui, portait encore la même faute dans son propre SQL : ses articles à
// surveiller et son compte de « rupture sous 30 jours » restaient vides pour
// tout agent sans portée totale. La lecture est donc remontée ici, et les deux
// appelants emploient la même.
//
// CE QU'ELLE S'AUTORISE, ET RIEN DE PLUS. La lecture est consolidée mais
// **strictement bornée** : uniquement l'action `sortie_stock`, uniquement
// l'objet `stock`, uniquement les articles dont les identifiants lui sont
// passés — c'est-à-dire ceux que le cloisonnement a déjà laissé passer en
// amont. Le journal dans son ensemble reste réservé au contrôle externe, par
// `GET /api/journal`.

import { enConsolidation, lireTous } from './_sql.js';

export const FENETRE_CONSOMMATION_JOURS = 90;

/**
 * La consommation journalière constatée, par article.
 *
 * `identifiants` : les identifiants des articles **déjà filtrés** par le
 * périmètre de l'agent. Rend une `Map` indexée par identifiant en chaîne.
 */
export async function consommationConstatee(request, identifiants, jours = FENETRE_CONSOMMATION_JOURS) {
  if (identifiants.length === 0) return new Map();
  const places = identifiants.map((_, i) => `$${i + 1}`).join(', ');
  const lignes = await enConsolidation(request, () => lireTous(request,
    `select objet_id,
            sum(coalesce((apres->>'quantite_sortie')::numeric, 0)) as sortie_totale,
            count(*)::int as nombre_sorties,
            max(horodatage) as derniere_sortie
       from journal
      where action = 'sortie_stock'
        and objet_type = 'stock'
        and objet_id in (${places})
        and horodatage > now() - ($${identifiants.length + 1} || ' days')::interval
      group by objet_id`,
    [...identifiants.map(String), String(jours)],
  ));
  const carte = new Map();
  for (const l of lignes) {
    const total = Number(l.sortie_totale ?? 0);
    carte.set(String(l.objet_id), {
      sortie_totale: total,
      nombre_sorties: l.nombre_sorties,
      derniere_sortie: l.derniere_sortie,
      consommation_jour: total > 0 ? Number((total / jours).toFixed(4)) : 0,
    });
  }
  return carte;
}

/**
 * L'historique des réglages de seuil d'un article.
 *
 * Même lecture nommée que la consommation, et aussi bornée : une seule action,
 * un seul article — celui que le cloisonnement a déjà laissé passer. L'écran de
 * réglage des seuils doit montrer qui a bougé quoi, quand, et de combien : un
 * seuil minimum porté de 40 à 5 la veille d'une rupture est une information,
 * pas un détail.
 */
export async function historiqueSeuils(request, articleId, limite = 50) {
  const lignes = await enConsolidation(request, () => lireTous(request,
    `select j.horodatage, j.avant, j.apres, j.agent_id, a.nom as agent_nom, a.fonction
       from journal j left join agent a on a.id = j.agent_id
      where j.action = 'reglage_seuils_stock'
        and j.objet_type = 'stock' and j.objet_id = $1
      order by j.horodatage desc limit $2`,
    [String(articleId), limite],
  ));
  return lignes.map((l) => ({
    horodatage: l.horodatage,
    agent_id: l.agent_id,
    agent_nom: l.agent_nom,
    agent_fonction: l.fonction ?? null,
    seuil_minimum_avant: l.avant?.seuil_minimum ?? null,
    seuil_minimum_apres: l.apres?.seuil_minimum ?? null,
    seuil_critique_avant: l.avant?.seuil_critique ?? null,
    seuil_critique_apres: l.apres?.seuil_critique ?? null,
    variation_minimum: Number(l.apres?.seuil_minimum ?? 0) - Number(l.avant?.seuil_minimum ?? 0),
    variation_critique: Number(l.apres?.seuil_critique ?? 0) - Number(l.avant?.seuil_critique ?? 0),
  }));
}
