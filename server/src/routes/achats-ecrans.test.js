// achats-ecrans.test.js — Ce dont les écrans des achats, des réceptions et des
// seuils ont besoin, et que les réponses doivent rendre.
//
// L'interface se construit en parallèle du serveur. Trois choses lui
// manquaient, et aucune n'est un détail d'affichage :
//
//   1. **le fournisseur avec son délai constaté** — le délai déclaré est une
//      promesse, le constaté est un fait — et sa liste noire **motivée** ;
//   2. **les écarts commandé / livré / reçu, ligne par ligne** : les trois ne
//      se confondent pas, et l'écart se lit par ligne, pas en bloc ;
//   3. **la raison pour laquelle une procédure s'applique** : quel seuil, à
//      quelle date. Un contrôleur relit la raison, pas le calcul ;
//   4. **l'historique des changements de seuil** : qui a bougé quoi, quand.
//
// Ces essais parcourent la chaîne réelle — dossier, bon de commande,
// réception, prise en charge, réglage des seuils — et vérifient que chaque
// réponse porte ce qu'un écran doit montrer.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  CLE_PRIVILEGE, SESAME_PRIVILEGE, enPrivilegie, fermer,
} from '../db.js';
import { construireApp } from '../app.js';
import { arreterEcoute } from './_flux.js';
import { lignesAvecEcarts, resumeEcarts } from './receptions.js';
import { expliquerProcedure } from '../regles/seuils.js';

process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

const MARQUE = 'ESSAI-ECRANS-ACHAT';

let serveur;
let logistique;      // ouvre le dossier et émet le bon de commande
let magasinier;      // réceptionne — jamais celui qui a engagé
let comptable;       // prend en charge — jamais celui qui a réceptionné
let fournisseur;
let delaiDeclareInitial;   // rendu au jeu de démonstration à la fin
let articleStock;

/** Une requête au nom d'un agent, par l'en-tête du contrat. */
const appel = (agent, options) => serveur.inject({
  ...options,
  headers: { ...(options.headers ?? {}), 'x-agent-id': agent.id },
});

async function agentAuRole(bd, role) {
  return bd.un(
    `select a.id, a.nom, a.structure_id from agent a
       join agent_role ar on ar.agent_id = a.id
       join structure s on s.id = a.structure_id
      where ar.role_code = $1 and s.code = 'SGP' and a.actif
      order by a.nom limit 1`,
    [role],
  );
}

before(async () => {
  await enPrivilegie(async (bd) => {
    logistique = await agentAuRole(bd, 'logistique');
    magasinier = await agentAuRole(bd, 'magasinier');
    comptable = await agentAuRole(bd, 'comptable_matieres');

    // Un fournisseur propre, et son délai **déclaré** connu : c'est à lui que
    // le délai constaté se comparera.
    //
    // La valeur d'origine est relevée avant d'être écrasée, et rendue dans le
    // `after`. Un essai qui laisse sa marque sur le jeu de démonstration rend
    // les suivants dépendants de son ordre d'exécution : le délai déclaré d'un
    // fournisseur se lit dans son comportement constaté, et un 21 oublié s'y
    // serait vu sans qu'on sache d'où il venait.
    const cible = await bd.un(
      `select id, delai_moyen_jours from fournisseur
        where not liste_noire and actif and delai_moyen_jours is not null
        order by denomination limit 1`,
    );
    delaiDeclareInitial = cible?.delai_moyen_jours ?? null;
    fournisseur = await bd.un(
      `update fournisseur set delai_moyen_jours = 21 where id = $1
       returning id, denomination, delai_moyen_jours`,
      [cible?.id ?? null],
    );

    articleStock = await bd.un(
      `select id, structure_id, seuil_minimum, seuil_critique from stock
        where structure_id = (select id from structure where code = 'SGP')
        order by designation limit 1`,
    );
  });

  for (const [nom, agent] of [['logistique', logistique], ['magasinier', magasinier], ['comptable des matières', comptable]]) {
    assert.ok(agent, `le jeu de démonstration doit porter un ${nom} au SGP`);
  }
  assert.ok(fournisseur, 'il faut un fournisseur hors liste noire');
  assert.ok(articleStock, 'il faut un article de stock au SGP');

  serveur = await construireApp({ servirWeb: false });
  await serveur.ready();
});

after(async () => {
  await arreterEcoute();
  await serveur?.close();
  await enPrivilegie(async (bd) => {
    const dossiers = await bd.tous('select id from dossier_achat where objet like $1', [`${MARQUE}%`]);
    for (const d of dossiers) {
      const bons = await bd.tous('select id from bon_commande where dossier_id = $1', [d.id]);
      for (const b of bons) {
        await bd.requete("delete from document where objet_type = 'bon_commande' and objet_id = $1", [String(b.id)]);
        await bd.requete("delete from alerte where objet_type = 'bon_commande' and objet_id = $1", [String(b.id)]);
      }
      await bd.requete('delete from bon_commande where dossier_id = $1', [d.id]);
      await bd.requete("delete from alerte where objet_type = 'dossier_achat' and objet_id = $1", [String(d.id)]);
    }
    await bd.requete('delete from dossier_achat where objet like $1', [`${MARQUE}%`]);
    await bd.requete("delete from journal where apres->>'objet' like $1", [`${MARQUE}%`]);
    // Le délai déclaré est rendu tel qu'il était trouvé.
    if (fournisseur && delaiDeclareInitial !== undefined) {
      await bd.requete(
        'update fournisseur set delai_moyen_jours = $2 where id = $1',
        [fournisseur.id, delaiDeclareInitial],
      );
    }
  });
  await fermer();
});

// Les objets créés par la chaîne, repris d'un essai au suivant.
const chaine = {};

describe('Les écrans des achats savent pourquoi une procédure s’applique', () => {
  it('l’ouverture d’un dossier dit quel seuil, à quelle date', async () => {
    const reponse = await appel(logistique, {
      method: 'POST',
      url: '/api/dossiers-achat',
      payload: { objet: `${MARQUE} Fournitures de bureau`, montant_estime: 45_000_000 },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const dossier = reponse.json();
    chaine.dossier = dossier;

    const j = dossier.justification_procedure;
    assert.ok(j, 'la réponse doit porter la raison de la procédure');
    assert.equal(j.procedure, dossier.procedure);
    assert.equal(j.conforme, true);
    assert.equal(j.montant_estime, 45_000_000);
    // Quel seuil : celui qui est franchi, et celui qui ne l'est pas.
    assert.equal(typeof j.seuil_applique, 'number');
    assert.ok(j.montant_estime >= j.seuil_applique);
    if (j.seuil_suivant !== null) assert.ok(j.montant_estime < j.seuil_suivant);
    // À quelle date : la date du dossier, et la version des seuils qui valait.
    assert.match(j.date_reference, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(j.source, 'parametre');
    assert.ok(j.cle_parametre, 'la clé de paramètre lue doit être nommée');
    assert.ok(j.seuils_en_vigueur_du, 'la version des seuils doit être datée');
    // Et une phrase que l'écran affiche telle quelle.
    assert.match(j.motif, /seuil/);
    assert.match(j.motif, new RegExp(j.procedure));
  });

  it('la liste et la fiche des dossiers portent la même raison', async () => {
    const liste = await appel(logistique, {
      method: 'GET', url: `/api/dossiers-achat?q=${encodeURIComponent(MARQUE)}`,
    });
    assert.equal(liste.statusCode, 200, liste.body);
    const ligne = liste.json().donnees.find((d) => d.id === chaine.dossier.id);
    assert.ok(ligne, 'le dossier doit figurer dans la liste');
    assert.equal(ligne.justification_procedure.procedure, chaine.dossier.procedure);
    assert.equal(ligne.justification_procedure.conforme, true);
    assert.ok(ligne.justification_procedure.motif.length > 20);

    const fiche = await appel(logistique, {
      method: 'GET', url: `/api/dossiers-achat/${chaine.dossier.id}`,
    });
    assert.equal(fiche.statusCode, 200, fiche.body);
    assert.equal(fiche.json().justification_procedure.conforme, true);
  });

  it('la raison vient des seuils figés du dossier, pas de ceux du jour', () => {
    // RG-007 : une décision ancienne se rejuge avec les seuils d'alors. La
    // fonction qui explique ne lit donc que les seuils qu'on lui donne.
    const anciens = { gre_a_gre: 0, consultation: 1_000_000, aon: 5_000_000, aoi: 50_000_000 };
    const explication = expliquerProcedure(45_000_000, anciens, { date_reference: '2024-03-01' });
    assert.equal(explication.procedure, 'aon');
    assert.equal(explication.seuil_applique, 5_000_000);
    assert.equal(explication.seuil_suivant, 50_000_000);
    assert.equal(explication.procedure_suivante, 'aoi');
    assert.equal(explication.date_reference, '2024-03-01');
    // Seuils illisibles : on n'invente pas d'explication.
    assert.equal(expliquerProcedure(10, {}), null);
    assert.equal(expliquerProcedure(10, null), null);
  });
});

describe('Les écrans des achats voient le fournisseur tel qu’il est', () => {
  it('le bon de commande rend le délai déclaré, le délai constaté et la liste noire', async () => {
    const reponse = await appel(logistique, {
      method: 'POST',
      url: '/api/bons-commande',
      payload: {
        dossier_id: chaine.dossier.id,
        fournisseur_id: fournisseur.id,
        montant: 40_000_000,
        lignes: [
          { designation: 'Rames de papier A4 80 g', quantite: 100, prix_unitaire: 15_000 },
          { designation: 'Cartouches noires', quantite: 20, prix_unitaire: 90_000 },
        ],
      },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const bon = reponse.json();
    chaine.bon = bon;

    const f = bon.fournisseur;
    assert.ok(f, 'la réponse doit porter le fournisseur');
    assert.equal(f.denomination, fournisseur.denomination);
    assert.equal(f.delai_declare_jours, 21);
    assert.equal(f.liste_noire, false);
    assert.equal(f.motif_liste_noire, null);
    // Le délai constaté : un nombre de jours, ou `null` quand ce fournisseur
    // n'a encore rien livré. Dans les deux cas le champ existe, et l'écart
    // avec le déclaré est calculé plutôt que laissé à l'interface.
    assert.ok('delai_constate_jours' in f);
    assert.ok('ecart_delai_jours' in f);
    assert.ok('retard_constate' in f);
    assert.equal(typeof f.livraisons_constatees, 'number');
    if (f.delai_constate_jours !== null) {
      assert.equal(f.ecart_delai_jours, f.delai_constate_jours - 21);
      assert.equal(f.retard_constate, f.delai_constate_jours > 21);
    }
    // Et la raison de la procédure suit le bon de commande.
    assert.equal(bon.justification_procedure.procedure, chaine.dossier.procedure);
  });

  it('la liste des bons de commande porte le même fournisseur constaté', async () => {
    const liste = await appel(logistique, {
      method: 'GET', url: `/api/bons-commande?dossier=${chaine.dossier.id}`,
    });
    assert.equal(liste.statusCode, 200, liste.body);
    const ligne = liste.json().donnees.find((b) => b.id === chaine.bon.id);
    assert.ok(ligne);
    assert.equal(ligne.fournisseur.denomination, fournisseur.denomination);
    assert.equal(ligne.fournisseur.delai_declare_jours, 21);
    assert.ok('delai_constate_jours' in ligne.fournisseur);
    assert.equal(ligne.nombre_pv_reception, 0);
    assert.equal(ligne.pris_en_charge, false);
    assert.ok(ligne.justification_procedure.motif.length > 20);
  });

  it('la fiche fournisseur compare la promesse et le fait', async () => {
    const fiche = await appel(logistique, {
      method: 'GET', url: `/api/fournisseurs/${fournisseur.id}`,
    });
    assert.equal(fiche.statusCode, 200, fiche.body);
    const f = fiche.json();
    assert.equal(f.delai_declare_jours, 21);
    assert.ok('delai_constate_jours' in f);
    assert.ok('delai_constate_max_jours' in f);
    assert.ok('livraisons_partielles' in f);
    assert.ok('ecart_delai_jours' in f);
    assert.ok(Array.isArray(f.commandes));
    assert.ok(f.commandes.every((c) => 'delai_jours' in c));
  });
});

describe('Les écarts de réception se lisent ligne par ligne', () => {
  it('commandé, livré et reçu sont trois colonnes distinctes', () => {
    // La fonction pure d'abord : c'est elle qui porte la règle.
    const [ligne] = lignesAvecEcarts([
      { designation: 'Rames A4', quantite_commandee: 100, quantite_livree: 90, quantite_recue: 85 },
    ]);
    assert.equal(ligne.quantite_commandee, 100);
    assert.equal(ligne.quantite_livree, 90);
    assert.equal(ligne.quantite_recue, 85);
    assert.equal(ligne.ecart_commande_livre, -10);
    assert.equal(ligne.ecart_livre_recu, -5);
    assert.equal(ligne.ecart_commande_recu, -15);
    assert.equal(ligne.en_ecart, true);

    // Sans quantité livrée, le livré vaut le reçu : on ne suppose pas un écart
    // qui n'a pas été constaté.
    const [sansLivree] = lignesAvecEcarts([
      { designation: 'Cartouches', quantite_commandee: 20, quantite_recue: 20 },
    ]);
    assert.equal(sansLivree.quantite_livree, 20);
    assert.equal(sansLivree.ecart_commande_livre, 0);
    assert.equal(sansLivree.en_ecart, false);

    // Une quantité juste mais du matériel inutilisable est un écart aussi.
    const [nonConforme] = lignesAvecEcarts([
      { designation: 'Onduleurs', quantite_commandee: 5, quantite_recue: 5, conforme: false },
    ]);
    assert.equal(nonConforme.en_ecart, true);
    assert.equal(nonConforme.conforme, false);

    const resume = resumeEcarts([
      { designation: 'Rames A4', quantite_commandee: 100, quantite_livree: 90, quantite_recue: 85 },
      { designation: 'Cartouches', quantite_commandee: 20, quantite_recue: 22 },
      { designation: 'Onduleurs', quantite_commandee: 5, quantite_recue: 5, conforme: false },
    ]);
    assert.equal(resume.nombre_lignes, 3);
    assert.equal(resume.nombre_ecarts, 3);
    assert.equal(resume.manquants, 15);
    assert.equal(resume.excedents, 2);
    assert.equal(resume.non_conformes, 1);
    assert.equal(resume.complete, false);
  });

  it('le PV de réception rend les écarts dépliés, et lève un examen', async () => {
    const reponse = await appel(magasinier, {
      method: 'POST',
      url: '/api/receptions',
      payload: {
        bon_commande_id: chaine.bon.id,
        observations: `${MARQUE} — réception partielle d’essai.`,
        lignes: [
          {
            designation: 'Rames de papier A4 80 g',
            quantite_commandee: 100, quantite_livree: 90, quantite_recue: 85,
            observation: 'Cinq rames détériorées au transport.',
          },
          { designation: 'Cartouches noires', quantite_commandee: 20, quantite_recue: 20 },
        ],
      },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const pv = reponse.json();
    chaine.pv = pv.pv_reception;

    assert.equal(pv.resume_ecarts.nombre_lignes, 2);
    assert.equal(pv.resume_ecarts.nombre_ecarts, 1);
    assert.equal(pv.resume_ecarts.manquants, 15);
    assert.equal(pv.ecarts.length, 1);
    assert.equal(pv.ecarts[0].ecart_commande_livre, -10);
    assert.equal(pv.ecarts[0].ecart_livre_recu, -5);
    assert.equal(pv.ecarts[0].ecart_commande_recu, -15);

    // Le fournisseur suit le PV : qui a livré court, et de combien.
    assert.equal(pv.fournisseur.denomination, fournisseur.denomination);
    assert.equal(pv.fournisseur.delai_declare_jours, 21);

    // L'écart ouvre un examen et ne décide rien (RG-022).
    assert.ok(pv.alerte, "l'écart doit ouvrir une alerte");
    assert.equal(pv.alerte.code, 'ECART_RECEPTION');
    assert.equal(pv.alerte.statut, 'ouverte');
    assert.equal(pv.bon_commande.statut, 'livre_partiel');

    // Et le PV figé garde les trois colonnes : il est opposable tel quel.
    assert.equal(pv.pv_reception.fige, true);
    assert.equal(pv.pv_reception.contenu.lignes[0].quantite_livree, 90);
  });

  it('la liste des réceptions déplie les écarts sans qu’on fouille le PV', async () => {
    const liste = await appel(logistique, {
      method: 'GET', url: `/api/receptions?bon_commande=${chaine.bon.id}`,
    });
    assert.equal(liste.statusCode, 200, liste.body);
    const ligne = liste.json().donnees.find((d) => d.id === chaine.pv.id);
    assert.ok(ligne, 'le PV doit figurer dans la liste');
    assert.equal(ligne.bon_commande_numero, chaine.bon.numero);
    assert.equal(ligne.fournisseur.denomination, fournisseur.denomination);
    assert.ok('delai_constate_jours' in ligne.fournisseur);
    assert.equal(ligne.ecarts.nombre_ecarts, 1);
    assert.equal(ligne.ecarts.manquants, 15);
    assert.equal(ligne.ecarts.lignes.length, 2);
    assert.equal(ligne.ecarts.lignes[0].ecart_commande_recu, -15);
    assert.equal(ligne.pris_en_charge, false);
    assert.equal(typeof ligne.delai_livraison_jours, 'number');
  });

  it('la prise en charge s’appuie sur le PV et redit ses écarts', async () => {
    const reponse = await appel(comptable, {
      method: 'POST',
      url: '/api/prises-en-charge',
      payload: {
        bon_commande_id: chaine.bon.id,
        observations: `${MARQUE} — prise en charge d’essai.`,
      },
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const certificat = reponse.json();
    assert.equal(certificat.pv_reception.numero, chaine.pv.numero);
    assert.equal(certificat.pv_reception.ecarts.nombre_ecarts, 1);
    assert.equal(certificat.pv_reception.ecarts.manquants, 15);
    assert.equal(certificat.fournisseur.denomination, fournisseur.denomination);
    assert.equal(certificat.certificat_prise_en_charge.fige, true);
  });
});

describe('L’écran des seuils voit qui les a changés', () => {
  it('le réglage rend la valeur précédente et l’historique', async () => {
    const minimum = Number(articleStock.seuil_minimum) + 7;
    const critique = Math.max(1, Number(articleStock.seuil_critique) + 2);

    const reponse = await appel(magasinier, {
      method: 'PATCH',
      url: `/api/stocks/${articleStock.id}/seuils`,
      payload: { seuil_minimum: minimum, seuil_critique: critique },
    });
    assert.equal(reponse.statusCode, 200, reponse.body);
    const apres = reponse.json();

    assert.equal(Number(apres.seuil_minimum), minimum);
    assert.equal(Number(apres.precedent.seuil_minimum), Number(articleStock.seuil_minimum));
    assert.equal(Number(apres.precedent.seuil_critique), Number(articleStock.seuil_critique));

    const dernier = apres.historique_seuils[0];
    assert.ok(dernier, "le changement doit figurer à l'historique");
    assert.equal(dernier.agent_nom, magasinier.nom);
    assert.equal(Number(dernier.seuil_minimum_avant), Number(articleStock.seuil_minimum));
    assert.equal(Number(dernier.seuil_minimum_apres), minimum);
    assert.equal(dernier.variation_minimum, minimum - Number(articleStock.seuil_minimum));
    assert.ok(dernier.horodatage);

    // La fiche de l'article le montre aussi : l'écran n'a pas à le reconstituer.
    const fiche = await appel(magasinier, {
      method: 'GET', url: `/api/stocks/${articleStock.id}`,
    });
    assert.equal(fiche.statusCode, 200, fiche.body);
    const historique = fiche.json().historique_seuils;
    assert.ok(Array.isArray(historique));
    assert.ok(historique.length >= 1);
    assert.equal(historique[0].agent_nom, magasinier.nom);

    // On remet les seuils d'origine : l'essai ne laisse pas le magasin réglé
    // de travers. Le retour est tracé lui aussi, et c'est bien ainsi.
    const remise = await appel(magasinier, {
      method: 'PATCH',
      url: `/api/stocks/${articleStock.id}/seuils`,
      payload: {
        seuil_minimum: Number(articleStock.seuil_minimum),
        seuil_critique: Number(articleStock.seuil_critique),
      },
    });
    assert.equal(remise.statusCode, 200, remise.body);
    assert.ok(remise.json().historique_seuils.length >= 2);
  });

  it('le magasinier voit sa consommation constatée, qui lui était invisible', async () => {
    // Le journal est réservé au mode consolidation par la politique
    // `journal_lecture` : lu sous une transaction métier, il ne rendait rien,
    // et la consommation constatée — donc les jours de couverture et la date de
    // rupture — restait vide pour celui-là même qui ouvre cet écran.
    const sortie = await appel(magasinier, {
      method: 'POST',
      url: `/api/stocks/${articleStock.id}/sorties`,
      payload: { quantite: 1, motif: `${MARQUE} — sortie d’essai pour la consommation.` },
    });
    assert.equal(sortie.statusCode, 201, sortie.body);
    assert.ok(sortie.json().sorties_fenetre >= 1, 'la sortie doit être constatée');

    const fiche = await appel(magasinier, {
      method: 'GET', url: `/api/stocks/${articleStock.id}`,
    });
    assert.equal(fiche.statusCode, 200, fiche.body);
    const article = fiche.json();
    assert.ok(article.sorties_fenetre >= 1, 'le magasinier doit voir ses propres sorties');
    assert.ok(article.consommation_jour > 0, 'la consommation constatée doit être chiffrée');
    assert.ok(article.derniere_sortie, 'et datée');
    assert.ok(article.historique.length >= 1, "l'historique de l'article ne doit pas être vide");

    // On rend la quantité au magasin.
    const retour = await appel(magasinier, {
      method: 'POST',
      url: `/api/stocks/${articleStock.id}/entrees`,
      payload: { quantite: 1, motif: `${MARQUE} — annulation de la sortie d’essai.` },
    });
    assert.equal(retour.statusCode, 201, retour.body);
  });
});
