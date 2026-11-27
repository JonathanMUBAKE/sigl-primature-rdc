// Le flux temps réel du SIGL.
//
// Deux sources alimentent le même bus :
//   1. `LISTEN`/`NOTIFY` de PostgreSQL — les déclencheurs posés par l'agent des
//      données émettent sur le canal `sigl_flux`, une connexion dédiée les
//      relaie. On n'interroge jamais la base en boucle.
//   2. les routes elles-mêmes, qui publient ce qu'elles viennent d'écrire : le
//      flux reste juste même avant que les déclencheurs soient en place.
//
// Le filtrage par structure vaut aussi pour le flux : le RLS ne protège pas un
// flux, c'est la route `/api/flux` qui écarte ce qui n'est pas du périmètre de
// l'agent (RG-017). Un établissement autonome ne diffuse au central que ce qui
// est consolidé, jamais le détail de ses écritures.
//
// **Une seule exception, et elle est nommée plus bas** : l'objet `reemploi`,
// parce que `offre_reemploi` est une publication et qu'un flux qui filtrerait
// là où la table ne filtre pas serait incohérent. Voir `OBJETS_PUBLIES`.

import { EventEmitter } from 'node:events';
import { obtenirPool } from '../db.js';

export const CANAL = 'sigl_flux';

export const bus = new EventEmitter();
bus.setMaxListeners(0);

// Les derniers événements, pour qu'un client qui se reconnecte avec
// `Last-Event-ID` rattrape ce qu'il a manqué.
const MEMOIRE = 200;
const recents = [];
let compteur = 0;

function enregistrer(evenement) {
  compteur += 1;
  const complet = {
    sequence: compteur,
    type: evenement.type,
    objet: evenement.objet,
    id: evenement.id ?? null,
    structure_id: evenement.structure_id ?? null,
    horodatage: evenement.horodatage ?? new Date().toISOString(),
    ...(evenement.quantite === undefined ? {} : { quantite: evenement.quantite }),
    ...(evenement.donnees === undefined ? {} : { donnees: evenement.donnees }),
  };
  recents.push(complet);
  if (recents.length > MEMOIRE) recents.shift();
  return complet;
}

/**
 * Publie un événement vers les clients connectés.
 * `objet` : patrimoine, stock, besoin, alerte, document, achat…
 * `type`  : création, mouvement, visa, examen, réception, prise_en_charge…
 */
export function publier(evenement) {
  const complet = enregistrer(evenement);
  bus.emit('evenement', complet);
  return complet;
}

export function depuis(sequence) {
  const borne = Number(sequence);
  if (!Number.isFinite(borne)) return [];
  return recents.filter((e) => e.sequence > borne);
}

// --- La relève des notifications PostgreSQL -------------------------------

let ecouteDemarree = false;
let clientEcoute = null;
let reconnexion = null;

/** Ferme la connexion d'écoute. Pour l'arrêt du serveur et les tests. */
export async function arreterEcoute() {
  ecouteDemarree = false;
  if (reconnexion) clearTimeout(reconnexion);
  reconnexion = null;
  const client = clientEcoute;
  clientEcoute = null;
  if (client) {
    client.removeAllListeners('notification');
    client.release?.(true);
  }
}

/**
 * Branche la connexion d'écoute : un client dédié du pool, qui reste en
 * `LISTEN sigl_flux` et relaie les notifications dans le bus. On ne sonde
 * jamais la base.
 *
 * Tolérante par construction : si rien n'émet encore sur le canal, le flux vit
 * des publications des routes, et le serveur le dit une fois dans son journal.
 * Si la connexion tombe, elle est reprise après un court délai.
 */
export async function demarrerEcoute(logger = console) {
  if (ecouteDemarree) return true;
  const recevoir = (brut) => {
    try {
      const charge = typeof brut === 'string' ? JSON.parse(brut) : brut;
      publier({
        type: charge.type ?? 'changement',
        objet: charge.objet ?? charge.table ?? 'inconnu',
        id: charge.id ?? null,
        structure_id: charge.structure_id ?? null,
        horodatage: charge.horodatage ?? new Date().toISOString(),
        ...(charge.quantite === undefined ? {} : { quantite: charge.quantite }),
      });
    } catch (erreur) {
      logger.warn?.(`Flux : notification illisible (${erreur.message})`);
    }
  };

  const reprendre = () => {
    if (reconnexion) return;
    reconnexion = setTimeout(() => {
      reconnexion = null;
      demarrerEcoute(logger).catch(() => {});
    }, 5_000);
  };

  try {
    const client = await obtenirPool().connect();
    client.on('notification', (message) => {
      if (message.channel === CANAL) recevoir(message.payload);
    });
    client.on('error', (erreur) => {
      logger.warn?.(`Flux : la connexion d'écoute est tombée (${erreur.message}). Reprise dans 5 s.`);
      ecouteDemarree = false;
      clientEcoute = null;
      client.release?.(true);
      reprendre();
    });
    await client.query(`listen ${CANAL}`);
    clientEcoute = client;
    ecouteDemarree = true;
    logger.info?.(`Flux : à l'écoute du canal ${CANAL}.`);
  } catch (erreur) {
    logger.warn?.(
      `Flux : écoute PostgreSQL indisponible (${erreur.message}). Le flux relaie les écritures du serveur, et la reprise est programmée.`,
    );
    reprendre();
    return false;
  }
  return ecouteDemarree;
}

/** Vrai si l'événement est du périmètre de lecture **ordinaire** de l'agent. */
export function dansPerimetreOrdinaire(evenement, structuresPermises) {
  if (structuresPermises === null) return true;
  if (!evenement.structure_id) return false;
  return structuresPermises.map(String).includes(String(evenement.structure_id));
}

// ---------------------------------------------------------------------------
// L'EXCEPTION DES PUBLICATIONS — nommée, bornée, et motivée.
//
// Un seul objet y entre : `reemploi`, les offres de réemploi et les demandes
// qui s'y rattachent. La raison est la même que celle qui a fait de
// `offre_reemploi` la seule table du SIGL lisible hors périmètre (migration
// 20261127080000) : **une offre que les autres structures ne voient pas est une
// étape qui n'existe pas**. Un flux qui filtrerait par structure là où la table
// ne filtre pas serait une incohérence, et elle aurait la forme exacte du
// défaut qui a déjà coûté trois fois sur ce chantier — une politique de
// sécurité correcte qui vide une fonction métier. Une offre qu'on ne découvre
// qu'en rechargeant une liste n'est pas publiée, elle est entreposée.
//
// Décision du chef de projet, 27 novembre 2026.
//
// **Aucun autre objet n'y entre, et c'est le point à défendre.** `reforme` —
// le dossier, la commission, les avis — reste cloisonné : c'est l'instruction
// interne d'une structure, et elle ne regarde personne d'autre. Un essai le
// vérifie dans les deux sens, et c'est la seconde moitié de cet essai qui
// empêche l'exception de s'élargir toute seule un jour.
export const OBJETS_PUBLIES = ['reemploi'];

/** Vrai si l'événement porte un objet publié, donc diffusé à tous. */
export function estPublie(evenement) {
  return OBJETS_PUBLIES.includes(evenement?.objet);
}

/**
 * Les champs de charge qu'un événement publié peut porter **hors du périmètre
 * d'origine** : exactement ce que l'offre publie, et rien de plus.
 *
 * La liste est une autorisation, pas une interdiction : ce qui n'y figure pas
 * est retiré. C'est le sens de la précaution — un identifiant de détenteur, le
 * numéro du dossier de réforme, le nom de la structure qui a demandé le bien ou
 * celui de la bénéficiaire ne sont pas publiés par l'offre, et ne doivent donc
 * pas sortir par le flux. Une liste négative aurait laissé passer le prochain
 * champ qu'on ajoutera sans y penser.
 */
export const CHAMPS_PUBLIES = [
  'numero', 'offre', 'statut',
  'bien', 'bien_immatriculation', 'bien_designation', 'bien_categorie_code', 'bien_etat',
  'structure_origine_code', 'structure_origine_nom', 'site_origine_nom',
  'ouverte_le', 'close_le', 'cloture_prevue_le', 'duree_jours', 'jours_restants',
];

/**
 * L'événement tel qu'il part vers une session **hors du périmètre d'origine** :
 * sa charge réduite aux champs publiés. L'identifiant et le `structure_id`
 * restent — ils désignent l'offre, qui est lisible de tous, et c'est avec eux
 * que l'écran recharge ce qu'il a le droit de lire.
 */
export function chargePubliee(evenement) {
  // Un événement sans charge part tel quel : c'est le cas de ceux que le
  // déclencheur `sigl_notifier_flux` émet depuis la base, qui ne portent que
  // `{ type, objet, id, structure_id, horodatage }`. L'`id` peut y désigner une
  // ligne de `demande_reemploi`, que le lecteur hors périmètre ne pourra pas
  // relire — la politique de la table s'en charge. Il apprend qu'une offre a
  // bougé, pas ce qu'elle contient.
  if (evenement?.donnees === undefined || evenement.donnees === null) return evenement;
  const donnees = {};
  for (const champ of CHAMPS_PUBLIES) {
    if (evenement.donnees[champ] !== undefined) donnees[champ] = evenement.donnees[champ];
  }
  return { ...evenement, donnees };
}

/**
 * Vrai si l'agent reçoit l'événement : son périmètre ordinaire (RG-017), ou
 * une publication. Hors périmètre, c'est `chargePubliee` qui borne ce qu'il en
 * lit — voir `routes/flux.js`.
 */
export function dansPerimetre(evenement, structuresPermises) {
  return dansPerimetreOrdinaire(evenement, structuresPermises) || estPublie(evenement);
}
