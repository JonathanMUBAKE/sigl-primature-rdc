// GET /api/journal — le journal, en lecture, pour le contrôle externe.
//
// Le journal est en insertion seule : il n'y a ici aucune route de
// modification ni de suppression, et il n'y en aura pas. Le contrôle externe
// (IGF, Cour des comptes) le lit en entier ; les autres rôles n'y accèdent
// qu'au travers de l'historique de l'objet qu'ils consultent.

import { tous, un } from '../db.js';
import { lecture } from './_droits.js';
import { liste, pagination, schemaPagination } from './_commun.js';

export default async function routesJournal(app) {
  app.get('/api/journal', {
    // Le contrôle externe lit tout, y compris le journal. La direction le lit
    // aussi, sans jamais y écrire. L'administrateur, lui, n'y touche pas.
    preHandler: lecture('controle_externe', 'direction'),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', maxLength: 60 },
          objet_type: { type: 'string', maxLength: 40 },
          objet_id: { type: 'string', maxLength: 64 },
          agent: { type: 'string', format: 'uuid' },
          du: { type: 'string', format: 'date' },
          au: { type: 'string', format: 'date' },
          q: { type: 'string', maxLength: 120 },
          ...schemaPagination,
        },
      },
    },
  }, async (request) => {
    const page = pagination(request.query, 100);
    const params = [];
    let ou = 'where true';
    for (const [cle, colonne] of [
      ['action', 'j.action'], ['objet_type', 'j.objet_type'],
      ['objet_id', 'j.objet_id'], ['agent', 'j.agent_id'],
    ]) {
      if (request.query[cle]) {
        params.push(request.query[cle]);
        ou += ` and ${colonne} = $${params.length}`;
      }
    }
    if (request.query.du) {
      params.push(request.query.du);
      ou += ` and j.horodatage >= $${params.length}::date`;
    }
    if (request.query.au) {
      params.push(request.query.au);
      ou += ` and j.horodatage < ($${params.length}::date + interval '1 day')`;
    }
    if (request.query.q) {
      params.push(`%${request.query.q.toLowerCase()}%`);
      ou += ` and (lower(j.action) like $${params.length} or lower(coalesce(j.objet_id, '')) like $${params.length})`;
    }

    const total = await un(`select count(*)::int as n from journal j ${ou}`, params);
    const donnees = await tous(
      `select j.id, j.horodatage, j.action, j.objet_type, j.objet_id, j.avant, j.apres, j.ip,
              j.agent_id, a.nom as agent_nom, a.fonction as agent_fonction,
              s.code as structure_code, s.nom as structure_nom
         from journal j
         left join agent a on a.id = j.agent_id
         left join structure s on s.id = a.structure_id
         ${ou}
        order by j.horodatage desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(donnees, total.n, page);
  });

  // Les actions distinctes, pour alimenter le filtre de l'écran de contrôle.
  app.get('/api/journal/actions', {
    preHandler: lecture('controle_externe', 'direction'),
  }, async () => {
    const donnees = await tous(
      `select action, objet_type, count(*)::int as nombre, max(horodatage) as derniere
         from journal group by action, objet_type order by nombre desc`,
    );
    return { donnees, total: donnees.length, page: 1, parPage: donnees.length };
  });
}
