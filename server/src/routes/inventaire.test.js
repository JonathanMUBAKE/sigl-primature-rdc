// inventaire.test.js — L'inventaire physique, éprouvé à travers ses routes.
//
// CE QUE CE FICHIER PROUVE, ET DANS QUEL ORDRE.
//
//   1. Le circuit complet : création d'une campagne, désignation des agents,
//      ouverture, constats (conforme / écart / introuvable), explication,
//      arbitrage, clôture. Chaque étape passe par la route, pas par la base :
//      c'est l'enchaînement qu'on vérifie, pas le schéma.
//   2. RG-023 et RG-024 refusent la clôture, avec leur code et un message qui
//      **nomme ce qui manque** — un refus qui ne dit pas quoi faire est un
//      refus inutilisable.
//   3. RG-026 : qui a constaté l'écart ne le tranche pas, et rien n'est écrit
//      quand la règle mord.
//   4. Un écart tranché en `perte` laisse le bien au registre dans l'état
//      `perdu` (RG-015) et produit le procès-verbal figé (RG-016, RG-019).
//      Vérifié en base, pas supposé.
//   5. En base, sous le rôle non privilégié : un chef de structure ne lit
//      aucune campagne ni aucun constat d'une autre structure, et une écriture
//      du niveau central dans un établissement autonome est refusée (RG-018).
//
// Le périmètre d'essai est un site créé pour l'occasion, avec quatre biens à
// lui. C'est ce qui rend la clôture atteignable : sur un site du jeu de
// démonstration, il aurait fallu constater des dizaines de biens pour voir
// RG-023 laisser passer, et l'essai aurait mesuré la patience plutôt que la
// règle.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { CLE_PRIVILEGE, SESAME_PRIVILEGE, enPrivilegie, fermer, transaction } from '../db.js';
import { construireApp } from '../app.js';
import { arreterEcoute } from './_flux.js';
import { clotureCampagnePossible, mouvementDeRegularisation, natureEcart } from './inventaire.js';

process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

const MARQUE = 'ESSAI-INVENTAIRE';

let serveur;
let cgig;              // CGIG — structure intégrée, fille du SGP
let armp;              // ARMP — établissement public autonome
let comptable;         // comptable des matières de la CGIG : tient la campagne
let magasinier;        // magasinier de la CGIG : constate sur le terrain
let detenteur;         // chef de structure de la CGIG, désigné « detenteur »
let logistique;        // logistique centrale, au SGP : portée totale
let chefSgg;           // chef d'une structure sœur : ne doit rien voir
let site;              // le site d'essai
const biens = {};      // les quatre biens du périmètre
let campagne;          // la campagne d'essai, créée par la route
const ecarts = {};     // les écarts, par nature

const appel = (agent, options) => serveur.inject({
  ...options,
  headers: { ...(options.headers ?? {}), 'x-agent-id': agent.id },
});

/** Un bien d'essai sur le site d'essai, posé par le chemin privilégié. */
async function poserBien(bd, { cle, immatriculation, suivi, quantite, etat, categorie, detenteurId }) {
  const ligne = await bd.un(
    `insert into bien (immatriculation, categorie_code, designation, classement,
        objectif_detention, mode_entree, valeur_acquisition, date_acquisition, etat,
        structure_id, site_id, detenteur_id, suivi, quantite)
     values ($1, $2, $3, 'immobilisation', 'operationnelle', 'achat', 1250000,
             '2025-01-15', $4, $5, $6, $7, $8, $9)
     returning id, immatriculation, designation, quantite, etat, detenteur_id, site_id`,
    [immatriculation, categorie, `${MARQUE} ${cle}`, etat, cgig.id, site.id,
      detenteurId ?? null, suivi, quantite],
  );
  biens[cle] = ligne;
  return ligne;
}

before(async () => {
  await enPrivilegie(async (bd) => {
    cgig = await bd.un("select id, code, regime from structure where code = 'CGIG'");
    armp = await bd.un("select id, code, regime from structure where code = 'ARMP'");
    const sgg = await bd.un("select id from structure where code = 'SGG'");
    assert.equal(cgig.regime, 'integre');
    assert.equal(armp.regime, 'autonome', "l'ARMP est un établissement public autonome");

    const parRole = (role, structureId) => bd.un(
      `select a.id, a.nom, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
        where ar.role_code = $1 and a.structure_id = $2 and a.actif
        order by a.nom limit 1`,
      [role, structureId],
    );
    comptable = await parRole('comptable_matieres', cgig.id);
    magasinier = await parRole('magasinier', cgig.id);
    detenteur = await parRole('chef_structure', cgig.id);
    chefSgg = await parRole('chef_structure', sgg.id);
    logistique = await bd.un(
      `select a.id, a.nom, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
        where ar.role_code = 'logistique' and a.actif order by a.nom limit 1`,
    );
    assert.ok(comptable && magasinier && detenteur && chefSgg && logistique,
      'le jeu de démonstration doit être chargé');

    site = await bd.un(
      `insert into site (structure_id, nom, adresse, ville)
       values ($1, $2, 'Adresse d''essai', 'Kinshasa') returning id, nom`,
      [cgig.id, `${MARQUE} dépôt d'essai`],
    );

    const categorie = await bd.un(
      "select code from categorie where parent_code is not null and classement = 'immobilisation' order by code limit 1",
    );
    await poserBien(bd, {
      cle: 'conforme', immatriculation: `${MARQUE}-CONF`, suivi: 'individuel',
      quantite: 1, etat: 'bon', categorie: categorie.code, detenteurId: detenteur.id,
    });
    await poserBien(bd, {
      cle: 'etat', immatriculation: `${MARQUE}-ETAT`, suivi: 'individuel',
      quantite: 1, etat: 'bon', categorie: categorie.code, detenteurId: detenteur.id,
    });
    await poserBien(bd, {
      cle: 'introuvable', immatriculation: `${MARQUE}-PERDU`, suivi: 'individuel',
      quantite: 1, etat: 'bon', categorie: categorie.code, detenteurId: detenteur.id,
    });
    // Un lot : il n'a pas d'immatriculation individuelle (RG-021), et c'est sur
    // lui qu'un écart de quantité a un sens.
    await poserBien(bd, {
      cle: 'quantite', immatriculation: null, suivi: 'lot',
      quantite: 5, etat: 'bon', categorie: categorie.code, detenteurId: detenteur.id,
    });
  });

  serveur = await construireApp({ servirWeb: false });
  await serveur.ready();
});

after(async () => {
  arreterEcoute();
  if (serveur) await serveur.close();
  await enPrivilegie(async (bd) => {
    // Les campagnes emportent leurs agents, leurs constats et leurs écarts.
    await bd.requete('delete from campagne_inventaire where libelle like $1', [`${MARQUE}%`]);
    await bd.requete(
      "delete from document where objet_type = 'bien' and objet_id in (select id::text from bien where designation like $1)",
      [`${MARQUE}%`],
    );
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);
    await bd.requete('delete from site where nom like $1', [`${MARQUE}%`]);
  });
  await fermer();
});

const aujourdhui = () => new Date().toISOString().slice(0, 10);

describe("Le circuit complet d'une campagne d'inventaire", () => {
  it('la campagne naît préparée, numérotée par le serveur', async () => {
    const reponse = await appel(comptable, {
      method: 'POST',
      url: '/api/campagnes-inventaire',
      payload: {
        libelle: `${MARQUE} campagne du dépôt d'essai`,
        structure_id: cgig.id,
        site_id: site.id,
        date_arretee: aujourdhui(),
      },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const corps = reponse.json();
    campagne = corps.campagne;
    assert.equal(campagne.statut, 'preparee');
    assert.match(campagne.numero, /^CI-\d{4}-\d{5}$/, 'la série CI est générée par le serveur');
    assert.equal(corps.avancement.biens_du_perimetre, 4, 'le périmètre est celui du site d’essai');
    assert.equal(corps.avancement.constates, 0);
    assert.equal(corps.avancement.taux, 0);
    // L'avancement est nul : RG-023 refuserait déjà la clôture, et le serveur
    // le dit d'avance pour que l'écran grise son bouton.
    assert.equal(corps.clotures_possible.possible, false);
    assert.equal(corps.clotures_possible.code, 'RG-023');
  });

  it("une campagne sans agent désigné ne s'ouvre pas", async () => {
    const reponse = await appel(comptable, {
      method: 'POST', url: `/api/campagnes-inventaire/${campagne.id}/ouvrir`, payload: {},
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.equal(reponse.json().erreur.code, 'donnees_invalides');
    assert.equal(reponse.json().erreur.champ, 'agents');
  });

  it('les agents sont désignés, avec leur qualité', async () => {
    for (const [agent, qualite] of [[magasinier, 'operateur'], [detenteur, 'detenteur'], [comptable, 'temoin']]) {
      const reponse = await appel(comptable, {
        method: 'POST',
        url: `/api/campagnes-inventaire/${campagne.id}/agents`,
        payload: { agent_id: agent.id, qualite },
      });
      assert.equal(reponse.statusCode, 201, reponse.body);
    }
    const detail = await appel(comptable, {
      method: 'GET', url: `/api/campagnes-inventaire/${campagne.id}`,
    });
    const liste = detail.json().agents;
    assert.equal(liste.length, 3);
    assert.deepEqual(
      [...new Set(liste.map((a) => a.qualite))].sort(),
      ['detenteur', 'operateur', 'temoin'],
    );
    assert.ok(liste.every((a) => a.nom && a.fonction), 'les agents sont nommés, pas seulement codés');
  });

  it('une campagne préparée ne reçoit aucun constat', async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: `/api/campagnes-inventaire/${campagne.id}/constats`,
      payload: { bien_id: biens.conforme.id, resultat: 'conforme' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.match(reponse.json().erreur.message, /Ouvrez/);
  });

  it("l'ouverture met la campagne en cours", async () => {
    const reponse = await appel(comptable, {
      method: 'POST', url: `/api/campagnes-inventaire/${campagne.id}/ouvrir`, payload: {},
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    assert.equal(reponse.json().campagne.statut, 'en_cours');
    assert.ok(reponse.json().campagne.ouverte_le);
  });

  it('un constat conforme n’ouvre aucun écart, et ne touche pas la fiche', async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: `/api/campagnes-inventaire/${campagne.id}/constats`,
      payload: {
        bien_id: biens.conforme.id, resultat: 'conforme',
        quantite_comptee: 1, etat_constate: 'bon',
        detenteur_constate_id: detenteur.id, site_constate_id: site.id,
      },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    assert.equal(reponse.json().ecart, null, 'un conforme n’ouvre aucun écart');
    await enPrivilegie(async (bd) => {
      const bien = await bd.un('select etat, quantite from bien where id = $1', [biens.conforme.id]);
      assert.equal(bien.etat, 'bon', 'le constat ne modifie jamais la fiche du bien');
      assert.equal(bien.quantite, 1);
    });
  });

  it('un bien hors du périmètre est refusé, en disant pourquoi', async () => {
    const autre = await enPrivilegie((bd) => bd.un(
      'select id from bien where structure_id <> $1 limit 1', [cgig.id],
    ));
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: `/api/campagnes-inventaire/${campagne.id}/constats`,
      payload: { bien_id: autre.id, resultat: 'conforme' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.equal(reponse.json().erreur.champ, 'bien_id');
    assert.match(reponse.json().erreur.message, /périmètre/);
  });

  it("un « conforme » contredit par les mesures est refusé", async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: `/api/campagnes-inventaire/${campagne.id}/constats`,
      payload: { bien_id: biens.etat.id, resultat: 'conforme', etat_constate: 'hors_service' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.equal(reponse.json().erreur.champ, 'resultat');
  });

  it("un « écart » sans rien qui diffère est refusé aussi", async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: `/api/campagnes-inventaire/${campagne.id}/constats`,
      payload: { bien_id: biens.etat.id, resultat: 'ecart', quantite_comptee: 1, etat_constate: 'bon' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.match(reponse.json().erreur.message, /rien ne diffère/);
  });

  it('RG-023 — la clôture est refusée tant qu’un bien du périmètre n’est pas constaté', async () => {
    const reponse = await appel(comptable, {
      method: 'POST', url: `/api/campagnes-inventaire/${campagne.id}/clore`, payload: {},
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    const { erreur } = reponse.json();
    assert.equal(erreur.code, 'RG-023');
    // Le message nomme ce qui manque : trois biens sur quatre.
    assert.match(erreur.message, /3 biens/);
  });

  it("le constat d'un écart d'état est porté par la comptable des matières elle-même", async () => {
    // C'est ce qui rendra RG-026 vérifiable : la même main ne pourra pas
    // trancher ce qu'elle vient de constater.
    const reponse = await appel(comptable, {
      method: 'POST',
      url: `/api/campagnes-inventaire/${campagne.id}/constats`,
      payload: {
        bien_id: biens.etat.id, resultat: 'ecart',
        quantite_comptee: 1, etat_constate: 'hors_service',
        observation: 'Appareil hors service, la fiche le porte en bon état.',
      },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    ecarts.etat = reponse.json().ecart;
    assert.equal(ecarts.etat.nature, 'etat');
    assert.equal(ecarts.etat.statut, 'constate');
    assert.equal(ecarts.etat.decision, null, 'aucune décision automatique');
  });

  it('un écart de quantité porte son écart chiffré', async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: `/api/campagnes-inventaire/${campagne.id}/constats`,
      payload: {
        bien_id: biens.quantite.id, resultat: 'ecart',
        quantite_comptee: 7, etat_constate: 'bon',
        observation: 'Sept unités comptées, la fiche en porte cinq.',
      },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    ecarts.quantite = reponse.json().ecart;
    assert.equal(ecarts.quantite.nature, 'quantite');
    assert.equal(ecarts.quantite.ecart_quantite, 2);
  });

  it('un bien introuvable ouvre un écart de nature « introuvable »', async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: `/api/campagnes-inventaire/${campagne.id}/constats`,
      payload: {
        bien_id: biens.introuvable.id, resultat: 'introuvable',
        observation: 'Bien non présenté ; recherche faite deux fois au dépôt.',
      },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    ecarts.introuvable = reponse.json().ecart;
    assert.equal(ecarts.introuvable.nature, 'introuvable');
    assert.equal(reponse.json().constat.quantite_comptee, null,
      'on ne décrit pas ce qu’on n’a pas vu');
  });

  it('le même bien ne se compte pas deux fois', async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: `/api/campagnes-inventaire/${campagne.id}/constats`,
      payload: { bien_id: biens.conforme.id, resultat: 'conforme' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.match(reponse.json().erreur.message, /déjà été constaté/);
  });

  it('RG-024 — la clôture est refusée sur un écart non tranché, et le message les compte', async () => {
    const detail = await appel(comptable, {
      method: 'GET', url: `/api/campagnes-inventaire/${campagne.id}`,
    });
    const corps = detail.json();
    assert.equal(corps.avancement.restants, 0, 'tout le périmètre est constaté');
    assert.equal(corps.avancement.taux, 1);
    assert.equal(corps.clotures_possible.possible, false);
    assert.equal(corps.clotures_possible.code, 'RG-024',
      'le serveur dit d’avance que c’est RG-024 qui bloquerait');

    const reponse = await appel(comptable, {
      method: 'POST', url: `/api/campagnes-inventaire/${campagne.id}/clore`, payload: {},
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    assert.equal(reponse.json().erreur.code, 'RG-024');
    assert.match(reponse.json().erreur.message, /3 écarts/);
    assert.match(reponse.json().erreur.message, /constaté/);
  });

  it('RG-025 — un écart ne se tranche pas avant l’explication du détenteur', async () => {
    const reponse = await appel(logistique, {
      method: 'POST',
      url: `/api/ecarts-inventaire/${ecarts.etat.id}/trancher`,
      payload: { decision: 'maintien', motif_decision: 'Décision prise sans attendre.' },
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    assert.equal(reponse.json().erreur.code, 'RG-025');
    assert.equal(reponse.json().erreur.champ, 'explication');
  });

  it('le détenteur désigné explique l’écart', async () => {
    const reponse = await appel(detenteur, {
      method: 'POST',
      url: `/api/ecarts-inventaire/${ecarts.etat.id}/expliquer`,
      payload: { explication: "L'appareil est tombé en panne en juin ; aucune fiche de maintenance n'a été ouverte." },
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    assert.equal(reponse.json().statut, 'explique');
    assert.equal(String(reponse.json().explique_par), String(detenteur.id));
  });

  it('un agent étranger à la campagne n’explique rien', async () => {
    const reponse = await appel(chefSgg, {
      method: 'POST',
      url: `/api/ecarts-inventaire/${ecarts.quantite.id}/expliquer`,
      payload: { explication: 'Explication venue d’ailleurs.' },
    });
    assert.ok([403, 404].includes(reponse.statusCode), `reçu ${reponse.statusCode} : ${reponse.body}`);
  });

  it('RG-026 — qui a constaté l’écart ne le tranche pas, et rien n’est écrit', async () => {
    const reponse = await appel(comptable, {
      method: 'POST',
      url: `/api/ecarts-inventaire/${ecarts.etat.id}/trancher`,
      payload: {
        decision: 'regularisation',
        motif_decision: 'La fiche est alignée sur le constat.',
      },
    });
    // Séparation des fonctions, comme RG-002 pour le visa : la règle est
    // métier, donc 422 et le code de la règle.
    assert.equal(reponse.statusCode, 422, reponse.body);
    assert.equal(reponse.json().erreur.code, 'RG-026');
    assert.equal(reponse.json().erreur.champ, 'tranche_par');

    await enPrivilegie(async (bd) => {
      const ecart = await bd.un(
        'select statut, decision, tranche_par, mouvement_id from ecart_inventaire where id = $1',
        [ecarts.etat.id],
      );
      assert.equal(ecart.statut, 'explique', 'l’écart n’a pas bougé');
      assert.equal(ecart.decision, null);
      assert.equal(ecart.tranche_par, null);
      assert.equal(ecart.mouvement_id, null);
      const bien = await bd.un('select etat from bien where id = $1', [biens.etat.id]);
      assert.equal(bien.etat, 'bon', 'et la fiche du bien non plus');
    });
  });

  it('une autre main tranche le même écart : la régularisation aligne la fiche', async () => {
    const reponse = await appel(logistique, {
      method: 'POST',
      url: `/api/ecarts-inventaire/${ecarts.etat.id}/trancher`,
      payload: {
        decision: 'regularisation',
        motif_decision: "Panne confirmée par l'atelier : la fiche passe en hors service.",
      },
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    assert.equal(corps.ecart.statut, 'tranche');
    assert.equal(corps.ecart.decision, 'regularisation');
    assert.equal(corps.bien.etat, 'hors_service', 'la fiche s’aligne sur le constat');
    // L'acte jamais inscrit l'est, sous son vrai nom : un déclassement.
    assert.equal(corps.mouvement.type, 'declassement');
    assert.match(corps.mouvement.motif, /Régularisation d'inventaire/);
  });

  it('un écart tranché ne se tranche pas deux fois', async () => {
    const reponse = await appel(logistique, {
      method: 'POST',
      url: `/api/ecarts-inventaire/${ecarts.etat.id}/trancher`,
      payload: { decision: 'maintien', motif_decision: 'Second avis.' },
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    assert.equal(reponse.json().erreur.code, 'RG-025');
    assert.equal(reponse.json().erreur.champ, 'statut');
  });

  it('un écart de quantité régularisé porte la quantité comptée et son entrée', async () => {
    await appel(detenteur, {
      method: 'POST',
      url: `/api/ecarts-inventaire/${ecarts.quantite.id}/expliquer`,
      payload: { explication: "Deux unités reçues sans bon d'entrée en août." },
    });
    const reponse = await appel(comptable, {
      method: 'POST',
      url: `/api/ecarts-inventaire/${ecarts.quantite.id}/trancher`,
      payload: {
        decision: 'regularisation',
        motif_decision: "Les deux unités sont présentes et leur origine est établie.",
      },
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    assert.equal(reponse.json().bien.quantite, 7);
    assert.equal(reponse.json().mouvement.type, 'entree');
    assert.equal(reponse.json().mouvement.quantite, 2, 'le mouvement porte l’écart, pas le total');
  });

  it('un bien introuvable ne se régularise pas : on tranche en perte ou en maintien', async () => {
    await appel(detenteur, {
      method: 'POST',
      url: `/api/ecarts-inventaire/${ecarts.introuvable.id}/expliquer`,
      payload: { explication: 'Bien non retrouvé après deux recherches au dépôt.' },
    });
    const reponse = await appel(comptable, {
      method: 'POST',
      url: `/api/ecarts-inventaire/${ecarts.introuvable.id}/trancher`,
      payload: { decision: 'regularisation', motif_decision: 'Alignement de la fiche.' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.equal(reponse.json().erreur.champ, 'decision');
  });

  it('RG-015 et RG-016 — la perte laisse le bien au registre et produit le PV', async () => {
    const reponse = await appel(comptable, {
      method: 'POST',
      url: `/api/ecarts-inventaire/${ecarts.introuvable.id}/trancher`,
      payload: {
        decision: 'perte',
        motif_decision: "Bien non retrouvé à l'inventaire ; perte constatée au dépôt d'essai.",
      },
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    assert.equal(corps.ecart.decision, 'perte');
    assert.equal(corps.bien.etat, 'perdu');
    assert.equal(corps.document.type, 'pv_perte');
    assert.equal(corps.document.fige, true);
    assert.equal(corps.mouvement.type, 'perte');

    // Vérifié en base, pas supposé : le bien est toujours au registre.
    await enPrivilegie(async (bd) => {
      const bien = await bd.un(
        'select id, etat, reforme_le from bien where id = $1', [biens.introuvable.id],
      );
      assert.ok(bien, 'RG-015 : un bien ne disparaît jamais du registre');
      assert.equal(bien.etat, 'perdu');
      assert.equal(bien.reforme_le, null, 'une perte n’est pas une réforme');

      const pv = await bd.un(
        `select type, numero, fige, contenu from document
          where objet_type = 'bien' and objet_id = $1 and type = 'pv_perte'`,
        [String(biens.introuvable.id)],
      );
      assert.ok(pv, 'RG-016 : le SIGL produit le procès-verbal');
      assert.equal(pv.fige, true, 'RG-019 : la pièce est figée');
      assert.match(pv.contenu.mention, /la décision appartient à l'autorité compétente/);
      assert.equal(pv.contenu.origine, 'inventaire physique');

      const ecart = await bd.un(
        'select document_id, mouvement_id from ecart_inventaire where id = $1',
        [ecarts.introuvable.id],
      );
      assert.ok(ecart.document_id, 'l’écart garde le lien vers son procès-verbal');
      assert.ok(ecart.mouvement_id);
    });
  });

  it('les trois écarts tranchés, la campagne se clôt et l’état d’inventaire est émis', async () => {
    const avant = await appel(comptable, {
      method: 'GET', url: `/api/campagnes-inventaire/${campagne.id}`,
    });
    assert.equal(avant.json().clotures_possible.possible, true);
    assert.equal(avant.json().clotures_possible.motif, null);

    const reponse = await appel(comptable, {
      method: 'POST',
      url: `/api/campagnes-inventaire/${campagne.id}/clore`,
      payload: { conclusion: 'Un bien perdu, deux écarts régularisés, le reste conforme.' },
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    assert.equal(corps.campagne.statut, 'close');
    assert.ok(corps.campagne.close_le);
    assert.equal(corps.document.type, 'etat_inventaire');
    assert.equal(corps.document.fige, true);

    // RG-020 : l'action sensible est au journal, avec ses valeurs.
    await enPrivilegie(async (bd) => {
      const trace = await bd.un(
        `select action, apres from journal
          where action = 'cloture_campagne_inventaire' and objet_id = $1
          order by horodatage desc limit 1`,
        [String(campagne.id)],
      );
      assert.ok(trace, 'la clôture laisse une trace au journal');
      assert.equal(trace.apres.statut, 'close');
      // `avancement` compte les **constats** par résultat : deux « ecart » et
      // un « introuvable », qui ont ouvert trois lignes d'écart à eux trois.
      assert.equal(trace.apres.avancement.ecarts, 2);
      assert.equal(trace.apres.avancement.introuvables, 1);
      assert.equal(trace.apres.avancement.conformes, 1);
    });
  });

  it('une campagne close ne reçoit plus rien', async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: `/api/campagnes-inventaire/${campagne.id}/constats`,
      payload: { bien_id: biens.conforme.id, resultat: 'conforme' },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.match(reponse.json().erreur.message, /close/);
  });
});

describe("Le périmètre de l'inventaire, vu des routes", () => {
  it("un chef de structure ne voit pas la campagne d'une autre structure", async () => {
    const reponse = await appel(chefSgg, {
      method: 'GET', url: '/api/campagnes-inventaire?parPage=200',
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const numeros = reponse.json().donnees.map((c) => c.numero);
    assert.ok(!numeros.includes(campagne.numero), 'le chef du SGG ne voit pas la campagne de la CGIG');
  });

  it("il ne l'ouvre pas davantage par son identifiant", async () => {
    const reponse = await appel(chefSgg, {
      method: 'GET', url: `/api/campagnes-inventaire/${campagne.id}`,
    });
    assert.ok([403, 404].includes(reponse.statusCode), `reçu ${reponse.statusCode} : ${reponse.body}`);
  });

  it("ni ses écarts, sur la liste transversale", async () => {
    const reponse = await appel(chefSgg, { method: 'GET', url: '/api/ecarts-inventaire?parPage=200' });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const ids = reponse.json().donnees.map((e) => String(e.id));
    for (const ecart of Object.values(ecarts)) {
      assert.ok(!ids.includes(String(ecart.id)), 'aucun écart de la CGIG ne doit lui parvenir');
    }
  });

  it('la logistique centrale, de portée totale, les voit tous', async () => {
    const reponse = await appel(logistique, {
      method: 'GET', url: '/api/campagnes-inventaire?parPage=200',
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    assert.ok(reponse.json().donnees.map((c) => c.numero).includes(campagne.numero));
  });

  it("la liste porte l'avancement calculé par le serveur", async () => {
    const reponse = await appel(comptable, {
      method: 'GET', url: '/api/campagnes-inventaire?parPage=200',
    });
    const vue = reponse.json().donnees.find((c) => c.numero === campagne.numero);
    assert.ok(vue, 'la campagne doit être dans la liste de sa structure');
    assert.equal(vue.biens_du_perimetre, 4);
    assert.equal(vue.constates, 4);
    assert.equal(vue.restants, 0);
    assert.equal(vue.taux, 1);
    assert.equal(vue.ecarts, 3);
    assert.equal(vue.ecarts_non_tranches, 0);
  });
});

// --- Le cloisonnement tenu par la base, pas par la route -----------------
//
// Les sept tables du lot entrent dans les politiques de l'ADR-001. Ces essais
// le vérifient **sous le rôle non privilégié**, sans passer par une route :
// même si une route oubliait son filtre, la base ne rendrait rien. C'est la
// même épreuve que la suite « La base tient le cloisonnement de la chaîne
// d'achat » de `perimetre-achats.test.js`.

/** Ce que cet agent lit du lot, en base, sous le rôle métier. */
async function inventaireVuEnBase(agent) {
  return transaction(
    { agentId: agent.id, structureId: agent.structure_id },
    async (bd) => ({
      campagnes: (await bd.tous(
        'select numero from campagne_inventaire where libelle like $1', [`${MARQUE}%`],
      )).map((c) => c.numero),
      constats: (await bd.tous(
        `select k.id from constat_inventaire k
           join campagne_inventaire c on c.id = k.campagne_id
          where c.libelle like $1`, [`${MARQUE}%`],
      )).length,
      ecarts: (await bd.tous(
        `select e.id from ecart_inventaire e
           join campagne_inventaire c on c.id = e.campagne_id
          where c.libelle like $1`, [`${MARQUE}%`],
      )).length,
    }),
  );
}

describe("La base tient le cloisonnement de l'inventaire", () => {
  it('la comptable des matières de la CGIG lit bien les lignes de sa structure', async () => {
    const vu = await inventaireVuEnBase(comptable);
    assert.deepEqual(vu.campagnes, [campagne.numero], 'le témoin de référence');
    assert.equal(vu.constats, 4);
    assert.equal(vu.ecarts, 3);
  });

  it("un chef de structure ne lit en base aucune campagne ni aucun constat d'une autre structure", async () => {
    const vu = await inventaireVuEnBase(chefSgg);
    assert.deepEqual(
      vu.campagnes, [],
      'même si une route oubliait son filtre, la base ne doit rien rendre au SGG',
    );
    assert.equal(vu.constats, 0, 'et pas davantage les constats');
    assert.equal(vu.ecarts, 0, 'ni les écarts');
  });

  it("RG-018 en base : le niveau central n'ouvre pas de campagne chez un établissement autonome", async () => {
    // L'ARMP a sa personnalité juridique et son propre comptable public : sa
    // comptabilité des matières ne s'écrit pas d'en haut. La politique
    // d'insertion refuse, en plus du refus déjà prononcé par la règle.
    await assert.rejects(
      () => transaction(
        { agentId: logistique.id, structureId: logistique.structure_id },
        (bd) => bd.requete(
          `insert into campagne_inventaire (numero, libelle, structure_id, date_arretee, statut, cree_par)
           values ($1, $2, $3, current_date, 'preparee', $4)`,
          [`${MARQUE}-ARMP`, `${MARQUE} campagne refusée`, armp.id, logistique.id],
        ),
      ),
      /row-level security|violates/i,
      "la base doit refuser l'écriture, pas l'accepter en silence",
    );
    await enPrivilegie(async (bd) => {
      const pose = await bd.un(
        'select id from campagne_inventaire where numero = $1', [`${MARQUE}-ARMP`],
      );
      assert.equal(pose, null, "rien n'a été écrit chez l'ARMP");
    });
  });

  it("RG-018 en base : il n'y glisse pas davantage un constat", async () => {
    const prepare = await enPrivilegie(async (bd) => {
      const bien = await bd.un('select id from bien where structure_id = $1 limit 1', [armp.id]);
      const agentArmp = await bd.un(
        'select id from agent where structure_id = $1 and actif limit 1', [armp.id],
      );
      const campagne = await bd.un(
        `insert into campagne_inventaire (numero, libelle, structure_id, date_arretee, statut,
            ouverte_le, ouverte_par, cree_par)
         values ($1, $2, $3, current_date, 'en_cours', now(), $4, $4) returning id`,
        [`${MARQUE}-ARMP-INTERNE`, `${MARQUE} campagne interne ARMP`, armp.id, agentArmp.id],
      );
      return { bien, campagne };
    });
    const bienArmp = prepare.bien;
    const campagneArmp = prepare.campagne;
    // Le périmètre de la campagne est à l'ARMP : la logistique centrale ne le
    // voit pas, et n'y écrit pas.
    await assert.rejects(
      () => transaction(
        { agentId: logistique.id, structureId: logistique.structure_id },
        (bd) => bd.requete(
          `insert into constat_inventaire (campagne_id, bien_id, structure_id, resultat, constate_par)
           values ($1, $2, $3, 'conforme', $4)`,
          [campagneArmp.id, bienArmp.id, armp.id, logistique.id],
        ),
      ),
      /row-level security|violates/i,
    );
    await enPrivilegie(async (bd) => {
      const compte = await bd.un(
        'select count(*)::int as n from constat_inventaire where campagne_id = $1', [campagneArmp.id],
      );
      assert.equal(compte.n, 0);
      await bd.requete('delete from campagne_inventaire where id = $1', [campagneArmp.id]);
    });
  });
});

// --- Les fonctions de décision, en pur ------------------------------------
//
// Trois décisions du lot ne touchent pas la base : la nature d'un écart, le
// mouvement qui inscrit une régularisation, et ce que la clôture répondrait.
// Elles sont éprouvées ici comme `aiguiller` l'est dans `aiguillage.test.js` :
// sans serveur, sans base, sur les seules données qu'elles reçoivent.

describe("Les décisions pures de l'inventaire", () => {
  const fiche = { quantite: 5, etat: 'bon', detenteur_id: 'd1', site_id: 's1' };

  it('la nature suit ce qui diffère réellement de la fiche', () => {
    assert.equal(natureEcart({ resultat: 'conforme', constat: {}, bien: fiche }), null);
    assert.equal(natureEcart({ resultat: 'introuvable', constat: {}, bien: fiche }), 'introuvable');
    assert.equal(
      natureEcart({ resultat: 'ecart', constat: { quantite_comptee: 7 }, bien: fiche }),
      'quantite',
    );
    assert.equal(
      natureEcart({ resultat: 'ecart', constat: { quantite_comptee: 5, etat_constate: 'a_reparer' }, bien: fiche }),
      'etat',
    );
    assert.equal(
      natureEcart({ resultat: 'ecart', constat: { detenteur_constate_id: 'd2' }, bien: fiche }),
      'detenteur',
    );
    assert.equal(
      natureEcart({ resultat: 'ecart', constat: { site_constate_id: 's2' }, bien: fiche }),
      'localisation',
    );
  });

  it('un écart annoncé sans écart ne rend aucune nature', () => {
    // La route en fait une erreur de saisie : annoncer un écart sans écart est
    // une contradiction, pas une anomalie à instruire.
    assert.equal(
      natureEcart({
        resultat: 'ecart',
        constat: { quantite_comptee: 5, etat_constate: 'bon', detenteur_constate_id: 'd1', site_constate_id: 's1' },
        bien: fiche,
      }),
      null,
    );
  });

  it('la quantité passe devant les autres natures : c’est elle qui fausse les comptes', () => {
    assert.equal(
      natureEcart({
        resultat: 'ecart',
        constat: { quantite_comptee: 4, etat_constate: 'a_reparer', detenteur_constate_id: 'd2' },
        bien: fiche,
      }),
      'quantite',
    );
  });

  it('la régularisation inscrit l’acte jamais enregistré, sous son vrai nom', () => {
    assert.deepEqual(
      mouvementDeRegularisation({ nature: 'quantite', delta: 2 }),
      { type: 'entree', quantite: 2 },
    );
    assert.deepEqual(
      mouvementDeRegularisation({ nature: 'quantite', delta: -3 }),
      { type: 'sortie', quantite: 3 },
    );
    assert.equal(mouvementDeRegularisation({ nature: 'detenteur' }).type, 'transfert');
    assert.equal(mouvementDeRegularisation({ nature: 'localisation' }).type, 'transfert');
    assert.equal(
      mouvementDeRegularisation({ nature: 'etat', etat_avant: 'bon', etat_constate: 'hors_service' }).type,
      'declassement',
    );
    assert.equal(
      mouvementDeRegularisation({ nature: 'etat', etat_avant: 'a_reparer', etat_constate: 'bon' }).type,
      'retour_maintenance',
    );
  });

  it('rien n’inscrit la régularisation d’un bien qu’on n’a pas vu', () => {
    assert.equal(mouvementDeRegularisation({ nature: 'introuvable' }), null);
    assert.equal(mouvementDeRegularisation({ nature: 'quantite', delta: 0 }), null);
    assert.equal(
      mouvementDeRegularisation({ nature: 'etat', etat_avant: 'bon', etat_constate: 'bon' }),
      null,
    );
  });

  it('la clôture nomme la première règle qui bloquerait, dans l’ordre du circuit', () => {
    assert.deepEqual(
      clotureCampagnePossible({ biens_du_perimetre: 4, constates: 4, ecarts: [] }),
      { possible: true, code: null, motif: null },
    );
    const parComptage = clotureCampagnePossible({
      biens_du_perimetre: 4, constates: 1, ecarts: [{ statut: 'constate' }],
    });
    assert.equal(parComptage.possible, false);
    assert.equal(parComptage.code, 'RG-023', 'on ne reproche pas un écart à qui n’a pas fini de compter');
    const parEcart = clotureCampagnePossible({
      biens_du_perimetre: 4, constates: 4, ecarts: [{ statut: 'explique' }],
    });
    assert.equal(parEcart.code, 'RG-024');
    assert.match(parEcart.motif, /1 écart/);
  });
});
