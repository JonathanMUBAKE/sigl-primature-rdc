// Les dates dans les messages du serveur. Un essai court et têtu : c'est lui
// qui empêche un « jusqu'au Wed Dec 16 » de revenir.

import test from 'node:test';
import assert from 'node:assert/strict';
import { dateEnFrancais, mentionDeDate } from './dates.js';

test('dates — une chaîne de jour se lit telle qu’elle est écrite', () => {
  assert.equal(dateEnFrancais('2026-12-16'), '16 décembre 2026');
  assert.equal(dateEnFrancais('2026-01-31'), '31 janvier 2026');
  assert.equal(dateEnFrancais('2027-08-05'), '5 août 2027');
});

test('dates — une chaîne horodatée aussi, et elle ne recule pas d’un jour', () => {
  // Le piège : `new Date('2026-12-16')` vaut minuit UTC, et rend le 15 à
  // l'ouest de Greenwich. On lit donc les chiffres, pas l'instant.
  assert.equal(dateEnFrancais('2026-12-16T08:00:00.000Z'), '16 décembre 2026');
  assert.equal(dateEnFrancais('2026-12-16T23:59:59+01:00'), '16 décembre 2026');
});

test('dates — un objet Date se lit dans le fuseau du serveur', () => {
  // C'est ce que le pilote PostgreSQL rend pour `date` et `timestamptz`, et
  // c'est de là que venait le défaut : `String(date).slice(0, 10)` donnait
  // « Wed Dec 16 ».
  const date = new Date(2026, 11, 16, 9, 30);
  assert.equal(dateEnFrancais(date), '16 décembre 2026');
  assert.doesNotMatch(dateEnFrancais(date), /Wed|Dec/, 'plus un mot d’anglais');
});

test('dates — le premier du mois s’écrit « 1er »', () => {
  assert.equal(dateEnFrancais('2026-03-01'), '1er mars 2026');
  assert.equal(dateEnFrancais('2026-03-02'), '2 mars 2026');
});

test('dates — les douze mois sont en français', () => {
  const mois = Array.from({ length: 12 }, (_, i) =>
    dateEnFrancais(`2026-${String(i + 1).padStart(2, '0')}-10`));
  assert.deepEqual(mois.map((m) => m.split(' ')[1]), [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ]);
});

test('dates — ce qui ne se lit pas rend null, plutôt qu’une date fausse', () => {
  for (const valeur of [null, undefined, '', 'bientôt', '16/12/2026', new Date('zut'), {}, 0]) {
    assert.equal(dateEnFrancais(valeur), null, `« ${String(valeur)} » ne doit rien rendre`);
  }
});

test('dates — la mention s’omet entièrement quand la date manque', () => {
  // Sans quoi la phrase garderait un « jusqu'au » orphelin en plein milieu.
  assert.equal(mentionDeDate("jusqu'au", '2026-12-16'), " jusqu'au 16 décembre 2026");
  assert.equal(mentionDeDate('depuis le', null), '');
  assert.equal(mentionDeDate('depuis le', 'illisible'), '');
});
