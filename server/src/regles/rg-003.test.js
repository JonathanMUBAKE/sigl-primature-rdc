import test from 'node:test';
import assert from 'node:assert/strict';
import { rg003 } from './rg-003.js';

test('RG-003 — une validation partielle motivée passe', () => {
  assert.equal(rg003({ decision: 'partielle', motif: 'Stock insuffisant en toner.' }), null);
  assert.equal(rg003({ decision: 'totale', motif: '' }), null);
});

test('RG-003 — une validation partielle sans motif est refusée', () => {
  const erreur = rg003({ decision: 'partielle', motif: '' });
  assert.equal(erreur.code, 'RG-003');
  assert.equal(erreur.champ, 'motif_decision');
});
