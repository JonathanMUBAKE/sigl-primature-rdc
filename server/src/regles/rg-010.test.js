import test from 'node:test';
import assert from 'node:assert/strict';
import { rg010 } from './rg-010.js';

test('RG-010 — un PV de réception signé ouvre la prise en charge', () => {
  assert.equal(
    rg010({ pv_reception: { type: 'pv_reception', signe_le: '2026-11-21', signataire_id: 'a9' } }),
    null,
  );
});

test('RG-010 — sans PV de réception signé, pas de certificat', () => {
  assert.equal(rg010({}).code, 'RG-010');
  assert.equal(rg010({ pv_reception: { type: 'pv_reception' } }).code, 'RG-010');
  const erreur = rg010({ pv_reception: { type: 'bon_livraison', signe_le: 'x', signataire_id: 'y' } });
  assert.equal(erreur.code, 'RG-010');
  assert.equal(erreur.champ, 'pv_reception_id');
});
