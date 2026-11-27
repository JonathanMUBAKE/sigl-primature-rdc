import test from 'node:test';
import assert from 'node:assert/strict';
import { rg026 } from './rg-026.js';

test('RG-026 — un arbitre distinct de celui qui a constaté passe', () => {
  assert.equal(rg026({ constate_par: 'a1', tranche_par: 'b2' }), null);
});

test('RG-026 — qui constate un écart ne le tranche pas', () => {
  const erreur = rg026({ constate_par: 'a1', tranche_par: 'a1' });
  assert.equal(erreur.code, 'RG-026');
  assert.equal(erreur.champ, 'tranche_par');
  assert.match(erreur.message, /constat/);
});

test('RG-026 — la comparaison ne dépend pas du type de l’identifiant', () => {
  assert.equal(rg026({ constate_par: 7, tranche_par: '7' }).code, 'RG-026');
});

test('RG-026 — un identifiant manquant ne fait pas mordre la règle à vide', () => {
  // Une des deux mains n'est pas connue : d'autres contrôles s'en chargent,
  // celui-ci ne prononce rien sur ce qu'il ne voit pas.
  assert.equal(rg026({ constate_par: 'a1', tranche_par: null }), null);
  assert.equal(rg026({}), null);
});

test('RG-026 — l’explication par le même agent ne la déclenche pas : seule la décision est visée', () => {
  // Le détenteur peut expliquer son propre écart — l'art. 122 le veut même.
  // C'est l'arbitrage qui exige une autre main.
  assert.equal(rg026({ constate_par: 'a1', explique_par: 'a1', tranche_par: 'b2' }), null);
});
