import test from 'node:test';
import assert from 'node:assert/strict';
import { rg002 } from './rg-002.js';

test('RG-002 — un viseur distinct du demandeur passe', () => {
  assert.equal(rg002({ demandeur_id: 'a1', viseur_id: 'b2' }), null);
});

test('RG-002 — le demandeur ne vise pas sa propre demande', () => {
  const erreur = rg002({ demandeur_id: 'a1', viseur_id: 'a1' });
  assert.equal(erreur.code, 'RG-002');
  assert.equal(erreur.champ, 'viseur_id');
});
