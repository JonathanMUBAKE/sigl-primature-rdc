import test from 'node:test';
import assert from 'node:assert/strict';
import { rg016 } from './rg-016.js';

test('RG-016 — instruire et produire le PV passe', () => {
  assert.equal(rg016({ action: 'instruire_reforme' }), null);
  assert.equal(rg016({ action: 'emettre_pv_reforme' }), null);
});

test('RG-016 — prononcer la cession ou le rebut est refusé', () => {
  const erreur = rg016({ action: 'ceder' });
  assert.equal(erreur.code, 'RG-016');
  assert.equal(erreur.champ, 'action');
  assert.equal(rg016({ action: 'instruire_reforme', decision_prononcee: true }).code, 'RG-016');
});
