// Les droits, §4 : ce qui se vérifie sans base. Les gardes ne lisent que
// `request.agent`, posé par le hook d'identification : ils sont donc testables
// tels quels, avec un agent fabriqué.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ecriture, lecture, estLectureSeule, estUuid, clauseStructures } from './_droits.js';
import { structuresLisibles, porteeTotale } from '../regles/roles.js';

const agent = (roles, structure_id = 'sgp') => ({
  id: 'ag-1', nom: 'Agent', actif: true, structure_id, roles,
});

test("droits — l'agent doit être identifié et actif", async () => {
  await assert.rejects(() => lecture()({ agent: null }), (e) => e.code === 'non_autorise');
  await assert.rejects(
    () => lecture()({ agent: { ...agent(['demandeur']), actif: false } }),
    (e) => e.code === 'non_autorise',
  );
  await lecture()({ agent: agent(['demandeur']) });
});

test('droits — le contrôle externe lit tout et n\'écrit jamais', async () => {
  const controle = agent(['controle_externe']);
  await lecture()({ agent: controle });
  await lecture('controle_externe', 'direction')({ agent: controle });
  await assert.rejects(
    () => ecriture('comptable_matieres')({ agent: controle }),
    (e) => e.code === 'non_autorise' && /n'écrit rien/.test(e.message),
  );
  assert.equal(estLectureSeule(controle), true);
  assert.equal(porteeTotale(controle), true);
});

test("droits — l'administrateur ne porte aucune écriture métier", async () => {
  await assert.rejects(
    () => ecriture()({ agent: agent(['admin']) }),
    (e) => e.code === 'non_autorise' && /référentiels/.test(e.message),
  );
});

test('droits — le rôle exigé est vérifié, et le journal reste au contrôle', async () => {
  await ecriture('comptable_matieres')({ agent: agent(['comptable_matieres']) });
  await assert.rejects(
    () => ecriture('comptable_public')({ agent: agent(['magasinier']) }),
    (e) => e.code === 'non_autorise',
  );
  await assert.rejects(
    () => lecture('controle_externe', 'direction')({ agent: agent(['chef_structure']) }),
    (e) => e.code === 'non_autorise',
  );
});

test('droits — la portée : sa structure et ses filles, ou tout', () => {
  const structures = [
    { id: 'sgp', parent_id: null },
    { id: 'service', parent_id: 'sgp' },
    { id: 'armp', parent_id: null },
  ];
  assert.deepEqual(structuresLisibles(agent(['chef_structure']), structures).sort(), ['service', 'sgp']);
  assert.deepEqual(structuresLisibles(agent(['direction']), structures), ['sgp', 'service', 'armp']);
});

test('droits — identifiants et clause SQL de périmètre', () => {
  assert.equal(estUuid('3f1a0c2e-5b7d-4f8a-9c1b-2d3e4f5a6b7c'), true);
  assert.equal(estUuid('pas-un-uuid'), false);
  assert.deepEqual(clauseStructures(null), { sql: '', params: [] });
  assert.deepEqual(clauseStructures([]), { sql: 'and false', params: [] });
  assert.deepEqual(clauseStructures(['a', 'b'], 'b.structure_id', 3), {
    sql: 'and b.structure_id in ($3, $4)',
    params: ['a', 'b'],
  });
});
