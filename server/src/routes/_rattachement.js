// Le refus motivé, plutôt que « introuvable ».
//
// Une brique, et non un geste recopié : écrite une fois, appelée partout. Seul
// l'objet varie d'un appel à l'autre — elle a d'abord servi la chaîne d'achat,
// elle sert maintenant la reprise, et elle servira toute table que le
// cloisonnement de la base rendra invisible.
//
// LE PROBLÈME. Quand une table est cloisonnée par la sécurité au niveau des
// lignes, une ligne hors périmètre n'est pas rendue : la lecture ne distingue
// plus « cette pièce n'existe pas » de « cette pièce n'est pas à vous ». La
// route répondrait donc « introuvable » à un refus volontaire — et un
// « introuvable » se lit comme une panne du logiciel. L'agent appelle le
// support au lieu de comprendre qu'il consulte ce qui ne le concerne pas.
//
// LA SOLUTION, ET SON PRIX. `sigl_structure_rattachement` est une fonction
// `security definer` volontairement étroite : elle rend **l'identifiant de la
// structure concernée et rien d'autre** — une donnée que tout agent lit déjà
// dans l'organigramme —, jamais une donnée de la pièce elle-même. C'est le prix
// du 403 / RG-017 explicite, préféré à un 404 trompeur.

import { lireUn } from './_sql.js';
import { verifierLectureStricte } from './_droits.js';
import { nonTrouve } from './_commun.js';

/**
 * À appeler **seulement** quand la lecture n'a rien rendu. Lève soit le refus
 * nommé (403, RG-017), soit l'absence (404) — jamais rien d'autre.
 *
 * @param objet 'dossier_achat' | 'bon_commande' | 'reprise'
 */
export async function refuserOuIntrouvable(request, objet, id, quoi) {
  const rattachement = await lireUn(
    request, 'select sigl_structure_rattachement($1, $2) as structure_id', [objet, id],
  );
  if (!rattachement?.structure_id) throw nonTrouve(quoi);
  await verifierLectureStricte(request, rattachement.structure_id, quoi);
  // La pièce existe, elle est dans le périmètre, et la lecture ne l'a pourtant
  // pas rendue : il n'y a rien d'honnête à répondre d'autre que l'absence.
  throw nonTrouve(quoi);
}
