// tableau-de-bord-couverture.test.js — Le poste de commande rendait une
// consommation nulle à ceux qui en ont besoin.
//
// LE DÉFAUT. `GET /api/tableau-de-bord` lisait la consommation constatée dans
// le `journal`, par une jointure placée dans sa propre requête. Or la politique
// `journal_lecture` de l'ADR-001 réserve le journal au mode consolidation : le
// journal ne porte pas de `structure_id`, il ne peut donc pas être cloisonné
// par structure, et il est fermé plutôt qu'entrouvert. Jointe sous une
// transaction métier ordinaire, la table ne rendait **rien** — sans erreur,
// sans trace, zéro ligne.
//
// Conséquence : pour le magasinier et le comptable des matières, c'est-à-dire
// précisément ceux qui ouvrent ce tableau pour savoir ce qui va manquer, les
// jours de couverture valaient toujours `null`, « rupture sous 30 jours »
// valait toujours zéro et la liste des articles à surveiller était toujours
// vide. Une politique de sécurité correcte vidait une fonction métier de son
// contenu. Aucun essai ne le voyait, parce que les essais interrogeaient le
// serveur avec les droits qu'il faut — ceux de la logistique, de portée totale.
//
// L'écran des stocks avait déjà été corrigé par une lecture nommée et bornée.
// Le tableau de bord portait encore la faute ; la lecture est remontée dans
// `routes/_consommation.js`, et les deux appelants emploient la même.
//
// CE QUE CET ESSAI MORD. Le même article, la même consommation, lu par deux
// agents de portée différente : le résultat doit être le même. Et l'activité du
// journal, qu'un agent de portée propre ne peut pas lire, se dit maintenant
// indisponible au lieu de se taire à zéro.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { CLE_PRIVILEGE, SESAME_PRIVILEGE, enPrivilegie, fermer } from '../db.js';
import { construireApp } from '../app.js';
import { arreterEcoute } from './_flux.js';

process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

const MARQUE = 'ESSAI-COUVERTURE-TDB';
const FENETRE = 90;
const QUANTITE = 60;
const SORTIE_TOTALE = 900; // sur 90 jours → 10 par jour → 6 jours de couverture

let serveur;
let magasinier;   // portée propre : sa structure, et pas le journal
let logistique;   // portée totale : la consolidation, et le journal
let article;
let bien;

const appel = (agent, options) => serveur.inject({
  ...options,
  headers: { ...(options.headers ?? {}), 'x-agent-id': agent.id },
});

before(async () => {
  serveur = await construireApp();
  await serveur.ready();

  await enPrivilegie(async (bd) => {
    // Un magasinier d'une structure intégrée, et le site dont il répond.
    magasinier = await bd.un(
      `select a.id, a.nom, a.structure_id, ar.site_id
         from agent_role ar
         join agent a on a.id = ar.agent_id
         join structure s on s.id = a.structure_id
        where ar.role_code = 'magasinier' and a.actif and s.regime = 'integre'
        order by a.nom limit 1`,
    );
    assert.ok(magasinier, 'le jeu de démonstration doit porter un magasinier');

    logistique = await bd.un(
      `select a.id, a.nom from agent_role ar join agent a on a.id = ar.agent_id
        where ar.role_code = 'logistique' and a.actif order by a.nom limit 1`,
    );
    assert.ok(logistique, 'le jeu de démonstration doit porter un chargé de logistique');

    const site = await bd.un(
      'select id from site where structure_id = $1 order by nom limit 1',
      [magasinier.structure_id],
    );

    await bd.requete('delete from stock where designation like $1', [`${MARQUE}%`]);
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);

    bien = await bd.un(
      `insert into bien (categorie_code, designation, classement, mode_entree,
         valeur_acquisition, cout_remplacement, date_acquisition, etat,
         structure_id, site_id, suivi, quantite, distribution_gratuite)
       values ('FOU-PAP', $1, 'stock', 'achat', 4000, 4200, current_date, 'neuf',
               $2, $3, 'lot', $4, true)
       returning id`,
      [`${MARQUE} Ramettes`, magasinier.structure_id, site.id, QUANTITE],
    );

    article = await bd.un(
      `insert into stock (categorie_code, structure_id, site_id, designation,
         unite, quantite, seuil_minimum, seuil_critique)
       values ('FOU-PAP', $1, $2, $3, 'ramette', $4, 200, 100)
       returning id`,
      [magasinier.structure_id, site.id, `${MARQUE} Ramettes`, QUANTITE],
    );

    // La consommation constatée : trois sorties au journal, dans la fenêtre.
    // C'est bien le journal qui la porte (RG-020) — aucune table parallèle.
    for (const [jours, quantite] of [[10, 300], [40, 300], [80, 300]]) {
      await bd.requete(
        `insert into journal (horodatage, agent_id, action, objet_type, objet_id, avant, apres)
         values (now() - ($1 || ' days')::interval, $2, 'sortie_stock', 'stock', $3, $4, $5)`,
        [
          String(jours), magasinier.id, String(article.id),
          JSON.stringify({ quantite: QUANTITE + quantite }),
          JSON.stringify({ quantite: QUANTITE, quantite_sortie: quantite }),
        ],
      );
    }
    assert.equal(
      [300, 300, 300].reduce((s, q) => s + q, 0), SORTIE_TOTALE,
      'la consommation posée doit être celle que l’essai annonce',
    );
  });
});

after(async () => {
  await enPrivilegie(async (bd) => {
    await bd.requete(
      "delete from journal where objet_type = 'stock' and objet_id = $1", [String(article.id)],
    );
    await bd.requete('delete from alerte where objet_id = $1', [String(article.id)]);
    await bd.requete('delete from mouvement where bien_id = $1', [bien.id]);
    await bd.requete('delete from stock where designation like $1', [`${MARQUE}%`]);
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);
  });
  await arreterEcoute();
  await serveur?.close();
  await fermer();
});

/** L'article de l'essai, dans la liste des articles à surveiller. */
function surveille(corps) {
  const liste = corps.stocks?.articles_a_surveiller ?? [];
  return liste.find((a) => String(a.id) === String(article.id)) ?? null;
}

describe('Le tableau de bord rend la couverture à qui tient le magasin', () => {
  it('le magasinier voit son article à surveiller, avec ses jours de couverture', async () => {
    const reponse = await appel(magasinier, { method: 'GET', url: '/api/tableau-de-bord' });
    assert.equal(reponse.statusCode, 200);
    const corps = reponse.json();

    assert.equal(corps.stocks.fenetre_consommation_jours, FENETRE);
    const vu = surveille(corps);
    assert.ok(vu, "l'article doit figurer parmi ceux à surveiller : c'est le défaut corrigé");
    assert.equal(vu.consommation_jour, 10, 'la consommation constatée est 900 sur 90 jours');
    assert.equal(vu.jours_couverture, 6, '60 en stock pour 10 par jour');
    assert.ok(vu.date_rupture_prevue, 'la date de rupture prévisible est nommée');
    assert.ok(
      corps.stocks.rupture_prevue_30_jours.valeur >= 1,
      'le compte des ruptures prévisibles ne peut plus valoir zéro',
    );
  });

  it('la logistique, de portée totale, lit exactement le même chiffre', async () => {
    const reponse = await appel(logistique, { method: 'GET', url: '/api/tableau-de-bord' });
    assert.equal(reponse.statusCode, 200);
    const vu = surveille(reponse.json());
    assert.ok(vu, "l'article doit être vu aussi en consolidation");
    assert.equal(vu.jours_couverture, 6, 'la portée ne change pas le chiffre, seulement le périmètre');
  });

  it("l'activité du journal se dit indisponible plutôt que de se taire à zéro", async () => {
    const propre = (await appel(magasinier, { method: 'GET', url: '/api/tableau-de-bord' })).json();
    assert.equal(propre.activite.disponible, false);
    assert.match(propre.activite.motif, /journal/i);
    assert.equal(propre.activite.total, 0);

    const totale = (await appel(logistique, { method: 'GET', url: '/api/tableau-de-bord' })).json();
    assert.equal(totale.activite.disponible, true);
    assert.equal(totale.activite.motif, null);
    assert.ok(totale.activite.total > 0, 'le journal consolidé n’est pas vide');
  });
});
