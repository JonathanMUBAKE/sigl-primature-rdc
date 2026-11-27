// L'inventaire physique : la campagne, les constats, et le circuit de l'écart.
//
// Décret 13/050 art. 120 — « des inventaires et comptes d'emplois sont établis
// à dates fixes et à l'occasion des contrôles effectués par les organes
// habilités ». Art. 122 — le détenteur atteste les biens qui lui sont affectés.
//
// LES DEUX PRINCIPES QUI COMMANDENT TOUT CE FICHIER.
//
// 1. **Le constat engendre l'écart, et rien d'autre.** Un constat dit ce qui a
//    été vu ; il ne modifie jamais la fiche du bien. Un `ecart` ou un
//    `introuvable` ouvre une ligne d'`ecart_inventaire` dans la même
//    transaction, un `conforme` n'en ouvre aucune. C'est la décision humaine,
//    prise plus tard sur l'écart, qui régularise le registre.
//
// 2. **L'IA alerte, un humain décide.** Rien ici ne tranche tout seul : la
//    `nature` d'un écart est déduite de ce qui diffère réellement entre le
//    constat et la fiche — c'est un fait, pas une décision —, mais la
//    `decision` n'est écrite qu'au moment où un agent la prend, et un autre
//    agent que celui qui a constaté (RG-026).
//
// Règles tenues ici : RG-023 et RG-024 (la clôture), RG-025 (l'explication
// avant l'arbitrage), RG-026 (qui constate ne tranche pas), RG-015 et RG-016
// (la perte laisse le bien au registre et produit le PV, sans que le SIGL
// prononce), RG-017 et RG-018 (la portée), RG-019 (le document figé),
// RG-020 (le journal avant confirmation).

import { enEcriture, lireTous, lireUn } from './_sql.js';
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
import { rg015 } from '../regles/rg-015.js';
import { rg016 } from '../regles/rg-016.js';
import { rg023, restantsAConstater } from '../regles/rg-023.js';
import { rg024 } from '../regles/rg-024.js';
import { rg025 } from '../regles/rg-025.js';
import { rg026 } from '../regles/rg-026.js';

const STATUTS_CAMPAGNE = ['preparee', 'en_cours', 'close'];
const QUALITES_AGENT = ['operateur', 'detenteur', 'temoin'];
const RESULTATS = ['conforme', 'ecart', 'introuvable'];
const STATUTS_ECART = ['constate', 'explique', 'tranche'];
const DECISIONS = ['regularisation', 'perte', 'maintien'];
const ETATS_BIEN = [
  'neuf', 'bon', 'a_reparer', 'hors_service', 'en_maintenance', 'reforme', 'perdu',
];

// Les rôles qui saisissent un constat sur le terrain. Un agent désigné
// `detenteur` sur la campagne y est ajouté, à la ligne, parce que c'est une
// désignation et non un rôle du contrat §4 : c'est vérifié dans la route.
const ROLES_CONSTAT = ['magasinier', 'comptable_matieres'];

/**
 * Le périmètre d'une campagne, en SQL.
 *
 * Trois bornes, et chacune a sa raison :
 *   — la **structure**, qui est la clé de cloisonnement (ADR-001) ;
 *   — le **site**, quand la campagne en désigne un : on inventorie un magasin,
 *     pas toute une structure ;
 *   — la **date arrêtée** (art. 120) : un bien acquis après elle n'appartient
 *     pas à cet inventaire, sans quoi le périmètre bougerait pendant la
 *     campagne et l'avancement ne voudrait rien dire.
 *
 * Les biens réformés en sont exclus : ils sont sortis du service, et le PV de
 * réforme en tient la trace. Les biens `perdu`, en revanche, y restent : un bien
 * ne disparaît jamais du registre (RG-015), et c'est à l'inventaire de confirmer
 * qu'il est toujours introuvable.
 */
const PERIMETRE = `
  from bien b
 where b.structure_id = $1
   and ($2::uuid is null or b.site_id = $2::uuid)
   and b.etat <> 'reforme'
   and b.date_acquisition <= $3::date`;

const parametresPerimetre = (campagne) => [
  campagne.structure_id, campagne.site_id ?? null, campagne.date_arretee,
];

/**
 * La nature d'un écart : ce qui diffère réellement entre le constat et la fiche.
 *
 * Fonction pure, et volontairement ordonnée. Un constat peut différer sur
 * plusieurs points ; la nature retenue est la première de cet ordre, du plus
 * grave au moins grave pour la comptabilité des matières : une quantité fausse
 * fausse les comptes, un détenteur faux fausse la responsabilité, une
 * localisation fausse ne fausse qu'un rangement. Le détail complet reste dans
 * le constat, qui n'est pas réécrit.
 *
 * Rend `null` quand rien ne diffère : la route en fait alors une erreur de
 * saisie, parce qu'annoncer un écart sans écart est une contradiction, pas une
 * anomalie à instruire.
 */
export function natureEcart({ resultat, constat, bien } = {}) {
  if (resultat === 'introuvable') return 'introuvable';
  if (resultat !== 'ecart') return null;
  const memeReference = (constate, fiche) => {
    if (constate === null || constate === undefined) return true;
    return String(constate) === String(fiche ?? '');
  };
  if (constat?.quantite_comptee !== null && constat?.quantite_comptee !== undefined
      && Number(constat.quantite_comptee) !== Number(bien?.quantite ?? 0)) {
    return 'quantite';
  }
  if (constat?.etat_constate && constat.etat_constate !== bien?.etat) return 'etat';
  if (!memeReference(constat?.detenteur_constate_id, bien?.detenteur_id)) return 'detenteur';
  if (!memeReference(constat?.site_constate_id, bien?.site_id)) return 'localisation';
  return null;
}

// La gravité relative des états d'un bien, du meilleur au pire. Sert à savoir
// si un écart d'état est une dégradation ou une amélioration, et donc quel
// mouvement l'inscrit.
const GRAVITE_ETAT = ['neuf', 'bon', 'en_maintenance', 'a_reparer', 'hors_service', 'perdu'];

/**
 * Le mouvement qui inscrit une régularisation d'inventaire.
 *
 * Il n'y a **pas** de type « régularisation » dans le registre (contrat §2), et
 * c'est tant mieux : une régularisation n'est pas un acte sans contenu. Elle
 * constate qu'un acte a eu lieu sans être inscrit, et c'est cet acte-là qu'on
 * inscrit, avec son vrai nom :
 *
 *   — une quantité comptée au-dessus de la fiche est une **entrée** jamais
 *     enregistrée ; au-dessous, une **sortie** ;
 *   — un détenteur ou un site autres que ceux de la fiche sont un **transfert**
 *     jamais enregistré ;
 *   — un état dégradé est un **déclassement**, un état meilleur un **retour de
 *     maintenance**.
 *
 * Ce choix n'est pas cosmétique : ces types portent le sens des quantités dans
 * `sigl_sens_mouvement`, donc la ligne de stock suit le comptage physique — ce
 * qui est l'objet même d'un inventaire. Un type neutre choisi par commodité
 * aurait laissé le stock faux après une campagne censée le corriger.
 *
 * Fonction pure. Rend `null` quand aucun mouvement ne convient, ce qui est le
 * cas d'un bien introuvable : on ne régularise pas ce qu'on n'a pas vu.
 */
export function mouvementDeRegularisation({ nature, delta = 0, etat_avant, etat_constate } = {}) {
  if (nature === 'quantite') {
    if (delta > 0) return { type: 'entree', quantite: delta };
    if (delta < 0) return { type: 'sortie', quantite: -delta };
    return null;
  }
  if (nature === 'detenteur' || nature === 'localisation') return { type: 'transfert', quantite: null };
  if (nature === 'etat') {
    const avant = GRAVITE_ETAT.indexOf(etat_avant);
    const apres = GRAVITE_ETAT.indexOf(etat_constate);
    if (avant === -1 || apres === -1 || apres === avant) return null;
    return { type: apres > avant ? 'declassement' : 'retour_maintenance', quantite: null };
  }
  return null;
}

/**
 * Ce que RG-023 et RG-024 répondraient à une demande de clôture, calculé
 * **par le serveur**.
 *
 * L'écran s'en sert pour griser son bouton et nommer le motif. Il ne le
 * recalcule pas : si l'interface refaisait ce jugement, elle en détiendrait
 * l'autorité, et deux jugements finiraient par diverger.
 */
export function clotureCampagnePossible({ biens_du_perimetre, constates, ecarts }) {
  for (const resultat of [
    rg023({ biens_du_perimetre, constates }),
    rg024({ ecarts }),
  ]) {
    if (resultat) return { possible: false, code: resultat.code, motif: resultat.message };
  }
  return { possible: true, code: null, motif: null };
}

/** Le détail complet d'une campagne : agents, avancement, constats, écarts. */
async function chargerCampagne(request, id, { verifier = true } = {}) {
  const campagne = await lireUn(
    request,
    `select c.id, c.numero, c.libelle, c.statut, c.date_arretee, c.site_id,
            c.structure_id, s.code as structure_code, s.nom as structure_nom,
            s.regime as structure_regime, si.nom as site_nom,
            c.ouverte_le, c.ouverte_par, oa.nom as ouverte_par_nom,
            c.close_le, c.close_par, ca.nom as close_par_nom,
            c.cree_par, cr.nom as cree_par_nom, c.cree_le, c.maj_le
       from campagne_inventaire c
       join structure s on s.id = c.structure_id
       left join site si on si.id = c.site_id
       left join agent oa on oa.id = c.ouverte_par
       left join agent ca on ca.id = c.close_par
       left join agent cr on cr.id = c.cree_par
      where c.id = $1`,
    [id],
  );
  if (!campagne) throw nonTrouve("Cette campagne d'inventaire");
  // Le périmètre se lit sur la ligne de la campagne, jamais au bout d'une
  // jointure : c'est la leçon de la migration 20261127040000.
  if (verifier) await verifierLecture(request, campagne.structure_id);

  const agents = await lireTous(
    request,
    `select ca.agent_id, a.nom, a.fonction, ca.qualite, ca.designe_le
       from campagne_agent ca join agent a on a.id = ca.agent_id
      where ca.campagne_id = $1 order by ca.qualite, a.nom`,
    [campagne.id],
  );

  const perimetre = await lireUn(
    request,
    `select count(*)::int as n ${PERIMETRE}`,
    parametresPerimetre(campagne),
  );
  const compte = await lireUn(
    request,
    `select count(*)::int as constates,
            count(*) filter (where resultat = 'conforme')::int as conformes,
            count(*) filter (where resultat = 'ecart')::int as ecarts,
            count(*) filter (where resultat = 'introuvable')::int as introuvables
       from constat_inventaire where campagne_id = $1`,
    [campagne.id],
  );

  const constats = await lireTous(
    request,
    `select k.id, k.bien_id, b.immatriculation, b.designation, k.resultat,
            k.quantite_comptee, k.etat_constate, k.detenteur_constate_id,
            k.site_constate_id, k.observation,
            k.constate_par, a.nom as constate_par_nom, k.constate_le
       from constat_inventaire k
       join bien b on b.id = k.bien_id
       left join agent a on a.id = k.constate_par
      where k.campagne_id = $1
      order by k.constate_le desc`,
    [campagne.id],
  );

  const ecarts = await lireTous(
    request,
    `select e.id, e.constat_id, e.bien_id, b.immatriculation, b.designation,
            e.nature, e.ecart_quantite, e.statut, e.explication,
            e.explique_par, xa.nom as explique_par_nom, e.explique_le,
            e.decision, e.motif_decision,
            e.tranche_par, ta.nom as tranche_par_nom, e.tranche_le,
            e.document_id, e.mouvement_id,
            extract(day from now() - e.cree_le)::int as anciennete_jours
       from ecart_inventaire e
       join bien b on b.id = e.bien_id
       left join agent xa on xa.id = e.explique_par
       left join agent ta on ta.id = e.tranche_par
      where e.campagne_id = $1
      order by e.cree_le`,
    [campagne.id],
  );

  const biens = perimetre?.n ?? 0;
  const avancement = {
    biens_du_perimetre: biens,
    constates: compte.constates,
    conformes: compte.conformes,
    ecarts: compte.ecarts,
    introuvables: compte.introuvables,
    restants: restantsAConstater({ biens_du_perimetre: biens, constates: compte.constates }),
    // Une proportion entre 0 et 1, arrondie au dix-millième. L'interface
    // l'affiche, elle ne la recalcule pas.
    taux: biens === 0 ? 0 : Math.round((Math.min(compte.constates, biens) / biens) * 10_000) / 10_000,
  };

  return {
    campagne,
    agents,
    avancement,
    constats,
    ecarts,
    // Le contrat du lot nomme ce champ `clotures_possible` pour la campagne et
    // `cloture_possible` pour le rapprochement. On garde les deux noms tels
    // quels : c'est le contrat que l'interface lit.
    clotures_possible: clotureCampagnePossible({
      biens_du_perimetre: biens, constates: compte.constates, ecarts,
    }),
  };
}

/** L'écart, son constat et le bien, en une lecture. Le périmètre est vérifié. */
async function chargerEcart(request, id) {
  const ecart = await lireUn(
    request,
    `select e.*, k.constate_par, k.resultat, k.quantite_comptee, k.etat_constate,
            k.detenteur_constate_id, k.site_constate_id, k.observation as constat_observation,
            c.numero as campagne_numero, c.statut as campagne_statut
       from ecart_inventaire e
       join constat_inventaire k on k.id = e.constat_id
       join campagne_inventaire c on c.id = e.campagne_id
      where e.id = $1`,
    [id],
  );
  if (!ecart) throw nonTrouve('Cet écart d’inventaire');
  await verifierLecture(request, ecart.structure_id);
  return ecart;
}

/** Vrai si l'agent est désigné sur la campagne, à cette qualité. */
async function estDesigne(request, campagneId, agentId, qualite) {
  const ligne = await lireUn(
    request,
    'select 1 as oui from campagne_agent where campagne_id = $1 and agent_id = $2 and qualite = $3',
    [campagneId, agentId, qualite],
  );
  return Boolean(ligne);
}

export default async function routesInventaire(app) {
  // --- La liste des campagnes -------------------------------------------
  app.get('/api/campagnes-inventaire', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          statut: { type: 'string', enum: STATUTS_CAMPAGNE },
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
      ou += ` and c.structure_id = $${params.length}`;
    } else {
      const permises = await structuresDe(request);
      if (permises !== null) {
        if (permises.length === 0) return liste([], 0, page);
        const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
        params.push(...permises);
        ou += ` and c.structure_id in (${places})`;
      }
    }
    if (request.query.statut) {
      params.push(request.query.statut);
      ou += ` and c.statut = $${params.length}`;
    }
    if (request.query.q) {
      params.push(`%${request.query.q.toLowerCase()}%`);
      ou += ` and (lower(c.numero) like $${params.length} or lower(c.libelle) like $${params.length})`;
    }

    const total = await lireUn(
      request, `select count(*)::int as n from campagne_inventaire c ${ou}`, params,
    );
    // L'avancement et les écarts pendants sont comptés par la base : la liste
    // porte ses chiffres, l'écran n'en recalcule aucun.
    const donnees = await lireTous(
      request,
      `select c.id, c.numero, c.libelle, c.statut, c.date_arretee,
              c.structure_id, s.code as structure_code, s.nom as structure_nom,
              s.regime as structure_regime, c.site_id, si.nom as site_nom,
              c.ouverte_le, c.close_le, c.cree_le,
              (select count(*)::int from bien b
                where b.structure_id = c.structure_id
                  and (c.site_id is null or b.site_id = c.site_id)
                  and b.etat <> 'reforme'
                  and b.date_acquisition <= c.date_arretee) as biens_du_perimetre,
              (select count(*)::int from constat_inventaire k
                where k.campagne_id = c.id) as constates,
              (select count(*)::int from ecart_inventaire e
                where e.campagne_id = c.id) as ecarts,
              (select count(*)::int from ecart_inventaire e
                where e.campagne_id = c.id and e.statut <> 'tranche') as ecarts_non_tranches
         from campagne_inventaire c
         join structure s on s.id = c.structure_id
         left join site si on si.id = c.site_id
         ${ou}
        order by c.date_arretee desc, c.cree_le desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(
      donnees.map((c) => ({
        ...c,
        restants: restantsAConstater({ biens_du_perimetre: c.biens_du_perimetre, constates: c.constates }),
        taux: c.biens_du_perimetre === 0
          ? 0
          : Math.round((Math.min(c.constates, c.biens_du_perimetre) / c.biens_du_perimetre) * 10_000) / 10_000,
      })),
      total.n,
      page,
    );
  });

  // --- L'ouverture d'une campagne, au sens administratif ----------------
  app.post('/api/campagnes-inventaire', {
    // Le comptable des matières tient la campagne : art. 120 lui confie la
    // comptabilité des matières, et c'est elle qu'on arrête à date fixe.
    preHandler: ecriture('comptable_matieres'),
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['libelle', 'structure_id', 'date_arretee'],
        properties: {
          libelle: { type: 'string', minLength: 3, maxLength: 200 },
          structure_id: { type: 'string', format: 'uuid' },
          site_id: { type: ['string', 'null'], format: 'uuid' },
          date_arretee: { type: 'string', format: 'date' },
        },
      },
    },
  }, async (request, reply) => {
    const corps = request.body;
    // RG-018 : une structure autonome n'est jamais écrite par le niveau central.
    await verifierEcritureStructure(request, corps.structure_id);

    if (corps.site_id) {
      const site = await lireUn(
        request, 'select id, structure_id, nom from site where id = $1', [corps.site_id],
      );
      if (!site) throw nonTrouve('Ce site');
      if (String(site.structure_id) !== String(corps.structure_id)) {
        throw donneesInvalides(
          "Choisissez un site de la structure inventoriée : un inventaire ne traverse pas la frontière d'une structure.",
          'site_id',
        );
      }
    }

    const resultat = await enEcriture(request, async () => {
      const numero = await prochainNumero('campagne_inventaire');
      // RG-020 : le journal est écrit avant que l'action soit confirmée.
      await journaliserDepuis(request, {
        action: 'creation_campagne_inventaire',
        objet_type: 'campagne_inventaire',
        objet_id: numero,
        avant: null,
        apres: {
          numero, libelle: corps.libelle, structure_id: corps.structure_id,
          site_id: corps.site_id ?? null, date_arretee: corps.date_arretee, statut: 'preparee',
        },
      });
      return lireUn(
        request,
        `insert into campagne_inventaire (numero, libelle, structure_id, site_id, date_arretee,
                                          statut, cree_par)
         values ($1, $2, $3, $4, $5, 'preparee', $6) returning *`,
        [numero, corps.libelle, corps.structure_id, corps.site_id ?? null,
          corps.date_arretee, request.agent.id],
      );
    });

    publier({
      type: 'creation',
      objet: 'inventaire',
      id: resultat.id,
      structure_id: resultat.structure_id,
      donnees: { numero: resultat.numero, libelle: resultat.libelle, statut: resultat.statut },
    });
    reply.code(201);
    return chargerCampagne(request, resultat.id);
  });

  // --- Le détail -------------------------------------------------------
  app.get('/api/campagnes-inventaire/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => chargerCampagne(request, request.params.id));

  // --- La désignation des agents : art. 122 -----------------------------
  app.post('/api/campagnes-inventaire/:id/agents', {
    preHandler: ecriture('comptable_matieres'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['agent_id', 'qualite'],
        properties: {
          agent_id: { type: 'string', format: 'uuid' },
          qualite: { type: 'string', enum: QUALITES_AGENT },
        },
      },
    },
  }, async (request, reply) => {
    const { campagne } = await chargerCampagne(request, request.params.id);
    await verifierEcritureStructure(request, campagne.structure_id);
    if (campagne.statut === 'close') {
      throw donneesInvalides(
        'Cette campagne est close : la liste des agents désignés ne se rouvre pas.', 'statut',
      );
    }

    const agent = await lireUn(
      request, 'select id, nom, fonction, structure_id, actif from agent where id = $1',
      [request.body.agent_id],
    );
    if (!agent) throw nonTrouve('Cet agent');
    if (agent.actif === false) {
      throw donneesInvalides(
        "Désignez un agent en activité : ce compte d'agent est désactivé.", 'agent_id',
      );
    }
    const deja = await lireUn(
      request,
      'select 1 as oui from campagne_agent where campagne_id = $1 and agent_id = $2 and qualite = $3',
      [campagne.id, agent.id, request.body.qualite],
    );
    if (deja) {
      throw donneesInvalides(
        `${agent.nom} est déjà désigné « ${request.body.qualite} » sur cette campagne.`, 'agent_id',
      );
    }

    await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'designation_agent_inventaire',
        objet_type: 'campagne_inventaire',
        objet_id: campagne.id,
        avant: null,
        apres: { agent_id: agent.id, agent_nom: agent.nom, qualite: request.body.qualite },
      });
      return lireUn(
        request,
        `insert into campagne_agent (campagne_id, agent_id, structure_id, qualite, designe_par)
         values ($1, $2, $3, $4, $5) returning *`,
        [campagne.id, agent.id, campagne.structure_id, request.body.qualite, request.agent.id],
      );
    });

    publier({
      type: 'designation', objet: 'inventaire', id: campagne.id,
      structure_id: campagne.structure_id,
      donnees: { agent_nom: agent.nom, qualite: request.body.qualite },
    });
    reply.code(201);
    return chargerCampagne(request, campagne.id);
  });

  // --- L'ouverture des opérations ---------------------------------------
  app.post('/api/campagnes-inventaire/:id/ouvrir', {
    preHandler: ecriture('comptable_matieres'),
    schema: { params: schemaIdParam, body: { type: ['object', 'null'], additionalProperties: false, properties: {} } },
  }, async (request) => {
    const detail = await chargerCampagne(request, request.params.id);
    const { campagne } = detail;
    await verifierEcritureStructure(request, campagne.structure_id);
    if (campagne.statut !== 'preparee') {
      throw donneesInvalides(
        `Cette campagne est au statut « ${campagne.statut} » : seule une campagne préparée s'ouvre.`,
        'statut',
      );
    }
    // Art. 122 : l'inventaire se fait en présence de qui détient. Une campagne
    // ouverte sans personne de désigné n'aurait ni opérateur pour compter ni
    // détenteur pour attester.
    if (detail.agents.length === 0) {
      throw donneesInvalides(
        "Désignez au moins un agent avant d'ouvrir les opérations : l'inventaire se fait par des agents nommés, que le détenteur puisse attester.",
        'agents',
      );
    }

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'ouverture_campagne_inventaire',
        objet_type: 'campagne_inventaire',
        objet_id: campagne.id,
        avant: { statut: campagne.statut, ouverte_le: campagne.ouverte_le },
        apres: { statut: 'en_cours', ouverte_par: request.agent.id, agents: detail.agents.length },
      });
      return lireUn(
        request,
        `update campagne_inventaire
            set statut = 'en_cours', ouverte_le = now(), ouverte_par = $2, maj_le = now()
          where id = $1 returning *`,
        [campagne.id, request.agent.id],
      );
    });

    publier({
      type: 'ouverture', objet: 'inventaire', id: resultat.id,
      structure_id: resultat.structure_id, donnees: { numero: resultat.numero, statut: 'en_cours' },
    });
    return chargerCampagne(request, campagne.id);
  });

  // --- Le constat d'un bien --------------------------------------------
  //
  // La garde de rôle est volontairement large, et le droit réel est vérifié
  // dans la route : un agent désigné `detenteur` saisit un constat sans porter
  // pour autant un rôle du contrat §4. Un contrôle qui ne pourrait s'exprimer
  // qu'en `preHandler` aurait fermé cette porte, que l'art. 122 ouvre.
  app.post('/api/campagnes-inventaire/:id/constats', {
    preHandler: ecriture(),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['bien_id', 'resultat'],
        properties: {
          bien_id: { type: 'string', format: 'uuid' },
          resultat: { type: 'string', enum: RESULTATS },
          quantite_comptee: { type: ['integer', 'null'], minimum: 0 },
          etat_constate: { type: ['string', 'null'], enum: [...ETATS_BIEN, null] },
          detenteur_constate_id: { type: ['string', 'null'], format: 'uuid' },
          site_constate_id: { type: ['string', 'null'], format: 'uuid' },
          observation: { type: ['string', 'null'], maxLength: 2000 },
        },
      },
    },
  }, async (request, reply) => {
    const corps = request.body;
    const { campagne } = await chargerCampagne(request, request.params.id);
    await verifierEcritureStructure(request, campagne.structure_id);

    if (campagne.statut !== 'en_cours') {
      throw donneesInvalides(
        campagne.statut === 'preparee'
          ? "Ouvrez d'abord les opérations : une campagne préparée ne reçoit pas de constat."
          : 'Cette campagne est close : elle ne reçoit plus de constat.',
        'statut',
      );
    }

    const autorise = ROLES_CONSTAT.some((r) => request.agent.roles.includes(r))
      || await estDesigne(request, campagne.id, request.agent.id, 'detenteur');
    if (!autorise) {
      throw nonAutorise(
        "Faites porter ce constat par un magasinier, le comptable des matières, ou un agent désigné « detenteur » sur cette campagne.",
      );
    }

    // Le bien doit être du périmètre arrêté : c'est la borne de l'art. 120, et
    // elle se vérifie sur la ligne du bien, pas sur ce que la requête affirme.
    const bien = await lireUn(
      request,
      `select b.id, b.immatriculation, b.designation, b.quantite, b.etat, b.classement,
              b.suivi, b.structure_id, b.site_id, b.detenteur_id, b.date_acquisition
         ${PERIMETRE} and b.id = $4`,
      [...parametresPerimetre(campagne), corps.bien_id],
    );
    if (!bien) {
      throw donneesInvalides(
        "Ce bien n'est pas du périmètre de la campagne : vérifiez sa structure, son site, et qu'il était acquis à la date arrêtée.",
        'bien_id',
      );
    }

    const deja = await lireUn(
      request,
      'select id from constat_inventaire where campagne_id = $1 and bien_id = $2',
      [campagne.id, bien.id],
    );
    if (deja) {
      throw donneesInvalides(
        `Ce bien a déjà été constaté dans cette campagne : un bien ne se compte qu'une fois. Reprenez le constat ${deja.id}.`,
        'bien_id',
      );
    }

    // Un bien introuvable n'a ni quantité comptée ni état constaté : on ne
    // décrit pas ce qu'on n'a pas vu. La base le tient aussi.
    const constat = corps.resultat === 'introuvable'
      ? { ...corps, quantite_comptee: null, etat_constate: null }
      : corps;

    const nature = natureEcart({ resultat: corps.resultat, constat, bien });
    if (corps.resultat === 'ecart' && nature === null) {
      throw donneesInvalides(
        "Vous annoncez un écart mais rien ne diffère de la fiche du bien : si tout concorde, le résultat est « conforme ».",
        'resultat',
      );
    }
    if (corps.resultat === 'conforme') {
      const differe = natureEcart({ resultat: 'ecart', constat, bien });
      if (differe) {
        throw donneesInvalides(
          `Vous annoncez un constat conforme alors que la ${differe === 'quantite' ? 'quantité' : differe} diffère de la fiche : choisissez « ecart ».`,
          'resultat',
        );
      }
    }

    const ecartQuantite = constat.quantite_comptee === null || constat.quantite_comptee === undefined
      ? null
      : Number(constat.quantite_comptee) - Number(bien.quantite ?? 0);

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'constat_inventaire',
        objet_type: 'constat_inventaire',
        objet_id: `${campagne.numero}/${bien.immatriculation ?? bien.id}`,
        // La fiche du bien telle qu'elle est, pour que le journal porte la
        // confrontation et non le seul constat.
        avant: {
          quantite: bien.quantite, etat: bien.etat,
          detenteur_id: bien.detenteur_id, site_id: bien.site_id,
        },
        apres: {
          resultat: corps.resultat,
          quantite_comptee: constat.quantite_comptee ?? null,
          etat_constate: constat.etat_constate ?? null,
          detenteur_constate_id: corps.detenteur_constate_id ?? null,
          site_constate_id: corps.site_constate_id ?? null,
          nature_ecart: nature,
        },
      });

      const ligne = await lireUn(
        request,
        `insert into constat_inventaire (campagne_id, bien_id, structure_id, resultat,
            quantite_comptee, etat_constate, detenteur_constate_id, site_constate_id,
            observation, constate_par)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
        [campagne.id, bien.id, campagne.structure_id, corps.resultat,
          constat.quantite_comptee ?? null, constat.etat_constate ?? null,
          corps.detenteur_constate_id ?? null, corps.site_constate_id ?? null,
          corps.observation ?? null, request.agent.id],
      );

      // Le constat engendre l'écart, et rien d'autre : la fiche du bien ne
      // bouge pas. C'est la décision humaine qui régularisera.
      let ecart = null;
      if (nature !== null) {
        ecart = await lireUn(
          request,
          `insert into ecart_inventaire (constat_id, campagne_id, bien_id, structure_id,
              nature, ecart_quantite, statut)
           values ($1,$2,$3,$4,$5,$6,'constate') returning *`,
          [ligne.id, campagne.id, bien.id, campagne.structure_id, nature,
            nature === 'quantite' ? ecartQuantite : null],
        );
      }
      return { constat: ligne, ecart };
    });

    publier({
      type: 'constat', objet: 'inventaire', id: campagne.id,
      structure_id: campagne.structure_id,
      donnees: {
        campagne_numero: campagne.numero,
        bien: bien.immatriculation ?? bien.designation,
        resultat: corps.resultat,
        nature_ecart: nature,
      },
    });
    reply.code(201);
    return { ...resultat, bien: { id: bien.id, immatriculation: bien.immatriculation, designation: bien.designation } };
  });

  // --- La clôture : RG-023 et RG-024 -----------------------------------
  app.post('/api/campagnes-inventaire/:id/clore', {
    preHandler: ecriture('comptable_matieres'),
    schema: {
      params: schemaIdParam,
      body: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: { conclusion: { type: ['string', 'null'], maxLength: 2000 } },
      },
    },
  }, async (request) => {
    const detail = await chargerCampagne(request, request.params.id);
    const { campagne, avancement, ecarts } = detail;
    await verifierEcritureStructure(request, campagne.structure_id);
    if (campagne.statut !== 'en_cours') {
      throw donneesInvalides(
        `Cette campagne est au statut « ${campagne.statut} » : seule une campagne en cours se clôt.`,
        'statut',
      );
    }

    // RG-023 puis RG-024, dans cet ordre : on ne reproche pas un écart pendant
    // à qui n'a pas encore fini de compter.
    appliquerToutes([
      rg023({ biens_du_perimetre: avancement.biens_du_perimetre, constates: avancement.constates }),
      rg024({ ecarts }),
    ]);

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'cloture_campagne_inventaire',
        objet_type: 'campagne_inventaire',
        objet_id: campagne.id,
        avant: { statut: campagne.statut, close_le: campagne.close_le },
        apres: { statut: 'close', close_par: request.agent.id, avancement },
      });

      // L'état d'inventaire : la pièce que l'art. 120 fait établir. Figée,
      // comme toute pièce émise (RG-019) ; on en émet une autre si besoin.
      const numero = await prochainNumero('etat_inventaire');
      const document = await lireUn(
        request,
        `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
                               signataire_id, signe_le, fige)
         values ('etat_inventaire', $1, $2, 'campagne_inventaire', $3, $4, $5, now(), true)
         returning *`,
        [numero, campagne.structure_id, String(campagne.id),
          JSON.stringify({
            campagne: campagne.numero,
            libelle: campagne.libelle,
            date_arretee: campagne.date_arretee,
            structure: campagne.structure_nom,
            site: campagne.site_nom,
            avancement,
            ecarts: ecarts.map((e) => ({
              bien: e.immatriculation ?? e.designation,
              nature: e.nature,
              ecart_quantite: e.ecart_quantite,
              decision: e.decision,
              motif_decision: e.motif_decision,
            })),
            conclusion: request.body?.conclusion ?? null,
            agents: detail.agents.map((a) => ({ nom: a.nom, qualite: a.qualite })),
            mention: 'État d’inventaire établi à la date arrêtée, décret 13/050 art. 120. Les décisions portées sur les écarts ont été prises par des agents nommés.',
          }),
          request.agent.id],
      );

      const close = await lireUn(
        request,
        `update campagne_inventaire
            set statut = 'close', close_le = now(), close_par = $2, maj_le = now()
          where id = $1 returning *`,
        [campagne.id, request.agent.id],
      );
      return { campagne: close, document };
    });

    publier({
      type: 'cloture', objet: 'inventaire', id: campagne.id,
      structure_id: campagne.structure_id,
      donnees: { numero: campagne.numero, statut: 'close', document: resultat.document.numero },
    });
    return { ...(await chargerCampagne(request, campagne.id)), document: resultat.document };
  });

  // --- Les écarts, vus de partout --------------------------------------
  app.get('/api/ecarts-inventaire', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          statut: { type: 'string', enum: STATUTS_ECART },
          nature: { type: 'string', enum: ['quantite', 'etat', 'detenteur', 'localisation', 'introuvable'] },
          campagne: { type: 'string', format: 'uuid' },
          structure: { type: 'string', format: 'uuid' },
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
    for (const [cle, colonne] of [['statut', 'e.statut'], ['nature', 'e.nature'], ['campagne', 'e.campagne_id']]) {
      if (request.query[cle]) {
        params.push(request.query[cle]);
        ou += ` and ${colonne} = $${params.length}`;
      }
    }

    const total = await lireUn(
      request, `select count(*)::int as n from ecart_inventaire e ${ou}`, params,
    );
    const donnees = await lireTous(
      request,
      `select e.id, e.campagne_id, c.numero as campagne_numero, c.libelle as campagne_libelle,
              c.statut as campagne_statut, e.constat_id,
              e.bien_id, b.immatriculation, b.designation,
              e.nature, e.ecart_quantite, e.statut,
              e.explication, e.explique_le, xa.nom as explique_par_nom,
              e.decision, e.motif_decision, e.tranche_le, ta.nom as tranche_par_nom,
              k.constate_par, ka.nom as constate_par_nom, k.constate_le,
              e.structure_id, s.code as structure_code, s.nom as structure_nom,
              e.document_id, e.mouvement_id, e.cree_le,
              extract(day from now() - e.cree_le)::int as anciennete_jours
         from ecart_inventaire e
         join campagne_inventaire c on c.id = e.campagne_id
         join constat_inventaire k on k.id = e.constat_id
         join bien b on b.id = e.bien_id
         join structure s on s.id = e.structure_id
         left join agent xa on xa.id = e.explique_par
         left join agent ta on ta.id = e.tranche_par
         left join agent ka on ka.id = k.constate_par
         ${ou}
        order by e.statut, e.cree_le
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(donnees, total.n, page);
  });

  // --- L'explication du détenteur : art. 122 ---------------------------
  app.post('/api/ecarts-inventaire/:id/expliquer', {
    preHandler: ecriture(),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['explication'],
        properties: { explication: { type: 'string', minLength: 3, maxLength: 2000 } },
      },
    },
  }, async (request) => {
    const ecart = await chargerEcart(request, request.params.id);
    await verifierEcritureStructure(request, ecart.structure_id);
    if (ecart.statut === 'tranche') {
      throw donneesInvalides(
        "Cet écart est tranché : son explication est conservée telle qu'elle a été donnée.", 'statut',
      );
    }

    // L'explication est portée par le détenteur du bien, ou par un agent
    // désigné `detenteur` sur la campagne : c'est lui que l'art. 122 fait
    // attester. Le comptable des matières peut la consigner pour lui, ce qui
    // arrive quand le détenteur n'a pas de compte — et le journal dira qui l'a
    // écrite.
    const bien = await lireUn(
      request, 'select id, detenteur_id, immatriculation, designation from bien where id = $1',
      [ecart.bien_id],
    );
    const autorise = String(bien?.detenteur_id ?? '') === String(request.agent.id)
      || request.agent.roles.includes('comptable_matieres')
      || await estDesigne(request, ecart.campagne_id, request.agent.id, 'detenteur');
    if (!autorise) {
      throw nonAutorise(
        "Faites porter cette explication par le détenteur du bien, un agent désigné « detenteur » sur la campagne, ou le comptable des matières : c'est le détenteur qui atteste les biens qui lui sont affectés.",
      );
    }

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'explication_ecart_inventaire',
        objet_type: 'ecart_inventaire',
        objet_id: ecart.id,
        avant: { statut: ecart.statut, explication: ecart.explication },
        apres: {
          statut: 'explique', explication: request.body.explication,
          explique_par: request.agent.id,
        },
      });
      return lireUn(
        request,
        `update ecart_inventaire
            set statut = 'explique', explication = $2, explique_par = $3, explique_le = now()
          where id = $1 returning *`,
        [ecart.id, request.body.explication, request.agent.id],
      );
    });

    publier({
      type: 'explication', objet: 'inventaire', id: resultat.campagne_id,
      structure_id: resultat.structure_id,
      donnees: { ecart_id: resultat.id, bien: bien?.immatriculation ?? bien?.designation, statut: 'explique' },
    });
    return resultat;
  });

  // --- L'arbitrage : RG-025, RG-026 ------------------------------------
  app.post('/api/ecarts-inventaire/:id/trancher', {
    // Le comptable des matières et la logistique centrale arbitrent. Ni l'un ni
    // l'autre ne peut trancher ce qu'il a lui-même constaté : RG-026.
    preHandler: ecriture('comptable_matieres', 'logistique'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['decision', 'motif_decision'],
        properties: {
          decision: { type: 'string', enum: DECISIONS },
          motif_decision: { type: 'string', minLength: 3, maxLength: 2000 },
        },
      },
    },
  }, async (request) => {
    const { decision, motif_decision: motif } = request.body;
    const ecart = await chargerEcart(request, request.params.id);
    await verifierEcritureStructure(request, ecart.structure_id);
    if (ecart.campagne_statut === 'close') {
      throw donneesInvalides(
        'Cette campagne est close : ses écarts ont été tranchés avant la clôture.', 'statut',
      );
    }

    // RG-016 : le SIGL instruit, il ne prononce pas. La vérification porte sur
    // l'action demandée, pas sur la décision : une décision de perte est
    // précisément ce qu'un humain a le droit de prendre ici.
    appliquer(rg016({ action: 'arbitrage_ecart_inventaire' }));
    // RG-025 puis RG-026 : l'explication d'abord, la séparation des fonctions
    // ensuite. L'ordre suit le circuit.
    appliquerToutes([
      rg025({ statut: ecart.statut, explication: ecart.explication }),
      rg026({ constate_par: ecart.constate_par, tranche_par: request.agent.id }),
    ]);

    const bien = await lireUn(
      request,
      `select b.*, s.code as structure_code from bien b
         join structure s on s.id = b.structure_id where b.id = $1`,
      [ecart.bien_id],
    );
    if (!bien) throw nonTrouve('Le bien de cet écart');

    // On ne régularise pas ce qu'on n'a pas vu : un bien introuvable n'a pas de
    // constat sur lequel aligner sa fiche. La décision est alors la perte, ou
    // le maintien tant que la recherche continue — et c'est un humain qui la
    // prend, pas le système.
    if (decision === 'regularisation') {
      const compte = ecart.quantite_comptee;
      const choix = mouvementDeRegularisation({
        nature: ecart.nature,
        delta: compte === null || compte === undefined
          ? 0 : Number(compte) - Number(bien.quantite ?? 0),
        etat_avant: bien.etat,
        etat_constate: ecart.etat_constate,
      });
      if (!choix) {
        throw donneesInvalides(
          ecart.nature === 'introuvable'
            ? "Un bien introuvable ne se régularise pas : tranchez en « perte », ou en « maintien » si la recherche continue."
            : "Rien à régulariser sur cet écart : le constat ne diffère plus de la fiche. Tranchez en « maintien » en indiquant pourquoi.",
          'decision',
        );
      }
    }

    const avantBien = {
      quantite: bien.quantite, etat: bien.etat,
      detenteur_id: bien.detenteur_id, site_id: bien.site_id,
    };

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: decision === 'perte' ? 'perte' : 'arbitrage_ecart_inventaire',
        objet_type: 'ecart_inventaire',
        objet_id: ecart.id,
        avant: { statut: ecart.statut, decision: ecart.decision, bien: avantBien },
        apres: {
          statut: 'tranche', decision, motif_decision: motif,
          tranche_par: request.agent.id, nature: ecart.nature,
        },
      });

      let document = null;
      let mouvement = null;
      let bienApres = bien;

      // `mouvement.agent_id` porte une clé étrangère composite vers
      // `agent (structure_id, id)` : un agent du niveau central qui arbitre un
      // écart d'une structure intégrée n'est pas de cette structure, et la
      // colonne reste donc nulle. Le journal, lui, nomme toujours l'auteur —
      // c'est là que se lit qui a décidé.
      const agentDuMouvement = String(request.agent.structure_id) === String(bien.structure_id)
        ? request.agent.id
        : null;

      if (decision === 'perte') {
        // RG-015 : le bien ne disparaît pas, il passe à l'état `perdu`.
        appliquer(rg015({ type_mouvement: 'perte', etat_cible: 'perdu', supprime_la_fiche: false }));
        // RG-016 : le SIGL produit le procès-verbal ; la décision appartient à
        // l'autorité qui le signe. La pièce est figée (RG-019).
        const numero = await prochainNumero('pv_perte');
        document = await lireUn(
          request,
          `insert into document (type, numero, structure_id, objet_type, objet_id, contenu, fige)
           values ('pv_perte', $1, $2, 'bien', $3, $4, true) returning *`,
          [numero, bien.structure_id, String(bien.id),
            JSON.stringify({
              immatriculation: bien.immatriculation,
              designation: bien.designation,
              quantite: bien.quantite,
              etat_avant: bien.etat,
              etat_apres: 'perdu',
              origine: 'inventaire physique',
              campagne: ecart.campagne_numero,
              nature_ecart: ecart.nature,
              explication_detenteur: ecart.explication,
              motif: motif,
              instruit_par: request.agent.nom,
              mention: "Le SIGL instruit et produit le procès-verbal ; la décision appartient à l'autorité compétente qui le signe.",
            })],
        );
        mouvement = await lireUn(
          request,
          `insert into mouvement (bien_id, structure_id, type, quantite, date,
                                  structure_source_code, motif, document_id, agent_id)
           values ($1, $2, 'perte', $3, current_date, $4, $5, $6, $7) returning *`,
          [bien.id, bien.structure_id, bien.quantite, bien.structure_code,
            `Perte constatée à l'inventaire ${ecart.campagne_numero} — ${motif}`,
            document.id, agentDuMouvement],
        );
        bienApres = await lireUn(
          request,
          "update bien set etat = 'perdu', maj_le = now() where id = $1 returning *",
          [bien.id],
        );
      } else if (decision === 'regularisation') {
        // La fiche s'aligne sur le constat, et l'acte jamais inscrit est
        // inscrit sous son vrai nom — voir `mouvementDeRegularisation`.
        const compte = ecart.quantite_comptee;
        const delta = compte === null || compte === undefined
          ? 0
          : Number(compte) - Number(bien.quantite ?? 0);
        const choix = mouvementDeRegularisation({
          nature: ecart.nature, delta,
          etat_avant: bien.etat, etat_constate: ecart.etat_constate,
        });
        mouvement = await lireUn(
          request,
          `insert into mouvement (bien_id, structure_id, type, quantite, date,
                                  structure_source_code, detenteur_source, detenteur_cible,
                                  motif, agent_id)
           values ($1, $2, $3, $4, current_date, $5, $6, $7, $8, $9) returning *`,
          [bien.id, bien.structure_id, choix.type, choix.quantite ?? bien.quantite,
            bien.structure_code,
            bien.detenteur_id, ecart.detenteur_constate_id ?? bien.detenteur_id,
            `Régularisation d'inventaire ${ecart.campagne_numero} — écart de ${ecart.nature} — ${motif}`,
            agentDuMouvement],
        );
        bienApres = await lireUn(
          request,
          `update bien set quantite = coalesce($2, quantite),
                           etat = coalesce($3, etat),
                           detenteur_id = coalesce($4, detenteur_id),
                           site_id = coalesce($5, site_id),
                           maj_le = now()
            where id = $1 returning *`,
          [bien.id,
            compte === null || compte === undefined || Number(compte) <= 0 ? null : Number(compte),
            ecart.etat_constate ?? null,
            ecart.detenteur_constate_id ?? null,
            ecart.site_constate_id ?? null],
        );
      }
      // `maintien` : la fiche ne bouge pas. Le motif est obligatoire et
      // conservé — c'est lui qui justifie qu'on ne régularise pas.

      const tranche = await lireUn(
        request,
        `update ecart_inventaire
            set statut = 'tranche', decision = $2, motif_decision = $3,
                tranche_par = $4, tranche_le = now(),
                document_id = coalesce($5, document_id),
                mouvement_id = coalesce($6, mouvement_id)
          where id = $1 returning *`,
        [ecart.id, decision, motif, request.agent.id, document?.id ?? null, mouvement?.id ?? null],
      );
      return { ecart: tranche, bien: bienApres, document, mouvement };
    });

    publier({
      type: 'arbitrage', objet: 'inventaire', id: ecart.campagne_id,
      structure_id: ecart.structure_id,
      donnees: {
        ecart_id: ecart.id, decision, nature: ecart.nature,
        bien: bien.immatriculation ?? bien.designation,
      },
    });
    if (decision === 'perte') {
      // Le patrimoine a bougé : les écrans du registre et du stock l'apprennent
      // aussi, puisque c'est leur objet qui change d'état.
      publier({
        type: 'mouvement_perte', objet: 'patrimoine', id: bien.id,
        structure_id: bien.structure_id, donnees: { etat: 'perdu', origine: 'inventaire' },
      });
    }
    return resultat;
  });
}
