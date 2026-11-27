// RG-024 — Aucune campagne ne se clôt sur un écart non tranché.
// Décret 13/050 art. 120.
//
// Un écart pendant est une question ouverte sur le patrimoine de l'État :
// soit le bien est là et la fiche est fausse, soit la fiche est juste et le bien
// manque. Clore la campagne sans trancher, ce serait archiver la question — et
// l'état d'inventaire produit porterait une incertitude qu'il ne nomme pas.
//
// La règle ne tranche rien elle-même : elle constate qu'un humain doit le faire.

/** Combien d'écarts de la campagne ne sont pas tranchés. */
export function ecartsNonTranches({ ecarts, ecarts_non_tranches } = {}) {
  if (Array.isArray(ecarts)) {
    return ecarts.filter((e) => e?.statut !== 'tranche').length;
  }
  return Math.max(Number(ecarts_non_tranches ?? 0) || 0, 0);
}

/** Les stades où dorment les écarts pendants, pour que le message soit utile. */
function stades(ecarts) {
  if (!Array.isArray(ecarts)) return null;
  const noms = { constate: 'constaté', explique: 'expliqué' };
  const vus = [...new Set(
    ecarts.filter((e) => e?.statut !== 'tranche').map((e) => noms[e?.statut] ?? e?.statut),
  )].filter(Boolean);
  return vus.length > 0 ? vus.join(', ') : null;
}

export function rg024({ ecarts, ecarts_non_tranches } = {}) {
  const pendants = ecartsNonTranches({ ecarts, ecarts_non_tranches });
  if (pendants === 0) return null;
  const ou = stades(ecarts);
  return {
    code: 'RG-024',
    message:
      `Tranchez les ${pendants} écart${pendants > 1 ? 's' : ''} encore pendant${pendants > 1 ? 's' : ''}`
      + (ou ? ` (au stade : ${ou})` : '')
      + " avant de clore : une campagne close ne laisse aucune question ouverte sur le patrimoine.",
    champ: 'statut',
  };
}
