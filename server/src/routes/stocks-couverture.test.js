// Le stock dynamique : couverture, rupture prévisible, criticité.

import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichir } from './stocks.js';

const article = (quantite, minimum = 20, critique = 10) => ({
  id: 'st-1', designation: 'Rames A4 80 g', quantite, seuil_minimum: minimum, seuil_critique: critique,
});

test('couverture — la consommation constatée donne les jours restants et la rupture', () => {
  const a = enrichir(article(90), { consommation_jour: 3 });
  assert.equal(a.jours_couverture, 30);
  assert.equal(a.rupture_sous_30_jours, true);
  assert.equal(a.criticite, 'rupture_prevue');
  assert.match(a.date_rupture_prevue, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(a.lien, '/api/stocks/st-1');

  const dormant = enrichir(article(90), undefined);
  assert.equal(dormant.jours_couverture, null);
  assert.equal(dormant.date_rupture_prevue, null);
  assert.equal(dormant.criticite, 'normal');
});

test('couverture — la criticité suit les seuils, la rupture passe devant', () => {
  assert.equal(enrichir(article(0), { consommation_jour: 1 }).criticite, 'rupture');
  assert.equal(enrichir(article(8), { consommation_jour: 0 }).criticite, 'critique');
  assert.equal(enrichir(article(15), { consommation_jour: 0 }).criticite, 'sous_minimum');
  assert.equal(enrichir(article(500), { consommation_jour: 0.5 }).criticite, 'normal');
  // Le rang sert au tri par criticité : la rupture d'abord.
  assert.ok(enrichir(article(0), {}).rang_criticite < enrichir(article(8), {}).rang_criticite);
  assert.ok(enrichir(article(8), {}).rang_criticite < enrichir(article(15), {}).rang_criticite);
});
