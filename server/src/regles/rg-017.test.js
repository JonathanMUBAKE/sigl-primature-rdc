import test from 'node:test';
import assert from 'node:assert/strict';
import { rg017 } from './rg-017.js';

const structures = [
  { id: 'sgp', parent_id: null },
  { id: 'service-1', parent_id: 'sgp' },
  { id: 'cab', parent_id: null },
];

test('RG-017 — un agent lit sa structure et ses filles, la portée totale lit tout', () => {
  assert.equal(rg017({ agent: { structure_id: 'sgp', roles: ['chef_structure'] }, structure_id: 'sgp', structures }), null);
  assert.equal(rg017({ agent: { structure_id: 'sgp', roles: ['chef_structure'] }, structure_id: 'service-1', structures }), null);
  assert.equal(rg017({ agent: { structure_id: 'sgp', roles: ['controle_externe'] }, structure_id: 'cab', structures }), null);
});

test('RG-017 — un agent ne lit pas une autre structure', () => {
  const erreur = rg017({ agent: { structure_id: 'sgp', roles: ['chef_structure'] }, structure_id: 'cab', structures });
  assert.equal(erreur.code, 'RG-017');
  assert.equal(erreur.champ, 'structure_id');
});
