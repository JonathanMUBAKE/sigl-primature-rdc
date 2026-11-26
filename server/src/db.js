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
  const { mode, agentId, structureId } = contexte;
  return { mode, agentId, structureId };
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
async function executerDansUnRole({ mode, role, agentId, structureId, consolidation }, fn) {
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

    const resultat = await stockageContexte.run(
      { client, mode, agentId, structureId },
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
  const { agentId = null, structureId = null } = contexte ?? {};
  if (!structureId) {
    throw new ContexteManquant();
  }
  return executerDansUnRole(
    { mode: 'metier', role: 'sigl_agent', agentId, structureId, consolidation: false },
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

/**
 * Le mode privilégié : le rôle propriétaire, qui porte `rolbypassrls` et voit
 * donc tout, y compris les établissements autonomes.
 *
 * Réservé aux migrations, au jeu de démonstration et aux scripts
 * d'administration. **Aucune route ne doit l'appeler.**
 *
 * ADR-001, conséquences : « le jeu de démonstration doit s'insérer sous un rôle
 * privilégié, ce qui crée un chemin qu'il faudra fermer en production ».
 */
export async function enPrivilegie(fn) {
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
  contexteCourant,
};
