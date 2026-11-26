// GET /api/sante — l'état du serveur et de la base, sans droit requis.
// Elle sert aussi d'écran de sélection de profil : la liste des agents et de
// leurs rôles, pour la démonstration.

import { tous, un } from '../db.js';

export default async function routesSante(app) {
  app.get('/api/sante', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            etat: { type: 'string' },
            base: { type: 'string' },
            migrations: { type: 'integer' },
            horodatage: { type: 'string' },
            agent: { type: ['object', 'null'], additionalProperties: true },
          },
        },
      },
    },
  }, async (request) => {
    let base = 'indisponible';
    let migrations = 0;
    try {
      const ligne = await un('select count(*)::int as n from migration');
      migrations = ligne?.n ?? 0;
      base = 'disponible';
    } catch {
      base = 'indisponible';
    }
    return {
      etat: base === 'disponible' ? 'en_service' : 'degrade',
      base,
      migrations,
      horodatage: new Date().toISOString(),
      agent: request.agent
        ? {
            id: request.agent.id,
            nom: request.agent.nom,
            fonction: request.agent.fonction,
            structure: request.agent.structure_nom,
            structure_id: request.agent.structure_id,
            regime: request.agent.structure_regime,
            roles: request.agent.roles,
          }
        : null,
    };
  });

  // Les profils disponibles pour la démonstration : qui peut se présenter.
  app.get('/api/profils', async () => {
    const donnees = await tous(
      `select a.id, a.nom, a.fonction, a.email, s.code as structure_code, s.nom as structure_nom,
              s.regime as structure_regime,
              coalesce(array_agg(ar.role_code) filter (where ar.role_code is not null), '{}') as roles
         from agent a
         join structure s on s.id = a.structure_id
         left join agent_role ar on ar.agent_id = a.id
        where a.actif
        group by a.id, a.nom, a.fonction, a.email, s.code, s.nom, s.regime
        order by s.code, a.nom`,
    );
    return { donnees, total: donnees.length, page: 1, parPage: donnees.length };
  });
}
