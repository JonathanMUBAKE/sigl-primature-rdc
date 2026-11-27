// GET /api/flux — le temps réel, en Server-Sent Events.
//
// Un seul flux pour tous les modules : patrimoine, stocks, états de besoin,
// alertes, documents, achats. Chaque événement porte
// `{ type, objet, id, structure_id, horodatage }`, et la quantité nouvelle pour
// le stock.
//
// Quatre points tenus ici :
//   — le filtrage par structure vaut aussi pour le flux (RG-017). Le RLS ne
//     protège pas un flux : c'est cette route qui écarte ce qui n'est pas du
//     périmètre de l'agent ;
//   — **une exception, et une seule** : les événements de l'objet `reemploi`
//     atteignent toute session positionnée, parce que `offre_reemploi` est une
//     publication et que son flux doit suivre sa politique de lecture. Hors du
//     périmètre d'origine, leur charge est réduite à ce que l'offre publie —
//     `chargePubliee`. Tout le reste, `reforme` compris, reste cloisonné ;
//   — la reconnexion : chaque événement porte un `id` de séquence, et un client
//     qui revient avec `Last-Event-ID` rattrape ce qu'il a manqué ;
//   — un battement de cœur régulier, pour que ni le navigateur ni un
//     intermédiaire ne ferme une connexion silencieuse.

import {
  bus, depuis, chargePubliee, dansPerimetreOrdinaire, estPublie,
} from './_flux.js';
import { exigerAgent, structuresDe } from './_droits.js';
import { porteeTotale } from '../regles/roles.js';

const BATTEMENT_MS = 15_000;
const RECONNEXION_MS = 3_000;

export default async function routesFlux(app) {
  app.get('/api/flux', { preHandler: exigerAgent }, async (request, reply) => {
    const permises = await structuresDe(request);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connexion: 'keep-alive',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.hijack();

    const ecrire = (texte) => {
      if (!reply.raw.writableEnded) reply.raw.write(texte);
    };

    ecrire(`retry: ${RECONNEXION_MS}\n\n`);
    ecrire(`event: bonjour\ndata: ${JSON.stringify({
      agent: request.agent.nom,
      structure: request.agent.structure_nom,
      portee: permises === null ? 'tout' : permises.length,
      consolide_seulement: porteeTotale(request.agent),
      horodatage: new Date().toISOString(),
    })}\n\n`);

    const envoyer = (evenement) => {
      // Le périmètre ordinaire d'abord : s'il couvre l'événement, l'agent le
      // reçoit entier, comme avant.
      const ordinaire = dansPerimetreOrdinaire(evenement, permises);
      if (!ordinaire && !estPublie(evenement)) return;
      // Hors périmètre, seules les publications passent, et seulement avec ce
      // que l'offre publie. Un identifiant de détenteur, le numéro du dossier
      // de réforme ou le nom de la structure demandeuse ne sortent pas d'ici.
      const sortant = ordinaire ? evenement : chargePubliee(evenement);
      ecrire(`id: ${sortant.sequence}\nevent: ${sortant.objet}\ndata: ${JSON.stringify(sortant)}\n\n`);
    };

    // La reprise : ce qui a été manqué pendant la coupure.
    const derniere = request.headers['last-event-id'] ?? request.query?.depuis;
    if (derniere !== undefined && derniere !== null && derniere !== '') {
      for (const manque of depuis(derniere)) envoyer(manque);
    }

    bus.on('evenement', envoyer);

    const battement = setInterval(() => {
      ecrire(`: battement ${new Date().toISOString()}\n\n`);
    }, BATTEMENT_MS);

    const fermer = () => {
      clearInterval(battement);
      bus.removeListener('evenement', envoyer);
      if (!reply.raw.writableEnded) reply.raw.end();
    };

    request.raw.on('close', fermer);
    request.raw.on('error', fermer);
  });
}
