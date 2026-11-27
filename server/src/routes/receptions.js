// La réception et la prise en charge à l'inventaire.
//
// L'enchaînement est celui du décret 13/050 art. 137, et il n'est pas
// contournable :
//   réception → **PV de réception signé** → prise en charge à l'inventaire →
//   **certificat de prise en charge** → paiement possible.
// RG-010 interdit le certificat sans PV. RG-011 interdit le paiement sans
// certificat. L'invariant « qui réceptionne ne valide pas sa propre réception »
// est tenu ici même.

import { enEcriture, lireTous, lireUn } from './_sql.js';
import { ecriture, lecture, verifierEcritureStructure } from './_droits.js';
import {
  appliquer, donneesInvalides, liste, nonAutorise, nonTrouve, pagination,
  schemaIdParam, schemaPagination,
} from './_commun.js';
import { journaliserDepuis } from './_journal.js';
import { prochainNumero } from './_numeros.js';
import { leverAlerte } from './_alertes.js';
import { publier } from './_flux.js';
import { rg010 } from '../regles/rg-010.js';
import { rg019 } from '../regles/rg-019.js';

/**
 * Les écarts, ligne par ligne, dans les trois colonnes qu'un écran de
 * réception doit montrer : **commandé, livré, reçu**.
 *
 * Les trois ne se confondent pas, et c'est tout l'intérêt : le fournisseur
 * livre une quantité (bordereau), le magasinier en accepte une autre (ce qui
 * est conforme), et la commande en demandait une troisième. Quand la quantité
 * livrée n'est pas saisie, elle vaut la quantité reçue — on ne suppose pas un
 * écart qu'on n'a pas constaté.
 */
export function lignesAvecEcarts(lignes = []) {
  return lignes.map((l) => {
    const commandee = Number(l.quantite_commandee ?? 0);
    const recue = Number(l.quantite_recue ?? 0);
    const livree = Number(l.quantite_livree ?? l.quantite_recue ?? 0);
    const conforme = l.conforme !== false;
    return {
      designation: l.designation,
      categorie_code: l.categorie_code ?? null,
      quantite_commandee: commandee,
      quantite_livree: livree,
      quantite_recue: recue,
      // Signés : négatif = manquant, positif = excédent.
      ecart_commande_livre: livree - commandee,
      ecart_livre_recu: recue - livree,
      ecart_commande_recu: recue - commandee,
      conforme,
      // Une ligne est en écart si l'un des trois chiffres diverge, ou si elle
      // est déclarée non conforme — une quantité juste mais du matériel
      // inutilisable est un écart aussi.
      en_ecart: livree !== commandee || recue !== livree || !conforme,
      observation: l.observation ?? null,
    };
  });
}

/** Le résumé des écarts d'un PV, pour la ligne de liste et le bandeau. */
export function resumeEcarts(lignes = []) {
  const detaillees = lignesAvecEcarts(lignes);
  const enEcart = detaillees.filter((l) => l.en_ecart);
  return {
    lignes: detaillees,
    nombre_lignes: detaillees.length,
    nombre_ecarts: enEcart.length,
    manquants: detaillees.reduce((t, l) => t + Math.max(0, -l.ecart_commande_recu), 0),
    excedents: detaillees.reduce((t, l) => t + Math.max(0, l.ecart_commande_recu), 0),
    non_conformes: detaillees.filter((l) => !l.conforme).length,
    complete: enEcart.length === 0,
  };
}

/** Le fournisseur avec son délai **constaté**, et sa liste noire motivée. */
const FOURNISSEUR_CONSTATE = `
  f.id as fournisseur_id, f.denomination as fournisseur_nom,
  f.liste_noire, f.motif_liste_noire,
  f.delai_moyen_jours as fournisseur_delai_declare_jours,
  (select round(avg(extract(epoch from (x.livre_le - x.emis_le)) / 86400))::int
     from bon_commande x
    where x.fournisseur_id = f.id and x.livre_le is not null) as fournisseur_delai_constate_jours,
  (select count(*)::int from bon_commande x
    where x.fournisseur_id = f.id and x.livre_le is not null) as fournisseur_livraisons_constatees`;

function fournisseurVu(ligne) {
  if (!ligne?.fournisseur_nom) return null;
  const declare = ligne.fournisseur_delai_declare_jours ?? null;
  const constate = ligne.fournisseur_delai_constate_jours ?? null;
  return {
    id: ligne.fournisseur_id ?? null,
    denomination: ligne.fournisseur_nom,
    liste_noire: ligne.liste_noire ?? false,
    motif_liste_noire: ligne.motif_liste_noire ?? null,
    delai_declare_jours: declare,
    delai_constate_jours: constate,
    livraisons_constatees: ligne.fournisseur_livraisons_constatees ?? 0,
    ecart_delai_jours: declare !== null && constate !== null ? constate - declare : null,
    retard_constate: declare !== null && constate !== null ? constate > declare : null,
  };
}

export default async function routesReceptions(app) {
  // --- Les PV de réception ---------------------------------------------
  app.get('/api/receptions', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          bon_commande: { type: 'string', format: 'uuid' },
          signe: { type: 'boolean' },
          ...schemaPagination,
        },
      },
    },
  }, async (request) => {
    const page = pagination(request.query);
    const params = [];
    let ou = `where d.type = 'pv_reception'`;
    if (request.query.bon_commande) {
      params.push(String(request.query.bon_commande));
      ou += ` and d.objet_id = $${params.length}`;
    }
    if (request.query.signe !== undefined) {
      ou += request.query.signe ? ' and d.signe_le is not null' : ' and d.signe_le is null';
    }
    const total = await lireUn(request, `select count(*)::int as n from document d ${ou}`, params);
    const donnees = await lireTous(request,
      `select d.id, d.numero, d.objet_type, d.objet_id, d.contenu, d.signe_le, d.fige, d.cree_le,
              d.structure_id, s.code as structure_code, a.nom as signataire_nom,
              bc.numero as bon_commande_numero, bc.montant as bon_commande_montant,
              bc.statut as bon_commande_statut, bc.emis_le as bon_commande_emis_le,
              bc.livre_le as bon_commande_livre_le,
              extract(day from coalesce(bc.livre_le, d.cree_le) - bc.emis_le)::int as delai_livraison_jours,
              da.numero as dossier_numero, da.objet as dossier_objet, da.procedure,
              ${FOURNISSEUR_CONSTATE},
              exists (select 1 from document c
                       where c.type = 'certificat_prise_en_charge'
                         and c.objet_type = d.objet_type and c.objet_id = d.objet_id) as pris_en_charge
         from document d
         join structure s on s.id = d.structure_id
         left join agent a on a.id = d.signataire_id
         left join bon_commande bc on bc.id::text = d.objet_id
         left join dossier_achat da on da.id = bc.dossier_id
         left join fournisseur f on f.id = bc.fournisseur_id
         ${ou}
        order by d.cree_le desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.parPage, page.decalage],
    );
    // Les écarts sont rendus **dépliés**, ligne par ligne : l'écran ne doit pas
    // avoir à fouiller le `contenu` figé du PV pour les recalculer.
    return liste(
      donnees.map((pv) => ({
        ...pv,
        fournisseur: fournisseurVu(pv),
        ecarts: resumeEcarts(pv.contenu?.lignes ?? []),
      })),
      total.n,
      page,
    );
  });

  app.post('/api/receptions', {
    preHandler: ecriture('magasinier', 'comptable_matieres', 'intendant', 'logistique'),
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['bon_commande_id', 'lignes'],
        properties: {
          bon_commande_id: { type: 'string', format: 'uuid' },
          site_id: { type: ['string', 'null'], format: 'uuid' },
          observations: { type: ['string', 'null'], maxLength: 2000 },
          lignes: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['designation', 'quantite_commandee', 'quantite_recue'],
              properties: {
                designation: { type: 'string', minLength: 2, maxLength: 200 },
                categorie_code: { type: ['string', 'null'], maxLength: 40 },
                quantite_commandee: { type: 'integer', minimum: 0 },
                // Ce que le fournisseur a présenté au bordereau. Facultatif :
                // sans elle, le livré vaut le reçu, et on ne suppose pas un
                // écart qui n'a pas été constaté.
                quantite_livree: { type: ['integer', 'null'], minimum: 0 },
                quantite_recue: { type: 'integer', minimum: 0 },
                conforme: { type: 'boolean', default: true },
                observation: { type: ['string', 'null'], maxLength: 400 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const bon = await lireUn(request, 
      `select bc.*, ${FOURNISSEUR_CONSTATE},
              d.numero as dossier_numero, d.objet, d.procedure, d.montant_estime,
              e.structure_id
         from bon_commande bc
         join fournisseur f on f.id = bc.fournisseur_id
         join dossier_achat d on d.id = bc.dossier_id
         left join etat_besoin e on e.id = d.etat_besoin_id
        where bc.id = $1`,
      [request.body.bon_commande_id],
    );
    if (!bon) throw nonTrouve('Ce bon de commande');
    if (bon.statut === 'annule') {
      throw donneesInvalides("Ce bon de commande est annulé : il n'y a rien à réceptionner.", 'bon_commande_id');
    }

    const structureId = bon.structure_id ?? request.agent.structure_id;
    await verifierEcritureStructure(request, structureId);

    // Invariant : qui engage ne réceptionne pas. Le bon de commande est signé
    // par celui qui l'a émis ; il ne signe pas le PV de sa propre commande.
    const bonDocument = await lireUn(request, 
      `select signataire_id from document
        where type = 'bon_commande' and objet_type = 'bon_commande' and objet_id = $1
        order by cree_le desc limit 1`,
      [String(bon.id)],
    );
    if (bonDocument?.signataire_id && String(bonDocument.signataire_id) === String(request.agent.id)) {
      throw nonAutorise(
        "Faites réceptionner par un autre agent : celui qui a émis le bon de commande ne signe pas le procès-verbal de réception.",
        'signataire_id',
      );
    }

    // Les trois colonnes — commandé, livré, reçu — et l'écart de chacune.
    const resume = resumeEcarts(request.body.lignes);
    const ecarts = resume.lignes.filter((l) => l.en_ecart);

    const resultat = await enEcriture(request, async () => {
      const numero = await prochainNumero('pv_reception');
      await journaliserDepuis(request, {
        action: 'reception',
        objet_type: 'bon_commande',
        objet_id: bon.id,
        avant: { statut: bon.statut },
        apres: {
          statut: ecarts.length > 0 ? 'livre_partiel' : 'receptionne',
          pv: numero,
          lignes: request.body.lignes,
          ecarts,
        },
      });
      // Le PV est figé dès son émission : on ne le modifie plus (RG-019).
      const pv = await lireUn(request, 
        `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
                               signataire_id, signe_le, fige)
         values ('pv_reception', $1, $2, 'bon_commande', $3, $4, $5, now(), true) returning *`,
        [
          numero, structureId, String(bon.id),
          JSON.stringify({
            bon_commande: bon.numero,
            dossier: bon.dossier_numero,
            objet: bon.objet,
            fournisseur: bon.fournisseur_nom,
            site_id: request.body.site_id ?? null,
            observations: request.body.observations ?? null,
            lignes: resume.lignes,
            ecarts,
            resume_ecarts: {
              nombre_lignes: resume.nombre_lignes,
              nombre_ecarts: resume.nombre_ecarts,
              manquants: resume.manquants,
              excedents: resume.excedents,
              non_conformes: resume.non_conformes,
            },
            receptionne_par: request.agent.nom,
          }),
          request.agent.id,
        ],
      );
      const majBon = await lireUn(request, 
        `update bon_commande set statut = $2, livre_le = now() where id = $1 returning *`,
        [bon.id, ecarts.length > 0 ? 'livre_partiel' : 'receptionne'],
      );
      return { pv, bon: majBon };
    });

    // L'écart commandé / livré ouvre un examen, il ne décide rien (RG-022).
    let alerte = null;
    if (ecarts.length > 0) {
      alerte = await enEcriture(request, () => leverAlerte({
        code: 'ECART_RECEPTION',
        gravite: 'attention',
        structure_id: structureId,
        objet_type: 'bon_commande',
        objet_id: String(bon.id),
        explication: "Des quantités reçues s'écartent des quantités commandées, ou des articles sont non conformes : instruisez l'écart avant la prise en charge.",
        donnees: { bon_commande: bon.numero, ecarts },
      }));
    }

    publier({ type: 'reception', objet: 'document', id: resultat.pv.id, structure_id: structureId, donnees: { bon_commande: bon.numero, ecarts: ecarts.length } });
    reply.code(201);
    return {
      pv_reception: resultat.pv,
      bon_commande: resultat.bon,
      fournisseur: fournisseurVu(bon),
      dossier: { numero: bon.dossier_numero, objet: bon.objet, procedure: bon.procedure },
      ecarts,
      resume_ecarts: resume,
      alerte,
    };
  });

  // --- La prise en charge à l'inventaire : RG-010, puis RG-011 --------
  app.post('/api/prises-en-charge', {
    preHandler: ecriture('comptable_matieres'),
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['bon_commande_id'],
        properties: {
          bon_commande_id: { type: 'string', format: 'uuid' },
          pv_reception_id: { type: ['string', 'null'], format: 'uuid' },
          observations: { type: ['string', 'null'], maxLength: 2000 },
          // Les articles de stock pris en charge : la quantité entre au magasin.
          articles: {
            type: 'array',
            maxItems: 200,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['stock_id', 'quantite'],
              properties: {
                stock_id: { type: 'string', format: 'uuid' },
                quantite: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const bon = await lireUn(request, 
      `select bc.*, ${FOURNISSEUR_CONSTATE},
              d.numero as dossier_numero, d.objet, d.procedure, d.montant_estime,
              e.structure_id
         from bon_commande bc
         join fournisseur f on f.id = bc.fournisseur_id
         join dossier_achat d on d.id = bc.dossier_id
         left join etat_besoin e on e.id = d.etat_besoin_id
        where bc.id = $1`,
      [request.body.bon_commande_id],
    );
    if (!bon) throw nonTrouve('Ce bon de commande');
    const structureId = bon.structure_id ?? request.agent.structure_id;
    await verifierEcritureStructure(request, structureId);

    // RG-010 — le certificat ne s'émet qu'après un PV de réception signé.
    const pv = request.body.pv_reception_id
      ? await lireUn(request, `select * from document where id = $1 and type = 'pv_reception'`, [request.body.pv_reception_id])
      : await lireUn(request, 
        `select * from document
          where type = 'pv_reception' and objet_type = 'bon_commande' and objet_id = $1
          order by cree_le desc limit 1`,
        [String(bon.id)],
      );
    appliquer(rg010({ pv_reception: pv }));
    // RG-019 — on s'appuie sur le PV figé, on ne le retouche pas.
    appliquer(rg019({ document: pv, operation: 'lecture' }));

    // Invariant : qui réceptionne ne valide pas sa propre réception.
    if (String(pv.signataire_id) === String(request.agent.id)) {
      throw nonAutorise(
        "Faites prendre en charge par un autre comptable des matières : celui qui a signé le procès-verbal de réception ne certifie pas lui-même la prise en charge.",
        'signataire_id',
      );
    }

    const dejaCertifie = await lireUn(request, 
      `select numero from document
        where type = 'certificat_prise_en_charge' and objet_type = 'bon_commande' and objet_id = $1
        order by cree_le desc limit 1`,
      [String(bon.id)],
    );
    if (dejaCertifie) {
      throw donneesInvalides(
        `Ce bon de commande porte déjà le certificat ${dejaCertifie.numero} : un document figé ne se refait pas, émettez-en un rectificatif si nécessaire.`,
        'bon_commande_id',
      );
    }

    const resultat = await enEcriture(request, async () => {
      const numero = await prochainNumero('certificat_prise_en_charge');
      await journaliserDepuis(request, {
        action: 'prise_en_charge',
        objet_type: 'bon_commande',
        objet_id: bon.id,
        avant: { statut: bon.statut, certificat: null },
        apres: {
          statut: 'receptionne',
          certificat: numero,
          pv_reception: pv.numero,
          articles: request.body.articles ?? [],
        },
      });

      const certificat = await lireUn(request, 
        `insert into document (type, numero, structure_id, objet_type, objet_id, contenu,
                               signataire_id, signe_le, fige, parent_document_id)
         values ('certificat_prise_en_charge', $1, $2, 'bon_commande', $3, $4, $5, now(), true, $6)
         returning *`,
        [
          numero, structureId, String(bon.id),
          JSON.stringify({
            bon_commande: bon.numero,
            dossier: bon.dossier_numero,
            objet: bon.objet,
            fournisseur: bon.fournisseur_nom,
            montant: bon.montant,
            pv_reception: pv.numero,
            observations: request.body.observations ?? null,
            certifie_par: request.agent.nom,
            mention: "Les biens et matières désignés ci-dessus sont pris en charge à l'inventaire. Le paiement devient possible au vu du présent certificat (décret 13/050, art. 137).",
          }),
          request.agent.id, pv.id,
        ],
      );

      // L'entrée au magasin des articles de stock pris en charge.
      const entrees = [];
      for (const article of request.body.articles ?? []) {
        const stock = await lireUn(request, 'select * from stock where id = $1', [article.stock_id]);
        if (!stock) throw nonTrouve("Un des articles de stock pris en charge");
        if (String(stock.structure_id) !== String(structureId)) {
          throw donneesInvalides(
            "Prenez en charge les articles du magasin de la structure réceptionnaire : un article d'une autre structure ne peut pas entrer ici.",
            'articles',
          );
        }
        const nouvelle = stock.quantite + article.quantite;
        await journaliserDepuis(request, {
          action: 'entree_stock',
          objet_type: 'stock',
          objet_id: stock.id,
          avant: { quantite: stock.quantite },
          apres: { quantite: nouvelle, quantite_entree: article.quantite, certificat: numero },
        });
        const maj = await lireUn(request, 
          'update stock set quantite = $2, maj_le = now() where id = $1 returning *',
          [stock.id, nouvelle],
        );
        entrees.push(maj);
      }

      return { certificat, entrees };
    });

    for (const entree of resultat.entrees) {
      publier({
        type: 'entree',
        objet: 'stock',
        id: entree.id,
        structure_id: entree.structure_id,
        quantite: entree.quantite,
        donnees: { designation: entree.designation },
      });
    }
    publier({
      type: 'prise_en_charge',
      objet: 'document',
      id: resultat.certificat.id,
      structure_id: structureId,
      donnees: { bon_commande: bon.numero, certificat: resultat.certificat.numero },
    });

    reply.code(201);
    return {
      certificat_prise_en_charge: resultat.certificat,
      // Le PV dont il découle, et les écarts qu'il a constatés : le comptable
      // public prend en charge au vu de l'un et de l'autre, pas du seul numéro.
      pv_reception: {
        id: pv.id,
        numero: pv.numero,
        signe_le: pv.signe_le,
        ecarts: resumeEcarts(pv.contenu?.lignes ?? []),
      },
      fournisseur: fournisseurVu(bon),
      dossier: { numero: bon.dossier_numero, objet: bon.objet, procedure: bon.procedure },
      entrees_stock: resultat.entrees,
      suite: 'Le paiement peut désormais être marqué possible par le comptable public (RG-011).',
    };
  });
}
