import test from 'node:test';
import assert from 'node:assert/strict';
import { rg030 } from './rg-030.js';

test('RG-030 — un autre agent que le proposant siège sans difficulté', () => {
  assert.equal(rg030({ propose_par: 'agent-1', agent_id: 'agent-2' }), null);
});

test('RG-030 — qui propose ne siège pas', () => {
  const erreur = rg030({ propose_par: 'agent-1', agent_id: 'agent-1' });
  assert.equal(erreur.code, 'RG-030');
  assert.equal(erreur.champ, 'agent_id');
  assert.match(erreur.message, /proposé/);
});

test('RG-030 — la comparaison ne dépend pas du type de l’identifiant', () => {
  assert.equal(rg030({ propose_par: 42, agent_id: '42' }).code, 'RG-030');
});

test('RG-030 — sans les deux identifiants, la règle ne prétend rien', () => {
  assert.equal(rg030({ propose_par: 'agent-1' }), null);
  assert.equal(rg030({ agent_id: 'agent-1' }), null);
  assert.equal(rg030({}), null);
});
