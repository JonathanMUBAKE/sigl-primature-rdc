// stock.test.js — Le stock dynamique, recalculé et alerté par la base.
//
// Le franchissement de seuil doit être détecté dans la base, pas dans le code
// applicatif : quelle que soit la route qui écrit le mouvement, l'alerte part.
// C'est ce que vérifient ces tests, en n'insérant **que** des mouvements.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { enPrivilegie, fermer, transaction } from './db.js';

const MARQUE = 'ESSAI-STOCK';

let sgp;
let agentSgp;
let site;
let bien;
let ligneStock;

before(async () => {
  await enPrivilegie(async (bd) => {
    sgp = await bd.un("select id from structure where code = 'SGP'");
    agentSgp = await bd.un('select id from agent where structure_id = $1 limit 1', [sgp.id]);
    site = await bd.un('select id from site where structure_id = $1 limit 1', [sgp.id]);

    await bd.requete('delete from alerte where explication like $1', [`%${MARQUE}%`]);
    await bd.requete('delete from stock where designation like $1', [`${MARQUE}%`]);
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);

    // Un article de stock, et le bien correspondant : le déclencheur fait le
    // lien par (categorie_code, site_id, designation).
    bien = await bd.un(
      `insert into bien (categorie_code, designation, classement, mode_entree,
         valeur_acquisition, cout_remplacement, date_acquisition, etat,
         structure_id, site_id, suivi, quantite, distribution_gratuite)
       values ('FOU-PAP', $1, 'stock', 'achat', 14500, 15200, current_date, 'neuf',
               $2, $3, 'lot', 100, true)
       returning id`,
      [`${MARQUE} Papier A4 80 g`, sgp.id, site.id],
    );

    ligneStock = await bd.un(
      `insert into stock (categorie_code, structure_id, site_id, designation,
         unite, quantite, seuil_minimum, seuil_critique)
       values ('FOU-PAP', $1, $2, $3, 'rame', 100, 40, 15)
       returning id, quantite, seuil_minimum, seuil_critique`,
      [sgp.id, site.id, `${MARQUE} Papier A4 80 g`],
    );
  });
});

after(async () => {
  await enPrivilegie(async (bd) => {
    await bd.requete('delete from alerte where objet_id = $1', [ligneStock.id]);
    await bd.requete('delete from mouvement where bien_id = $1', [bien.id]);
    await bd.requete('delete from stock where designation like $1', [`${MARQUE}%`]);
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);
  });
  await fermer();
});

/** Écrit un mouvement — et rien d'autre. Tout le reste est l'affaire de la base. */
async function mouvement(type, quantite) {
  return transaction({ agentId: agentSgp.id, structureId: sgp.id }, (bd) => bd.requete(
    `insert into mouvement (bien_id, structure_id, type, quantite, date, motif, agent_id)
     values ($1, $2, $3, $4, current_date, 'Essai automatisé.', $5)`,
    [bien.id, sgp.id, type, quantite, agentSgp.id],
  ));
}

const quantiteActuelle = () => enPrivilegie((bd) => bd.valeur(
  'select quantite from stock where id = $1', [ligneStock.id],
));

const alertes = (code) => enPrivilegie((bd) => bd.tous(
  `select code, gravite, statut, donnees from alerte
   where objet_type = 'stock' and objet_id = $1
     and ($2::text is null or code = $2::text)
   order by cree_le`,
  [ligneStock.id, code ?? null],
));

describe('Le stock se recalcule à chaque mouvement', () => {
  it('une sortie diminue la quantité', async () => {
    await mouvement('sortie', 30);
    assert.equal(await quantiteActuelle(), 70);
  });

  it('une entrée l’augmente', async () => {
    await mouvement('entree', 10);
    assert.equal(await quantiteActuelle(), 80);
  });

  it('une maintenance ne la touche pas', async () => {
    await mouvement('maintenance', 5);
    assert.equal(await quantiteActuelle(), 80);
  });

  it('la quantité ne descend jamais sous zéro', async () => {
    await mouvement('sortie', 10_000);
    assert.equal(await quantiteActuelle(), 0);
    // On remonte pour la suite des essais.
    await mouvement('entree', 60);
    assert.equal(await quantiteActuelle(), 60);
  });
});

describe('L’alerte part au franchissement du seuil, depuis la base', () => {
  it('aucune alerte tant que la quantité reste au-dessus du seuil minimum', async () => {
    // La quantité est passée par 0 à l'essai précédent : on repart propre.
    await enPrivilegie(async (bd) => {
      await bd.requete('delete from alerte where objet_id = $1', [ligneStock.id]);
      await bd.requete('update stock set quantite = 100 where id = $1', [ligneStock.id]);
      await bd.requete('delete from alerte where objet_id = $1', [ligneStock.id]);
    });

    await mouvement('sortie', 20); // 100 → 80, au-dessus du minimum de 40
    assert.equal(await quantiteActuelle(), 80);
    assert.equal((await alertes()).length, 0);
  });

  it('le passage sous le seuil minimum ouvre une alerte « attention »', async () => {
    await mouvement('sortie', 45); // 80 → 35, sous le minimum de 40
    assert.equal(await quantiteActuelle(), 35);

    const ouvertes = await alertes('STOCK_SOUS_MINIMUM');
    assert.equal(ouvertes.length, 1);
    assert.equal(ouvertes[0].gravite, 'attention');
    assert.equal(ouvertes[0].statut, 'ouverte');
    assert.equal(ouvertes[0].donnees.quantite, 35);
    assert.equal(ouvertes[0].donnees.quantite_avant, 80);
  });

  it('elle ne se duplique pas tant qu’elle est ouverte', async () => {
    await mouvement('sortie', 5); // 35 → 30, toujours sous le minimum
    assert.equal(await quantiteActuelle(), 30);
    assert.equal((await alertes('STOCK_SOUS_MINIMUM')).length, 1);
  });

  it('le passage sous le seuil critique ouvre une alerte « critique » distincte', async () => {
    await mouvement('sortie', 20); // 30 → 10, sous le critique de 15
    assert.equal(await quantiteActuelle(), 10);

    const critiques = await alertes('STOCK_CRITIQUE');
    assert.equal(critiques.length, 1);
    assert.equal(critiques[0].gravite, 'critique');
    assert.equal(critiques[0].donnees.quantite, 10);

    // Les deux alertes coexistent : elles ne disent pas la même chose.
    assert.equal((await alertes()).length, 2);
  });

  it('une fois l’alerte tranchée, un nouveau franchissement en ouvre une autre', async () => {
    await enPrivilegie((bd) => bd.requete(
      `update alerte set statut = 'confirmee', traite_par = $2, traite_le = now(),
         suite = 'Rupture confirmée, dossier d’achat ouvert.'
       where objet_id = $1 and code = 'STOCK_CRITIQUE'`,
      [ligneStock.id, agentSgp.id],
    ));

    await mouvement('entree', 100); // 10 → 110, on repasse au-dessus
    await mouvement('sortie', 105); // 110 → 5, on refranchit le critique

    const critiques = await alertes('STOCK_CRITIQUE');
    assert.equal(critiques.length, 2, 'la précédente étant tranchée, une nouvelle s’ouvre');
    assert.equal(critiques.at(-1).statut, 'ouverte');
  });

  it('RG-022 — l’alerte ne change aucun état métier', async () => {
    const etat = await enPrivilegie((bd) => bd.un(
      'select quantite, seuil_minimum, seuil_critique from stock where id = $1',
      [ligneStock.id],
    ));
    // Les seuils et la quantité sont ceux que les mouvements ont produits ;
    // aucune alerte n'a corrigé, bloqué ni réapprovisionné quoi que ce soit.
    assert.equal(etat.quantite, 5);
    assert.equal(etat.seuil_minimum, 40);
    assert.equal(etat.seuil_critique, 15);
  });
});
