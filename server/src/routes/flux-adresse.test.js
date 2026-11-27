// flux-adresse.test.js — Le repli d'identification du flux temps réel.
//
// `EventSource`, qui porte le flux dans le navigateur, ne sait pas poser
// d'en-tête : la plateforme ne lui en donne pas le moyen. `/api/flux` accepte
// donc l'agent en paramètre d'adresse. C'est une entorse au contrat (§5 :
// l'en-tête `X-Agent-Id` désigne l'agent) et une règle de la maison veut
// qu'une règle sans test ne soit pas livrée. La voici.
//
// Quatre points, et le troisième est celui qui compte :
//   1. `/api/flux?agent=<uuid>` ouvre le flux sans en-tête ;
//   2. `/api/flux` sans rien est refusé ;
//   3. **le repli ne déborde pas** — `?agent=` reste sans effet sur toutes les
//      autres routes. S'il fuyait, une simple adresse suffirait à lire le
//      patrimoine de n'importe qui ;
//   4. l'agent désigné par l'adresse subit le même filtrage par structure que
//      par en-tête (RG-017). Le RLS ne protège pas un flux : c'est la route.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  CLE_PRIVILEGE, SESAME_PRIVILEGE, enPrivilegie, fermer,
} from '../db.js';
import { construireApp } from '../app.js';
import { arreterEcoute, publier } from './_flux.js';
import { CHEMIN_DU_REPLI } from './_droits.js';

// Les identités d'épreuve se lisent sous le rôle propriétaire, comme le seed.
process.env[CLE_PRIVILEGE] = SESAME_PRIVILEGE;

let serveur;
let base;
let agentLocal;   // portée limitée : sa structure, et rien d'autre
let structureAutre; // une structure hors de sa portée

before(async () => {
  await enPrivilegie(async (bd) => {
    // Un agent sans portée totale : ni logistique, ni direction, ni contrôle
    // externe. C'est le seul profil sur lequel le filtrage se voit.
    agentLocal = await bd.un(
      `select a.id, a.nom, a.structure_id, s.code as structure_code
         from agent a
         join structure s on s.id = a.structure_id
        where a.actif
          and s.regime = 'integre'
          and exists (select 1 from agent_role r where r.agent_id = a.id)
          and not exists (
            select 1 from agent_role r
             where r.agent_id = a.id
               and r.role_code in ('logistique', 'direction', 'controle_externe'))
          and not exists (select 1 from structure f where f.parent_id = a.structure_id)
        order by a.nom limit 1`,
    );
    structureAutre = await bd.un(
      `select id, code from structure where id <> $1 and actif order by code limit 1`,
      [agentLocal.structure_id],
    );
  });
  assert.ok(agentLocal, 'le jeu de démonstration doit porter un agent de portée limitée');

  serveur = await construireApp({ servirWeb: false });
  await serveur.listen({ port: 0, host: '127.0.0.1' });
  const { port } = serveur.server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await arreterEcoute();
  await serveur?.close();
  await fermer();
});

/**
 * Ouvre le flux et lit ses morceaux jusqu'à ce que `suffit` soit satisfait,
 * ou jusqu'au délai. Rend le texte reçu, et referme la connexion.
 */
async function ouvrirFlux(url, { entetes = {}, suffit, delai = 4000 } = {}) {
  const arret = new AbortController();
  const reponse = await fetch(url, { headers: entetes, signal: arret.signal });
  if (!reponse.ok) {
    const corps = await reponse.text();
    arret.abort();
    return { reponse, texte: corps };
  }
  const lecteur = reponse.body.getReader();
  const decodeur = new TextDecoder();
  let texte = '';
  const echeance = Date.now() + delai;
  try {
    while (Date.now() < echeance) {
      const morceau = await Promise.race([
        lecteur.read(),
        new Promise((r) => setTimeout(() => r({ expire: true }), echeance - Date.now())),
      ]);
      if (morceau.expire || morceau.done) break;
      texte += decodeur.decode(morceau.value, { stream: true });
      if (!suffit || suffit(texte)) break;
    }
  } finally {
    arret.abort();
    await lecteur.cancel().catch(() => {});
  }
  return { reponse, texte };
}

describe('Le flux accepte l’agent en paramètre d’adresse, et seulement lui', () => {
  it('ouvre le flux sans en-tête, sur le seul paramètre d’adresse', async () => {
    const { reponse, texte } = await ouvrirFlux(
      `${base}/api/flux?agent=${agentLocal.id}`,
      { suffit: (t) => t.includes('event: bonjour') },
    );
    assert.equal(reponse.status, 200);
    assert.match(reponse.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.match(texte, /event: bonjour/);
    // Le flux s'ouvre bien au nom de cet agent, et pas d'un autre.
    const bonjour = JSON.parse(texte.match(/event: bonjour\ndata: (.+)\n/)[1]);
    assert.equal(bonjour.agent, agentLocal.nom);
    assert.equal(bonjour.consolide_seulement, false);
  });

  it('refuse le flux quand ni en-tête ni paramètre ne désignent personne', async () => {
    for (const url of ['/api/flux', '/api/flux?agent=', '/api/flux?agent=pas-un-uuid']) {
      const reponse = await serveur.inject({ method: 'GET', url });
      assert.equal(reponse.statusCode, 403, `${url} devrait être refusée`);
      assert.equal(reponse.json().erreur.code, 'non_autorise');
      assert.equal(reponse.json().erreur.champ, 'X-Agent-Id');
    }
    // Et un agent inconnu, même bien formé, n'ouvre rien.
    const inconnu = await serveur.inject({
      method: 'GET', url: '/api/flux?agent=3f1a0c2e-5b7d-4f8a-9c1b-2d3e4f5a6b7c',
    });
    assert.equal(inconnu.statusCode, 403);
  });

  it('LE POINT QUI COMPTE — le repli ne déborde sur aucune autre route', async () => {
    // Si `?agent=` suffisait ailleurs, n'importe qui lirait n'importe quoi avec
    // une simple adresse.
    //
    // Les fiches (`/:id`) n'ont pas de schéma de requête : elles acceptent donc
    // le paramètre sans broncher, et c'est sur elles que la preuve porte — si
    // le repli fuyait, elles répondraient 200. Elles doivent refuser, et
    // refuser pour la bonne raison : aucun agent n'a été identifié.
    const fiches = [
      '/api/biens/3f1a0c2e-5b7d-4f8a-9c1b-2d3e4f5a6b7c',
      '/api/stocks/3f1a0c2e-5b7d-4f8a-9c1b-2d3e4f5a6b7c',
      '/api/besoins/3f1a0c2e-5b7d-4f8a-9c1b-2d3e4f5a6b7c',
      '/api/documents/3f1a0c2e-5b7d-4f8a-9c1b-2d3e4f5a6b7c',
      '/api/alertes/3f1a0c2e-5b7d-4f8a-9c1b-2d3e4f5a6b7c',
      '/api/fournisseurs/3f1a0c2e-5b7d-4f8a-9c1b-2d3e4f5a6b7c',
      '/api/dossiers-achat/3f1a0c2e-5b7d-4f8a-9c1b-2d3e4f5a6b7c',
      '/api/structures/3f1a0c2e-5b7d-4f8a-9c1b-2d3e4f5a6b7c',
    ];
    for (const route of fiches) {
      const reponse = await serveur.inject({
        method: 'GET', url: `${route}?agent=${agentLocal.id}`,
      });
      assert.equal(
        reponse.statusCode, 403,
        `${route}?agent=… doit rester refusée — le repli est réservé au flux`,
      );
      assert.equal(reponse.json().erreur.code, 'non_autorise');
      assert.equal(reponse.json().erreur.champ, 'X-Agent-Id');
    }

    // Les listes, elles, déclarent `additionalProperties: false` : le paramètre
    // est écarté à la validation, avant même la garde. Deux refus valent mieux
    // qu'un — mais rien ne doit jamais être servi.
    const listes = [
      '/api/biens', '/api/stocks', '/api/besoins', '/api/structures',
      '/api/fournisseurs', '/api/dossiers-achat', '/api/bons-commande',
      '/api/receptions', '/api/alertes', '/api/documents', '/api/journal',
      '/api/tableau-de-bord',
    ];
    for (const route of listes) {
      const reponse = await serveur.inject({
        method: 'GET', url: `${route}?agent=${agentLocal.id}`,
      });
      assert.ok(
        [400, 403].includes(reponse.statusCode),
        `${route}?agent=… doit rester refusée (reçu ${reponse.statusCode})`,
      );
      assert.ok(reponse.json().erreur, 'et le refus garde la forme du contrat');
    }

    // Une écriture non plus, bien sûr.
    const ecriture = await serveur.inject({
      method: 'POST',
      url: `/api/dossiers-achat?agent=${agentLocal.id}`,
      payload: { objet: 'Tentative par adresse', montant_estime: 1_000_000 },
    });
    assert.equal(ecriture.statusCode, 403);

    // Et le repli vise le chemin exact, pas un préfixe : une route qui
    // commencerait par les mêmes lettres n'en hériterait pas.
    assert.equal(CHEMIN_DU_REPLI, '/api/flux');
    const voisine = await serveur.inject({
      method: 'GET', url: `/api/flux-des-biens?agent=${agentLocal.id}`,
    });
    assert.notEqual(voisine.statusCode, 200);
  });

  it('l’agent désigné par l’adresse subit le même filtrage par structure', async () => {
    const lecture = ouvrirFlux(
      `${base}/api/flux?agent=${agentLocal.id}`,
      { suffit: (t) => t.includes('"marque":"dans-le-perimetre"'), delai: 4000 },
    );
    // On laisse le temps à la route de s'abonner au bus avant de publier.
    await new Promise((r) => setTimeout(r, 300));

    publier({
      type: 'essai', objet: 'stock', id: 'essai-hors',
      structure_id: structureAutre.id, donnees: { marque: 'hors-du-perimetre' },
    });
    publier({
      type: 'essai', objet: 'stock', id: 'essai-dans',
      structure_id: agentLocal.structure_id, donnees: { marque: 'dans-le-perimetre' },
    });

    const { texte } = await lecture;
    assert.match(texte, /dans-le-perimetre/, "l'événement de sa structure doit arriver");
    assert.doesNotMatch(
      texte, /hors-du-perimetre/,
      "l'événement d'une autre structure ne doit jamais partir (RG-017)",
    );
  });
});

// ---------------------------------------------------------------------------
// L'exception des publications, éprouvée **sur le flux réel**.
//
// Décision du chef de projet du 27 novembre 2026 : les événements de l'objet
// `reemploi` atteignent toute session positionnée, comme la politique de
// lecture de `offre_reemploi`. Une offre qu'on ne découvre qu'en rechargeant
// une liste n'est pas publiée, elle est entreposée.
//
// Les essais de `flux.test.js` jugent les fonctions ; celui-ci juge la
// connexion, en lisant ce qui sort vraiment du tuyau.

describe('Le flux diffuse les offres de réemploi hors du périmètre, et elles seules', () => {
  it('une offre d’une autre structure arrive ; un dossier de réforme, non', async () => {
    const lecture = ouvrirFlux(
      `${base}/api/flux?agent=${agentLocal.id}`,
      { suffit: (t) => t.includes('OR-ESSAI-PUBLIE'), delai: 4000 },
    );
    await new Promise((r) => setTimeout(r, 300));

    // Le dossier de réforme d'une autre structure : son instruction interne.
    publier({
      type: 'saisine',
      objet: 'reforme',
      id: 'dr-essai-flux',
      structure_id: structureAutre.id,
      donnees: { numero: 'DR-ESSAI-CLOISONNE', statut: 'saisi' },
    });
    // L'offre de la même structure : une publication. Sa charge mêle
    // volontairement ce qu'elle publie et ce qu'elle ne publie pas.
    publier({
      type: 'offre_ouverte',
      objet: 'reemploi',
      id: 'or-essai-flux',
      structure_id: structureAutre.id,
      donnees: {
        numero: 'OR-ESSAI-PUBLIE',
        bien_designation: 'BIEN-PUBLIE',
        structure_origine_code: structureAutre.code,
        dossier: 'FUITE-DOSSIER',
        structure_demandeuse: 'FUITE-DEMANDEUSE',
        structure_beneficiaire: 'FUITE-BENEFICIAIRE',
        detenteur_id: 'FUITE-DETENTEUR',
        acte: 'FUITE-ACTE',
      },
    });

    const { texte } = await lecture;
    assert.match(
      texte, /OR-ESSAI-PUBLIE/,
      "l'offre d'une autre structure doit atteindre ce flux : c'est l'objet économique du lot",
    );
    assert.match(texte, /BIEN-PUBLIE/, 'avec la copie publiée du bien');
    assert.match(texte, /event: reemploi/);

    // LA MOITIÉ QUI COMPTE. Si celle-ci tombe, l'exception a débordé et
    // l'instruction interne d'une structure s'est mise à fuir.
    assert.doesNotMatch(
      texte, /DR-ESSAI-CLOISONNE/,
      "le dossier de réforme d'une autre structure ne doit jamais partir : l'exception est bornée à l'objet reemploi",
    );
    // Et rien de ce que l'offre ne publie pas ne sort avec elle.
    assert.doesNotMatch(
      texte, /FUITE-/,
      "la charge d'une offre diffusée hors périmètre se réduit à ce que l'offre publie",
    );
  });

  it('mais la structure d’origine, elle, lit la charge entière', async () => {
    // La réduction ne vise que les lecteurs hors périmètre : chez elle, celle
    // qui instruit doit voir à qui le bien a été attribué.
    const lecture = ouvrirFlux(
      `${base}/api/flux?agent=${agentLocal.id}`,
      { suffit: (t) => t.includes('OR-ESSAI-CHEZ-MOI'), delai: 4000 },
    );
    await new Promise((r) => setTimeout(r, 300));

    publier({
      type: 'reemploi_prononce',
      objet: 'reemploi',
      id: 'or-essai-chez-moi',
      structure_id: agentLocal.structure_id,
      donnees: {
        numero: 'OR-ESSAI-CHEZ-MOI',
        structure_beneficiaire: 'BENEFICIAIRE-ATTENDU',
        acte: 'ACTE-ATTENDU',
      },
    });

    const { texte } = await lecture;
    assert.match(texte, /OR-ESSAI-CHEZ-MOI/);
    assert.match(
      texte, /BENEFICIAIRE-ATTENDU/,
      'dans son propre périmètre, rien n’est retiré de la charge',
    );
    assert.match(texte, /ACTE-ATTENDU/);
  });
});
