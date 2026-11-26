import test from 'node:test';
import assert from 'node:assert/strict';
import { rg014, baseEvaluationAttendue } from './rg-014.js';

test('RG-014 — les bases attendues sont respectées', () => {
  assert.equal(baseEvaluationAttendue({ mode_entree: 'don', classement: 'immobilisation' }), 'cout_repute');
  assert.equal(baseEvaluationAttendue({ mode_entree: 'transfert', classement: 'stock' }), 'juste_valeur');
  assert.equal(
    rg014({ mode_entree: 'don', classement: 'immobilisation', base_evaluation: 'cout_repute', valeur_acquisition: 1_200_000 }),
    null,
  );
});

test('RG-014 — une base contraire au mode d\'entrée est refusée', () => {
  const erreur = rg014({
    mode_entree: 'don',
    classement: 'stock',
    base_evaluation: 'cout_repute',
    valeur_acquisition: 500,
  });
  assert.equal(erreur.code, 'RG-014');
  assert.equal(erreur.champ, 'base_evaluation');
  assert.equal(rg014({ mode_entree: 'legs' }).champ, 'mode_entree');
  assert.equal(
    rg014({ mode_entree: 'don', classement: 'stock', base_evaluation: 'juste_valeur', valeur_acquisition: null }).champ,
    'valeur_acquisition',
  );
});
