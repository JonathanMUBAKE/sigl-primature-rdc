// app.js — l'assemblage Fastify du SIGL.
//
// Trois choses sont posées ici une fois pour toutes :
//   1. l'identité : l'en-tête `X-Agent-Id` est lu sur chaque requête, les rôles
//      et la portée en découlent (§4 du contrat) ;
//   2. la forme des erreurs : `{ erreur: { code, message, champ } }`, toujours,
//      y compris pour les erreurs de validation des schémas JSON ;
//   3. les routes, un module par domaine.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { identifier } from './routes/_droits.js';
import { ErreurMetier } from './routes/_commun.js';

import routesSante from './routes/sante.js';
import routesStructures from './routes/structures.js';
import routesBiens from './routes/biens.js';
import routesStocks from './routes/stocks.js';
import routesBesoins from './routes/besoins.js';
import routesFournisseurs from './routes/fournisseurs.js';
import routesAchats from './routes/achats.js';
import routesReceptions from './routes/receptions.js';
import routesInventaire from './routes/inventaire.js';
import routesRapprochements from './routes/rapprochements.js';
import routesReforme from './routes/reforme.js';
import routesReemploi from './routes/reemploi.js';
import routesDocuments from './routes/documents.js';
import routesAlertes from './routes/alertes.js';
import routesTableauDeBord from './routes/tableau-de-bord.js';
import routesJournal from './routes/journal.js';
import routesFlux from './routes/flux.js';

const ici = dirname(fileURLToPath(import.meta.url));
const DOSSIER_WEB = resolve(ici, '..', '..', 'web', 'dist');

/** Traduit une erreur de validation de schéma en message utile, en français. */
function messageDeValidation(erreur) {
  const premiere = erreur.validation?.[0];
  if (!premiere) return { message: erreur.message, champ: null };
  const champ = (premiere.instancePath || '').replace(/^\//, '').replace(/\//g, '.')
    || premiere.params?.missingProperty
    || null;
  const quoi = premiere.params?.missingProperty
    ? `Renseignez le champ « ${premiere.params.missingProperty} »`
    : `Corrigez le champ « ${champ ?? 'inconnu'} »`;
  const detail = premiere.params?.allowedValues
    ? ` : valeurs acceptées — ${premiere.params.allowedValues.join(', ')}.`
    : premiere.params?.format
      ? ` : le format attendu est ${premiere.params.format}.`
      : ` : ${premiere.message}.`;
  return { message: `${quoi}${detail}`, champ };
}

export async function construireApp(options = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 2 * 1024 * 1024,
    ajv: { customOptions: { coerceTypes: true, removeAdditional: false, allErrors: false } },
  });

  await app.register(cors, {
    origin: true,
    exposedHeaders: ['Last-Event-ID'],
    allowedHeaders: ['Content-Type', 'X-Agent-Id', 'Last-Event-ID'],
  });

  // L'identité courante, avant tout le reste.
  app.decorateRequest('agent', null);
  app.addHook('onRequest', identifier);

  // La forme des erreurs du contrat, §5. Jamais une autre.
  app.setErrorHandler((erreur, request, reply) => {
    if (erreur instanceof ErreurMetier) {
      const corps = erreur.corps;
      if (erreur.alerte) corps.alerte = erreur.alerte;
      return reply.code(erreur.statut ?? 422).send(corps);
    }
    if (erreur.validation) {
      const { message, champ } = messageDeValidation(erreur);
      return reply.code(400).send({ erreur: { code: 'donnees_invalides', message, champ } });
    }
    if (erreur.statusCode === 404) {
      return reply.code(404).send({
        erreur: { code: 'non_trouve', message: "Cette adresse n'existe pas dans l'API du SIGL.", champ: null },
      });
    }
    request.log?.error?.(erreur);
    const contrainte = erreur.message?.match(/violates (unique|check|foreign key) constraint "([^"]+)"/);
    if (contrainte) {
      return reply.code(409).send({
        erreur: {
          code: 'donnees_invalides',
          message: `L'écriture a été refusée par la base : la contrainte « ${contrainte[2]} » n'est pas respectée. Reprenez la saisie.`,
          champ: null,
        },
      });
    }
    return reply.code(500).send({
      erreur: {
        code: 'erreur_serveur',
        message: "Le serveur n'a pas pu traiter la demande. L'incident est journalisé ; réessayez, puis signalez-le s'il persiste.",
        champ: null,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      erreur: {
        code: 'non_trouve',
        message: `Cette adresse n'existe pas dans l'API du SIGL : ${request.method} ${request.url}.`,
        champ: null,
      },
    });
  });

  // Les routes, un module par domaine.
  for (const routes of [
    routesSante, routesStructures, routesBiens, routesStocks, routesBesoins,
    routesFournisseurs, routesAchats, routesReceptions, routesInventaire,
    routesRapprochements, routesReforme, routesReemploi, routesDocuments,
    routesAlertes, routesTableauDeBord, routesJournal, routesFlux,
  ]) {
    await app.register(routes);
  }

  // L'interface compilée, quand elle existe : un seul port en production.
  if (options.servirWeb !== false && existsSync(DOSSIER_WEB)) {
    const statique = await import('@fastify/static');
    await app.register(statique.default, { root: DOSSIER_WEB, prefix: '/' });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({
          erreur: {
            code: 'non_trouve',
            message: `Cette adresse n'existe pas dans l'API du SIGL : ${request.method} ${request.url}.`,
            champ: null,
          },
        });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

export default construireApp;
