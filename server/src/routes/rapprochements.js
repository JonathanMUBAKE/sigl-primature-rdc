// Le rapprochement périodique contradictoire. Décret 13/050 art. 123 :
// « des rapprochements périodiques contradictoires sont effectués entre les
// données de la comptabilité des matières et celles de la comptabilité générale
// de l'État ».
//
// CE QUE C'EST, ET CE QUE CE N'EST PAS. Ce n'est pas un rapport : c'est une
// fonction (CONCEPTION.md §9). Deux jeux de données, une confrontation
// périodique, la liste des écarts poste par poste, et la trace de leur
// traitement. Le système produit le constat et conserve l'explication.
//
// LA MOITIÉ QUI MANQUE, DITE FRANCHEMENT. La comptabilité générale de la
// Primature n'est pas interfacée, et personne ne sait encore comment elle est
// tenue — c'est une question ouverte de la conception. `valeur_matieres` est
// donc **calculée** depuis `bien`, et `valeur_generale` est **saisie**. Le jour
// où l'interface existera, c'est cette seule colonne qui changera de source.
//
// Règles tenues ici : RG-027 (le contradictoire), RG-017 et RG-018 (la portée),
// RG-020 (le journal avant confirmation).

import { enEcriture, lireTous, lireUn } from './_sql.js';
import {
  ecriture, lecture, structuresDe, verifierEcritureStructure, verifierLecture,
} from './_droits.js';
import {
  appliquer, donneesInvalides, liste, nonAutorise, nonTrouve,
  pagination, schemaIdParam, schemaPagination,
} from './_commun.js';
import { journaliserDepuis } from './_journal.js';
import { prochainNumero } from './_numeros.js';
import { publier } from './_flux.js';
import { QUALITES_PARTIE, rg027 } from '../regles/rg-027.js';

const STATUTS = ['ouvert', 'constate', 'clos'];

/**
 * La valeur d'un poste en comptabilité des matières, **calculée** depuis le
 * registre des biens.
 *
 * La nomenclature est hiérarchique : un poste de rapprochement est un poste
 * comptable, donc une catégorie et toute sa descendance. Sans la descendance,
 * un rapprochement sur « Informatique » ne verrait aucun des ordinateurs
 * rangés sous « Informatique / Micro-ordinateurs », et l'écart affiché serait
 * la totalité du poste — un faux écart, le pire des résultats pour une fonction
 * dont l'objet est de les détecter.
 *
 * Bornes : les biens de la structure, acquis au plus tard à la fin de la
 * période, non réformés. Un bien `perdu` y reste : il est encore au registre
 * (RG-015), et c'est justement ce genre d'écart que l'art. 123 cherche.
 */
async function valeurEnMatieres(request, { structureId, categorieCode, periodeFin }) {
  const ligne = await lireUn(
    request,
    `with recursive famille as (
        select code from categorie where code = $2
        union all
        select c.code from categorie c join famille f on c.parent_code = f.code
      )
      select coalesce(sum(b.valeur_acquisition), 0) as valeur,
             count(*)::int as biens
        from bien b
       where b.structure_id = $1
         and b.categorie_code in (select code from famille)
         and b.etat <> 'reforme'
         and b.date_acquisition <= $3::date`,
    [structureId, categorieCode, periodeFin],
  );
  return { valeur: Number(ligne?.valeur ?? 0), biens: ligne?.biens ?? 0 };
}

/**
 * Ce que RG-027 répondrait à une demande de clôture, calculé **par le serveur**.
 * L'écran grise son bouton et nomme le motif ; il ne refait pas le jugement.
 */
export function clotureRapprochementPossible({ postes, parties }) {
  // Un rapprochement sans poste ne confronte rien : il n'y a pas d'écart à
  // conclure, et la conclusion porterait sur le vide.
  if (!Array.isArray(postes) || postes.length === 0) {
    return {
      possible: false,
      code: 'donnees_invalides',
      motif: "Renseignez au moins un poste avant de clore : un rapprochement sans poste ne confronte aucune donnée.",
    };
  }
  const resultat = rg027({ parties });
  if (resultat) return { possible: false, code: resultat.code, motif: resultat.message };
  return { possible: true, code: null, motif: null };
}

/** Les totaux des deux colonnes et leur écart. Calculés par le serveur. */
export function totauxDesPostes(postes = []) {
  const matieres = postes.reduce((somme, p) => somme + Number(p.valeur_matieres ?? 0), 0);
  // Un poste dont la comptabilité générale n'est pas encore saisie ne compte
  // pas pour zéro : il compte pour rien, et le total le dit à part.
  const saisis = postes.filter((p) => p.valeur_generale !== null && p.valeur_generale !== undefined);
  const generale = saisis.reduce((somme, p) => somme + Number(p.valeur_generale), 0);
  return {
    valeur_matieres: Math.round(matieres * 100) / 100,
    valeur_generale: Math.round(generale * 100) / 100,
    ecart: Math.round((matieres - generale) * 100) / 100,
    postes_sans_comptabilite_generale: postes.length - saisis.length,
  };
}

/** Le détail complet d'un rapprochement : postes, parties, totaux, clôture. */
async function chargerRapprochement(request, id, { verifier = true } = {}) {
  const rapprochement = await lireUn(
    request,
    `select r.id, r.numero, r.statut, r.periode_debut, r.periode_fin, r.conclusion,
            r.structure_id, s.code as structure_code, s.nom as structure_nom,
            s.regime as structure_regime,
            r.clos_le, r.clos_par, ca.nom as clos_par_nom,
            r.cree_par, cr.nom as cree_par_nom, r.cree_le
       from rapprochement r
       join structure s on s.id = r.structure_id
       left join agent ca on ca.id = r.clos_par
       left join agent cr on cr.id = r.cree_par
      where r.id = $1`,
    [id],
  );
  if (!rapprochement) throw nonTrouve('Ce rapprochement');
  // Le périmètre se lit sur la ligne du rapprochement, jamais au bout d'une
  // jointure externe vers une table cloisonnée.
  if (verifier) await verifierLecture(request, rapprochement.structure_id);

  const postes = await lireTous(
    request,
    `select p.id, p.categorie_code, c.libelle as categorie_libelle, c.classement,
            p.valeur_matieres, p.valeur_generale, p.explication,
            case when p.valeur_generale is null then null
                 else p.valeur_matieres - p.valeur_generale end as ecart
       from rapprochement_poste p
       join categorie c on c.code = p.categorie_code
      where p.rapprochement_id = $1
      order by c.libelle`,
    [rapprochement.id],
  );
  // L'identité des parties passe par `sigl_identite_agent` : le comptable
  // général n'est pas un agent de la structure (art. 123), et une jointure
  // ordinaire vers `agent` ferait **disparaître** sa ligne — le contradictoire
  // deviendrait invisible et RG-027 incompréhensible. Voir le commentaire de la
  // migration 20261127070000.
  const parties = await lireTous(
    request,
    `select pa.id, pa.agent_id, a.nom, a.fonction, pa.qualite, pa.atteste_le, pa.reserve
       from rapprochement_partie pa
       left join lateral sigl_identite_agent(pa.agent_id) a on true
      where pa.rapprochement_id = $1
      order by pa.qualite`,
    [rapprochement.id],
  );

  return {
    rapprochement,
    postes,
    parties,
    totaux: totauxDesPostes(postes),
    cloture_possible: clotureRapprochementPossible({ postes, parties }),
  };
}

export default async function routesRapprochements(app) {
  // --- La liste ---------------------------------------------------------
  app.get('/api/rapprochements', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          statut: { type: 'string', enum: STATUTS },
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
      ou += ` and r.structure_id = $${params.length}`;
    } else {
      const permises = await structuresDe(request);
      if (permises !== null) {
        if (permises.length === 0) return liste([], 0, page);
        const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
        params.push(...permises);
        ou += ` and r.structure_id in (${places})`;
      }
    }
    if (request.query.statut) {
      params.push(request.query.statut);
      ou += ` and r.statut = $${params.length}`;
    }

    const total = await lireUn(
      request, `select count(*)::int as n from rapprochement r ${ou}`, params,
    );
    const donnees = await lireTous(
      request,
      `select r.id, r.numero, r.statut, r.periode_debut, r.periode_fin, r.conclusion,
              r.structure_id, s.code as structure_code, s.nom as structure_nom,
              s.regime as structure_regime, r.clos_le, r.cree_le,
              (select count(*)::int from rapprochement_poste p
                where p.rapprochement_id = r.id) as nombre_postes,
              (select coalesce(sum(p.valeur_matieres), 0) from rapprochement_poste p
                where p.rapprochement_id = r.id) as valeur_matieres,
              (select coalesce(sum(p.valeur_generale), 0) from rapprochement_poste p
                where p.rapprochement_id = r.id and p.valeur_generale is not null) as valeur_generale,
              (select count(*)::int from rapprochement_partie pa
                where pa.rapprochement_id = r.id and pa.atteste_le is not null) as attestations
         from rapprochement r
         join structure s on s.id = r.structure_id
         ${ou}
        order by r.periode_fin desc, r.cree_le desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(
      donnees.map((r) => ({
        ...r,
        ecart: Math.round((Number(r.valeur_matieres) - Number(r.valeur_generale)) * 100) / 100,
        // Deux attestations sur deux : le contradictoire est complet.
        attestations_attendues: QUALITES_PARTIE.length,
      })),
      total.n,
      page,
    );
  });

  // --- L'ouverture ------------------------------------------------------
  app.post('/api/rapprochements', {
    // Le comptable des matières tient le rapprochement : c'est sa comptabilité
    // qu'on confronte, et l'art. 123 en fait l'une des deux parties.
    preHandler: ecriture('comptable_matieres'),
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['structure_id', 'periode_debut', 'periode_fin'],
        properties: {
          structure_id: { type: 'string', format: 'uuid' },
          periode_debut: { type: 'string', format: 'date' },
          periode_fin: { type: 'string', format: 'date' },
        },
      },
    },
  }, async (request, reply) => {
    const corps = request.body;
    // RG-018 : une structure autonome n'est jamais écrite par le niveau central.
    await verifierEcritureStructure(request, corps.structure_id);
    if (corps.periode_fin < corps.periode_debut) {
      throw donneesInvalides(
        'Corrigez la période : sa fin ne peut pas précéder son début.', 'periode_fin',
      );
    }

    const resultat = await enEcriture(request, async () => {
      const numero = await prochainNumero('rapprochement');
      await journaliserDepuis(request, {
        action: 'ouverture_rapprochement',
        objet_type: 'rapprochement',
        objet_id: numero,
        avant: null,
        apres: {
          numero, structure_id: corps.structure_id,
          periode_debut: corps.periode_debut, periode_fin: corps.periode_fin, statut: 'ouvert',
        },
      });
      return lireUn(
        request,
        `insert into rapprochement (numero, structure_id, periode_debut, periode_fin, statut, cree_par)
         values ($1, $2, $3, $4, 'ouvert', $5) returning *`,
        [numero, corps.structure_id, corps.periode_debut, corps.periode_fin, request.agent.id],
      );
    });

    publier({
      type: 'creation', objet: 'rapprochement', id: resultat.id,
      structure_id: resultat.structure_id,
      donnees: { numero: resultat.numero, statut: resultat.statut },
    });
    reply.code(201);
    return chargerRapprochement(request, resultat.id);
  });

  // --- Le détail -------------------------------------------------------
  app.get('/api/rapprochements/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => chargerRapprochement(request, request.params.id));

  // --- Un poste : la valeur des matières est calculée, l'autre est saisie --
  app.post('/api/rapprochements/:id/postes', {
    preHandler: ecriture('comptable_matieres'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['categorie_code'],
        properties: {
          categorie_code: { type: 'string', minLength: 1, maxLength: 40 },
          valeur_generale: { type: ['number', 'null'], minimum: 0 },
          explication: { type: ['string', 'null'], maxLength: 2000 },
        },
      },
    },
  }, async (request, reply) => {
    const { rapprochement } = await chargerRapprochement(request, request.params.id);
    await verifierEcritureStructure(request, rapprochement.structure_id);
    if (rapprochement.statut === 'clos') {
      throw donneesInvalides(
        'Ce rapprochement est clos : ses postes sont figés. Ouvrez-en un autre pour la période suivante.',
        'statut',
      );
    }

    const categorie = await lireUn(
      request, 'select code, libelle from categorie where code = $1', [request.body.categorie_code],
    );
    if (!categorie) throw nonTrouve('Cette catégorie de la nomenclature');

    const deja = await lireUn(
      request,
      'select id from rapprochement_poste where rapprochement_id = $1 and categorie_code = $2',
      [rapprochement.id, categorie.code],
    );
    if (deja) {
      throw donneesInvalides(
        `Le poste « ${categorie.libelle} » figure déjà dans ce rapprochement : un poste n'y paraît qu'une fois.`,
        'categorie_code',
      );
    }

    // La valeur en comptabilité des matières n'est pas saisissable : elle est
    // le registre. Si elle était saisie, le rapprochement confronterait deux
    // déclarations au lieu de confronter une déclaration au registre.
    const matieres = await valeurEnMatieres(request, {
      structureId: rapprochement.structure_id,
      categorieCode: categorie.code,
      periodeFin: rapprochement.periode_fin,
    });

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'poste_rapprochement',
        objet_type: 'rapprochement',
        objet_id: rapprochement.id,
        avant: null,
        apres: {
          categorie_code: categorie.code,
          valeur_matieres: matieres.valeur,
          biens_comptes: matieres.biens,
          valeur_generale: request.body.valeur_generale ?? null,
        },
      });
      const poste = await lireUn(
        request,
        `insert into rapprochement_poste (rapprochement_id, structure_id, categorie_code,
            valeur_matieres, valeur_generale, explication)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [rapprochement.id, rapprochement.structure_id, categorie.code,
          matieres.valeur, request.body.valeur_generale ?? null, request.body.explication ?? null],
      );
      // `ouvert` → `constate` quand chaque poste porte les deux colonnes : le
      // rapprochement a alors produit son constat, et il n'attend plus que les
      // deux attestations. Tant qu'un poste est muet du côté de la
      // comptabilité générale, il reste `ouvert` — et il y retourne si on lui
      // ajoute un poste incomplet, parce qu'un constat partiel n'est pas un
      // constat.
      await lireUn(
        request,
        `update rapprochement r
            set statut = case when exists (
                  select 1 from rapprochement_poste p
                   where p.rapprochement_id = r.id and p.valeur_generale is null
                ) then 'ouvert' else 'constate' end
          where r.id = $1 and r.statut <> 'clos'`,
        [rapprochement.id],
      );
      return poste;
    });

    publier({
      type: 'poste', objet: 'rapprochement', id: rapprochement.id,
      structure_id: rapprochement.structure_id,
      donnees: { categorie: categorie.libelle, valeur_matieres: matieres.valeur },
    });
    reply.code(201);
    return { ...(await chargerRapprochement(request, rapprochement.id)), poste: resultat };
  });

  // --- Les deux parties au contradictoire ------------------------------
  app.post('/api/rapprochements/:id/parties', {
    preHandler: ecriture('comptable_matieres'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['agent_id', 'qualite'],
        properties: {
          agent_id: { type: 'string', format: 'uuid' },
          qualite: { type: 'string', enum: QUALITES_PARTIE },
        },
      },
    },
  }, async (request, reply) => {
    const { rapprochement } = await chargerRapprochement(request, request.params.id);
    await verifierEcritureStructure(request, rapprochement.structure_id);
    if (rapprochement.statut === 'clos') {
      throw donneesInvalides(
        'Ce rapprochement est clos : la liste des parties ne se rouvre pas.', 'statut',
      );
    }

    // Même raison : la seconde partie est, le plus souvent, un agent d'une
    // autre structure. On la nomme par le résolveur, pas par `agent`.
    const agent = await lireUn(
      request, 'select id, nom, fonction, actif from sigl_identite_agent($1)',
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
      `select pa.id, a.nom from rapprochement_partie pa
         left join lateral sigl_identite_agent(pa.agent_id) a on true
        where pa.rapprochement_id = $1 and pa.qualite = $2`,
      [rapprochement.id, request.body.qualite],
    );
    if (deja) {
      throw donneesInvalides(
        `La qualité « ${request.body.qualite} » est déjà portée par ${deja.nom} : le contradictoire a deux parties, pas trois.`,
        'qualite',
      );
    }

    await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'partie_rapprochement',
        objet_type: 'rapprochement',
        objet_id: rapprochement.id,
        avant: null,
        apres: { agent_id: agent.id, agent_nom: agent.nom, qualite: request.body.qualite },
      });
      return lireUn(
        request,
        `insert into rapprochement_partie (rapprochement_id, structure_id, agent_id, qualite)
         values ($1, $2, $3, $4) returning *`,
        [rapprochement.id, rapprochement.structure_id, agent.id, request.body.qualite],
      );
    });

    publier({
      type: 'partie', objet: 'rapprochement', id: rapprochement.id,
      structure_id: rapprochement.structure_id,
      donnees: { agent_nom: agent.nom, qualite: request.body.qualite },
    });
    reply.code(201);
    return chargerRapprochement(request, rapprochement.id);
  });

  // --- L'attestation : chacun signe pour son côté, réserve comprise -----
  //
  // La garde de rôle est large parce que le droit ne vient pas d'un rôle du
  // contrat §4 mais de la **désignation** : seul un agent inscrit comme partie
  // atteste, et pour sa seule qualité. Personne ne peut attester pour l'autre
  // côté : ce serait la négation du contradictoire.
  app.post('/api/rapprochements/:id/attester', {
    preHandler: ecriture(),
    schema: {
      params: schemaIdParam,
      body: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: { reserve: { type: ['string', 'null'], maxLength: 2000 } },
      },
    },
  }, async (request) => {
    const detail = await chargerRapprochement(request, request.params.id);
    const { rapprochement } = detail;
    await verifierEcritureStructure(request, rapprochement.structure_id);
    if (rapprochement.statut === 'clos') {
      throw donneesInvalides(
        'Ce rapprochement est clos : les attestations qu’il porte sont celles qui ont été données.',
        'statut',
      );
    }
    if (detail.postes.length === 0) {
      throw donneesInvalides(
        "Renseignez les postes avant de faire attester : on n'atteste pas une confrontation qui n'a pas eu lieu.",
        'postes',
      );
    }

    const partie = detail.parties.find((p) => String(p.agent_id) === String(request.agent.id));
    if (!partie) {
      throw nonAutorise(
        "Seules les deux parties inscrites au rapprochement attestent : faites-vous désigner comme comptable des matières ou comptable général avant d'attester.",
      );
    }
    if (partie.atteste_le) {
      throw donneesInvalides(
        'Vous avez déjà attesté ce rapprochement : votre attestation est conservée telle quelle.',
        'atteste_le',
      );
    }

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'attestation_rapprochement',
        objet_type: 'rapprochement',
        objet_id: rapprochement.id,
        avant: { qualite: partie.qualite, atteste_le: null, statut: rapprochement.statut },
        apres: {
          qualite: partie.qualite, agent_id: request.agent.id,
          reserve: request.body?.reserve ?? null,
        },
      });
      return lireUn(
        request,
        `update rapprochement_partie set atteste_le = now(), reserve = $3
          where rapprochement_id = $1 and agent_id = $2 returning *`,
        [rapprochement.id, request.agent.id, request.body?.reserve ?? null],
      );
    });

    publier({
      type: 'attestation', objet: 'rapprochement', id: rapprochement.id,
      structure_id: rapprochement.structure_id,
      donnees: { qualite: partie.qualite, avec_reserve: Boolean(resultat.reserve) },
    });
    return chargerRapprochement(request, rapprochement.id);
  });

  // --- La clôture : RG-027 ---------------------------------------------
  app.post('/api/rapprochements/:id/clore', {
    preHandler: ecriture('comptable_matieres'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['conclusion'],
        properties: { conclusion: { type: 'string', minLength: 3, maxLength: 4000 } },
      },
    },
  }, async (request) => {
    const detail = await chargerRapprochement(request, request.params.id);
    const { rapprochement, postes, parties, totaux } = detail;
    await verifierEcritureStructure(request, rapprochement.structure_id);
    if (rapprochement.statut === 'clos') {
      throw donneesInvalides('Ce rapprochement est déjà clos.', 'statut');
    }
    if (postes.length === 0) {
      throw donneesInvalides(
        "Renseignez au moins un poste avant de clore : un rapprochement sans poste ne confronte aucune donnée.",
        'postes',
      );
    }
    // RG-027 : attesté par les deux parties, et par elles seules.
    appliquer(rg027({ parties }));

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'cloture_rapprochement',
        objet_type: 'rapprochement',
        objet_id: rapprochement.id,
        avant: { statut: rapprochement.statut, conclusion: rapprochement.conclusion },
        apres: {
          statut: 'clos', conclusion: request.body.conclusion,
          clos_par: request.agent.id, totaux,
          attestations: parties.map((p) => ({
            qualite: p.qualite, agent: p.nom, reserve: p.reserve ?? null,
          })),
        },
      });
      return lireUn(
        request,
        `update rapprochement
            set statut = 'clos', conclusion = $2, clos_le = now(), clos_par = $3
          where id = $1 returning *`,
        [rapprochement.id, request.body.conclusion, request.agent.id],
      );
    });

    publier({
      type: 'cloture', objet: 'rapprochement', id: resultat.id,
      structure_id: resultat.structure_id,
      donnees: { numero: resultat.numero, statut: 'clos', ecart: totaux.ecart },
    });
    return chargerRapprochement(request, rapprochement.id);
  });
}
