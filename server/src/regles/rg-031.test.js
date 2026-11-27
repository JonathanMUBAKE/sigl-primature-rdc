import test from 'node:test';
import assert from 'node:assert/strict';
import { rg031 } from './rg-031.js';

test('RG-031 — un avis motivé passe, dans les deux sens', () => {
  assert.equal(
    rg031({ avis: 'favorable', motif: "Châssis fendu, réparation estimée au-delà de la valeur résiduelle." }),
    null,
  );
  assert.equal(
    rg031({ avis: 'defavorable', motif: 'Le groupe électrogène est réparable et sert encore au dépôt.' }),
    null,
  );
});

test('RG-031 — un avis favorable sans motif est refusé, et le message dit pourquoi', () => {
  const erreur = rg031({ avis: 'favorable', motif: '' });
  assert.equal(erreur.code, 'RG-031');
  assert.equal(erreur.champ, 'motif');
  assert.match(erreur.message, /relire/);
});

test('RG-031 — un avis défavorable sans motif l’est tout autant', () => {
  const erreur = rg031({ avis: 'defavorable', motif: '   ' });
  assert.equal(erreur.code, 'RG-031');
  assert.equal(erreur.champ, 'motif');
});

test('RG-031 — un avis qui n’est ni favorable ni défavorable n’est pas un avis', () => {
  const erreur = rg031({ avis: 'reserve', motif: 'Un motif pourtant écrit.' });
  assert.equal(erreur.code, 'RG-031');
  assert.equal(erreur.champ, 'avis');
  assert.equal(rg031({}).champ, 'avis');
});
