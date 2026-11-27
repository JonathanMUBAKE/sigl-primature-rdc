// Les achats : le dossier et le bon de commande.
//
// Deux règles commandent tout ici.
//   RG-007 — la procédure découle du montant estimé et des seuils **en vigueur
//   à la date du dossier**, lus dans la table `parametre`. Jamais d'une
//   constante, et jamais choisie à la main.
//   RG-008 — si un découpage ferait passer un achat sous un seuil, la route
//   **bloque** et lève une alerte. Elle ne corrige pas en silence, et l'alerte
//   ne décide rien : un humain tranche (RG-022).
//
// RG-009 interdit le bon de commande vers un fournisseur en liste noire.
// RG-011 : le paiement n'est marqué possible qu'au vu du certificat de prise
// en charge à l'inventaire.

import { enEcriture, enLecture, lireTous, lireUn } from './_sql.js';
import {
  ecriture, lecture, structuresDe, verifierLecture, verifierLectureStricte, viser,
} from './_droits.js';
import { estCentral } from '../regles/roles.js';
import {
  appliquer, donneesInvalides, liste, nonTrouve, pagination, schemaIdParam, schemaPagination,
  ErreurMetier,
} from './_commun.js';
import { refuserOuIntrouvable } from './_rattachement.js';
import { bonAttendPaiement, bonSansPv } from './_etapes.js';
import { journaliserDepuis } from './_journal.js';
import { prochainNumero } from './_numeros.js';
import { fenetreDecoupageJours, seuilsPassationDetail } from './_parametres.js';
import { leverAlerte } from './_alertes.js';
import { publier } from './_flux.js';
import { rg007 } from '../regles/rg-007.js';
import { rg008 } from '../regles/rg-008.js';
import { rg009 } from '../regles/rg-009.js';
import { rg011 } from '../regles/rg-011.js';
import { expliquerProcedure, procedurePourMontant } from '../regles/seuils.js';

const PROCEDURES = ['gre_a_gre', 'consultation', 'aon', 'aoi'];
const STATUTS_DOSSIER = ['ouvert', 'en_consultation', 'attribue', 'execute', 'clos', 'annule'];

/**
 * Le fragment SQL qui décrit un fournisseur tel qu'un écran doit le montrer :
 * sa liste noire **avec son motif**, son délai déclaré, et surtout son **délai
 * constaté** — la moyenne des jours écoulés entre l'émission de ses bons de
 * commande et leur livraison effective. Le déclaré est une promesse, le
 * constaté est un fait ; l'écran des achats a besoin des deux pour choisir.
 */
const FOURNISSEUR_CONSTATE = `
  f.denomination as fournisseur_nom, f.rccm as fournisseur_rccm,
  f.liste_noire, f.motif_liste_noire, f.actif as fournisseur_actif,
  f.delai_moyen_jours as fournisseur_delai_declare_jours,
  (select round(avg(extract(epoch from (x.livre_le - x.emis_le)) / 86400))::int
     from bon_commande x
    where x.fournisseur_id = f.id and x.livre_le is not null) as fournisseur_delai_constate_jours,
  (select count(*)::int from bon_commande x
    where x.fournisseur_id = f.id and x.livre_le is not null) as fournisseur_livraisons_constatees`;

/**
 * Pourquoi cette procédure s'applique à ce dossier : quel seuil, à quelle
 * date. Les seuils retenus à l'ouverture sont figés dans `seuils_appliques` —
 * c'est ce qui permet de rejuger une décision ancienne avec les seuils
 * d'alors (RG-007). On explique donc à partir d'eux, pas des seuils du jour.
 *
 * `conforme` dit si la procédure inscrite correspond toujours à ce que les
 * seuils figés commandent : un écart signale une donnée reprise à la main et
 * mérite un examen.
 */
function justifierProcedure(dossier) {
  const date = dossier.cree_le ? new Date(dossier.cree_le).toISOString().slice(0, 10) : null;
  const explication = expliquerProcedure(
    dossier.montant_estime,
    dossier.seuils_appliques,
    { date_reference: date },
  );
  if (!explication) {
    return {
      procedure: dossier.procedure,
      motif: "Les seuils retenus à l'ouverture de ce dossier ne sont plus lisibles : "
        + 'faites vérifier les paramètres de passation avant d’y rattacher un bon de commande.',
      seuil_applique: null,
      seuil_suivant: null,
      date_reference: date,
      conforme: null,
    };
  }
  return { ...explication, conforme: explication.procedure === dossier.procedure };
}

/** Le fournisseur rassemblé en un seul objet, et l'écart déclaré / constaté. */
function fournisseurVu(ligne) {
  if (!ligne) return null;
  const declare = ligne.fournisseur_delai_declare_jours;
  const constate = ligne.fournisseur_delai_constate_jours;
  return {
    denomination: ligne.fournisseur_nom,
    rccm: ligne.fournisseur_rccm ?? null,
    actif: ligne.fournisseur_actif ?? null,
    liste_noire: ligne.liste_noire ?? false,
    motif_liste_noire: ligne.motif_liste_noire ?? null,
    delai_declare_jours: declare ?? null,
    delai_constate_jours: constate ?? null,
    livraisons_constatees: ligne.fournisseur_livraisons_constatees ?? 0,
    ecart_delai_jours:
      declare !== null && declare !== undefined && constate !== null && constate !== undefined
        ? constate - declare
        : null,
    retard_constate:
      declare !== null && declare !== undefined && constate !== null && constate !== undefined
        ? constate > declare
        : null,
  };
}

/**
 * Le périmètre d'un bon de commande — et pourquoi il s'écrit à la main.
 *
 * `bon_commande` et `dossier_achat` ne portent pas de `structure_id` : aucune
 * politique de sécurité au niveau des lignes ne s'y applique (ADR-001). La
 * liste rendait donc **tous** les bons à tout le monde, alors que
 * `/api/receptions` et `/api/documents`, qui lisent `document`, sont filtrés par
 * la base. L'incohérence bloquait la chaîne du paiement : un comptable public
 * voyait un bon dont le certificat de prise en charge lui restait invisible, et
 * RG-011 lui opposait l'absence d'une pièce qui existait bel et bien.
 *
 * Le périmètre d'un bon est celui de **l'état de besoin qui l'a motivé** : c'est
 * la seule structure que la chaîne lui attache. À défaut d'état de besoin, c'est
 * un achat du niveau central, qui n'appartient à aucune structure : il se lit
 * par les rôles centraux et les portées élargies, pas par une cellule.
 *
 * Le filtre porte sur `bc.structure_id`, inscrit sur la ligne. Il portait
 * auparavant sur `e.structure_id`, au bout d'une jointure externe vers une
 * table cloisonnée : une structure hors portée rendait `null`, et un `null` ne
 * se distingue pas d'une absence de cloisonnement — le contrôle s'effaçait
 * exactement là où il devait mordre. Voir la migration 20261127040000.
 */
async function clausePerimetre(request, params, colonne) {
  const permises = await structuresDe(request);
  if (permises === null) return ''; // portée totale : lecture consolidée.
  if (permises.length === 0) return ' and false';
  const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
  params.push(...permises);
  return ` and ${colonne} in (${places})`;
}

export default async function routesAchats(app) {
  // --- Les dossiers -----------------------------------------------------
  app.get('/api/dossiers-achat', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          statut: { type: 'string', enum: STATUTS_DOSSIER },
          procedure: { type: 'string', enum: PROCEDURES },
          q: { type: 'string', maxLength: 120 },
          ...schemaPagination,
        },
      },
    },
  }, async (request) => {
    const page = pagination(request.query);
    const params = [];
    let ou = 'where true';
    for (const [cle, colonne] of [['statut', 'd.statut'], ['procedure', 'd.procedure']]) {
      if (request.query[cle]) {
        params.push(request.query[cle]);
        ou += ` and ${colonne} = $${params.length}`;
      }
    }
    if (request.query.q) {
      params.push(`%${request.query.q.toLowerCase()}%`);
      ou += ` and (lower(d.objet) like $${params.length} or lower(d.numero) like $${params.length})`;
    }
    // Le périmètre. Il manquait : la liste rendait les dossiers de toutes les
    // structures, établissements autonomes compris, sous une étiquette qui
    // annonçait pourtant « dans votre périmètre ». `dossier_achat` n'étant pas
    // cloisonnée par la base, rien ne rattrapait l'oubli côté route.
    ou += await clausePerimetre(request, params, 'd.structure_id');
    const total = await lireUn(request, `select count(*)::int as n from dossier_achat d ${ou}`, params);
    const donnees = await lireTous(request, 
      `select d.*, e.numero as etat_besoin_numero,
              s.code as structure_code, s.nom as structure_nom,
              (select count(*)::int from bon_commande bc where bc.dossier_id = d.id) as nombre_bons,
              (select coalesce(sum(bc.montant), 0) from bon_commande bc where bc.dossier_id = d.id) as montant_commande,
              extract(day from now() - d.cree_le)::int as anciennete_jours
         from dossier_achat d
         left join etat_besoin e on e.id = d.etat_besoin_id
         join structure s on s.id = d.structure_id
         ${ou}
        order by d.cree_le desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(
      donnees.map((d) => ({ ...d, justification_procedure: justifierProcedure(d) })),
      total.n,
      page,
    );
  });

  app.get('/api/dossiers-achat/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const dossier = await lireUn(request, 
      `select d.*, e.numero as etat_besoin_numero
         from dossier_achat d left join etat_besoin e on e.id = d.etat_besoin_id
        where d.id = $1`,
      [request.params.id],
    );
    if (!dossier) {
      await refuserOuIntrouvable(request, 'dossier_achat', request.params.id, "Ce dossier d'achat");
    }
    await verifierLectureStricte(request, dossier.structure_id, "Ce dossier d'achat");
    const bons = await lireTous(request,
      `select bc.*, ${FOURNISSEUR_CONSTATE},
              extract(day from coalesce(bc.livre_le, now()) - bc.emis_le)::int as delai_ecoule_jours
         from bon_commande bc join fournisseur f on f.id = bc.fournisseur_id
        where bc.dossier_id = $1 order by bc.emis_le desc`,
      [dossier.id],
    );
    const alertes = await lireTous(request,
      `select id, code, gravite, explication, statut, suite, cree_le
         from alerte where objet_type = 'dossier_achat' and objet_id = $1 order by cree_le desc`,
      [String(dossier.id)],
    );
    // Les lignes du dossier, rendues ici plutôt que reconstituées par l'écran.
    //
    // Un dossier d'achat ne porte pas de lignes propres : ce qu'il commande,
    // c'est la part **achat** de l'état de besoin qui l'a motivé — le reste du
    // besoin est servi sur stock et ne passe pas par lui. L'écran des
    // réceptions a besoin de ces quantités pour afficher les écarts commandé /
    // livré / reçu ; il devait jusqu'ici remonter lui-même à `etat_besoin_id`,
    // puis filtrer les lignes. C'est le serveur qui le fait, une fois.
    //
    // `quantite_commandee` vaut la quantité accordée à l'examen quand elle est
    // posée, la quantité demandée sinon : c'est ce qui a été engagé.
    const lignes = dossier.etat_besoin_id
      ? await lireTous(request,
        `select l.id, l.rang, l.categorie_code, c.libelle as categorie_libelle,
                l.designation, l.quantite_demandee, l.quantite_accordee,
                coalesce(l.quantite_accordee, l.quantite_demandee) as quantite_commandee,
                l.origine, l.motif
           from ligne_besoin l
           left join categorie c on c.code = l.categorie_code
          where l.etat_besoin_id = $1 and l.origine = 'achat'
          order by l.rang, l.designation`,
        [dossier.etat_besoin_id])
      : [];
    return {
      ...dossier,
      justification_procedure: justifierProcedure(dossier),
      bons_commande: bons.map((b) => ({ ...b, fournisseur: fournisseurVu(b) })),
      lignes,
      nombre_lignes: lignes.length,
      quantite_commandee_totale: lignes.reduce((t, l) => t + Number(l.quantite_commandee ?? 0), 0),
      alertes,
    };
  });

  // --- L'ouverture d'un dossier : RG-007 et RG-008 --------------------
  app.post('/api/dossiers-achat', {
    preHandler: ecriture('logistique', 'intendant', 'ordonnateur'),
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['objet', 'montant_estime'],
        properties: {
          objet: { type: 'string', minLength: 3, maxLength: 300 },
          montant_estime: { type: 'number', exclusiveMinimum: 0 },
          etat_besoin_id: { type: ['string', 'null'], format: 'uuid' },
          date: { type: 'string', format: 'date' },
          // La procédure peut être proposée : elle est alors vérifiée contre
          // les seuils, et refusée si elle s'en écarte (RG-007).
          procedure: { type: 'string', enum: PROCEDURES },
        },
      },
    },
  }, async (request, reply) => {
    const corps = request.body;
    const date = corps.date ?? new Date().toISOString().slice(0, 10);

    let besoin = null;
    if (corps.etat_besoin_id) {
      besoin = await lireUn(request, 
        'select id, numero, structure_id, statut from etat_besoin where id = $1',
        [corps.etat_besoin_id],
      );
      if (!besoin) throw nonTrouve("L'état de besoin rattaché");
    }
    const structureId = viser(request, besoin?.structure_id ?? request.agent.structure_id);

    // Les seuils en vigueur à la date du dossier, lus dans `parametre`, avec
    // leur provenance : l'écran doit pouvoir dire quel seuil et de quelle date.
    const provenance = await enLecture(request, () => seuilsPassationDetail(date));
    const seuils = provenance.valeur;
    appliquer(rg007({
      montant_estime: corps.montant_estime,
      seuils,
      procedure_proposee: corps.procedure,
    }));
    const procedure = procedurePourMontant(corps.montant_estime, seuils);
    const justification = expliquerProcedure(corps.montant_estime, seuils, {
      cle: provenance.cle,
      date_reference: date,
      en_vigueur_du: provenance.en_vigueur_du,
      en_vigueur_au: provenance.en_vigueur_au,
    });

    // RG-008 — le découpage. On regarde les dossiers de même objet, ou du même
    // état de besoin, ouverts dans la fenêtre de surveillance.
    const jours = await enLecture(request, () => fenetreDecoupageJours());
    const dossiersLies = await lireTous(request, 
      `select id, numero, objet, montant_estime, procedure, cree_le
         from dossier_achat
        where statut <> 'annule'
          and cree_le > now() - ($1 || ' days')::interval
          and (lower(trim(objet)) = lower(trim($2)) or ($3::uuid is not null and etat_besoin_id = $3))`,
      [String(jours), corps.objet, corps.etat_besoin_id ?? null],
    );

    const decoupage = rg008({ montant_estime: corps.montant_estime, seuils, dossiers_lies: dossiersLies });
    if (decoupage) {
      // La route bloque, et l'alerte ouvre un examen. Aucun état métier ne change.
      const alerte = await enEcriture(request, async () => {
        const ouverte = await leverAlerte({
          code: decoupage.alerte.code,
          gravite: decoupage.alerte.gravite,
          structure_id: structureId,
          objet_type: 'dossier_achat',
          objet_id: corps.etat_besoin_id ?? null,
          explication: decoupage.alerte.explication,
          donnees: { ...decoupage.alerte.donnees, objet: corps.objet, fenetre_jours: jours },
        });
        await journaliserDepuis(request, {
          action: 'blocage_decoupage_achat',
          objet_type: 'alerte',
          objet_id: ouverte.id,
          avant: null,
          apres: { code: 'RG-008', objet: corps.objet, montant_estime: corps.montant_estime, alerte: ouverte.id },
        });
        return ouverte;
      });
      publier({ type: 'ouverture', objet: 'alerte', id: alerte.id, structure_id: structureId, donnees: { code: alerte.code, gravite: alerte.gravite } });
      const erreur = new ErreurMetier(decoupage, 409);
      erreur.alerte = alerte;
      throw erreur;
    }

    const resultat = await enEcriture(request, async () => {
      const numero = await prochainNumero('dossier_achat');
      await journaliserDepuis(request, {
        action: 'ouverture_dossier_achat',
        objet_type: 'dossier_achat',
        objet_id: numero,
        avant: null,
        apres: {
          numero, objet: corps.objet, montant_estime: corps.montant_estime, procedure,
          seuils_appliques: seuils, date, etat_besoin_id: corps.etat_besoin_id ?? null,
          // La raison de la procédure est journalisée avec la décision : c'est
          // elle qu'un contrôleur relira, pas le calcul refait des années après.
          justification_procedure: justification,
        },
      });
      const dossier = await lireUn(request, 
        `insert into dossier_achat (numero, etat_besoin_id, structure_id, objet, montant_estime, procedure, statut, seuils_appliques)
         values ($1, $2, $3, $4, $5, $6, 'ouvert', $7) returning *`,
        [
          numero, corps.etat_besoin_id ?? null,
          // Le rattachement, dit ici et non déduit plus tard d'une jointure.
          // Un dossier motivé par un état de besoin relève de la structure qui
          // a exprimé le besoin ; un achat ouvert sans état de besoin est un
          // achat du niveau central, et relève de la structure de l'agent qui
          // l'ouvre. Dans les deux cas la structure est connue à l'écriture :
          // c'est le seul moment où elle l'est à coup sûr.
          besoin?.structure_id ?? request.agent.structure_id,
          corps.objet, corps.montant_estime, procedure, JSON.stringify(seuils),
        ],
      );
      // L'état de besoin passe en achat pour ses lignes d'achat : le reste du
      // besoin, servi sur stock, n'attend pas ce dossier.
      if (besoin && ['examine', 'partiel', 'livrable', 'vise', 'recu'].includes(besoin.statut)) {
        const resteStock = await lireUn(request, 
          `select count(*)::int as n from ligne_besoin
            where etat_besoin_id = $1 and origine = 'stock'`,
          [besoin.id],
        );
        if (resteStock.n === 0) {
          await lireUn(request, `update etat_besoin set statut = 'en_achat' where id = $1`, [besoin.id]);
        }
      }
      return dossier;
    });

    publier({ type: 'ouverture', objet: 'achat', id: resultat.id, structure_id: structureId, donnees: { procedure, montant_estime: resultat.montant_estime } });
    reply.code(201);
    return {
      ...resultat,
      seuils_appliques: seuils,
      justification_procedure: { ...justification, conforme: true },
      dossiers_examines: dossiersLies.length,
    };
  });

  // --- Les bons de commande : RG-009 ----------------------------------
  app.get('/api/bons-commande', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          statut: { type: 'string' },
          dossier: { type: 'string', format: 'uuid' },
          fournisseur: { type: 'string', format: 'uuid' },
          // Les deux étapes de la chaîne, filtrables par leur **constat** et
          // non par le statut déclaré du bon. Ce sont les listes que composent
          // les chiffres « Livraisons attendues » et « Paiements en attente »
          // du poste de commande : même prédicat de part et d'autre
          // (`_etapes.js`), pour que le chiffre et la liste ne puissent pas se
          // contredire. Filtrer par `statut` ne les remplace pas : un bon
          // `livre` sans PV attend sa réception, et un bon `receptionne` sans
          // certificat n'attend pas encore son paiement.
          sans_pv: { type: 'boolean' },
          attend_paiement: { type: 'boolean' },
          ...schemaPagination,
        },
      },
    },
  }, async (request) => {
    const page = pagination(request.query);
    const params = [];
    let ou = 'where true';
    for (const [cle, colonne] of [['statut', 'bc.statut'], ['dossier', 'bc.dossier_id'], ['fournisseur', 'bc.fournisseur_id']]) {
      if (request.query[cle]) {
        params.push(request.query[cle]);
        ou += ` and ${colonne} = $${params.length}`;
      }
    }
    // La moitié complémentaire est la **négation entière** du prédicat, et pas
    // la négation de son dernier membre : les deux moitiés doivent recomposer
    // le tout, sinon le filtre perd des bons en silence.
    for (const [cle, predicat] of [['sans_pv', bonSansPv('bc')], ['attend_paiement', bonAttendPaiement('bc')]]) {
      if (request.query[cle] !== undefined) {
        ou += request.query[cle] ? ` and (${predicat})` : ` and not (${predicat})`;
      }
    }
    // Le périmètre, comme pour les réceptions et les documents.
    ou += await clausePerimetre(request, params, 'bc.structure_id');
    const DEPUIS = `from bon_commande bc
         join fournisseur f on f.id = bc.fournisseur_id
         join dossier_achat d on d.id = bc.dossier_id
         left join etat_besoin e on e.id = d.etat_besoin_id`;
    const total = await lireUn(request,
      `select count(*)::int as n from bon_commande bc
         join dossier_achat d on d.id = bc.dossier_id
         left join etat_besoin e on e.id = d.etat_besoin_id
        ${ou}`,
      params);
    const donnees = await lireTous(request,
      `select bc.*, ${FOURNISSEUR_CONSTATE},
              f.delai_moyen_jours,
              d.numero as dossier_numero, d.objet, d.procedure, d.montant_estime,
              d.seuils_appliques, d.cree_le as dossier_cree_le,
              extract(day from now() - bc.emis_le)::int as anciennete_jours,
              extract(day from coalesce(bc.livre_le, now()) - bc.emis_le)::int as delai_ecoule_jours,
              (select count(*)::int from document r
                where r.type = 'pv_reception' and r.objet_type = 'bon_commande'
                  and r.objet_id = bc.id::text) as nombre_pv_reception,
              exists (select 1 from document c
                       where c.type = 'certificat_prise_en_charge'
                         and c.objet_type = 'bon_commande' and c.objet_id = bc.id::text) as pris_en_charge,
              e.numero as etat_besoin_numero
         ${DEPUIS}
         ${ou}
        order by bc.emis_le desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(
      donnees.map((b) => ({
        ...b,
        fournisseur: fournisseurVu(b),
        justification_procedure: justifierProcedure({
          montant_estime: b.montant_estime,
          procedure: b.procedure,
          seuils_appliques: b.seuils_appliques,
          cree_le: b.dossier_cree_le,
        }),
      })),
      total.n,
      page,
    );
  });

  app.post('/api/bons-commande', {
    preHandler: ecriture('logistique', 'intendant', 'ordonnateur'),
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['dossier_id', 'fournisseur_id', 'montant'],
        properties: {
          dossier_id: { type: 'string', format: 'uuid' },
          fournisseur_id: { type: 'string', format: 'uuid' },
          montant: { type: 'number', exclusiveMinimum: 0 },
          lignes: {
            type: 'array',
            maxItems: 200,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['designation', 'quantite'],
              properties: {
                designation: { type: 'string', minLength: 2, maxLength: 200 },
                quantite: { type: 'integer', minimum: 1 },
                prix_unitaire: { type: 'number', minimum: 0 },
                categorie_code: { type: 'string', maxLength: 40 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const dossier = await lireUn(request, 
      `select d.* from dossier_achat d where d.id = $1`,
      [request.body.dossier_id],
    );
    if (!dossier) {
      await refuserOuIntrouvable(
        request, 'dossier_achat', request.body.dossier_id, "Ce dossier d'achat",
      );
    }
    await verifierLectureStricte(request, dossier.structure_id, "Ce dossier d'achat");
    if (['clos', 'annule'].includes(dossier.statut)) {
      throw donneesInvalides(
        `Ce dossier est au statut « ${dossier.statut} » : on n'y rattache plus de bon de commande.`,
        'dossier_id',
      );
    }
    const fournisseur = await lireUn(request,
      `select f.*, ${FOURNISSEUR_CONSTATE} from fournisseur f where f.id = $1`,
      [request.body.fournisseur_id],
    );
    if (!fournisseur) throw nonTrouve('Ce fournisseur');

    // RG-009 : aucun bon de commande vers un fournisseur en liste noire.
    appliquer(rg009({ fournisseur }));

    const structureId = viser(request, dossier.structure_id ?? request.agent.structure_id);
    const dejaCommande = await lireUn(request, 
      'select coalesce(sum(montant), 0)::numeric as total from bon_commande where dossier_id = $1 and statut <> \'annule\'',
      [dossier.id],
    );
    const cumul = Number(dejaCommande.total) + Number(request.body.montant);

    const resultat = await enEcriture(request, async () => {
      const numero = await prochainNumero('bon_commande');
      await journaliserDepuis(request, {
        action: 'emission_bon_commande',
        objet_type: 'bon_commande',
        objet_id: numero,
        avant: null,
        apres: {
          numero, dossier: dossier.numero, fournisseur: fournisseur.denomination,
          montant: request.body.montant, cumul_dossier: cumul,
        },
      });
      const bon = await lireUn(request, 
        `insert into bon_commande (numero, dossier_id, fournisseur_id, montant, statut)
         values ($1, $2, $3, $4, 'emis') returning *`,
        [numero, dossier.id, fournisseur.id, request.body.montant],
      );
      const document = await lireUn(request, 
        `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
                               signataire_id, signe_le, fige)
         values ('bon_commande', $1, $2, 'bon_commande', $3, $4, $5, now(), true) returning *`,
        [
          numero, structureId, String(bon.id),
          JSON.stringify({
            dossier: dossier.numero,
            objet: dossier.objet,
            procedure: dossier.procedure,
            fournisseur: fournisseur.denomination,
            rccm: fournisseur.rccm,
            montant: request.body.montant,
            lignes: request.body.lignes ?? [],
          }),
          request.agent.id,
        ],
      );
      if (dossier.statut === 'ouvert') {
        await lireUn(request, `update dossier_achat set statut = 'attribue' where id = $1`, [dossier.id]);
      }
      return { bon, document };
    });

    // Le dépassement du montant estimé n'empêche rien, mais il s'explique :
    // l'alerte ouvre un examen, elle ne change aucun état (RG-022).
    let alerte = null;
    if (cumul > Number(dossier.montant_estime)) {
      alerte = await enEcriture(request, () => leverAlerte({
        code: 'ECART_ESTIMATION',
        gravite: 'attention',
        structure_id: structureId,
        objet_type: 'dossier_achat',
        objet_id: String(dossier.id),
        explication: "Le cumul des bons de commande dépasse le montant estimé du dossier : justifiez l'écart ou révisez l'estimation.",
        donnees: { montant_estime: Number(dossier.montant_estime), cumul_commande: cumul },
      }));
    }

    publier({ type: 'bon_commande', objet: 'achat', id: resultat.bon.id, structure_id: structureId, donnees: { montant: resultat.bon.montant } });
    reply.code(201);
    return {
      ...resultat.bon,
      document: resultat.document,
      fournisseur: fournisseurVu(fournisseur),
      justification_procedure: justifierProcedure(dossier),
      cumul_dossier: cumul,
      alerte,
    };
  });

  // --- Le paiement possible : RG-011 ----------------------------------
  app.post('/api/bons-commande/:id/payable', {
    preHandler: ecriture('comptable_public'),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const bon = await lireUn(request, 
      `select bc.*, d.numero as dossier_numero
         from bon_commande bc
         join dossier_achat d on d.id = bc.dossier_id
        where bc.id = $1`,
      [request.params.id],
    );
    if (!bon) {
      await refuserOuIntrouvable(request, 'bon_commande', request.params.id, 'Ce bon de commande');
    }
    // RG-017 — le bon se marque payable dans le périmètre où il se lit. Pour le
    // comptable public, ce périmètre est l'ensemble des structures intégrées :
    // sa fonction est transversale, mais elle s'arrête à la frontière d'un
    // établissement autonome, qui a son propre comptable public.
    await verifierLectureStricte(request, bon.structure_id, 'Ce bon de commande');

    // RG-011 : aucun paiement marqué possible sans certificat de prise en charge.
    const certificat = await lireUn(request, 
      `select * from document
        where type = 'certificat_prise_en_charge' and objet_type = 'bon_commande' and objet_id = $1
        order by cree_le desc limit 1`,
      [String(bon.id)],
    );
    appliquer(rg011({ certificat }));

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'paiement_possible',
        objet_type: 'bon_commande',
        objet_id: bon.id,
        avant: { statut: bon.statut },
        apres: { statut: 'payable', certificat: certificat.numero },
      });
      return lireUn(request, `update bon_commande set statut = 'payable' where id = $1 returning *`, [bon.id]);
    });

    publier({ type: 'payable', objet: 'achat', id: bon.id, structure_id: bon.structure_id ?? request.agent.structure_id });
    return { ...resultat, certificat_prise_en_charge: certificat.numero };
  });
}
