// La forme des réponses du contrat : erreurs et listes paginées.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ErreurMetier, appliquer, appliquerToutes, donneesInvalides, erreur, liste,
  nonAutorise, nonTrouve, pagination,
} from './_commun.js';

test('erreurs — la forme est exactement celle du contrat', () => {
  const e = erreur('RG-002', 'Un chef de structure ne peut pas viser sa propre demande.', 'viseur_id');
  assert.deepEqual(e.corps, {
    erreur: {
      code: 'RG-002',
      message: 'Un chef de structure ne peut pas viser sa propre demande.',
      champ: 'viseur_id',
    },
  });
  assert.equal(nonTrouve('Ce bien').statut, 404);
  assert.equal(nonAutorise('Pas pour vous').statut, 403);
  assert.equal(donneesInvalides('À corriger', 'quantite').statut, 400);
  assert.equal(nonTrouve().corps.erreur.code, 'non_trouve');
});

test('erreurs — appliquer ne lève que si la règle parle', () => {
  assert.equal(appliquer(null), undefined);
  assert.throws(
    () => appliquer({ code: 'RG-005', message: 'Stock insuffisant.', champ: 'quantite' }),
    (e) => e instanceof ErreurMetier && e.code === 'RG-005' && e.champ === 'quantite',
  );
  // La première règle qui parle arrête la suite.
  assert.throws(
    () => appliquerToutes([null, { code: 'RG-001', message: 'Justifiez.', champ: 'justification' }, null]),
    (e) => e.code === 'RG-001',
  );
  // L'alerte d'une règle voyage avec l'erreur (RG-008).
  assert.throws(
    () => appliquer({ code: 'RG-008', message: 'Découpage.', champ: 'montant_estime', alerte: { code: 'R011' } }),
    (e) => e.alerte.code === 'R011',
  );
});

test('listes — la pagination est celle du contrat', () => {
  assert.deepEqual(pagination({}), { page: 1, parPage: 50, decalage: 0 });
  assert.deepEqual(pagination({ page: 3, parPage: 20 }), { page: 3, parPage: 20, decalage: 40 });
  // Bornes : jamais de page zéro, jamais plus de 200 par page.
  assert.equal(pagination({ page: 0 }).page, 1);
  assert.equal(pagination({ parPage: 5000 }).parPage, 200);
  assert.deepEqual(
    liste([{ id: 1 }], 123, pagination({ page: 2, parPage: 50 })),
    { donnees: [{ id: 1 }], total: 123, page: 2, parPage: 50 },
  );
});
