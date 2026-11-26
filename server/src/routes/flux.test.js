// Le flux temps réel : la forme des événements, la reprise après coupure, et
// surtout le filtrage par structure — le RLS ne protège pas un flux.

import test from 'node:test';
import assert from 'node:assert/strict';
import { publier, depuis, dansPerimetre, bus } from './_flux.js';

test('flux — un événement porte type, objet, id, structure et horodatage', () => {
  const recus = [];
  const ecouter = (e) => recus.push(e);
  bus.on('evenement', ecouter);
  const e = publier({ type: 'sortie', objet: 'stock', id: 'st-1', structure_id: 'sgp', quantite: 12 });
  bus.removeListener('evenement', ecouter);

  assert.equal(e.objet, 'stock');
  assert.equal(e.type, 'sortie');
  assert.equal(e.quantite, 12);
  assert.ok(e.sequence > 0);
  assert.match(e.horodatage, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(recus, [e]);
});

test('flux — la reprise rend ce qui a été manqué depuis une séquence', () => {
  const premier = publier({ type: 'creation', objet: 'besoin', id: 'b-1', structure_id: 'sgp' });
  const second = publier({ type: 'visa', objet: 'besoin', id: 'b-1', structure_id: 'sgp' });
  const manques = depuis(premier.sequence).map((e) => e.sequence);
  assert.ok(manques.includes(second.sequence));
  assert.ok(!manques.includes(premier.sequence));
  assert.deepEqual(depuis('pas-un-nombre'), []);
});

test('flux — le filtrage par structure vaut aussi pour le flux', () => {
  const evenement = { objet: 'stock', structure_id: 'armp' };
  // Portée totale : tout passe.
  assert.equal(dansPerimetre(evenement, null), true);
  // Portée limitée : seulement son périmètre.
  assert.equal(dansPerimetre(evenement, ['armp']), true);
  assert.equal(dansPerimetre(evenement, ['sgp', 'cab']), false);
  // Un événement sans structure ne part jamais vers une portée limitée.
  assert.equal(dansPerimetre({ objet: 'achat', structure_id: null }, ['sgp']), false);
  assert.equal(dansPerimetre({ objet: 'achat', structure_id: null }, null), true);
});
