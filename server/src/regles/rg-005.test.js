import test from 'node:test';
import assert from 'node:assert/strict';
import { rg005 } from './rg-005.js';

test('RG-005 — une sortie dans la limite du stock passe', () => {
  assert.equal(rg005({ quantite_demandee: 5, quantite_disponible: 12 }), null);
  assert.equal(rg005({ quantite_demandee: 12, quantite_disponible: 12 }), null);
});

test('RG-005 — une sortie supérieure au stock est refusée', () => {
  const erreur = rg005({ quantite_demandee: 13, quantite_disponible: 12 });
  assert.equal(erreur.code, 'RG-005');
  assert.equal(erreur.champ, 'quantite');
  assert.match(erreur.message, /12/);
  assert.equal(rg005({ quantite_demandee: 0, quantite_disponible: 12 }).code, 'RG-005');
});
