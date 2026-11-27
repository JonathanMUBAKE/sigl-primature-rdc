import test from 'node:test';
import assert from 'node:assert/strict';
import { rg024, ecartsNonTranches } from './rg-024.js';

test('RG-024 — une campagne sans écart pendant se clôt', () => {
  assert.equal(rg024({ ecarts_non_tranches: 0 }), null);
  assert.equal(rg024({ ecarts: [] }), null);
  assert.equal(rg024({}), null);
});

test('RG-024 — un écart non tranché retient la clôture, et le message le dit', () => {
  const erreur = rg024({ ecarts_non_tranches: 1 });
  assert.equal(erreur.code, 'RG-024');
  assert.equal(erreur.champ, 'statut');
  assert.match(erreur.message, /1 écart/);
});

test('RG-024 — la liste des écarts fait foi quand elle est fournie', () => {
  const ecarts = [
    { id: 'a', statut: 'constate' },
    { id: 'b', statut: 'explique' },
    { id: 'c', statut: 'tranche' },
  ];
  assert.equal(ecartsNonTranches({ ecarts }), 2);
  const erreur = rg024({ ecarts });
  assert.equal(erreur.code, 'RG-024');
  assert.match(erreur.message, /2 écarts/);
  // Le message nomme les stades, pour que l'écran sache où aller.
  assert.match(erreur.message, /constaté/);
  assert.match(erreur.message, /expliqué/);
});

test('RG-024 — tous les écarts tranchés laissent passer', () => {
  assert.equal(rg024({ ecarts: [{ statut: 'tranche' }, { statut: 'tranche' }] }), null);
});
