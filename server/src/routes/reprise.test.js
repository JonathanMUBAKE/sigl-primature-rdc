// reprise.test.js — La reprise des inventaires existants, éprouvée.
//
// CE QUE CE FICHIER PROUVE, ET DANS QUEL ORDRE.
//
//   1. La lecture du fichier, sans base : une colonne inconnue fait refuser le
//      fichier entier **en la nommant**, une colonne obligatoire manquante de
//      même, et l'ordre des colonnes est libre. C'est la moitié du lot : un
//      rejet muet renvoie l'agent à comparer deux listes à la main.
//   2. Le verdict d'une ligne nomme sa colonne. Chaque motif est éprouvé
//      séparément, parce qu'un motif juste au mauvais endroit est un motif
//      faux.
//   3. RG-034 : le dépôt analyse et n'écrit aucun bien. Vérifié en comptant le
//      registre avant et après, pas en lisant la réponse.
//   4. L'application conserve les immatriculations portées par le fichier, et
//      n'en génère que pour les biens qui n'en avaient pas. C'est le point qui
//      décide de l'adoption : si le SIGL renumérote, les étiquettes collées
//      sur les armoires ne correspondent plus à rien.
//   5. RG-035 : redéposer le même fichier ne crée rien et n'écrase rien.
//   6. RG-036 : une reprise ne s'applique qu'une fois — par la route, puis en
//      base sous le rôle non privilégié, car c'est l'erreur dont on ne revient
//      pas (rien ne distingue ensuite le doublon de l'original).
//   7. Une valeur d'acquisition absente crée un bien marqué « non
//      documentée », et non un bien à zéro franc.
//   8. RG-037 / RG-017 : une reprise ne se lit pas d'une autre structure.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { CLE_PRIVILEGE, SESAME_PRIVILEGE, enPrivilegie, fermer, transaction } from '../db.js';
import { construireApp } from '../app.js';
import { arreterEcoute } from './_flux.js';
import { lireFichier, normaliserDate, normaliserMontant, verdictDeLigne } from './reprise.js';

process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

const MARQUE = 'ESSAI-REPRISE';

let serveur;
let cgig;          // CGIG — structure intégrée
let comptable;     // comptable des matières de la CGIG : tient l'inventaire
let chefSgg;       // chef d'une structure sœur : ne doit rien voir
let site;          // un site de la CGIG, désigné par son nom
let categorie;     // un code de la nomenclature, classement immobilisation
let reprise;       // la reprise d'essai, créée par la route

const appel = (agent, options) => serveur.inject({
  ...options,
  headers: { ...(options.headers ?? {}), 'x-agent-id': agent.id },
});

/** Combien de biens porte la CGIG, lu par le chemin privilégié. */
async function nombreDeBiens() {
  return enPrivilegie(async (bd) => {
    const ligne = await bd.un(
      'select count(*)::int as n from bien where structure_id = $1', [cgig.id],
    );
    return ligne.n;
  });
}

before(async () => {
  await enPrivilegie(async (bd) => {
    cgig = await bd.un("select id, code from structure where code = 'CGIG'");
    const sgg = await bd.un("select id from structure where code = 'SGG'");

    const parRole = (role, structureId) => bd.un(
      `select a.id, a.nom, a.email, a.structure_id from agent a
         join agent_role ar on ar.agent_id = a.id
        where ar.role_code = $1 and a.structure_id = $2 and a.actif
        order by a.nom limit 1`,
      [role, structureId],
    );
    comptable = await parRole('comptable_matieres', cgig.id);
    chefSgg = await parRole('chef_structure', sgg.id);

    site = await bd.un(
      'select id, nom from site where structure_id = $1 and actif order by nom limit 1',
      [cgig.id],
    );
    categorie = await bd.un(
      "select code, libelle from categorie where classement = 'immobilisation' and actif order by code limit 1",
    );
  });

  assert.ok(comptable, 'le jeu de démonstration doit porter un comptable des matières à la CGIG');
  assert.ok(chefSgg, 'il faut un chef de structure au SGG');
  assert.ok(site, 'il faut un site à la CGIG');
  assert.ok(categorie, 'il faut une catégorie immobilisation à la nomenclature');

  serveur = await construireApp({ servirWeb: false });
  await serveur.ready();
});

after(async () => {
  await arreterEcoute();
  await serveur?.close();
  await enPrivilegie(async (bd) => {
    const reprises = await bd.tous('select id from reprise where fichier_nom like $1', [`${MARQUE}%`]);
    for (const r of reprises) {
      await bd.requete('delete from reprise_ligne where reprise_id = $1', [r.id]);
    }
    await bd.requete('delete from bien where designation like $1', [`${MARQUE}%`]);
    await bd.requete('delete from reprise where fichier_nom like $1', [`${MARQUE}%`]);
    await bd.requete("delete from journal where objet_type = 'reprise'");
  });
  await fermer();
});

// ---------------------------------------------------------------------------
// 1. La lecture du fichier, sans base.
// ---------------------------------------------------------------------------
describe('Le fichier déposé se lit, ou se refuse en nommant la colonne', () => {
  it('une colonne inconnue fait refuser le fichier entier, et elle est nommée', () => {
    const lu = lireFichier('designation;categorie;date_acquisition;valeur_dentree\nA;INF;2020-01-01;5\n');
    assert.ok(lu.erreur, 'le fichier doit être refusé');
    assert.match(lu.erreur.message, /valeur_dentree/,
      "le refus doit nommer la colonne inconnue : une colonne mal orthographiée est une donnée perdue en silence");
    assert.equal(lu.erreur.champ, 'valeur_dentree');
  });

  it('une colonne obligatoire manquante est nommée, elle aussi', () => {
    const lu = lireFichier('designation;date_acquisition\nA;2020-01-01\n');
    assert.ok(lu.erreur);
    assert.match(lu.erreur.message, /categorie/);
    assert.equal(lu.erreur.champ, 'categorie');
  });

  it("l'ordre des colonnes est libre, et l'en-tête se lit sans égard à la casse", () => {
    const lu = lireFichier('Date_Acquisition;DESIGNATION;categorie\n2020-01-01;Armoire;INF\n');
    assert.equal(lu.erreur, null, JSON.stringify(lu.erreur));
    assert.equal(lu.lignes.length, 1);
    assert.equal(lu.lignes[0].valeurs.designation, 'Armoire');
    assert.equal(lu.lignes[0].valeurs.categorie, 'INF');
  });

  it('le numéro de ligne est celui du fichier, en-tête comprise', () => {
    const lu = lireFichier('designation;categorie;date_acquisition\nA;INF;2020-01-01\nB;INF;2020-01-02\n');
    assert.deepEqual(lu.lignes.map((l) => l.numero_ligne), [2, 3],
      "l'agent cherche la ligne 2 dans son tableur, pas la ligne 1");
  });

  it('un fichier vide, ou réduit à son en-tête, se dit tel quel', () => {
    assert.match(lireFichier('').erreur.message, /vide/i);
    const sansLigne = lireFichier('designation;categorie;date_acquisition\n');
    assert.ok(sansLigne.erreur, 'un en-tête seul ne porte aucune donnée');
    assert.match(sansLigne.erreur.message, /aucune ligne/i);
  });

  it('une colonne répétée est refusée : on ne devine pas laquelle compte', () => {
    const lu = lireFichier('designation;categorie;designation;date_acquisition\nA;INF;B;2020-01-01\n');
    assert.ok(lu.erreur);
    assert.equal(lu.erreur.champ, 'designation');
  });

  it('les deux écritures de date sont admises, et le reste est refusé', () => {
    assert.equal(normaliserDate('2020-03-07'), '2020-03-07');
    assert.equal(normaliserDate('07/03/2020'), '2020-03-07');
    assert.equal(normaliserDate('7/3/2020'), '2020-03-07');
    assert.equal(normaliserDate('2020-13-01'), null, 'un treizième mois n’existe pas');
    assert.equal(normaliserDate('mars 2020'), null);
    assert.equal(normaliserDate(''), null);
  });

  it('un montant se lit avec les espaces et la virgule du français', () => {
    assert.equal(normaliserMontant('1 250 000,50'), 1_250_000.5);
    assert.equal(normaliserMontant('1250000.50'), 1_250_000.5);
    assert.equal(normaliserMontant(''), null, 'une valeur absente reste absente, et ne vaut pas zéro');
    assert.ok(Number.isNaN(normaliserMontant('environ un million')));
  });
});

// ---------------------------------------------------------------------------
// 2. Le verdict d'une ligne nomme sa colonne.
// ---------------------------------------------------------------------------
describe('Le verdict d’une ligne dit où regarder', () => {
  const contexte = () => ({
    categories: new Map([['INF', { code: 'INF', classement: 'immobilisation' }]]),
    sites: new Map([['magasin central', 'site-1']]),
    agents: new Map([['a@primature.cd', 'agent-1']]),
    immatriculationsExistantes: new Set(['BRT-CGIG-INF-00001']),
    seriesExistantes: new Set(['SN-DEJA-LA']),
    empreintesExistantes: new Set(['armoire deja la|INF|2019-05-05|']),
    immatriculationsDuFichier: new Map(),
    seriesDuFichier: new Map(),
    empreintesDuFichier: new Map(),
  });
  const base = { designation: 'Armoire', categorie: 'INF', date_acquisition: '2020-01-01' };

  it('une ligne complète est à créer', () => {
    const v = verdictDeLigne({ ...base }, contexte());
    assert.equal(v.verdict, 'a_creer', v.motif);
  });

  it('une désignation vide se refuse en nommant sa colonne', () => {
    const v = verdictDeLigne({ ...base, designation: '   ' }, contexte());
    assert.equal(v.verdict, 'rejetee');
    assert.equal(v.colonne, 'designation');
  });

  it('une catégorie hors nomenclature se refuse, et le motif cite le code lu', () => {
    const v = verdictDeLigne({ ...base, categorie: 'ZZZ' }, contexte());
    assert.equal(v.verdict, 'rejetee');
    assert.equal(v.colonne, 'categorie');
    assert.match(v.motif, /ZZZ/);
  });

  it('une date illisible se refuse en nommant la colonne de date', () => {
    const v = verdictDeLigne({ ...base, date_acquisition: 'l’an dernier' }, contexte());
    assert.equal(v.verdict, 'rejetee');
    assert.equal(v.colonne, 'date_acquisition');
  });

  it('un site inconnu de la structure se refuse, et ne se crée pas au passage', () => {
    const v = verdictDeLigne({ ...base, site: 'Sous-sol B' }, contexte());
    assert.equal(v.verdict, 'rejetee');
    assert.equal(v.colonne, 'site');
  });

  it('un détenteur introuvable se refuse plutôt que de se deviner par le nom', () => {
    const v = verdictDeLigne({ ...base, detenteur_email: 'inconnu@primature.cd' }, contexte());
    assert.equal(v.verdict, 'rejetee');
    assert.equal(v.colonne, 'detenteur_email');
  });

  it('RG-021 — un lot ne porte pas d’immatriculation individuelle', () => {
    const v = verdictDeLigne(
      { ...base, suivi: 'lot', quantite: '12', immatriculation: 'X-1' }, contexte(),
    );
    assert.equal(v.verdict, 'rejetee');
    assert.equal(v.colonne, 'immatriculation');
    assert.match(v.motif, /RG-021/);
  });

  it('RG-035 — une immatriculation déjà au registre est un doublon, pas un rejet', () => {
    const v = verdictDeLigne({ ...base, immatriculation: 'BRT-CGIG-INF-00001' }, contexte());
    assert.equal(v.verdict, 'doublon');
    assert.equal(v.colonne, 'immatriculation');
    assert.match(v.motif, /registre/i);
  });

  it('RG-035 — un numéro de série déjà au registre est un doublon', () => {
    const v = verdictDeLigne({ ...base, numero_serie: 'SN-DEJA-LA' }, contexte());
    assert.equal(v.verdict, 'doublon');
    assert.equal(v.colonne, 'numero_serie');
  });

  it('deux lignes du même fichier portant la même identité : la seconde est un doublon', () => {
    const ctx = contexte();
    const premiere = verdictDeLigne({ ...base, numero_serie: 'SN-NEUF' }, ctx, 2);
    assert.equal(premiere.verdict, 'a_creer');
    const seconde = verdictDeLigne({ ...base, numero_serie: 'SN-NEUF' }, ctx, 7);
    assert.equal(seconde.verdict, 'doublon');
    assert.match(seconde.motif, /ligne 2/,
      'le motif doit dire à quelle ligne du même fichier se trouve l’original');
  });

  it('RG-035 — sans identité propre, un bien déjà au registre se présume en doublon', () => {
    // Une ligne sans immatriculation ni numéro de série n'a rien par quoi se
    // reconnaître : redéposer le fichier la recréerait, et la reprise
    // rejouable ne tiendrait plus sa promesse.
    const v = verdictDeLigne(
      { designation: 'Armoire déjà là', categorie: 'INF', date_acquisition: '05/05/2019' },
      contexte(),
    );
    assert.equal(v.verdict, 'doublon');
    assert.equal(v.colonne, 'designation');
    assert.match(v.motif, /immatriculation|numéro de série/,
      'le motif doit dire comment faire passer un vrai second exemplaire');
  });

  it('deux lignes identiques sans identité : la seconde se présume en doublon', () => {
    const ctx = contexte();
    const base2 = { designation: 'Chaise visiteur', categorie: 'INF', date_acquisition: '2021-02-02' };
    assert.equal(verdictDeLigne({ ...base2 }, ctx, 4).verdict, 'a_creer');
    const seconde = verdictDeLigne({ ...base2 }, ctx, 9);
    assert.equal(seconde.verdict, 'doublon');
    assert.match(seconde.motif, /ligne 4/);
  });

  it('mais un second exemplaire nommément identifié passe', () => {
    const ctx = contexte();
    const base2 = { designation: 'Chaise visiteur', categorie: 'INF', date_acquisition: '2021-02-02' };
    assert.equal(verdictDeLigne({ ...base2 }, ctx, 4).verdict, 'a_creer');
    const seconde = verdictDeLigne({ ...base2, numero_serie: 'SN-2' }, ctx, 9);
    assert.equal(seconde.verdict, 'a_creer',
      'une identité propre lève la présomption : c’est la sortie offerte par le motif');
  });

  it('un doublon prime sur un défaut de forme : il n’y a plus rien à corriger', () => {
    // Une ligne déjà au registre et par ailleurs mal remplie n'a pas besoin
    // d'être corrigée : elle ne sera pas créée de toute façon.
    const v = verdictDeLigne(
      { ...base, categorie: 'ZZZ', immatriculation: 'BRT-CGIG-INF-00001' }, contexte(),
    );
    assert.equal(v.verdict, 'doublon');
  });
});

// ---------------------------------------------------------------------------
// 3 à 8. Le circuit, par les routes.
// ---------------------------------------------------------------------------
describe('La reprise analyse d’abord, et n’écrit que sur décision', () => {
  const fichier = () => [
    'immatriculation;designation;categorie;date_acquisition;valeur_acquisition;site;etat',
    // 2 — complète, avec l'immatriculation de l'inventaire existant
    `INV/CGIG/1998/0042;${MARQUE} Armoire métallique;${categorie.code};12/04/1998;450000;${site.nom};bon`,
    // 3 — sans immatriculation : le SIGL en génère une
    `;${MARQUE} Bureau en bois;${categorie.code};2005-09-01;;${site.nom};a_reparer`,
    // 4 — catégorie hors nomenclature : refusée
    `;${MARQUE} Ventilateur;ZZZ-INCONNUE;2010-01-01;80000;;bon`,
    // 5 — date illisible : refusée
    `;${MARQUE} Chaise;${categorie.code};l’an dernier;15000;;bon`,
  ].join('\n');

  it('RG-034 — le dépôt rend un rapport et ne crée aucun bien', async () => {
    const avant = await nombreDeBiens();
    const reponse = await appel(comptable, {
      method: 'POST',
      url: '/api/reprises',
      payload: { fichier_nom: `${MARQUE}-inventaire-1998.csv`, contenu: fichier() },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    reprise = reponse.json();

    assert.equal(await nombreDeBiens(), avant,
      'le dépôt analyse : le registre ne doit pas avoir bougé d’une ligne');
    assert.equal(reprise.statut, 'analysee');
    assert.ok(reprise.numero?.startsWith('REP-'), reprise.numero);
    assert.equal(reprise.lignes_total, 4);
    assert.deepEqual(reprise.resume, { a_creer: 2, doublon: 0, rejetee: 2, creee: 0 });
  });

  it('le rapport nomme la ligne, le verdict, le motif et la colonne', async () => {
    const reponse = await appel(comptable, { url: `/api/reprises/${reprise.id}/lignes` });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const lignes = reponse.json().donnees;
    assert.equal(lignes.length, 4);

    const parNumero = new Map(lignes.map((l) => [l.numero_ligne, l]));
    assert.equal(parNumero.get(2).verdict, 'a_creer');
    assert.equal(parNumero.get(3).verdict, 'a_creer');

    const categorieFausse = parNumero.get(4);
    assert.equal(categorieFausse.verdict, 'rejetee');
    assert.equal(categorieFausse.colonne, 'categorie');
    assert.match(categorieFausse.motif, /ZZZ-INCONNUE/);

    const dateFausse = parNumero.get(5);
    assert.equal(dateFausse.verdict, 'rejetee');
    assert.equal(dateFausse.colonne, 'date_acquisition');

    // La ligne refusée garde ce que l'agent avait écrit : il doit pouvoir le
    // relire, et non seulement apprendre qu'il s'est trompé.
    assert.equal(dateFausse.donnees.designation, `${MARQUE} Chaise`);
  });

  it('l’application crée les biens à créer, et rien d’autre', async () => {
    const avant = await nombreDeBiens();
    const reponse = await appel(comptable, {
      method: 'POST', url: `/api/reprises/${reprise.id}/appliquer`,
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const applique = reponse.json();
    assert.equal(applique.statut, 'appliquee');
    assert.deepEqual(applique.resume, { a_creer: 0, doublon: 0, rejetee: 2, creee: 2 });
    assert.equal(await nombreDeBiens(), avant + 2);
  });

  it('l’immatriculation de l’inventaire existant est conservée telle quelle', async () => {
    await enPrivilegie(async (bd) => {
      const armoire = await bd.un(
        'select immatriculation, etat, valeur_acquisition, valeur_acquisition_connue, site_id from bien where designation = $1',
        [`${MARQUE} Armoire métallique`],
      );
      assert.equal(armoire.immatriculation, 'INV/CGIG/1998/0042',
        'le SIGL ne renumérote pas : les étiquettes collées sur les armoires doivent rester justes');
      assert.equal(armoire.etat, 'bon');
      assert.equal(Number(armoire.valeur_acquisition), 450_000);
      assert.equal(armoire.valeur_acquisition_connue, true);
      assert.equal(armoire.site_id, site.id, 'le site s’est résolu par son nom');
    });
  });

  it('un bien sans immatriculation en reçoit une du SIGL, et sa valeur se dit inconnue', async () => {
    await enPrivilegie(async (bd) => {
      const bureau = await bd.un(
        'select immatriculation, valeur_acquisition, valeur_acquisition_connue from bien where designation = $1',
        [`${MARQUE} Bureau en bois`],
      );
      assert.ok(bureau.immatriculation?.startsWith('BRT-CGIG-'), bureau.immatriculation);
      assert.equal(bureau.valeur_acquisition_connue, false,
        'une valeur absente se dit inconnue : zéro est le prix d’un don, pas celui d’un bureau');
      assert.equal(Number(bureau.valeur_acquisition), 0);
    });
  });

  it('l’écran du patrimoine peut dire « non documentée » plutôt que zéro', async () => {
    // La liste des biens doit porter le drapeau, sinon l'écran affiche
    // « 0 FC » — et zéro est le prix d'un don, pas celui d'un bureau dont
    // l'inventaire papier ne portait pas la valeur.
    const reponse = await appel(comptable, { url: '/api/biens?parPage=200' });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const bureau = reponse.json().donnees.find((b) => b.designation === `${MARQUE} Bureau en bois`);
    assert.ok(bureau, 'le bien repris doit figurer dans la liste du patrimoine');
    assert.equal(bureau.valeur_acquisition_connue, false,
      'sans ce drapeau dans la liste, aucun écran ne peut distinguer une valeur inconnue d’un zéro');
  });

  it('les lignes créées portent le bien qu’elles ont produit', async () => {
    const reponse = await appel(comptable, { url: `/api/reprises/${reprise.id}/lignes?verdict=creee` });
    const lignes = reponse.json().donnees;
    assert.equal(lignes.length, 2);
    for (const l of lignes) assert.ok(l.bien_id, 'la reprise doit rester vérifiable après coup');
  });

  it('RG-036 — une reprise appliquée ne s’applique pas une seconde fois', async () => {
    const avant = await nombreDeBiens();
    const reponse = await appel(comptable, {
      method: 'POST', url: `/api/reprises/${reprise.id}/appliquer`,
    });
    assert.equal(reponse.statusCode, 422, reponse.body);
    assert.equal(reponse.json().erreur.code, 'reprise_deja_appliquee');
    assert.equal(await nombreDeBiens(), avant, 'et rien n’a été créé');
  });

  it('RG-035 — redéposer le même fichier ne propose plus rien à créer', async () => {
    const reponse = await appel(comptable, {
      method: 'POST',
      url: '/api/reprises',
      payload: { fichier_nom: `${MARQUE}-inventaire-1998.csv`, contenu: fichier() },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const seconde = reponse.json();
    assert.equal(seconde.resume.a_creer, 0,
      'ce qui est déjà au registre est reconnu, et la reprise se rejoue sans rien écraser');
    assert.equal(seconde.resume.doublon, 2);

    const lignes = (await appel(comptable, { url: `/api/reprises/${seconde.id}/lignes` })).json().donnees;
    const doublon = lignes.find((l) => l.numero_ligne === 2);
    assert.equal(doublon.verdict, 'doublon');
    assert.match(doublon.motif, /registre/i);

    // Et l'application d'une reprise sans rien à créer est refusée plutôt que
    // de se dire réussie en n'ayant rien fait.
    const vaine = await appel(comptable, {
      method: 'POST', url: `/api/reprises/${seconde.id}/appliquer`,
    });
    assert.equal(vaine.statusCode, 422, vaine.body);
    assert.equal(vaine.json().erreur.code, 'reprise_sans_ligne_a_creer');
  });

  it('un fichier mal en-têté est refusé au dépôt, avant toute analyse', async () => {
    const reponse = await appel(comptable, {
      method: 'POST',
      url: '/api/reprises',
      payload: {
        fichier_nom: `${MARQUE}-mauvais-entete.csv`,
        contenu: 'designation;categorie;date_acquisition;valeur_dentree\nA;INF;2020-01-01;5\n',
      },
    });
    assert.equal(reponse.statusCode, 400, reponse.body);
    assert.match(reponse.json().erreur.message, /valeur_dentree/);
    await enPrivilegie(async (bd) => {
      const ligne = await bd.un(
        'select count(*)::int as n from reprise where fichier_nom = $1',
        [`${MARQUE}-mauvais-entete.csv`],
      );
      assert.equal(ligne.n, 0, 'un fichier refusé ne laisse pas de reprise derrière lui');
    });
  });

  it('RG-017 — un chef d’une autre structure ne lit pas cette reprise', async () => {
    const detail = await appel(chefSgg, { url: `/api/reprises/${reprise.id}` });
    assert.equal(detail.statusCode, 403, detail.body);
    assert.equal(detail.json().erreur.code, 'RG-017',
      'le refus nomme la règle : un agent doit pouvoir la citer, et non lire « non autorisé »');

    const liste = await appel(chefSgg, { url: '/api/reprises' });
    assert.equal(liste.statusCode, 200, liste.body);
    const numeros = liste.json().donnees.map((r) => r.numero);
    assert.ok(!numeros.includes(reprise.numero), 'et la liste ne la montre pas non plus');
  });
});

// ---------------------------------------------------------------------------
// Le verrou en base, et non dans la route.
// ---------------------------------------------------------------------------
describe('La base tient la reprise, pas seulement la route', () => {
  it('RG-036 en base — une reprise appliquée refuse toute modification', async () => {
    await assert.rejects(
      transaction(
        { agentId: comptable.id, structureId: cgig.id },
        (bd) => bd.requete("update reprise set statut = 'analysee', applique_le = null where id = $1", [reprise.id]),
      ),
      /RG-036/,
      'même en base, une reprise appliquée est figée : un doublon créé deux fois ne se distingue plus de l’original',
    );
  });

  it('RG-037 en base — un chef d’une autre structure ne lit aucune reprise de la CGIG', async () => {
    const vu = await transaction(
      { agentId: chefSgg.id, structureId: chefSgg.structure_id },
      (bd) => bd.tous('select numero from reprise where structure_id = $1', [cgig.id]),
    );
    assert.deepEqual(vu, [], 'même si une route oubliait son filtre, la base ne doit rien rendre');
  });
});
