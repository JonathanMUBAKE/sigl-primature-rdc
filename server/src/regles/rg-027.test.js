import test from 'node:test';
import assert from 'node:assert/strict';
import { rg027, QUALITES_PARTIE, attestationsManquantes } from './rg-027.js';

const atteste = (qualite) => ({ qualite, atteste_le: '2026-11-20T08:00:00Z' });

test('RG-027 — les deux parties attestées, le rapprochement se clôt', () => {
  assert.equal(
    rg027({ parties: [atteste('comptable_matieres'), atteste('comptable_general')] }),
    null,
  );
});

test('RG-027 — attesté d’un seul côté, il ne se clôt pas', () => {
  const erreur = rg027({
    parties: [atteste('comptable_matieres'), { qualite: 'comptable_general', atteste_le: null }],
  });
  assert.equal(erreur.code, 'RG-027');
  assert.equal(erreur.champ, 'parties');
  // Le message nomme la partie qui manque.
  assert.match(erreur.message, /comptable général/i);
});

test('RG-027 — une partie absente de la table manque autant qu’une partie muette', () => {
  const erreur = rg027({ parties: [atteste('comptable_matieres')] });
  assert.equal(erreur.code, 'RG-027');
  assert.match(erreur.message, /comptable général/i);
});

test('RG-027 — sans aucune partie, les deux sont nommées', () => {
  const erreur = rg027({ parties: [] });
  assert.equal(erreur.code, 'RG-027');
  assert.match(erreur.message, /comptable des matières/i);
  assert.match(erreur.message, /comptable général/i);
  assert.equal(rg027({}).code, 'RG-027');
});

test('RG-027 — une réserve n’empêche pas l’attestation : le contradictoire la conserve', () => {
  assert.equal(
    rg027({
      parties: [
        { ...atteste('comptable_matieres'), reserve: 'Sous réserve de l’inventaire du charroi.' },
        atteste('comptable_general'),
      ],
    }),
    null,
  );
});

test('RG-027 — les deux qualités attendues sont celles de l’art. 123', () => {
  assert.deepEqual(QUALITES_PARTIE, ['comptable_matieres', 'comptable_general']);
  assert.deepEqual(attestationsManquantes([atteste('comptable_general')]), ['comptable_matieres']);
});
