import test from 'node:test';
import assert from 'node:assert/strict';
import { rg018 } from './rg-018.js';

const armp = { id: 'armp', nom: 'ARMP', regime: 'autonome' };
const sgp = { id: 'sgp', nom: 'SGP', regime: 'integre' };

test('RG-018 — une autonome écrit chez elle, le central écrit chez une intégrée', () => {
  assert.equal(rg018({ agent: { structure_id: 'armp', roles: ['comptable_matieres'] }, structure_cible: armp }), null);
  assert.equal(rg018({ agent: { structure_id: 'cab', roles: ['logistique'] }, structure_cible: sgp }), null);
});

test('RG-018 — le niveau central n\'écrit pas chez une autonome', () => {
  const erreur = rg018({ agent: { structure_id: 'cab', roles: ['logistique'] }, structure_cible: armp });
  assert.equal(erreur.code, 'RG-018');
  assert.equal(erreur.champ, 'structure_id');
  assert.match(erreur.message, /autonome/);
});
