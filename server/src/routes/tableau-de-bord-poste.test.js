// tableau-de-bord-poste.test.js — Le poste de commande : six chiffres
// d'action, les totaux du patrimoine, la période, et la recette de RG-038.
//
// POURQUOI CE LOT. Le premier rang du tableau de bord annonçait « Biens au
// registre » et « Valeur d'acquisition » : deux inventaires, qui ne demandent
// aucune décision. Un poste de commande montre ce qui attend quelqu'un, pas ce
// que la maison possède. Le contrat `docs/LOT-POSTE-DE-COMMANDE.md` gèle donc
// six chiffres d'action, dans un ordre qui ne varie pas, et deux règles :
//
//   RG-038 — aucun chiffre n'est un cul-de-sac : il porte le lien de la liste
//            autorisée qui le compose, et ce lien mène quelque part.
//   RG-039 — une donnée qu'un profil n'a pas le droit de lire se dit
//            indisponible avec son motif ; elle ne s'affiche jamais en zéro.
//
// CE QUE CES ESSAIS MORDENT.
//
// 1. L'ordre et la forme : l'interface les consomme tels quels, sans jamais
//    les réordonner. Un libellé déplacé casse un écran sans rien lever.
// 2. Le chiffre 5 compte des articles **distincts**. La somme naïve
//    « rupture + sous critique + rupture prévue » compte deux fois l'article
//    qui est à la fois vide et à consommation connue — il est en rupture *et*
//    sa rupture est prévue sous 30 jours. Le jeu d'essai pose exprès deux
//    articles de ce genre, pour que la somme naïve soit strictement plus
//    grande que la vérité.
// 3. RG-038 est jouée en recette : pour chacun des six liens rendus, le
//    serveur est rappelé et doit répondre 200.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { CLE_PRIVILEGE, SESAME_PRIVILEGE, enPrivilegie, fermer } from '../db.js';
import { construireApp } from '../app.js';
import { arreterEcoute } from './_flux.js';
import { chiffre } from './tableau-de-bord.js';

process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

const MARQUE = 'ESSAI-POSTE-TDB';
const FENETRE = 90;

// L'ordre du contrat §2.1. Il ne varie pas : c'est la couture avec l'écran.
const LIBELLES = [
  'Décisions en attente',
  'Livraisons attendues',
  'Réceptions à compléter',
  'Paiements en attente',
  'Stock à risque',
  'Alertes actives',
];

const LIENS = [
  '/api/besoins?statut=vise',
  '/api/bons-commande?sans_pv=true',
  '/api/receptions?sans_certificat=true',
  '/api/bons-commande?attend_paiement=true',
  '/api/stocks?tri=criticite',
  '/api/alertes?nature=active',
];

// Les trois chiffres qui portent une file de la chaîne de la dépense. Pour eux,
// et pour eux seuls, le compte doit être **exactement** le total de la liste du
// lien. Le chiffre 1 reste borné à cent lignes (il agrège trois files nommées),
// et le lien du chiffre 5 ouvre tous les articles triés par criticité, non les
// seuls articles à risque : l'égalité n'a pas de sens pour ces deux-là.
const CHIFFRES_A_COUTURE = [1, 2, 3];

let serveur;
let logistique;   // portée totale
let magasinier;   // portée propre, et les articles de l'essai
let chefSgg;      // portée propre, une autre structure
let articleVide;
let articleCritique;
let bienSansValeur;
let bonLivreSansPv;            // statut `livre`, mais aucun PV : il attend sa réception
let bonReceptionneSansCertif;  // statut `receptionne`, PV dressé, certificat absent
let bonAvecCertificat;         // PV et certificat : il attend le marquage du paiement

const appel = (agent, options) => serveur.inject({
  ...options,
  headers: { ...(options.headers ?? {}), 'x-agent-id': agent.id },
});

const tableauDeBord = async (agent, url = '/api/tableau-de-bord') => {
  const reponse = await appel(agent, { method: 'GET', url });
  assert.equal(reponse.statusCode, 200, reponse.body);
  return reponse.json();
};

before(async () => {
  serveur = await construireApp({ servirWeb: false });
  await serveur.ready();

  await enPrivilegie(async (bd) => {
    logistique = await bd.un(
      `select a.id, a.nom from agent a join agent_role ar on ar.agent_id = a.id
        where ar.role_code = 'logistique' and a.actif order by a.nom limit 1`,
    );
    magasinier = await bd.un(
      `select a.id, a.nom, a.structure_id from agent_role ar
         join agent a on a.id = ar.agent_id
         join structure s on s.id = a.structure_id
        where ar.role_code = 'magasinier' and a.actif and s.regime = 'integre'
        order by a.nom limit 1`,
    );
    const sgg = await bd.un("select id from structure where code = 'SGG'");
    chefSgg = await bd.un(
      `select a.id, a.nom, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
        where ar.role_code = 'chef_structure' and a.structure_id = $1 and a.actif limit 1`,
      [sgg.id],
    );
    assert.ok(logistique && magasinier && chefSgg, 'les trois profils doivent exister');

    const site = await bd.un(
      'select id from site where structure_id = $1 order by nom limit 1',
      [magasinier.structure_id],
    );

    await bd.requete('delete from stock where designation like $1', [`${MARQUE}%`]);

    // Article 1 : quantité nulle **et** consommation connue. Il est en rupture
    // et sa rupture est prévue sous 30 jours : la somme naïve le compte deux
    // fois, le compte distinct une seule.
    articleVide = await bd.un(
      `insert into stock (categorie_code, structure_id, site_id, designation,
         unite, quantite, seuil_minimum, seuil_critique)
       values ('FOU-PAP', $1, $2, $3, 'ramette', 0, 200, 100) returning id`,
      [magasinier.structure_id, site.id, `${MARQUE} Ramettes épuisées`],
    );
    // Article 2 : sous le seuil critique **et** couverture courte. Même piège.
    articleCritique = await bd.un(
      `insert into stock (categorie_code, structure_id, site_id, designation,
         unite, quantite, seuil_minimum, seuil_critique)
       values ('FOU-PAP', $1, $2, $3, 'boîte', 20, 200, 100) returning id`,
      [magasinier.structure_id, site.id, `${MARQUE} Cartouches basses`],
    );

    for (const article of [articleVide, articleCritique]) {
      await bd.requete(
        `insert into journal (horodatage, agent_id, action, objet_type, objet_id, avant, apres)
         values (now() - interval '10 days', $1, 'sortie_stock', 'stock', $2, $3, $4)`,
        [
          magasinier.id, String(article.id),
          JSON.stringify({ quantite: 900 }),
          JSON.stringify({ quantite: 0, quantite_sortie: 900 }),
        ],
      );
    }

    // Un bien dont la valeur d'acquisition n'est pas documentée (§2.2).
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);
    bienSansValeur = await bd.un(
      `insert into bien (categorie_code, designation, classement, mode_entree,
         valeur_acquisition, valeur_acquisition_connue, date_acquisition, etat,
         structure_id, site_id, suivi, quantite)
       values ('MOB-BUR', $1, 'immobilisation', 'transfert', 0, false,
               current_date, 'bon', $2, $3, 'lot', 1)
       returning id`,
      [`${MARQUE} Bureau sans valeur connue`, magasinier.structure_id, site.id],
    );

    // --- Trois bons de commande qui font mordre la couture ----------------
    //
    // Le jeu de démonstration fait coïncider par hasard les anciennes et les
    // nouvelles définitions des chiffres 2 et 4 : il n'y a aucun bon `livre`
    // sans PV, et aucun bon `receptionne` sans certificat. Les trois bons
    // ci-dessous créent exactement ces deux cas, pour que l'essai distingue le
    // **statut déclaré** du bon du **constat** porté par les pièces.
    await bd.requete('delete from bon_commande where numero like $1', [`${MARQUE}%`]);
    await bd.requete('delete from dossier_achat where numero like $1', [`${MARQUE}%`]);
    await bd.requete('delete from etat_besoin where numero like $1', [`${MARQUE}%`]);

    const structure = { id: magasinier.structure_id };
    bonLivreSansPv = await chaineAchat(bd, structure, 'LIVRE-SANS-PV', {
      statut: 'livre', pv: false, certificat: false,
    });
    bonReceptionneSansCertif = await chaineAchat(bd, structure, 'RECU-SANS-CPC', {
      statut: 'receptionne', pv: true, certificat: false,
    });
    bonAvecCertificat = await chaineAchat(bd, structure, 'RECU-AVEC-CPC', {
      statut: 'receptionne', pv: true, certificat: true,
    });
  });
});

/**
 * Une chaîne d'achat posée au millimètre : le statut du bon d'un côté, les
 * pièces réellement dressées de l'autre. C'est leur **désaccord** qui est
 * l'objet des essais de couture.
 */
async function chaineAchat(bd, structure, suffixe, { statut, pv, certificat }) {
  const demandeur = await bd.un(
    'select id from agent where structure_id = $1 and actif order by nom limit 1',
    [structure.id],
  );
  const fournisseur = await bd.un(
    'select id from fournisseur where not liste_noire and actif order by denomination limit 1',
  );
  const besoin = await bd.un(
    `insert into etat_besoin (numero, structure_id, demandeur_id, statut, justification)
     values ($1, $2, $3, 'en_achat', $4) returning id`,
    [`${MARQUE}/EB/${suffixe}`, structure.id, demandeur.id, `Essai de couture — ${suffixe}`],
  );
  const dossier = await bd.un(
    `insert into dossier_achat (numero, etat_besoin_id, objet, montant_estime, procedure, statut)
     values ($1, $2, $3, 5000000, 'gre_a_gre', 'attribue') returning id`,
    [`${MARQUE}/DA/${suffixe}`, besoin.id, `${MARQUE} dossier ${suffixe}`],
  );
  const bon = await bd.un(
    `insert into bon_commande (numero, dossier_id, fournisseur_id, montant, statut, emis_le)
     values ($1, $2, $3, 5000000, $4, now() - interval '30 days')
     returning id, numero, statut`,
    [`${MARQUE}/BC/${suffixe}`, dossier.id, fournisseur.id, statut],
  );
  if (pv) {
    await bd.requete(
      `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
         signataire_id, signe_le, fige)
       values ('pv_reception', $1, $2, 'bon_commande', $3, '{"lignes":[]}'::jsonb, $4, now(), true)`,
      [`${MARQUE}/PV/${suffixe}`, structure.id, String(bon.id), demandeur.id],
    );
  }
  if (certificat) {
    await bd.requete(
      `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
         signataire_id, signe_le, fige)
       values ('certificat_prise_en_charge', $1, $2, 'bon_commande', $3, '{}'::jsonb, $4, now(), true)`,
      [`${MARQUE}/CPC/${suffixe}`, structure.id, String(bon.id), demandeur.id],
    );
  }
  return bon;
}

after(async () => {
  arreterEcoute();
  if (serveur) await serveur.close();
  await enPrivilegie(async (bd) => {
    for (const article of [articleVide, articleCritique].filter(Boolean)) {
      await bd.requete(
        "delete from journal where objet_type = 'stock' and objet_id = $1", [String(article.id)],
      );
      await bd.requete('delete from alerte where objet_id = $1', [String(article.id)]);
    }
    await bd.requete('delete from stock where designation like $1', [`${MARQUE}%`]);
    if (bienSansValeur) await bd.requete('delete from mouvement where bien_id = $1', [bienSansValeur.id]);
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);
    await bd.requete('delete from document where numero like $1', [`${MARQUE}%`]);
    await bd.requete('delete from bon_commande where numero like $1', [`${MARQUE}%`]);
    await bd.requete('delete from dossier_achat where numero like $1', [`${MARQUE}%`]);
    await bd.requete('delete from etat_besoin where numero like $1', [`${MARQUE}%`]);
  });
  await fermer();
});

/** Le `total` que rend le lien d'un chiffre, lu par le même agent. */
async function totalDuLien(agent, lien) {
  const separateur = lien.includes('?') ? '&' : '?';
  const reponse = await appel(agent, { method: 'GET', url: `${lien}${separateur}parPage=1` });
  assert.equal(reponse.statusCode, 200, `${lien} : ${reponse.body}`);
  return reponse.json().total;
}

// --- La forme, qui est la couture avec l'écran -------------------------------

describe("Les six chiffres d'action, dans la forme gelée du contrat", () => {
  it("rend six chiffres, dans l'ordre du contrat et dans sa forme", async () => {
    const corps = await tableauDeBord(logistique);
    const tete = corps.chiffres_de_tete;
    assert.equal(tete.length, 6, 'six chiffres, pas cinq ni sept');
    assert.deepEqual(tete.map((c) => c.libelle), LIBELLES);
    assert.deepEqual(tete.map((c) => c.lien), LIENS);
    for (const c of tete) {
      assert.deepEqual(
        Object.keys(c).sort(),
        ['appui', 'disponible', 'libelle', 'lien', 'motif', 'valeur'],
        'la forme est gelée : ni champ en moins, ni champ en plus',
      );
      assert.equal(typeof c.disponible, 'boolean');
    }
  });

  it("les inventaires ont quitté le premier rang", async () => {
    const tete = (await tableauDeBord(logistique)).chiffres_de_tete;
    const libelles = tete.map((c) => c.libelle);
    for (const parti of ['Biens au registre', "Valeur d'acquisition (FC)", 'Articles sous seuil']) {
      assert.ok(!libelles.includes(parti), `« ${parti} » descend du premier rang`);
    }
    assert.ok(
      !libelles.some((l) => l.includes('réemploi')),
      'le réemploi rejoint un bloc de contexte, il reste lisible dans `reemploi`',
    );
  });

  it("RG-039 — un chiffre indisponible vaut `null` et porte son motif, jamais zéro", async () => {
    for (const agent of [logistique, magasinier, chefSgg]) {
      for (const c of (await tableauDeBord(agent)).chiffres_de_tete) {
        if (c.disponible) {
          assert.equal(typeof c.valeur, 'number', `${c.libelle} : une valeur lisible est un nombre`);
          assert.ok(Number.isInteger(c.valeur), `${c.libelle} : c'est un entier`);
          assert.equal(c.motif, null, `${c.libelle} : disponible, donc pas de motif`);
        } else {
          assert.equal(c.valeur, null, `${c.libelle} : indisponible, donc jamais zéro`);
          assert.ok(c.motif && c.motif.length > 5, `${c.libelle} : le motif est dit`);
        }
      }
    }
  });

  it('RG-039 au montage : le constructeur refuse le zéro muet et le chiffre sans lien', () => {
    const indisponible = chiffre({
      libelle: 'Essai', valeur: 0, lien: '/api/biens',
      disponible: false, motif: 'Votre profil ne lit pas cette donnée.',
    });
    assert.equal(indisponible.valeur, null, 'le zéro passé est effacé : il se lirait comme un calme');
    assert.match(indisponible.motif, /profil/);

    const calculNonAbouti = chiffre({ libelle: 'Essai', valeur: null, lien: '/api/biens' });
    assert.equal(calculNonAbouti.disponible, false);
    assert.equal(calculNonAbouti.valeur, null);
    assert.ok(calculNonAbouti.motif, 'un calcul qui n’a pas abouti se dit, il ne vaut pas zéro');

    assert.throws(
      () => chiffre({ libelle: 'Essai sans lien', valeur: 3, lien: null }),
      /RG-038/,
      'RG-038 est refusée au montage, pas découverte à l’écran',
    );
  });
});

// --- Ce que chaque chiffre compte -------------------------------------------

describe('Ce que chaque chiffre compte, et rien d’autre', () => {
  it('1 — les décisions en attente, avec leur ancienneté en appui', async () => {
    const corps = await tableauDeBord(logistique);
    const c = corps.chiffres_de_tete[0];
    assert.equal(c.valeur, corps.en_attente_de_decision.total);
    assert.match(c.appui, new RegExp(`^${corps.en_attente_de_decision.au_dela_de_7_jours} au-delà de 7 jours$`));
  });

  it("2 — les bons dont le PV manque, et non les statuts qu'ils déclarent", async () => {
    const corps = await tableauDeBord(logistique);
    const c = corps.chiffres_de_tete[1];
    const attendu = await enPrivilegie((bd) => bd.un(
      `select count(*) filter (where bc.statut <> 'annule'
                and not exists (select 1 from document pv
                                 where pv.type = 'pv_reception'
                                   and pv.objet_type = 'bon_commande'
                                   and pv.objet_id = bc.id::text))::int as sans_pv,
              count(*) filter (where bc.statut in ('emis', 'accepte', 'livre_partiel'))::int as ancienne_definition,
              count(*) filter (where bc.statut = 'livre_partiel')::int as partielles
         from bon_commande bc`,
    ));
    assert.equal(c.valeur, attendu.sans_pv, 'le constat du PV, non le statut déclaré');
    assert.equal(c.appui, `${attendu.partielles} partielle(s)`);

    // La bite : le bon `livre` sans PV attend sa réception et l'ancienne
    // définition l'ignorait. Les deux comptes diffèrent donc réellement.
    assert.ok(
      attendu.sans_pv > attendu.ancienne_definition,
      `le bon « ${bonLivreSansPv.numero} » est livré sans PV : l'ancienne définition le manquait`,
    );
  });

  it('3 — les réceptions à compléter : un compte, pas une longueur de tableau', async () => {
    const corps = await tableauDeBord(logistique);
    const c = corps.chiffres_de_tete[2];
    const attendu = await enPrivilegie((bd) => bd.un(
      `select count(*)::int as n from document d
        where d.type = 'pv_reception'
          and not exists (select 1 from document cc
                           where cc.type = 'certificat_prise_en_charge'
                             and cc.objet_type = d.objet_type and cc.objet_id = d.objet_id)`,
    ));
    assert.equal(c.valeur, attendu.n, 'aucun plafond à cent : c’est un compte');
    assert.ok(attendu.n >= 2, 'le PV sans certificat de l’essai en est un');
  });

  it("4 — le certificat émis, et non le statut `receptionne` du bon", async () => {
    const corps = await tableauDeBord(logistique);
    const c = corps.chiffres_de_tete[3];
    const attendu = await enPrivilegie((bd) => bd.un(
      `select count(*) filter (where bc.statut not in ('payable', 'paye', 'annule')
                and exists (select 1 from document cc
                             where cc.type = 'certificat_prise_en_charge'
                               and cc.objet_type = 'bon_commande'
                               and cc.objet_id = bc.id::text))::int as attend_paiement,
              count(*) filter (where bc.statut = 'receptionne')::int as receptionne
         from bon_commande bc`,
    ));
    assert.equal(c.valeur, attendu.attend_paiement);

    // Les deux comptes ne sont pas le même prédicat, et le jeu d'essai le
    // montre : un bon `receptionne` dont le certificat n'est pas émis attend le
    // comptable des matières, pas le comptable public — RG-011 interdit
    // précisément de marquer son paiement possible.
    assert.notEqual(
      attendu.attend_paiement, attendu.receptionne,
      `le bon « ${bonReceptionneSansCertif.numero} » est reçu sans certificat : « statut=receptionne » mentirait`,
    );
  });

  it("5 — des articles **distincts** : la somme naïve en compterait deux fois", async () => {
    const corps = await tableauDeBord(magasinier);
    const c = corps.chiffres_de_tete[4];
    const s = corps.stocks;
    const naive = s.en_rupture.valeur + s.sous_seuil_critique.valeur + s.rupture_prevue_30_jours.valeur;

    assert.ok(s.en_rupture.valeur >= 1, "l'article vide doit compter en rupture");
    assert.ok(
      s.rupture_prevue_30_jours.valeur >= 2,
      'les deux articles de l’essai ont une couverture courte',
    );
    assert.ok(
      c.valeur < naive,
      `le compte distinct (${c.valeur}) doit être strictement inférieur à la somme naïve (${naive})`,
    );
    assert.ok(c.valeur >= 2, 'les deux articles de l’essai y sont, une fois chacun');
    assert.equal(c.appui, `dont ${s.en_rupture.valeur} en rupture`);
    assert.equal(corps.stocks.fenetre_consommation_jours, FENETRE);
  });

  it('6 — les alertes actives, et non les alertes à classer', async () => {
    const corps = await tableauDeBord(logistique);
    assert.equal(corps.chiffres_de_tete[5].valeur, corps.alertes.actives);
  });
});

// --- La recette de RG-038 ---------------------------------------------------

describe('RG-038 — aucune carte ne mène à une impasse', () => {
  it('les six liens rendus répondent 200, pour chaque profil', async () => {
    for (const agent of [logistique, magasinier, chefSgg]) {
      const corps = await tableauDeBord(agent);
      for (const c of corps.chiffres_de_tete) {
        assert.ok(c.lien, `${c.libelle} porte un lien`);
        const reponse = await appel(agent, { method: 'GET', url: c.lien });
        assert.equal(
          reponse.statusCode, 200,
          `${agent.nom} — ${c.libelle} → ${c.lien} : ${reponse.statusCode} ${reponse.body}`,
        );
      }
    }
  });

  it("la couture : le chiffre est exactement le total de la liste qu'il porte", async () => {
    // C'est la seule formulation de RG-038 qui attrape un lien qui **mente** :
    // un lien peut répondre 200 et ouvrir une liste qui n'a rien à voir avec le
    // chiffre. C'était le cas de « Livraisons attendues » et « Paiements en
    // attente », dont les liens `?statut=…` ouvraient l'écran des dossiers
    // d'achat, dont le statut ne désigne pas la même chose.
    for (const agent of [logistique, magasinier, chefSgg]) {
      const corps = await tableauDeBord(agent);
      for (const rang of CHIFFRES_A_COUTURE) {
        const c = corps.chiffres_de_tete[rang];
        assert.equal(
          c.valeur, await totalDuLien(agent, c.lien),
          `${agent.nom} — « ${c.libelle} » annonce ${c.valeur} : sa liste doit en rendre autant`,
        );
      }
    }
  });

  it('les liens des totaux du patrimoine et des blocs mènent aussi quelque part', async () => {
    const corps = await tableauDeBord(logistique);
    for (const lien of [
      corps.patrimoine.totaux.lien,
      corps.en_attente_de_decision.lien,
      corps.reemploi.lien,
      corps.achats.ecarts.lien,
    ]) {
      const reponse = await appel(logistique, { method: 'GET', url: lien });
      assert.equal(reponse.statusCode, 200, `${lien} : ${reponse.body}`);
    }
  });
});

// --- Les totaux du patrimoine et la période ---------------------------------

describe('Les totaux du patrimoine (§2.2)', () => {
  it('rend les biens, la valeur et le nombre de valeurs non documentées', async () => {
    const corps = await tableauDeBord(logistique);
    const t = corps.patrimoine.totaux;
    assert.deepEqual(
      Object.keys(t).sort(),
      ['biens', 'biens_valeur_non_documentee', 'lien', 'valeur_acquisition'],
    );
    assert.equal(t.lien, '/api/biens');

    const attendu = await enPrivilegie((bd) => bd.un(
      `select count(*)::int as biens,
              coalesce(sum(valeur_acquisition), 0) as valeur,
              count(*) filter (where not valeur_acquisition_connue)::int as non_documentee
         from bien`,
    ));
    assert.equal(t.biens, attendu.biens);
    assert.equal(Number(t.valeur_acquisition), Number(attendu.valeur));
    assert.equal(
      t.biens_valeur_non_documentee, attendu.non_documentee,
      'le total d’une valeur partielle ne doit pas se lire comme un inventaire valorisé',
    );
    assert.ok(t.biens_valeur_non_documentee >= 1, 'le bien de l’essai en est un');
  });

  it('les totaux restent bornés au périmètre du lecteur', async () => {
    const totale = (await tableauDeBord(logistique)).patrimoine.totaux;
    const propre = (await tableauDeBord(chefSgg)).patrimoine.totaux;
    assert.ok(totale.biens > propre.biens, 'la portée totale lit strictement plus de biens');
  });
});

describe('La période (§2.3)', () => {
  it('rend la fenêtre demandée, libellée, au premier niveau', async () => {
    const corps = await tableauDeBord(logistique);
    assert.deepEqual(corps.periode, { jours: 7, libelle: '7 derniers jours' });
    assert.ok(corps.horodatage, "l'heure d'actualisation ne change pas");

    const trente = await tableauDeBord(logistique, '/api/tableau-de-bord?jours=30');
    assert.deepEqual(trente.periode, { jours: 30, libelle: '30 derniers jours' });
    assert.equal(trente.activite.jours, 30, 'la période est bien celle de l’activité');

    const un = await tableauDeBord(logistique, '/api/tableau-de-bord?jours=1');
    assert.equal(un.periode.libelle, 'dernier jour', 'le singulier se dit en français');
  });
});

// --- Le filtre qui fait que le chiffre 3 mène quelque part ------------------

describe("Les filtres d'étape des bons de commande", () => {
  const numeros = async (agent, url) => {
    const reponse = await appel(agent, { method: 'GET', url: `${url}&parPage=200` });
    assert.equal(reponse.statusCode, 200, reponse.body);
    return reponse.json().donnees.map((b) => b.numero);
  };

  it('`sans_pv=true` ne rend que les bons dont le PV de réception manque', async () => {
    const vus = await numeros(logistique, '/api/bons-commande?sans_pv=true');
    assert.ok(
      vus.includes(bonLivreSansPv.numero),
      'un bon `livre` sans PV attend bien sa réception : c’est tout l’objet du filtre',
    );
    assert.ok(!vus.includes(bonReceptionneSansCertif.numero), 'celui-là porte son PV');
    assert.ok(!vus.includes(bonAvecCertificat.numero));
  });

  it('`sans_pv=false` rend exactement les autres, et les deux moitiés font le tout', async () => {
    const sans = await totalDuLien(logistique, '/api/bons-commande?sans_pv=true');
    const avec = await totalDuLien(logistique, '/api/bons-commande?sans_pv=false');
    const tous = await totalDuLien(logistique, '/api/bons-commande');
    assert.equal(sans + avec, tous, 'la négation porte sur le prédicat entier, pas sur son dernier membre');
    const vus = await numeros(logistique, '/api/bons-commande?sans_pv=false');
    assert.ok(vus.includes(bonReceptionneSansCertif.numero));
  });

  it('`attend_paiement=true` exige le certificat, et non le statut `receptionne`', async () => {
    const vus = await numeros(logistique, '/api/bons-commande?attend_paiement=true');
    assert.ok(
      vus.includes(bonAvecCertificat.numero),
      'son certificat est émis et son paiement n’est pas marqué',
    );
    assert.ok(
      !vus.includes(bonReceptionneSansCertif.numero),
      'reçu mais non certifié : RG-011 interdit de marquer son paiement possible',
    );
    const parStatut = await numeros(logistique, '/api/bons-commande?statut=receptionne');
    assert.ok(
      parStatut.includes(bonReceptionneSansCertif.numero),
      '« statut=receptionne » l’inclut, lui : les deux filtres ne sont pas le même',
    );
  });

  it('`attend_paiement=false` rend exactement les autres', async () => {
    const oui = await totalDuLien(logistique, '/api/bons-commande?attend_paiement=true');
    const non = await totalDuLien(logistique, '/api/bons-commande?attend_paiement=false');
    const tous = await totalDuLien(logistique, '/api/bons-commande');
    assert.equal(oui + non, tous, 'les deux moitiés font le tout');
  });

  it('les deux filtres restent bornés au périmètre du lecteur', async () => {
    for (const filtre of ['sans_pv=true', 'attend_paiement=true']) {
      const totale = await totalDuLien(logistique, `/api/bons-commande?${filtre}`);
      const propre = await totalDuLien(chefSgg, `/api/bons-commande?${filtre}`);
      assert.ok(
        propre <= totale,
        `${filtre} — un chef de structure ne voit pas plus de bons que la consolidation`,
      );
    }
    // Et les bons de l'essai, posés dans une autre structure, restent dehors.
    const vus = await numeros(chefSgg, '/api/bons-commande?sans_pv=true');
    assert.ok(!vus.includes(bonLivreSansPv.numero), 'le filtre ne perce pas le cloisonnement');
  });
});

describe('Le filtre `sans_certificat` des réceptions (§D)', () => {
  it('ne rend que les PV sans certificat de prise en charge', async () => {
    const reponse = await appel(logistique, {
      method: 'GET', url: '/api/receptions?sans_certificat=true&parPage=100',
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const corps = reponse.json();
    assert.ok(corps.total >= 1, 'le jeu de démonstration doit en porter au moins un');
    for (const pv of corps.donnees) {
      assert.equal(pv.pris_en_charge, false, 'aucun PV déjà pris en charge dans cette liste');
    }
  });

  it('`sans_certificat=false` rend exactement les autres', async () => {
    const avec = await appel(logistique, {
      method: 'GET', url: '/api/receptions?sans_certificat=false&parPage=1',
    });
    const sans = await appel(logistique, {
      method: 'GET', url: '/api/receptions?sans_certificat=true&parPage=1',
    });
    const tous = await appel(logistique, { method: 'GET', url: '/api/receptions?parPage=1' });
    assert.equal(avec.statusCode, 200, avec.body);
    assert.equal(
      avec.json().total + sans.json().total, tous.json().total,
      'les deux moitiés font le tout : le filtre ne perd personne',
    );
    for (const pv of avec.json().donnees) assert.equal(pv.pris_en_charge, true);
  });

  it('le filtre reste borné au périmètre du lecteur', async () => {
    const totale = await appel(logistique, {
      method: 'GET', url: '/api/receptions?sans_certificat=true&parPage=1',
    });
    const propre = await appel(chefSgg, {
      method: 'GET', url: '/api/receptions?sans_certificat=true&parPage=1',
    });
    assert.equal(propre.statusCode, 200, propre.body);
    assert.ok(
      propre.json().total <= totale.json().total,
      'un chef de structure ne voit pas plus de PV que la consolidation',
    );
  });
});
