// RG-018 — Une structure `autonome` n'est jamais écrite par le niveau central ;
// elle est lue en consolidé. Décret 13/050.

import { estCentral } from './roles.js';

export function rg018({ agent = {}, structure_cible } = {}) {
  if (!structure_cible || structure_cible.regime !== 'autonome') return null;
  const memeStructure =
    agent.structure_id && String(agent.structure_id) === String(structure_cible.id);
  if (memeStructure) return null;
  if (estCentral(agent) || !memeStructure) {
    return {
      code: 'RG-018',
      message:
        `Laissez « ${structure_cible.nom ?? 'cette structure'} » écrire ses propres données : elle est de régime autonome, tient sa comptabilité des matières et le niveau central n'en a que la vue consolidée.`,
      champ: 'structure_id',
    };
  }
  return null;
}
