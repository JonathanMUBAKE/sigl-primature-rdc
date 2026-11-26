import test from 'node:test';
import assert from 'node:assert/strict';
import { rg012 } from './rg-012.js';

test('RG-012 — un stock gratuit avec coût de remplacement passe', () => {
  assert.equal(rg012({ classement: 'stock', distribution_gratuite: true, cout_remplacement: 4500 }), null);
  assert.equal(rg012({ classement: 'stock', distribution_gratuite: false }), null);
  assert.equal(rg012({ classement: 'immobilisation', distribution_gratuite: true }), null);
});

test('RG-012 — un stock gratuit sans coût de remplacement est refusé', () => {
  const erreur = rg012({ classement: 'stock', distribution_gratuite: true, cout_remplacement: null });
  assert.equal(erreur.code, 'RG-012');
  assert.equal(erreur.champ, 'cout_remplacement');
});
