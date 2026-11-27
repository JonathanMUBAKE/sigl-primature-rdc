import test from 'node:test';
import assert from 'node:assert/strict';
import { rg029 } from './rg-029.js';

test('RG-029 — sans offre en cours, rien ne s’oppose à la suite du circuit', () => {
  assert.equal(rg029({ offre: null, dossier_statut: 'examine', etat_bien: 'hors_service' }), null);
  assert.equal(rg029({}), null);
});

test('RG-029 — une offre ouverte arrête la marche vers la réforme', () => {
  const erreur = rg029({
    offre: { numero: 'OR-2026-00003', statut: 'ouverte', cloture_prevue_le: '2026-12-27T08:00:00Z' },
  });
  assert.equal(erreur.code, 'RG-029');
  assert.equal(erreur.champ, 'statut');
  // Le message nomme le terme annoncé : une structure qui lit l'offre doit
  // savoir jusqu'à quand elle peut demander. **En français** : ce texte est
  // affiché tel quel, et il a déjà annoncé « jusqu'au Wed Dec 16 ».
  assert.match(erreur.message, /jusqu'au 27 décembre 2026/);
  assert.doesNotMatch(erreur.message, /\d{4}-\d{2}-\d{2}|Wed|Dec|Mon|Sun|GMT/);
  assert.match(erreur.message, /OR-2026-00003/);
});

test('RG-029 — un objet Date, tel que le rend la base, est mis en français aussi', () => {
  const erreur = rg029({
    offre: {
      numero: 'OR-2026-00004',
      statut: 'ouverte',
      cloture_prevue_le: new Date(2026, 11, 16, 9, 0),
    },
  });
  assert.match(erreur.message, /jusqu'au 16 décembre 2026/);
  assert.doesNotMatch(erreur.message, /Wed|Dec|GMT/);
});

test('RG-029 — sans terme lisible, la phrase se passe de date plutôt que d’en inventer', () => {
  const erreur = rg029({ offre: { numero: 'OR-2026-00005', statut: 'ouverte' } });
  assert.match(erreur.message, /Ce bien est offert au réemploi : attendez/);
});

test('RG-029 — une offre close ne s’y oppose plus', () => {
  assert.equal(rg029({ offre: { numero: 'OR-2026-00003', statut: 'close' } }), null);
});

test('RG-029 — et réciproquement : un bien sous PV de réforme ne se réemploie plus', () => {
  for (const statut of ['saisi', 'clos']) {
    const erreur = rg029({ dossier_statut: statut });
    assert.equal(erreur.code, 'RG-029', `le statut ${statut} doit refuser le réemploi`);
    assert.match(erreur.message, /procès-verbal/);
  }
  assert.equal(rg029({ etat_bien: 'reforme' }).code, 'RG-029');
});

test('RG-029 — un dossier offert ou réemployé ne tombe pas sous la seconde moitié', () => {
  assert.equal(rg029({ dossier_statut: 'offert' }), null);
  assert.equal(rg029({ dossier_statut: 'reemploye' }), null);
});
