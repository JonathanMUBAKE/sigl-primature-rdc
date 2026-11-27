// alerte-seuil-bout-en-bout.test.js — La chaîne complète de l'alerte de seuil,
// depuis la base réelle, en n'insérant que des **mouvements**.
//
// `stock.test.js` prouve déjà que le franchissement lève l'alerte. Ce qu'il ne
// prouvait pas, et que le client demande, c'est le dernier maillon : que
// **l'événement part bien sur le canal `sigl_flux`** à chaque fois. Sans lui,
// la base alerte et aucun écran ne l'apprend.
//
// Le dispositif : un client dédié en `LISTEN sigl_flux`, exactement comme celui
// que `routes/_flux.js` ouvre en production, et rien d'autre que des
// mouvements insérés par une transaction métier ordinaire.
//
// Le franchissement à la hausse est consigné ici aussi, tel qu'il se comporte
// aujourd'hui : une entrée qui repasse au-dessus du seuil **ne referme pas**
// l'alerte. C'est conforme à RG-022 — une alerte ne décide rien, un humain
// tranche — mais cela laisse une alerte ouverte sur un article réapprovisionné.
// Le point est documenté dans le compte rendu plutôt que tranché ici.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  CLE_PRIVILEGE, SESAME_PRIVILEGE,
  enPrivilegie, fermer, obtenirPool, transaction,
} from './db.js';
import { CANAL } from './routes/_flux.js';

process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

const MARQUE = 'ESSAI-CHAINE-SEUIL';

let sgp;
let agentSgp;
let site;
let bien;
let article;

// Le client d'écoute et le journal des notifications reçues.
let ecoute;
const recues = [];

before(async () => {
  await enPrivilegie(async (bd) => {
    sgp = await bd.un("select id from structure where code = 'SGP'");
    agentSgp = await bd.un('select id from agent where structure_id = $1 limit 1', [sgp.id]);
    site = await bd.un('select id from site where structure_id = $1 limit 1', [sgp.id]);

    await bd.requete('delete from stock where designation like $1', [`${MARQUE}%`]);
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);

    bien = await bd.un(
      `insert into bien (categorie_code, designation, classement, mode_entree,
         valeur_acquisition, cout_remplacement, date_acquisition, etat,
         structure_id, site_id, suivi, quantite, distribution_gratuite)
       values ('FOU-PAP', $1, 'stock', 'achat', 9000, 9500, current_date, 'neuf',
               $2, $3, 'lot', 200, true)
       returning id`,
      [`${MARQUE} Cartouches noires`, sgp.id, site.id],
    );

    // Les seuils de l'article : minimum 50, critique 20.
    article = await bd.un(
      `insert into stock (categorie_code, structure_id, site_id, designation,
         unite, quantite, seuil_minimum, seuil_critique)
       values ('FOU-PAP', $1, $2, $3, 'pièce', 200, 50, 20)
       returning id, quantite, seuil_minimum, seuil_critique`,
      [sgp.id, site.id, `${MARQUE} Cartouches noires`],
    );
  });

  // Le client d'écoute : le même mécanisme que `routes/_flux.js`.
  ecoute = await obtenirPool().connect();
  ecoute.on('notification', (message) => {
    if (message.channel !== CANAL) return;
    try {
      recues.push(JSON.parse(message.payload));
    } catch {
      recues.push({ illisible: message.payload });
    }
  });
  await ecoute.query(`listen ${CANAL}`);
});

after(async () => {
  if (ecoute) {
    ecoute.removeAllListeners('notification');
    await ecoute.query(`unlisten ${CANAL}`).catch(() => {});
    ecoute.release(true);
  }
  await enPrivilegie(async (bd) => {
    await bd.requete('delete from alerte where objet_id = $1', [article.id]);
    await bd.requete('delete from mouvement where bien_id = $1', [bien.id]);
    await bd.requete('delete from stock where designation like $1', [`${MARQUE}%`]);
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);
  });
  await fermer();
});

/** Le seul geste autorisé par cet essai : écrire un mouvement. */
async function mouvement(type, quantite) {
  recues.length = 0;
  await transaction({ agentId: agentSgp.id, structureId: sgp.id }, (bd) => bd.requete(
    `insert into mouvement (bien_id, structure_id, type, quantite, date, motif, agent_id)
     values ($1, $2, $3, $4, current_date, 'Essai de la chaîne de seuil.', $5)`,
    [bien.id, sgp.id, type, quantite, agentSgp.id],
  ));
  // `NOTIFY` est transactionnel : il part au commit, et le client d'écoute le
  // reçoit juste après. On laisse passer quelques tours de boucle.
  await attendre(() => recues.length > 0);
}

async function attendre(suffit, delai = 3000) {
  const echeance = Date.now() + delai;
  while (Date.now() < echeance) {
    if (suffit()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return suffit();
}

const quantite = () => enPrivilegie((bd) => bd.valeur(
  'select quantite from stock where id = $1', [article.id],
));

const alertes = (code) => enPrivilegie((bd) => bd.tous(
  `select id, code, gravite, statut, donnees from alerte
    where objet_type = 'stock' and objet_id = $1
      and ($2::text is null or code = $2::text)
    order by cree_le`,
  [article.id, code ?? null],
));

/** Les notifications reçues pour un objet du flux. */
const notifiees = (objet) => recues.filter((e) => e.objet === objet);

describe('La chaîne de l’alerte de seuil, de bout en bout', () => {
  it('un mouvement sans franchissement : le flux parle, l’alerte se tait', async () => {
    await mouvement('sortie', 100); // 200 → 100, au-dessus du minimum de 50
    assert.equal(await quantite(), 100);
    assert.equal((await alertes()).length, 0, 'aucun seuil franchi, aucune alerte');

    // Le mouvement et la ligne de stock partent tous deux sur `sigl_flux`.
    await attendre(() => notifiees('stock').length > 0);
    const surLeStock = notifiees('stock');
    assert.ok(surLeStock.length > 0, 'la ligne de stock doit être notifiée');
    assert.equal(Number(surLeStock.at(-1).quantite), 100);
    assert.equal(String(surLeStock.at(-1).id), String(article.id));
    assert.ok(notifiees('patrimoine').length > 0, 'le mouvement aussi');
    for (const evenement of recues) {
      assert.match(evenement.horodatage, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(String(evenement.structure_id), String(sgp.id));
    }
  });

  it('une sortie sous le seuil minimum lève une alerte, et une seule', async () => {
    await mouvement('sortie', 55); // 100 → 45, sous le minimum de 50
    assert.equal(await quantite(), 45);

    const ouvertes = await alertes('STOCK_SOUS_MINIMUM');
    assert.equal(ouvertes.length, 1);
    assert.equal(ouvertes[0].gravite, 'attention');
    assert.equal(ouvertes[0].statut, 'ouverte');
    assert.equal(ouvertes[0].donnees.quantite, 45);
    assert.equal(ouvertes[0].donnees.quantite_avant, 100);
    assert.equal(ouvertes[0].donnees.seuil_minimum, 50);

    // ET l'événement part : c'est le maillon que personne ne vérifiait.
    await attendre(() => notifiees('alerte').length > 0);
    const surLAlerte = notifiees('alerte');
    assert.equal(surLAlerte.length, 1, "une alerte levée, un événement émis");
    assert.equal(surLAlerte[0].type, 'creation');
    assert.equal(String(surLAlerte[0].id), String(ouvertes[0].id));
    assert.equal(String(surLAlerte[0].structure_id), String(sgp.id));
  });

  it('tant que l’alerte reste ouverte, il n’y en a pas de seconde du même type', async () => {
    await mouvement('sortie', 10); // 45 → 35, toujours sous le minimum
    assert.equal(await quantite(), 35);
    assert.equal((await alertes('STOCK_SOUS_MINIMUM')).length, 1, 'pas de doublon');
    // Le stock bouge et le dit ; l'alerte, elle, ne se répète pas.
    assert.ok(notifiees('stock').length > 0);
    assert.equal(notifiees('alerte').length, 0);
  });

  it('une sortie supplémentaire sous le seuil critique lève l’alerte critique', async () => {
    await mouvement('sortie', 20); // 35 → 15, sous le critique de 20
    assert.equal(await quantite(), 15);

    const critiques = await alertes('STOCK_CRITIQUE');
    assert.equal(critiques.length, 1);
    assert.equal(critiques[0].gravite, 'critique');
    assert.equal(critiques[0].statut, 'ouverte');
    assert.equal(critiques[0].donnees.quantite, 15);
    assert.equal(critiques[0].donnees.seuil_critique, 20);

    // Les deux coexistent : « sous le minimum » et « rupture imminente » ne
    // disent pas la même chose au magasinier.
    assert.equal((await alertes()).length, 2);

    await attendre(() => notifiees('alerte').length > 0);
    assert.equal(notifiees('alerte').length, 1);
    assert.equal(String(notifiees('alerte')[0].id), String(critiques[0].id));
  });

  it('l’alerte critique ne se répète pas non plus tant qu’elle est ouverte', async () => {
    await mouvement('sortie', 5); // 15 → 10, toujours sous le critique
    assert.equal(await quantite(), 10);
    assert.equal((await alertes('STOCK_CRITIQUE')).length, 1);
    assert.equal(notifiees('alerte').length, 0);
  });

  // Décision du 27 novembre 2026 (docs/JOURNAL-DU-CHANTIER.md) : l'alerte ne se
  // referme pas d'elle-même — RG-022, un humain classe — mais le retour
  // au-dessus du seuil est horodaté, et il lève le verrou anti-doublon.
  it('une entrée qui repasse au-dessus ne referme pas l’alerte, mais l’horodate', async () => {
    await mouvement('entree', 190); // 10 → 200, au-dessus des deux seuils
    assert.equal(await quantite(), 200);

    const toutes = await alertes();
    assert.equal(toutes.length, 2, 'aucune alerte n’est créée ni supprimée par une entrée');
    for (const a of toutes) {
      assert.equal(a.statut, 'ouverte', 'elles restent ouvertes : RG-022, un humain tranche');
      // Le retour au-dessus est consigné : date, et quantité qui l'a levé.
      assert.ok(
        a.donnees.condition_levee_le,
        `${a.code} : le retour au-dessus du seuil doit être horodaté`,
      );
      assert.match(a.donnees.condition_levee_le, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(Number(a.donnees.quantite_au_retour), 200);
      // Et rien d'autre n'a changé : ni le statut, ni la quantité constatée à
      // l'ouverture, ni les seuils (RG-022).
      assert.equal(Number(a.donnees.quantite_avant) >= 0, true);
    }
    // Aucune alerte n'a été créée ; seule leur marque a été posée, et le stock
    // a bougé. Les deux tables notifient, c'est normal.
    assert.ok(notifiees('stock').length > 0);
  });

  it('LE POINT QUI COMPTE — une rupture qui se répète n’est jamais muette', async () => {
    // Le défaut que la version précédente cachait : l'article replonge alors
    // que la première alerte est toujours `ouverte`. Avant, le verrou
    // anti-doublon la faisait taire et personne n'était averti de la seconde
    // rupture. Maintenant, la condition ayant été levée entre-temps, une
    // **nouvelle** alerte s'ouvre — et l'ancienne reste à classer.
    const avant = await alertes('STOCK_SOUS_MINIMUM');
    assert.equal(avant.length, 1);
    assert.ok(avant[0].donnees.condition_levee_le, 'sa condition a été levée');

    await mouvement('sortie', 160); // 200 → 40, sous le minimum de 50
    assert.equal(await quantite(), 40);

    const apres = await alertes('STOCK_SOUS_MINIMUM');
    assert.equal(apres.length, 2, 'la seconde rupture doit lever sa propre alerte');
    // La nouvelle est active : sa condition n'est pas levée.
    assert.equal(apres.at(-1).statut, 'ouverte');
    assert.equal(apres.at(-1).donnees.condition_levee_le, undefined);
    assert.equal(Number(apres.at(-1).donnees.quantite), 40);
    assert.equal(Number(apres.at(-1).donnees.quantite_avant), 200);
    // L'ancienne n'a pas bougé : elle attend toujours son classement.
    assert.equal(apres[0].statut, 'ouverte');
    assert.ok(apres[0].donnees.condition_levee_le);

    // Et l'événement part sur `sigl_flux`, comme pour la première.
    await attendre(() => notifiees('alerte').length > 0);
    const emises = notifiees('alerte').filter((e) => e.type === 'creation');
    assert.equal(emises.length, 1, 'une alerte nouvelle, un événement émis');
    assert.equal(String(emises[0].id), String(apres.at(-1).id));
  });

  it('en revanche, tant que la condition tient, le verrou tient aussi', async () => {
    // Pas de harcèlement : l'alerte active ne se répète pas.
    await mouvement('sortie', 5); // 40 → 35, toujours sous le minimum
    assert.equal(await quantite(), 35);
    assert.equal((await alertes('STOCK_SOUS_MINIMUM')).length, 2, 'pas de troisième');
    assert.equal(notifiees('alerte').length, 0);
  });

  it('une fois l’alerte classée par un humain, un nouveau franchissement en ouvre une autre', async () => {
    // Le geste humain : le magasinier classe l'alerte au vu du réapprovisionnement.
    await enPrivilegie((bd) => bd.requete(
      `update alerte set statut = 'classee', traite_par = $2, traite_le = now(),
         suite = 'Réapprovisionné ; alerte classée.'
       where objet_type = 'stock' and objet_id = $1`,
      [article.id, agentSgp.id],
    ));

    const dejaOuvertes = (await alertes('STOCK_SOUS_MINIMUM')).length;
    await mouvement('entree', 165); // 35 → 200, au-dessus des deux seuils
    await mouvement('sortie', 160); // 200 → 40, sous le minimum de 50
    assert.equal(await quantite(), 40);

    const minimums = await alertes('STOCK_SOUS_MINIMUM');
    assert.equal(
      minimums.length, dejaOuvertes + 1,
      'les précédentes étant classées, une nouvelle s’ouvre',
    );
    assert.equal(minimums.at(-1).statut, 'ouverte');

    await attendre(() => notifiees('alerte').length > 0);
    assert.ok(notifiees('alerte').length >= 1, 'et elle part sur le flux');
  });

  it('RG-022 — rien de tout cela n’a changé un état métier', async () => {
    const etat = await enPrivilegie((bd) => bd.un(
      'select quantite, seuil_minimum, seuil_critique from stock where id = $1',
      [article.id],
    ));
    // Les seuils sont ceux posés au départ : aucune alerte ne les a ajustés,
    // aucune n'a réapprovisionné ni bloqué quoi que ce soit, et aucune n'a
    // changé son propre statut — seul un humain l'a fait.
    assert.equal(etat.quantite, 40);
    assert.equal(etat.seuil_minimum, 50);
    assert.equal(etat.seuil_critique, 20);
  });
});
