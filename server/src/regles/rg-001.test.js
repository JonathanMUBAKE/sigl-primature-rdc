import test from 'node:test';
import assert from 'node:assert/strict';
import { rg001 } from './rg-001.js';

test('RG-001 — un besoin justifié passe le visa', () => {
  assert.equal(rg001({ justification: "Renouvellement du parc informatique du SGP." }), null);
});

test('RG-001 — un besoin sans justification est refusé au visa', () => {
  const erreur = rg001({ justification: '   ' });
  assert.equal(erreur.code, 'RG-001');
  assert.equal(erreur.champ, 'justification');
  assert.match(erreur.message, /justification/i);
  assert.equal(rg001({}).code, 'RG-001');
});
