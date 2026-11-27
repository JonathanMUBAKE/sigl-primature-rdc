// Les alertes. RG-022 : aucune alerte ne décide quoi que ce soit. Elle ouvre un
// examen, un humain tranche, et la suite est conservée.
// Lever une alerte n'écrit donc jamais dans un objet métier.


import { un } from '../db.js';

/** Les statuts où l'alerte n'est pas encore tranchée par un humain. */
export const STATUTS_EN_COURS = ['ouverte', 'en_examen'];

/**
 * La nature d'une alerte, dite explicitement — l'interface n'a pas à la
 * déduire du contenu de `donnees`.
 *
 * Trois natures, et elles ne demandent pas la même chose au magasinier :
 *   `active`    la condition est toujours réunie : ça brûle ;
 *   `a_classer` la condition a été levée depuis (le stock est repassé
 *               au-dessus du seuil) mais personne n'a encore classé l'alerte.
 *               Le système ne la referme pas de lui-même — RG-022, un humain
 *               tranche — et depuis la migration 020000 elle ne fait plus
 *               taire une rupture nouvelle ;
 *   `tranchee`  un humain s'est prononcé : justifiée, confirmée ou classée.
 *
 * Le tableau de bord peut ainsi montrer d'un côté ce qui brûle, de l'autre ce
 * qui attend seulement d'être classé.
 */
export function avecNature(alerte) {
  if (!alerte) return alerte;
  const donnees = alerte.donnees ?? {};
  const enCours = STATUTS_EN_COURS.includes(alerte.statut);
  const leveeLe = donnees.condition_levee_le ?? null;
  return {
    ...alerte,
    en_cours: enCours,
    condition_levee: Boolean(leveeLe),
    condition_levee_le: leveeLe,
    quantite_au_retour: donnees.quantite_au_retour ?? null,
    nature: !enCours ? 'tranchee' : (leveeLe ? 'a_classer' : 'active'),
  };
}

/**
 * Ouvre une alerte. Rien d'autre : l'état du dossier concerné n'est pas touché.
 * Appelée par les routes qui bloquent (RG-008) ou qui constatent un écart.
 */
export async function leverAlerte({
  code, gravite = 'attention', structure_id, objet_type, objet_id = null, explication, donnees = {},
}) {
  return un(
    `insert into alerte (code, gravite, structure_id, objet_type, objet_id, explication, donnees)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, code, gravite, structure_id, objet_type, objet_id, explication, donnees, statut, cree_le`,
    [
      code,
      gravite,
      structure_id,
      objet_type,
      objet_id === null ? null : String(objet_id),
      explication,
      JSON.stringify(donnees),
    ],
  );
}
