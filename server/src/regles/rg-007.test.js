import test from 'node:test';
import assert from 'node:assert/strict';
import { rg007 } from './rg-007.js';
import { procedurePourMontant } from './seuils.js';

const seuils = { gre_a_gre: 0, consultation: 10_000_000, aon: 100_000_000, aoi: 2_000_000_000 };

test('RG-007 — la procédure déduite des seuils passe', () => {
  assert.equal(rg007({ montant_estime: 5_000_000, seuils }), null);
  assert.equal(rg007({ montant_estime: 150_000_000, seuils, procedure_proposee: 'aon' }), null);
  assert.equal(procedurePourMontant(5_000_000, seuils), 'gre_a_gre');
  assert.equal(procedurePourMontant(50_000_000, seuils), 'consultation');
  assert.equal(procedurePourMontant(3_000_000_000, seuils), 'aoi');
});

test('RG-007 — une procédure contraire aux seuils est refusée', () => {
  const erreur = rg007({ montant_estime: 150_000_000, seuils, procedure_proposee: 'gre_a_gre' });
  assert.equal(erreur.code, 'RG-007');
  assert.equal(erreur.champ, 'procedure');
  assert.equal(rg007({ montant_estime: 1_000_000, seuils: null }).champ, 'procedure');
  assert.equal(rg007({ montant_estime: 0, seuils }).champ, 'montant_estime');
});
