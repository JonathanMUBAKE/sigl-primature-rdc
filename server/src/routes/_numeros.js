// Les numéros métier sont lisibles et générés par le serveur, jamais saisis
// (contrat §1-6). Les compteurs vivent dans `sequence_document` et
// `sequence_immatriculation`.


import { un } from '../db.js';

export const PREFIXES = {
  etat_besoin: 'EB',
  decision_examen: 'DE',
  dossier_achat: 'DA',
  bon_commande: 'BC',
  pv_reception: 'PV',
  certificat_prise_en_charge: 'CPC',
  bon_livraison: 'BL',
  accuse_reception: 'AR',
  acte_transfert: 'AT',
  pv_perte: 'PVP',
  pv_reforme: 'PVR',
  etat_inventaire: 'INV',
  // Le lot « inventaire » : la campagne et le rapprochement contradictoire
  // portent leur propre série, comme toute pièce numérotée du SIGL.
  campagne_inventaire: 'CI',
  rapprochement: 'RAP',
};

/** Le prochain numéro d'une série, pour l'année donnée : EB-2026-00017. */
export async function prochainNumero(type, annee = new Date().getFullYear()) {
  const prefixe = PREFIXES[type] ?? String(type).slice(0, 3).toUpperCase();
  const ligne = await un(
    `insert into sequence_document (prefixe, annee, dernier) values ($1, $2, 1)
     on conflict (prefixe, annee) do update set dernier = sequence_document.dernier + 1
     returning dernier`,
    [prefixe, annee],
  );
  return `${prefixe}-${annee}-${String(ligne.dernier).padStart(5, '0')}`;
}

/**
 * L'immatriculation d'un bien : format GIAI simplifié
 * BRT-<code structure>-<préfixe catégorie>-<séquence 5>.
 * RG-021 : un bien suivi en lot n'en reçoit pas.
 */
export async function prochaineImmatriculation(codeStructure, codeCategorie) {
  const structure = String(codeStructure ?? 'XXX').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const categorie = String(codeCategorie ?? 'DIV').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  const ligne = await un(
    `insert into sequence_immatriculation (structure_code, prefixe_cat, dernier) values ($1, $2, 1)
     on conflict (structure_code, prefixe_cat) do update set dernier = sequence_immatriculation.dernier + 1
     returning dernier`,
    [structure, categorie],
  );
  return `BRT-${structure}-${categorie}-${String(ligne.dernier).padStart(5, '0')}`;
}
