// Les stocks. Le module doit être vivant : pour chaque article, sa quantité,
// ses seuils, sa consommation moyenne constatée, ses jours de couverture et la
// date de rupture prévisible. Et le tri par criticité, parce qu'un magasinier
// ouvre cet écran pour savoir ce qui va manquer.
//
// La consommation constatée est lue dans le `journal` : c'est lui qui garde la
// trace de chaque sortie, avec ses valeurs avant et après (RG-020). Aucune
// table parallèle n'est nécessaire, et le chiffre reste auditable.
//
// RG-005 : aucune sortie supérieure à la quantité existante.

import { tous, un, transaction } from '../db.js';
import { ecriture, lecture, structuresDe, verifierEcritureStructure, verifierLecture } from './_droits.js';
import { appliquer, liste, nonTrouve, pagination, schemaIdParam, schemaPagination } from './_commun.js';
import { journaliserDepuis } from './_journal.js';
import { publier } from './_flux.js';
import { rg005 } from '../regles/rg-005.js';

const FENETRE_CONSOMMATION_JOURS = 90;

const TRIS = {
  criticite: null, // calculé en mémoire : il dépend de la couverture
  designation: 'st.designation asc',
  quantite: 'st.quantite asc',
  categorie: 'st.categorie_code asc, st.designation asc',
};

/** La consommation journalière constatée, par article, d'après le journal. */
async function consommationConstatee(identifiants, jours = FENETRE_CONSOMMATION_JOURS) {
  if (identifiants.length === 0) return new Map();
  const places = identifiants.map((_, i) => `$${i + 1}`).join(', ');
  const lignes = await tous(
    `select objet_id,
            sum(coalesce((apres->>'quantite_sortie')::numeric, 0)) as sortie_totale,
            count(*)::int as nombre_sorties,
            max(horodatage) as derniere_sortie
       from journal
      where action = 'sortie_stock'
        and objet_type = 'stock'
        and objet_id in (${places})
        and horodatage > now() - ($${identifiants.length + 1} || ' days')::interval
      group by objet_id`,
    [...identifiants, String(jours)],
  );
  const carte = new Map();
  for (const l of lignes) {
    const total = Number(l.sortie_totale ?? 0);
    carte.set(String(l.objet_id), {
      sortie_totale: total,
      nombre_sorties: l.nombre_sorties,
      derniere_sortie: l.derniere_sortie,
      consommation_jour: total > 0 ? Number((total / jours).toFixed(4)) : 0,
    });
  }
  return carte;
}

/** Enrichit un article : couverture, rupture prévisible, criticité. */
export function enrichir(article, consommation) {
  const conso = consommation?.consommation_jour ?? 0;
  const quantite = Number(article.quantite ?? 0);
  const minimum = Number(article.seuil_minimum ?? 0);
  const critique = Number(article.seuil_critique ?? 0);

  const jours_couverture = conso > 0 ? Math.floor(quantite / conso) : null;
  let date_rupture_prevue = null;
  if (conso > 0 && quantite >= 0) {
    const dans = new Date(Date.now() + (quantite / conso) * 86_400_000);
    date_rupture_prevue = dans.toISOString().slice(0, 10);
  }

  let criticite = 'normal';
  if (quantite === 0) criticite = 'rupture';
  else if (quantite <= critique) criticite = 'critique';
  else if (quantite <= minimum) criticite = 'sous_minimum';
  else if (jours_couverture !== null && jours_couverture <= 30) criticite = 'rupture_prevue';

  const rang = { rupture: 0, critique: 1, sous_minimum: 2, rupture_prevue: 3, normal: 4 }[criticite];

  return {
    ...article,
    consommation_jour: conso,
    consommation_mois: Number((conso * 30).toFixed(2)),
    sorties_fenetre: consommation?.nombre_sorties ?? 0,
    derniere_sortie: consommation?.derniere_sortie ?? null,
    jours_couverture,
    date_rupture_prevue,
    rupture_sous_30_jours: jours_couverture !== null && jours_couverture <= 30,
    criticite,
    rang_criticite: rang,
    lien: `/api/stocks/${article.id}`,
  };
}

export default async function routesStocks(app) {
  app.get('/api/stocks', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          site: { type: 'string', format: 'uuid' },
          structure: { type: 'string', format: 'uuid' },
          categorie: { type: 'string', maxLength: 40 },
          q: { type: 'string', maxLength: 120 },
          sous_seuil: { type: 'boolean' },
          sous_critique: { type: 'boolean' },
          rupture: { type: 'boolean' },
          tri: { type: 'string', enum: Object.keys(TRIS), default: 'criticite' },
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
      ou += ` and st.structure_id = $${params.length}`;
    } else {
      const permises = await structuresDe(request);
      if (permises !== null) {
        if (permises.length === 0) return liste([], 0, page);
        const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
        params.push(...permises);
        ou += ` and st.structure_id in (${places})`;
      }
    }
    if (request.query.site) {
      params.push(request.query.site);
      ou += ` and st.site_id = $${params.length}`;
    }
    if (request.query.categorie) {
      params.push(request.query.categorie);
      ou += ` and st.categorie_code = $${params.length}`;
    }
    if (request.query.q) {
      params.push(`%${request.query.q.toLowerCase()}%`);
      ou += ` and lower(st.designation) like $${params.length}`;
    }
    if (request.query.sous_seuil) ou += ' and st.quantite <= st.seuil_minimum';
    if (request.query.sous_critique) ou += ' and st.quantite <= st.seuil_critique';
    if (request.query.rupture) ou += ' and st.quantite = 0';

    const total = await un(`select count(*)::int as n from stock st ${ou}`, params);
    const tri = TRIS[request.query.tri ?? 'criticite'];

    // Le tri par criticité se fait en mémoire : il dépend de la couverture
    // calculée. On charge alors la page élargie, puis on la retaille.
    const sansTri = tri === null;
    const limite = sansTri ? Math.min(total.n || 1, 1000) : page.parPage;
    const decalage = sansTri ? 0 : page.decalage;

    const brut = await tous(
      `select st.id, st.categorie_code, c.libelle as categorie_libelle, st.designation, st.unite,
              st.quantite, st.seuil_minimum, st.seuil_critique, st.structure_id,
              s.code as structure_code, s.nom as structure_nom, st.site_id, si.nom as site_nom,
              st.maj_le
         from stock st
         join categorie c on c.code = st.categorie_code
         join structure s on s.id = st.structure_id
         join site si on si.id = st.site_id
         ${ou}
        order by ${tri ?? 'st.quantite asc'}
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limite, decalage],
    );

    const consommations = await consommationConstatee(brut.map((a) => String(a.id)));
    let donnees = brut.map((a) => enrichir(a, consommations.get(String(a.id))));
    if (sansTri) {
      donnees.sort((a, b) =>
        a.rang_criticite - b.rang_criticite ||
        (a.jours_couverture ?? 9e9) - (b.jours_couverture ?? 9e9) ||
        a.designation.localeCompare(b.designation, 'fr'));
      donnees = donnees.slice(page.decalage, page.decalage + page.parPage);
    }

    return {
      ...liste(donnees, total.n, page),
      resume: {
        en_rupture: donnees.filter((a) => a.criticite === 'rupture').length,
        sous_critique: donnees.filter((a) => a.criticite === 'critique').length,
        sous_minimum: donnees.filter((a) => a.criticite === 'sous_minimum').length,
        rupture_sous_30_jours: donnees.filter((a) => a.rupture_sous_30_jours).length,
        fenetre_consommation_jours: FENETRE_CONSOMMATION_JOURS,
      },
    };
  });

  app.get('/api/stocks/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const article = await un(
      `select st.*, c.libelle as categorie_libelle, s.code as structure_code, s.nom as structure_nom,
              si.nom as site_nom
         from stock st
         join categorie c on c.code = st.categorie_code
         join structure s on s.id = st.structure_id
         join site si on si.id = st.site_id
        where st.id = $1`,
      [request.params.id],
    );
    if (!article) throw nonTrouve('Cet article de stock');
    await verifierLecture(request, article.structure_id);

    const consommations = await consommationConstatee([String(article.id)]);
    const historique = await tous(
      `select j.horodatage, j.action, j.avant, j.apres, j.agent_id, a.nom as agent_nom
         from journal j left join agent a on a.id = j.agent_id
        where j.objet_type = 'stock' and j.objet_id = $1
        order by j.horodatage desc limit 50`,
      [String(article.id)],
    );
    return { ...enrichir(article, consommations.get(String(article.id))), historique };
  });

  // --- Les sorties : RG-005 -------------------------------------------
  app.post('/api/stocks/:id/sorties', {
    preHandler: ecriture('magasinier', 'comptable_matieres', 'logistique', 'intendant'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['quantite', 'motif'],
        properties: {
          quantite: { type: 'integer', minimum: 1 },
          motif: { type: 'string', minLength: 3, maxLength: 600 },
          etat_besoin_id: { type: ['string', 'null'], format: 'uuid' },
          beneficiaire_id: { type: ['string', 'null'], format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const article = await un('select * from stock where id = $1', [request.params.id]);
    if (!article) throw nonTrouve('Cet article de stock');
    await verifierEcritureStructure(request, article.structure_id);

    // RG-005 : aucune sortie supérieure à la quantité existante.
    appliquer(rg005({
      quantite_demandee: request.body.quantite,
      quantite_disponible: article.quantite,
    }));

    const nouvelle = article.quantite - request.body.quantite;
    const resultat = await transaction(async () => {
      await journaliserDepuis(request, {
        action: 'sortie_stock',
        objet_type: 'stock',
        objet_id: article.id,
        avant: { quantite: article.quantite },
        apres: {
          quantite: nouvelle,
          quantite_sortie: request.body.quantite,
          motif: request.body.motif,
          etat_besoin_id: request.body.etat_besoin_id ?? null,
          beneficiaire_id: request.body.beneficiaire_id ?? null,
        },
      });
      return un(
        'update stock set quantite = $2, maj_le = now() where id = $1 returning *',
        [article.id, nouvelle],
      );
    });

    publier({
      type: 'sortie',
      objet: 'stock',
      id: article.id,
      structure_id: article.structure_id,
      quantite: nouvelle,
      donnees: { designation: article.designation, quantite_sortie: request.body.quantite },
    });

    reply.code(201);
    return enrichir(resultat, (await consommationConstatee([String(article.id)])).get(String(article.id)));
  });

  // --- Les entrées ----------------------------------------------------
  app.post('/api/stocks/:id/entrees', {
    preHandler: ecriture('magasinier', 'comptable_matieres', 'logistique', 'intendant'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['quantite'],
        properties: {
          quantite: { type: 'integer', minimum: 1 },
          motif: { type: ['string', 'null'], maxLength: 600 },
          bon_commande_id: { type: ['string', 'null'], format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const article = await un('select * from stock where id = $1', [request.params.id]);
    if (!article) throw nonTrouve('Cet article de stock');
    await verifierEcritureStructure(request, article.structure_id);

    const nouvelle = article.quantite + request.body.quantite;
    const resultat = await transaction(async () => {
      await journaliserDepuis(request, {
        action: 'entree_stock',
        objet_type: 'stock',
        objet_id: article.id,
        avant: { quantite: article.quantite },
        apres: {
          quantite: nouvelle,
          quantite_entree: request.body.quantite,
          motif: request.body.motif ?? null,
          bon_commande_id: request.body.bon_commande_id ?? null,
        },
      });
      return un(
        'update stock set quantite = $2, maj_le = now() where id = $1 returning *',
        [article.id, nouvelle],
      );
    });

    publier({
      type: 'entree',
      objet: 'stock',
      id: article.id,
      structure_id: article.structure_id,
      quantite: nouvelle,
      donnees: { designation: article.designation, quantite_entree: request.body.quantite },
    });

    reply.code(201);
    return enrichir(resultat, (await consommationConstatee([String(article.id)])).get(String(article.id)));
  });

  // Les seuils : c'est un réglage de magasin, pas une écriture comptable.
  app.patch('/api/stocks/:id/seuils', {
    preHandler: ecriture('magasinier', 'comptable_matieres', 'logistique'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['seuil_minimum', 'seuil_critique'],
        properties: {
          seuil_minimum: { type: 'integer', minimum: 0 },
          seuil_critique: { type: 'integer', minimum: 0 },
        },
      },
    },
  }, async (request) => {
    const article = await un('select * from stock where id = $1', [request.params.id]);
    if (!article) throw nonTrouve('Cet article de stock');
    await verifierEcritureStructure(request, article.structure_id);
    if (request.body.seuil_critique > request.body.seuil_minimum) {
      throw appliquer({
        code: 'donnees_invalides',
        message: 'Portez le seuil critique au niveau du seuil minimum ou en dessous : le critique est le plus bas des deux.',
        champ: 'seuil_critique',
      }, 400);
    }
    const resultat = await transaction(async () => {
      await journaliserDepuis(request, {
        action: 'reglage_seuils_stock',
        objet_type: 'stock',
        objet_id: article.id,
        avant: { seuil_minimum: article.seuil_minimum, seuil_critique: article.seuil_critique },
        apres: { seuil_minimum: request.body.seuil_minimum, seuil_critique: request.body.seuil_critique },
      });
      return un(
        'update stock set seuil_minimum = $2, seuil_critique = $3, maj_le = now() where id = $1 returning *',
        [article.id, request.body.seuil_minimum, request.body.seuil_critique],
      );
    });
    publier({ type: 'seuils', objet: 'stock', id: article.id, structure_id: article.structure_id, quantite: resultat.quantite });
    return resultat;
  });
}
