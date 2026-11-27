// db.js — Accès à la base du SIGL.
//
// PostgreSQL des deux côtés : Supabase local par Docker en développement
// (`postgresql://postgres:postgres@127.0.0.1:55322/postgres`), Supabase hébergé
// en production. La chaîne se lit dans `DATABASE_URL`.
//
// Les migrations sont dans `supabase/migrations/` et s'appliquent par
// `npx supabase db reset` : ce module ne les joue pas.
//
// Toutes les requêtes sont paramétrées. Aucune concaténation de SQL.
//
// ---------------------------------------------------------------------------
// LE CLOISONNEMENT (ADR-001) — à lire avant d'ajouter une requête.
//
// L'isolation entre structures est tenue par la sécurité au niveau des lignes
// de PostgreSQL, pas par le code des routes. Pour qu'elle s'applique, deux
// choses doivent être vraies à chaque transaction métier :
//
//   1. la session prend le rôle non privilégié `sigl_agent` ;
//   2. le contexte `sigl.structure` est posé.
//
// Le rôle `postgres` porte `rolbypassrls` : sous ce rôle, les politiques sont
// inertes et **tout est visible**. C'est pourquoi aucune requête métier ne
// passe par ce module sans contexte. Trois portes, et trois seulement :
//
//   transaction(contexte, fn)   le cas normal — une structure, un agent
//   consolidation(fn)           lecture seule de tout, poste de commande
//   enPrivilegie(fn)            contourne le RLS — migrations et jeu de
//                               démonstration uniquement
//
// Les aides nues `requete`, `un`, `tous` refusent de s'exécuter hors de l'une
// de ces trois portes : mieux vaut une erreur franche qu'une fuite silencieuse.
// ---------------------------------------------------------------------------

import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

const { Pool } = pg;

const URL_DEFAUT = 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';

export const URL_BASE = process.env.DATABASE_URL || URL_DEFAUT;

let pool = null;

/** Le pool de connexions. Créé au premier besoin. */
export function obtenirPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: URL_BASE,
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (erreur) => {
      console.error('Erreur inattendue sur une connexion inactive :', erreur.message);
    });
  }
  return pool;
}

/** Ferme le pool. Utilisé par les tests et les scripts. */
export async function fermer() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Vérifie que la base répond. */
export async function verifierConnexion() {
  const client = await obtenirPool().connect();
  try {
    const { rows } = await client.query('select current_user, current_database(), version()');
    return rows[0];
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Le client courant, porté par le contexte asynchrone. C'est ce qui permet à
// `un`, `tous` et `requete` de rester dans la transaction ouverte par
// `transaction`, `consolidation` ou `enPrivilegie` sans qu'on se passe le
// client de main en main.
// ---------------------------------------------------------------------------
const stockageContexte = new AsyncLocalStorage();

class ContexteManquant extends Error {
  constructor() {
    super(
      'Requête métier hors contexte de cloisonnement. '
      + 'Passez par transaction({ agentId, structureId }, …), consolidation(…) '
      + 'ou, pour les scripts d’administration seulement, enPrivilegie(…).',
    );
    this.name = 'ContexteManquant';
    this.code = 'contexte_manquant';
  }
}

function clientCourant() {
  const contexte = stockageContexte.getStore();
  if (!contexte) throw new ContexteManquant();
  return contexte.client;
}

/** Le contexte de cloisonnement en cours, ou `null`. Pour le journal et les tests. */
export function contexteCourant() {
  const contexte = stockageContexte.getStore();
  if (!contexte) return null;
  const { mode, agentId, structureId, porteeIntegre } = contexte;
  return { mode, agentId, structureId, porteeIntegre: Boolean(porteeIntegre) };
}

// ---------------------------------------------------------------------------
// Les aides de requête. Toujours paramétrées : (sql, params).
// ---------------------------------------------------------------------------

/** Exécute une requête et rend le résultat complet ({ rows, rowCount }). */
export async function requete(sql, params = []) {
  return clientCourant().query(sql, params);
}

/** Rend la première ligne, ou `null` si la requête ne rend rien. */
export async function un(sql, params = []) {
  const { rows } = await requete(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Rend toutes les lignes, un tableau éventuellement vide. */
export async function tous(sql, params = []) {
  const { rows } = await requete(sql, params);
  return rows;
}

/** Rend la première colonne de la première ligne, ou `null`. */
export async function valeur(sql, params = []) {
  const ligne = await un(sql, params);
  if (!ligne) return null;
  const cles = Object.keys(ligne);
  return cles.length > 0 ? ligne[cles[0]] : null;
}

function aides(client) {
  const encapsuler = async (sql, params = []) => client.query(sql, params);
  return {
    requete: encapsuler,
    un: async (sql, params = []) => {
      const { rows } = await encapsuler(sql, params);
      return rows.length > 0 ? rows[0] : null;
    },
    tous: async (sql, params = []) => {
      const { rows } = await encapsuler(sql, params);
      return rows;
    },
    valeur: async (sql, params = []) => {
      const { rows } = await encapsuler(sql, params);
      if (rows.length === 0) return null;
      const cles = Object.keys(rows[0]);
      return cles.length > 0 ? rows[0][cles[0]] : null;
    },
  };
}

/**
 * Le cœur : ouvre une transaction, prend un rôle, pose le contexte, joue `fn`.
 *
 * `set local role` et `set_config(…, true)` sont tous deux **locaux à la
 * transaction** : le `commit` ou le `rollback` les défait. Le client rendu au
 * pool ne garde donc ni rôle ni contexte, ce qui évite la fuite d'un
 * cloisonnement d'une requête à la suivante.
 */
async function executerDansUnRole({
  mode, role, agentId, structureId, consolidation, porteeIntegre = false,
}, fn) {
  // Transaction imbriquée : on reste dans celle du dessus plutôt que d'ouvrir
  // une seconde transaction sur un autre client, qui ne verrait pas ses écritures.
  const existant = stockageContexte.getStore();
  if (existant) {
    return fn(aides(existant.client));
  }

  const client = await obtenirPool().connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    await client.query('select set_config($1, $2, true)', ['sigl.agent', agentId ?? '']);
    await client.query('select set_config($1, $2, true)', ['sigl.structure', structureId ?? '']);
    await client.query('select set_config($1, $2, true)', [
      'sigl.consolidation', consolidation ? 'oui' : 'non',
    ]);
    // La portée transversale du comptable public : une **lecture** élargie aux
    // structures de régime `integre`, et rien d'autre. Elle est posée d'après
    // les rôles chargés en base par `chargerAgent`, jamais d'après une valeur
    // venue de la requête, et `sigl_ecriture_permise` l'ignore — voir
    // `supabase/migrations/20261127030000_portee_comptable_public.sql`.
    await client.query('select set_config($1, $2, true)', [
      'sigl.portee_integre', porteeIntegre ? 'oui' : 'non',
    ]);

    const resultat = await stockageContexte.run(
      { client, mode, agentId, structureId, porteeIntegre },
      () => fn(aides(client)),
    );

    await client.query('commit');
    return resultat;
  } catch (erreur) {
    await client.query('rollback').catch(() => {});
    throw erreur;
  } finally {
    client.release();
  }
}

/**
 * Le cas normal. Une transaction métier, sous le rôle `sigl_agent`, positionnée
 * sur une structure. Hors de ce positionnement, les politiques RLS ne rendent
 * aucune ligne — c'est voulu : la requête échoue fermée.
 *
 * @param {{agentId: string, structureId: string}} contexte
 * @param {(aides) => Promise<any>} fn
 */
export async function transaction(contexte, fn) {
  if (typeof contexte === 'function') {
    throw new TypeError(
      'transaction(contexte, fn) exige un contexte de cloisonnement : '
      + 'transaction({ agentId, structureId }, fn). Pour un script '
      + 'd’administration, utilisez enPrivilegie(fn).',
    );
  }
  const { agentId = null, structureId = null, porteeIntegre = false } = contexte ?? {};
  if (!structureId) {
    throw new ContexteManquant();
  }
  return executerDansUnRole(
    { mode: 'metier', role: 'sigl_agent', agentId, structureId, consolidation: false, porteeIntegre },
    fn,
  );
}

/**
 * Le mode consolidation : lecture de toutes les structures, écriture d'aucune.
 * C'est le chemin du poste de commande central (rôle `direction`) et du
 * contrôle externe (`controle_externe`, qui lit aussi le journal).
 *
 * ADR-001, contrainte 3 : la consolidation est une lecture nommée. Le jour où
 * un établissement autonome passe sur sa propre instance, c'est ici — et dans
 * `server/src/consolidation.js` — que le flux remplacera la requête.
 */
export async function consolidation(fn, { agentId = null } = {}) {
  return executerDansUnRole(
    {
      mode: 'consolidation',
      role: 'sigl_consolidation',
      agentId,
      structureId: null,
      consolidation: true,
    },
    fn,
  );
}

// ---------------------------------------------------------------------------
// LE VERROU DU CHEMIN PRIVILÉGIÉ — ADR-001, amendement du 27/11/2026, §4.
//
// Le rôle propriétaire porte `rolbypassrls` : sous lui, les politiques de
// l'ADR-001 sont inertes et **tout est lisible et écrivable**, y compris la
// comptabilité des matières d'un établissement autonome, que la Primature n'a
// juridiquement pas le droit de tenir. C'était « le seul chemin du dépôt qui
// contourne l'isolation », signalé à fermer avant la mise en service.
//
// Il est maintenant fermé par défaut. Pour l'emprunter, il faut deux choses
// que ni le serveur ni une route ne posent jamais :
//
//   1. la variable d'environnement SIGL_PRIVILEGE, à la valeur exacte
//      `jeu-de-demonstration`. Seul `server/seed/index.js` la pose, dans son
//      propre processus ; `server/src/index.js` ne la connaît pas. Une route
//      qui appellerait `enPrivilegie` par erreur échoue donc, bruyamment, dès
//      le premier appel, plutôt que de servir silencieusement les données
//      d'un établissement autonome ;
//   2. un environnement de développement. En production — et en
//      préproduction — le refus est inconditionnel : même avec la variable,
//      la porte reste fermée. C'est ce que demandait l'ADR.
//
// Le refus est une erreur franche, pas un repli : mieux vaut un seed qui ne
// démarre pas qu'une isolation contournée sans que personne le sache.
// ---------------------------------------------------------------------------

/** Le nom de la variable d'environnement qui ouvre le chemin privilégié. */
export const CLE_PRIVILEGE = 'SIGL_PRIVILEGE';

/** Sa valeur exacte. Posée par le seed, par personne d'autre. */
export const SESAME_PRIVILEGE = 'jeu-de-demonstration';

const ENVIRONNEMENTS_FERMES = ['production', 'prod', 'preproduction', 'preprod', 'staging'];

export class PrivilegeRefuse extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrivilegeRefuse';
    this.code = 'privilege_refuse';
    this.statut = 500;
  }
}

/**
 * Autorise — ou refuse — le chemin privilégié. Appelée par `enPrivilegie` et
 * `executerPrivilegie` avant toute connexion.
 */
export function verifierPrivilegeAutorise(portee = 'enPrivilegie') {
  const environnement = String(
    process.env.SIGL_ENV || process.env.NODE_ENV || 'developpement',
  ).toLowerCase();

  if (ENVIRONNEMENTS_FERMES.includes(environnement)) {
    throw new PrivilegeRefuse(
      `Le chemin privilégié (${portee}) est fermé en environnement « ${environnement} » : `
      + "il contourne l'isolation entre structures de l'ADR-001 et donnerait accès à la "
      + "comptabilité des matières des établissements autonomes. "
      + 'Passez par transaction({ agentId, structureId }, …) pour une écriture métier, '
      + 'ou par consolidation(…) pour une lecture d’ensemble. '
      + "Pour charger un jeu de données, faites-le hors production.",
    );
  }

  if (process.env[CLE_PRIVILEGE] !== SESAME_PRIVILEGE) {
    throw new PrivilegeRefuse(
      `Le chemin privilégié (${portee}) n'est pas ouvert : il contourne l'isolation entre `
      + "structures de l'ADR-001, et aucune route ne doit l'emprunter. "
      + 'Si vous êtes une route ou le serveur, utilisez transaction({ agentId, structureId }, …) '
      + 'ou consolidation(…). Si vous êtes le jeu de démonstration ou un script '
      + `d'administration, posez ${CLE_PRIVILEGE}=${SESAME_PRIVILEGE} dans votre processus, `
      + 'hors production.',
    );
  }
}

/**
 * Le mode privilégié : le rôle propriétaire, qui porte `rolbypassrls` et voit
 * donc tout, y compris les établissements autonomes.
 *
 * Réservé au jeu de démonstration et aux scripts d'administration, et fermé
 * par défaut — voir le verrou ci-dessus. **Aucune route ne doit l'appeler.**
 *
 * ADR-001, conséquences : « le jeu de démonstration doit s'insérer sous un rôle
 * privilégié, ce qui crée un chemin qu'il faudra fermer en production ».
 */
export async function enPrivilegie(fn) {
  verifierPrivilegeAutorise('enPrivilegie');
  const existant = stockageContexte.getStore();
  if (existant) return fn(aides(existant.client));

  const client = await obtenirPool().connect();
  try {
    await client.query('begin');
    const resultat = await stockageContexte.run(
      { client, mode: 'privilegie', agentId: null, structureId: null },
      () => fn(aides(client)),
    );
    await client.query('commit');
    return resultat;
  } catch (erreur) {
    await client.query('rollback').catch(() => {});
    throw erreur;
  } finally {
    client.release();
  }
}

/**
 * Exécute du SQL sans paramètre, sous le rôle propriétaire et hors transaction.
 * Pour les scripts d'administration : vidage et recréation du jeu de données.
 */
export async function executerPrivilegie(sql) {
  verifierPrivilegeAutorise('executerPrivilegie');
  const client = await obtenirPool().connect();
  try {
    return await client.query(sql);
  } finally {
    client.release();
  }
}

export default {
  URL_BASE,
  obtenirPool,
  fermer,
  verifierConnexion,
  requete,
  un,
  tous,
  valeur,
  transaction,
  consolidation,
  enPrivilegie,
  executerPrivilegie,
  verifierPrivilegeAutorise,
  CLE_PRIVILEGE,
  SESAME_PRIVILEGE,
  contexteCourant,
};
