// perimetre-achats.test.js — Le périmètre des bons de commande, et la chaîne
// qui va de la commande au paiement.
//
// LE DÉFAUT CONSTATÉ. `GET /api/bons-commande` n'était pas filtré par
// structure, alors que `/api/receptions` et `/api/documents` le sont — parce
// que ces deux-là lisent `document`, qui porte un `structure_id` et donc une
// politique de sécurité au niveau des lignes (ADR-001), tandis que
// `bon_commande` et `dossier_achat` n'en portent pas.
//
// La conséquence n'était pas d'affichage. Un comptable public voyait **tous**
// les bons de commande et aucun certificat de prise en charge hors de sa
// structure : `POST /api/bons-commande/:id/payable` lui opposait RG-011 — pas
// de paiement sans certificat — alors que le certificat existait. Aucun
// comptable public ne pouvait marquer payable hors du Secrétariat général à la
// Primature, et le cœur du système était rompu pour le reste de l'institution.
//
// CE QUI A ÉTÉ RETENU, ET POURQUOI. Les deux bouts ont été corrigés, parce que
// les deux étaient faux :
//
//   1. la liste des bons est filtrée par le périmètre de l'état de besoin qui
//      les a motivés, comme les réceptions et les documents ;
//   2. la portée du **comptable public** est élargie en lecture à tout le
//      périmètre intégré. Il n'est pas un agent de la structure : il est mis à
//      disposition par le ministère du Budget ou des Finances, et le décret
//      13/050 art. 137 lui confie un contrôle en matière de dépenses **et** en
//      matière de patrimoine. Sa fonction porte sur l'institution, pas sur la
//      cellule où est son bureau.
//
// OÙ ELLE S'ARRÊTE. À la frontière juridique. Un établissement public autonome
// a sa personnalité juridique et **son propre comptable public** : sa
// comptabilité des matières ne se lit pas d'en haut, et ne s'écrit pas d'en
// haut non plus. RG-018 est inchangée, et ce fichier le vérifie.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { CLE_PRIVILEGE, SESAME_PRIVILEGE, enPrivilegie, fermer } from '../db.js';
import { construireApp } from '../app.js';
import { arreterEcoute } from './_flux.js';

process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

const MARQUE = 'ESSAI-PERIMETRE-ACHAT';

let serveur;
let comptablePublic;   // au SGP, structure intégrée — portée transversale
let chefSgg;           // au SGG, structure sœur du SGP : portée propre
let fournisseur;
let du;                // Delivery Unit — intégrée, **hors** de la portée propre du SGP
let armp;              // ARMP — établissement public autonome
const cas = {};        // les bons fabriqués, par clef

const appel = (agent, options) => serveur.inject({
  ...options,
  headers: { ...(options.headers ?? {}), 'x-agent-id': agent.id },
});

/**
 * Fabrique une chaîne complète dans une structure : état de besoin, ligne
 * d'achat, dossier, bon de commande, PV de réception signé et — au choix —
 * certificat de prise en charge signé.
 *
 * Le montage passe par le chemin privilégié, comme le jeu de démonstration :
 * c'est le seul moyen de poser une pièce dans une structure où l'agent qui
 * joue l'essai n'a précisément pas le droit d'écrire.
 */
async function chaine(bd, structure, suffixe, { certificat = true } = {}) {
  const demandeur = await bd.un(
    'select id from agent where structure_id = $1 and actif order by nom limit 1',
    [structure.id],
  );
  const categorie = await bd.un(
    "select code from categorie where parent_code is not null order by code limit 1",
  );
  const besoin = await bd.un(
    `insert into etat_besoin (numero, structure_id, demandeur_id, statut, justification)
     values ($1, $2, $3, 'en_achat', $4) returning id, numero`,
    [`${MARQUE}/EB/${suffixe}`, structure.id, demandeur.id, `Essai de périmètre — ${suffixe}`],
  );
  await bd.requete(
    `insert into ligne_besoin (etat_besoin_id, structure_id, categorie_code, designation,
       quantite_demandee, quantite_accordee, origine, rang)
     values ($1, $2, $3, $4, 12, 10, 'achat', 1)`,
    [besoin.id, structure.id, categorie.code, `${MARQUE} article ${suffixe}`],
  );
  const dossier = await bd.un(
    `insert into dossier_achat (numero, etat_besoin_id, objet, montant_estime, procedure, statut)
     values ($1, $2, $3, 9000000, 'gre_a_gre', 'attribue') returning id, numero`,
    [`${MARQUE}/DA/${suffixe}`, besoin.id, `${MARQUE} dossier ${suffixe}`],
  );
  const bon = await bd.un(
    `insert into bon_commande (numero, dossier_id, fournisseur_id, montant, statut, emis_le, livre_le)
     values ($1, $2, $3, 9000000, 'receptionne', now() - interval '40 days', now() - interval '5 days')
     returning id, numero, statut`,
    [`${MARQUE}/BC/${suffixe}`, dossier.id, fournisseur.id],
  );
  await bd.requete(
    `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
       signataire_id, signe_le, fige)
     values ('pv_reception', $1, $2, 'bon_commande', $3, '{"lignes":[]}'::jsonb, $4, now(), true)`,
    [`${MARQUE}/PV/${suffixe}`, structure.id, String(bon.id), demandeur.id],
  );
  if (certificat) {
    await bd.requete(
      `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
         signataire_id, signe_le, fige)
       values ('certificat_prise_en_charge', $1, $2, 'bon_commande', $3, '{}'::jsonb, $4, now(), true)`,
      [`${MARQUE}/CPC/${suffixe}`, structure.id, String(bon.id), demandeur.id],
    );
  }
  return { ...bon, structure, besoin, dossier };
}

before(async () => {
  await enPrivilegie(async (bd) => {
    du = await bd.un("select id, code, regime from structure where code = 'DU'");
    armp = await bd.un("select id, code, regime from structure where code = 'ARMP'");
    const sgg = await bd.un("select id, code from structure where code = 'SGG'");
    comptablePublic = await bd.un(
      `select a.id, a.nom, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
         join structure s on s.id = a.structure_id
        where ar.role_code = 'comptable_public' and s.code = 'SGP' and a.actif limit 1`,
    );
    chefSgg = await bd.un(
      `select a.id, a.nom, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
        where ar.role_code = 'chef_structure' and a.structure_id = $1 and a.actif limit 1`,
      [sgg.id],
    );
    fournisseur = await bd.un(
      'select id from fournisseur where not liste_noire and actif order by denomination limit 1',
    );
    assert.ok(du && armp && fournisseur, 'le jeu de démonstration doit être chargé');
    assert.equal(du.regime, 'integre', 'la Delivery Unit est une structure intégrée');
    assert.equal(armp.regime, 'autonome', "l'ARMP est un établissement public autonome");
    assert.ok(comptablePublic, 'le jeu de démonstration doit porter un comptable public');

    // La Delivery Unit n'est pas une fille du SGP : c'est bien un bon hors de
    // la portée propre du comptable public, et c'est tout l'objet de l'essai.
    const sgp = await bd.un("select id from structure where code = 'SGP'");
    const duParent = await bd.un('select parent_id from structure where id = $1', [du.id]);
    assert.notEqual(String(duParent.parent_id), String(sgp.id));

    cas.integreAvecCertificat = await chaine(bd, du, 'DU-AVEC');
    cas.integreSansCertificat = await chaine(bd, du, 'DU-SANS', { certificat: false });
    cas.autonome = await chaine(bd, armp, 'ARMP-AVEC');
  });

  serveur = await construireApp({ servirWeb: false });
  await serveur.ready();
});

after(async () => {
  arreterEcoute();
  if (serveur) await serveur.close();
  await enPrivilegie(async (bd) => {
    await bd.requete('delete from document where numero like $1', [`${MARQUE}%`]);
    await bd.requete('delete from bon_commande where numero like $1', [`${MARQUE}%`]);
    await bd.requete('delete from dossier_achat where numero like $1', [`${MARQUE}%`]);
    await bd.requete('delete from etat_besoin where numero like $1', [`${MARQUE}%`]);
  });
  await fermer();
});

/** Les numéros de bons que cet agent voit, sur la liste complète. */
async function bonsVus(agent) {
  const reponse = await appel(agent, { method: 'GET', url: '/api/bons-commande?parPage=200' });
  assert.equal(reponse.statusCode, 200);
  return reponse.json().donnees.map((b) => b.numero);
}

describe('Le périmètre des bons de commande', () => {
  it('un chef de structure ne voit que les bons de sa structure', async () => {
    const vus = await bonsVus(chefSgg);
    assert.ok(
      !vus.includes(cas.integreAvecCertificat.numero),
      "le chef du SGG ne voit pas le bon de la Delivery Unit : c'était là le défaut",
    );
    assert.ok(!vus.includes(cas.autonome.numero));
  });

  it("le comptable public voit le périmètre intégré, jamais un établissement autonome", async () => {
    const vus = await bonsVus(comptablePublic);
    assert.ok(
      vus.includes(cas.integreAvecCertificat.numero),
      'le comptable public voit le bon de la Delivery Unit : sa fonction est transversale',
    );
    assert.ok(
      !vus.includes(cas.autonome.numero),
      "il ne voit pas le bon de l'ARMP : cet établissement a son propre comptable public",
    );
  });

  it('le certificat compte juste sur la liste : l’écran ne mentait plus', async () => {
    const reponse = await appel(comptablePublic, {
      method: 'GET', url: '/api/bons-commande?parPage=200',
    });
    const avec = reponse.json().donnees.find((b) => b.numero === cas.integreAvecCertificat.numero);
    const sans = reponse.json().donnees.find((b) => b.numero === cas.integreSansCertificat.numero);
    assert.equal(avec.pris_en_charge, true);
    assert.equal(sans.pris_en_charge, false);
  });
});

describe('La chaîne de la commande au paiement', () => {
  it('le comptable public marque payable un bon dont le certificat est dans une autre structure intégrée', async () => {
    const reponse = await appel(comptablePublic, {
      method: 'POST', url: `/api/bons-commande/${cas.integreAvecCertificat.id}/payable`,
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    assert.equal(corps.statut, 'payable');
    assert.match(corps.certificat_prise_en_charge, new RegExp(MARQUE));

    // Et l'action est journalisée, comme toute action sensible.
    await enPrivilegie(async (bd) => {
      const trace = await bd.un(
        `select action, apres from journal
          where action = 'paiement_possible' and objet_id = $1 order by horodatage desc limit 1`,
        [String(cas.integreAvecCertificat.id)],
      );
      assert.ok(trace, "le passage en payable doit laisser une trace au journal");
      assert.equal(trace.apres.statut, 'payable');
    });
  });

  it('RG-011 tient toujours : pas de paiement sans certificat', async () => {
    const reponse = await appel(comptablePublic, {
      method: 'POST', url: `/api/bons-commande/${cas.integreSansCertificat.id}/payable`,
    });
    assert.equal(reponse.statusCode, 422);
    assert.equal(reponse.json().erreur.code, 'RG-011');
  });

  it("RG-017 — il ne marque pas payable un bon d'un établissement autonome", async () => {
    const reponse = await appel(comptablePublic, {
      method: 'POST', url: `/api/bons-commande/${cas.autonome.id}/payable`,
    });
    assert.equal(reponse.statusCode, 403, reponse.body);
    assert.equal(reponse.json().erreur.code, 'RG-017');
    await enPrivilegie(async (bd) => {
      const bon = await bd.un('select statut from bon_commande where id = $1', [cas.autonome.id]);
      assert.equal(bon.statut, 'receptionne', "le bon de l'ARMP n'a pas bougé");
    });
  });

  it("RG-018 — la portée élargie n'ouvre aucune écriture chez un autonome", async () => {
    // Un bien de l'ARMP, par la route des biens : le comptable public porte une
    // portée de lecture transversale, pas un droit d'écriture sur un
    // établissement qui tient sa propre comptabilité des matières.
    const reponse = await appel(comptablePublic, {
      method: 'POST',
      url: '/api/biens',
      payload: {
        categorie_code: 'MOB-BUR', designation: `${MARQUE} bien refusé`,
        classement: 'immobilisation', mode_entree: 'achat',
        valeur_acquisition: 100000, date_acquisition: '2026-01-10',
        etat: 'bon', structure_id: armp.id, suivi: 'lot', quantite: 1,
      },
    });
    assert.equal(reponse.statusCode, 403, reponse.body);
    assert.ok(['RG-018', 'non_autorise'].includes(reponse.json().erreur.code), reponse.body);
    await enPrivilegie(async (bd) => {
      const pose = await bd.un('select id from bien where designation like $1', [`${MARQUE}%`]);
      assert.equal(pose, null, "rien n'a été écrit chez l'ARMP");
    });
  });
});

describe("Le détail d'un dossier d'achat porte ses lignes", () => {
  it("les lignes « achat » de l'état de besoin sont rendues, avec la quantité commandée", async () => {
    const reponse = await appel(comptablePublic, {
      method: 'GET', url: `/api/dossiers-achat/${cas.integreAvecCertificat.dossier.id}`,
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    assert.equal(corps.nombre_lignes, 1, "l'écran n'a plus à remonter à etat_besoin_id");
    assert.equal(corps.quantite_commandee_totale, 10);
    const ligne = corps.lignes[0];
    assert.equal(ligne.origine, 'achat');
    assert.equal(ligne.quantite_demandee, 12);
    assert.equal(ligne.quantite_accordee, 10);
    // La quantité commandée est la quantité **accordée** : c'est elle qui a été
    // engagée, et c'est à elle que l'écran des réceptions compare le livré.
    assert.equal(ligne.quantite_commandee, 10);
    assert.ok(ligne.categorie_libelle, 'la catégorie est libellée, pas seulement codée');
  });
});

// --- Le périmètre des dossiers d'achat -----------------------------------
//
// LE DÉFAUT CONSTATÉ, À L'ÉCRAN. La liste des dossiers n'avait **aucun** filtre
// de périmètre : `where true`, plus le statut et la procédure. Comme
// `dossier_achat` n'est pas cloisonnée par la base, tout agent voyait les
// dossiers de toutes les structures, établissements autonomes compris — alors
// que l'écran affiche « N dossier(s) dans votre périmètre ».
//
// Le symptôme visible était ailleurs et semblait anodin : chaque ligne annonçait
// « Sans état de besoin rattaché » tout en nommant l'état de besoin dans son
// objet. L'interface ne mentait pas — `etat_besoin` **est** cloisonnée, donc
// pour un dossier hors portée la base masquait le besoin et la jointure rendait
// `null`. Une contradiction à l'écran était la trace d'une fuite de périmètre.

/** Les numéros de dossiers que cet agent voit, sur la liste complète. */
async function dossiersVus(agent) {
  const reponse = await appel(agent, { method: 'GET', url: '/api/dossiers-achat?parPage=200' });
  assert.equal(reponse.statusCode, 200, reponse.body);
  return reponse.json().donnees.map((d) => d.numero);
}

describe("Le périmètre des dossiers d'achat", () => {
  it("un chef de structure ne voit pas les dossiers d'une autre structure", async () => {
    const vus = await dossiersVus(chefSgg);
    assert.ok(
      !vus.includes(cas.integreAvecCertificat.dossier.numero),
      "le chef du SGG ne doit pas voir le dossier de la Delivery Unit",
    );
    assert.ok(
      !vus.includes(cas.autonome.dossier.numero),
      "il ne doit surtout pas voir le dossier d'un établissement autonome",
    );
  });

  it("il n'ouvre pas davantage un dossier hors de son périmètre par son identifiant", async () => {
    const reponse = await appel(chefSgg, {
      method: 'GET', url: `/api/dossiers-achat/${cas.autonome.dossier.id}`,
    });
    assert.ok(
      [403, 404].includes(reponse.statusCode),
      `l'accès direct doit être refusé, reçu ${reponse.statusCode} : ${reponse.body}`,
    );
  });

  it("le comptable public voit le périmètre intégré, jamais un établissement autonome", async () => {
    const vus = await dossiersVus(comptablePublic);
    assert.ok(
      vus.includes(cas.integreAvecCertificat.dossier.numero),
      'sa portée est transversale sur les structures intégrées',
    );
    assert.ok(
      !vus.includes(cas.autonome.dossier.numero),
      "elle s'arrête à la frontière juridique d'un établissement autonome",
    );
  });

  it("la liste rend l'état de besoin qui a motivé le dossier, et sa structure", async () => {
    const reponse = await appel(comptablePublic, {
      method: 'GET', url: '/api/dossiers-achat?parPage=200',
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const vu = reponse.json().donnees
      .find((d) => d.numero === cas.integreAvecCertificat.dossier.numero);
    assert.ok(vu, 'le dossier doit être dans la liste');
    assert.equal(
      vu.etat_besoin_numero, cas.integreAvecCertificat.besoin.numero,
      "l'écran ne doit plus annoncer « Sans état de besoin rattaché » pour un dossier qui en a un",
    );
    assert.ok(vu.structure_code, 'la structure concernée doit être nommée');
  });
});
