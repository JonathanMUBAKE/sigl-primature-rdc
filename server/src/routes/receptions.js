// La réception et la prise en charge à l'inventaire.
//
// L'enchaînement est celui du décret 13/050 art. 137, et il n'est pas
// contournable :
//   réception → **PV de réception signé** → prise en charge à l'inventaire →
//   **certificat de prise en charge** → paiement possible.
// RG-010 interdit le certificat sans PV. RG-011 interdit le paiement sans
// certificat. L'invariant « qui réceptionne ne valide pas sa propre réception »
// est tenu ici même.

import { enEcriture, lireTous, lireUn } from './_sql.js';
import { ecriture, lecture, verifierEcritureStructure } from './_droits.js';
import {
  appliquer, donneesInvalides, liste, nonAutorise, nonTrouve, pagination,
  schemaIdParam, schemaPagination,
} from './_commun.js';
import { journaliserDepuis } from './_journal.js';
import { prochainNumero } from './_numeros.js';
import { leverAlerte } from './_alertes.js';
import { publier } from './_flux.js';
import { rg010 } from '../regles/rg-010.js';
import { rg019 } from '../regles/rg-019.js';

export default async function routesReceptions(app) {
  // --- Les PV de réception ---------------------------------------------
  app.get('/api/receptions', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          bon_commande: { type: 'string', format: 'uuid' },
          signe: { type: 'boolean' },
          ...schemaPagination,
        },
      },
    },
  }, async (request) => {
    const page = pagination(request.query);
    const params = [];
    let ou = `where d.type = 'pv_reception'`;
    if (request.query.bon_commande) {
      params.push(String(request.query.bon_commande));
      ou += ` and d.objet_id = $${params.length}`;
    }
    if (request.query.signe !== undefined) {
      ou += request.query.signe ? ' and d.signe_le is not null' : ' and d.signe_le is null';
    }
    const total = await lireUn(request, `select count(*)::int as n from document d ${ou}`, params);
    const donnees = await lireTous(request, 
      `select d.id, d.numero, d.objet_type, d.objet_id, d.contenu, d.signe_le, d.fige, d.cree_le,
              d.structure_id, s.code as structure_code, a.nom as signataire_nom,
              exists (select 1 from document c
                       where c.type = 'certificat_prise_en_charge'
                         and c.objet_type = d.objet_type and c.objet_id = d.objet_id) as pris_en_charge
         from document d
         join structure s on s.id = d.structure_id
         left join agent a on a.id = d.signataire_id
         ${ou}
        order by d.cree_le desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(donnees, total.n, page);
  });

  app.post('/api/receptions', {
    preHandler: ecriture('magasinier', 'comptable_matieres', 'intendant', 'logistique'),
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['bon_commande_id', 'lignes'],
        properties: {
          bon_commande_id: { type: 'string', format: 'uuid' },
          site_id: { type: ['string', 'null'], format: 'uuid' },
          observations: { type: ['string', 'null'], maxLength: 2000 },
          lignes: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['designation', 'quantite_commandee', 'quantite_recue'],
              properties: {
                designation: { type: 'string', minLength: 2, maxLength: 200 },
                categorie_code: { type: ['string', 'null'], maxLength: 40 },
                quantite_commandee: { type: 'integer', minimum: 0 },
                quantite_recue: { type: 'integer', minimum: 0 },
                conforme: { type: 'boolean', default: true },
                observation: { type: ['string', 'null'], maxLength: 400 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const bon = await lireUn(request, 
      `select bc.*, f.denomination as fournisseur_nom, d.numero as dossier_numero, d.objet,
              e.structure_id
         from bon_commande bc
         join fournisseur f on f.id = bc.fournisseur_id
         join dossier_achat d on d.id = bc.dossier_id
         left join etat_besoin e on e.id = d.etat_besoin_id
        where bc.id = $1`,
      [request.body.bon_commande_id],
    );
    if (!bon) throw nonTrouve('Ce bon de commande');
    if (bon.statut === 'annule') {
      throw donneesInvalides("Ce bon de commande est annulé : il n'y a rien à réceptionner.", 'bon_commande_id');
    }

    const structureId = bon.structure_id ?? request.agent.structure_id;
    await verifierEcritureStructure(request, structureId);

    // Invariant : qui engage ne réceptionne pas. Le bon de commande est signé
    // par celui qui l'a émis ; il ne signe pas le PV de sa propre commande.
    const bonDocument = await lireUn(request, 
      `select signataire_id from document
        where type = 'bon_commande' and objet_type = 'bon_commande' and objet_id = $1
        order by cree_le desc limit 1`,
      [String(bon.id)],
    );
    if (bonDocument?.signataire_id && String(bonDocument.signataire_id) === String(request.agent.id)) {
      throw nonAutorise(
        "Faites réceptionner par un autre agent : celui qui a émis le bon de commande ne signe pas le procès-verbal de réception.",
        'signataire_id',
      );
    }

    const ecarts = request.body.lignes
      .filter((l) => l.quantite_recue !== l.quantite_commandee || l.conforme === false)
      .map((l) => ({
        designation: l.designation,
        commandee: l.quantite_commandee,
        recue: l.quantite_recue,
        conforme: l.conforme !== false,
        observation: l.observation ?? null,
      }));

    const resultat = await enEcriture(request, async () => {
      const numero = await prochainNumero('pv_reception');
      await journaliserDepuis(request, {
        action: 'reception',
        objet_type: 'bon_commande',
        objet_id: bon.id,
        avant: { statut: bon.statut },
        apres: {
          statut: ecarts.length > 0 ? 'livre_partiel' : 'receptionne',
          pv: numero,
          lignes: request.body.lignes,
          ecarts,
        },
      });
      // Le PV est figé dès son émission : on ne le modifie plus (RG-019).
      const pv = await lireUn(request, 
        `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
                               signataire_id, signe_le, fige)
         values ('pv_reception', $1, $2, 'bon_commande', $3, $4, $5, now(), true) returning *`,
        [
          numero, structureId, String(bon.id),
          JSON.stringify({
            bon_commande: bon.numero,
            dossier: bon.dossier_numero,
            objet: bon.objet,
            fournisseur: bon.fournisseur_nom,
            site_id: request.body.site_id ?? null,
            observations: request.body.observations ?? null,
            lignes: request.body.lignes,
            ecarts,
            receptionne_par: request.agent.nom,
          }),
          request.agent.id,
        ],
      );
      const majBon = await lireUn(request, 
        `update bon_commande set statut = $2, livre_le = now() where id = $1 returning *`,
        [bon.id, ecarts.length > 0 ? 'livre_partiel' : 'receptionne'],
      );
      return { pv, bon: majBon };
    });

    // L'écart commandé / livré ouvre un examen, il ne décide rien (RG-022).
    let alerte = null;
    if (ecarts.length > 0) {
      alerte = await enEcriture(request, () => leverAlerte({
        code: 'ECART_RECEPTION',
        gravite: 'attention',
        structure_id: structureId,
        objet_type: 'bon_commande',
        objet_id: String(bon.id),
        explication: "Des quantités reçues s'écartent des quantités commandées, ou des articles sont non conformes : instruisez l'écart avant la prise en charge.",
        donnees: { bon_commande: bon.numero, ecarts },
      }));
    }

    publier({ type: 'reception', objet: 'document', id: resultat.pv.id, structure_id: structureId, donnees: { bon_commande: bon.numero, ecarts: ecarts.length } });
    reply.code(201);
    return { pv_reception: resultat.pv, bon_commande: resultat.bon, ecarts, alerte };
  });

  // --- La prise en charge à l'inventaire : RG-010, puis RG-011 --------
  app.post('/api/prises-en-charge', {
    preHandler: ecriture('comptable_matieres'),
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['bon_commande_id'],
        properties: {
          bon_commande_id: { type: 'string', format: 'uuid' },
          pv_reception_id: { type: ['string', 'null'], format: 'uuid' },
          observations: { type: ['string', 'null'], maxLength: 2000 },
          // Les articles de stock pris en charge : la quantité entre au magasin.
          articles: {
            type: 'array',
            maxItems: 200,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['stock_id', 'quantite'],
              properties: {
                stock_id: { type: 'string', format: 'uuid' },
                quantite: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const bon = await lireUn(request, 
      `select bc.*, f.denomination as fournisseur_nom, d.numero as dossier_numero, d.objet,
              e.structure_id
         from bon_commande bc
         join fournisseur f on f.id = bc.fournisseur_id
         join dossier_achat d on d.id = bc.dossier_id
         left join etat_besoin e on e.id = d.etat_besoin_id
        where bc.id = $1`,
      [request.body.bon_commande_id],
    );
    if (!bon) throw nonTrouve('Ce bon de commande');
    const structureId = bon.structure_id ?? request.agent.structure_id;
    await verifierEcritureStructure(request, structureId);

    // RG-010 — le certificat ne s'émet qu'après un PV de réception signé.
    const pv = request.body.pv_reception_id
      ? await lireUn(request, `select * from document where id = $1 and type = 'pv_reception'`, [request.body.pv_reception_id])
      : await lireUn(request, 
        `select * from document
          where type = 'pv_reception' and objet_type = 'bon_commande' and objet_id = $1
          order by cree_le desc limit 1`,
        [String(bon.id)],
      );
    appliquer(rg010({ pv_reception: pv }));
    // RG-019 — on s'appuie sur le PV figé, on ne le retouche pas.
    appliquer(rg019({ document: pv, operation: 'lecture' }));

    // Invariant : qui réceptionne ne valide pas sa propre réception.
    if (String(pv.signataire_id) === String(request.agent.id)) {
      throw nonAutorise(
        "Faites prendre en charge par un autre comptable des matières : celui qui a signé le procès-verbal de réception ne certifie pas lui-même la prise en charge.",
        'signataire_id',
      );
    }

    const dejaCertifie = await lireUn(request, 
      `select numero from document
        where type = 'certificat_prise_en_charge' and objet_type = 'bon_commande' and objet_id = $1
        order by cree_le desc limit 1`,
      [String(bon.id)],
    );
    if (dejaCertifie) {
      throw donneesInvalides(
        `Ce bon de commande porte déjà le certificat ${dejaCertifie.numero} : un document figé ne se refait pas, émettez-en un rectificatif si nécessaire.`,
        'bon_commande_id',
      );
    }

    const resultat = await enEcriture(request, async () => {
      const numero = await prochainNumero('certificat_prise_en_charge');
      await journaliserDepuis(request, {
        action: 'prise_en_charge',
        objet_type: 'bon_commande',
        objet_id: bon.id,
        avant: { statut: bon.statut, certificat: null },
        apres: {
          statut: 'receptionne',
          certificat: numero,
          pv_reception: pv.numero,
          articles: request.body.articles ?? [],
        },
      });

      const certificat = await lireUn(request, 
        `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
                               signataire_id, signe_le, fige, parent_document_id)
         values ('certificat_prise_en_charge', $1, $2, 'bon_commande', $3, $4, $5, now(), true, $6)
         returning *`,
        [
          numero, structureId, String(bon.id),
          JSON.stringify({
            bon_commande: bon.numero,
            dossier: bon.dossier_numero,
            objet: bon.objet,
            fournisseur: bon.fournisseur_nom,
            montant: bon.montant,
            pv_reception: pv.numero,
            observations: request.body.observations ?? null,
            certifie_par: request.agent.nom,
            mention: "Les biens et matières désignés ci-dessus sont pris en charge à l'inventaire. Le paiement devient possible au vu du présent certificat (décret 13/050, art. 137).",
          }),
          request.agent.id, pv.id,
        ],
      );

      // L'entrée au magasin des articles de stock pris en charge.
      const entrees = [];
      for (const article of request.body.articles ?? []) {
        const stock = await lireUn(request, 'select * from stock where id = $1', [article.stock_id]);
        if (!stock) throw nonTrouve("Un des articles de stock pris en charge");
        if (String(stock.structure_id) !== String(structureId)) {
          throw donneesInvalides(
            "Prenez en charge les articles du magasin de la structure réceptionnaire : un article d'une autre structure ne peut pas entrer ici.",
            'articles',
          );
        }
        const nouvelle = stock.quantite + article.quantite;
        await journaliserDepuis(request, {
          action: 'entree_stock',
          objet_type: 'stock',
          objet_id: stock.id,
          avant: { quantite: stock.quantite },
          apres: { quantite: nouvelle, quantite_entree: article.quantite, certificat: numero },
        });
        const maj = await lireUn(request, 
          'update stock set quantite = $2, maj_le = now() where id = $1 returning *',
          [stock.id, nouvelle],
        );
        entrees.push(maj);
      }

      return { certificat, entrees };
    });

    for (const entree of resultat.entrees) {
      publier({
        type: 'entree',
        objet: 'stock',
        id: entree.id,
        structure_id: entree.structure_id,
        quantite: entree.quantite,
        donnees: { designation: entree.designation },
      });
    }
    publier({
      type: 'prise_en_charge',
      objet: 'document',
      id: resultat.certificat.id,
      structure_id: structureId,
      donnees: { bon_commande: bon.numero, certificat: resultat.certificat.numero },
    });

    reply.code(201);
    return {
      certificat_prise_en_charge: resultat.certificat,
      pv_reception: { id: pv.id, numero: pv.numero, signe_le: pv.signe_le },
      entrees_stock: resultat.entrees,
      suite: 'Le paiement peut désormais être marqué possible par le comptable public (RG-011).',
    };
  });
}
