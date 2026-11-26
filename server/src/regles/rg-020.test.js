import test from 'node:test';
import assert from 'node:assert/strict';
import { rg020, estSensible } from './rg-020.js';

test('RG-020 — une action sensible journalisée avant/après passe', () => {
  assert.equal(rg020({ action: 'prise_en_charge', journalise: true, avant: null, apres: { id: 'x' } }), null);
  assert.equal(rg020({ action: 'consultation_liste', journalise: false }), null);
  assert.equal(estSensible('visa_besoin'), true);
});

test('RG-020 — une action sensible non journalisée est refusée', () => {
  const erreur = rg020({ action: 'visa_besoin', journalise: false });
  assert.equal(erreur.code, 'RG-020');
  assert.equal(erreur.champ, 'journal');
  assert.equal(rg020({ action: 'visa_besoin', journalise: true }).code, 'RG-020');
});
