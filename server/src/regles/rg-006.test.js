import test from 'node:test';
import assert from 'node:assert/strict';
import { rg006 } from './rg-006.js';

test('RG-006 — un accusé de réception signé permet la clôture', () => {
  assert.equal(
    rg006({ accuse: { type: 'accuse_reception', signe_le: '2026-11-20', signataire_id: 'a1' } }),
    null,
  );
});

test('RG-006 — sans accusé signé, la clôture est refusée', () => {
  assert.equal(rg006({}).code, 'RG-006');
  const erreur = rg006({ accuse: { type: 'accuse_reception', signe_le: null } });
  assert.equal(erreur.code, 'RG-006');
  assert.equal(erreur.champ, 'accuse_reception');
  assert.equal(rg006({ accuse: { type: 'pv_reception', signe_le: '2026-11-20', signataire_id: 'a1' } }).code, 'RG-006');
});
