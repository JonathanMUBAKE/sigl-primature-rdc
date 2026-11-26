import test from 'node:test';
import assert from 'node:assert/strict';
import { rg008 } from './rg-008.js';

const seuils = { gre_a_gre: 0, consultation: 10_000_000, aon: 100_000_000, aoi: 2_000_000_000 };

test('RG-008 — un dossier isolé, ou un cumul sans franchissement, passe', () => {
  assert.equal(rg008({ montant_estime: 9_000_000, seuils, dossiers_lies: [] }), null);
  assert.equal(
    rg008({ montant_estime: 2_000_000, seuils, dossiers_lies: [{ id: 'd1', montant_estime: 3_000_000 }] }),
    null,
  );
});

test('RG-008 — un découpage sous le seuil bloque et lève une alerte', () => {
  const erreur = rg008({
    montant_estime: 9_000_000,
    seuils,
    dossiers_lies: [
      { id: 'd1', montant_estime: 9_500_000 },
      { id: 'd2', montant_estime: 9_800_000 },
    ],
  });
  assert.equal(erreur.code, 'RG-008');
  assert.equal(erreur.champ, 'montant_estime');
  assert.equal(erreur.alerte.code, 'R011');
  assert.equal(erreur.alerte.donnees.procedure_seule, 'gre_a_gre');
  assert.equal(erreur.alerte.donnees.procedure_cumul, 'consultation');
  assert.deepEqual(erreur.alerte.donnees.dossiers_lies, ['d1', 'd2']);
});
