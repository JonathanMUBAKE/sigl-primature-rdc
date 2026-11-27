import test from 'node:test';
import assert from 'node:assert/strict';
import { rg025 } from './rg-025.js';

test('RG-025 — un écart expliqué se tranche', () => {
  assert.equal(
    rg025({ statut: 'explique', explication: "L'unité a été prêtée au cabinet sans acte." }),
    null,
  );
});

test('RG-025 — un écart seulement constaté ne se tranche pas', () => {
  const erreur = rg025({ statut: 'constate', explication: null });
  assert.equal(erreur.code, 'RG-025');
  assert.equal(erreur.champ, 'explication');
  assert.match(erreur.message, /détenteur/);
});

test('RG-025 — une explication vide ou blanche ne vaut pas explication', () => {
  assert.equal(rg025({ statut: 'explique', explication: '' }).code, 'RG-025');
  assert.equal(rg025({ statut: 'explique', explication: '   ' }).code, 'RG-025');
});

test('RG-025 — un écart déjà tranché ne se tranche pas une seconde fois', () => {
  const erreur = rg025({ statut: 'tranche', explication: 'Déjà expliqué', decision: 'perte' });
  assert.equal(erreur.code, 'RG-025');
  assert.equal(erreur.champ, 'statut');
  assert.match(erreur.message, /déjà/);
});

test('RG-025 — sans donnée, la règle refuse plutôt que de laisser passer', () => {
  assert.equal(rg025({}).code, 'RG-025');
});
