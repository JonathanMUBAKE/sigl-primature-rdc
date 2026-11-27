// Les fournisseurs. La liste noire est une donnée du métier : RG-009 interdit
// tout bon de commande vers un fournisseur qui y figure, et la fiche dit
// pourquoi il y est.

import { enEcriture, lireTous, lireUn } from './_sql.js';
import { ecriture, lecture } from './_droits.js';
import { donneesInvalides, liste, nonTrouve, pagination, schemaIdParam, schemaPagination } from './_commun.js';
import { journaliserDepuis } from './_journal.js';

/**
 * Le délai **constaté**, à distinguer du délai déclaré (`delai_moyen_jours`,
 * que le fournisseur annonce) : la moyenne des jours écoulés entre l'émission
 * d'un bon de commande et sa livraison effective, et le pire d'entre eux.
 * L'écran des achats a besoin des deux — la promesse et le fait.
 */
const DELAI_CONSTATE = `
  (select round(avg(extract(epoch from (bc.livre_le - bc.emis_le)) / 86400))::int
     from bon_commande bc
    where bc.fournisseur_id = f.id and bc.livre_le is not null) as delai_constate_jours,
  (select max(extract(epoch from (bc.livre_le - bc.emis_le)) / 86400)::int
     from bon_commande bc
    where bc.fournisseur_id = f.id and bc.livre_le is not null) as delai_constate_max_jours,
  (select count(*)::int from bon_commande bc
    where bc.fournisseur_id = f.id and bc.livre_le is not null) as livraisons_constatees,
  (select count(*)::int from bon_commande bc
    where bc.fournisseur_id = f.id and bc.statut = 'livre_partiel') as livraisons_partielles`;

/** L'écart entre ce qui est annoncé et ce qui est constaté, dit franchement. */
function avecEcartDeDelai(fournisseur) {
  const declare = fournisseur.delai_moyen_jours ?? null;
  const constate = fournisseur.delai_constate_jours ?? null;
  return {
    ...fournisseur,
    delai_declare_jours: declare,
    ecart_delai_jours: declare !== null && constate !== null ? constate - declare : null,
    retard_constate: declare !== null && constate !== null ? constate > declare : null,
  };
}

export default async function routesFournisseurs(app) {
  app.get('/api/fournisseurs', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          q: { type: 'string', maxLength: 120 },
          liste_noire: { type: 'boolean' },
          actif: { type: 'boolean' },
          categorie: { type: 'string', maxLength: 40 },
          ...schemaPagination,
        },
      },
    },
  }, async (request) => {
    const page = pagination(request.query);
    const params = [];
    let ou = 'where true';
    if (request.query.q) {
      params.push(`%${request.query.q.toLowerCase()}%`);
      ou += ` and (lower(f.denomination) like $${params.length} or lower(coalesce(f.rccm, '')) like $${params.length})`;
    }
    if (request.query.liste_noire !== undefined) {
      params.push(request.query.liste_noire);
      ou += ` and f.liste_noire = $${params.length}`;
    }
    if (request.query.actif !== undefined) {
      params.push(request.query.actif);
      ou += ` and f.actif = $${params.length}`;
    }
    if (request.query.categorie) {
      params.push(request.query.categorie);
      ou += ` and $${params.length} = any(f.categories)`;
    }
    const total = await lireUn(request, `select count(*)::int as n from fournisseur f ${ou}`, params);
    const donnees = await lireTous(request, 
      `select f.*,
              (select count(*)::int from bon_commande bc where bc.fournisseur_id = f.id) as nombre_commandes,
              (select coalesce(sum(bc.montant), 0) from bon_commande bc where bc.fournisseur_id = f.id) as montant_commande,
              ${DELAI_CONSTATE}
         from fournisseur f ${ou}
        order by f.liste_noire desc, lower(f.denomination)
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    return liste(donnees.map(avecEcartDeDelai), total.n, page);
  });

  app.get('/api/fournisseurs/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const fournisseur = await lireUn(request, 
      `select f.*, ${DELAI_CONSTATE} from fournisseur f where f.id = $1`,
      [request.params.id],
    );
    if (!fournisseur) throw nonTrouve('Ce fournisseur');
    const commandes = await lireTous(request, 
      `select bc.id, bc.numero, bc.montant, bc.statut, bc.emis_le, bc.livre_le,
              extract(day from coalesce(bc.livre_le, now()) - bc.emis_le)::int as delai_jours,
              d.numero as dossier_numero, d.procedure
         from bon_commande bc join dossier_achat d on d.id = bc.dossier_id
        where bc.fournisseur_id = $1 order by bc.emis_le desc limit 50`,
      [fournisseur.id],
    );
    return { ...avecEcartDeDelai(fournisseur), commandes };
  });

  // L'inscription en liste noire est une décision tracée : qui, quand, pourquoi.
  app.post('/api/fournisseurs/:id/liste-noire', {
    preHandler: ecriture('logistique', 'ordonnateur', 'comptable_public'),
    schema: {
      params: schemaIdParam,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['liste_noire'],
        properties: {
          liste_noire: { type: 'boolean' },
          motif: { type: ['string', 'null'], maxLength: 1000 },
        },
      },
    },
  }, async (request) => {
    const fournisseur = await lireUn(request, 'select * from fournisseur where id = $1', [request.params.id]);
    if (!fournisseur) throw nonTrouve('Ce fournisseur');
    if (request.body.liste_noire && !(request.body.motif ?? '').trim()) {
      throw donneesInvalides(
        "Écrivez le motif de l'inscription en liste noire : il est opposable au fournisseur et conservé au dossier.",
        'motif',
      );
    }
    return enEcriture(request, async () => {
      await journaliserDepuis(request, {
        action: 'liste_noire_fournisseur',
        objet_type: 'fournisseur',
        objet_id: fournisseur.id,
        avant: { liste_noire: fournisseur.liste_noire, motif_liste_noire: fournisseur.motif_liste_noire },
        apres: { liste_noire: request.body.liste_noire, motif_liste_noire: request.body.motif ?? null },
      });
      return lireUn(request, 
        `update fournisseur set liste_noire = $2, motif_liste_noire = $3 where id = $1 returning *`,
        [fournisseur.id, request.body.liste_noire, request.body.liste_noire ? request.body.motif : null],
      );
    });
  });
}
