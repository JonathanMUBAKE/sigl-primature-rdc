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

// Les structures qu'un agent peut lire : la sienne, ses filles, et tout si sa
// portée est totale. `structures` : la liste complète déjà chargée.
export function structuresLisibles(agent, structures = []) {
  if (porteeTotale(agent)) return structures.map((s) => s.id);
  const racine = agent.structure_id;
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
