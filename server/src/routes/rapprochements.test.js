// rapprochements.test.js — Le rapprochement contradictoire, à travers ses routes.
//
// Décret 13/050 art. 123. Ce que ce fichier prouve :
//
//   1. Le circuit : ouverture, postes, parties, attestations, clôture.
//   2. `valeur_matieres` est **calculée** par le serveur depuis le registre, et
//      n'est pas saisissable. Si elle l'était, le rapprochement confronterait
//      deux déclarations au lieu de confronter une déclaration au registre, et
//      l'art. 123 n'aurait plus d'objet.
//   3. RG-027 : un rapprochement attesté d'un seul côté ne se clôt pas, et le
//      message nomme la partie qui manque.
//   4. Personne n'atteste pour l'autre côté : ce serait la négation du
//      contradictoire.
//   5. Le cloisonnement, tenu par la base sous le rôle non privilégié.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { CLE_PRIVILEGE, SESAME_PRIVILEGE, enPrivilegie, fermer, transaction } from '../db.js';
import { construireApp } from '../app.js';
import { arreterEcoute } from './_flux.js';

process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

const MARQUE = 'ESSAI-RAPPROCHEMENT';

let serveur;
let cgig;
let armp;
let comptableMatieres;  // comptable des matières de la CGIG : tient le rapprochement
let comptablePublic;    // comptable public, mis à disposition : l'autre partie
let chefSgg;            // chef d'une structure sœur : ne doit rien voir
let rapprochement;
let valeurAttendue = 0;
let categorie;

const appel = (agent, options) => serveur.inject({
  ...options,
  headers: { ...(options.headers ?? {}), 'x-agent-id': agent.id },
});

before(async () => {
  await enPrivilegie(async (bd) => {
    cgig = await bd.un("select id, code, regime from structure where code = 'CGIG'");
    armp = await bd.un("select id, code, regime from structure where code = 'ARMP'");
    const sgg = await bd.un("select id from structure where code = 'SGG'");

    comptableMatieres = await bd.un(
      `select a.id, a.nom, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
        where ar.role_code = 'comptable_matieres' and a.structure_id = $1 and a.actif limit 1`,
      [cgig.id],
    );
    comptablePublic = await bd.un(
      `select a.id, a.nom, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
        where ar.role_code = 'comptable_public' and a.actif order by a.nom limit 1`,
    );
    chefSgg = await bd.un(
      `select a.id, a.nom, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
        where ar.role_code = 'chef_structure' and a.structure_id = $1 and a.actif limit 1`,
      [sgg.id],
    );
    assert.ok(comptableMatieres && comptablePublic && chefSgg,
      'le jeu de démonstration doit être chargé');

    // Un poste de nomenclature de premier niveau : on confronte une famille
    // entière, descendance comprise, comme le fait un poste comptable.
    categorie = await bd.un(
      "select code, libelle from categorie where parent_code is null order by code limit 1",
    );
    const somme = await bd.un(
      `with recursive famille as (
          select code from categorie where code = $2
          union all
          select c.code from categorie c join famille f on c.parent_code = f.code
        )
        select coalesce(sum(b.valeur_acquisition), 0) as valeur
          from bien b
         where b.structure_id = $1
           and b.categorie_code in (select code from famille)
           and b.etat <> 'reforme'
           and b.date_acquisition <= '2026-09-30'::date`,
      [cgig.id, categorie.code],
    );
    valeurAttendue = Number(somme.valeur);
    assert.ok(valeurAttendue > 0, 'la CGIG doit détenir des biens de ce poste');
  });

  serveur = await construireApp({ servirWeb: false });
  await serveur.ready();
});

after(async () => {
  arreterEcoute();
  if (serveur) await serveur.close();
  await enPrivilegie(async (bd) => {
    // Les rapprochements emportent leurs postes et leurs parties.
    if (rapprochement) {
      await bd.requete('delete from rapprochement where id = $1', [rapprochement.id]);
    }
    await bd.requete('delete from rapprochement where numero like $1', [`${MARQUE}%`]);
  });
  await fermer();
});

describe('Le circuit du rapprochement contradictoire', () => {
  it('le rapprochement naît ouvert, numéroté par le serveur', async () => {
    const reponse = await appel(comptableMatieres, {
      method: 'POST',
      url: '/api/rapprochements',
      payload: { structure_id: cgig.id, periode_debut: '2026-07-01', periode_fin: '2026-09-30' },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const corps = reponse.json();
    rapprochement = corps.rapprochement;
    assert.equal(rapprochement.statut, 'ouvert');
    assert.match(rapprochement.numero, /^RAP-\d{4}-\d{5}$/);
    assert.deepEqual(corps.postes, []);
    assert.deepEqual(corps.parties, []);
    // Sans poste, il n'y a rien à conclure : le serveur le dit d'avance.
    assert.equal(corps.cloture_possible.possible, false);
    assert.match(corps.cloture_possible.motif, /au moins un poste/);
  });

  it('une période à l’envers est refusée', async () => {
    const reponse = await appel(comptableMatieres, {
      method: 'POST',
      url: '/api/rapprochements',
      payload: { structure_id: cgig.id, periode_debut: '2026-09-30', periode_fin: '2026-07-01' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.equal(reponse.json().erreur.champ, 'periode_fin');
  });

  it('on n’atteste pas une confrontation qui n’a pas eu lieu', async () => {
    const reponse = await appel(comptableMatieres, {
      method: 'POST', url: `/api/rapprochements/${rapprochement.id}/attester`, payload: {},
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.equal(reponse.json().erreur.champ, 'postes');
  });

  it('la valeur des matières est calculée par le serveur, pas saisie', async () => {
    // Le champ n'existe pas au schéma : une tentative de le poser est refusée
    // avant d'atteindre le métier.
    const refus = await appel(comptableMatieres, {
      method: 'POST',
      url: `/api/rapprochements/${rapprochement.id}/postes`,
      payload: { categorie_code: categorie.code, valeur_matieres: 1, valeur_generale: 1 },
    });
    assert.equal(refus.statusCode, 400, refus.body);
    assert.equal(refus.json().erreur.code, 'donnees_invalides');

    const reponse = await appel(comptableMatieres, {
      method: 'POST',
      url: `/api/rapprochements/${rapprochement.id}/postes`,
      payload: {
        categorie_code: categorie.code,
        valeur_generale: Math.round(valeurAttendue * 0.95),
        explication: 'Écart de 5 % : prises en charge postérieures à la clôture.',
      },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const poste = reponse.json().postes.find((p) => p.categorie_code === categorie.code);
    assert.equal(Number(poste.valeur_matieres), valeurAttendue,
      'la valeur vient du registre, descendance de la catégorie comprise');
    assert.ok(poste.categorie_libelle, 'le poste est libellé, pas seulement codé');
    assert.equal(
      Number(poste.ecart),
      Math.round((valeurAttendue - Math.round(valeurAttendue * 0.95)) * 100) / 100,
    );
    // Les deux colonnes sont renseignées : le constat est fait.
    assert.equal(reponse.json().rapprochement.statut, 'constate');
  });

  it('le même poste ne paraît pas deux fois', async () => {
    const reponse = await appel(comptableMatieres, {
      method: 'POST',
      url: `/api/rapprochements/${rapprochement.id}/postes`,
      payload: { categorie_code: categorie.code, valeur_generale: 1000 },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.equal(reponse.json().erreur.champ, 'categorie_code');
  });

  it('un poste muet du côté de la comptabilité générale ramène le constat à l’état ouvert', async () => {
    const autre = await enPrivilegie((bd) => bd.un(
      'select code from categorie where parent_code is null and code <> $1 order by code limit 1',
      [categorie.code],
    ));
    const reponse = await appel(comptableMatieres, {
      method: 'POST',
      url: `/api/rapprochements/${rapprochement.id}/postes`,
      payload: {
        categorie_code: autre.code,
        explication: "La comptabilité générale n'a pas encore communiqué ce poste.",
      },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    assert.equal(reponse.json().rapprochement.statut, 'ouvert',
      'un constat partiel n’est pas un constat');
    const totaux = reponse.json().totaux;
    assert.equal(totaux.postes_sans_comptabilite_generale, 1,
      'le total dit à part ce qui n’est pas encore confronté');
  });

  it('les deux parties au contradictoire sont inscrites', async () => {
    for (const [agent, qualite] of [
      [comptableMatieres, 'comptable_matieres'],
      [comptablePublic, 'comptable_general'],
    ]) {
      const reponse = await appel(comptableMatieres, {
        method: 'POST',
        url: `/api/rapprochements/${rapprochement.id}/parties`,
        payload: { agent_id: agent.id, qualite },
      });
      assert.equal(reponse.statusCode, 201, reponse.body);
    }
    const detail = await appel(comptableMatieres, {
      method: 'GET', url: `/api/rapprochements/${rapprochement.id}`,
    });
    assert.equal(detail.json().parties.length, 2);
    assert.ok(detail.json().parties.every((p) => p.nom));
    // Inscrites mais muettes : RG-027 bloque toujours.
    assert.equal(detail.json().cloture_possible.code, 'RG-027');
  });

  it('une troisième partie n’entre pas dans le contradictoire', async () => {
    const reponse = await appel(comptableMatieres, {
      method: 'POST',
      url: `/api/rapprochements/${rapprochement.id}/parties`,
      payload: { agent_id: chefSgg.id, qualite: 'comptable_general' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.equal(reponse.json().erreur.champ, 'qualite');
  });

  it('qui n’est pas partie n’atteste pas', async () => {
    const reponse = await appel(chefSgg, {
      method: 'POST', url: `/api/rapprochements/${rapprochement.id}/attester`, payload: {},
    });
    assert.ok([403, 404].includes(reponse.statusCode), `reçu ${reponse.statusCode} : ${reponse.body}`);
  });

  it('la première partie atteste', async () => {
    const reponse = await appel(comptableMatieres, {
      method: 'POST', url: `/api/rapprochements/${rapprochement.id}/attester`, payload: {},
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const partie = reponse.json().parties.find((p) => p.qualite === 'comptable_matieres');
    assert.ok(partie.atteste_le, 'son attestation est horodatée');
    const autre = reponse.json().parties.find((p) => p.qualite === 'comptable_general');
    assert.equal(autre.atteste_le, null, 'et personne n’atteste pour elle');
  });

  it('elle n’atteste pas deux fois', async () => {
    const reponse = await appel(comptableMatieres, {
      method: 'POST', url: `/api/rapprochements/${rapprochement.id}/attester`, payload: {},
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.equal(reponse.json().erreur.champ, 'atteste_le');
  });

  it('RG-027 — attesté d’un seul côté, le rapprochement ne se clôt pas', async () => {
    const detail = await appel(comptableMatieres, {
      method: 'GET', url: `/api/rapprochements/${rapprochement.id}`,
    });
    assert.equal(detail.json().cloture_possible.possible, false);
    assert.equal(detail.json().cloture_possible.code, 'RG-027');

    const reponse = await appel(comptableMatieres, {
      method: 'POST',
      url: `/api/rapprochements/${rapprochement.id}/clore`,
      payload: { conclusion: 'Clôture tentée sans la seconde partie.' },
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    const { erreur } = reponse.json();
    assert.equal(erreur.code, 'RG-027');
    assert.equal(erreur.champ, 'parties');
    // Le message nomme la partie qui manque.
    assert.match(erreur.message, /comptable général/i);

    await enPrivilegie(async (bd) => {
      const ligne = await bd.un(
        'select statut, clos_le, conclusion from rapprochement where id = $1', [rapprochement.id],
      );
      assert.notEqual(ligne.statut, 'clos', 'rien n’a été écrit');
      assert.equal(ligne.clos_le, null);
      assert.equal(ligne.conclusion, null);
    });
  });

  it('une réserve n’empêche pas d’attester : le contradictoire la conserve', async () => {
    const reponse = await appel(comptablePublic, {
      method: 'POST',
      url: `/api/rapprochements/${rapprochement.id}/attester`,
      payload: { reserve: 'Sous réserve de la valorisation des aménagements intérieurs.' },
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const partie = reponse.json().parties.find((p) => p.qualite === 'comptable_general');
    assert.ok(partie.atteste_le);
    assert.match(partie.reserve, /Sous réserve/);
    assert.equal(reponse.json().cloture_possible.possible, true,
      'les deux parties ayant attesté, RG-027 laisse passer');
  });

  it('attesté des deux côtés, il se clôt avec sa conclusion', async () => {
    const reponse = await appel(comptableMatieres, {
      method: 'POST',
      url: `/api/rapprochements/${rapprochement.id}/clore`,
      payload: {
        conclusion: "Écart de 5 % expliqué par des prises en charge tardives ; arrêté sous la réserve du comptable général.",
      },
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    assert.equal(corps.rapprochement.statut, 'clos');
    assert.ok(corps.rapprochement.clos_le);
    assert.match(corps.rapprochement.conclusion, /prises en charge tardives/);

    // RG-020 : l'action sensible est au journal, avec ses deux attestations.
    await enPrivilegie(async (bd) => {
      const trace = await bd.un(
        `select apres from journal
          where action = 'cloture_rapprochement' and objet_id = $1
          order by horodatage desc limit 1`,
        [String(rapprochement.id)],
      );
      assert.ok(trace, 'la clôture laisse une trace au journal');
      assert.equal(trace.apres.statut, 'clos');
      assert.equal(trace.apres.attestations.length, 2);
      assert.ok(trace.apres.attestations.some((a) => a.reserve));
      assert.ok(Object.hasOwn(trace.apres.totaux, 'ecart'));
    });
  });

  it('un rapprochement clos est figé : ni poste, ni partie, ni seconde clôture', async () => {
    for (const [url, payload] of [
      [`/api/rapprochements/${rapprochement.id}/postes`, { categorie_code: categorie.code }],
      [`/api/rapprochements/${rapprochement.id}/parties`, { agent_id: chefSgg.id, qualite: 'comptable_general' }],
      [`/api/rapprochements/${rapprochement.id}/clore`, { conclusion: 'Seconde clôture.' }],
    ]) {
      const reponse = await appel(comptableMatieres, { method: 'POST', url, payload });
      assert.equal(reponse.statusCode, 400, `${url} : ${reponse.body}`);
    }
  });
});

describe('Le périmètre des rapprochements', () => {
  it("un chef de structure ne voit pas le rapprochement d'une autre structure", async () => {
    const reponse = await appel(chefSgg, { method: 'GET', url: '/api/rapprochements?parPage=200' });
    assert.equal(reponse.statusCode, 200, reponse.body);
    assert.ok(!reponse.json().donnees.map((r) => r.numero).includes(rapprochement.numero));
  });

  it("il ne l'ouvre pas davantage par son identifiant", async () => {
    const reponse = await appel(chefSgg, {
      method: 'GET', url: `/api/rapprochements/${rapprochement.id}`,
    });
    assert.ok([403, 404].includes(reponse.statusCode), `reçu ${reponse.statusCode} : ${reponse.body}`);
  });

  it("la liste porte l'écart et le compte des attestations", async () => {
    const reponse = await appel(comptableMatieres, {
      method: 'GET', url: '/api/rapprochements?parPage=200',
    });
    const vue = reponse.json().donnees.find((r) => r.numero === rapprochement.numero);
    assert.ok(vue, 'le rapprochement doit être dans la liste de sa structure');
    assert.equal(vue.nombre_postes, 2);
    assert.equal(vue.attestations, 2);
    assert.equal(vue.attestations_attendues, 2);
    assert.equal(typeof vue.ecart, 'number');
  });
});

// --- Le cloisonnement tenu par la base ----------------------------------

describe('La base tient le cloisonnement du rapprochement', () => {
  it('la comptable des matières de la CGIG lit ses propres lignes', async () => {
    const vu = await transaction(
      { agentId: comptableMatieres.id, structureId: comptableMatieres.structure_id },
      (bd) => bd.tous('select numero from rapprochement where id = $1', [rapprochement.id]),
    );
    assert.equal(vu.length, 1, 'le témoin de référence');
  });

  it("un chef de structure ne lit en base ni le rapprochement ni ses postes", async () => {
    const vu = await transaction(
      { agentId: chefSgg.id, structureId: chefSgg.structure_id },
      async (bd) => ({
        rapprochements: await bd.tous('select numero from rapprochement where id = $1', [rapprochement.id]),
        postes: await bd.tous(
          'select id from rapprochement_poste where rapprochement_id = $1', [rapprochement.id],
        ),
        parties: await bd.tous(
          'select id from rapprochement_partie where rapprochement_id = $1', [rapprochement.id],
        ),
      }),
    );
    assert.deepEqual(vu.rapprochements, []);
    assert.deepEqual(vu.postes, []);
    assert.deepEqual(vu.parties, []);
  });

  it("RG-018 en base : le comptable des matières d'une structure intégrée n'ouvre rien chez un autonome", async () => {
    await assert.rejects(
      () => transaction(
        { agentId: comptableMatieres.id, structureId: comptableMatieres.structure_id },
        (bd) => bd.requete(
          `insert into rapprochement (numero, structure_id, periode_debut, periode_fin, statut, cree_par)
           values ($1, $2, '2026-01-01', '2026-03-31', 'ouvert', $3)`,
          [`${MARQUE}-ARMP`, armp.id, comptableMatieres.id],
        ),
      ),
      /row-level security|violates/i,
      "l'ARMP tient sa propre comptabilité des matières : la base doit refuser",
    );
    await enPrivilegie(async (bd) => {
      const pose = await bd.un('select id from rapprochement where numero = $1', [`${MARQUE}-ARMP`]);
      assert.equal(pose, null);
    });
  });
});
