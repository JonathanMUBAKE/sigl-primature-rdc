import test from 'node:test';
import assert from 'node:assert/strict';
import { rg013 } from './rg-013.js';

test('RG-013 — une pièce de rechange en stock passe, et en immobilisation attestée aussi', () => {
  assert.equal(rg013({ bien: { classement: 'stock' }, categorie: { code: 'PIECE_RECHANGE' } }), null);
  assert.equal(
    rg013({
      bien: { classement: 'immobilisation', repond_definition_immobilisation: true },
      categorie: { code: 'PIECE_RECHANGE' },
    }),
    null,
  );
  assert.equal(rg013({ bien: { classement: 'immobilisation' }, categorie: { code: 'INF' } }), null);
});

test('RG-013 — une pièce de rechange en immobilisation sans attestation est refusée', () => {
  const erreur = rg013({
    bien: { classement: 'immobilisation', piece_rechange: true },
    categorie: { code: 'INF', libelle: 'Informatique' },
  });
  assert.equal(erreur.code, 'RG-013');
  assert.equal(erreur.champ, 'classement');
});
