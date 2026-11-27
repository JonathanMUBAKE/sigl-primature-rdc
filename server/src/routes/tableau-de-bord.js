// GET /api/tableau-de-bord — le poste de commande central.
//
// Le principe : **aucun chiffre n'est un cul-de-sac**. Chaque nombre porte le
// lien qui le déplie, avec ses filtres déjà posés, pour que l'interface mène
// toujours quelque part. Et chaque attente nomme qui doit agir et depuis
// combien de temps.
//
// La portée est celle de l'agent (RG-017) : la direction, la logistique et le
// contrôle externe voient tout ; un chef de structure voit sa structure. Les
// établissements autonomes apparaissent au central en consolidé.

import { lireTous, lireUn } from './_sql.js';
import { FENETRE_CONSOMMATION_JOURS, consommationConstatee } from './_consommation.js';
import { lecture, structuresDe } from './_droits.js';
import { porteeTotale } from '../regles/roles.js';

/** `and colonne in (...)` quand la portée est limitée, rien sinon. */
function filtre(permises, colonne, params) {
  if (permises === null) return '';
  if (permises.length === 0) return ' and false';
  const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
  params.push(...permises);
  return ` and ${colonne} in (${places})`;
}

export default async function routesTableauDeBord(app) {
  app.get('/api/tableau-de-bord', {
    preHandler: lecture(),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: { jours: { type: 'integer', minimum: 1, maximum: 365, default: 7 } },
      },
    },
  }, async (request) => {
    const permises = await structuresDe(request);
    const jours = request.query.jours ?? 7;

    // --- Ce qui attend une décision ------------------------------------
    const pBesoins = [];
    const attentes = await lireTous(request, 
      `select e.id, e.numero, e.statut, e.cree_le, e.vise_le, e.structure_id,
              s.code as structure_code, s.nom as structure_nom,
              d.nom as demandeur_nom,
              extract(day from now() - coalesce(e.vise_le, e.cree_le))::int as anciennete_jours
         from etat_besoin e
         join structure s on s.id = e.structure_id
         join agent d on d.id = e.demandeur_id
        where e.statut in ('brouillon', 'vise', 'recu')${filtre(permises, 'e.structure_id', pBesoins)}
        order by coalesce(e.vise_le, e.cree_le) asc
        limit 100`,
      pBesoins,
    );

    // Qui doit agir : le chef de la structure pour un brouillon, la logistique
    // centrale pour un état visé. On nomme les personnes, pas les rôles seuls.
    const chefs = await lireTous(request, 
      `select ar.structure_id, a.id, a.nom, a.fonction
         from agent_role ar join agent a on a.id = ar.agent_id
        where ar.role_code = 'chef_structure' and a.actif`,
    );
    const logisticiens = await lireTous(request, 
      `select a.id, a.nom, a.fonction
         from agent_role ar join agent a on a.id = ar.agent_id
        where ar.role_code = 'logistique' and a.actif`,
    );
    const chefDe = new Map(chefs.map((c) => [String(c.structure_id), c]));

    const enAttenteDeDecision = attentes.map((e) => {
      const brouillon = e.statut === 'brouillon';
      const responsable = brouillon ? chefDe.get(String(e.structure_id)) : logisticiens[0];
      return {
        objet: 'etat_besoin',
        id: e.id,
        numero: e.numero,
        statut: e.statut,
        structure: e.structure_nom,
        structure_code: e.structure_code,
        demandeur: e.demandeur_nom,
        attend: brouillon ? 'le visa du chef de structure' : "l'examen de la logistique centrale",
        role_attendu: brouillon ? 'chef_structure' : 'logistique',
        qui_doit_agir: responsable?.nom ?? (brouillon ? 'Chef de structure non désigné' : 'Logistique centrale'),
        anciennete_jours: e.anciennete_jours ?? 0,
        lien: `/api/besoins/${e.id}`,
      };
    });

    // Les réceptions sans prise en charge : le comptable des matières doit agir.
    const pPec = [];
    const sansPriseEnCharge = await lireTous(request, 
      `select pv.id, pv.numero, pv.objet_id as bon_commande_id, pv.cree_le, pv.structure_id,
              s.nom as structure_nom,
              extract(day from now() - pv.cree_le)::int as anciennete_jours
         from document pv
         join structure s on s.id = pv.structure_id
        where pv.type = 'pv_reception'
          and not exists (select 1 from document c
                           where c.type = 'certificat_prise_en_charge'
                             and c.objet_type = pv.objet_type and c.objet_id = pv.objet_id)
          ${filtre(permises, 'pv.structure_id', pPec)}
        order by pv.cree_le asc limit 100`,
      pPec,
    );
    const comptables = await lireTous(request, 
      `select ar.structure_id, a.id, a.nom from agent_role ar join agent a on a.id = ar.agent_id
        where ar.role_code = 'comptable_matieres' and a.actif`,
    );
    const comptableDe = new Map(comptables.map((c) => [String(c.structure_id), c]));
    for (const pv of sansPriseEnCharge) {
      enAttenteDeDecision.push({
        objet: 'pv_reception',
        id: pv.id,
        numero: pv.numero,
        statut: 'receptionne',
        structure: pv.structure_nom,
        attend: "la prise en charge à l'inventaire",
        role_attendu: 'comptable_matieres',
        qui_doit_agir: comptableDe.get(String(pv.structure_id))?.nom ?? comptables[0]?.nom ?? 'Comptable des matières',
        anciennete_jours: pv.anciennete_jours ?? 0,
        lien: `/api/documents/${pv.id}`,
      });
    }

    // Les certificats émis dont le paiement n'est pas encore marqué possible.
    const pPaiement = [];
    const attendPaiement = await lireTous(request, 
      `select c.id, c.numero, c.objet_id as bon_commande_id, c.cree_le, c.structure_id,
              bc.numero as bon_numero, bc.montant, bc.statut as bon_statut,
              extract(day from now() - c.cree_le)::int as anciennete_jours
         from document c
         left join bon_commande bc on bc.id::text = c.objet_id
        where c.type = 'certificat_prise_en_charge'
          and coalesce(bc.statut, '') not in ('payable', 'paye')
          ${filtre(permises, 'c.structure_id', pPaiement)}
        order by c.cree_le asc limit 100`,
      pPaiement,
    );
    const comptablesPublics = await lireTous(request, 
      `select a.id, a.nom from agent_role ar join agent a on a.id = ar.agent_id
        where ar.role_code = 'comptable_public' and a.actif`,
    );
    for (const c of attendPaiement) {
      enAttenteDeDecision.push({
        objet: 'bon_commande',
        id: c.bon_commande_id,
        numero: c.bon_numero ?? c.numero,
        statut: c.bon_statut ?? 'receptionne',
        montant: c.montant,
        attend: 'le marquage du paiement possible',
        role_attendu: 'comptable_public',
        qui_doit_agir: comptablesPublics[0]?.nom ?? 'Comptable public',
        anciennete_jours: c.anciennete_jours ?? 0,
        lien: `/api/bons-commande?statut=${encodeURIComponent(c.bon_statut ?? 'receptionne')}`,
      });
    }

    enAttenteDeDecision.sort((a, b) => b.anciennete_jours - a.anciennete_jours);

    // --- Le délai moyen du besoin à la livraison -----------------------
    const pDelai = [];
    const delai = await lireUn(request, 
      `select count(*)::int as nombre,
              round(avg(extract(epoch from (coalesce(e.accuse_le, e.clos_le) - e.cree_le)) / 86400.0)::numeric, 1) as jours_moyens,
              round(min(extract(epoch from (coalesce(e.accuse_le, e.clos_le) - e.cree_le)) / 86400.0)::numeric, 1) as jours_minimum,
              round(max(extract(epoch from (coalesce(e.accuse_le, e.clos_le) - e.cree_le)) / 86400.0)::numeric, 1) as jours_maximum
         from etat_besoin e
        where e.statut in ('livre', 'clos')
          and coalesce(e.accuse_le, e.clos_le) is not null
          ${filtre(permises, 'e.structure_id', pDelai)}`,
      pDelai,
    );

    // --- Le patrimoine : par catégorie et par structure ----------------
    const pCat = [];
    const parCategorie = await lireTous(request, 
      `select b.categorie_code, c.libelle, c.classement,
              count(*)::int as nombre,
              sum(b.quantite)::int as quantite,
              coalesce(sum(b.valeur_acquisition), 0) as valeur,
              count(*) filter (where b.suivi = 'individuel')::int as suivis_individuellement,
              count(*) filter (where b.immatriculation is not null)::int as immatricules
         from bien b join categorie c on c.code = b.categorie_code
        where true${filtre(permises, 'b.structure_id', pCat)}
        group by b.categorie_code, c.libelle, c.classement
        order by valeur desc`,
      pCat,
    );
    const pStruct = [];
    const parStructure = await lireTous(request, 
      `select s.id, s.code, s.nom, s.regime,
              count(b.id)::int as nombre,
              coalesce(sum(b.valeur_acquisition), 0) as valeur,
              count(b.id) filter (where b.suivi = 'individuel')::int as suivis_individuellement,
              count(b.id) filter (where b.immatriculation is not null)::int as immatricules,
              count(b.id) filter (where b.etat in ('a_reparer', 'hors_service', 'en_maintenance'))::int as a_soigner
         from structure s left join bien b on b.structure_id = s.id
        where true${filtre(permises, 's.id', pStruct)}
        group by s.id, s.code, s.nom, s.regime
        order by s.regime, s.code`,
      pStruct,
    );

    const tauxImmatriculation = (ligne) => (ligne.suivis_individuellement > 0
      ? Math.round((ligne.immatricules / ligne.suivis_individuellement) * 1000) / 10
      : null);

    // --- Les stocks : seuils et ruptures prévisibles -------------------
    const pStock = [];
    const stocks = await lireTous(request, 
      `select st.id, st.designation, st.categorie_code, st.quantite, st.seuil_minimum, st.seuil_critique,
              st.structure_id, s.code as structure_code, st.site_id, si.nom as site_nom
         from stock st
         join structure s on s.id = st.structure_id
         join site si on si.id = st.site_id
        where true${filtre(permises, 'st.structure_id', pStock)}`,
      pStock,
    );
    // La consommation constatée ne se lit **pas** dans la requête ci-dessus.
    // Le journal est réservé au mode consolidation par la politique
    // `journal_lecture` : jointe ici, la table ne rendait rien sous une
    // transaction métier, et le magasinier comme le comptable des matières —
    // ceux qui ouvrent ce tableau pour savoir ce qui va manquer — n'avaient
    // jamais un seul article à surveiller. La lecture passe donc par
    // `_consommation.js`, nommée et bornée aux articles que le cloisonnement a
    // déjà laissé passer.
    const consommations = await consommationConstatee(
      request, stocks.map((a) => String(a.id)), FENETRE_CONSOMMATION_JOURS,
    );

    const articlesCritiques = [];
    let sousMinimum = 0;
    let sousCritique = 0;
    let enRupture = 0;
    let ruptureSous30 = 0;
    for (const a of stocks) {
      const conso = Number(consommations.get(String(a.id))?.consommation_jour ?? 0);
      const jours_couverture = conso > 0 ? Math.floor(Number(a.quantite) / conso) : null;
      if (Number(a.quantite) === 0) enRupture += 1;
      else if (Number(a.quantite) <= Number(a.seuil_critique)) sousCritique += 1;
      else if (Number(a.quantite) <= Number(a.seuil_minimum)) sousMinimum += 1;
      if (jours_couverture !== null && jours_couverture <= 30) {
        ruptureSous30 += 1;
        articlesCritiques.push({
          id: a.id,
          designation: a.designation,
          site: a.site_nom,
          structure_code: a.structure_code,
          quantite: a.quantite,
          consommation_jour: Math.round(conso * 1000) / 1000,
          jours_couverture,
          date_rupture_prevue: new Date(Date.now() + jours_couverture * 86_400_000).toISOString().slice(0, 10),
          lien: `/api/stocks/${a.id}`,
        });
      }
    }
    articlesCritiques.sort((a, b) => a.jours_couverture - b.jours_couverture);

    // --- Les achats : par procédure, et les écarts ----------------------
    const dossiersParProcedure = await lireTous(request, 
      `select d.procedure, d.statut, count(*)::int as nombre, coalesce(sum(d.montant_estime), 0) as montant_estime
         from dossier_achat d group by d.procedure, d.statut order by d.procedure`,
    );
    const ecarts = await lireUn(request, 
      `select coalesce(sum(bc.montant), 0) as montant_commande,
              coalesce(sum(bc.montant) filter (where bc.statut in ('livre', 'livre_partiel', 'receptionne', 'payable', 'paye')), 0) as montant_livre,
              coalesce(sum(bc.montant) filter (where bc.statut in ('receptionne', 'payable', 'paye')), 0) as montant_receptionne,
              coalesce(sum(bc.montant) filter (where bc.statut = 'paye'), 0) as montant_paye,
              count(*)::int as bons,
              count(*) filter (where bc.statut = 'livre_partiel')::int as livraisons_partielles
         from bon_commande bc`,
    );

    // --- Les alertes ouvertes, par gravité -----------------------------
    const pAlertes = [];
    const alertes = await lireTous(request,
      `select al.gravite, al.statut, count(*)::int as nombre,
              max(extract(day from now() - al.cree_le))::int as plus_ancienne_jours,
              -- Ce qui brûle, et ce qui attend seulement d'être classé : une
              -- alerte dont la condition a été levée depuis n'est pas de même
              -- nature qu'une alerte active (migration 020000).
              count(*) filter (where al.donnees->>'condition_levee_le' is null)::int as actives,
              count(*) filter (where al.donnees->>'condition_levee_le' is not null)::int as condition_levee
         from alerte al
        where true${filtre(permises, 'al.structure_id', pAlertes)}
        group by al.gravite, al.statut`,
      pAlertes,
    );
    const enCours = alertes.filter((a) => ['ouverte', 'en_examen'].includes(a.statut));
    const alertesActives = enCours.reduce((s, a) => s + a.actives, 0);
    const alertesAClasser = enCours.reduce((s, a) => s + a.condition_levee, 0);

    // --- L'activité des derniers jours ---------------------------------
    // Le journal entier n'est lisible qu'en consolidation (contrat §5 : le
    // journal est réservé au contrôle externe). Un agent de portée propre
    // obtenait donc une activité vide, sans que rien ne le dise — un zéro qui
    // ressemble à un calme. On le dit maintenant, plutôt que de le taire.
    const journalLisible = porteeTotale(request.agent);
    const activite = journalLisible
      ? await lireTous(request, 
        `select date_trunc('day', j.horodatage)::date as jour, j.action, count(*)::int as nombre
           from journal j
          where j.horodatage > now() - ($1 || ' days')::interval
          group by 1, 2 order by 1 desc, 3 desc`,
        [String(jours)],
      )
      : [];
    const activiteParJour = new Map();
    for (const l of activite) {
      const cle = String(l.jour).slice(0, 10);
      const jour = activiteParJour.get(cle) ?? { jour: cle, total: 0, actions: [] };
      jour.total += l.nombre;
      jour.actions.push({ action: l.action, nombre: l.nombre });
      activiteParJour.set(cle, jour);
    }

    // --- Les chiffres de tête ------------------------------------------
    const pTete = [];
    const tete = await lireUn(request, 
      `select (select count(*)::int from bien b where true${filtre(permises, 'b.structure_id', pTete)}) as biens`,
      [...pTete],
    );
    const pTete2 = [];
    const valeurTotale = await lireUn(request, 
      `select coalesce(sum(b.valeur_acquisition), 0) as valeur
         from bien b where true${filtre(permises, 'b.structure_id', pTete2)}`,
      pTete2,
    );

    return {
      portee: {
        agent: request.agent.nom,
        structure: request.agent.structure_nom,
        consolide: porteeTotale(request.agent),
        structures: permises === null ? 'toutes' : permises.length,
      },
      chiffres_de_tete: [
        { libelle: 'Biens au registre', valeur: tete.biens, lien: '/api/biens' },
        { libelle: "Valeur d'acquisition (FC)", valeur: Number(valeurTotale.valeur), lien: '/api/biens' },
        { libelle: 'Décisions en attente', valeur: enAttenteDeDecision.length, lien: '/api/besoins?statut=vise' },
        { libelle: 'Articles sous seuil', valeur: sousMinimum + sousCritique + enRupture, lien: '/api/stocks?sous_seuil=true' },
        // Le chiffre de tête ne compte que ce qui brûle : une alerte dont la
        // condition est levée n'attend plus qu'un classement, elle n'appelle
        // pas une décision d'approvisionnement.
        { libelle: 'Alertes actives', valeur: alertesActives, lien: '/api/alertes?nature=active' },
      ],
      en_attente_de_decision: {
        total: enAttenteDeDecision.length,
        plus_ancienne_jours: enAttenteDeDecision[0]?.anciennete_jours ?? 0,
        au_dela_de_7_jours: enAttenteDeDecision.filter((a) => a.anciennete_jours > 7).length,
        lignes: enAttenteDeDecision.slice(0, 50),
        lien: '/api/besoins?statut=vise',
      },
      delai_besoin_livraison: {
        nombre_mesures: delai?.nombre ?? 0,
        jours_moyens: delai?.jours_moyens === null ? null : Number(delai?.jours_moyens ?? 0),
        jours_minimum: delai?.jours_minimum === null ? null : Number(delai?.jours_minimum ?? 0),
        jours_maximum: delai?.jours_maximum === null ? null : Number(delai?.jours_maximum ?? 0),
        lien: '/api/besoins?statut=clos',
      },
      patrimoine: {
        par_categorie: parCategorie.map((c) => ({
          ...c,
          valeur: Number(c.valeur),
          taux_immatriculation: tauxImmatriculation(c),
          lien: `/api/biens?categorie=${encodeURIComponent(c.categorie_code)}`,
        })),
        par_structure: parStructure.map((s) => ({
          ...s,
          valeur: Number(s.valeur),
          taux_immatriculation: tauxImmatriculation(s),
          lien: `/api/biens?structure=${s.id}`,
          lien_a_soigner: `/api/biens?structure=${s.id}&etat=a_reparer`,
        })),
      },
      stocks: {
        articles: stocks.length,
        en_rupture: { valeur: enRupture, lien: '/api/stocks?rupture=true' },
        sous_seuil_critique: { valeur: sousCritique, lien: '/api/stocks?sous_critique=true' },
        sous_seuil_minimum: { valeur: sousMinimum, lien: '/api/stocks?sous_seuil=true' },
        rupture_prevue_30_jours: { valeur: ruptureSous30, lien: '/api/stocks?tri=criticite' },
        fenetre_consommation_jours: FENETRE_CONSOMMATION_JOURS,
        articles_a_surveiller: articlesCritiques.slice(0, 25),
      },
      achats: {
        par_procedure: dossiersParProcedure.map((d) => ({
          ...d,
          montant_estime: Number(d.montant_estime),
          lien: `/api/dossiers-achat?procedure=${d.procedure}&statut=${d.statut}`,
        })),
        ecarts: {
          montant_commande: Number(ecarts.montant_commande),
          montant_livre: Number(ecarts.montant_livre),
          montant_receptionne: Number(ecarts.montant_receptionne),
          montant_paye: Number(ecarts.montant_paye),
          ecart_commande_livre: Number(ecarts.montant_commande) - Number(ecarts.montant_livre),
          ecart_livre_receptionne: Number(ecarts.montant_livre) - Number(ecarts.montant_receptionne),
          bons: ecarts.bons,
          livraisons_partielles: { valeur: ecarts.livraisons_partielles, lien: '/api/bons-commande?statut=livre_partiel' },
          lien: '/api/bons-commande',
        },
      },
      alertes: {
        par_gravite: alertes.map((a) => ({
          ...a,
          lien: `/api/alertes?gravite=${a.gravite}&statut=${a.statut}`,
        })),
        ouvertes: enCours.reduce((s, a) => s + a.nombre, 0),
        // Les deux natures séparées : ce qui brûle, ce qui attend un classement.
        actives: alertesActives,
        a_classer: alertesAClasser,
        lien: '/api/alertes?ouvertes=true',
        lien_actives: '/api/alertes?nature=active',
        lien_a_classer: '/api/alertes?nature=a_classer',
      },
      activite: {
        jours,
        disponible: journalLisible,
        motif: journalLisible
          ? null
          : 'Le journal est réservé à la lecture consolidée : votre profil ne le lit pas.',
        par_jour: [...activiteParJour.values()],
        total: activite.reduce((s, l) => s + l.nombre, 0),
        lien: '/api/journal',
      },
      horodatage: new Date().toISOString(),
    };
  });
}
