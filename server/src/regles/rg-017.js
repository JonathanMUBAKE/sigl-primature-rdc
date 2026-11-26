// RG-017 — Une structure ne lit que ses propres données.

import { porteeTotale, structuresLisibles } from './roles.js';

export function rg017({ agent = {}, structure_id, structures = [] } = {}) {
  if (!structure_id) return null;
  if (porteeTotale(agent)) return null;
  const permises = structuresLisibles(agent, structures).map(String);
  if (!permises.includes(String(structure_id))) {
    return {
      code: 'RG-017',
      message:
        "Consultez les données de votre structure : la lecture des données d'une autre structure n'est ouverte qu'à la logistique centrale, à la direction et au contrôle externe.",
      champ: 'structure_id',
    };
  }
  return null;
}
