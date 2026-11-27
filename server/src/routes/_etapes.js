// Les étapes de la chaîne de la dépense, dites une seule fois.
//
// POURQUOI CE MODULE EXISTE. Le poste de commande annonce « Livraisons
// attendues : 2 », l'agent clique, et la liste lui en rend trois. Le chiffre
// n'est pas faux et la liste non plus : ce sont deux phrases différentes
// écrites à deux endroits, qui ont fini par ne plus dire la même chose. RG-038
// exige qu'un chiffre porte le lien de la liste **qui le compose** ; or une
// liste ne compose un chiffre que si elle est le même prédicat. Un agent qui
// voit « 2 » puis trouve trois lignes ne corrige pas le logiciel : il cesse de
// s'y fier.
//
// Ces trois fonctions rendent donc le fragment SQL de chaque étape, et les deux
// bouts — le compte du tableau de bord et le filtre de la liste — l'emploient.
// Le jour où une étape change, elle change une fois.
//
// LES TROIS ÉTAPES, dans l'ordre du décret 13/050 art. 137 :
//   réception → PV de réception signé → prise en charge à l'inventaire →
//   certificat de prise en charge → paiement possible.
//
// L'alias de la table est passé en argument parce que les appelants ne nomment
// pas leurs tables de la même façon, et qu'un alias deviné en silence est une
// panne au premier changement de requête.

/**
 * Le bon de commande qui **attend sa réception** : aucun PV de réception ne le
 * vise encore.
 *
 * Ce n'est pas « les statuts `emis`, `accepte` et `livre_partiel` », qui était
 * l'ancienne définition du chiffre 2 : un bon passé `livre` dont le PV n'a
 * jamais été dressé attend bel et bien sa réception, et la liste le montrait
 * quand le chiffre l'ignorait. Le statut dit où le bon est censé en être ; le
 * PV dit ce qui a réellement été constaté. C'est le constat qui compte.
 *
 * `annule` est exclu : un bon annulé n'attend plus rien.
 */
export function bonSansPv(bon = 'bc') {
  return `${bon}.statut <> 'annule'
      and not exists (select 1 from document pv
                       where pv.type = 'pv_reception'
                         and pv.objet_type = 'bon_commande'
                         and pv.objet_id = ${bon}.id::text)`;
}

/**
 * Le PV de réception qui **attend sa prise en charge** : aucun certificat de
 * prise en charge ne vise le même objet (RG-010).
 *
 * Le rapprochement se fait sur `objet_type` et `objet_id`, et non sur un lien
 * de parenté entre pièces : c'est l'objet pris en charge qui compte, et un
 * certificat rectificatif ne doit pas faire réapparaître la file.
 */
export function pvSansCertificat(pv = 'd') {
  return `not exists (select 1 from document c
                       where c.type = 'certificat_prise_en_charge'
                         and c.objet_type = ${pv}.objet_type
                         and c.objet_id = ${pv}.objet_id)`;
}

/**
 * Le bon de commande qui **attend que son paiement soit marqué possible** : son
 * certificat de prise en charge est émis, et il n'est ni `payable` ni `paye`.
 *
 * Ce n'est pas `statut = 'receptionne'`, et la nuance n'est pas théorique :
 * `POST /api/prises-en-charge` émet le certificat **sans** faire bouger le
 * statut du bon. Un bon `receptionne` sans certificat est donc à l'étape
 * précédente — il attend le comptable des matières, pas le comptable public —
 * et RG-011 interdit précisément de marquer son paiement possible. Les deux
 * comptes coïncident par hasard sur le jeu de démonstration ; ils divergent dès
 * qu'une réception reste un jour sans sa prise en charge, c'est-à-dire tous les
 * jours.
 */
export function bonAttendPaiement(bon = 'bc') {
  return `${bon}.statut not in ('payable', 'paye', 'annule')
      and exists (select 1 from document c
                   where c.type = 'certificat_prise_en_charge'
                     and c.objet_type = 'bon_commande'
                     and c.objet_id = ${bon}.id::text)`;
}
