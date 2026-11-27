// isolation.test.js — Le test qui compte (ADR-001, point d'action 3).
//
// RG-017 : une structure ne lit que ses propres données.
// RG-018 : une structure `autonome` n'est jamais écrite par le niveau central.
//
// Ces deux règles sont prouvées **par la base**, pas par le code. Les
// politiques de `20261127000500_isolation.sql` sont le sujet du test ; si l'une
// d'elles disparaît, ou si `db.js` cesse de prendre le rôle `sigl_agent`, ces
// assertions tombent.
//
// Pré-requis : `npx supabase db reset` puis `npm run seed`.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  CLE_PRIVILEGE, SESAME_PRIVILEGE,
  consolidation, enPrivilegie, fermer, transaction,
} from './db.js';

// Le jeu d'épreuve se monte sous le rôle propriétaire : ces essais ouvrent donc
// le chemin privilégié dans leur propre processus, comme le fait le seed. C'est
// `privilege.test.js` qui vérifie que ce chemin reste fermé partout ailleurs.
process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

const MARQUE = 'ESSAI-ISOLATION';

let cab;      // Cabinet de la Première ministre — `integre`, parent du SGP
let sgp;      // Secrétariat Général à la Primature — `integre`, parent de la CGIG
let cgig;     // Cellule de Gestion des Immeubles du Gouvernement — `integre`, fille du SGP
let sgg;      // Secrétariat Général du Gouvernement — `integre`, structure sœur du SGP
let armp;     // Autorité de Régulation des Marchés Publics — `autonome`
let agentCab;
let agentSgp;
let agentArmp;
let categorie;

before(async () => {
  await enPrivilegie(async (bd) => {
    cab = await bd.un("select id, code, regime from structure where code = 'CAB'");
    sgp = await bd.un("select id, code, regime, parent_id from structure where code = 'SGP'");
    cgig = await bd.un("select id, code, regime, parent_id from structure where code = 'CGIG'");
    sgg = await bd.un("select id, code, regime from structure where code = 'SGG'");
    armp = await bd.un("select id, code, regime, parent_id from structure where code = 'ARMP'");
    agentCab = await bd.un('select id from agent where structure_id = $1 limit 1', [cab.id]);
    agentSgp = await bd.un('select id from agent where structure_id = $1 limit 1', [sgp.id]);
    agentArmp = await bd.un('select id from agent where structure_id = $1 limit 1', [armp.id]);
    categorie = await bd.un(
      "select code from categorie where classement = 'immobilisation' and parent_code is not null limit 1",
    );
  });

  assert.ok(cab && sgp && cgig && sgg && armp, 'le jeu de démonstration doit être chargé');
  assert.equal(sgp.regime, 'integre');
  assert.equal(armp.regime, 'autonome');
  // La hiérarchie que les tests de portée supposent.
  assert.equal(sgp.parent_id, cab.id, 'le SGP est rattaché au Cabinet');
  assert.equal(cgig.parent_id, sgp.id, 'la CGIG est rattachée au SGP');
  assert.equal(armp.parent_id, null, 'un établissement autonome n’est pas rattaché');
});

after(async () => {
  await enPrivilegie(async (bd) => {
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);
  });
  await fermer();
});

/** Un bien minimal, suivi en lot pour n'avoir pas besoin d'immatriculation (RG-021). */
function bienDEssai(structureId, suffixe) {
  return [
    `insert into bien (categorie_code, designation, classement, mode_entree,
       valeur_acquisition, date_acquisition, etat, structure_id, suivi, quantite)
     values ($1, $2, 'immobilisation', 'achat', 100000, current_date, 'bon', $3, 'lot', 1)
     returning id`,
    [categorie.code, `${MARQUE} ${suffixe}`, structureId],
  ];
}

describe('RG-017 — une structure ne lit que ses propres données', () => {
  it('un agent du SGP ne voit aucun bien de l’ARMP', async () => {
    const { lignes, portee } = await transaction(
      { agentId: agentSgp.id, structureId: sgp.id },
      async (bd) => ({
        lignes: await bd.tous('select id, structure_id from bien'),
        // La portée telle que la base la calcule : le SGP et ses filles.
        portee: await bd.tous('select sigl_portee_structures() as id'),
      }),
    );

    assert.ok(lignes.length > 0, 'le SGP doit voir ses propres biens');

    const autorisees = new Set(portee.map((l) => l.id));
    assert.ok(autorisees.has(sgp.id));
    assert.ok(!autorisees.has(armp.id), 'un établissement autonome n’est jamais dans la portée');

    const horsPortee = lignes.filter((l) => !autorisees.has(l.structure_id));
    assert.equal(horsPortee.length, 0, 'aucune ligne hors de la portée ne doit remonter');

    const deLArmp = lignes.filter((l) => l.structure_id === armp.id);
    assert.equal(deLArmp.length, 0, 'et surtout aucune ligne de l’ARMP');
  });

  it('une requête sans filtre ne ramène pas l’ARMP, même en demandant son identifiant', async () => {
    // La requête est écrite « mal exprès » : elle cible explicitement l'ARMP.
    // La politique de lecture la vide quand même.
    const lignes = await transaction(
      { agentId: agentSgp.id, structureId: sgp.id },
      (bd) => bd.tous('select id from bien where structure_id = $1', [armp.id]),
    );
    assert.equal(lignes.length, 0);
  });

  it('les états de besoin, stocks, mouvements et documents sont cloisonnés aussi', async () => {
    const compte = await transaction(
      { agentId: agentSgp.id, structureId: sgp.id },
      async (bd) => ({
        besoins: await bd.valeur('select count(*)::int from etat_besoin where structure_id = $1', [armp.id]),
        stocks: await bd.valeur('select count(*)::int from stock where structure_id = $1', [armp.id]),
        mouvements: await bd.valeur('select count(*)::int from mouvement where structure_id = $1', [armp.id]),
        documents: await bd.valeur('select count(*)::int from document where structure_id = $1', [armp.id]),
        agents: await bd.valeur('select count(*)::int from agent where structure_id = $1', [armp.id]),
      }),
    );
    assert.deepEqual(compte, {
      besoins: 0, stocks: 0, mouvements: 0, documents: 0, agents: 0,
    });
  });

  it('une structure voit ses filles, mais pas sa sœur ni sa mère', async () => {
    const vu = await transaction(
      { agentId: agentSgp.id, structureId: sgp.id },
      async (bd) => ({
        soi: await bd.valeur('select count(*)::int from bien where structure_id = $1', [sgp.id]),
        fille: await bd.valeur('select count(*)::int from bien where structure_id = $1', [cgig.id]),
        soeur: await bd.valeur('select count(*)::int from bien where structure_id = $1', [sgg.id]),
        mere: await bd.valeur('select count(*)::int from bien where structure_id = $1', [cab.id]),
      }),
    );
    assert.ok(vu.soi > 0, 'sa propre structure');
    assert.ok(vu.fille > 0, 'la CGIG est rattachée au SGP : elle est lue');
    assert.equal(vu.soeur, 0, 'le SGG est une structure sœur : il n’est pas lu');
    assert.equal(vu.mere, 0, 'on ne remonte pas vers sa structure mère');
  });

  it('l’ARMP, chez elle, voit bien ses propres lignes', async () => {
    const n = await transaction(
      { agentId: agentArmp.id, structureId: armp.id },
      (bd) => bd.valeur('select count(*)::int from bien'),
    );
    assert.ok(n > 0, 'l’ARMP doit voir son propre patrimoine');
  });

  it('sans contexte de structure, rien ne sort — la requête échoue fermée', async () => {
    await assert.rejects(
      () => transaction({ agentId: agentSgp.id }, (bd) => bd.tous('select 1 from bien')),
      /contexte/i,
      'db.js doit refuser une requête métier sans contexte',
    );
  });
});

describe('RG-018 — une structure autonome n’est jamais écrite par le niveau central', () => {
  it('une écriture du SGP dans l’ARMP est refusée par la base', async () => {
    await assert.rejects(
      () => transaction(
        { agentId: agentSgp.id, structureId: sgp.id },
        (bd) => bd.requete(...bienDEssai(armp.id, 'ecriture-interdite')),
      ),
      /row-level security|violates/i,
      'PostgreSQL doit refuser l’insertion, pas le code applicatif',
    );

    // Et rien n'est resté.
    const reste = await enPrivilegie((bd) => bd.valeur(
      'select count(*)::int from bien where designation = $1',
      [`${MARQUE} ecriture-interdite`],
    ));
    assert.equal(reste, 0);
  });

  it('l’ARMP écrit chez elle sans difficulté', async () => {
    const ligne = await transaction(
      { agentId: agentArmp.id, structureId: armp.id },
      (bd) => bd.un(...bienDEssai(armp.id, 'armp-chez-elle')),
    );
    assert.ok(ligne.id);
  });

  it('une structure mère écrit dans sa fille intégrée, dont le patrimoine est le sien', async () => {
    const ligne = await transaction(
      { agentId: agentSgp.id, structureId: sgp.id },
      (bd) => bd.un(...bienDEssai(cgig.id, 'integre-permise')),
    );
    assert.ok(ligne.id, 'une fille intégrée reste écrivable depuis sa mère');
  });

  it('le Cabinet, au sommet, écrit dans le Secrétariat général', async () => {
    const ligne = await transaction(
      { agentId: agentCab.id, structureId: cab.id },
      (bd) => bd.un(...bienDEssai(sgp.id, 'cabinet-vers-sgp')),
    );
    assert.ok(ligne.id);
  });

  it('mais pas dans une structure sœur, hors de sa portée', async () => {
    await assert.rejects(
      () => transaction(
        { agentId: agentSgp.id, structureId: sgp.id },
        (bd) => bd.un(...bienDEssai(sgg.id, 'soeur-interdite')),
      ),
      /row-level security|violates/i,
    );
  });

  it('ni dans un établissement autonome, même rattaché au Cabinet', async () => {
    await assert.rejects(
      () => transaction(
        { agentId: agentCab.id, structureId: cab.id },
        (bd) => bd.un(...bienDEssai(armp.id, 'cabinet-vers-armp')),
      ),
      /row-level security|violates/i,
      'le rattachement administratif ne donne pas la main sur les écritures',
    );
  });

  it('on ne déplace pas une ligne hors de son cloisonnement par une mise à jour', async () => {
    const ligne = await transaction(
      { agentId: agentSgp.id, structureId: sgp.id },
      (bd) => bd.un(...bienDEssai(sgp.id, 'deplacement')),
    );

    await assert.rejects(
      () => transaction(
        { agentId: agentSgp.id, structureId: sgp.id },
        (bd) => bd.requete('update bien set structure_id = $1 where id = $2', [armp.id, ligne.id]),
      ),
      /row-level security|violates/i,
    );
  });
});

describe('La consolidation — lecture de tout, écriture de rien', () => {
  it('voit les structures intégrées et les établissements autonomes', async () => {
    const lignes = await consolidation((bd) => bd.tous(
      `select structure_id, count(*)::int as n from bien
       where structure_id in ($1, $2) group by structure_id`,
      [sgp.id, armp.id],
    ));
    assert.equal(lignes.length, 2, 'les deux régimes doivent remonter en consolidé');
    assert.ok(lignes.every((l) => l.n > 0));
  });

  it('lit le journal, ce que le contrôle externe doit pouvoir faire', async () => {
    const n = await consolidation((bd) => bd.valeur('select count(*)::int from journal'));
    assert.ok(n > 0);
  });

  it('ne peut rien écrire', async () => {
    await assert.rejects(
      () => consolidation((bd) => bd.requete(...bienDEssai(sgp.id, 'consolidation'))),
      /permission denied|row-level security/i,
      'le rôle de consolidation est en lecture seule',
    );
  });
});

describe('Le cloisonnement ne fuit pas d’une transaction à la suivante', () => {
  it('le rôle et le contexte sont défaits à la fin de chaque transaction', async () => {
    await transaction(
      { agentId: agentArmp.id, structureId: armp.id },
      (bd) => bd.valeur('select count(*) from bien'),
    );

    // La transaction suivante, sur le SGP, ne doit rien voir de l'ARMP.
    const fuite = await transaction(
      { agentId: agentSgp.id, structureId: sgp.id },
      (bd) => bd.valeur('select count(*)::int from bien where structure_id = $1', [armp.id]),
    );
    assert.equal(fuite, 0);

    // Et le client rendu au pool est revenu au rôle propriétaire.
    const role = await enPrivilegie((bd) => bd.valeur('select current_user'));
    assert.equal(role, 'postgres');
  });
});
