// Le circuit du besoin : brouillon, visa, examen, accusé, clôture.
//
// La pièce maîtresse est l'examen : validation totale, partielle motivée ou
// rejet motivé, puis **aiguillage ligne par ligne** entre le stock et l'achat.
// Une demande ne doit pas attendre son article le plus lent : ce qui est
// disponible en magasin devient servable tout de suite, le reste part en achat,
// et chaque ligne porte son origine.
//
// Règles tenues ici : RG-001, RG-002 (visa), RG-003, RG-004 (examen),
// RG-006 (clôture), RG-017/RG-018 (portée), RG-019 (document figé),
// RG-020 (journal avant confirmation).

import { tous, un, transaction } from '../db.js';
import {
  ecriture, lecture, structuresDe, verifierEcritureStructure, verifierLecture,
} from './_droits.js';
import {
  appliquer, appliquerToutes, donneesInvalides, liste, nonAutorise, nonTrouve,
  pagination, schemaIdParam, schemaPagination,
} from './_commun.js';
import { journaliserDepuis } from './_journal.js';
import { prochainNumero } from './_numeros.js';
import { publier } from './_flux.js';
import { rg001 } from '../regles/rg-001.js';
import { rg002 } from '../regles/rg-002.js';
import { rg003 } from '../regles/rg-003.js';
import { rg004 } from '../regles/rg-004.js';
import { rg006 } from '../regles/rg-006.js';
import { rg019 } from '../regles/rg-019.js';

const STATUTS = [
  'brouillon', 'vise', 'recu', 'examine', 'partiel', 'rejete',
  'en_achat', 'livrable', 'livre', 'clos',
];

/**
 * L'aiguillage d'une ligne accordée : stock si le magasin du périmètre peut la
 * servir, achat sinon. Fonction de décision, nourrie de données déjà chargées.
 */
export function aiguiller(ligne, quantiteAccordee, disponibleEnStock) {
  if (quantiteAccordee <= 0) return 'refuse';
  return disponibleEnStock >= quantiteAccordee ? 'stock' : 'achat';
}

/** Le statut de l'état de besoin après l'examen, d'après ses lignes. */
export function statutApresExamen(lignes) {
  const accordees = lignes.filter((l) => l.origine !== 'refuse');
  if (accordees.length === 0) return 'rejete';
  const refusEnPartie = lignes.some(
    (l) => l.origine === 'refuse' || l.quantite_accordee < l.quantite_demandee,
  );
  if (refusEnPartie) return 'partiel';
  // Rien n'attend l'article le plus lent : s'il y a du servable, l'état est livrable.
  return accordees.some((l) => l.origine === 'stock') ? 'livrable' : 'en_achat';
}

export default async function routesBesoins(app) {
  // --- La liste ---------------------------------------------------------
  app.get('/api/besoins', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          statut: { type: 'string', enum: STATUTS },
          structure: { type: 'string', format: 'uuid' },
          demandeur: { type: 'string', format: 'uuid' },
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
      ou += ` and e.structure_id = $${params.length}`;
    } else {
      const permises = await structuresDe(request);
      if (permises !== null) {
        if (permises.length === 0) return liste([], 0, page);
        const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
        params.push(...permises);
        ou += ` and e.structure_id in (${places})`;
      }
    }
    if (request.query.statut) {
      params.push(request.query.statut);
      ou += ` and e.statut = $${params.length}`;
    }
    if (request.query.demandeur) {
      params.push(request.query.demandeur);
      ou += ` and e.demandeur_id = $${params.length}`;
    }
    if (request.query.q) {
      params.push(`%${request.query.q.toLowerCase()}%`);
      ou += ` and (lower(e.numero) like $${params.length} or lower(coalesce(e.justification, '')) like $${params.length})`;
    }

    const total = await un(`select count(*)::int as n from etat_besoin e ${ou}`, params);
    const donnees = await tous(
      `select e.id, e.numero, e.statut, e.justification, e.cree_le, e.vise_le, e.examine_le,
              e.motif_decision, e.accuse_le, e.clos_le,
              e.structure_id, s.code as structure_code, s.nom as structure_nom, s.regime as structure_regime,
              e.demandeur_id, d.nom as demandeur_nom, e.viseur_id, v.nom as viseur_nom,
              e.examinateur_id, x.nom as examinateur_nom,
              (select count(*)::int from ligne_besoin l where l.etat_besoin_id = e.id) as nombre_lignes,
              (select count(*)::int from ligne_besoin l where l.etat_besoin_id = e.id and l.origine = 'stock') as lignes_stock,
              (select count(*)::int from ligne_besoin l where l.etat_besoin_id = e.id and l.origine = 'achat') as lignes_achat,
              (select count(*)::int from ligne_besoin l where l.etat_besoin_id = e.id and l.origine = 'refuse') as lignes_refusees,
              extract(day from now() - e.cree_le)::int as anciennete_jours
         from etat_besoin e
         join structure s on s.id = e.structure_id
         join agent d on d.id = e.demandeur_id
         left join agent v on v.id = e.viseur_id
         left join agent x on x.id = e.examinateur_id
         ${ou}
        order by e.cree_le desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(donnees, total.n, page);
  });

  // --- La fiche ---------------------------------------------------------
  app.get('/api/besoins/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const besoin = await chargerBesoin(request.params.id);
    await verifierLecture(request, besoin.structure_id);
    return besoin;
  });

  // --- Le brouillon -----------------------------------------------------
  app.post('/api/besoins', {
    preHandler: ecriture('demandeur', 'chef_structure', 'comptable_matieres', 'logistique', 'intendant'),
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['structure_id', 'lignes'],
        properties: {
          structure_id: { type: 'string', format: 'uuid' },
          demandeur_id: { type: ['string', 'null'], format: 'uuid' },
          justification: { type: ['string', 'null'], maxLength: 2000 },
          lignes: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['categorie_code', 'designation', 'quantite_demandee'],
              properties: {
                categorie_code: { type: 'string', minLength: 1, maxLength: 40 },
                designation: { type: 'string', minLength: 2, maxLength: 200 },
                quantite_demandee: { type: 'integer', minimum: 1 },
                motif: { type: ['string', 'null'], maxLength: 600 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const corps = request.body;
    await verifierEcritureStructure(request, corps.structure_id);

    // Le demandeur est un agent de la structure demandeuse : par défaut, celui
    // qui saisit. Un autre n'est accepté que dans la même structure.
    const demandeurId = corps.demandeur_id ?? request.agent.id;
    const demandeur = await un(
      'select id, nom, structure_id from agent where id = $1 and structure_id = $2',
      [demandeurId, corps.structure_id],
    );
    if (!demandeur) {
      throw donneesInvalides(
        "Choisissez un demandeur qui appartient à la structure demandeuse : la demande est portée par un agent de cette structure.",
        'demandeur_id',
      );
    }

    const codes = [...new Set(corps.lignes.map((l) => l.categorie_code))];
    const connues = await tous(
      `select code from categorie where code = any($1::text[])`,
      [codes],
    );
    if (connues.length !== codes.length) {
      const absentes = codes.filter((c) => !connues.some((k) => k.code === c));
      throw donneesInvalides(
        `Choisissez des articles de la nomenclature : ${absentes.join(', ')} n'y figure pas.`,
        'lignes',
      );
    }

    const resultat = await transaction(async () => {
      const numero = await prochainNumero('etat_besoin');
      await journaliserDepuis(request, {
        action: 'creation_besoin',
        objet_type: 'etat_besoin',
        objet_id: numero,
        avant: null,
        apres: { numero, structure_id: corps.structure_id, demandeur_id: demandeurId, lignes: corps.lignes.length },
      });
      const besoin = await un(
        `insert into etat_besoin (numero, structure_id, demandeur_id, statut, justification)
         values ($1, $2, $3, 'brouillon', $4) returning *`,
        [numero, corps.structure_id, demandeurId, corps.justification ?? null],
      );
      let rang = 0;
      for (const ligne of corps.lignes) {
        rang += 1;
        await un(
          `insert into ligne_besoin (etat_besoin_id, structure_id, categorie_code, designation,
                                     quantite_demandee, motif, rang)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [besoin.id, corps.structure_id, ligne.categorie_code, ligne.designation,
            ligne.quantite_demandee, ligne.motif ?? null, rang],
        );
      }
      return besoin;
    });

    publier({ type: 'creation', objet: 'besoin', id: resultat.id, structure_id: resultat.structure_id });
    reply.code(201);
    return chargerBesoin(resultat.id);
  });

  // --- Le visa : RG-001, RG-002 ----------------------------------------
  app.post('/api/besoins/:id/viser', {
    preHandler: ecriture('chef_structure', 'logistique', 'intendant'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          justification: { type: ['string', 'null'], maxLength: 2000 },
          visa_a_posteriori: { type: 'boolean' },
          motif_visa_a_posteriori: { type: ['string', 'null'], maxLength: 600 },
        },
      },
    },
  }, async (request) => {
    const besoin = await chargerBesoin(request.params.id);
    await verifierEcritureStructure(request, besoin.structure_id);
    if (besoin.statut !== 'brouillon') {
      throw donneesInvalides(
        `Cet état de besoin est déjà au statut « ${besoin.statut} » : seul un brouillon se vise.`,
        'statut',
      );
    }

    const justification = request.body.justification ?? besoin.justification;
    // RG-001 puis RG-002 : la justification d'abord, la séparation des fonctions ensuite.
    appliquerToutes([
      rg001({ justification }),
      rg002({ demandeur_id: besoin.demandeur_id, viseur_id: request.agent.id }),
    ]);

    const resultat = await transaction(async () => {
      await journaliserDepuis(request, {
        action: 'visa_besoin',
        objet_type: 'etat_besoin',
        objet_id: besoin.id,
        avant: { statut: besoin.statut, justification: besoin.justification, viseur_id: besoin.viseur_id },
        apres: {
          statut: 'vise',
          justification,
          viseur_id: request.agent.id,
          visa_a_posteriori: request.body.visa_a_posteriori ?? false,
          motif_visa_a_posteriori: request.body.motif_visa_a_posteriori ?? null,
        },
      });
      return un(
        `update etat_besoin set statut = 'vise', justification = $2, vise_le = now(), viseur_id = $3
          where id = $1 returning *`,
        [besoin.id, justification, request.agent.id],
      );
    });

    publier({ type: 'visa', objet: 'besoin', id: resultat.id, structure_id: resultat.structure_id });
    return chargerBesoin(resultat.id);
  });

  // --- L'examen : RG-003, RG-004, puis l'aiguillage ligne par ligne ----
  app.post('/api/besoins/:id/examiner', {
    preHandler: ecriture('logistique', 'intendant'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['decision'],
        properties: {
          decision: { type: 'string', enum: ['totale', 'partielle', 'rejet'] },
          motif: { type: ['string', 'null'], maxLength: 2000 },
          lignes: {
            type: 'array',
            maxItems: 200,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                quantite_accordee: { type: 'integer', minimum: 0 },
                motif: { type: ['string', 'null'], maxLength: 600 },
                origine: { type: 'string', enum: ['stock', 'achat', 'refuse'] },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const besoin = await chargerBesoin(request.params.id);
    // L'examen est central : il porte sur une structure, autonome comprise, mais
    // il n'écrit pas dans son patrimoine — il décide de la suite de sa demande.
    await verifierLecture(request, besoin.structure_id);
    if (!['vise', 'recu'].includes(besoin.statut)) {
      throw donneesInvalides(
        `Cet état de besoin est au statut « ${besoin.statut} » : on examine un état visé ou reçu.`,
        'statut',
      );
    }
    // Invariant : qui demande ne décide pas de sa propre demande.
    if (String(besoin.demandeur_id) === String(request.agent.id)) {
      throw nonAutorise(
        "Faites examiner cette demande par un autre agent : le demandeur ne l'examine pas lui-même.",
        'examinateur_id',
      );
    }

    const { decision } = request.body;
    const motif = request.body.motif ?? null;
    // RG-003 et RG-004 : partiel et rejet exigent un motif non vide.
    appliquerToutes([
      rg003({ decision, motif }),
      rg004({ decision: decision === 'rejet' ? 'rejet' : decision, motif }),
    ]);

    const decisions = new Map((request.body.lignes ?? []).map((l) => [String(l.id), l]));
    for (const cle of decisions.keys()) {
      if (!besoin.lignes.some((l) => String(l.id) === cle)) {
        throw donneesInvalides(
          "Une des lignes décidées n'appartient pas à cet état de besoin : reprenez la liste des lignes de la demande.",
          'lignes',
        );
      }
    }

    // L'état du magasin du périmètre, pour l'aiguillage.
    const stocks = await tous(
      `select st.id, st.categorie_code, st.designation, st.quantite, st.site_id, si.nom as site_nom
         from stock st join site si on si.id = st.site_id
        where st.structure_id = $1`,
      [besoin.structure_id],
    );
    const disponible = new Map();
    for (const s of stocks) {
      const cle = s.categorie_code;
      const actuel = disponible.get(cle) ?? { quantite: 0, articles: [] };
      actuel.quantite += Number(s.quantite ?? 0);
      actuel.articles.push({ id: s.id, designation: s.designation, site_id: s.site_id, site_nom: s.site_nom, quantite: s.quantite });
      disponible.set(cle, actuel);
    }

    // L'aiguillage, ligne par ligne. Les quantités servies sur stock sont
    // décomptées au fur et à mesure, pour ne pas promettre deux fois le même.
    const restant = new Map([...disponible].map(([k, v]) => [k, v.quantite]));
    const aiguillage = besoin.lignes.map((ligne) => {
      const choix = decisions.get(String(ligne.id));
      const accordee = decision === 'rejet'
        ? 0
        : Number(choix?.quantite_accordee ?? ligne.quantite_demandee);
      const stockRestant = restant.get(ligne.categorie_code) ?? 0;
      const origine = choix?.origine ?? aiguiller(ligne, accordee, stockRestant);
      if (origine === 'stock') restant.set(ligne.categorie_code, Math.max(0, stockRestant - accordee));
      return {
        id: ligne.id,
        categorie_code: ligne.categorie_code,
        designation: ligne.designation,
        quantite_demandee: ligne.quantite_demandee,
        quantite_accordee: Math.min(accordee, ligne.quantite_demandee),
        motif: choix?.motif ?? (origine === 'refuse' ? motif : ligne.motif),
        origine,
        servable_maintenant: origine === 'stock',
        articles_de_stock: origine === 'stock' ? (disponible.get(ligne.categorie_code)?.articles ?? []) : [],
      };
    });

    // Une ligne accordée sans motif alors qu'elle est amputée : RG-003 à la ligne.
    for (const l of aiguillage) {
      if (l.quantite_accordee > 0 && l.quantite_accordee < l.quantite_demandee && !(l.motif ?? '').trim()) {
        appliquer({
          code: 'RG-003',
          message: `Indiquez le motif de la réduction sur « ${l.designation} » : ${l.quantite_accordee} accordée(s) sur ${l.quantite_demandee} demandée(s).`,
          champ: 'lignes',
        });
      }
      if (l.origine === 'refuse' && !(l.motif ?? '').trim()) {
        appliquer({
          code: 'RG-004',
          message: `Motivez le refus de la ligne « ${l.designation} » : chaque refus est notifié au demandeur.`,
          champ: 'lignes',
        });
      }
    }

    const statut = decision === 'rejet' ? 'rejete' : statutApresExamen(aiguillage);

    const resultat = await transaction(async () => {
      await journaliserDepuis(request, {
        action: 'examen_besoin',
        objet_type: 'etat_besoin',
        objet_id: besoin.id,
        avant: { statut: besoin.statut, lignes: besoin.lignes.map((l) => ({ id: l.id, quantite_accordee: l.quantite_accordee, origine: l.origine })) },
        apres: {
          statut,
          decision,
          motif,
          examinateur_id: request.agent.id,
          lignes: aiguillage.map((l) => ({ id: l.id, quantite_accordee: l.quantite_accordee, origine: l.origine })),
        },
      });

      for (const ligne of aiguillage) {
        await un(
          `update ligne_besoin set quantite_accordee = $2, origine = $3, motif = $4 where id = $1`,
          [ligne.id, ligne.quantite_accordee, ligne.origine, ligne.motif ?? null],
        );
      }

      const majBesoin = await un(
        `update etat_besoin set statut = $2, examine_le = now(), examinateur_id = $3, motif_decision = $4
          where id = $1 returning *`,
        [besoin.id, statut, request.agent.id, motif],
      );

      // La décision est une pièce : elle est figée dès son émission (RG-019).
      const numero = await prochainNumero('decision_examen');
      const document = await un(
        `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
                               signataire_id, signe_le, fige)
         values ('decision_examen', $1, $2, 'etat_besoin', $3, $4, $5, now(), true) returning *`,
        [
          numero, besoin.structure_id, String(besoin.id),
          JSON.stringify({
            etat_besoin: besoin.numero,
            decision,
            motif,
            statut,
            lignes: aiguillage.map((l) => ({
              designation: l.designation,
              quantite_demandee: l.quantite_demandee,
              quantite_accordee: l.quantite_accordee,
              origine: l.origine,
              motif: l.motif,
            })),
          }),
          request.agent.id,
        ],
      );
      return { besoin: majBesoin, document };
    });

    publier({ type: 'examen', objet: 'besoin', id: besoin.id, structure_id: besoin.structure_id, donnees: { statut } });

    const complet = await chargerBesoin(besoin.id);
    return {
      ...complet,
      decision: { decision, motif, statut, document: resultat.document.numero },
      aiguillage: {
        sur_stock: aiguillage.filter((l) => l.origine === 'stock'),
        en_achat: aiguillage.filter((l) => l.origine === 'achat'),
        refusees: aiguillage.filter((l) => l.origine === 'refuse'),
        servable_maintenant: aiguillage.some((l) => l.origine === 'stock'),
        suite: aiguillage.some((l) => l.origine === 'achat')
          ? "Les lignes en achat appellent l'ouverture d'un dossier d'achat ; les lignes sur stock sont servables sans attendre."
          : 'Toutes les lignes accordées sont servables sur stock.',
      },
    };
  });

  // --- L'accusé de réception : RG-006 ---------------------------------
  app.post('/api/besoins/:id/accuser', {
    preHandler: ecriture('demandeur', 'chef_structure', 'comptable_matieres', 'magasinier'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          observations: { type: ['string', 'null'], maxLength: 2000 },
          clore: { type: 'boolean', default: true },
          lignes_recues: {
            type: 'array',
            maxItems: 200,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'quantite_recue'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                quantite_recue: { type: 'integer', minimum: 0 },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const besoin = await chargerBesoin(request.params.id);
    await verifierEcritureStructure(request, besoin.structure_id);
    if (['brouillon', 'rejete', 'clos'].includes(besoin.statut)) {
      throw donneesInvalides(
        `On n'accuse pas réception d'un état de besoin au statut « ${besoin.statut} ».`,
        'statut',
      );
    }
    // Invariant : qui réceptionne ne valide pas sa propre réception. L'accusé est
    // signé par le demandeur ou un agent de sa structure, pas par l'examinateur.
    if (besoin.examinateur_id && String(besoin.examinateur_id) === String(request.agent.id)) {
      throw nonAutorise(
        "Faites signer l'accusé de réception par le demandeur ou un agent de sa structure : l'examinateur n'accuse pas réception de sa propre décision.",
        'signataire_id',
      );
    }

    const resultat = await transaction(async () => {
      const numero = await prochainNumero('accuse_reception');
      await journaliserDepuis(request, {
        action: 'accuse_besoin',
        objet_type: 'etat_besoin',
        objet_id: besoin.id,
        avant: { statut: besoin.statut, accuse_le: besoin.accuse_le },
        apres: { statut: 'livre', accuse: numero, signataire_id: request.agent.id },
      });
      const accuse = await un(
        `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
                               signataire_id, signe_le, fige)
         values ('accuse_reception', $1, $2, 'etat_besoin', $3, $4, $5, now(), true) returning *`,
        [
          numero, besoin.structure_id, String(besoin.id),
          JSON.stringify({
            etat_besoin: besoin.numero,
            observations: request.body.observations ?? null,
            lignes_recues: request.body.lignes_recues ?? [],
            signataire: request.agent.nom,
          }),
          request.agent.id,
        ],
      );
      const majBesoin = await un(
        `update etat_besoin set statut = 'livre', accuse_le = now() where id = $1 returning *`,
        [besoin.id],
      );
      return { accuse, besoin: majBesoin };
    });

    let clos = null;
    if (request.body.clore !== false) {
      // RG-006 : la clôture n'a lieu qu'au vu de l'accusé signé.
      appliquer(rg006({ accuse: resultat.accuse }));
      clos = await transaction(async () => {
        await journaliserDepuis(request, {
          action: 'cloture_besoin',
          objet_type: 'etat_besoin',
          objet_id: besoin.id,
          avant: { statut: 'livre' },
          apres: { statut: 'clos', accuse: resultat.accuse.numero },
        });
        return un(
          `update etat_besoin set statut = 'clos', clos_le = now() where id = $1 returning *`,
          [besoin.id],
        );
      });
    }

    publier({
      type: clos ? 'cloture' : 'accuse',
      objet: 'besoin',
      id: besoin.id,
      structure_id: besoin.structure_id,
    });

    return { ...(await chargerBesoin(besoin.id)), accuse_reception: resultat.accuse };
  });

  // --- La clôture séparée, quand l'accusé existe déjà : RG-006 --------
  app.post('/api/besoins/:id/clore', {
    preHandler: ecriture('chef_structure', 'logistique', 'intendant', 'comptable_matieres'),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const besoin = await chargerBesoin(request.params.id);
    await verifierEcritureStructure(request, besoin.structure_id);
    const accuse = await un(
      `select * from document
        where type = 'accuse_reception' and objet_type = 'etat_besoin' and objet_id = $1
        order by cree_le desc limit 1`,
      [String(besoin.id)],
    );
    appliquer(rg006({ accuse }));
    // RG-019 : on ne retouche pas l'accusé pour clore, on s'appuie sur lui.
    appliquer(rg019({ document: accuse, operation: 'lecture' }));

    const resultat = await transaction(async () => {
      await journaliserDepuis(request, {
        action: 'cloture_besoin',
        objet_type: 'etat_besoin',
        objet_id: besoin.id,
        avant: { statut: besoin.statut },
        apres: { statut: 'clos', accuse: accuse.numero },
      });
      return un(
        `update etat_besoin set statut = 'clos', clos_le = now() where id = $1 returning *`,
        [besoin.id],
      );
    });
    publier({ type: 'cloture', objet: 'besoin', id: besoin.id, structure_id: besoin.structure_id });
    return resultat;
  });
}

/** Charge un état de besoin, ses lignes et ses pièces. */
async function chargerBesoin(id) {
  const besoin = await un(
    `select e.*, s.code as structure_code, s.nom as structure_nom, s.regime as structure_regime,
            d.nom as demandeur_nom, d.fonction as demandeur_fonction,
            v.nom as viseur_nom, x.nom as examinateur_nom
       from etat_besoin e
       join structure s on s.id = e.structure_id
       join agent d on d.id = e.demandeur_id
       left join agent v on v.id = e.viseur_id
       left join agent x on x.id = e.examinateur_id
      where e.id = $1`,
    [id],
  );
  if (!besoin) throw nonTrouve('Cet état de besoin');
  const lignes = await tous(
    `select l.id, l.categorie_code, c.libelle as categorie_libelle, l.designation,
            l.quantite_demandee, l.quantite_accordee, l.motif, l.origine, l.rang
       from ligne_besoin l join categorie c on c.code = l.categorie_code
      where l.etat_besoin_id = $1 order by l.rang, l.designation`,
    [id],
  );
  const documents = await tous(
    `select id, type, numero, signataire_id, signe_le, fige, cree_le
       from document where objet_type = 'etat_besoin' and objet_id = $1 order by cree_le desc`,
    [String(id)],
  );
  return { ...besoin, lignes, documents };
}
