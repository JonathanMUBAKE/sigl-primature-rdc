import test from 'node:test';
import assert from 'node:assert/strict';
import { rg023, restantsAConstater } from './rg-023.js';

test('RG-023 — une campagne dont tout le périmètre est constaté se clôt', () => {
  assert.equal(rg023({ biens_du_perimetre: 42, constates: 42 }), null);
});

test('RG-023 — un seul bien non constaté suffit à refuser la clôture', () => {
  const erreur = rg023({ biens_du_perimetre: 42, constates: 41 });
  assert.equal(erreur.code, 'RG-023');
  assert.equal(erreur.champ, 'statut');
  // Le message nomme ce qui manque : c'est à cela qu'il sert.
  assert.match(erreur.message, /1 bien/);
});

test('RG-023 — le message accorde le pluriel et dit combien il en reste', () => {
  const erreur = rg023({ biens_du_perimetre: 42, constates: 10 });
  assert.match(erreur.message, /32 biens/);
});

test('RG-023 — un périmètre vide ne retient pas la clôture', () => {
  // Rien à constater, rien à reprocher : la règle ne juge que le reste à faire.
  assert.equal(rg023({ biens_du_perimetre: 0, constates: 0 }), null);
});

test('RG-023 — plus de constats que de biens ne rend pas un reste négatif', () => {
  assert.equal(restantsAConstater({ biens_du_perimetre: 5, constates: 7 }), 0);
  assert.equal(rg023({ biens_du_perimetre: 5, constates: 7 }), null);
});

test('RG-023 — des décomptes absents sont traités comme nuls, et non comme une absence de contrôle', () => {
  assert.equal(restantsAConstater({}), 0);
  assert.equal(rg023({}), null);
  assert.equal(rg023({ biens_du_perimetre: 3 }).code, 'RG-023');
});
