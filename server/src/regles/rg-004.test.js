import test from 'node:test';
import assert from 'node:assert/strict';
import { rg004 } from './rg-004.js';

test('RG-004 — un rejet motivé passe', () => {
  assert.equal(rg004({ decision: 'rejet', motif: 'Crédits non disponibles sur la ligne.' }), null);
  assert.equal(rg004({ decision: 'totale' }), null);
});

test('RG-004 — un rejet sans motif est refusé', () => {
  const erreur = rg004({ decision: 'rejet', motif: '  ' });
  assert.equal(erreur.code, 'RG-004');
  assert.equal(erreur.champ, 'motif_decision');
});
