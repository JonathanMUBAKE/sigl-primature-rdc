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

import { EventEmitter } from 'node:events';
import { ouvrir } from '../db.js';
import * as db from '../db.js';

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

/**
 * Branche la connexion d'écoute. Tolérante : si la base ne sait pas écouter
 * (ou si les déclencheurs ne sont pas encore posés), le flux continue de vivre
 * des publications des routes, et le serveur le dit une fois dans son journal.
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

  try {
    if (typeof db.ecouter === 'function') {
      await db.ecouter(CANAL, recevoir);
      ecouteDemarree = true;
    } else {
      const instance = await ouvrir();
      if (typeof instance.listen === 'function') {
        await instance.listen(CANAL, recevoir);
        ecouteDemarree = true;
      }
    }
  } catch (erreur) {
    logger.warn?.(`Flux : écoute PostgreSQL indisponible (${erreur.message}). Le flux relaie les écritures du serveur.`);
    return false;
  }
  if (!ecouteDemarree) {
    logger.info?.('Flux : la base ne propose pas LISTEN ; le flux relaie les écritures du serveur.');
  }
  return ecouteDemarree;
}

/** Vrai si l'événement concerne le périmètre de lecture de l'agent. */
export function dansPerimetre(evenement, structuresPermises) {
  if (structuresPermises === null) return true;
  if (!evenement.structure_id) return false;
  return structuresPermises.map(String).includes(String(evenement.structure_id));
}
