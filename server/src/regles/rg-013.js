// RG-013 — Les pièces de rechange et le matériel d'entretien sont classés en
// stock sauf s'ils répondent à la définition d'immobilisation. IPSAS 45 §AG12.
// `categorie` : la catégorie déjà chargée, avec son classement par défaut.

const MOTS_PIECE = ['piece_rechange', 'pieces_rechange', 'rechange', 'entretien', 'consommable'];

export function estPieceOuEntretien(categorie = {}, bien = {}) {
  if (bien.piece_rechange === true || bien.materiel_entretien === true) return true;
  const indices = [categorie.code, categorie.parent_code, categorie.libelle, bien.categorie_code]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  return indices.some((v) => MOTS_PIECE.some((mot) => v.includes(mot)));
}

export function rg013({ bien = {}, categorie = {} } = {}) {
  if (!estPieceOuEntretien(categorie, bien)) return null;
  if (bien.classement === 'immobilisation' && bien.repond_definition_immobilisation !== true) {
    return {
      code: 'RG-013',
      message:
        "Classez cet article en stock, ou attestez qu'il répond à la définition d'une immobilisation (usage sur plus d'une période, pièce majeure d'une installation) : les pièces de rechange et le matériel d'entretien sont des stocks (IPSAS 45 §AG12).",
      champ: 'classement',
    };
  }
  return null;
}
