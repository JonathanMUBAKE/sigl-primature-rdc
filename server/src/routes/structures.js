// GET /api/structures — le référentiel des structures, avec leur régime.
// Le régime (integre / autonome) est la distinction majeure du modèle : il est
// toujours rendu, pour que l'interface ne mélange jamais les deux.

import { lireTous, lireUn } from './_sql.js';
import { lecture, structuresDe, verifierLecture } from './_droits.js';
import { liste, nonTrouve, pagination, schemaPagination, schemaIdParam } from './_commun.js';

export default async function routesStructures(app) {
  app.get('/api/structures', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          regime: { type: 'string', enum: ['integre', 'autonome'] },
          type: {
            type: 'string',
            enum: ['cabinet', 'secretariat_general', 'cellule', 'etablissement_public', 'service'],
          },
          q: { type: 'string', maxLength: 120 },
          actif: { type: 'boolean' },
          ...schemaPagination,
        },
      },
    },
  }, async (request) => {
    const page = pagination(request.query);
    const permises = await structuresDe(request);
    const params = [];
    let ou = 'where true';
    if (request.query.regime) {
      params.push(request.query.regime);
      ou += ` and s.regime = $${params.length}`;
    }
    if (request.query.type) {
      params.push(request.query.type);
      ou += ` and s.type = $${params.length}`;
    }
    if (request.query.q) {
      params.push(`%${request.query.q.toLowerCase()}%`);
      ou += ` and (lower(s.nom) like $${params.length} or lower(s.code) like $${params.length})`;
    }
    if (request.query.actif !== undefined) {
      params.push(request.query.actif);
      ou += ` and s.actif = $${params.length}`;
    }
    // RG-017 : hors portée totale, on ne voit que son périmètre.
    if (permises !== null) {
      if (permises.length === 0) {
        return liste([], 0, page);
      }
      const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
      params.push(...permises);
      ou += ` and s.id in (${places})`;
    }

    const total = await lireUn(request, `select count(*)::int as n from structure s ${ou}`, params);
    const donnees = await lireTous(request, 
      `select s.id, s.code, s.nom, s.type, s.regime, s.parent_id, s.actif,
              p.code as parent_code, p.nom as parent_nom,
              (select count(*)::int from bien b where b.structure_id = s.id) as nombre_biens,
              (select count(*)::int from site si where si.structure_id = s.id) as nombre_sites
         from structure s
         left join structure p on p.id = s.parent_id
         ${ou}
        order by s.regime, s.code
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(donnees, total.n, page);
  });

  app.get('/api/structures/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const structure = await lireUn(request, 
      `select s.*, p.code as parent_code, p.nom as parent_nom
         from structure s left join structure p on p.id = s.parent_id
        where s.id = $1`,
      [request.params.id],
    );
    if (!structure) throw nonTrouve('Cette structure');
    await verifierLecture(request, structure.id);
    const sites = await lireTous(request, 
      'select id, nom, adresse, ville, actif from site where structure_id = $1 order by nom',
      [structure.id],
    );
    return { ...structure, sites };
  });

  // Les sites, utiles aux écrans de stock et de mouvement.
  app.get('/api/sites', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: { structure: { type: 'string', format: 'uuid' }, ...schemaPagination },
      },
    },
  }, async (request) => {
    const page = pagination(request.query);
    const permises = await structuresDe(request);
    const params = [];
    let ou = 'where true';
    if (request.query.structure) {
      await verifierLecture(request, request.query.structure);
      params.push(request.query.structure);
      ou += ` and si.structure_id = $${params.length}`;
    }
    if (permises !== null) {
      if (permises.length === 0) return liste([], 0, page);
      const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
      params.push(...permises);
      ou += ` and si.structure_id in (${places})`;
    }
    const total = await lireUn(request, `select count(*)::int as n from site si ${ou}`, params);
    const donnees = await lireTous(request, 
      `select si.id, si.nom, si.adresse, si.ville, si.actif, si.structure_id, s.code as structure_code
         from site si join structure s on s.id = si.structure_id
         ${ou}
        order by s.code, si.nom
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(donnees, total.n, page);
  });

  // La nomenclature : indispensable à tout formulaire de bien ou de ligne.
  app.get('/api/categories', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          classement: { type: 'string', enum: ['immobilisation', 'stock'] },
          q: { type: 'string', maxLength: 120 },
        },
      },
    },
  }, async (request) => {
    const params = [];
    let ou = 'where actif';
    if (request.query.classement) {
      params.push(request.query.classement);
      ou += ` and classement = $${params.length}`;
    }
    if (request.query.q) {
      params.push(`%${request.query.q.toLowerCase()}%`);
      ou += ` and (lower(libelle) like $${params.length} or lower(code) like $${params.length})`;
    }
    const donnees = await lireTous(request, 
      `select code, libelle, parent_code, classement, duree_amortissement, unite
         from categorie ${ou} order by code`,
      params,
    );
    return { donnees, total: donnees.length, page: 1, parPage: donnees.length };
  });
}
