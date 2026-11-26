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
  consolidation, enPrivilegie, fermer, transaction,
} from './db.js';

const MARQUE = 'ESSAI-ISOLATION';

let sgp;      // Secrétariat Général à la Primature — régime `integre`
let sgg;      // Secrétariat Général du Gouvernement — régime `integre`
let armp;     // Autorité de Régulation des Marchés Publics — régime `autonome`
let agentSgp;
let agentArmp;
let categorie;

before(async () => {
  await enPrivilegie(async (bd) => {
    sgp = await bd.un("select id, code, regime from structure where code = 'SGP'");
    sgg = await bd.un("select id, code, regime from structure where code = 'SGG'");
    armp = await bd.un("select id, code, regime from structure where code = 'ARMP'");
    agentSgp = await bd.un('select id from agent where structure_id = $1 limit 1', [sgp.id]);
    agentArmp = await bd.un('select id from agent where structure_id = $1 limit 1', [armp.id]);
    categorie = await bd.un(
      "select code from categorie where classement = 'immobilisation' and parent_code is not null limit 1",
    );
  });

  assert.ok(sgp && sgg && armp, 'le jeu de démonstration doit être chargé');
  assert.equal(sgp.regime, 'integre');
  assert.equal(armp.regime, 'autonome');
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
    const lignes = await transaction(
      { agentId: agentSgp.id, structureId: sgp.id },
      (bd) => bd.tous('select id, structure_id from bien'),
    );

    assert.ok(lignes.length > 0, 'le SGP doit voir ses propres biens');
    const etrangers = lignes.filter((l) => l.structure_id !== sgp.id);
    assert.equal(etrangers.length, 0, 'aucune ligne d’une autre structure ne doit remonter');
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

  it('le niveau central écrit dans une structure intégrée, dont le patrimoine est le sien', async () => {
    const ligne = await transaction(
      { agentId: agentSgp.id, structureId: sgp.id },
      (bd) => bd.un(...bienDEssai(sgg.id, 'integre-permise')),
    );
    assert.ok(ligne.id, 'une structure intégrée reste écrivable depuis le central');
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
