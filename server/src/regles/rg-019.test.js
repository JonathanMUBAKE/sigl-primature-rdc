import test from 'node:test';
import assert from 'node:assert/strict';
import { rg019 } from './rg-019.js';

test('RG-019 — lire un document figé, ou rectifier par un document lié, passe', () => {
  assert.equal(rg019({ document: { numero: 'PV-0001', fige: true }, operation: 'lecture' }), null);
  assert.equal(rg019({ document: { numero: 'PV-0001', fige: true }, operation: 'rectification' }), null);
  assert.equal(rg019({ document: { numero: 'BR-0002', fige: false }, operation: 'modification' }), null);
});

test('RG-019 — modifier ou supprimer un document figé est refusé', () => {
  const erreur = rg019({ document: { numero: 'PV-0001', fige: true }, operation: 'modification' });
  assert.equal(erreur.code, 'RG-019');
  assert.equal(erreur.champ, 'document_id');
  assert.equal(rg019({ document: { numero: 'PV-0001', fige: true }, operation: 'suppression' }).code, 'RG-019');
});
