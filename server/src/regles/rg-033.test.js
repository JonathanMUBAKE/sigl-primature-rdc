import test from 'node:test';
import assert from 'node:assert/strict';
import { rg033, ROUTE_DU_CIRCUIT } from './rg-033.js';

test('RG-033 — les autres mouvements ne sont pas concernés', () => {
  for (const type of ['entree', 'sortie', 'transfert', 'maintenance', 'retour_maintenance', 'perte', 'declassement', 'reemploi']) {
    assert.equal(rg033({ type_mouvement: type }), null, `le type ${type} doit passer`);
  }
});

test('RG-033 — un mouvement direct de réforme est refusé', () => {
  const erreur = rg033({ type_mouvement: 'reforme' });
  assert.equal(erreur.code, 'RG-033');
  assert.equal(erreur.champ, 'type');
});

test('RG-033 — le refus nomme la route du circuit', () => {
  const erreur = rg033({ type_mouvement: 'reforme' });
  assert.match(erreur.message, /POST \/api\/dossiers-reforme/);
  assert.equal(ROUTE_DU_CIRCUIT, 'POST /api/dossiers-reforme');
  // Et il dit ce que le raccourci ne prouvait pas.
  assert.match(erreur.message, /toute la Primature/);
});

test('RG-033 — l’état visé suffit à déclencher la règle, pas seulement le type', () => {
  assert.equal(rg033({ type_mouvement: 'sortie', etat_cible: 'reforme' }).code, 'RG-033');
});

test('RG-033 — le circuit, lui, y a droit : c’est sa seule porte', () => {
  assert.equal(rg033({ type_mouvement: 'reforme', par_le_circuit: true }), null);
  assert.equal(rg033({ etat_cible: 'reforme', par_le_circuit: true }), null);
});
