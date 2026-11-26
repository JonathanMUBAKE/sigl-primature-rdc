import test from 'node:test';
import assert from 'node:assert/strict';
import { rg022 } from './rg-022.js';

test('RG-022 — traiter une alerte en n\'écrivant que son statut et sa suite passe', () => {
  assert.equal(
    rg022({ statut: 'justifiee', suite: 'Achats distincts, objets différents.', changements: { statut: 'justifiee', suite: 'x' } }),
    null,
  );
  assert.equal(rg022({ statut: 'en_examen', changements: { statut: 'en_examen' } }), null);
});

test('RG-022 — une alerte qui changerait un état métier est refusée', () => {
  const erreur = rg022({ statut: 'classee', suite: 'rien', changements: { statut: 'classee', 'dossier.procedure': 'aon' } });
  assert.equal(erreur.code, 'RG-022');
  assert.equal(erreur.champ, 'changements');
  assert.equal(rg022({ statut: 'confirmee', suite: '', changements: {} }).champ, 'suite');
});
