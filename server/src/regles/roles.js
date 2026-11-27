// Le référentiel des rôles de la section 4, côté règles : qui voit tout, qui ne
// voit que sa structure, qui n'écrit jamais. Pures données et fonctions pures.

export const ROLES = [
  'demandeur', 'chef_structure', 'comptable_matieres', 'magasinier', 'logistique',
  'intendant', 'ordonnateur', 'controle_budget', 'comptable_public', 'direction',
  'controle_externe', 'admin',
];

// Portée « tout » : lecture de toutes les structures, consolidée.
export const ROLES_PORTEE_TOTALE = ['logistique', 'direction', 'controle_externe'];

// Rôles du niveau central : ils agissent pour la Primature, pas pour une structure.
export const ROLES_CENTRAUX = [
  'logistique', 'intendant', 'ordonnateur', 'controle_budget', 'comptable_public',
  'direction', 'controle_externe', 'admin',
];

// Portée transversale au périmètre **intégré** : le comptable public.
//
// Il n'est pas un agent de la structure. Il est mis à disposition par le
// ministère du Budget ou des Finances, et le décret 13/050 art. 137 lui confie
// un contrôle en matière de dépenses **et** en matière de patrimoine : sa
// fonction porte sur l'institution, pas sur la cellule où est son bureau. Sa
// lecture couvre donc toutes les structures de régime `integre`, dont le
// patrimoine est celui de la Primature.
//
// Elle s'arrête à la frontière juridique : un établissement public autonome a
// sa personnalité juridique et **son propre comptable public**, et sa
// comptabilité des matières ne se lit pas d'en haut. Un comptable public d'un
// établissement autonome n'obtient donc rien de plus que sa propre structure —
// c'est le sens du contrôle sur `structure_regime` ci-dessous.
//
// Ce n'est pas la portée totale : les autonomes restent hors de vue, et aucune
// écriture n'en découle (RG-018 inchangée, tenue par la base).
export const ROLES_PORTEE_INTEGRE = ['comptable_public'];

/** Vrai pour un comptable public d'une structure du périmètre intégré. */
export function porteeIntegre(agent) {
  if (!agent || porteeTotale(agent)) return false;
  if (!aRole(agent, ...ROLES_PORTEE_INTEGRE)) return false;
  // Sans le régime sous la main, on ne suppose rien : la portée reste propre.
  return agent.structure_regime === 'integre';
}

// Lecture seule, sans exception : le contrôle externe lit tout et n'écrit rien.
export const ROLES_LECTURE_SEULE = ['controle_externe', 'direction'];

export function rolesDe(agent = {}) {
  const liste = agent.roles ?? agent.role_codes ?? [];
  return liste.map((r) => (typeof r === 'string' ? r : r.role_code)).filter(Boolean);
}

export function aRole(agent, ...codes) {
  const miens = rolesDe(agent);
  return codes.some((c) => miens.includes(c));
}

export function porteeTotale(agent) {
  return aRole(agent, ...ROLES_PORTEE_TOTALE);
}

export function estCentral(agent) {
  return aRole(agent, ...ROLES_CENTRAUX);
}

export function lectureSeule(agent) {
  const miens = rolesDe(agent);
  return miens.length > 0 && miens.every((r) => ROLES_LECTURE_SEULE.includes(r));
}

// Les structures qu'un agent peut lire : la sienne, ses filles, tout si sa
// portée est totale, et tout le périmètre **intégré** pour le comptable public.
// `structures` : la liste complète déjà chargée, avec son `regime`.
export function structuresLisibles(agent, structures = []) {
  if (porteeTotale(agent)) return structures.map((s) => s.id);
  const racine = agent.structure_id;
  if (porteeIntegre(agent)) {
    // Le comptable public lit l'institution, pas sa cellule — mais jamais un
    // établissement autonome, qui a son propre comptable public. Sa propre
    // structure est jointe au cas où elle ne porterait pas de régime.
    const integres = structures.filter((s) => s.regime === 'integre').map((s) => String(s.id));
    return [...new Set([...(racine ? [String(racine)] : []), ...integres])];
  }
  const propres = new Set(
    [racine, ...(agent.structures_de_portee ?? [])].filter(Boolean).map(String),
  );
  let ajout = true;
  while (ajout) {
    ajout = false;
    for (const s of structures) {
      if (s.parent_id && propres.has(String(s.parent_id)) && !propres.has(String(s.id))) {
        propres.add(String(s.id));
        ajout = true;
      }
    }
  }
  return [...propres];
}
