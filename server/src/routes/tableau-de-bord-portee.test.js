// tableau-de-bord-portee.test.js — Le périmètre des agrégats d'achat du poste
// de commande.
//
// CE QUI ÉTAIT À PROUVER. `achats.par_procedure` et `achats.ecarts` sont les
// deux seules requêtes du tableau de bord écrites **sans** filtre de portée :
// un `group by` sur `dossier_achat` et une somme sur `bon_commande`, sans la
// clause que toutes les autres portent. Depuis la migration 20261127050000,
// ces deux tables sont sous sécurité au niveau des lignes, donc la base
// *devrait* borner les agrégats d'elle-même.
//
// « Devrait » n'est pas une preuve. Une politique correcte lue au bout d'une
// jointure s'est déjà effacée une fois sur ces mêmes tables (migration
// 20261127040000), et le symptôme n'était pas une erreur : c'était un chiffre
// juste en apparence. Un agrégat qui fuit ne lève rien, ne trace rien, et
// affiche simplement l'argent des autres.
//
// CE QUE CES ESSAIS MORDENT. Ils ne vérifient pas qu'un chiffre est « non
// vide » : ils l'opposent à la vérité terrain, lue en chemin privilégié et
// restreinte aux structures que l'agent a le droit de lire. Toute fuite, même
// d'un seul franc, fait rougir l'égalité. Et la comparaison avec la portée
// totale est exigée strictement supérieure, pour qu'un cloisonnement qui
// rendrait tout n'échappe pas à l'essai.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { CLE_PRIVILEGE, SESAME_PRIVILEGE, enPrivilegie, fermer } from '../db.js';
import { construireApp } from '../app.js';
import { arreterEcoute } from './_flux.js';
import { chargerAgent } from './_droits.js';
import { structuresLisibles } from '../regles/roles.js';

process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

const MARQUE = 'ESSAI-PORTEE-TDB';

// Deux montants hors d'échelle, et une paire procédure / statut peu fréquente :
// si l'un d'eux apparaît chez qui n'y a pas droit, l'écart se voit à l'œil nu.
const MONTANT_DU = 777_000_000;
const MONTANT_ARMP = 888_000_000;
const PROCEDURE = 'aoi';
const STATUT_DOSSIER = 'execute';

let serveur;
let chefSgg;          // portée propre : le SGG et ses filles
let comptablePublic;  // au SGP : portée transversale du périmètre intégré
let logistique;       // portée totale : la consolidation
let du;               // Delivery Unit — intégrée, hors de la portée du SGG
let armp;             // ARMP — établissement public autonome

const appel = (agent, options) => serveur.inject({
  ...options,
  headers: { ...(options.headers ?? {}), 'x-agent-id': agent.id },
});

const tableauDeBord = async (agent) => {
  const reponse = await appel(agent, { method: 'GET', url: '/api/tableau-de-bord' });
  assert.equal(reponse.statusCode, 200, reponse.body);
  return reponse.json();
};

/** La somme des montants estimés de la table `achats.par_procedure`. */
const sommeProcedures = (corps) => corps.achats.par_procedure
  .reduce((total, ligne) => total + Number(ligne.montant_estime), 0);

/** Le groupe de l'essai dans `par_procedure`, ou `null` s'il n'y est pas. */
const groupeDeLEssai = (corps) => corps.achats.par_procedure
  .find((d) => d.procedure === PROCEDURE && d.statut === STATUT_DOSSIER) ?? null;

/**
 * Une chaîne minimale dans une structure : état de besoin, dossier, bon de
 * commande. Le montage passe par le chemin privilégié, seul moyen de poser une
 * pièce là où l'agent qui joue l'essai n'a précisément pas le droit d'écrire.
 */
async function chaine(bd, structure, suffixe, montant) {
  const demandeur = await bd.un(
    'select id from agent where structure_id = $1 and actif order by nom limit 1',
    [structure.id],
  );
  const fournisseur = await bd.un(
    'select id from fournisseur where not liste_noire and actif order by denomination limit 1',
  );
  const besoin = await bd.un(
    `insert into etat_besoin (numero, structure_id, demandeur_id, statut, justification)
     values ($1, $2, $3, 'en_achat', $4) returning id, numero`,
    [`${MARQUE}/EB/${suffixe}`, structure.id, demandeur.id, `Essai de portée — ${suffixe}`],
  );
  const dossier = await bd.un(
    `insert into dossier_achat (numero, etat_besoin_id, objet, montant_estime, procedure, statut)
     values ($1, $2, $3, $4, $5, $6) returning id, numero, structure_id`,
    [
      `${MARQUE}/DA/${suffixe}`, besoin.id, `${MARQUE} dossier ${suffixe}`,
      montant, PROCEDURE, STATUT_DOSSIER,
    ],
  );
  const bon = await bd.un(
    `insert into bon_commande (numero, dossier_id, fournisseur_id, montant, statut, emis_le)
     values ($1, $2, $3, $4, 'emis', now() - interval '20 days')
     returning id, numero, structure_id`,
    [`${MARQUE}/BC/${suffixe}`, dossier.id, fournisseur.id, montant],
  );
  // Le rattachement est inscrit sur la ligne par le déclencheur de la
  // migration 040000 : sans lui, aucune politique n'aurait de quoi mordre.
  assert.equal(String(dossier.structure_id), String(structure.id));
  assert.equal(String(bon.structure_id), String(structure.id));
  return { besoin, dossier, bon };
}

/** Les structures que cet agent a le droit de lire, ou `null` s'il lit tout. */
async function structuresPermises(agent) {
  const charge = await chargerAgent(agent.id);
  const structures = await enPrivilegie(
    (bd) => bd.tous('select id, parent_id, regime from structure'),
  );
  const permises = structuresLisibles(charge, structures).map(String);
  return permises.length === structures.length ? null : permises;
}

/**
 * La vérité terrain des deux agrégats, lue sans aucune politique, bornée aux
 * structures passées — ou sur tout quand elles valent `null`.
 */
async function verite(structures) {
  return enPrivilegie(async (bd) => {
    const borne = structures ? 'where structure_id = any($1::uuid[])' : '';
    const params = structures ? [structures] : [];
    const bons = await bd.un(
      `select coalesce(sum(montant), 0) as montant, count(*)::int as nombre
         from bon_commande ${borne}`,
      params,
    );
    const dossiers = await bd.un(
      `select coalesce(sum(montant_estime), 0) as montant from dossier_achat ${borne}`,
      params,
    );
    return {
      montant_commande: Number(bons.montant),
      bons: bons.nombre,
      montant_estime: Number(dossiers.montant),
    };
  });
}

before(async () => {
  await enPrivilegie(async (bd) => {
    du = await bd.un("select id, code, regime from structure where code = 'DU'");
    armp = await bd.un("select id, code, regime from structure where code = 'ARMP'");
    const sgg = await bd.un("select id, code from structure where code = 'SGG'");
    assert.ok(du && armp && sgg, 'le jeu de démonstration doit être chargé');
    assert.equal(du.regime, 'integre');
    assert.equal(armp.regime, 'autonome');

    chefSgg = await bd.un(
      `select a.id, a.nom, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
        where ar.role_code = 'chef_structure' and a.structure_id = $1 and a.actif limit 1`,
      [sgg.id],
    );
    comptablePublic = await bd.un(
      `select a.id, a.nom, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
         join structure s on s.id = a.structure_id
        where ar.role_code = 'comptable_public' and s.code = 'SGP' and a.actif limit 1`,
    );
    logistique = await bd.un(
      `select a.id, a.nom from agent a join agent_role ar on ar.agent_id = a.id
        where ar.role_code = 'logistique' and a.actif order by a.nom limit 1`,
    );
    assert.ok(chefSgg && comptablePublic && logistique, 'les trois profils doivent exister');

    await chaine(bd, du, 'DU', MONTANT_DU);
    await chaine(bd, armp, 'ARMP', MONTANT_ARMP);
  });

  serveur = await construireApp({ servirWeb: false });
  await serveur.ready();
});

after(async () => {
  arreterEcoute();
  if (serveur) await serveur.close();
  await enPrivilegie(async (bd) => {
    await bd.requete('delete from bon_commande where numero like $1', [`${MARQUE}%`]);
    await bd.requete('delete from dossier_achat where numero like $1', [`${MARQUE}%`]);
    await bd.requete('delete from etat_besoin where numero like $1', [`${MARQUE}%`]);
  });
  await fermer();
});

describe("Le périmètre des agrégats d'achat du poste de commande", () => {
  it("un chef de structure ne lit que les montants de sa structure", async () => {
    const permises = await structuresPermises(chefSgg);
    assert.ok(permises, 'un chef de structure ne lit pas toutes les structures');
    assert.ok(
      !permises.includes(String(du.id)),
      "la Delivery Unit n'est pas dans la portée du SGG : c'est ce qui rend l'essai mordant",
    );
    assert.ok(!permises.includes(String(armp.id)), "l'ARMP non plus");

    const propre = await tableauDeBord(chefSgg);
    const totale = await tableauDeBord(logistique);
    const attendu = await verite(permises);

    // L'égalité à la vérité terrain : toute fuite, même d'un franc, rougit ici.
    assert.equal(
      Number(propre.achats.ecarts.montant_commande), attendu.montant_commande,
      "les écarts ne doivent sommer que les bons de commande de la portée du chef",
    );
    assert.equal(propre.achats.ecarts.bons, attendu.bons);
    assert.equal(
      sommeProcedures(propre), attendu.montant_estime,
      "`par_procedure` ne doit grouper que les dossiers de la portée du chef",
    );

    // Et la comparaison exigée par le contrat : strictement inférieur au total.
    assert.ok(
      Number(totale.achats.ecarts.montant_commande) > Number(propre.achats.ecarts.montant_commande),
      'la portée totale lit strictement plus que la portée propre',
    );
    assert.ok(
      sommeProcedures(totale) > sommeProcedures(propre),
      'de même pour la table par procédure',
    );

    // Les deux montants hors d'échelle n'apparaissent nulle part chez lui.
    assert.equal(
      groupeDeLEssai(propre), null,
      "ni le dossier de la Delivery Unit ni celui de l'ARMP ne doivent figurer dans son groupe",
    );
  });

  it("le comptable public garde le périmètre intégré, et l'autonome en reste dehors", async () => {
    const permises = await structuresPermises(comptablePublic);
    assert.ok(permises, "sa portée est transversale, pas totale");
    assert.ok(
      permises.includes(String(du.id)),
      'sa fonction porte sur l’institution : la Delivery Unit est dans sa portée',
    );
    assert.ok(
      !permises.includes(String(armp.id)),
      "elle s'arrête à la frontière juridique de l'établissement autonome",
    );

    const vu = await tableauDeBord(comptablePublic);
    const totale = await tableauDeBord(logistique);
    const attendu = await verite(permises);

    assert.equal(
      Number(vu.achats.ecarts.montant_commande), attendu.montant_commande,
      'les écarts du comptable public somment exactement le périmètre intégré',
    );
    assert.equal(vu.achats.ecarts.bons, attendu.bons);
    assert.equal(sommeProcedures(vu), attendu.montant_estime);

    // Le bon de la Delivery Unit est bien dedans, celui de l'ARMP bien dehors.
    const sien = groupeDeLEssai(vu);
    assert.ok(sien, 'le dossier de la Delivery Unit doit figurer dans son groupe');
    const tout = groupeDeLEssai(totale);
    assert.equal(
      Number(tout.montant_estime) - Number(sien.montant_estime), MONTANT_ARMP,
      "l'écart avec la portée totale est exactement le dossier de l'ARMP, et rien d'autre",
    );
    assert.equal(
      Number(totale.achats.ecarts.montant_commande) - Number(vu.achats.ecarts.montant_commande),
      MONTANT_ARMP,
      "le bon de l'ARMP est le seul que le comptable public ne somme pas",
    );
  });

  it("la portée totale lit tout, et n'écrit rien", async () => {
    const avant = await enPrivilegie((bd) => bd.un(
      `select (select count(*)::int from journal) as journal,
              (select count(*)::int from bon_commande) as bons,
              (select count(*)::int from dossier_achat) as dossiers,
              (select count(*)::int from document) as documents`,
    ));

    const totale = await tableauDeBord(logistique);
    const attendu = await verite(null);

    assert.equal(await structuresPermises(logistique), null, 'sa portée est totale');
    assert.equal(Number(totale.achats.ecarts.montant_commande), attendu.montant_commande);
    assert.equal(totale.achats.ecarts.bons, attendu.bons);
    assert.equal(sommeProcedures(totale), attendu.montant_estime);
    const tout = groupeDeLEssai(totale);
    assert.equal(
      Number(tout.montant_estime), MONTANT_DU + MONTANT_ARMP,
      'elle lit les deux dossiers de l’essai, intégré comme autonome',
    );

    const apres = await enPrivilegie((bd) => bd.un(
      `select (select count(*)::int from journal) as journal,
              (select count(*)::int from bon_commande) as bons,
              (select count(*)::int from dossier_achat) as dossiers,
              (select count(*)::int from document) as documents`,
    ));
    assert.deepEqual(
      apres, avant,
      "la consultation du poste de commande n'écrit rien, pas même une ligne de journal",
    );
  });
});
