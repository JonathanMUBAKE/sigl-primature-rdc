// Les documents. RG-019 : un document figé n'est jamais modifié ; on émet un
// document lié, par `parent_document_id`. Il n'y a donc ici ni PUT, ni PATCH,
// ni DELETE — seulement la lecture et la rectification par un document nouveau.

import { tous, un, transaction } from '../db.js';
import { ecriture, lecture, structuresDe, verifierLecture } from './_droits.js';
import { appliquer, donneesInvalides, liste, nonTrouve, pagination, schemaIdParam, schemaPagination } from './_commun.js';
import { journaliserDepuis } from './_journal.js';
import { prochainNumero } from './_numeros.js';
import { publier } from './_flux.js';
import { rg019 } from '../regles/rg-019.js';

const TYPES = [
  'etat_besoin', 'decision_examen', 'bon_commande', 'pv_reception',
  'certificat_prise_en_charge', 'bon_livraison', 'accuse_reception',
  'acte_transfert', 'pv_perte', 'pv_reforme', 'etat_inventaire',
];

export default async function routesDocuments(app) {
  app.get('/api/documents', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: TYPES },
          objet_type: { type: 'string', maxLength: 40 },
          objet_id: { type: 'string', maxLength: 64 },
          structure: { type: 'string', format: 'uuid' },
          q: { type: 'string', maxLength: 120 },
          ...schemaPagination,
        },
      },
    },
  }, async (request) => {
    const page = pagination(request.query);
    const params = [];
    let ou = 'where true';

    if (request.query.structure) {
      await verifierLecture(request, request.query.structure);
      params.push(request.query.structure);
      ou += ` and d.structure_id = $${params.length}`;
    } else {
      const permises = await structuresDe(request);
      if (permises !== null) {
        if (permises.length === 0) return liste([], 0, page);
        const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
        params.push(...permises);
        ou += ` and d.structure_id in (${places})`;
      }
    }
    for (const [cle, colonne] of [['type', 'd.type'], ['objet_type', 'd.objet_type'], ['objet_id', 'd.objet_id']]) {
      if (request.query[cle]) {
        params.push(request.query[cle]);
        ou += ` and ${colonne} = $${params.length}`;
      }
    }
    if (request.query.q) {
      params.push(`%${request.query.q.toLowerCase()}%`);
      ou += ` and lower(d.numero) like $${params.length}`;
    }

    const total = await un(`select count(*)::int as n from document d ${ou}`, params);
    const donnees = await tous(
      `select d.id, d.type, d.numero, d.objet_type, d.objet_id, d.signataire_id, d.signe_le,
              d.fige, d.parent_document_id, d.cree_le, d.structure_id,
              s.code as structure_code, a.nom as signataire_nom
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

  app.get('/api/documents/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const document = await un(
      `select d.*, s.code as structure_code, s.nom as structure_nom, a.nom as signataire_nom,
              a.fonction as signataire_fonction
         from document d
         join structure s on s.id = d.structure_id
         left join agent a on a.id = d.signataire_id
        where d.id = $1`,
      [request.params.id],
    );
    if (!document) throw nonTrouve('Ce document');
    await verifierLecture(request, document.structure_id);

    const parent = document.parent_document_id
      ? await un('select id, type, numero, signe_le from document where id = $1', [document.parent_document_id])
      : null;
    const rectifications = await tous(
      'select id, type, numero, signe_le, cree_le from document where parent_document_id = $1 order by cree_le',
      [document.id],
    );
    return { ...document, parent, rectifications };
  });

  // La rectification : on n'altère pas la pièce, on en émet une liée (RG-019).
  app.post('/api/documents/:id/rectifier', {
    preHandler: ecriture('comptable_matieres', 'logistique', 'intendant', 'ordonnateur'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['motif', 'contenu'],
        properties: {
          motif: { type: 'string', minLength: 3, maxLength: 1000 },
          contenu: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, async (request, reply) => {
    const original = await un('select * from document where id = $1', [request.params.id]);
    if (!original) throw nonTrouve('Ce document');
    await verifierLecture(request, original.structure_id);
    // La règle, dite à l'endroit où l'on serait tenté de passer outre.
    appliquer(rg019({ document: original, operation: 'rectification' }));
    if (original.parent_document_id) {
      const dejaRectifie = await un(
        'select numero from document where parent_document_id = $1 order by cree_le desc limit 1',
        [original.id],
      );
      if (dejaRectifie) {
        throw donneesInvalides(
          `Ce document a déjà été rectifié par ${dejaRectifie.numero} : rectifiez la dernière pièce de la chaîne.`,
          'id',
        );
      }
    }

    const resultat = await transaction(async () => {
      const numero = await prochainNumero(original.type);
      await journaliserDepuis(request, {
        action: 'emission_document',
        objet_type: 'document',
        objet_id: numero,
        avant: { rectifie: original.numero, contenu: original.contenu },
        apres: { numero, motif: request.body.motif, contenu: request.body.contenu },
      });
      return un(
        `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
                               signataire_id, signe_le, fige, parent_document_id)
         values ($1,$2,$3,$4,$5,$6,$7, now(), true, $8) returning *`,
        [
          original.type, numero, original.structure_id, original.objet_type, original.objet_id,
          JSON.stringify({
            ...request.body.contenu,
            rectifie: original.numero,
            motif_rectification: request.body.motif,
          }),
          request.agent.id, original.id,
        ],
      );
    });

    publier({ type: 'rectification', objet: 'document', id: resultat.id, structure_id: resultat.structure_id });
    reply.code(201);
    return resultat;
  });
}
