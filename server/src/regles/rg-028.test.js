import test from 'node:test';
import assert from 'node:assert/strict';
import { rg028, demandesPendantes } from './rg-028.js';

const close = { numero: 'OR-2026-00001', statut: 'close' };

test('RG-028 — une offre close et sans demande pendante ouvre la saisine', () => {
  assert.equal(rg028({ offre: close }), null);
  assert.equal(
    rg028({ offre: close, demandes: [{ statut: 'ecartee' }, { statut: 'acceptee' }] }),
    null,
    'des demandes tranchées ne retiennent plus rien',
  );
});

test('RG-028 — sans offre, aucune saisine', () => {
  const erreur = rg028({ offre: null });
  assert.equal(erreur.code, 'RG-028');
  assert.equal(erreur.champ, 'offre');
  assert.match(erreur.message, /autres structures/);
});

test('RG-028 — une offre encore ouverte ne suffit pas, et le message la nomme', () => {
  const erreur = rg028({ offre: { numero: 'OR-2026-00007', statut: 'ouverte' } });
  assert.equal(erreur.code, 'RG-028');
  assert.match(erreur.message, /OR-2026-00007/);
});

// --- Les demandes pendantes : décision du chef de projet du 27/11/2026 -----
//
// L'esprit de la règle est « le réemploi a été réellement cherché », et une
// offre close sur une demande sans réponse prouve le contraire.

test('RG-028 — une offre close sur une demande pendante ne suffit pas non plus', () => {
  const erreur = rg028({ offre: close, demandes: [{ statut: 'deposee' }] });
  assert.equal(erreur.code, 'RG-028');
  assert.equal(erreur.champ, 'demandes');
  // Le refus nomme ce qu'il faut faire : un refus qui ne le dit pas est un mur.
  assert.match(erreur.message, /[Tt]ranchez/);
  assert.match(erreur.message, /écartez/);
});

test('RG-028 — le refus nomme les structures qui attendent, et les compte', () => {
  const erreur = rg028({
    offre: close,
    demandes: [
      { statut: 'deposee', structure_demandeuse_nom: 'Secrétariat Général du Gouvernement' },
      { statut: 'deposee', structure_demandeuse_nom: 'Delivery Unit de la Primature' },
      { statut: 'ecartee', structure_demandeuse_nom: 'Caisse Nationale de Péréquation' },
    ],
  });
  assert.equal(erreur.code, 'RG-028');
  assert.match(erreur.message, /^2 demandes/, 'deux pendantes sur trois demandes');
  assert.match(erreur.message, /Secrétariat Général du Gouvernement/);
  assert.match(erreur.message, /Delivery Unit/);
  assert.ok(
    !erreur.message.includes('Caisse Nationale'),
    'une demande déjà écartée n’a plus à être nommée',
  );
});

test('RG-028 — le message s’accorde au singulier comme au pluriel', () => {
  const une = rg028({ offre: close, demandes: [{ statut: 'deposee' }] });
  assert.match(une.message, /^1 demande de réemploi attend encore/);
  const deux = rg028({ offre: close, demandes: [{ statut: 'deposee' }, { statut: 'deposee' }] });
  assert.match(deux.message, /^2 demandes de réemploi attendent encore/);
});

test('RG-028 — l’ordre des refus : l’offre d’abord, les demandes ensuite', () => {
  // Une offre encore ouverte **et** une demande pendante : c'est l'état de
  // l'offre qu'on reproche, parce que c'est lui qu'on corrige d'abord.
  const erreur = rg028({
    offre: { numero: 'OR-2026-00009', statut: 'ouverte' },
    demandes: [{ statut: 'deposee' }],
  });
  assert.equal(erreur.champ, 'offre');
});

test('RG-028 — les demandes pendantes se comptent à part, et la fonction le dit', () => {
  assert.equal(demandesPendantes([]).length, 0);
  assert.equal(demandesPendantes().length, 0);
  assert.equal(
    demandesPendantes([
      { statut: 'deposee' }, { statut: 'acceptee' }, { statut: 'ecartee' }, { statut: 'deposee' },
    ]).length,
    2,
  );
  assert.equal(demandesPendantes([null, undefined, { statut: 'deposee' }]).length, 1);
});

test('RG-028 — sans donnée, la règle refuse plutôt que de laisser passer', () => {
  assert.equal(rg028({}).code, 'RG-028');
  assert.equal(rg028().code, 'RG-028');
});
