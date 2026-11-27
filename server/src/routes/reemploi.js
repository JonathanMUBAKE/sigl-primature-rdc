// L'offre de réemploi et les demandes : les étapes 3 à 5 du circuit.
//
// **C'est le cœur économique du lot**, et la seule partie qui ne découle pas du
// décret 13/050 mais d'un constat de bon sens, emprunté au dispositif des biens
// excédentaires de l'administration américaine. Sans elle, du matériel encore
// utilisable est réformé d'un côté et racheté de l'autre.
//
// LES QUATRE CHOSES QUI COMMANDENT CE FICHIER.
//
// 1. **Une offre est une publication, et aucune lecture d'ici ne la cloisonne.**
//    `offre_reemploi` est la seule table du SIGL lisible de toute session
//    positionnée (migration 20261127080000). Les routes de lecture ci-dessous
//    ne posent donc **aucun filtre de périmètre** sur les offres, et c'est
//    voulu : une offre que les autres structures ne voient pas est une étape
//    qui n'existe pas.
//
// 2. **Et aucune de ces lectures ne joint une table cloisonnée.** Ni `bien`, ni
//    `dossier_reforme`, ni `agent`. L'offre porte sa propre copie du bien ; le
//    nom de celui qui l'a ouverte vient de `sigl_identite_agent`. Une jointure
//    interne vers `bien` aurait fait **disparaître** l'offre hors périmètre, une
//    jointure externe l'aurait affichée vide : c'est le piège de la migration
//    040000 et celui du comptable général de la 070000, pris une troisième fois
//    par le même bout.
//
// 3. **Le réemploi ne circule qu'entre structures de régime `integre`.** Faire
//    entrer un bien de la Primature dans le patrimoine d'un établissement
//    public autonome — personnalité juridique distincte, budget propre,
//    comptable propre — n'est pas un réemploi mais une **cession**, que le SIGL
//    ne prononce jamais (RG-016, RG-018). Le refus le dit en ces termes.
//
// 4. **Trancher une demande en l'acceptant prononce le réemploi, dans la même
//    transaction.** Un mouvement de type `reemploi` qui transfère le bien, un
//    document `acte_transfert`, l'offre close, les autres demandes écartées
//    d'office, et le dossier passé à `reemploye`. Un seul geste : deux routes
//    pour un acte unique en laisseraient une moitié faite.
//
// Règles tenues ici : RG-029 (une offre ouverte et la réforme ne coexistent
// pas), RG-016 et RG-018 (le réemploi n'est pas une cession, et une autonome
// n'est pas écrite d'en haut), RG-015 (le bien ne disparaît jamais — il change
// de main, il ne sort pas du registre), RG-017 (la portée), RG-019 (l'acte de
// transfert figé), RG-020 (le journal avant confirmation).

import { enEcriture, lireTous, lireUn } from './_sql.js';
import {
  ecriture, lecture, verifierEcritureStructure, verifierLectureStricte,
} from './_droits.js';
import {
  appliquer, donneesInvalides, erreur, liste, nonTrouve,
  pagination, schemaIdParam, schemaPagination,
} from './_commun.js';
import { journaliserDepuis } from './_journal.js';
import { prochainNumero } from './_numeros.js';
import { publier } from './_flux.js';
import { chargerDemandes, chargerDossier } from './reforme.js';
import { mentionDeDate } from '../regles/dates.js';
import { rg015 } from '../regles/rg-015.js';
import { rg029 } from '../regles/rg-029.js';

export const STATUTS_OFFRE = ['ouverte', 'close'];
export const STATUTS_DEMANDE = ['deposee', 'acceptee', 'ecartee'];
export const DECISIONS_DEMANDE = ['accepte', 'ecarte'];

// Les statuts d'une demande, en français lisible, **pour les messages**. Même
// partage que dans `reforme.js` : le statut technique reste la donnée, le
// libellé est la phrase.
const LIBELLES_STATUT_DEMANDE = {
  deposee: 'déposée',
  acceptee: 'acceptée',
  ecartee: 'écartée',
};

const direStatutDemande = (statut) => LIBELLES_STATUT_DEMANDE[statut] ?? statut ?? 'inconnu';

// Qui demande un réemploi pour sa structure : contrat §5, paragraphe « Droits ».
const ROLES_DEMANDE = ['chef_structure', 'magasinier', 'comptable_matieres'];

const NOM_AGENT = (colonne) => `(select nom from sigl_identite_agent(${colonne}))`;

// Aucune jointure, et c'est le point : tout ce que l'offre publie est sur sa
// propre ligne.
const CHAMPS_OFFRE = `
  o.id, o.numero, o.dossier_id, o.structure_id, o.site_origine_id,
  o.bien_immatriculation, o.bien_designation, o.bien_categorie_code, o.bien_etat,
  o.structure_origine_code, o.structure_origine_nom, o.site_origine_nom,
  o.ouverte_le, o.close_le, o.cloture_prevue_le, o.duree_jours, o.statut,
  o.ouverte_par, ${NOM_AGENT('o.ouverte_par')} as ouverte_par_nom,
  o.close_par, ${NOM_AGENT('o.close_par')} as close_par_nom,
  greatest(0, ceil(extract(epoch from (o.cloture_prevue_le - now())) / 86400))::int as jours_restants`;

const possible = () => ({ possible: true, code: null, motif: null });
const impossible = (code, motif) => ({ possible: false, code, motif });

/**
 * Le refus opposé à un établissement autonome, dit en ses termes.
 *
 * Ce n'est pas une mesquinerie de périmètre : c'est une question de droit. Le
 * bien appartient à la Primature ; l'ARMP, l'APCSC, l'ARCCSU et la CNP sont des
 * personnes morales distinctes. Leur remettre un bien n'est pas le déplacer,
 * c'est l'aliéner — et aliéner relève des domaines (RG-016), jamais du SIGL.
 */
function motifRegimeAutonome(structure, cote) {
  return `${structure?.nom ?? 'Cette structure'} est un établissement de régime autonome : `
    + `${cote === 'demandeuse' ? 'elle ne peut pas demander' : 'son bien ne peut pas être offert'} un réemploi. `
    + "Faire entrer un bien de la Primature dans le patrimoine d'une personnalité juridique distincte "
    + "est une cession, que le SIGL ne prononce jamais (RG-016) ; et un établissement autonome tient sa "
    + "propre comptabilité des matières, dont le niveau central n'a que la vue consolidée (RG-018). "
    + "Pour céder ce bien, saisissez l'administration des domaines.";
}

/**
 * Ce qu'une demande de réemploi recevrait, dit d'avance. L'écran grise son
 * bouton et affiche le motif tel quel — même forme que `clotures_possible` de
 * l'inventaire, et le refus de la route est **cette même fonction**, lue une
 * seconde fois.
 */
export function demandePossible({
  offre, structure_demandeuse = null, structure_origine = null, ma_demande = null,
} = {}) {
  if (!offre) return impossible('non_trouve', "Cette offre de réemploi est introuvable.");
  if (offre.statut !== 'ouverte') {
    return impossible(
      'donnees_invalides',
      // La date passe par `mentionDeDate` : ce motif est affiché tel quel.
      `L'offre ${offre.numero} est close${mentionDeDate('depuis le', offre.close_le)} : elle ne reçoit plus de demande.`,
    );
  }
  if (!structure_demandeuse) {
    return impossible(
      'non_autorise',
      "Votre profil n'est rattaché à aucune structure : une demande de réemploi est portée par une structure, pas par une personne.",
    );
  }
  if (String(structure_demandeuse.id) === String(offre.structure_id)) {
    return impossible(
      'donnees_invalides',
      `C'est ${offre.structure_origine_nom} qui offre ce bien : on ne demande pas le réemploi d'un bien qu'on détient déjà.`,
    );
  }
  if (structure_demandeuse.regime !== 'integre') {
    return impossible('RG-018', motifRegimeAutonome(structure_demandeuse, 'demandeuse'));
  }
  if (structure_origine && structure_origine.regime !== 'integre') {
    return impossible('RG-018', motifRegimeAutonome(structure_origine, 'origine'));
  }
  if (ma_demande) {
    return impossible(
      'donnees_invalides',
      `${structure_demandeuse.nom} a déjà déposé une demande sur cette offre, au statut « ${direStatutDemande(ma_demande.statut)} ». Une structure ne demande qu'une fois.`,
    );
  }
  return possible();
}

/**
 * L'ancêtre commun sur lequel positionner la transaction d'un transfert entre
 * deux structures. **Fonction pure**, et elle n'est pas un détail.
 *
 * POURQUOI ELLE EXISTE. Le cloisonnement de l'ADR-001 est tenu par la base :
 * `sigl_ecriture_permise(cible)` n'autorise que sa propre structure et les
 * structures `integre` de sa descendance. Une transaction positionnée sur la
 * CGIG ne peut donc pas écrire au SGG, qui est sa structure sœur — et le
 * réemploi, qui déplace un bien de l'une à l'autre, serait refusé par la
 * politique de mise à jour de `bien`, qui exige le droit sur la ligne **avant
 * et après**.
 *
 * On positionne donc la transaction sur le premier ancêtre commun aux deux —
 * ici le Cabinet, qui est la racine du périmètre intégré. Ce n'est pas un
 * contournement : c'est exactement la sémantique que la migration 000500
 * documente, « le niveau central écrit dans le périmètre intégré, dont le
 * patrimoine est celui de la Primature ».
 *
 * Rend `null` quand aucun ancêtre commun n'existe, ou quand l'une des deux
 * extrémités est de régime `autonome` : dans ce cas aucun positionnement ne
 * rendrait l'écriture possible, et c'est tant mieux — ce serait une cession.
 */
export function ancetreCommunIntegre(structures = [], premier, second) {
  const parId = new Map(structures.map((s) => [String(s.id), s]));
  const chaine = (depart) => {
    const suite = [];
    const vus = new Set();
    let courant = parId.get(String(depart));
    while (courant && !vus.has(String(courant.id))) {
      vus.add(String(courant.id));
      suite.push(String(courant.id));
      courant = courant.parent_id ? parId.get(String(courant.parent_id)) : null;
    }
    return suite;
  };

  const montee = chaine(premier);
  const autre = new Set(chaine(second));
  const commun = montee.find((id) => autre.has(id));
  if (!commun) return null;

  for (const extremite of [premier, second]) {
    const structure = parId.get(String(extremite));
    if (!structure) return null;
    // L'extrémité qui est elle-même le point de positionnement y a droit quel
    // que soit son régime : on écrit chez soi. Les autres doivent être
    // intégrées.
    if (String(extremite) !== commun && structure.regime !== 'integre') return null;
  }
  return commun;
}

/** L'offre, seule, sans aucune jointure vers une table cloisonnée. */
async function chargerOffre(request, id) {
  const offre = await lireUn(
    request, `select ${CHAMPS_OFFRE} from offre_reemploi o where o.id = $1`, [id],
  );
  if (!offre) throw nonTrouve('Cette offre de réemploi');
  return offre;
}

/** La structure, par son identifiant. `structure` n'est pas cloisonnée. */
async function chargerStructure(request, id) {
  if (!id) return null;
  return lireUn(request, 'select id, code, nom, type, regime, parent_id from structure where id = $1', [id]);
}

export default async function routesReemploi(app) {
  // --- La vitrine : toutes les offres, lues de n'importe où --------------
  //
  // Aucun filtre de périmètre. C'est la seule liste du SIGL dans ce cas, et
  // elle l'est parce qu'elle sert une publication. **Un chef de structure doit
  // trouver ici, en deux clics depuis son tableau de bord, les biens offerts
  // par les autres.**
  app.get('/api/offres-reemploi', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ouvertes: { type: 'boolean' },
          structure_origine: { type: 'string', format: 'uuid' },
          q: { type: 'string', maxLength: 120 },
          ...schemaPagination,
        },
      },
    },
  }, async (request) => {
    const page = pagination(request.query);
    // `params` ne porte **que** les paramètres de la clause `where`, parce que
    // la requête de comptage réutilise cette clause telle quelle. L'identifiant
    // de la structure du lecteur, lui, ne sert qu'aux colonnes calculées de la
    // requête de données : il est ajouté après, à son propre rang. Les mélanger
    // faisait recevoir au comptage un paramètre qu'il n'employait pas, et
    // PostgreSQL refuse — « bind message supplies 1 parameters, but prepared
    // statement requires 0 ». La liste des offres rendait alors 500, et c'était
    // la seule route du lot à tomber.
    const params = [];
    let ou = 'where true';

    if (request.query.ouvertes === true) ou += " and o.statut = 'ouverte'";
    if (request.query.ouvertes === false) ou += " and o.statut = 'close'";
    if (request.query.structure_origine) {
      params.push(request.query.structure_origine);
      ou += ` and o.structure_id = $${params.length}`;
    }
    if (request.query.q) {
      params.push(`%${request.query.q.toLowerCase()}%`);
      ou += ` and (lower(o.numero) like $${params.length}
                   or lower(o.bien_designation) like $${params.length}
                   or lower(coalesce(o.bien_immatriculation, '')) like $${params.length}
                   or lower(o.structure_origine_nom) like $${params.length})`;
    }

    const total = await lireUn(
      request, `select count(*)::int as n from offre_reemploi o ${ou}`, params,
    );
    const moi = params.length + 1;
    const donnees = await lireTous(
      request,
      `select ${CHAMPS_OFFRE},
              -- Ce que le lecteur a le droit de voir des demandes : l'origine
              -- les voit toutes, une structure demandeuse ne voit que la
              -- sienne. Le compte suit donc la politique, et ne la contredit
              -- pas.
              (select count(*)::int from demande_reemploi dm where dm.offre_id = o.id)
                as demandes_visibles,
              (select dm.statut from demande_reemploi dm
                where dm.offre_id = o.id and dm.structure_demandeuse_id = $${moi}::uuid)
                as ma_demande_statut,
              (o.structure_id = $${moi}::uuid) as est_la_mienne
         from offre_reemploi o
         ${ou}
        order by (o.statut = 'ouverte') desc, o.cloture_prevue_le, o.ouverte_le desc
        limit $${moi + 1} offset $${moi + 2}`,
      [...params, request.agent.structure_id ?? null, page.parPage, page.decalage],
    );
    return liste(donnees, total.n, page);
  });

  // --- Le détail d'une offre, lu de n'importe où -------------------------
  app.get('/api/offres-reemploi/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const offre = await chargerOffre(request, request.params.id);
    const demandes = await chargerDemandes(request, offre.id);
    const demandeuse = await chargerStructure(request, request.agent.structure_id);
    const origine = await chargerStructure(request, offre.structure_id);
    const mienne = demandes.find(
      (d) => String(d.structure_demandeuse_id) === String(request.agent.structure_id),
    ) ?? null;

    return {
      offre,
      demandes,
      ma_demande: mienne,
      est_la_mienne: String(offre.structure_id) === String(request.agent.structure_id),
      // L'écran grise son bouton et affiche le motif. Il ne rejuge rien.
      demande_possible: demandePossible({
        offre,
        structure_demandeuse: demandeuse,
        structure_origine: origine,
        ma_demande: mienne,
      }),
    };
  });

  // --- Étape 4 : la demande d'une autre structure ------------------------
  app.post('/api/offres-reemploi/:id/demandes', {
    preHandler: ecriture(...ROLES_DEMANDE),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['motif'],
        properties: { motif: { type: 'string', minLength: 3, maxLength: 2000 } },
      },
    },
  }, async (request, reply) => {
    const offre = await chargerOffre(request, request.params.id);
    const demandeuse = await chargerStructure(request, request.agent.structure_id);
    const origine = await chargerStructure(request, offre.structure_id);
    const demandes = await chargerDemandes(request, offre.id);
    const mienne = demandes.find(
      (d) => String(d.structure_demandeuse_id) === String(request.agent.structure_id),
    ) ?? null;

    const verdict = demandePossible({
      offre, structure_demandeuse: demandeuse, structure_origine: origine, ma_demande: mienne,
    });
    if (!verdict.possible) {
      throw erreur(
        verdict.code,
        verdict.motif,
        verdict.code === 'RG-018' ? 'structure_demandeuse_id' : 'offre_id',
        verdict.code === 'RG-018' ? 422 : (verdict.code === 'non_autorise' ? 403 : 400),
      );
    }

    // RG-018, par la garde ordinaire : on écrit **chez soi**, et la transaction
    // se positionne donc sur la structure demandeuse — pas sur celle de
    // l'offre. Si elle se positionnait sur l'origine, la politique d'insertion
    // de `demande_reemploi`, qui contrôle `structure_demandeuse_id`, refuserait
    // l'écriture d'une structure sœur.
    await verifierEcritureStructure(request, demandeuse.id);

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'demande_reemploi',
        objet_type: 'offre_reemploi',
        objet_id: offre.id,
        avant: { offre: offre.numero, statut: offre.statut, demandes: demandes.length },
        apres: {
          structure_demandeuse_id: demandeuse.id,
          structure_demandeuse: demandeuse.nom,
          demande_par: request.agent.id,
          motif: request.body.motif,
          statut: 'deposee',
        },
      });
      // `insert … returning` se relit : la politique de lecture de
      // `demande_reemploi` couvre `structure_demandeuse_id`, donc la ligne
      // qu'on vient d'écrire est visible de la session qui l'a écrite.
      return lireUn(
        request,
        `insert into demande_reemploi (offre_id, structure_id, structure_demandeuse_id,
             demande_par, motif, statut)
         values ($1, $2, $3, $4, $5, 'deposee') returning *`,
        [offre.id, offre.structure_id, demandeuse.id, request.agent.id, request.body.motif],
      );
    }, demandeuse.id);

    publier({
      type: 'demande_deposee',
      objet: 'reemploi',
      id: offre.id,
      structure_id: offre.structure_id,
      donnees: {
        offre: offre.numero,
        bien: offre.bien_immatriculation ?? offre.bien_designation,
        structure_demandeuse: demandeuse.nom,
      },
    });
    reply.code(201);
    return { demande: resultat, offre };
  });

  // --- La clôture de l'offre, par la structure d'origine -----------------
  app.post('/api/offres-reemploi/:id/clore', {
    preHandler: ecriture('logistique'),
    schema: {
      params: schemaIdParam,
      body: { type: ['object', 'null'], additionalProperties: false, properties: {} },
    },
  }, async (request) => {
    const offre = await chargerOffre(request, request.params.id);
    await verifierEcritureStructure(request, offre.structure_id);

    if (offre.statut !== 'ouverte') {
      throw donneesInvalides(
        `L'offre ${offre.numero} est déjà close : une offre ne se clôt qu'une fois.`, 'statut',
      );
    }
    const demandes = await chargerDemandes(request, offre.id);
    const pendantes = demandes.filter((d) => d.statut === 'deposee');

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'cloture_offre_reemploi',
        objet_type: 'offre_reemploi',
        objet_id: offre.id,
        avant: { statut: offre.statut, close_le: offre.close_le },
        apres: {
          statut: 'close',
          close_par: request.agent.id,
          demandes_recues: demandes.length,
          // Clore l'offre ne tranche aucune demande, et c'est voulu : clore,
          // c'est arrêter de recevoir, pas répondre. Les demandes pendantes
          // restent à instruire, et **RG-028 bloque la saisine** tant qu'il en
          // reste une — une offre close sur une demande sans réponse ne prouve
          // pas que le réemploi a été cherché. Le journal porte le compte, pour
          // qu'on sache combien attendaient à la clôture.
          demandes_pendantes: pendantes.length,
        },
      });
      await lireUn(
        request,
        `update offre_reemploi
            set statut = 'close', close_le = now(), close_par = $2
          where id = $1 returning id`,
        [offre.id, request.agent.id],
      );
      return chargerOffre(request, offre.id);
    });

    publier({
      type: 'offre_close',
      objet: 'reemploi',
      id: offre.id,
      structure_id: offre.structure_id,
      donnees: {
        numero: offre.numero,
        statut: 'close',
        demandes_pendantes: pendantes.length,
      },
    });
    return { offre: resultat, demandes: await chargerDemandes(request, offre.id) };
  });

  // --- Étape 5 : trancher une demande, et prononcer le réemploi ----------
  //
  // Accepter, c'est faire l'acte. Un seul geste, une seule transaction.
  app.post('/api/demandes-reemploi/:id/trancher', {
    preHandler: ecriture('logistique'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['decision', 'motif'],
        properties: {
          decision: { type: 'string', enum: DECISIONS_DEMANDE },
          motif: { type: 'string', minLength: 3, maxLength: 2000 },
        },
      },
    },
  }, async (request) => {
    const { decision, motif } = request.body;

    const demande = await lireUn(
      request,
      `select m.id, m.offre_id, m.structure_id, m.structure_demandeuse_id, m.demande_par,
              m.motif, m.statut, m.motif_decision, m.tranchee_le, m.cree_le
         from demande_reemploi m where m.id = $1`,
      [request.params.id],
    );
    if (!demande) throw nonTrouve('Cette demande de réemploi');
    // Le périmètre se lit sur la ligne de la demande, et le rattachement est
    // obligatoire : `verifierLectureStricte`, jamais un périmètre deviné au
    // bout d'une jointure.
    await verifierLectureStricte(request, demande.structure_id, 'Cette demande de réemploi');

    if (demande.statut !== 'deposee') {
      throw donneesInvalides(
        `Cette demande est déjà tranchée (statut « ${direStatutDemande(demande.statut)} ») : la décision est prise et conservée.`,
        'statut',
      );
    }

    const offre = await chargerOffre(request, demande.offre_id);
    const detail = await chargerDossier(request, offre.dossier_id);
    const { dossier, bien } = detail;

    const origine = await chargerStructure(request, offre.structure_id);
    const demandeuse = await chargerStructure(request, demande.structure_demandeuse_id);

    // --- L'écart simple : la demande est écartée -------------------------
    //
    // RG-029 ne s'applique **pas** ici, et c'est délibéré. La règle interdit de
    // réemployer un bien déjà sous procès-verbal ; écarter une demande ne le
    // réemploie pas, cela y répond. Le cas est réel : une offre close sur une
    // demande restée pendante, puis la saisine. La structure qui avait demandé
    // le bien a droit à une réponse motivée, et la lui refuser au nom d'une
    // règle qui protège autre chose aurait laissé sa demande pendante
    // indéfiniment.
    if (decision === 'ecarte') {
      await verifierEcritureStructure(request, offre.structure_id);
      const ecartee = await enEcriture(request, async () => {
        await journaliserDepuis(request, {
          action: 'arbitrage_demande_reemploi',
          objet_type: 'demande_reemploi',
          objet_id: demande.id,
          avant: { statut: demande.statut, motif_decision: demande.motif_decision },
          apres: {
            statut: 'ecartee',
            motif_decision: motif,
            tranchee_par: request.agent.id,
            structure_demandeuse: demandeuse?.nom,
          },
        });
        return lireUn(
          request,
          `update demande_reemploi
              set statut = 'ecartee', motif_decision = $2, tranchee_le = now(), tranchee_par = $3
            where id = $1 returning *`,
          [demande.id, motif, request.agent.id],
        );
      });

      publier({
        type: 'demande_ecartee',
        objet: 'reemploi',
        id: offre.id,
        structure_id: offre.structure_id,
        donnees: { offre: offre.numero, structure_demandeuse: demandeuse?.nom },
      });
      return { demande: ecartee, offre, dossier: detail.dossier };
    }

    // --- L'acceptation : le réemploi est prononcé ------------------------
    //
    // RG-029, par sa seconde moitié : un bien déjà sous procès-verbal de réforme
    // ne se réemploie plus. C'est le cas réel — une offre close sur une demande
    // restée pendante, la saisine prononcée, puis quelqu'un qui accepte la
    // vieille demande. Sans ce contrôle, le registre dirait que le bien est
    // passé au SGG et le procès-verbal qu'il part au rebut.
    appliquer(rg029({ dossier_statut: dossier.statut, etat_bien: bien?.etat }));

    if (offre.statut !== 'ouverte') {
      throw donneesInvalides(
        `L'offre ${offre.numero} est close : pour attribuer ce bien, il faudrait la rouvrir, et une offre close ne se rouvre pas. Écartez cette demande en disant pourquoi.`,
        'statut',
      );
    }
    if (!bien || bien.hors_perimetre) {
      throw donneesInvalides(
        "La fiche du bien n'est pas lisible : le réemploi ne transfère pas un bien qu'on ne lit pas.",
        'bien_id',
      );
    }
    // Le réemploi ne circule qu'entre structures intégrées, dans les deux sens.
    for (const [structure, cote] of [[demandeuse, 'demandeuse'], [origine, 'origine']]) {
      if (structure?.regime !== 'integre') {
        throw erreur('RG-018', motifRegimeAutonome(structure, cote), 'structure_demandeuse_id', 422);
      }
    }
    // RG-015 : le bien change de main, il ne sort pas du registre.
    appliquer(rg015({ type_mouvement: 'reemploi', etat_cible: bien.etat, supprime_la_fiche: false }));

    await verifierEcritureStructure(request, origine.id);
    await verifierEcritureStructure(request, demandeuse.id);

    // Le positionnement de la transaction : le premier ancêtre commun aux deux
    // structures. Voir le commentaire long d'`ancetreCommunIntegre` — sans
    // cela, la politique de mise à jour de `bien`, qui exige le droit sur la
    // ligne avant **et** après, refuserait le transfert entre deux structures
    // sœurs.
    const structures = await lireTous(request, 'select id, parent_id, regime, code from structure');
    const pivot = ancetreCommunIntegre(structures, origine.id, demandeuse.id);
    if (!pivot) {
      throw erreur(
        'RG-018',
        `Aucun rattachement commun ne relie ${origine.nom} et ${demandeuse.nom} dans le périmètre intégré : le bien ne peut pas passer de l'une à l'autre au titre du réemploi.`,
        'structure_demandeuse_id',
        422,
      );
    }

    const autresPendantes = detail.demandes.filter(
      (d) => d.statut === 'deposee' && String(d.id) !== String(demande.id),
    );

    const resultat = await enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'reemploi_prononce',
        objet_type: 'dossier_reforme',
        objet_id: dossier.id,
        avant: {
          dossier_statut: dossier.statut,
          offre_statut: offre.statut,
          bien_structure_id: bien.structure_id,
          bien_structure: origine.nom,
          bien_site_id: bien.site_id,
          bien_detenteur_id: bien.detenteur_id,
          demande_statut: demande.statut,
        },
        apres: {
          dossier_statut: 'reemploye',
          offre_statut: 'close',
          bien_structure_id: demandeuse.id,
          bien_structure: demandeuse.nom,
          bien_site_id: null,
          bien_detenteur_id: null,
          demande_statut: 'acceptee',
          motif_decision: motif,
          autres_demandes_ecartees: autresPendantes.length,
          prononce_par: request.agent.id,
        },
      });

      // 1. L'acte de transfert, **figé** (RG-019). Il est émis au nom de la
      //    structure qui **reçoit** : c'est son titre de détention, c'est elle
      //    qui devra le produire à l'inventaire, et c'est avec la fiche du bien
      //    qu'il doit rester lisible. La structure d'origine, elle, garde le
      //    dossier de réforme, qui dit tout du circuit.
      const numeroActe = await prochainNumero('acte_transfert');
      const acte = await lireUn(
        request,
        `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
                               signataire_id, signe_le, fige)
         values ('acte_transfert', $1, $2, 'bien', $3, $4, $5, now(), true)
         returning id, type, numero, fige, signe_le, contenu`,
        [
          numeroActe, demandeuse.id, String(bien.id),
          JSON.stringify({
            origine: 'réemploi interne',
            dossier_reforme: dossier.numero,
            offre_reemploi: offre.numero,
            immatriculation: bien.immatriculation,
            designation: bien.designation,
            categorie: bien.categorie_libelle ?? bien.categorie_code,
            quantite: bien.quantite,
            etat: bien.etat,
            valeur_acquisition: bien.valeur_acquisition,
            date_acquisition: bien.date_acquisition,
            structure_cedante: origine.nom,
            structure_beneficiaire: demandeuse.nom,
            motif_demande: demande.motif,
            motif_decision: motif,
            prononce_par: request.agent.nom,
            mention: "Transfert interne au patrimoine de la Primature au titre du réemploi : le bien change de structure détentrice et ne sort pas du registre (RG-015). Ce n'est pas une cession — les deux structures relèvent du même patrimoine (RG-016, RG-018).",
          }),
          null,
        ],
      );

      // 2. La fiche du bien change de structure. Le site et le détenteur sont
      //    remis à nul : ce sont des références de l'ancienne structure, et
      //    l'ADR-001 interdit qu'elles traversent la frontière. La structure
      //    qui reçoit affectera le bien par un transfert ordinaire.
      const bienApres = await lireUn(
        request,
        `update bien
            set structure_id = $2, site_id = null, detenteur_id = null, maj_le = now()
          where id = $1
          returning id, immatriculation, designation, etat, structure_id, site_id,
                    detenteur_id, quantite, reforme_le`,
        [bien.id, demandeuse.id],
      );

      // 3. Le mouvement. Il est inscrit au nom de la structure qui reçoit, pour
      //    la même raison que l'acte : l'historique doit rester lisible avec la
      //    fiche. `agent_id` reste nul quand l'auteur n'est pas de cette
      //    structure — la clé étrangère composite de `mouvement` l'exige, et
      //    c'est le journal qui nomme toujours l'auteur.
      const agentDuMouvement = String(request.agent.structure_id) === String(demandeuse.id)
        ? request.agent.id
        : null;
      const mouvement = await lireUn(
        request,
        `insert into mouvement (bien_id, structure_id, type, quantite, date,
                                structure_source_code, structure_cible_code,
                                motif, document_id, agent_id)
         values ($1, $2, 'reemploi', $3, current_date, $4, $5, $6, $7, $8) returning *`,
        [
          bien.id, demandeuse.id, bien.quantite ?? 1, origine.code, demandeuse.code,
          `Réemploi interne : bien repris par ${demandeuse.nom} au titre de l'offre ${offre.numero} (dossier ${dossier.numero}) — ${motif}`,
          acte.id, agentDuMouvement,
        ],
      );

      // 4. La demande acceptée.
      const acceptee = await lireUn(
        request,
        `update demande_reemploi
            set statut = 'acceptee', motif_decision = $2, tranchee_le = now(), tranchee_par = $3
          where id = $1 returning *`,
        [demande.id, motif, request.agent.id],
      );

      // 5. Les autres demandes, écartées d'office — et motivées : une structure
      //    écartée a le droit de savoir à qui le bien est allé.
      const ecartees = await lireTous(
        request,
        `update demande_reemploi
            set statut = 'ecartee',
                motif_decision = $3,
                tranchee_le = now(), tranchee_par = $4
          where offre_id = $1 and id <> $2 and statut = 'deposee'
          returning id, structure_demandeuse_id`,
        [
          offre.id, demande.id,
          `Le bien a été attribué à ${demandeuse.nom} au titre de l'offre ${offre.numero}.`,
          request.agent.id,
        ],
      );

      // 6. L'offre est close : le bien est parti.
      const offreClose = await lireUn(
        request,
        `update offre_reemploi set statut = 'close', close_le = now(), close_par = $2
          where id = $1 returning id, numero, statut, close_le`,
        [offre.id, request.agent.id],
      );

      // 7. Le dossier se clôt **sans réforme**, et c'est tout l'objet du lot.
      const dossierApres = await lireUn(
        request,
        `update dossier_reforme
            set statut = 'reemploye', reemploye_le = now(), maj_le = now()
          where id = $1 returning id, numero, statut, reemploye_le`,
        [dossier.id],
      );

      return {
        demande: acceptee,
        autres_ecartees: ecartees,
        offre: offreClose,
        dossier: dossierApres,
        bien: bienApres,
        mouvement,
        document: acte,
      };
    }, pivot);

    publier({
      type: 'reemploi_prononce',
      objet: 'reemploi',
      id: offre.id,
      structure_id: offre.structure_id,
      donnees: {
        offre: offre.numero,
        dossier: dossier.numero,
        bien: bien.immatriculation ?? bien.designation,
        structure_beneficiaire: demandeuse.nom,
        acte: resultat.document.numero,
      },
    });
    publier({
      type: 'reemploye',
      objet: 'reforme',
      id: dossier.id,
      structure_id: dossier.structure_id,
      donnees: {
        numero: dossier.numero, statut: 'reemploye', structure_beneficiaire: demandeuse.nom,
      },
    });
    // Le patrimoine a bougé des deux côtés : les deux écrans du registre
    // l'apprennent.
    for (const structureId of [origine.id, demandeuse.id]) {
      publier({
        type: 'mouvement_reemploi',
        objet: 'patrimoine',
        id: bien.id,
        structure_id: structureId,
        donnees: {
          structure_cedante: origine.code,
          structure_beneficiaire: demandeuse.code,
          acte: resultat.document.numero,
        },
      });
    }
    return resultat;
  });
}
