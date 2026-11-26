import test from 'node:test';
import assert from 'node:assert/strict';
import { rg009 } from './rg-009.js';

test('RG-009 — un fournisseur actif hors liste noire passe', () => {
  assert.equal(rg009({ fournisseur: { denomination: 'Etablissement Lufu', liste_noire: false, actif: true } }), null);
});

test('RG-009 — un fournisseur en liste noire est refusé', () => {
  const erreur = rg009({ fournisseur: { denomination: 'Comptoir Mayi', liste_noire: true, actif: true } });
  assert.equal(erreur.code, 'RG-009');
  assert.equal(erreur.champ, 'fournisseur_id');
  assert.match(erreur.message, /liste noire/);
  assert.equal(rg009({}).code, 'RG-009');
});
