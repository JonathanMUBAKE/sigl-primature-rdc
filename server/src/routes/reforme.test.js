// reforme.test.js — Le circuit de réforme et l'offre de réemploi, éprouvés à
// travers leurs routes.
//
// CE QUE CE FICHIER PROUVE, ET DANS QUEL ORDRE.
//
//   1. RG-033 : le raccourci est fermé. `POST /api/biens/:id/mouvements` refuse
//      le type `reforme`, nomme la route du circuit, et **n'écrit rien**.
//   2. Le circuit mené de bout en bout jusqu'à la saisine, puis
//      l'enregistrement de la décision des domaines. Chaque étape passe par la
//      route, pas par la base : c'est l'enchaînement qu'on vérifie.
//   3. Le circuit mené jusqu'au **réemploi**, avec contrôle en base que le bien
//      a changé de structure, que le mouvement `reemploi` est inscrit, que
//      l'acte de transfert existe et que le dossier est `reemploye` sans être
//      `saisi`.
//   4. **Une offre d'une structure est lisible par une autre structure**, par la
//      route et en base sous le rôle non privilégié. C'est l'objet économique
//      du lot : sans cet essai, rien ne protège l'étape 3 d'une régression de
//      cloisonnement.
//   5. Une demande déposée par un établissement autonome est refusée, et le
//      refus dit pourquoi : ce serait une cession (RG-016, RG-018).
//   6. Chacune des règles RG-028 à RG-033 refusée **par la route**, avec son
//      code, et pas seulement par la fonction pure.
//   7. RG-018 tient : rien de ce lot ne permet au niveau central d'écrire chez
//      l'ARMP.
//   8. La décision des domaines peut **refuser** la réforme — et le bien revient
//      alors au service, sans que personne n'ait touché au registre.
//
// Les biens d'essai sont créés pour l'occasion sur un site d'essai de la CGIG :
// un dossier de réforme est un objet unique par bien, et emprunter un bien du
// jeu de démonstration aurait fait dépendre l'essai de ce que le seed a tiré au
// hasard.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { CLE_PRIVILEGE, SESAME_PRIVILEGE, enPrivilegie, fermer, transaction } from '../db.js';
import { construireApp } from '../app.js';
import { arreterEcoute } from './_flux.js';
import {
  decisionPossible, etapesDuDossier, offrePossible, saisinePossible,
} from './reforme.js';
import { ancetreCommunIntegre, demandePossible } from './reemploi.js';

process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

const MARQUE = 'ESSAI-REFORME';

let serveur;
let cgig;              // CGIG — structure intégrée, fille du SGP
let sgg;               // SGG — structure intégrée, sœur du SGP sous le Cabinet
let caid;              // CAID — structure intégrée, fille du SGP
let armp;              // ARMP — établissement public autonome
let magasinier;        // magasinier de la CGIG : il propose
let comptable;         // comptable des matières de la CGIG : elle convoque
let chefCgig;          // chef de la CGIG : membre de la commission
let intendante;        // intendante générale au SGP : troisième membre
let logistique;        // logistique centrale : offre, clôt, saisit, décide
let chefSgg;           // chef du SGG : il lit l'offre et la demande
let chefCaid;          // chef de la CAID : seconde demandeuse
let chefArmp;          // ARMP : le refus de régime
let controleExterne;   // contrôle externe : ne siège pas
let site;              // le site d'essai
const biens = {};      // les biens d'essai
const dossiers = {};   // les dossiers, par clé
const offres = {};     // les offres, par clé
const demandes = {};   // les demandes, par clé

const appel = (agent, options) => serveur.inject({
  ...options,
  headers: { ...(options.headers ?? {}), 'x-agent-id': agent.id },
});

const etape = (corps, numero) => corps.etapes.find((e) => e.numero === numero);

/** Un bien d'essai sur le site d'essai, posé par le chemin privilégié. */
async function poserBien(bd, { cle, immatriculation, etat = 'hors_service' }) {
  const categorie = await bd.un(
    "select code from categorie where parent_code is not null and classement = 'immobilisation' order by code limit 1",
  );
  const ligne = await bd.un(
    `insert into bien (immatriculation, categorie_code, designation, classement,
        objectif_detention, mode_entree, valeur_acquisition, date_acquisition, etat,
        structure_id, site_id, suivi, quantite)
     values ($1, $2, $3, 'immobilisation', 'operationnelle', 'achat', 4350000,
             '2019-03-12', $4, $5, $6, 'individuel', 1)
     returning id, immatriculation, designation, etat, quantite, structure_id, site_id`,
    [immatriculation, categorie.code, `${MARQUE} ${cle}`, etat, cgig.id, site.id],
  );
  biens[cle] = ligne;
  return ligne;
}

before(async () => {
  await enPrivilegie(async (bd) => {
    cgig = await bd.un("select id, code, nom, regime from structure where code = 'CGIG'");
    sgg = await bd.un("select id, code, nom, regime from structure where code = 'SGG'");
    caid = await bd.un("select id, code, nom, regime from structure where code = 'CAID'");
    armp = await bd.un("select id, code, nom, regime from structure where code = 'ARMP'");
    assert.equal(cgig.regime, 'integre');
    assert.equal(sgg.regime, 'integre');
    assert.equal(armp.regime, 'autonome', "l'ARMP est un établissement public autonome");
    // La CGIG et le SGG sont deux branches distinctes : c'est précisément ce
    // qui rend le transfert de réemploi intéressant à éprouver, puisque aucune
    // des deux n'est dans la portée d'écriture de l'autre.
    const parents = await bd.un(
      `select (select parent_id from structure where code = 'CGIG') as cgig,
              (select parent_id from structure where code = 'SGG') as sgg`,
    );
    assert.notEqual(String(parents.cgig), String(parents.sgg));

    const parRole = (role, structureId) => bd.un(
      `select a.id, a.nom, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
        where ar.role_code = $1 and a.structure_id = $2 and a.actif
        order by a.nom limit 1`,
      [role, structureId],
    );
    const parRoleOuQue = (role) => bd.un(
      `select a.id, a.nom, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
        where ar.role_code = $1 and a.actif order by a.nom limit 1`,
      [role],
    );
    magasinier = await parRole('magasinier', cgig.id);
    comptable = await parRole('comptable_matieres', cgig.id);
    chefCgig = await parRole('chef_structure', cgig.id);
    chefSgg = await parRole('chef_structure', sgg.id);
    chefCaid = await parRole('chef_structure', caid.id);
    chefArmp = await parRole('chef_structure', armp.id);
    logistique = await parRoleOuQue('logistique');
    intendante = await parRoleOuQue('intendant');
    controleExterne = await parRoleOuQue('controle_externe');
    assert.ok(
      magasinier && comptable && chefCgig && chefSgg && chefCaid && chefArmp
      && logistique && intendante && controleExterne,
      'le jeu de démonstration doit être chargé',
    );

    site = await bd.un(
      `insert into site (structure_id, nom, adresse, ville)
       values ($1, $2, 'Adresse d''essai', 'Kinshasa') returning id, nom`,
      [cgig.id, `${MARQUE} dépôt d'essai`],
    );

    await poserBien(bd, { cle: 'saisine', immatriculation: `${MARQUE}-SAISI` });
    await poserBien(bd, { cle: 'reemploi', immatriculation: `${MARQUE}-REEMP` });
    await poserBien(bd, { cle: 'refus', immatriculation: `${MARQUE}-REFUS` });
    await poserBien(bd, { cle: 'raccourci', immatriculation: `${MARQUE}-RACC`, etat: 'a_reparer' });
  });

  serveur = await construireApp({ servirWeb: false });
  await serveur.ready();
});

after(async () => {
  arreterEcoute();
  if (serveur) await serveur.close();
  await enPrivilegie(async (bd) => {
    // Les dossiers d'abord : ils emportent leur commission, leurs avis, leurs
    // offres et les demandes qui s'y rattachent. Et il **faut** cet ordre :
    // `pv_document_id` est en `on delete restrict`, parce qu'un dossier saisi
    // doit porter son procès-verbal. Supprimer la pièce la première serait
    // refusé, et c'est tant mieux.
    const vises = await bd.tous(
      `select d.id from dossier_reforme d
        where d.bien_id in (select id from bien where designation like $1)`,
      [`${MARQUE}%`],
    );
    await bd.requete(
      'delete from dossier_reforme where bien_id in (select id from bien where designation like $1)',
      [`${MARQUE}%`],
    );
    if (vises.length > 0) {
      await bd.requete(
        "delete from document where objet_type = 'dossier_reforme' and objet_id = any($1)",
        [vises.map((d) => String(d.id))],
      );
    }
    await bd.requete(
      "delete from document where objet_type = 'bien' and objet_id in (select id::text from bien where designation like $1)",
      [`${MARQUE}%`],
    );
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);
    await bd.requete('delete from site where nom like $1', [`${MARQUE}%`]);
  });
  await fermer();
});

/** Les trois membres de la commission d'essai, hors le proposant. */
const MEMBRES = () => [
  { agent: comptable, qualite: 'president' },
  { agent: chefCgig, qualite: 'rapporteur' },
  { agent: intendante, qualite: 'membre' },
];

/** Désigne la commission et recueille ses avis, par les routes. */
async function reunirCommission(dossierId, sens = ['favorable', 'favorable', 'favorable']) {
  const membres = MEMBRES();
  for (const { agent, qualite } of membres) {
    const reponse = await appel(comptable, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossierId}/commission`,
      payload: { agent_id: agent.id, qualite },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
  }
  for (const [index, { agent }] of membres.entries()) {
    const reponse = await appel(agent, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossierId}/avis`,
      payload: {
        avis: sens[index],
        motif: `Avis motivé n°${index + 1} : matériel examiné au dépôt d'essai.`,
      },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
  }
}

/** Propose la réforme d'un bien d'essai, et rend le dossier. */
async function proposer(bienCle, motif) {
  const reponse = await appel(magasinier, {
    method: 'POST',
    url: '/api/dossiers-reforme',
    payload: { bien_id: biens[bienCle].id, motif },
  });
  assert.equal(reponse.statusCode, 201, reponse.body);
  return reponse.json();
}

// ---------------------------------------------------------------------------
describe('RG-033 — le raccourci de la réforme est fermé', () => {
  it('un mouvement direct de type « reforme » est refusé, et la route du circuit est nommée', async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: `/api/biens/${biens.raccourci.id}/mouvements`,
      payload: { type: 'reforme', motif: 'Matériel hors service, réforme demandée.' },
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    const { erreur } = reponse.json();
    assert.equal(erreur.code, 'RG-033');
    assert.equal(erreur.champ, 'type');
    assert.match(erreur.message, /POST \/api\/dossiers-reforme/);
  });

  it('et rien n’est écrit : ni mouvement, ni procès-verbal, ni changement d’état', async () => {
    await enPrivilegie(async (bd) => {
      const bien = await bd.un('select etat, reforme_le from bien where id = $1', [biens.raccourci.id]);
      assert.equal(bien.etat, 'a_reparer', "la fiche n'a pas bougé");
      assert.equal(bien.reforme_le, null);
      const mouvement = await bd.un(
        "select id from mouvement where bien_id = $1 and type = 'reforme'", [biens.raccourci.id],
      );
      assert.equal(mouvement, null, 'aucun mouvement de réforme inscrit');
      const pv = await bd.un(
        "select id from document where objet_type = 'bien' and objet_id = $1 and type = 'pv_reforme'",
        [String(biens.raccourci.id)],
      );
      assert.equal(pv, null, 'aucun procès-verbal émis par le raccourci');
    });
  });

  it('les autres mouvements passent toujours : la route n’est pas condamnée', async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: `/api/biens/${biens.raccourci.id}/mouvements`,
      payload: { type: 'maintenance', motif: 'Envoi à l’atelier pour diagnostic.' },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    assert.equal(reponse.json().bien.etat, 'en_maintenance');
  });
});

// ---------------------------------------------------------------------------
describe('Le circuit mené jusqu’à la saisine, puis à la décision', () => {
  it('la proposition ouvre un dossier « propose », numéroté par le serveur', async () => {
    const corps = await proposer(
      'saisine',
      'Châssis déformé après accident ; expertise défavorable à la remise en circulation.',
    );
    dossiers.saisine = corps.dossier;
    assert.equal(corps.dossier.statut, 'propose');
    assert.match(corps.dossier.numero, /^DR-\d{4}-\d{5}$/, 'la série DR est générée par le serveur');
    assert.equal(String(corps.dossier.propose_par), String(magasinier.id));
    assert.equal(corps.bien.immatriculation, `${MARQUE}-SAISI`);
    // Le serveur dit l'avancement : l'étape 1 est faite, la 2 est courante.
    assert.equal(etape(corps, 1).etat, 'faite');
    assert.equal(etape(corps, 1).par_nom, magasinier.nom);
    assert.equal(etape(corps, 2).etat, 'courante');
    assert.equal(etape(corps, 3).etat, 'a_venir');
    assert.equal(corps.etapes.length, 7, 'les sept étapes du lot, toujours les sept');
    assert.deepEqual(corps.etapes.map((e) => e.numero), [1, 2, 3, 4, 5, 6, 7]);
    // Et il dit d'avance ce qu'il refuserait.
    assert.equal(corps.offre_possible.possible, false);
    assert.match(corps.offre_possible.motif, /n'a pas encore rendu son avis/);
    assert.equal(corps.saisine_possible.possible, false);
    assert.equal(corps.decision_possible.possible, false);
  });

  it('un second dossier sur le même bien est refusé, et le premier est nommé', async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: '/api/dossiers-reforme',
      payload: { bien_id: biens.saisine.id, motif: 'Seconde proposition sur le même bien.' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.equal(reponse.json().erreur.champ, 'bien_id');
    assert.match(reponse.json().erreur.message, new RegExp(dossiers.saisine.numero));
  });

  it('RG-030 — le proposant ne siège pas à la commission', async () => {
    const reponse = await appel(comptable, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossiers.saisine.id}/commission`,
      payload: { agent_id: magasinier.id, qualite: 'membre' },
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    assert.equal(reponse.json().erreur.code, 'RG-030');
    assert.equal(reponse.json().erreur.champ, 'agent_id');
  });

  it('le contrôle externe ne siège pas davantage : il contrôle la délibération', async () => {
    const reponse = await appel(comptable, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossiers.saisine.id}/commission`,
      payload: { agent_id: controleExterne.id, qualite: 'membre' },
    });
    assert.equal(reponse.statusCode, 403, reponse.body);
    assert.equal(reponse.json().erreur.code, 'non_autorise');
  });

  it('la commission est désignée, et le serveur dit ce qui lui manque', async () => {
    for (const { agent, qualite } of MEMBRES()) {
      const reponse = await appel(comptable, {
        method: 'POST',
        url: `/api/dossiers-reforme/${dossiers.saisine.id}/commission`,
        payload: { agent_id: agent.id, qualite },
      });
      assert.equal(reponse.statusCode, 201, reponse.body);
    }
    const detail = await appel(comptable, {
      method: 'GET', url: `/api/dossiers-reforme/${dossiers.saisine.id}`,
    });
    const corps = detail.json();
    assert.equal(corps.commission.length, 3);
    // L'intendante est au SGP, pas à la CGIG : elle doit quand même être
    // **nommée**. C'est `sigl_identite_agent` qui le permet — une jointure vers
    // `agent`, cloisonné, l'aurait effacée ou laissée sans nom.
    const horsStructure = corps.commission.find((m) => String(m.agent_id) === String(intendante.id));
    assert.ok(horsStructure, "le membre d'une autre structure figure à la commission");
    assert.equal(horsStructure.nom, intendante.nom);
    assert.ok(horsStructure.fonction, 'et il est nommé, pas seulement codé');
    assert.equal(corps.commission_etat.membres, 3);
    assert.equal(corps.commission_etat.membres_minimum, 3, 'le minimum vient du paramètre');
    assert.equal(corps.commission_etat.conclu, false);
    assert.match(corps.commission_etat.manque, /3 avis/);
  });

  it('un même agent ne siège pas deux fois', async () => {
    const reponse = await appel(comptable, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossiers.saisine.id}/commission`,
      payload: { agent_id: chefCgig.id, qualite: 'membre' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.match(reponse.json().erreur.message, /siège déjà/);
  });

  it('RG-031 — un avis sans motif est refusé, favorable compris', async () => {
    const reponse = await appel(comptable, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossiers.saisine.id}/avis`,
      payload: { avis: 'favorable', motif: '   ' },
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    assert.equal(reponse.json().erreur.code, 'RG-031');
    assert.equal(reponse.json().erreur.champ, 'motif');
    await enPrivilegie(async (bd) => {
      const compte = await bd.un(
        'select count(*)::int as n from avis_commission where dossier_id = $1',
        [dossiers.saisine.id],
      );
      assert.equal(compte.n, 0, 'et rien n’a été inscrit');
    });
  });

  it('un agent qui ne siège pas ne rend pas d’avis', async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossiers.saisine.id}/avis`,
      payload: { avis: 'favorable', motif: 'Avis de celui qui a proposé la réforme.' },
    });
    assert.equal(reponse.statusCode, 403, reponse.body);
  });

  it('RG-028 — la saisine est refusée avant toute offre de réemploi', async () => {
    const reponse = await appel(logistique, {
      method: 'POST', url: `/api/dossiers-reforme/${dossiers.saisine.id}/saisir`, payload: {},
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    assert.equal(reponse.json().erreur.code, 'RG-028');
    assert.match(reponse.json().erreur.message, /autres structures/);
  });

  it('trois avis favorables font passer le dossier à « examine »', async () => {
    for (const [index, { agent }] of MEMBRES().entries()) {
      const reponse = await appel(agent, {
        method: 'POST',
        url: `/api/dossiers-reforme/${dossiers.saisine.id}/avis`,
        payload: {
          avis: 'favorable',
          motif: `Avis motivé n°${index + 1} : châssis déformé, remise en circulation dangereuse.`,
        },
      });
      assert.equal(reponse.statusCode, 201, reponse.body);
    }
    const detail = await appel(comptable, {
      method: 'GET', url: `/api/dossiers-reforme/${dossiers.saisine.id}`,
    });
    const corps = detail.json();
    assert.equal(corps.dossier.statut, 'examine');
    assert.ok(corps.dossier.avis_rendu_le);
    assert.equal(corps.commission_etat.majorite, 'favorable');
    assert.equal(corps.commission_etat.conclu, true);
    assert.equal(corps.commission_etat.manque, null);
    assert.equal(etape(corps, 2).etat, 'faite');
    assert.equal(etape(corps, 3).etat, 'courante');
    assert.equal(corps.offre_possible.possible, true, "l'offre est maintenant permise");
    assert.equal(corps.offre_possible.motif, null);
  });

  it('un membre ne se prononce pas deux fois', async () => {
    const reponse = await appel(comptable, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossiers.saisine.id}/avis`,
      payload: { avis: 'defavorable', motif: 'Second avis du même membre.' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.match(reponse.json().erreur.message, /déjà conclu|déjà rendu/);
  });

  it('l’offre est ouverte, et sa durée vient du paramètre', async () => {
    const reponse = await appel(logistique, {
      method: 'POST', url: `/api/dossiers-reforme/${dossiers.saisine.id}/offrir`, payload: {},
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    offres.saisine = corps.offre;
    assert.equal(corps.dossier.statut, 'offert');
    assert.match(corps.offre.numero, /^OR-\d{4}-\d{5}$/);
    assert.equal(corps.offre.statut, 'ouverte');
    assert.equal(corps.offre.duree_jours, 30, 'trente jours, valeur du paramètre du lot');
    // La copie publiée est résolue à l'ouverture : l'offre ne joint pas `bien`.
    assert.equal(corps.offre.bien_immatriculation, `${MARQUE}-SAISI`);
    assert.equal(corps.offre.structure_origine_code, 'CGIG');
    assert.equal(corps.offre.site_origine_nom, site.nom);
    assert.equal(etape(corps, 3).etat, 'faite');
    assert.equal(etape(corps, 4).etat, 'courante');
    assert.equal(etape(corps, 6).etat, 'a_venir');
  });

  it('RG-029 — la saisine est refusée tant que l’offre court, et le terme est nommé', async () => {
    const detail = await appel(logistique, {
      method: 'GET', url: `/api/dossiers-reforme/${dossiers.saisine.id}`,
    });
    assert.equal(detail.json().saisine_possible.possible, false);
    assert.equal(detail.json().saisine_possible.code, 'RG-029');

    const reponse = await appel(logistique, {
      method: 'POST', url: `/api/dossiers-reforme/${dossiers.saisine.id}/saisir`, payload: {},
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    assert.equal(reponse.json().erreur.code, 'RG-029');
    assert.match(reponse.json().erreur.message, new RegExp(offres.saisine.numero));
  });

  it('RG-029 — et un second dossier ne s’ouvre pas sur un bien sous offre', async () => {
    // Le premier dossier est encore ouvert, donc c'est lui qui est nommé : les
    // deux contrôles se recouvrent, et c'est voulu. L'essai vérifie qu'aucune
    // porte ne reste.
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: '/api/dossiers-reforme',
      payload: { bien_id: biens.saisine.id, motif: 'Troisième tentative sur le même bien.' },
    });
    assert.ok([400, 422].includes(reponse.statusCode), reponse.body);
  });

  it('une demande est déposée, puis l’offre est close sans la trancher', async () => {
    // Clore, c'est arrêter de recevoir, pas répondre : la demande du SGG
    // **reste pendante**. C'est l'état que RG-028 refuse à la saisine.
    const depot = await appel(chefSgg, {
      method: 'POST',
      url: `/api/offres-reemploi/${offres.saisine.id}/demandes`,
      payload: { motif: 'Notre aile pourrait utiliser ce châssis comme pièces de rechange.' },
    });
    assert.equal(depot.statusCode, 201, depot.body);
    demandes.pendante = depot.json().demande;

    const cloture = await appel(logistique, {
      method: 'POST', url: `/api/offres-reemploi/${offres.saisine.id}/clore`, payload: {},
    });
    assert.equal(cloture.statusCode, 200, cloture.body);
    assert.equal(cloture.json().offre.statut, 'close');
    assert.ok(cloture.json().offre.close_le);
    assert.equal(
      cloture.json().demandes.find((d) => String(d.id) === String(demandes.pendante.id)).statut,
      'deposee',
      'clore une offre ne tranche aucune demande',
    );
  });

  it('RG-028 — la saisine est refusée tant qu’une demande attend une réponse', async () => {
    // Décision du chef de projet du 27 novembre 2026. Une offre close sur une
    // demande sans réponse ne prouve pas que le réemploi a été cherché : on
    // réformerait ce qu'une autre structure voulait reprendre, et on la
    // laisserait sans réponse pour toujours.
    const detail = await appel(logistique, {
      method: 'GET', url: `/api/dossiers-reforme/${dossiers.saisine.id}`,
    });
    const avance = detail.json();
    assert.equal(avance.saisine_possible.possible, false);
    assert.equal(
      avance.saisine_possible.code, 'RG-028',
      "le serveur dit d'avance que c'est RG-028 qui bloquerait",
    );
    assert.match(avance.saisine_possible.motif, new RegExp(sgg.nom));

    const reponse = await appel(logistique, {
      method: 'POST', url: `/api/dossiers-reforme/${dossiers.saisine.id}/saisir`, payload: {},
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    const { erreur } = reponse.json();
    assert.equal(erreur.code, 'RG-028');
    assert.equal(erreur.champ, 'demandes');
    // Le refus nomme la structure qui attend, et ce qu'il faut faire.
    assert.match(erreur.message, new RegExp(sgg.nom));
    assert.match(erreur.message, /[Tt]ranchez/);

    // Et rien n'a bougé : ni le dossier, ni le procès-verbal.
    await enPrivilegie(async (bd) => {
      const dossier = await bd.un(
        'select statut, saisi_le, pv_document_id from dossier_reforme where id = $1',
        [dossiers.saisine.id],
      );
      assert.equal(dossier.statut, 'offert');
      assert.equal(dossier.saisi_le, null);
      assert.equal(dossier.pv_document_id, null, 'aucun procès-verbal n’a été émis');
    });
  });

  it('la demande écartée, et motivée, ouvre la saisine', async () => {
    const reponse = await appel(logistique, {
      method: 'POST',
      url: `/api/demandes-reemploi/${demandes.pendante.id}/trancher`,
      payload: {
        decision: 'ecarte',
        motif: 'Le châssis est déformé : il ne servira pas davantage au SGG qu’ici.',
      },
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    assert.equal(reponse.json().demande.statut, 'ecartee');
    assert.match(reponse.json().demande.motif_decision, /châssis/);

    const detail = await appel(logistique, {
      method: 'GET', url: `/api/dossiers-reforme/${dossiers.saisine.id}`,
    });
    assert.equal(
      detail.json().saisine_possible.possible, true,
      'la demande tranchée, plus rien ne retient la saisine',
    );
    assert.equal(detail.json().saisine_possible.motif, null);
  });

  it('la saisine émet le procès-verbal de réforme, figé', async () => {
    const reponse = await appel(logistique, {
      method: 'POST', url: `/api/dossiers-reforme/${dossiers.saisine.id}/saisir`, payload: {},
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    assert.equal(corps.dossier.statut, 'saisi');
    assert.ok(corps.dossier.saisi_le);
    assert.equal(corps.document.type, 'pv_reforme');
    assert.equal(corps.document.fige, true);
    assert.match(corps.document.numero, /^PVR-\d{4}-\d{5}$/);
    assert.match(
      corps.document.contenu.mention,
      /relèvent de l'administration en charge des domaines/,
    );
    assert.equal(corps.document.contenu.offre_reemploi.numero, offres.saisine.numero);
    assert.equal(etape(corps, 6).etat, 'faite');
    assert.equal(etape(corps, 7).etat, 'courante');
    assert.equal(corps.decision_possible.possible, true);

    // Le bien n'est **pas** réformé : il est sous procès-verbal et en attente.
    // C'est la décision des domaines qui le sortira du service.
    await enPrivilegie(async (bd) => {
      const bien = await bd.un('select etat, reforme_le from bien where id = $1', [biens.saisine.id]);
      assert.equal(bien.etat, 'hors_service', 'la saisine ne réforme pas : elle saisit');
      assert.equal(bien.reforme_le, null);
      const dossier = await bd.un(
        'select pv_document_id from dossier_reforme where id = $1', [dossiers.saisine.id],
      );
      assert.ok(dossier.pv_document_id, 'le dossier garde le lien vers son procès-verbal');
    });
  });

  it('RG-029 — une demande pendante ne s’accepte plus derrière le dos du PV', async () => {
    // Depuis que RG-028 refuse la saisine sur une demande pendante, **les
    // routes ne mènent plus à cet état** : il faut l'avoir posé en base pour
    // l'éprouver. C'est tant mieux, et c'est pour cela que l'essai reste — une
    // ceinture par-dessus les bretelles. Si RG-028 était un jour assouplie, ou
    // si une demande arrivait au moment même de la saisine, c'est RG-029 qui
    // empêcherait le registre de contredire le procès-verbal.
    const posee = await enPrivilegie((bd) => bd.un(
      `insert into demande_reemploi (offre_id, structure_id, structure_demandeuse_id,
           demande_par, motif, statut)
       values ($1, $2, $3, $4, $5, 'deposee') returning id`,
      [
        offres.saisine.id, cgig.id, caid.id, chefCaid.id,
        'Demande arrivée après la clôture, posée en base pour éprouver RG-029.',
      ],
    ));

    const reponse = await appel(logistique, {
      method: 'POST',
      url: `/api/demandes-reemploi/${posee.id}/trancher`,
      payload: { decision: 'accepte', motif: 'Attribution tardive à la CAID.' },
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    assert.equal(reponse.json().erreur.code, 'RG-029');
    assert.match(reponse.json().erreur.message, /procès-verbal/);

    await enPrivilegie(async (bd) => {
      const demande = await bd.un(
        'select statut, tranchee_le from demande_reemploi where id = $1', [posee.id],
      );
      assert.equal(demande.statut, 'deposee', 'la demande n’a pas bougé');
      assert.equal(demande.tranchee_le, null);
      const bien = await bd.un('select structure_id from bien where id = $1', [biens.saisine.id]);
      assert.equal(String(bien.structure_id), String(cgig.id), 'et le bien non plus');
    });

    // Écarter, en revanche, reste permis — et c'est la réponse que la structure
    // attendait. RG-029 interdit de réemployer, pas de répondre.
    const ecart = await appel(logistique, {
      method: 'POST',
      url: `/api/demandes-reemploi/${posee.id}/trancher`,
      payload: { decision: 'ecarte', motif: 'Le bien est sous procès-verbal et les domaines sont saisis.' },
    });
    assert.equal(ecart.statusCode, 200, ecart.body);
    assert.equal(ecart.json().demande.statut, 'ecartee');
    assert.match(ecart.json().demande.motif_decision, /procès-verbal/);
  });

  it('RG-032 — une décision sans autorité nommée est refusée', async () => {
    const reponse = await appel(logistique, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossiers.saisine.id}/decision`,
      payload: { reference: 'DDPPE/2026/0147', date_acte: '2026-11-10', suite: 'rebut' },
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    assert.equal(reponse.json().erreur.code, 'RG-032');
    assert.equal(reponse.json().erreur.champ, 'autorite');
    assert.match(reponse.json().erreur.message, /il ne la prend pas/);
  });

  it('RG-032 — ni une suite inventée', async () => {
    const reponse = await appel(logistique, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossiers.saisine.id}/decision`,
      payload: {
        autorite: "Direction des domaines privés et publics de l'État",
        reference: 'DDPPE/2026/0147',
        date_acte: '2026-11-10',
        suite: 'destruction_immediate',
      },
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    assert.equal(reponse.json().erreur.code, 'RG-032');
    assert.equal(reponse.json().erreur.champ, 'suite');
  });

  it('la décision enregistrée clôt le dossier et sort le bien du service', async () => {
    const reponse = await appel(logistique, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossiers.saisine.id}/decision`,
      payload: {
        autorite: "Direction des domaines privés et publics de l'État",
        reference: 'DDPPE/2026/0147',
        date_acte: '2026-11-10',
        suite: 'rebut',
      },
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    assert.equal(corps.dossier.statut, 'clos');
    assert.equal(corps.decision.suite, 'rebut');
    assert.equal(corps.decision.reference, 'DDPPE/2026/0147');
    assert.match(corps.decision.autorite, /domaines/);
    assert.equal(corps.mouvement.type, 'reforme');
    // L'étape 7 nomme **l'autorité**, et non un agent du SIGL : c'est tout le
    // sens de RG-016.
    assert.equal(etape(corps, 7).etat, 'faite');
    assert.match(etape(corps, 7).par_nom, /domaines/);

    await enPrivilegie(async (bd) => {
      // `reforme_le` est une `date` : on la lit en texte, parce qu'un `Date` de
      // JavaScript la ramènerait à minuit local puis la décalerait d'un jour en
      // UTC. L'essai doit mesurer la base, pas le fuseau de la machine.
      const bien = await bd.un(
        `select id, etat, to_char(reforme_le, 'YYYY-MM-DD') as reforme_le
           from bien where id = $1`,
        [biens.saisine.id],
      );
      assert.ok(bien, 'RG-015 : un bien ne disparaît jamais du registre');
      assert.equal(bien.etat, 'reforme');
      assert.equal(
        bien.reforme_le, '2026-11-10',
        "la date du registre est celle de l'acte, pas celle du jour",
      );
      const mouvement = await bd.un(
        "select type, motif, document_id from mouvement where bien_id = $1 and type = 'reforme'",
        [biens.saisine.id],
      );
      assert.ok(mouvement, 'le registre porte le mouvement de réforme');
      assert.match(mouvement.motif, /DDPPE\/2026\/0147/);
      assert.ok(mouvement.document_id, 'et il renvoie au procès-verbal');

      const trace = await bd.un(
        `select action, avant, apres from journal
          where action = 'enregistrement_decision_domaines' and objet_id = $1
          order by horodatage desc limit 1`,
        [String(dossiers.saisine.id)],
      );
      assert.ok(trace, 'RG-020 : la décision est au journal');
      assert.equal(trace.avant.bien_etat, 'hors_service');
      assert.equal(trace.apres.bien_etat, 'reforme');
      assert.equal(trace.apres.decision_suite, 'rebut');
    });
  });

  it('une décision enregistrée ne se réécrit pas', async () => {
    const reponse = await appel(logistique, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossiers.saisine.id}/decision`,
      payload: {
        autorite: 'Autre autorité', reference: 'X/1', date_acte: '2026-11-12', suite: 'cession',
      },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.match(reponse.json().erreur.message, /déjà enregistrée/);
  });
});

// ---------------------------------------------------------------------------
describe('Le circuit mené jusqu’au réemploi', () => {
  it('le dossier est instruit et le bien offert, avec une durée administrée', async () => {
    const corps = await proposer(
      'reemploi',
      'Groupe électrogène remplacé par un modèle de plus forte puissance ; encore en état de marche.',
    );
    dossiers.reemploi = corps.dossier;
    await reunirCommission(dossiers.reemploi.id);

    // La durée de l'offre est **lue** dans `parametre`, pas écrite dans le
    // code : on la change, et le serveur suit. C'est ce qui prouve qu'aucune
    // constante ne s'est glissée là.
    await enPrivilegie((bd) => bd.requete(
      "update parametre set valeur = '12'::jsonb where cle = 'reemploi.duree_offre_jours'",
    ));
    const reponse = await appel(logistique, {
      method: 'POST', url: `/api/dossiers-reforme/${dossiers.reemploi.id}/offrir`, payload: {},
    });
    await enPrivilegie((bd) => bd.requete(
      "update parametre set valeur = '30'::jsonb where cle = 'reemploi.duree_offre_jours'",
    ));

    assert.equal(reponse.statusCode, 200, reponse.body);
    offres.reemploi = reponse.json().offre;
    assert.equal(offres.reemploi.duree_jours, 12, 'la durée suit le paramètre, jamais une constante');
    assert.equal(offres.reemploi.jours_restants, 12);
  });

  it('une offre d’une structure est lisible par une autre structure', async () => {
    // L'objet économique du lot. Si cet essai tombe, l'étape 3 n'existe plus.
    const liste = await appel(chefSgg, { method: 'GET', url: '/api/offres-reemploi?ouvertes=true&parPage=200' });
    assert.equal(liste.statusCode, 200, liste.body);
    const vue = liste.json().donnees.find((o) => o.numero === offres.reemploi.numero);
    assert.ok(vue, 'le chef du SGG doit voir l’offre ouverte par la CGIG');
    // Et elle n'est pas vide : la copie publiée porte son contenu, parce qu'une
    // jointure vers `bien`, cloisonné, aurait rendu `null` hors périmètre.
    assert.equal(vue.bien_immatriculation, `${MARQUE}-REEMP`);
    assert.ok(vue.bien_designation);
    assert.equal(vue.structure_origine_code, 'CGIG');
    assert.equal(vue.structure_origine_nom, cgig.nom);
    assert.equal(vue.est_la_mienne, false);
    assert.ok(vue.ouverte_par_nom, 'et celle qui l’a ouverte est nommée');

    const detail = await appel(chefSgg, {
      method: 'GET', url: `/api/offres-reemploi/${offres.reemploi.id}`,
    });
    assert.equal(detail.statusCode, 200, detail.body);
    assert.equal(detail.json().demande_possible.possible, true);
    assert.equal(detail.json().est_la_mienne, false);
  });

  it('mais le dossier de réforme, lui, reste cloisonné', async () => {
    const detail = await appel(chefSgg, {
      method: 'GET', url: `/api/dossiers-reforme/${dossiers.reemploi.id}`,
    });
    assert.ok([403, 404].includes(detail.statusCode), `reçu ${detail.statusCode} : ${detail.body}`);
    const liste = await appel(chefSgg, { method: 'GET', url: '/api/dossiers-reforme?parPage=200' });
    const numeros = liste.json().donnees.map((d) => d.numero);
    assert.ok(!numeros.includes(dossiers.reemploi.numero), 'publier l’offre n’ouvre pas le dossier');
  });

  it('RG-018 — un établissement autonome ne demande pas un réemploi, et le refus dit pourquoi', async () => {
    const reponse = await appel(chefArmp, {
      method: 'POST',
      url: `/api/offres-reemploi/${offres.reemploi.id}/demandes`,
      payload: { motif: 'Notre antenne manque de groupe de secours.' },
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    const { erreur } = reponse.json();
    assert.equal(erreur.code, 'RG-018');
    assert.equal(erreur.champ, 'structure_demandeuse_id');
    assert.match(erreur.message, /cession/, 'le refus nomme ce que ce serait réellement');
    assert.match(erreur.message, /RG-016/);

    await enPrivilegie(async (bd) => {
      const compte = await bd.un(
        'select count(*)::int as n from demande_reemploi where structure_demandeuse_id = $1',
        [armp.id],
      );
      assert.equal(compte.n, 0, "rien n'a été écrit pour l'ARMP");
    });
  });

  it('deux structures déposent leur demande, chacune motivée', async () => {
    for (const [agent, structure, motif] of [
      [chefSgg, sgg, 'Aucun secours électrique dans notre aile ; ce groupe conviendrait aux serveurs.'],
      [chefCaid, caid, 'Les coupures interrompent les traitements de données chaque semaine.'],
    ]) {
      const reponse = await appel(agent, {
        method: 'POST',
        url: `/api/offres-reemploi/${offres.reemploi.id}/demandes`,
        payload: { motif },
      });
      assert.equal(reponse.statusCode, 201, reponse.body);
      const demande = reponse.json().demande;
      assert.equal(demande.statut, 'deposee');
      assert.equal(String(demande.structure_demandeuse_id), String(structure.id));
      assert.equal(String(demande.structure_id), String(cgig.id), 'la demande porte aussi la structure de l’offre');
      demandes[structure.code] = demande;
    }
  });

  it('une structure ne demande pas deux fois', async () => {
    const reponse = await appel(chefSgg, {
      method: 'POST',
      url: `/api/offres-reemploi/${offres.reemploi.id}/demandes`,
      payload: { motif: 'Seconde demande du SGG.' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.match(reponse.json().erreur.message, /déjà déposé/);
  });

  it('chaque demandeuse ne voit que la sienne ; l’origine les voit toutes', async () => {
    const vueSgg = await appel(chefSgg, {
      method: 'GET', url: `/api/offres-reemploi/${offres.reemploi.id}`,
    });
    const idsSgg = vueSgg.json().demandes.map((d) => String(d.id));
    assert.deepEqual(idsSgg, [String(demandes.SGG.id)], 'le SGG ne lit pas la demande de la CAID');

    const vueCgig = await appel(comptable, {
      method: 'GET', url: `/api/offres-reemploi/${offres.reemploi.id}`,
    });
    const idsCgig = vueCgig.json().demandes.map((d) => String(d.id)).sort();
    assert.deepEqual(
      idsCgig, [String(demandes.SGG.id), String(demandes.CAID.id)].sort(),
      "la structure d'origine doit instruire les deux",
    );
  });

  it('accepter prononce le réemploi : un seul geste, une seule transaction', async () => {
    const reponse = await appel(logistique, {
      method: 'POST',
      url: `/api/demandes-reemploi/${demandes.SGG.id}/trancher`,
      payload: {
        decision: 'accepte',
        motif: 'Besoin établi et site dépourvu de secours électrique : le bien est attribué au SGG.',
      },
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    assert.equal(corps.demande.statut, 'acceptee');
    assert.equal(corps.offre.statut, 'close');
    assert.equal(corps.dossier.statut, 'reemploye');
    assert.ok(corps.dossier.reemploye_le);
    assert.equal(corps.mouvement.type, 'reemploi');
    assert.equal(corps.document.type, 'acte_transfert');
    assert.equal(corps.document.fige, true);
    assert.equal(corps.autres_ecartees.length, 1);
  });

  it('et la base le confirme : le bien a changé de structure, et le dossier s’est clos sans réforme', async () => {
    await enPrivilegie(async (bd) => {
      const bien = await bd.un(
        'select structure_id, site_id, detenteur_id, etat, reforme_le from bien where id = $1',
        [biens.reemploi.id],
      );
      assert.equal(String(bien.structure_id), String(sgg.id), 'le bien est passé au SGG');
      assert.equal(bien.site_id, null, 'le site de l’ancienne structure ne traverse pas la frontière');
      assert.equal(bien.detenteur_id, null);
      assert.equal(bien.etat, 'hors_service', 'RG-015 : il reste au registre, dans son état');
      assert.equal(bien.reforme_le, null, 'un réemploi n’est pas une réforme');

      const mouvement = await bd.un(
        `select type, structure_id, structure_source_code, structure_cible_code, document_id
           from mouvement where bien_id = $1 and type = 'reemploi'`,
        [biens.reemploi.id],
      );
      assert.ok(mouvement, 'le mouvement de réemploi est inscrit');
      assert.equal(mouvement.structure_source_code, 'CGIG');
      assert.equal(mouvement.structure_cible_code, 'SGG');
      assert.equal(String(mouvement.structure_id), String(sgg.id));

      const acte = await bd.un(
        `select id, type, numero, structure_id, fige, contenu from document
          where objet_type = 'bien' and objet_id = $1 and type = 'acte_transfert'`,
        [String(biens.reemploi.id)],
      );
      assert.ok(acte, "l'acte de transfert existe");
      assert.equal(acte.fige, true, 'RG-019 : la pièce est figée');
      assert.equal(
        String(acte.structure_id), String(sgg.id),
        "l'acte est au nom de la structure qui reçoit : c'est son titre de détention",
      );
      assert.match(acte.contenu.mention, /Ce n'est pas une cession/);
      assert.equal(String(mouvement.document_id), String(acte.id));

      const dossier = await bd.un(
        'select statut, reemploye_le, saisi_le, pv_document_id from dossier_reforme where id = $1',
        [dossiers.reemploi.id],
      );
      assert.equal(dossier.statut, 'reemploye');
      assert.ok(dossier.reemploye_le);
      assert.equal(dossier.saisi_le, null, 'le dossier s’est clos sans saisine');
      assert.equal(dossier.pv_document_id, null, 'et sans procès-verbal de réforme');

      const ecartee = await bd.un(
        'select statut, motif_decision from demande_reemploi where id = $1', [demandes.CAID.id],
      );
      assert.equal(ecartee.statut, 'ecartee', "l'autre demande est écartée d'office");
      assert.match(ecartee.motif_decision, new RegExp(sgg.nom), 'et motivée : elle dit à qui le bien est allé');

      const trace = await bd.un(
        `select avant, apres from journal
          where action = 'reemploi_prononce' and objet_id = $1 order by horodatage desc limit 1`,
        [String(dossiers.reemploi.id)],
      );
      assert.ok(trace, 'RG-020 : le réemploi est au journal, avec l’avant et l’après');
      assert.equal(String(trace.avant.bien_structure_id), String(cgig.id));
      assert.equal(String(trace.apres.bien_structure_id), String(sgg.id));
      assert.equal(trace.apres.dossier_statut, 'reemploye');
      assert.equal(trace.apres.autres_demandes_ecartees, 1);
    });
  });

  it('le serveur dit l’avancement : l’étape 5 est faite, la saisine et la décision sont sautées', async () => {
    const detail = await appel(logistique, {
      method: 'GET', url: `/api/dossiers-reforme/${dossiers.reemploi.id}`,
    });
    const corps = detail.json();
    assert.equal(etape(corps, 4).etat, 'faite');
    assert.equal(etape(corps, 5).etat, 'faite');
    assert.equal(etape(corps, 6).etat, 'sautee');
    assert.equal(etape(corps, 7).etat, 'sautee');
    assert.equal(corps.saisine_possible.possible, false);
    assert.match(corps.saisine_possible.motif, /repris par une autre structure/);
  });

  it('la CGIG garde son dossier lisible, désignation comprise, bien que le bien soit parti', async () => {
    // C'est à cela que sert la copie publiée : sans elle, le dossier le mieux
    // abouti du lot se serait affiché vide chez celle qui l'a instruit.
    const detail = await appel(comptable, {
      method: 'GET', url: `/api/dossiers-reforme/${dossiers.reemploi.id}`,
    });
    assert.equal(detail.statusCode, 200, detail.body);
    const corps = detail.json();
    assert.equal(corps.bien.hors_perimetre, true, 'le serveur le dit franchement');
    assert.equal(corps.bien.immatriculation, `${MARQUE}-REEMP`);
    assert.ok(corps.bien.designation);

    const liste = await appel(comptable, { method: 'GET', url: '/api/dossiers-reforme?parPage=200' });
    const vue = liste.json().donnees.find((d) => d.numero === dossiers.reemploi.numero);
    assert.ok(vue, 'et le dossier reste dans sa liste');
    assert.equal(vue.immatriculation, `${MARQUE}-REEMP`);
  });

  it('et le SGG lit désormais le bien, qui est le sien', async () => {
    const reponse = await appel(chefSgg, { method: 'GET', url: `/api/biens/${biens.reemploi.id}` });
    assert.equal(reponse.statusCode, 200, reponse.body);
    assert.equal(String(reponse.json().structure_id), String(sgg.id));
    const types = reponse.json().mouvements.map((m) => m.type);
    assert.ok(types.includes('reemploi'), 'avec l’historique qui dit comment il est arrivé');
  });
});

// ---------------------------------------------------------------------------
describe('La décision des domaines peut refuser la réforme', () => {
  it('le circuit va jusqu’à la saisine', async () => {
    const corps = await proposer(
      'refus',
      'Matériel en panne répétée ; trois interventions en six mois sans résultat durable.',
    );
    dossiers.refus = corps.dossier;
    await reunirCommission(dossiers.refus.id);

    const offre = await appel(logistique, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossiers.refus.id}/offrir`,
      payload: { duree_jours: 7 },
    });
    assert.equal(offre.statusCode, 200, offre.body);
    offres.refus = offre.json().offre;
    assert.equal(offres.refus.duree_jours, 7, 'une durée indiquée l’emporte sur le paramètre');

    const cloture = await appel(logistique, {
      method: 'POST', url: `/api/offres-reemploi/${offres.refus.id}/clore`, payload: {},
    });
    assert.equal(cloture.statusCode, 200, cloture.body);

    const saisine = await appel(logistique, {
      method: 'POST', url: `/api/dossiers-reforme/${dossiers.refus.id}/saisir`, payload: {},
    });
    assert.equal(saisine.statusCode, 200, saisine.body);
    assert.equal(saisine.json().dossier.statut, 'saisi');
    // L'offre close sans aucune demande : l'étape 4 est **sautée**, pas ratée.
    assert.equal(etape(saisine.json(), 4).etat, 'sautee');
  });

  it('les domaines refusent, la décision est enregistrée, et le bien reste au service', async () => {
    const reponse = await appel(logistique, {
      method: 'POST',
      url: `/api/dossiers-reforme/${dossiers.refus.id}/decision`,
      payload: {
        autorite: "Direction des domaines privés et publics de l'État",
        reference: 'DDPPE/2026/0488',
        date_acte: '2026-11-18',
        suite: 'refus',
      },
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    assert.equal(corps.dossier.statut, 'clos');
    assert.equal(corps.decision.suite, 'refus');
    assert.equal(corps.mouvement, null, 'aucun mouvement de réforme sur un refus');

    await enPrivilegie(async (bd) => {
      const bien = await bd.un(
        'select etat, reforme_le from bien where id = $1', [biens.refus.id],
      );
      assert.equal(bien.etat, 'hors_service', 'le bien revient au service : il n’a jamais été réformé');
      assert.equal(bien.reforme_le, null);
      const mouvement = await bd.un(
        "select id from mouvement where bien_id = $1 and type = 'reforme'", [biens.refus.id],
      );
      assert.equal(mouvement, null);
    });
  });
});

// ---------------------------------------------------------------------------
// La liste des offres : la route qui tient l'objet économique du lot.
//
// Elle a été la seule du lot à tomber en 500, et pour une raison qu'un essai de
// circuit ne voyait pas : la requête de comptage recevait un paramètre qu'elle
// n'employait pas, et PostgreSQL refuse. Ces essais parcourent donc **chaque
// filtre et chaque combinaison**, parce que c'est le câblage des paramètres qui
// casse, pas la logique métier.

describe('La liste des offres de réemploi répond à tous ses filtres', () => {
  // Chaque adresse porte déjà sa pagination : un `parPage` ajouté par-dessus
  // ferait un paramètre répété, que la validation refuse à juste titre.
  const adresses = () => [
    '/api/offres-reemploi?parPage=200',
    '/api/offres-reemploi?ouvertes=true&parPage=200',
    '/api/offres-reemploi?ouvertes=false&parPage=200',
    `/api/offres-reemploi?structure_origine=${cgig.id}&parPage=200`,
    `/api/offres-reemploi?ouvertes=true&structure_origine=${cgig.id}&parPage=200`,
    `/api/offres-reemploi?q=${encodeURIComponent(MARQUE)}&parPage=200`,
    `/api/offres-reemploi?ouvertes=true&q=${encodeURIComponent(MARQUE)}&structure_origine=${cgig.id}&parPage=200`,
    `/api/offres-reemploi?ouvertes=false&q=${encodeURIComponent(MARQUE)}&page=1&parPage=200`,
  ];

  it('aucune combinaison de filtres ne la fait tomber', async () => {
    for (const agent of [logistique, chefSgg, comptable]) {
      for (const url of adresses()) {
        const reponse = await appel(agent, { method: 'GET', url });
        assert.equal(reponse.statusCode, 200, `${url} pour ${agent.nom} : ${reponse.body}`);
        const corps = reponse.json();
        assert.ok(Array.isArray(corps.donnees), 'la liste rend un tableau');
        assert.equal(typeof corps.total, 'number');
      }
    }
  });

  it('la pagination tient, et le total compte ce que la clause sélectionne', async () => {
    // Le comptage et la lecture partagent la même clause : s'ils divergeaient,
    // la pagination mentirait.
    for (const url of adresses()) {
      const reponse = await appel(logistique, { method: 'GET', url });
      const corps = reponse.json();
      assert.equal(
        corps.donnees.length, corps.total,
        `${url} : ${corps.donnees.length} lignes rendues pour un total de ${corps.total}`,
      );
    }
    // Une page courte ne change pas le total, seulement ce qu'elle rend.
    const page = await appel(logistique, { method: 'GET', url: '/api/offres-reemploi?page=1&parPage=2' });
    assert.equal(page.statusCode, 200, page.body);
    assert.ok(page.json().donnees.length <= 2);
    assert.ok(page.json().total >= page.json().donnees.length);
    assert.equal(page.json().parPage, 2);
  });

  it('chaque filtre filtre réellement', async () => {
    const lire = async (url) => (await appel(logistique, { method: 'GET', url })).json();
    const ouvertes = await lire('/api/offres-reemploi?ouvertes=true&parPage=200');
    assert.ok(ouvertes.donnees.every((o) => o.statut === 'ouverte'));
    const closes = await lire('/api/offres-reemploi?ouvertes=false&parPage=200');
    assert.ok(closes.donnees.every((o) => o.statut === 'close'));
    const toutes = await lire('/api/offres-reemploi?parPage=200');
    assert.equal(toutes.total, ouvertes.total + closes.total);

    const deCgig = await lire(`/api/offres-reemploi?structure_origine=${cgig.id}&parPage=200`);
    assert.ok(deCgig.total > 0, 'la CGIG a offert pendant cet essai');
    assert.ok(deCgig.donnees.every((o) => o.structure_origine_code === 'CGIG'));

    const cherchees = await lire(`/api/offres-reemploi?q=${encodeURIComponent(MARQUE)}&parPage=200`);
    assert.ok(
      cherchees.donnees.every((o) => (o.bien_immatriculation ?? '').includes(MARQUE)),
      'la recherche porte sur la copie publiée',
    );
    assert.ok(cherchees.total >= 2, 'les deux offres d’essai sont retrouvées');
  });

  it('et le tableau de bord porte le compte des offres ouvertes ailleurs', async () => {
    const reponse = await appel(chefSgg, { method: 'GET', url: '/api/tableau-de-bord' });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    assert.ok(corps.reemploi, 'le tableau de bord porte un bloc « reemploi »');
    assert.equal(corps.reemploi.lien, '/api/offres-reemploi?ouvertes=true');
    assert.equal(
      corps.reemploi.offres_ouvertes,
      corps.reemploi.offres_ouvertes_ailleurs + corps.reemploi.offres_ouvertes_miennes,
      'les deux comptes se recomposent en un seul',
    );

    // Le chiffre de tête est cliquable et vaut exactement « ailleurs » : c'est
    // le serveur qui écarte les offres de la structure du lecteur, et pas
    // l'écran — ce serait un jugement métier rendu à l'écran.
    const tete = corps.chiffres_de_tete.find((c) => /réemploi/i.test(c.libelle));
    assert.ok(tete, 'un chiffre de tête nomme le réemploi');
    assert.equal(tete.valeur, corps.reemploi.offres_ouvertes_ailleurs);
    assert.equal(tete.lien, '/api/offres-reemploi?ouvertes=true');

    // Et il écarte bien les siennes : le SGG offre au jeu de démonstration, et
    // ce que le chiffre compte n'est pas ce que la liste rend brute.
    const siennes = await appel(chefSgg, {
      method: 'GET', url: `/api/offres-reemploi?ouvertes=true&structure_origine=${sgg.id}&parPage=200`,
    });
    assert.equal(corps.reemploi.offres_ouvertes_miennes, siennes.json().total);
    const toutes = await appel(chefSgg, {
      method: 'GET', url: '/api/offres-reemploi?ouvertes=true&parPage=200',
    });
    assert.equal(
      corps.reemploi.offres_ouvertes_ailleurs,
      toutes.json().total - siennes.json().total,
      'le chiffre de tête n’est pas le total brut de la liste',
    );
  });
});

// ---------------------------------------------------------------------------
// Le cloisonnement tenu par la base, pas par la route.
//
// Ces essais se jouent **sous le rôle non privilégié**, sans passer par une
// route : même si une route oubliait son filtre — ou, pour l'offre, si elle en
// ajoutait un de trop — la base dirait la vérité.

/** Ce que cet agent lit du lot, en base, sous le rôle métier. */
async function reformeVueEnBase(agent) {
  return transaction(
    { agentId: agent.id, structureId: agent.structure_id },
    async (bd) => ({
      dossiers: (await bd.tous(
        'select numero from dossier_reforme where numero = any($1)',
        [[dossiers.saisine.numero, dossiers.reemploi.numero, dossiers.refus.numero]],
      )).map((d) => d.numero),
      avis: (await bd.tous(
        `select a.id from avis_commission a
           join dossier_reforme d on d.id = a.dossier_id
          where d.numero = any($1)`,
        [[dossiers.saisine.numero, dossiers.reemploi.numero]],
      )).length,
      offres: (await bd.tous(
        'select numero from offre_reemploi where numero = any($1)',
        [[offres.saisine.numero, offres.reemploi.numero]],
      )).map((o) => o.numero),
    }),
  );
}

describe('La base tient la publication des offres et le cloisonnement du reste', () => {
  it('la CGIG lit ses dossiers, ses avis et ses offres : le témoin de référence', async () => {
    const vu = await reformeVueEnBase(comptable);
    assert.equal(vu.dossiers.length, 3);
    assert.ok(vu.avis >= 6);
    assert.equal(vu.offres.length, 2);
  });

  it('le SGG ne lit aucun dossier ni aucun avis de la CGIG', async () => {
    const vu = await reformeVueEnBase(chefSgg);
    assert.deepEqual(
      vu.dossiers, [],
      'même si une route oubliait son filtre, la base ne doit rien rendre au SGG',
    );
    assert.equal(vu.avis, 0, 'ni les avis de sa commission');
  });

  it('mais il lit les deux offres, parce qu’une offre est une publication', async () => {
    const vu = await reformeVueEnBase(chefSgg);
    assert.deepEqual(
      vu.offres.sort(), [offres.saisine.numero, offres.reemploi.numero].sort(),
      "l'offre est lisible de toute session positionnée : c'est l'étape 3 du circuit",
    );
  });

  it('une session sans structure ne lit rien, pas même une offre', async () => {
    // La publication est ouverte aux sessions **positionnées**, pas à tout le
    // monde : la base échoue fermée, comme partout ailleurs.
    await assert.rejects(
      () => transaction({ agentId: chefSgg.id, structureId: null }, (bd) => bd.tous('select 1')),
      /contexte|ContexteManquant/i,
    );
  });

  it('les demandes sont lisibles des deux côtés, et de personne d’autre', async () => {
    const lu = (agent) => transaction(
      { agentId: agent.id, structureId: agent.structure_id },
      (bd) => bd.tous('select id from demande_reemploi where id = any($1)',
        [[demandes.SGG.id, demandes.CAID.id]]),
    );
    const parCgig = await lu(comptable);
    assert.equal(parCgig.length, 2, "l'origine instruit les deux");
    const parSgg = await lu(chefSgg);
    assert.deepEqual(parSgg.map((d) => String(d.id)), [String(demandes.SGG.id)]);
    const parCaid = await lu(chefCaid);
    assert.deepEqual(parCaid.map((d) => String(d.id)), [String(demandes.CAID.id)]);
  });

  it('RG-018 en base : le niveau central n’ouvre pas de dossier de réforme chez l’ARMP', async () => {
    await assert.rejects(
      () => transaction(
        { agentId: logistique.id, structureId: logistique.structure_id },
        async (bd) => {
          const bienArmp = await bd.un(
            'select id from bien where structure_id = $1 limit 1', [armp.id],
          );
          return bd.requete(
            `insert into dossier_reforme (numero, bien_id, structure_id, propose_par,
                 motif_proposition, statut)
             values ($1, $2, $3, $4, 'Tentative du niveau central.', 'propose')`,
            [`${MARQUE}-ARMP`, bienArmp?.id ?? null, armp.id, logistique.id],
          );
        },
      ),
      /row-level security|violates|null value/i,
      "la base doit refuser l'écriture, pas l'accepter en silence",
    );
    await enPrivilegie(async (bd) => {
      const pose = await bd.un(
        'select id from dossier_reforme where numero = $1', [`${MARQUE}-ARMP`],
      );
      assert.equal(pose, null, "rien n'a été écrit chez l'ARMP");
    });
  });

  it('RG-018 en base : il n’y publie pas davantage une offre', async () => {
    const prepare = await enPrivilegie(async (bd) => {
      const bienArmp = await bd.un(
        "select id, immatriculation, designation, categorie_code, etat from bien where structure_id = $1 and etat <> 'reforme' limit 1",
        [armp.id],
      );
      const agentArmp = await bd.un(
        'select id from agent where structure_id = $1 and actif limit 1', [armp.id],
      );
      const dossier = await bd.un(
        `insert into dossier_reforme (numero, bien_id, structure_id, propose_par,
             motif_proposition, statut, avis_rendu_le)
         values ($1, $2, $3, $4, 'Dossier interne de l''ARMP.', 'examine', now())
         returning id`,
        [`${MARQUE}-ARMP-INTERNE`, bienArmp.id, armp.id, agentArmp.id],
      );
      return { bienArmp, dossier };
    });

    await assert.rejects(
      () => transaction(
        { agentId: logistique.id, structureId: logistique.structure_id },
        (bd) => bd.requete(
          `insert into offre_reemploi (numero, dossier_id, structure_id, bien_designation,
               bien_categorie_code, bien_etat, structure_origine_code, structure_origine_nom,
               cloture_prevue_le, duree_jours, statut, ouverte_par)
           values ($1, $2, $3, $4, $5, $6, 'ARMP', $7, now() + interval '30 days', 30, 'ouverte', $8)`,
          [
            `${MARQUE}-OR-ARMP`, prepare.dossier.id, armp.id,
            prepare.bienArmp.designation, prepare.bienArmp.categorie_code,
            prepare.bienArmp.etat, armp.nom, logistique.id,
          ],
        ),
      ),
      /row-level security|violates/i,
    );
    await enPrivilegie(async (bd) => {
      const pose = await bd.un(
        'select id from offre_reemploi where numero = $1', [`${MARQUE}-OR-ARMP`],
      );
      assert.equal(pose, null, "aucune offre n'a été publiée au nom de l'ARMP");
      await bd.requete('delete from dossier_reforme where id = $1', [prepare.dossier.id]);
    });
  });
});

// ---------------------------------------------------------------------------
// Les fonctions de décision, en pur.
//
// Quatre décisions du lot ne touchent pas la base : les sept étapes, les trois
// « possible », le verdict opposé à une demande, et le point de positionnement
// d'un transfert. Elles s'éprouvent ici sans serveur et sans base, sur les
// seules données qu'elles reçoivent.

describe('Les décisions pures du circuit de réforme', () => {
  const dossierNu = {
    statut: 'propose', cree_le: '2026-10-01T08:00:00Z', propose_par_nom: 'Agent proposant',
  };

  it('les sept étapes sont toujours les sept, numérotées et libellées', () => {
    const etapes = etapesDuDossier({ dossier: dossierNu });
    assert.equal(etapes.length, 7);
    assert.deepEqual(etapes.map((e) => e.numero), [1, 2, 3, 4, 5, 6, 7]);
    assert.ok(etapes.every((e) => typeof e.libelle === 'string' && e.libelle.length > 3));
    assert.ok(etapes.every((e) => ['faite', 'courante', 'a_venir', 'sautee'].includes(e.etat)));
    assert.equal(etapes[0].etat, 'faite');
    assert.equal(etapes[0].par_nom, 'Agent proposant');
    assert.equal(etapes[1].etat, 'courante');
  });

  it('un avis défavorable saute tout ce qui suit : le bien reste en service', () => {
    const etapes = etapesDuDossier({
      dossier: { ...dossierNu, statut: 'rejete', avis_rendu_le: '2026-10-05T08:00:00Z' },
    });
    assert.equal(etapes[1].etat, 'faite');
    for (const numero of [3, 4, 5, 6, 7]) {
      assert.equal(etapes[numero - 1].etat, 'sautee', `l'étape ${numero} est sautée`);
    }
  });

  it('une offre close sans demande saute la demande et le réemploi', () => {
    const etapes = etapesDuDossier({
      dossier: {
        ...dossierNu, statut: 'offert',
        avis_rendu_le: '2026-10-05T08:00:00Z', offert_le: '2026-10-08T08:00:00Z',
      },
      offre: { statut: 'close', numero: 'OR-2026-00001' },
      demandes: [],
    });
    assert.equal(etapes[3].etat, 'sautee');
    assert.equal(etapes[5].etat, 'courante', 'la saisine est maintenant l’étape courante');
  });

  it('un réemploi prononcé saute la saisine et la décision', () => {
    const etapes = etapesDuDossier({
      dossier: {
        ...dossierNu, statut: 'reemploye',
        avis_rendu_le: '2026-10-05T08:00:00Z', offert_le: '2026-10-08T08:00:00Z',
        reemploye_le: '2026-10-20T08:00:00Z',
      },
      offre: { statut: 'close', numero: 'OR-2026-00001' },
      demandes: [{ statut: 'acceptee', cree_le: '2026-10-10T08:00:00Z', tranchee_par_nom: 'Logistique' }],
    });
    assert.equal(etapes[4].etat, 'faite');
    assert.equal(etapes[4].par_nom, 'Logistique');
    assert.equal(etapes[5].etat, 'sautee');
    assert.equal(etapes[6].etat, 'sautee');
  });

  it('l’étape 7 nomme l’autorité, et non un agent du SIGL', () => {
    const etapes = etapesDuDossier({
      dossier: {
        ...dossierNu, statut: 'clos',
        avis_rendu_le: '2026-10-05T08:00:00Z', offert_le: '2026-10-08T08:00:00Z',
        saisi_le: '2026-11-01T08:00:00Z', close_le: '2026-11-20T08:00:00Z',
        decision_date: '2026-11-18', decision_autorite: 'Direction des domaines',
      },
      offre: { statut: 'close' },
      pv: { signataire_nom: 'Chargé de logistique' },
    });
    assert.equal(etapes[5].par_nom, 'Chargé de logistique');
    assert.equal(etapes[6].etat, 'faite');
    assert.equal(etapes[6].par_nom, 'Direction des domaines');
  });

  it('offre_possible nomme la première raison du refus', () => {
    assert.equal(offrePossible({ dossier: { statut: 'examine' } }).possible, true);
    assert.match(offrePossible({ dossier: { statut: 'propose' } }).motif, /avis/);
    assert.match(offrePossible({ dossier: { statut: 'rejete' } }).motif, /reste en service/);
    const sousOffre = offrePossible({
      dossier: { statut: 'offert' },
      offre: { statut: 'ouverte', numero: 'OR-2026-00001' },
    });
    assert.equal(sousOffre.code, 'RG-029');
    assert.match(
      offrePossible({ dossier: { statut: 'offert' }, offre: { statut: 'close', numero: 'OR-1' } }).motif,
      /déjà été offert/,
    );
  });

  it('saisine_possible répond RG-029 puis RG-028, dans l’ordre du circuit', () => {
    const ouverte = saisinePossible({
      dossier: { statut: 'offert' },
      offre: { statut: 'ouverte', numero: 'OR-2026-00002' },
    });
    assert.equal(ouverte.code, 'RG-029', 'une offre qui court le dit mieux, en nommant son terme');
    const sansOffre = saisinePossible({ dossier: { statut: 'examine' }, offre: null });
    assert.equal(sansOffre.code, 'RG-028');
    assert.equal(
      saisinePossible({ dossier: { statut: 'offert' }, offre: { statut: 'close' } }).possible,
      true,
    );
    // Et une demande laissée sans réponse la retient encore, sous le même code.
    const pendante = saisinePossible({
      dossier: { statut: 'offert' },
      offre: { statut: 'close', numero: 'OR-2026-00002' },
      demandes: [{ statut: 'deposee', structure_demandeuse_nom: 'Delivery Unit' }],
    });
    assert.equal(pendante.possible, false);
    assert.equal(pendante.code, 'RG-028');
    assert.match(pendante.motif, /Delivery Unit/);
    assert.equal(
      saisinePossible({
        dossier: { statut: 'offert' },
        offre: { statut: 'close' },
        demandes: [{ statut: 'ecartee' }],
      }).possible,
      true,
      'une demande tranchée ne retient plus rien',
    );
    assert.match(saisinePossible({ dossier: { statut: 'reemploye' } }).motif, /repris/);
    assert.match(saisinePossible({ dossier: { statut: 'saisi' } }).motif, /déjà saisis/);
  });

  it('decision_possible n’ouvre qu’après la saisine, et une seule fois', () => {
    assert.equal(decisionPossible({ dossier: { statut: 'saisi' } }).possible, true);
    assert.match(decisionPossible({ dossier: { statut: 'offert' } }).motif, /ne sont pas saisis/);
    assert.match(
      decisionPossible({
        dossier: { statut: 'clos', decision_autorite: 'Domaines', decision_reference: 'X/1' },
      }).motif,
      /déjà enregistrée/,
    );
  });

  it('demande_possible refuse l’autonome en nommant la cession', () => {
    const offre = { numero: 'OR-2026-00003', statut: 'ouverte', structure_id: 'o1', structure_origine_nom: 'CGIG' };
    const integre = { id: 's1', nom: 'SGG', regime: 'integre' };
    const autonome = { id: 's2', nom: 'ARMP', regime: 'autonome' };
    assert.equal(
      demandePossible({ offre, structure_demandeuse: integre, structure_origine: { id: 'o1', regime: 'integre' } }).possible,
      true,
    );
    const refus = demandePossible({ offre, structure_demandeuse: autonome });
    assert.equal(refus.code, 'RG-018');
    assert.match(refus.motif, /cession/);
    assert.match(refus.motif, /RG-016/);
    // Et dans l'autre sens : le bien d'un autonome ne s'offre pas davantage.
    assert.equal(
      demandePossible({ offre, structure_demandeuse: integre, structure_origine: autonome }).code,
      'RG-018',
    );
  });

  it('demande_possible refuse aussi l’offre close, sa propre offre, et la seconde demande', () => {
    const integre = { id: 's1', nom: 'SGG', regime: 'integre' };
    assert.match(
      demandePossible({
        offre: { numero: 'OR-1', statut: 'close', structure_id: 'o1' },
        structure_demandeuse: integre,
      }).motif,
      /close/,
    );
    assert.match(
      demandePossible({
        offre: { numero: 'OR-1', statut: 'ouverte', structure_id: 's1', structure_origine_nom: 'SGG' },
        structure_demandeuse: integre,
      }).motif,
      /qu'on détient déjà/,
    );
    assert.match(
      demandePossible({
        offre: { numero: 'OR-1', statut: 'ouverte', structure_id: 'o1' },
        structure_demandeuse: integre,
        ma_demande: { statut: 'deposee' },
      }).motif,
      /déjà déposé/,
    );
  });

  it('le point de positionnement d’un transfert est le premier ancêtre commun', () => {
    // La hiérarchie réelle du jeu de démonstration : le Cabinet à la racine, le
    // SGP et le SGG sous lui, la CGIG et la CAID sous le SGP.
    const arbre = [
      { id: 'cab', parent_id: null, regime: 'integre' },
      { id: 'sgp', parent_id: 'cab', regime: 'integre' },
      { id: 'sgg', parent_id: 'cab', regime: 'integre' },
      { id: 'cgig', parent_id: 'sgp', regime: 'integre' },
      { id: 'caid', parent_id: 'sgp', regime: 'integre' },
      { id: 'armp', parent_id: null, regime: 'autonome' },
    ];
    // Deux branches distinctes : il faut remonter au Cabinet.
    assert.equal(ancetreCommunIntegre(arbre, 'cgig', 'sgg'), 'cab');
    // Deux sœurs sous le même parent : le SGP suffit.
    assert.equal(ancetreCommunIntegre(arbre, 'cgig', 'caid'), 'sgp');
    // Une structure et son propre parent.
    assert.equal(ancetreCommunIntegre(arbre, 'cgig', 'sgp'), 'sgp');
  });

  it('et il n’existe pas vers un établissement autonome : ce serait une cession', () => {
    const arbre = [
      { id: 'cab', parent_id: null, regime: 'integre' },
      { id: 'cgig', parent_id: 'cab', regime: 'integre' },
      { id: 'armp', parent_id: 'cab', regime: 'autonome' },
      { id: 'cnp', parent_id: null, regime: 'autonome' },
    ];
    assert.equal(ancetreCommunIntegre(arbre, 'cgig', 'armp'), null);
    assert.equal(ancetreCommunIntegre(arbre, 'cgig', 'cnp'), null, 'et sans rattachement, rien non plus');
    assert.equal(ancetreCommunIntegre(arbre, 'cgig', 'inconnue'), null);
  });
});
