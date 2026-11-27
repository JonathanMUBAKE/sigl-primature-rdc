import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS_SENSIBLES, rg020, estSensible } from './rg-020.js';

test('RG-020 — une action sensible journalisée avant/après passe', () => {
  assert.equal(rg020({ action: 'prise_en_charge', journalise: true, avant: null, apres: { id: 'x' } }), null);
  assert.equal(rg020({ action: 'consultation_liste', journalise: false }), null);
  assert.equal(estSensible('visa_besoin'), true);
});

test('RG-020 — une action sensible non journalisée est refusée', () => {
  const erreur = rg020({ action: 'visa_besoin', journalise: false });
  assert.equal(erreur.code, 'RG-020');
  assert.equal(erreur.champ, 'journal');
  assert.equal(rg020({ action: 'visa_besoin', journalise: true }).code, 'RG-020');
});

/*
  Le défaut de classe, fermé une fois pour toutes.

  Les douze actions de l'inventaire et du rapprochement étaient journalisées par
  leurs routes dès leur écriture, mais n'étaient pas **déclarées** dans
  `ACTIONS_SENSIBLES` : le garde-fou de la règle ne mordait donc pas sur elles.
  Une action sensible absente de cette liste est une action que le serveur a le
  droit de confirmer sans trace, et personne ne le voit — ni la revue, ni les
  essais, puisque chaque route journalise de son côté.

  Cet essai lit les routes et confronte les deux listes. Il tombera le jour où
  un module journalisera une action qu'il n'a pas déclarée, ou déclarera une
  action que plus personne n'émet.
*/
test('RG-020 — toute action journalisée par une route est déclarée sensible', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const dossier = join(dirname(fileURLToPath(import.meta.url)), '..', 'routes');
  const emises = new Set();      // nommées littéralement dans un `action:`
  const mentionnees = new Set();  // citées quelque part — une route les compose
  for (const fichier of readdirSync(dossier)) {
    if (!fichier.endsWith('.js') || fichier.endsWith('.test.js')) continue;
    const source = readFileSync(join(dossier, fichier), 'utf8');
    for (const trouve of source.matchAll(/action: '([a-z_]+)'/g)) emises.add(trouve[1]);
    for (const trouve of source.matchAll(/'([a-z][a-z_]{4,})'/g)) mentionnees.add(trouve[1]);
  }

  assert.ok(emises.size > 20, 'les routes doivent bien journaliser quelque chose');
  const nonDeclarees = [...emises].filter((a) => !ACTIONS_SENSIBLES.includes(a)).sort();
  assert.deepEqual(
    nonDeclarees, [],
    `Déclarez ces actions dans ACTIONS_SENSIBLES, sinon RG-020 ne mord pas sur elles : ${nonDeclarees.join(', ')}`,
  );

  // Le sens inverse est plus lâche, et il le faut : `biens.js` compose le nom de
  // son action depuis le type de mouvement (`reforme`, `perte`, sinon
  // `mouvement_bien`), il n'y a donc pas de `action: '…'` à trouver. On se
  // contente de vérifier que le nom est **cité** quelque part dans les routes :
  // cela suffit à repérer une action déclarée que plus personne n'émet.
  const orphelines = ACTIONS_SENSIBLES
    .filter((a) => !emises.has(a) && !mentionnees.has(a)).sort();
  assert.deepEqual(
    orphelines, [],
    `Ces actions sont déclarées sensibles mais plus aucune route ne les émet : ${orphelines.join(', ')}`,
  );
});
