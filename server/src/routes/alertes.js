// Les alertes. RG-022 : aucune alerte ne décide quoi que ce soit. Elle ouvre un
// examen, un humain tranche, et la suite est conservée.
//
// Le traitement n'écrit donc que le statut, l'instructeur et la suite. Rien
// d'autre : ni le dossier d'achat, ni le stock, ni l'état de besoin.

import { tous, un, transaction } from '../db.js';
import { ecriture, lecture, structuresDe, verifierLecture } from './_droits.js';
import { appliquer, liste, nonTrouve, pagination, schemaIdParam, schemaPagination } from './_commun.js';
import { journaliserDepuis } from './_journal.js';
import { publier } from './_flux.js';
import { rg022 } from '../regles/rg-022.js';

const STATUTS = ['ouverte', 'en_examen', 'justifiee', 'confirmee', 'classee'];
const GRAVITES = ['information', 'attention', 'critique'];

export default async function routesAlertes(app) {
  app.get('/api/alertes', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          statut: { type: 'string', enum: STATUTS },
          gravite: { type: 'string', enum: GRAVITES },
          code: { type: 'string', maxLength: 40 },
          objet_type: { type: 'string', maxLength: 40 },
          structure: { type: 'string', format: 'uuid' },
          ouvertes: { type: 'boolean' },
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
      ou += ` and al.structure_id = $${params.length}`;
    } else {
      const permises = await structuresDe(request);
      if (permises !== null) {
        if (permises.length === 0) return liste([], 0, page);
        const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
        params.push(...permises);
        ou += ` and al.structure_id in (${places})`;
      }
    }
    for (const [cle, colonne] of [
      ['statut', 'al.statut'], ['gravite', 'al.gravite'],
      ['code', 'al.code'], ['objet_type', 'al.objet_type'],
    ]) {
      if (request.query[cle]) {
        params.push(request.query[cle]);
        ou += ` and ${colonne} = $${params.length}`;
      }
    }
    if (request.query.ouvertes) ou += ` and al.statut in ('ouverte', 'en_examen')`;

    const total = await un(`select count(*)::int as n from alerte al ${ou}`, params);
    const donnees = await tous(
      `select al.*, s.code as structure_code, s.nom as structure_nom, a.nom as traite_par_nom,
              extract(day from now() - al.cree_le)::int as anciennete_jours
         from alerte al
         join structure s on s.id = al.structure_id
         left join agent a on a.id = al.traite_par
         ${ou}
        order by case al.gravite when 'critique' then 0 when 'attention' then 1 else 2 end,
                 al.cree_le desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(donnees, total.n, page);
  });

  app.get('/api/alertes/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const alerte = await un(
      `select al.*, s.code as structure_code, s.nom as structure_nom, a.nom as traite_par_nom
         from alerte al
         join structure s on s.id = al.structure_id
         left join agent a on a.id = al.traite_par
        where al.id = $1`,
      [request.params.id],
    );
    if (!alerte) throw nonTrouve('Cette alerte');
    await verifierLecture(request, alerte.structure_id);
    return alerte;
  });

  // --- Le traitement : RG-022 -----------------------------------------
  app.post('/api/alertes/:id/traiter', {
    preHandler: ecriture('logistique', 'intendant', 'ordonnateur', 'comptable_public', 'controle_budget', 'comptable_matieres'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['statut'],
        properties: {
          statut: { type: 'string', enum: STATUTS },
          suite: { type: ['string', 'null'], maxLength: 2000 },
        },
      },
    },
  }, async (request) => {
    const alerte = await un('select * from alerte where id = $1', [request.params.id]);
    if (!alerte) throw nonTrouve('Cette alerte');
    await verifierLecture(request, alerte.structure_id);

    // RG-022 — le traitement n'écrit que le statut, l'instructeur et la suite.
    // Les champs sont énumérés pour que la règle les voie : rien ne passe à côté.
    appliquer(rg022({
      statut: request.body.statut,
      suite: request.body.suite,
      changements: {
        statut: request.body.statut,
        suite: request.body.suite ?? null,
        traite_par: request.agent.id,
        traite_le: 'now()',
      },
    }));

    const resultat = await transaction(async () => {
      await journaliserDepuis(request, {
        action: 'traitement_alerte',
        objet_type: 'alerte',
        objet_id: alerte.id,
        avant: { statut: alerte.statut, suite: alerte.suite, traite_par: alerte.traite_par },
        apres: { statut: request.body.statut, suite: request.body.suite ?? null, traite_par: request.agent.id },
      });
      const tranchee = !['ouverte', 'en_examen'].includes(request.body.statut);
      return un(
        `update alerte set statut = $2, suite = $3,
                traite_par = case when $4 then $5::uuid else traite_par end,
                traite_le = case when $4 then now() else traite_le end
          where id = $1 returning *`,
        [alerte.id, request.body.statut, request.body.suite ?? null, tranchee, request.agent.id],
      );
    });

    publier({
      type: 'traitement',
      objet: 'alerte',
      id: alerte.id,
      structure_id: alerte.structure_id,
      donnees: { statut: resultat.statut },
    });
    return resultat;
  });
}
