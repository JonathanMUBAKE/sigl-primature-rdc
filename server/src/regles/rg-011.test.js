import test from 'node:test';
import assert from 'node:assert/strict';
import { rg011 } from './rg-011.js';

test('RG-011 — un certificat signé rend le paiement possible', () => {
  assert.equal(
    rg011({ certificat: { type: 'certificat_prise_en_charge', signe_le: '2026-11-22', signataire_id: 'a3' } }),
    null,
  );
});

test('RG-011 — sans certificat de prise en charge, pas de paiement', () => {
  const erreur = rg011({});
  assert.equal(erreur.code, 'RG-011');
  assert.equal(erreur.champ, 'certificat_id');
  assert.equal(rg011({ certificat: { type: 'pv_reception', signe_le: 'x', signataire_id: 'y' } }).code, 'RG-011');
});
