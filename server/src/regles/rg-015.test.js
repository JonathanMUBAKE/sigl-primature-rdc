import test from 'node:test';
import assert from 'node:assert/strict';
import { rg015 } from './rg-015.js';

test('RG-015 — une perte qui laisse le bien au registre passe', () => {
  assert.equal(rg015({ type_mouvement: 'perte', etat_cible: 'perdu' }), null);
  assert.equal(rg015({ type_mouvement: 'transfert', etat_cible: 'bon' }), null);
});

test('RG-015 — effacer la fiche ou sortir le bien du registre est refusé', () => {
  const erreur = rg015({ type_mouvement: 'perte', supprime_la_fiche: true });
  assert.equal(erreur.code, 'RG-015');
  assert.equal(erreur.champ, 'bien_id');
  assert.equal(rg015({ type_mouvement: 'reforme', etat_cible: 'hors_service' }).code, 'RG-015');
});
