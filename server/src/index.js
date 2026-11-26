// index.js — le démarrage du serveur SIGL.

import { construireApp } from './app.js';
import { ouvrir, fermer } from './db.js';
import { demarrerEcoute } from './routes/_flux.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOTE = process.env.HOTE ?? '0.0.0.0';

const app = await construireApp({ logger: { level: process.env.NIVEAU_JOURNAL ?? 'info' } });

try {
  // La base d'abord : les migrations sont jouées avant la première requête.
  await ouvrir();
  app.log.info('Base ouverte, migrations à jour.');
  // Puis l'écoute des notifications, qui alimente le flux temps réel.
  await demarrerEcoute(app.log);
  await app.listen({ port: PORT, host: HOTE });
  app.log.info(`SIGL — Primature : serveur à l'écoute sur le port ${PORT}.`);
} catch (erreur) {
  app.log.error(erreur, "Le serveur n'a pas pu démarrer.");
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    app.log.info('Arrêt demandé : fermeture du serveur et de la base.');
    await app.close();
    await fermer().catch(() => {});
    process.exit(0);
  });
}
