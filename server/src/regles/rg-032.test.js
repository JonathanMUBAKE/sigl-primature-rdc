import test from 'node:test';
import assert from 'node:assert/strict';
import { rg032, SUITES } from './rg-032.js';

const complete = {
  autorite: "Direction des domaines privés et publics de l'État",
  reference: 'DDPPE/2026/0147',
  date_acte: '2026-11-10',
  suite: 'rebut',
};

test('RG-032 — une décision complète s’enregistre', () => {
  assert.equal(rg032(complete), null);
  for (const suite of SUITES) {
    assert.equal(rg032({ ...complete, suite }), null, `la suite ${suite} doit être acceptée`);
  }
});

test('RG-032 — sans autorité nommée, il n’y a pas de décision à enregistrer', () => {
  const erreur = rg032({ ...complete, autorite: '  ' });
  assert.equal(erreur.code, 'RG-032');
  assert.equal(erreur.champ, 'autorite');
  assert.match(erreur.message, /il ne la prend pas/);
});

test('RG-032 — la référence de l’acte est exigée', () => {
  const erreur = rg032({ ...complete, reference: null });
  assert.equal(erreur.code, 'RG-032');
  assert.equal(erreur.champ, 'reference');
});

test('RG-032 — la date de l’acte aussi, et ce n’est pas celle du jour', () => {
  const erreur = rg032({ ...complete, date_acte: null });
  assert.equal(erreur.code, 'RG-032');
  assert.equal(erreur.champ, 'date_acte');
});

test('RG-032 — la suite est l’une des trois, et le refus en fait partie', () => {
  const erreur = rg032({ ...complete, suite: 'destruction' });
  assert.equal(erreur.code, 'RG-032');
  assert.equal(erreur.champ, 'suite');
  assert.match(erreur.message, /refus/);
  assert.deepEqual(SUITES, ['cession', 'rebut', 'refus']);
});

test('RG-032 — elle s’appuie sur RG-016 et ne l’assouplit pas', () => {
  // Une décision parfaitement renseignée ne permet pas pour autant au SIGL de
  // prononcer la cession : RG-016 passe devant, et c'est son code qui sort.
  const erreur = rg032({ ...complete, action: 'ceder' });
  assert.equal(erreur.code, 'RG-016');
  assert.equal(rg032({ ...complete, action: 'rebut' }).code, 'RG-016');
});

test('RG-032 — sans rien, la règle refuse', () => {
  assert.equal(rg032({}).code, 'RG-032');
  assert.equal(rg032().code, 'RG-032');
});
