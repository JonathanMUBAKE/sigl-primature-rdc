// L'aiguillage de l'examen : la pièce maîtresse du circuit du besoin.
// Une demande ne doit pas attendre son article le plus lent.

import test from 'node:test';
import assert from 'node:assert/strict';
import { aiguiller, statutApresExamen } from './besoins.js';

test('aiguillage — une ligne servable va au stock, le reste à l\'achat', () => {
  assert.equal(aiguiller({ designation: 'Rames A4' }, 10, 40), 'stock');
  assert.equal(aiguiller({ designation: 'Rames A4' }, 10, 10), 'stock');
  assert.equal(aiguiller({ designation: 'Rames A4' }, 10, 9), 'achat');
  assert.equal(aiguiller({ designation: 'Rames A4' }, 10, 0), 'achat');
  assert.equal(aiguiller({ designation: 'Rames A4' }, 0, 40), 'refuse');
});

test('aiguillage — le statut découle des lignes, et le servable ne patiente pas', () => {
  // Tout accordé et servable : la demande est livrable tout de suite.
  assert.equal(statutApresExamen([
    { origine: 'stock', quantite_demandee: 5, quantite_accordee: 5 },
    { origine: 'stock', quantite_demandee: 2, quantite_accordee: 2 },
  ]), 'livrable');

  // Mélange stock et achat, tout accordé : livrable, sans attendre l'achat.
  assert.equal(statutApresExamen([
    { origine: 'stock', quantite_demandee: 5, quantite_accordee: 5 },
    { origine: 'achat', quantite_demandee: 3, quantite_accordee: 3 },
  ]), 'livrable');

  // Rien en magasin : la demande part en achat.
  assert.equal(statutApresExamen([
    { origine: 'achat', quantite_demandee: 3, quantite_accordee: 3 },
  ]), 'en_achat');

  // Une ligne amputée ou refusée : la validation est partielle.
  assert.equal(statutApresExamen([
    { origine: 'stock', quantite_demandee: 5, quantite_accordee: 2 },
    { origine: 'achat', quantite_demandee: 3, quantite_accordee: 3 },
  ]), 'partiel');
  assert.equal(statutApresExamen([
    { origine: 'stock', quantite_demandee: 5, quantite_accordee: 5 },
    { origine: 'refuse', quantite_demandee: 3, quantite_accordee: 0 },
  ]), 'partiel');

  // Tout refusé : le rejet.
  assert.equal(statutApresExamen([
    { origine: 'refuse', quantite_demandee: 3, quantite_accordee: 0 },
  ]), 'rejete');
});
