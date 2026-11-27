import test from 'node:test';
import assert from 'node:assert/strict';
import { avisDeLaCommission, manqueALaCommission } from './commission.js';

const membres = (n) => Array.from({ length: n }, (_, i) => ({ agent_id: `m${i}` }));
const avis = (favorables, defavorables) => [
  ...Array.from({ length: favorables }, (_, i) => ({ agent_id: `f${i}`, avis: 'favorable' })),
  ...Array.from({ length: defavorables }, (_, i) => ({ agent_id: `d${i}`, avis: 'defavorable' })),
];

test('commission — trois membres, trois avis favorables : le dossier passe à examine', () => {
  const etat = avisDeLaCommission({ membres: membres(3), avis: avis(3, 0), membres_minimum: 3 });
  assert.equal(etat.conclu, true);
  assert.equal(etat.majorite, 'favorable');
  assert.equal(etat.statut_du_dossier, 'examine');
  assert.equal(manqueALaCommission(etat), null);
});

test('commission — la majorité suffit, elle n’exige pas l’unanimité', () => {
  const etat = avisDeLaCommission({ membres: membres(3), avis: avis(2, 1), membres_minimum: 3 });
  assert.equal(etat.majorite, 'favorable');
  assert.equal(etat.statut_du_dossier, 'examine');
});

test('commission — une majorité défavorable rejette le dossier, et le bien reste en service', () => {
  const etat = avisDeLaCommission({ membres: membres(3), avis: avis(1, 2), membres_minimum: 3 });
  assert.equal(etat.majorite, 'defavorable');
  assert.equal(etat.statut_du_dossier, 'rejete');
});

test('commission — pas de quorum de membres : elle n’a pas conclu, et on dit ce qui manque', () => {
  const etat = avisDeLaCommission({ membres: membres(2), avis: avis(2, 0), membres_minimum: 3 });
  assert.equal(etat.conclu, false);
  assert.equal(etat.quorum_membres, false);
  assert.equal(etat.statut_du_dossier, null);
  assert.match(manqueALaCommission(etat), /Désignez encore 1 membre/);
});

test('commission — un seul avis sur trois membres ne vaut pas majorité', () => {
  // Sans ce quorum d'avis, « la majorité des membres ayant émis un avis »
  // serait la voix d'un seul.
  const etat = avisDeLaCommission({ membres: membres(3), avis: avis(1, 0), membres_minimum: 3 });
  assert.equal(etat.conclu, false);
  assert.equal(etat.quorum_avis, false);
  assert.match(manqueALaCommission(etat), /encore 2 avis/);
});

test('commission — l’égalité des voix ne fait pas majorité', () => {
  const etat = avisDeLaCommission({ membres: membres(4), avis: avis(2, 2), membres_minimum: 3 });
  assert.equal(etat.majorite, null);
  assert.equal(etat.conclu, false);
  assert.match(manqueALaCommission(etat), /un avis de plus/);
});

test('commission — sans le paramètre, rien n’est conclu et le motif le dit', () => {
  const etat = avisDeLaCommission({ membres: membres(5), avis: avis(5, 0), membres_minimum: null });
  assert.equal(etat.membres_minimum, null);
  assert.equal(etat.conclu, false);
  assert.match(manqueALaCommission(etat), /commission_membres_minimum/);
});

test('commission — le paramètre est lu, pas supposé : un minimum de cinq change le verdict', () => {
  const trois = avisDeLaCommission({ membres: membres(3), avis: avis(3, 0), membres_minimum: 3 });
  const cinq = avisDeLaCommission({ membres: membres(3), avis: avis(3, 0), membres_minimum: 5 });
  assert.equal(trois.conclu, true);
  assert.equal(cinq.conclu, false, 'le quorum vient du paramètre, jamais d’une constante');
});

test('commission — les compteurs sont rendus pour que l’écran les montre sans les refaire', () => {
  const etat = avisDeLaCommission({ membres: membres(4), avis: avis(3, 1), membres_minimum: 3 });
  assert.equal(etat.membres, 4);
  assert.equal(etat.avis_rendus, 4);
  assert.equal(etat.favorables, 3);
  assert.equal(etat.defavorables, 1);
});
