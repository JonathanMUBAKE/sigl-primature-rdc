// Les formes communes à toutes les routes : erreurs, listes paginées.
// La forme d'erreur est celle du contrat, §5, et jamais une autre :
//   { "erreur": { "code", "message", "champ" } }

export class ErreurMetier extends Error {
  constructor({ code, message, champ = null }, statut = 422) {
    super(message);
    this.code = code;
    this.champ = champ ?? null;
    this.statut = statut;
  }
  get corps() {
    return { erreur: { code: this.code, message: this.message, champ: this.champ } };
  }
}

export function erreur(code, message, champ = null, statut = 422) {
  return new ErreurMetier({ code, message, champ }, statut);
}

export const nonTrouve = (quoi = "L'objet demandé") =>
  erreur('non_trouve', `${quoi} est introuvable : vérifiez l'identifiant.`, null, 404);

export const nonAutorise = (message, champ = null) =>
  erreur('non_autorise', message, champ, 403);

export const donneesInvalides = (message, champ = null) =>
  erreur('donnees_invalides', message, champ, 400);

/** Lève l'erreur d'une règle de gestion si la règle en rend une. */
export function appliquer(resultat, statut = 422) {
  if (resultat) {
    const e = new ErreurMetier(resultat, statut);
    e.alerte = resultat.alerte ?? null;
    throw e;
  }
}

/** Applique plusieurs règles dans l'ordre, s'arrête à la première qui parle. */
export function appliquerToutes(resultats, statut = 422) {
  for (const r of resultats) appliquer(r, statut);
}

export function pagination(query = {}, parPageDefaut = 50) {
  const page = Math.max(1, Number.parseInt(query.page ?? 1, 10) || 1);
  const parPage = Math.min(200, Math.max(1, Number.parseInt(query.parPage ?? parPageDefaut, 10) || parPageDefaut));
  return { page, parPage, decalage: (page - 1) * parPage };
}

export function liste(donnees, total, { page, parPage }) {
  return { donnees, total: Number(total ?? donnees.length), page, parPage };
}

/** Schéma de requête commun aux listes. */
export const schemaPagination = {
  page: { type: 'integer', minimum: 1, default: 1 },
  parPage: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
};

export const UUID = { type: 'string', format: 'uuid' };
export const schemaIdParam = {
  type: 'object',
  required: ['id'],
  properties: { id: UUID },
};
