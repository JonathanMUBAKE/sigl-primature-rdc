// L'assemblage : les routes déclarées, la forme des erreurs, et les droits
// appliqués avant toute requête à la base. Ces cas se jouent sans base.

import test from 'node:test';
import assert from 'node:assert/strict';
import { construireApp } from './app.js';

async function app() {
  const serveur = await construireApp({ servirWeb: false });
  await serveur.ready();
  return serveur;
}

test('app — toutes les routes de la section 5 sont déclarées', async () => {
  const serveur = await app();
  const plan = serveur.printRoutes({ commonPrefix: false });
  for (const chemin of [
    '/api/sante', '/api/structures', '/api/biens', '/api/stocks', '/api/besoins',
    '/api/fournisseurs', '/api/dossiers-achat', '/api/bons-commande', '/api/receptions',
    '/api/prises-en-charge', '/api/documents', '/api/alertes', '/api/tableau-de-bord',
    '/api/journal', '/api/flux',
  ]) {
    assert.ok(plan.includes(chemin.replace('/api/', '/api/')), `route absente : ${chemin}`);
  }
  for (const morceau of ['/viser', '/examiner', '/accuser', '/mouvements', '/traiter']) {
    assert.ok(plan.includes(morceau), `action absente : ${morceau}`);
  }
  await serveur.close();
});

test('app — une adresse inconnue rend la forme d\'erreur du contrat', async () => {
  const serveur = await app();
  const reponse = await serveur.inject({ method: 'GET', url: '/api/ceci-nexiste-pas' });
  assert.equal(reponse.statusCode, 404);
  const corps = reponse.json();
  assert.equal(corps.erreur.code, 'non_trouve');
  assert.equal(corps.erreur.champ, null);
  assert.ok(corps.erreur.message.length > 10);
  await serveur.close();
});

test('app — sans X-Agent-Id, aucune lecture métier', async () => {
  const serveur = await app();
  for (const url of ['/api/biens', '/api/besoins', '/api/stocks', '/api/journal', '/api/tableau-de-bord', '/api/flux']) {
    const reponse = await serveur.inject({ method: 'GET', url });
    assert.equal(reponse.statusCode, 403, `${url} devrait être refusée`);
    assert.equal(reponse.json().erreur.code, 'non_autorise');
    assert.equal(reponse.json().erreur.champ, 'X-Agent-Id');
  }
  await serveur.close();
});

test('app — la validation des schémas parle français et nomme le champ', async () => {
  const serveur = await app();
  const sansStructure = await serveur.inject({
    method: 'POST', url: '/api/besoins', payload: { lignes: [] },
  });
  assert.equal(sansStructure.statusCode, 400);
  const corps = sansStructure.json();
  assert.equal(corps.erreur.code, 'donnees_invalides');
  assert.equal(corps.erreur.champ, 'structure_id');
  assert.match(corps.erreur.message, /Renseignez le champ/);

  const mauvaiseDecision = await serveur.inject({
    method: 'POST',
    url: '/api/besoins/3f1a0c2e-5b7d-4f8a-9c1b-2d3e4f5a6b7c/examiner',
    payload: { decision: 'peut_etre' },
  });
  assert.equal(mauvaiseDecision.statusCode, 400);
  assert.match(mauvaiseDecision.json().erreur.message, /valeurs acceptées/);
  await serveur.close();
});

test("app — aucune route ne modifie ni ne supprime le journal", async () => {
  const serveur = await app();
  const plan = serveur.printRoutes({ commonPrefix: false, includeHooks: false });
  // Le journal n'apparaît qu'en lecture : ni POST, ni PUT, ni PATCH, ni DELETE.
  const ligneJournal = plan.split('\n').filter((l) => l.includes('journal')).join(' ');
  for (const methode of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.ok(!ligneJournal.includes(methode), `le journal ne doit pas accepter ${methode}`);
  }
  // Et aucune route de l'API n'expose DELETE : rien ne s'efface dans le SIGL.
  assert.ok(!plan.includes('DELETE'), 'aucune route ne doit supprimer');
  await serveur.close();
});
