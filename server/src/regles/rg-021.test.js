import test from 'node:test';
import assert from 'node:assert/strict';
import { rg021, suiviAttendu } from './rg-021.js';

test('RG-021 — un lot sans immatriculation passe, un individuel immatriculé aussi', () => {
  assert.equal(rg021({ suivi: 'lot', quantite: 40 }), null);
  assert.equal(rg021({ suivi: 'individuel', immatriculation: 'BRT-SGP-INF-00042', quantite: 1 }), null);
  assert.equal(suiviAttendu({ valeur_acquisition: 50_000, seuil_suivi_individuel: 500_000 }), 'lot');
  assert.equal(suiviAttendu({ valeur_acquisition: 900_000, seuil_suivi_individuel: 500_000 }), 'individuel');
});

test('RG-021 — un lot immatriculé est refusé', () => {
  const erreur = rg021({ suivi: 'lot', immatriculation: 'BRT-SGP-FOU-00007', quantite: 40 });
  assert.equal(erreur.code, 'RG-021');
  assert.equal(erreur.champ, 'immatriculation');
  assert.equal(rg021({ suivi: 'lot', quantite: 0 }).champ, 'quantite');
});
