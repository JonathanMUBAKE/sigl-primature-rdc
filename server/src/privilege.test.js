// privilege.test.js — Le chemin privilégié est fermé par défaut.
//
// ADR-001, amendement du 27 novembre 2026, §4 : « Le jeu de démonstration
// s'insère sous `postgres`, qui porte `rolbypassrls`. C'est le seul chemin du
// dépôt qui contourne l'isolation, et il doit être fermé en production. »
//
// Ces essais prouvent qu'il l'est. Ils ne touchent pas à la base : le refus
// tombe **avant** la connexion, ce qui est précisément le point — une route
// égarée n'ouvre même pas de client sous le rôle propriétaire.
//
// Aucun d'eux ne pose le sésame durablement : chacun remet l'environnement en
// l'état, pour que les autres fichiers d'essais ne dépendent pas de l'ordre.

import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import {
  CLE_PRIVILEGE, SESAME_PRIVILEGE, PrivilegeRefuse,
  enPrivilegie, executerPrivilegie, fermer, verifierPrivilegeAutorise,
} from './db.js';

let privilegeInitial;
let envInitial;
let nodeEnvInitial;

beforeEach(() => {
  privilegeInitial = process.env[CLE_PRIVILEGE];
  envInitial = process.env.SIGL_ENV;
  nodeEnvInitial = process.env.NODE_ENV;
});

afterEach(() => {
  const remettre = (cle, valeur) => {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  };
  remettre(CLE_PRIVILEGE, privilegeInitial);
  remettre('SIGL_ENV', envInitial);
  remettre('NODE_ENV', nodeEnvInitial);
});

describe('Le chemin privilégié est fermé par défaut', () => {
  it('sans la variable d’environnement, enPrivilegie refuse de s’exécuter', async () => {
    delete process.env[CLE_PRIVILEGE];
    let appele = false;
    await assert.rejects(
      () => enPrivilegie(() => { appele = true; }),
      (erreur) => {
        assert.ok(erreur instanceof PrivilegeRefuse);
        assert.equal(erreur.code, 'privilege_refuse');
        // Le message dit quoi faire à la place, en français.
        assert.match(erreur.message, /transaction\(\{ agentId, structureId \}/);
        assert.match(erreur.message, /consolidation/);
        assert.match(erreur.message, new RegExp(CLE_PRIVILEGE));
        return true;
      },
    );
    assert.equal(appele, false, 'la fonction ne doit même pas être appelée');
  });

  it('executerPrivilegie refuse de la même façon', async () => {
    delete process.env[CLE_PRIVILEGE];
    await assert.rejects(
      () => executerPrivilegie('select 1'),
      (erreur) => {
        assert.ok(erreur instanceof PrivilegeRefuse);
        assert.match(erreur.message, /executerPrivilegie/);
        return true;
      },
    );
  });

  it('une valeur approchante ne suffit pas : le sésame est exact', () => {
    for (const valeur of ['1', 'oui', 'true', SESAME_PRIVILEGE.toUpperCase(), '']) {
      process.env[CLE_PRIVILEGE] = valeur;
      assert.throws(() => verifierPrivilegeAutorise(), PrivilegeRefuse, `« ${valeur} » ne doit pas ouvrir`);
    }
  });

  it('en production, le sésame lui-même ne suffit pas', () => {
    process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;
    for (const environnement of ['production', 'PROD', 'preproduction', 'staging']) {
      process.env.SIGL_ENV = environnement;
      assert.throws(
        () => verifierPrivilegeAutorise(),
        (erreur) => {
          assert.ok(erreur instanceof PrivilegeRefuse);
          assert.match(erreur.message, /fermé en environnement/);
          return true;
        },
        `l'environnement « ${environnement} » doit rester fermé`,
      );
    }
  });

  it('NODE_ENV=production ferme aussi la porte', () => {
    process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;
    delete process.env.SIGL_ENV;
    process.env.NODE_ENV = 'production';
    assert.throws(() => verifierPrivilegeAutorise(), PrivilegeRefuse);
  });

  it('en développement et avec le sésame, le chemin s’ouvre', async () => {
    process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;
    delete process.env.SIGL_ENV;
    delete process.env.NODE_ENV;
    assert.doesNotThrow(() => verifierPrivilegeAutorise());
    // Et il mène bien au rôle propriétaire.
    const role = await enPrivilegie((bd) => bd.valeur('select current_user'));
    assert.equal(typeof role, 'string');
    assert.ok(role.length > 0);
  });

  it('aucune route n’emprunte ni n’ouvre le chemin privilégié', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const dossier = new URL('./routes/', import.meta.url);

    const coupables = [];
    for (const nom of await readdir(dossier)) {
      // Les fichiers d'essais montent leur jeu d'épreuve comme le seed ; c'est
      // le code servi qui ne doit jamais emprunter ce chemin.
      if (!nom.endsWith('.js') || nom.endsWith('.test.js')) continue;
      const source = await readFile(new URL(nom, dossier), 'utf8');
      // Les commentaires nomment le chemin pour l'écarter : on ne regarde que
      // les lignes de code.
      const code = source
        .split('\n')
        .filter((ligne) => !/^\s*(\/\/|\*|\/\*)/.test(ligne))
        .join('\n');
      if (/\b(enPrivilegie|executerPrivilegie)\s*\(/.test(code)) {
        coupables.push(`${nom} appelle le chemin privilégié`);
      }
      if (/process\.env\s*\[?\s*(CLE_PRIVILEGE|['"]SIGL_PRIVILEGE['"])\]?\s*=/.test(code)) {
        coupables.push(`${nom} pose le sésame`);
      }
    }
    assert.deepEqual(coupables, [], 'seul le seed ouvre le chemin privilégié');
  });
});

after(() => fermer());
