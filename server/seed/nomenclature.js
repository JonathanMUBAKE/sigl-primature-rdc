// nomenclature.js — La nomenclature des biens d'une administration congolaise.
// `classement` par défaut, hérité par les biens et surchargeable bien par bien.

export const CATEGORIES = [
  // --- Mobilier et aménagement -------------------------------------------
  { code: 'MOB', libelle: 'Mobilier et aménagement', parent: null, classement: 'immobilisation', duree: 10 },
  { code: 'MOB-BUR', libelle: 'Bureaux et plans de travail', parent: 'MOB', classement: 'immobilisation', duree: 10 },
  { code: 'MOB-SIE', libelle: 'Sièges et fauteuils', parent: 'MOB', classement: 'immobilisation', duree: 7 },
  { code: 'MOB-ARM', libelle: 'Armoires et classeurs', parent: 'MOB', classement: 'immobilisation', duree: 10 },
  { code: 'MOB-SAL', libelle: 'Mobilier de salle de réunion', parent: 'MOB', classement: 'immobilisation', duree: 10 },
  { code: 'MOB-CLI', libelle: 'Climatisation et ventilation', parent: 'MOB', classement: 'immobilisation', duree: 8 },

  // --- Informatique et téléphonie ----------------------------------------
  { code: 'INF', libelle: 'Matériel informatique et téléphonie', parent: null, classement: 'immobilisation', duree: 5 },
  { code: 'INF-ORD', libelle: 'Ordinateurs de bureau', parent: 'INF', classement: 'immobilisation', duree: 5 },
  { code: 'INF-POR', libelle: 'Ordinateurs portables', parent: 'INF', classement: 'immobilisation', duree: 4 },
  { code: 'INF-IMP', libelle: 'Imprimantes et multifonctions', parent: 'INF', classement: 'immobilisation', duree: 5 },
  { code: 'INF-RES', libelle: 'Équipement réseau', parent: 'INF', classement: 'immobilisation', duree: 6 },
  { code: 'INF-SRV', libelle: 'Serveurs et stockage', parent: 'INF', classement: 'immobilisation', duree: 6 },
  { code: 'INF-TEL', libelle: 'Téléphonie et visioconférence', parent: 'INF', classement: 'immobilisation', duree: 4 },
  { code: 'INF-ACC', libelle: 'Accessoires et consommables informatiques', parent: 'INF', classement: 'stock', duree: null, unite: 'unité' },

  // --- Charroi ------------------------------------------------------------
  { code: 'CHA', libelle: 'Charroi automobile', parent: null, classement: 'immobilisation', duree: 10 },
  { code: 'CHA-BER', libelle: 'Berlines de service', parent: 'CHA', classement: 'immobilisation', duree: 10 },
  { code: 'CHA-TTR', libelle: 'Véhicules tout-terrain', parent: 'CHA', classement: 'immobilisation', duree: 10 },
  { code: 'CHA-UTI', libelle: 'Véhicules utilitaires et camionnettes', parent: 'CHA', classement: 'immobilisation', duree: 12 },
  { code: 'CHA-MOT', libelle: 'Motocyclettes', parent: 'CHA', classement: 'immobilisation', duree: 6 },
  { code: 'CHA-PIE', libelle: 'Pièces de rechange automobile', parent: 'CHA', classement: 'stock', duree: null, unite: 'pièce' },
  { code: 'CHA-CAR', libelle: 'Carburant et lubrifiants', parent: 'CHA', classement: 'stock', duree: null, unite: 'litre' },

  // --- Fournitures de bureau ---------------------------------------------
  { code: 'FOU', libelle: 'Fournitures de bureau', parent: null, classement: 'stock', duree: null },
  { code: 'FOU-PAP', libelle: 'Papeterie', parent: 'FOU', classement: 'stock', duree: null, unite: 'rame' },
  { code: 'FOU-ECR', libelle: 'Articles d’écriture', parent: 'FOU', classement: 'stock', duree: null, unite: 'boîte' },
  { code: 'FOU-CLA', libelle: 'Classement et archivage', parent: 'FOU', classement: 'stock', duree: null, unite: 'unité' },
  { code: 'FOU-ENT', libelle: 'Produits d’entretien', parent: 'FOU', classement: 'stock', duree: null, unite: 'litre' },
  { code: 'FOU-CUI', libelle: 'Fournitures de cuisine et réception', parent: 'FOU', classement: 'stock', duree: null, unite: 'unité' },

  // --- Matériel technique -------------------------------------------------
  { code: 'TEC', libelle: 'Matériel technique', parent: null, classement: 'immobilisation', duree: 8 },
  { code: 'TEC-GRP', libelle: 'Groupes électrogènes', parent: 'TEC', classement: 'immobilisation', duree: 12 },
  { code: 'TEC-ELE', libelle: 'Installations électriques et onduleurs', parent: 'TEC', classement: 'immobilisation', duree: 8 },
  { code: 'TEC-SON', libelle: 'Sonorisation et projection', parent: 'TEC', classement: 'immobilisation', duree: 7 },
  { code: 'TEC-SEC', libelle: 'Sécurité et incendie', parent: 'TEC', classement: 'immobilisation', duree: 8 },
  { code: 'TEC-OUT', libelle: 'Outillage et matériel d’entretien', parent: 'TEC', classement: 'stock', duree: null, unite: 'unité' },

  // --- Immobilier ---------------------------------------------------------
  { code: 'IMM', libelle: 'Immobilier et terrains', parent: null, classement: 'immobilisation', duree: 40 },
  { code: 'IMM-BAT', libelle: 'Bâtiments administratifs', parent: 'IMM', classement: 'immobilisation', duree: 40 },
  { code: 'IMM-TER', libelle: 'Terrains', parent: 'IMM', classement: 'immobilisation', duree: null },
  { code: 'IMM-AME', libelle: 'Aménagements et installations fixes', parent: 'IMM', classement: 'immobilisation', duree: 20 },
];

/** Les catégories feuilles où l'on immatricule des immobilisations. */
export const FEUILLES_IMMOBILISATION = CATEGORIES.filter(
  (c) => c.parent && c.classement === 'immobilisation' && c.code !== 'IMM-TER',
).map((c) => c.code);

/** Les catégories feuilles où vivent les articles de stock. */
export const FEUILLES_STOCK = CATEGORIES.filter(
  (c) => c.parent && c.classement === 'stock',
).map((c) => c.code);

/** Le préfixe à trois lettres utilisé dans l'immatriculation. */
export function prefixeCategorie(code) {
  return code.split('-')[0];
}
