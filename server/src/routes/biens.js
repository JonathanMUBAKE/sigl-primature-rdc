// Le patrimoine : la fiche du bien, son immatriculation, ses mouvements.
//
// Règles tenues ici : RG-012 (coût de remplacement d'un stock distribué),
// RG-013 (pièces de rechange en stock), RG-014 (base d'évaluation selon le mode
// d'entrée), RG-015 (un bien ne disparaît jamais), RG-016 (le SIGL instruit la
// réforme, il ne la prononce pas), RG-018 (une autonome n'est pas écrite par le
// central), RG-020 (journal avant confirmation), RG-021 (le lot n'est pas
// immatriculé).

import { enEcriture, enLecture, lireTous, lireUn } from './_sql.js';
import { ecriture, lecture, structuresDe, verifierEcritureStructure, verifierLecture } from './_droits.js';
import {
  appliquer, appliquerToutes, liste, nonTrouve, pagination, schemaIdParam, schemaPagination,
  donneesInvalides,
} from './_commun.js';
import { journaliserDepuis } from './_journal.js';
import { prochaineImmatriculation, prochainNumero } from './_numeros.js';
import { seuilSuiviIndividuel } from './_parametres.js';
import { publier } from './_flux.js';
import { rg012 } from '../regles/rg-012.js';
import { rg013 } from '../regles/rg-013.js';
import { rg014, baseEvaluationAttendue } from '../regles/rg-014.js';
import { rg015 } from '../regles/rg-015.js';
import { rg016 } from '../regles/rg-016.js';
import { rg021, suiviAttendu } from '../regles/rg-021.js';

const ETATS = ['neuf', 'bon', 'a_reparer', 'hors_service', 'en_maintenance', 'reforme', 'perdu'];
const TYPES_MOUVEMENT = [
  'entree', 'sortie', 'transfert', 'maintenance', 'retour_maintenance',
  'perte', 'declassement', 'reforme', 'reemploi',
];

// L'état où un mouvement porte le bien. RG-015 : il reste au registre.
const ETAT_APRES = {
  maintenance: 'en_maintenance',
  retour_maintenance: 'bon',
  perte: 'perdu',
  reforme: 'reforme',
  declassement: 'a_reparer',
};

const schemaBien = {
  type: 'object',
  additionalProperties: false,
  required: ['categorie_code', 'designation', 'valeur_acquisition', 'date_acquisition', 'structure_id'],
  properties: {
    categorie_code: { type: 'string', minLength: 1, maxLength: 40 },
    designation: { type: 'string', minLength: 2, maxLength: 200 },
    marque: { type: ['string', 'null'], maxLength: 80 },
    modele: { type: ['string', 'null'], maxLength: 80 },
    numero_serie: { type: ['string', 'null'], maxLength: 80 },
    classement: { type: 'string', enum: ['immobilisation', 'stock'] },
    objectif_detention: { type: 'string', enum: ['operationnelle', 'financiere'] },
    mode_entree: { type: 'string', enum: ['achat', 'don', 'transfert'] },
    valeur_acquisition: { type: 'number', minimum: 0 },
    cout_remplacement: { type: ['number', 'null'], minimum: 0 },
    date_acquisition: { type: 'string', format: 'date' },
    etat: { type: 'string', enum: ETATS },
    structure_id: { type: 'string', format: 'uuid' },
    site_id: { type: ['string', 'null'], format: 'uuid' },
    detenteur_id: { type: ['string', 'null'], format: 'uuid' },
    suivi: { type: 'string', enum: ['individuel', 'lot'] },
    quantite: { type: 'integer', minimum: 1 },
    distribution_gratuite: { type: 'boolean' },
    piece_rechange: { type: 'boolean' },
    repond_definition_immobilisation: { type: 'boolean' },
    photo_url: { type: ['string', 'null'], maxLength: 400 },
  },
};

export default async function routesBiens(app) {
  // --- La liste, filtrée et paginée -------------------------------------
  app.get('/api/biens', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          structure: { type: 'string', format: 'uuid' },
          site: { type: 'string', format: 'uuid' },
          categorie: { type: 'string', maxLength: 40 },
          etat: { type: 'string', enum: ETATS },
          classement: { type: 'string', enum: ['immobilisation', 'stock'] },
          suivi: { type: 'string', enum: ['individuel', 'lot'] },
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
      ou += ` and b.structure_id = $${params.length}`;
    } else {
      const permises = await structuresDe(request);
      if (permises !== null) {
        if (permises.length === 0) return liste([], 0, page);
        const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
        params.push(...permises);
        ou += ` and b.structure_id in (${places})`;
      }
    }
    for (const [cle, colonne] of [['site', 'b.site_id'], ['categorie', 'b.categorie_code'], ['etat', 'b.etat'], ['classement', 'b.classement'], ['suivi', 'b.suivi']]) {
      if (request.query[cle]) {
        params.push(request.query[cle]);
        ou += ` and ${colonne} = $${params.length}`;
      }
    }
    if (request.query.q) {
      params.push(`%${request.query.q.toLowerCase()}%`);
      ou += ` and (lower(b.designation) like $${params.length} or lower(coalesce(b.immatriculation, '')) like $${params.length}
                   or lower(coalesce(b.marque, '')) like $${params.length} or lower(coalesce(b.numero_serie, '')) like $${params.length})`;
    }

    const total = await lireUn(request, `select count(*)::int as n from bien b ${ou}`, params);
    const donnees = await lireTous(request, 
      `select b.id, b.immatriculation, b.designation, b.marque, b.modele, b.categorie_code,
              c.libelle as categorie_libelle, b.classement, b.etat, b.suivi, b.quantite,
              b.valeur_acquisition, b.cout_remplacement, b.date_acquisition, b.mode_entree,
              b.objectif_detention, b.structure_id, s.code as structure_code, s.nom as structure_nom,
              s.regime as structure_regime, b.site_id, si.nom as site_nom,
              b.detenteur_id, a.nom as detenteur_nom, b.reforme_le, b.maj_le
         from bien b
         join categorie c on c.code = b.categorie_code
         join structure s on s.id = b.structure_id
         left join site si on si.id = b.site_id
         left join agent a on a.id = b.detenteur_id
         ${ou}
        order by b.maj_le desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(donnees, total.n, page);
  });

  // --- La fiche ----------------------------------------------------------
  app.get('/api/biens/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const bien = await lireUn(request, 
      `select b.*, c.libelle as categorie_libelle, c.classement as categorie_classement,
              s.code as structure_code, s.nom as structure_nom, s.regime as structure_regime,
              si.nom as site_nom, a.nom as detenteur_nom
         from bien b
         join categorie c on c.code = b.categorie_code
         join structure s on s.id = b.structure_id
         left join site si on si.id = b.site_id
         left join agent a on a.id = b.detenteur_id
        where b.id = $1`,
      [request.params.id],
    );
    if (!bien) throw nonTrouve('Ce bien');
    await verifierLecture(request, bien.structure_id);

    const mouvements = await lireTous(request, 
      `select m.id, m.type, m.quantite, m.date, m.motif, m.structure_source_code, m.structure_cible_code,
              m.document_id, m.agent_id, ag.nom as agent_nom, m.cree_le
         from mouvement m left join agent ag on ag.id = m.agent_id
        where m.bien_id = $1 order by m.date desc, m.cree_le desc`,
      [bien.id],
    );
    const documents = await lireTous(request, 
      `select id, type, numero, signe_le, signataire_id, fige, cree_le
         from document where objet_type = 'bien' and objet_id = $1 order by cree_le desc`,
      [String(bien.id)],
    );
    return { ...bien, mouvements, documents };
  });

  // --- La création : immatriculation et journal -------------------------
  app.post('/api/biens', {
    preHandler: ecriture('comptable_matieres', 'magasinier', 'logistique', 'intendant'),
    schema: { body: schemaBien },
  }, async (request, reply) => {
    const corps = request.body;
    // RG-018 : une autonome n'est jamais écrite par le niveau central.
    const structure = await verifierEcritureStructure(request, corps.structure_id);

    const categorie = await lireUn(request, 
      'select code, libelle, parent_code, classement from categorie where code = $1',
      [corps.categorie_code],
    );
    if (!categorie) throw nonTrouve('Cette catégorie de la nomenclature');

    // Le classement par défaut est hérité de la catégorie, surchargeable.
    const classement = corps.classement ?? categorie.classement;
    const mode_entree = corps.mode_entree ?? 'achat';
    const base_evaluation = baseEvaluationAttendue({ mode_entree, classement });

    // Le seuil de suivi individuel est un paramètre, pas une constante.
    const seuil = await enLecture(request, () => seuilSuiviIndividuel(corps.date_acquisition));
    const suivi = suiviAttendu({
      suivi: corps.suivi,
      valeur_acquisition: corps.valeur_acquisition,
      seuil_suivi_individuel: seuil,
    });

    const candidat = {
      ...corps,
      classement,
      mode_entree,
      base_evaluation,
      suivi,
      quantite: corps.quantite ?? 1,
      distribution_gratuite: corps.distribution_gratuite ?? false,
    };

    appliquerToutes([
      rg012(candidat),
      rg013({ bien: candidat, categorie }),
      rg014(candidat),
      rg021({ ...candidat, immatriculation: null }),
    ]);

    const resultat = await enEcriture(request, async () => {
      // RG-021 : seul un bien suivi en individuel reçoit une immatriculation.
      const immatriculation = suivi === 'individuel'
        ? await prochaineImmatriculation(structure.code, categorie.code)
        : null;

      // RG-020 : le journal est écrit avant que l'action soit confirmée.
      await journaliserDepuis(request, {
        action: 'creation_bien',
        objet_type: 'bien',
        objet_id: immatriculation ?? candidat.designation,
        avant: null,
        apres: { ...candidat, immatriculation },
      });

      const bien = await lireUn(request, 
        `insert into bien (immatriculation, categorie_code, designation, marque, modele, numero_serie,
                           classement, objectif_detention, mode_entree, valeur_acquisition, cout_remplacement,
                           date_acquisition, etat, structure_id, site_id, detenteur_id, suivi, quantite,
                           distribution_gratuite, photo_url)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         returning *`,
        [
          immatriculation, candidat.categorie_code, candidat.designation, candidat.marque ?? null,
          candidat.modele ?? null, candidat.numero_serie ?? null, classement,
          candidat.objectif_detention ?? 'operationnelle', mode_entree, candidat.valeur_acquisition,
          candidat.cout_remplacement ?? null, candidat.date_acquisition, candidat.etat ?? 'neuf',
          candidat.structure_id, candidat.site_id ?? null, candidat.detenteur_id ?? null, suivi,
          candidat.quantite, candidat.distribution_gratuite, candidat.photo_url ?? null,
        ],
      );

      // L'entrée au patrimoine est un mouvement : le registre dit tout.
      await lireUn(request, 
        `insert into mouvement (bien_id, structure_id, type, quantite, date, structure_cible_code, motif, agent_id)
         values ($1, $2, 'entree', $3, $4, $5, $6, $7)`,
        [
          bien.id, bien.structure_id, bien.quantite, bien.date_acquisition, structure.code,
          `Entrée au patrimoine par ${mode_entree}`, request.agent.id,
        ],
      );
      return bien;
    });

    publier({
      type: 'creation',
      objet: 'patrimoine',
      id: resultat.id,
      structure_id: resultat.structure_id,
      donnees: { immatriculation: resultat.immatriculation, designation: resultat.designation },
    });

    reply.code(201);
    return { ...resultat, base_evaluation };
  });

  // --- Les mouvements ----------------------------------------------------
  app.post('/api/biens/:id/mouvements', {
    preHandler: ecriture('comptable_matieres', 'magasinier', 'logistique', 'intendant'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['type'],
        properties: {
          type: { type: 'string', enum: TYPES_MOUVEMENT },
          quantite: { type: 'integer', minimum: 1 },
          date: { type: 'string', format: 'date' },
          structure_cible_code: { type: ['string', 'null'], maxLength: 20 },
          detenteur_cible: { type: ['string', 'null'], format: 'uuid' },
          site_cible: { type: ['string', 'null'], format: 'uuid' },
          motif: { type: ['string', 'null'], maxLength: 600 },
          action: { type: 'string', maxLength: 60 },
        },
      },
    },
  }, async (request, reply) => {
    const { type } = request.body;
    // RG-016 : le SIGL instruit la réforme et produit le PV, il ne la prononce pas.
    appliquer(rg016({ action: request.body.action ?? `mouvement_${type}` }));

    const bien = await lireUn(request, 
      `select b.*, s.code as structure_code, s.regime as structure_regime
         from bien b join structure s on s.id = b.structure_id where b.id = $1`,
      [request.params.id],
    );
    if (!bien) throw nonTrouve('Ce bien');
    await verifierEcritureStructure(request, bien.structure_id);

    const quantite = request.body.quantite ?? bien.quantite ?? 1;
    if (bien.suivi === 'lot' && quantite > bien.quantite) {
      throw donneesInvalides(
        `Réduisez la quantité à ${bien.quantite} au plus : le lot n'en compte pas davantage.`,
        'quantite',
      );
    }
    if ((type === 'perte' || type === 'reforme') && !(request.body.motif ?? '').trim()) {
      throw donneesInvalides(
        `Écrivez le motif de la ${type === 'perte' ? 'perte' : 'réforme'} : il figure au procès-verbal.`,
        'motif',
      );
    }

    const etatCible = ETAT_APRES[type] ?? bien.etat;
    // RG-015 : la fiche n'est jamais effacée, c'est l'état qui change.
    appliquer(rg015({ type_mouvement: type, etat_cible: etatCible, supprime_la_fiche: false }));

    const date = request.body.date ?? new Date().toISOString().slice(0, 10);
    const avant = {
      etat: bien.etat, structure_id: bien.structure_id, site_id: bien.site_id,
      detenteur_id: bien.detenteur_id, quantite: bien.quantite, reforme_le: bien.reforme_le,
    };

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: type === 'reforme' ? 'reforme' : type === 'perte' ? 'perte' : 'mouvement_bien',
        objet_type: 'bien',
        objet_id: bien.id,
        avant,
        apres: { etat: etatCible, type_mouvement: type, quantite, motif: request.body.motif ?? null },
      });

      // Le PV accompagne la perte et la réforme : la pièce est figée (RG-019).
      let document = null;
      if (type === 'perte' || type === 'reforme') {
        const typeDocument = type === 'perte' ? 'pv_perte' : 'pv_reforme';
        const numero = await prochainNumero(typeDocument);
        document = await lireUn(request, 
          `insert into document (type, numero, structure_id, objet_type, objet_id, contenu, fige)
           values ($1, $2, $3, 'bien', $4, $5, true) returning *`,
          [
            typeDocument, numero, bien.structure_id, String(bien.id),
            JSON.stringify({
              immatriculation: bien.immatriculation,
              designation: bien.designation,
              quantite,
              motif: request.body.motif,
              etat_avant: bien.etat,
              etat_apres: etatCible,
              instruit_par: request.agent.nom,
              mention: "Le SIGL instruit et produit le procès-verbal ; la décision appartient à l'autorité compétente qui le signe.",
            }),
          ],
        );
      }

      const mouvement = await lireUn(request, 
        `insert into mouvement (bien_id, structure_id, type, quantite, date, structure_source_code,
                                structure_cible_code, detenteur_cible, motif, document_id, agent_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
        [
          bien.id, bien.structure_id, type, quantite, date, bien.structure_code,
          request.body.structure_cible_code ?? null,
          request.body.detenteur_cible ?? null, request.body.motif ?? null,
          document?.id ?? null, request.agent.id,
        ],
      );

      const apres = await lireUn(request, 
        `update bien set etat = $2,
                site_id = coalesce($3, site_id),
                detenteur_id = coalesce($4, detenteur_id),
                reforme_le = case when $2 = 'reforme' then $5::date else reforme_le end,
                maj_le = now()
          where id = $1 returning *`,
        [bien.id, etatCible, request.body.site_cible ?? null, request.body.detenteur_cible ?? null, date],
      );
      return { mouvement, bien: apres, document };
    });

    publier({
      type: `mouvement_${type}`,
      objet: 'patrimoine',
      id: bien.id,
      structure_id: bien.structure_id,
      donnees: { etat: etatCible, quantite },
    });

    reply.code(201);
    return resultat;
  });
}
