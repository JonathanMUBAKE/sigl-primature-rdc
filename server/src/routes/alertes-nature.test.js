// alertes-nature.test.js — La nature d'une alerte, dite explicitement.
//
// Décision du 27 novembre 2026 (`docs/JOURNAL-DU-CHANTIER.md`) : une alerte
// dont la condition a été levée — le stock est repassé au-dessus du seuil —
// n'est pas de même nature qu'une alerte active. Le système ne la referme pas
// de lui-même (RG-022, un humain classe), mais il doit le **dire**, et le dire
// dans un champ explicite : l'interface n'a pas à fouiller `donnees` pour
// savoir ce qui brûle et ce qui attend seulement d'être classé.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  CLE_PRIVILEGE, SESAME_PRIVILEGE, enPrivilegie, fermer, transaction,
} from '../db.js';
import { construireApp } from '../app.js';
import { arreterEcoute } from './_flux.js';
import { avecNature } from './_alertes.js';

process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

const MARQUE = 'ESSAI-NATURE-ALERTE';

let serveur;
let sgp;
let agent;      // portée totale : il voit les alertes de toutes les structures
let magasinier;
let site;
let bien;
let article;

const appel = (qui, options) => serveur.inject({
  ...options,
  headers: { ...(options.headers ?? {}), 'x-agent-id': qui.id },
});

/** Un mouvement, et rien d'autre : la base fait le reste. */
const mouvement = (type, quantite) => transaction(
  { agentId: magasinier.id, structureId: sgp.id },
  (bd) => bd.requete(
    `insert into mouvement (bien_id, structure_id, type, quantite, date, motif, agent_id)
     values ($1, $2, $3, $4, current_date, 'Essai de la nature des alertes.', $5)`,
    [bien.id, sgp.id, type, quantite, magasinier.id],
  ),
);

before(async () => {
  await enPrivilegie(async (bd) => {
    sgp = await bd.un("select id from structure where code = 'SGP'");
    agent = await bd.un(
      `select a.id, a.nom from agent a join agent_role ar on ar.agent_id = a.id
        where ar.role_code = 'logistique' and a.actif limit 1`,
    );
    magasinier = await bd.un('select id from agent where structure_id = $1 limit 1', [sgp.id]);
    site = await bd.un('select id from site where structure_id = $1 limit 1', [sgp.id]);

    await bd.requete('delete from stock where designation like $1', [`${MARQUE}%`]);
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);

    bien = await bd.un(
      `insert into bien (categorie_code, designation, classement, mode_entree,
         valeur_acquisition, cout_remplacement, date_acquisition, etat,
         structure_id, site_id, suivi, quantite, distribution_gratuite)
       values ('FOU-PAP', $1, 'stock', 'achat', 7000, 7400, current_date, 'neuf',
               $2, $3, 'lot', 200, true)
       returning id`,
      [`${MARQUE} Enveloppes A4`, sgp.id, site.id],
    );
    article = await bd.un(
      `insert into stock (categorie_code, structure_id, site_id, designation,
         unite, quantite, seuil_minimum, seuil_critique)
       values ('FOU-PAP', $1, $2, $3, 'boîte', 200, 50, 20)
       returning id`,
      [sgp.id, site.id, `${MARQUE} Enveloppes A4`],
    );
  });
  assert.ok(agent, 'il faut un agent de portée totale');

  serveur = await construireApp({ servirWeb: false });
  await serveur.ready();

  // Le scénario : rupture, réapprovisionnement, rupture à nouveau. Deux
  // alertes du même code, de deux natures différentes.
  await mouvement('sortie', 160); // 200 → 40 : première alerte, active
  await mouvement('entree', 160); // 40 → 200 : sa condition est levée
  await mouvement('sortie', 160); // 200 → 40 : seconde alerte, active
});

after(async () => {
  await arreterEcoute();
  await serveur?.close();
  await enPrivilegie(async (bd) => {
    await bd.requete('delete from alerte where objet_id = $1', [article.id]);
    await bd.requete('delete from mouvement where bien_id = $1', [bien.id]);
    await bd.requete('delete from stock where designation like $1', [`${MARQUE}%`]);
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);
  });
  await fermer();
});

/** Nos deux alertes, retrouvées dans une réponse de l'API. */
const lesNotres = (donnees) => donnees
  .filter((a) => a.objet_id === String(article.id))
  .sort((x, y) => new Date(x.cree_le) - new Date(y.cree_le));

describe('L’API dit la nature de chaque alerte, sans déduction à faire', () => {
  it('la liste distingue l’alerte active de celle qui attend un classement', async () => {
    const reponse = await appel(agent, {
      method: 'GET',
      url: '/api/alertes?code=STOCK_SOUS_MINIMUM&objet_type=stock&parPage=200',
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const notres = lesNotres(reponse.json().donnees);
    assert.equal(notres.length, 2, 'les deux ruptures doivent avoir leur alerte');

    // La première : sa condition a été levée, elle n'attend qu'un classement.
    assert.equal(notres[0].nature, 'a_classer');
    assert.equal(notres[0].condition_levee, true);
    assert.match(notres[0].condition_levee_le, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(Number(notres[0].quantite_au_retour), 200);
    assert.equal(notres[0].en_cours, true);
    assert.equal(notres[0].statut, 'ouverte', 'le système ne l’a pas refermée');

    // La seconde : la condition tient toujours. C'est celle qui brûle.
    assert.equal(notres[1].nature, 'active');
    assert.equal(notres[1].condition_levee, false);
    assert.equal(notres[1].condition_levee_le, null);
    assert.equal(notres[1].quantite_au_retour, null);
    assert.equal(notres[1].en_cours, true);

    // Et le résumé compte les natures, pour que le bandeau n'ait pas à le faire.
    const { resume, total } = reponse.json();
    assert.ok(resume, 'la liste doit porter son résumé par nature');
    assert.equal(resume.actives + resume.a_classer + resume.tranchees, total);
    assert.equal(resume.en_cours, resume.actives + resume.a_classer);
    assert.ok(resume.actives >= 1);
    assert.ok(resume.a_classer >= 1);
  });

  it('le filtre par nature ne rend que la nature demandée', async () => {
    const actives = await appel(agent, { method: 'GET', url: '/api/alertes?nature=active&parPage=200' });
    assert.equal(actives.statusCode, 200, actives.body);
    assert.ok(actives.json().donnees.every((a) => a.nature === 'active'));
    assert.equal(lesNotres(actives.json().donnees).length, 1);

    const aClasser = await appel(agent, { method: 'GET', url: '/api/alertes?nature=a_classer&parPage=200' });
    assert.equal(aClasser.statusCode, 200, aClasser.body);
    assert.ok(aClasser.json().donnees.every((a) => a.nature === 'a_classer'));
    assert.ok(aClasser.json().donnees.every((a) => a.condition_levee === true));
    assert.equal(lesNotres(aClasser.json().donnees).length, 1);

    const tranchees = await appel(agent, { method: 'GET', url: '/api/alertes?nature=tranchee&parPage=200' });
    assert.equal(tranchees.statusCode, 200, tranchees.body);
    assert.ok(tranchees.json().donnees.every((a) => a.nature === 'tranchee'));
    assert.ok(tranchees.json().donnees.every((a) => a.en_cours === false));
  });

  it('la fiche d’une alerte porte la même nature', async () => {
    const liste = await appel(agent, {
      method: 'GET',
      url: '/api/alertes?code=STOCK_SOUS_MINIMUM&objet_type=stock&parPage=200',
    });
    const [aClasser] = lesNotres(liste.json().donnees);
    const fiche = await appel(agent, { method: 'GET', url: `/api/alertes/${aClasser.id}` });
    assert.equal(fiche.statusCode, 200, fiche.body);
    assert.equal(fiche.json().nature, 'a_classer');
    assert.equal(fiche.json().condition_levee, true);
  });

  it('le classement par un humain fait passer l’alerte en « tranchee »', async () => {
    const liste = await appel(agent, {
      method: 'GET',
      url: '/api/alertes?code=STOCK_SOUS_MINIMUM&objet_type=stock&parPage=200',
    });
    const [aClasser] = lesNotres(liste.json().donnees);

    const traitee = await appel(agent, {
      method: 'POST',
      url: `/api/alertes/${aClasser.id}/traiter`,
      payload: { statut: 'classee', suite: 'Article réapprovisionné ; alerte classée.' },
    });
    assert.equal(traitee.statusCode, 200, traitee.body);
    assert.equal(traitee.json().nature, 'tranchee');
    assert.equal(traitee.json().en_cours, false);
    assert.equal(traitee.json().statut, 'classee');
    // La marque du retour au-dessus est conservée : elle explique le classement.
    assert.equal(traitee.json().condition_levee, true);
  });

  it('le tableau de bord sépare ce qui brûle de ce qui attend un classement', async () => {
    const reponse = await appel(agent, { method: 'GET', url: '/api/tableau-de-bord' });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const { alertes } = reponse.json();
    assert.equal(typeof alertes.actives, 'number');
    assert.equal(typeof alertes.a_classer, 'number');
    assert.equal(alertes.ouvertes, alertes.actives + alertes.a_classer);
    assert.equal(alertes.lien_actives, '/api/alertes?nature=active');
    assert.equal(alertes.lien_a_classer, '/api/alertes?nature=a_classer');
    // Le chiffre de tête ne compte que ce qui brûle.
    const tete = reponse.json().chiffres_de_tete.find((c) => c.libelle === 'Alertes actives');
    assert.ok(tete, 'le chiffre de tête doit nommer les alertes actives');
    assert.equal(tete.valeur, alertes.actives);
  });

  it('la nature se calcule aussi sans base, pour les cas limites', () => {
    assert.equal(avecNature({ statut: 'ouverte', donnees: {} }).nature, 'active');
    assert.equal(avecNature({ statut: 'en_examen', donnees: {} }).nature, 'active');
    assert.equal(
      avecNature({ statut: 'ouverte', donnees: { condition_levee_le: '2026-11-27T10:00:00Z' } }).nature,
      'a_classer',
    );
    assert.equal(
      avecNature({ statut: 'classee', donnees: { condition_levee_le: '2026-11-27T10:00:00Z' } }).nature,
      'tranchee',
    );
    assert.equal(avecNature({ statut: 'confirmee', donnees: {} }).nature, 'tranchee');
    // Une alerte sans `donnees` ne doit pas faire tomber la route.
    assert.equal(avecNature({ statut: 'ouverte' }).nature, 'active');
    assert.equal(avecNature(null), null);
  });
});
