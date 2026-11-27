// La reprise des inventaires existants.
//
// Le SIGL n'arrive pas dans un vide : la Primature tient déjà ses inventaires
// sur papier et en tableur. Un registre qui démarre vide renvoie les agents à
// leurs classeurs, et l'outil meurt en trois semaines. Contrat du lot :
// `docs/LOT-REPRISE.md`.
//
// Règles tenues ici : **RG-034** (le dépôt analyse, l'application écrit),
// **RG-035** (une identité déjà au registre est écartée, jamais écrasée),
// **RG-036** (une reprise ne s'applique qu'une fois — verrou en base),
// **RG-037** (une reprise ne crée de biens que dans sa structure), plus
// RG-017 (périmètre de lecture), RG-018 (une autonome n'est pas écrite d'en
// haut), RG-020 (journal avant confirmation) et RG-021 (un lot n'est pas
// immatriculé).

import { createHash } from 'node:crypto';

import { enEcriture, lireTous, lireUn } from './_sql.js';
import { ecriture, lecture, structuresDe, verifierEcritureStructure, verifierLectureStricte } from './_droits.js';
import {
  donneesInvalides, erreur, liste, pagination, schemaIdParam, schemaPagination,
} from './_commun.js';
import { refuserOuIntrouvable } from './_rattachement.js';
import { journaliserDepuis } from './_journal.js';
import { prochaineImmatriculation, prochainNumero } from './_numeros.js';
import { publier } from './_flux.js';

// ---------------------------------------------------------------------------
// Le format déposé.
// ---------------------------------------------------------------------------

export const COLONNES_CONNUES = [
  'designation', 'categorie', 'date_acquisition', 'immatriculation', 'marque', 'modele',
  'numero_serie', 'etat', 'valeur_acquisition', 'site', 'detenteur_email', 'suivi', 'quantite',
];

export const COLONNES_OBLIGATOIRES = ['designation', 'categorie', 'date_acquisition'];

// Les états qu'une reprise peut poser. `en_maintenance`, `reforme` et `perdu`
// en sont absents volontairement : ce sont des états que l'on atteint par un
// circuit — une sortie pour maintenance, le circuit de réforme (RG-016,
// RG-033), un procès-verbal de perte. Les poser par import reviendrait à
// inscrire au registre l'aboutissement d'une procédure dont aucune pièce
// n'existe.
export const ETATS_REPRIS = ['neuf', 'bon', 'a_reparer', 'hors_service'];

const SUIVIS = ['individuel', 'lot'];

const refus = (message, champ) => ({ erreur: { code: 'donnees_invalides', message, champ }, colonnes: [], lignes: [] });

/**
 * Lit le fichier déposé. Rend `{ erreur, colonnes, lignes }` : `erreur` est
 * nulle quand le fichier est exploitable, et sinon **nomme la colonne** en
 * cause. Une colonne mal orthographiée est une donnée perdue en silence, et
 * perdre une donnée sans le dire est le défaut que ce lot existe pour éviter.
 *
 * Fonction pure : aucune base, aucun contexte. C'est ce qui permet de
 * l'éprouver ligne à ligne.
 */
export function lireFichier(texte) {
  const brut = String(texte ?? '').replace(/^\uFEFF/, '');
  if (!brut.trim()) {
    return refus('Le fichier déposé est vide.', null);
  }

  const lignesBrutes = brut.split(/\r?\n/);
  const colonnes = lignesBrutes[0].split(';').map((c) => c.trim().toLowerCase());

  const vide = colonnes.findIndex((c) => c === '');
  if (vide !== -1) {
    return refus(
      `La colonne ${vide + 1} de l'en-tête n'a pas de nom : nommez-la ou retirez-la.`, null,
    );
  }
  const repetee = colonnes.find((c, i) => colonnes.indexOf(c) !== i);
  if (repetee) {
    return refus(
      `La colonne « ${repetee} » figure deux fois dans l'en-tête : on ne devine pas laquelle compte.`,
      repetee,
    );
  }
  const inconnue = colonnes.find((c) => !COLONNES_CONNUES.includes(c));
  if (inconnue) {
    return refus(
      `La colonne « ${inconnue} » est inconnue du format de reprise. Colonnes admises : ${COLONNES_CONNUES.join(', ')}.`,
      inconnue,
    );
  }
  const manquante = COLONNES_OBLIGATOIRES.find((c) => !colonnes.includes(c));
  if (manquante) {
    return refus(
      `La colonne obligatoire « ${manquante} » manque à l'en-tête.`, manquante,
    );
  }

  const lignes = [];
  for (let i = 1; i < lignesBrutes.length; i += 1) {
    const texteLigne = lignesBrutes[i];
    // Une ligne vide, ou réduite à ses séparateurs, n'est pas une donnée : un
    // tableur en laisse souvent en fin de fichier.
    if (!texteLigne.replace(/;/g, '').trim()) continue;
    const champs = texteLigne.split(';');
    const valeurs = {};
    for (const [rang, colonne] of colonnes.entries()) {
      valeurs[colonne] = (champs[rang] ?? '').trim();
    }
    const ligne = { numero_ligne: i + 1, valeurs };
    if (champs.length !== colonnes.length) {
      // Presque toujours un point-virgule égaré dans une désignation. On le
      // dit plutôt que de décaler les colonnes en silence.
      ligne.defaut = {
        motif: `Cette ligne porte ${champs.length} champs alors que l'en-tête en annonce ${colonnes.length} : un point-virgule s'est probablement glissé dans un libellé.`,
        colonne: null,
      };
    }
    lignes.push(ligne);
  }

  if (lignes.length === 0) {
    return refus("Le fichier ne porte aucune ligne de données : l'en-tête est seul.", null);
  }
  return { erreur: null, colonnes, lignes };
}

/** `AAAA-MM-JJ` ou `JJ/MM/AAAA` → `AAAA-MM-JJ`. Rend `null` si illisible. */
export function normaliserDate(valeur) {
  const v = String(valeur ?? '').trim();
  if (!v) return null;
  let a; let m; let j;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (iso) { [, a, m, j] = iso; } else {
    const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
    if (!fr) return null;
    [, j, m, a] = fr;
  }
  const annee = Number(a); const mois = Number(m); const jour = Number(j);
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  // Le calendrier tranche : un 31 février se replie sur mars, donc se refuse.
  if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) {
    return null;
  }
  return `${String(annee).padStart(4, '0')}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/**
 * Un montant tel qu'un tableur francophone l'écrit : espaces de milliers et
 * virgule décimale. Rend `null` quand la valeur est **absente** — ce qui n'est
 * pas zéro — et `NaN` quand elle est présente mais illisible.
 */
export function normaliserMontant(valeur) {
  const v = String(valeur ?? '').trim();
  if (!v) return null;
  const net = v.replace(/[\s\u00a0]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(net)) return Number.NaN;
  return Number(net);
}

/** Un entier positif, ou `null` si absent, ou `NaN` si illisible. */
function normaliserEntier(valeur) {
  const v = String(valeur ?? '').trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return Number.NaN;
  return Number(v);
}

/**
 * L'empreinte d'un bien qui ne porte aucune identité propre.
 *
 * Une ligne sans immatriculation ni numéro de série n'a rien par quoi se
 * reconnaître : redéposer le fichier recréerait le bien, et c'est exactement
 * ce que la reprise rejouable promet d'éviter. On se rabat donc sur ce que
 * l'inventaire porte toujours — le libellé, la catégorie, la date d'entrée et
 * le site — pour **présumer** le doublon.
 *
 * Présumer, et non conclure : deux bureaux identiques entrés le même jour au
 * même endroit existent vraiment. Le choix du défaut n'est pas neutre pour
 * autant — un patrimoine doublé ne se démêle plus, tandis qu'une ligne écartée
 * à tort se lit dans le rapport et se corrige en une colonne. La ligne est donc
 * écartée, et son motif dit comment la faire passer.
 */
export function empreinteDeBien({ designation, categorie_code: categorie, date_acquisition: date, site_id: site }) {
  return [
    String(designation ?? '').trim().toLowerCase()
      // Les accents sont neutralisés : un inventaire retapé écrit « Armoire
      // metallique » là où le premier portait « métallique », et la présomption
      // de doublon doit survivre à cette différence.
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' '),
    String(categorie ?? ''),
    String(date ?? ''),
    site ? String(site) : '',
  ].join('|');
}

const rejet = (colonne, motif) => ({ verdict: 'rejetee', colonne, motif, bien: null });
const doublon = (colonne, motif) => ({ verdict: 'doublon', colonne, motif, bien: null });

/**
 * Le verdict d'une ligne : `a_creer`, `doublon` ou `rejetee`, avec son motif et
 * **la colonne où regarder**.
 *
 * L'ordre des contrôles n'est pas indifférent. L'identité passe d'abord : une
 * ligne déjà au registre n'a plus rien à corriger, et lui opposer un défaut de
 * forme enverrait l'agent réparer un fichier qui ne sera pas appliqué.
 *
 * `contexte.immatriculationsDuFichier` et `contexte.seriesDuFichier` sont des
 * `Map` que cette fonction **nourrit** au fil des lignes acceptées : c'est ce
 * qui permet de dire à quelle ligne du même fichier se trouve l'original.
 */
export function verdictDeLigne(valeurs, contexte, numeroLigne = null) {
  const lire = (c) => String(valeurs?.[c] ?? '').trim();

  const immatriculation = lire('immatriculation');
  const numeroSerie = lire('numero_serie');

  // --- RG-035 : l'identité d'abord ---------------------------------------
  if (immatriculation) {
    if (contexte.immatriculationsExistantes.has(immatriculation)) {
      return doublon('immatriculation',
        `L'immatriculation ${immatriculation} est déjà au registre : la ligne est écartée et le bien existant n'est pas touché.`);
    }
    const deja = contexte.immatriculationsDuFichier.get(immatriculation);
    if (deja) {
      return doublon('immatriculation',
        `L'immatriculation ${immatriculation} figure déjà à la ligne ${deja} du même fichier.`);
    }
  }
  if (numeroSerie) {
    if (contexte.seriesExistantes.has(numeroSerie)) {
      return doublon('numero_serie',
        `Le numéro de série ${numeroSerie} est déjà au registre : la ligne est écartée et le bien existant n'est pas touché.`);
    }
    const deja = contexte.seriesDuFichier.get(numeroSerie);
    if (deja) {
      return doublon('numero_serie',
        `Le numéro de série ${numeroSerie} figure déjà à la ligne ${deja} du même fichier.`);
    }
  }

  // --- La forme, colonne par colonne -------------------------------------
  const designation = lire('designation');
  if (!designation) {
    return rejet('designation', 'La désignation est vide : un bien sans libellé ne se retrouve pas au registre.');
  }

  const codeCategorie = lire('categorie');
  const categorie = contexte.categories.get(codeCategorie);
  if (!categorie) {
    return rejet('categorie',
      `Le code de catégorie « ${codeCategorie} » n'est pas à la nomenclature.`);
  }
  if (categorie.classement === 'stock') {
    return rejet('categorie',
      `La catégorie « ${codeCategorie} » est un article de stock. Les stocks se reprennent par une campagne d'inventaire initiale, qui compte des quantités, et non par ce format.`);
  }

  const dateAcquisition = normaliserDate(lire('date_acquisition'));
  if (!dateAcquisition) {
    return rejet('date_acquisition',
      `La date « ${lire('date_acquisition')} » ne se lit pas. Écrivez-la AAAA-MM-JJ ou JJ/MM/AAAA.`);
  }

  const etat = lire('etat') || 'bon';
  if (!ETATS_REPRIS.includes(etat)) {
    return rejet('etat',
      `L'état « ${etat} » ne se reprend pas. États admis : ${ETATS_REPRIS.join(', ')}.`);
  }

  const suivi = lire('suivi') || 'individuel';
  if (!SUIVIS.includes(suivi)) {
    return rejet('suivi', `Le suivi « ${suivi} » est inconnu. Écrivez « individuel » ou « lot ».`);
  }
  // RG-021 : un bien suivi en lot n'a pas d'immatriculation individuelle.
  if (suivi === 'lot' && immatriculation) {
    return rejet('immatriculation',
      'RG-021 : un bien suivi en lot ne porte pas d\'immatriculation individuelle. Retirez-la, ou passez la ligne en suivi individuel.');
  }

  const quantite = normaliserEntier(lire('quantite'));
  if (Number.isNaN(quantite)) {
    return rejet('quantite', `La quantité « ${lire('quantite')} » n'est pas un nombre entier.`);
  }
  if (quantite !== null && quantite < 1) {
    return rejet('quantite', 'La quantité doit être au moins 1.');
  }
  if (suivi === 'individuel' && quantite !== null && quantite > 1) {
    return rejet('quantite',
      'Un bien suivi en individuel compte pour une unité. Pour plusieurs exemplaires, passez la ligne en suivi « lot ».');
  }

  const valeur = normaliserMontant(lire('valeur_acquisition'));
  if (Number.isNaN(valeur)) {
    return rejet('valeur_acquisition',
      `La valeur « ${lire('valeur_acquisition')} » ne se lit pas comme un montant.`);
  }

  let siteId = null;
  const nomSite = lire('site');
  if (nomSite) {
    siteId = contexte.sites.get(nomSite.toLowerCase()) ?? null;
    if (!siteId) {
      return rejet('site',
        `Aucun site « ${nomSite} » dans cette structure. Une reprise ne crée pas de site au passage.`);
    }
  }

  let detenteurId = null;
  const email = lire('detenteur_email');
  if (email) {
    detenteurId = contexte.agents.get(email.toLowerCase()) ?? null;
    if (!detenteurId) {
      return rejet('detenteur_email',
        `Aucun agent d'adresse « ${email} » dans cette structure. Le détenteur se désigne par son adresse, jamais par ressemblance de nom : l'historique de garde est ce qu'un contrôle vient vérifier.`);
    }
  }

  // RG-035, second volet : sans identité propre, le doublon se présume.
  if (!immatriculation && !numeroSerie) {
    const empreinte = empreinteDeBien({
      designation, categorie_code: categorie.code, date_acquisition: dateAcquisition, site_id: siteId,
    });
    if (contexte.empreintesExistantes.has(empreinte)) {
      return doublon('designation',
        `Un bien « ${designation} » de la catégorie ${categorie.code}, entré le ${dateAcquisition} au même emplacement, est déjà au registre. La ligne est écartée pour ne pas doubler le patrimoine. S'il s'agit bien d'un second exemplaire, portez-lui son immatriculation ou son numéro de série, ou reprenez-le en suivi « lot » avec sa quantité.`);
    }
    const deja = contexte.empreintesDuFichier.get(empreinte);
    if (deja) {
      return doublon('designation',
        `Cette ligne répète à l'identique la ligne ${deja} du même fichier — même libellé, même catégorie, même date, même emplacement — et aucune des deux ne porte d'identité propre. Pour reprendre deux exemplaires, donnez-leur leur immatriculation ou leur numéro de série, ou reprenez-les en suivi « lot ».`);
    }
    contexte.empreintesDuFichier.set(empreinte, numeroLigne);
  }

  if (immatriculation) contexte.immatriculationsDuFichier.set(immatriculation, numeroLigne);
  if (numeroSerie) contexte.seriesDuFichier.set(numeroSerie, numeroLigne);

  return {
    verdict: 'a_creer',
    motif: null,
    colonne: null,
    bien: {
      immatriculation: suivi === 'individuel' ? (immatriculation || null) : null,
      categorie_code: categorie.code,
      designation,
      marque: lire('marque') || null,
      modele: lire('modele') || null,
      numero_serie: numeroSerie || null,
      date_acquisition: dateAcquisition,
      etat,
      suivi,
      quantite: quantite ?? 1,
      site_id: siteId,
      detenteur_id: detenteurId,
      // Une valeur absente se dit inconnue : zéro est le prix d'un don, et le
      // registre affirmerait une fausseté qu'aucun écran ne démentirait.
      valeur_acquisition: valeur ?? 0,
      valeur_acquisition_connue: valeur !== null,
    },
  };
}

/** Le résumé des verdicts, toujours dans le même ordre et toujours complet. */
export function resumeDesVerdicts(lignes) {
  const resume = { a_creer: 0, doublon: 0, rejetee: 0, creee: 0 };
  for (const l of lignes) {
    if (resume[l.verdict] !== undefined) resume[l.verdict] += 1;
  }
  return resume;
}

// ---------------------------------------------------------------------------
// Les routes.
// ---------------------------------------------------------------------------

const VERDICTS = ['a_creer', 'doublon', 'rejetee', 'creee'];

const schemaDepot = {
  type: 'object',
  required: ['fichier_nom', 'contenu'],
  properties: {
    fichier_nom: { type: 'string', minLength: 1, maxLength: 255 },
    // Un inventaire de plusieurs milliers de lignes reste un petit fichier
    // texte. La borne protège la mémoire du serveur, pas la pudeur du format.
    contenu: { type: 'string', minLength: 1, maxLength: 8_000_000 },
  },
};

async function clausePerimetre(request, params, colonne) {
  const permises = await structuresDe(request);
  if (permises === null) return ''; // portée totale : lecture consolidée.
  if (permises.length === 0) return ' and false';
  const places = permises.map((_, i) => `$${params.length + i + 1}`).join(', ');
  params.push(...permises);
  return ` and ${colonne} in (${places})`;
}

/** Le contexte d'analyse : la nomenclature, les sites, les agents, le registre. */
async function contexteDeReprise(request, structureId) {
  const [categories, sites, agents, immatriculations, series, empreintes] = await Promise.all([
    lireTous(request, "select code, classement from categorie where actif"),
    lireTous(request, 'select id, nom from site where structure_id = $1 and actif', [structureId]),
    lireTous(request, 'select id, email from agent where structure_id = $1 and actif', [structureId]),
    // Le registre tel que cet agent le voit : son périmètre. Une structure est
    // propriétaire de son inventaire, et un numéro qu'elle ne voit pas n'est
    // pas le sien.
    lireTous(request, 'select immatriculation from bien where immatriculation is not null'),
    lireTous(request, "select numero_serie from bien where numero_serie is not null and numero_serie <> ''"),
    // Les biens sans identité propre, par leur empreinte : c'est ce qui rend la
    // reprise rejouable pour les lignes qu'aucun numéro ne distingue.
    lireTous(request,
      `select designation, categorie_code, date_acquisition::text as date_acquisition,
              site_id
         from bien`),
  ]);

  return {
    categories: new Map(categories.map((c) => [c.code, c])),
    sites: new Map(sites.map((s) => [String(s.nom).toLowerCase(), s.id])),
    agents: new Map(agents.map((a) => [String(a.email).toLowerCase(), a.id])),
    immatriculationsExistantes: new Set(immatriculations.map((b) => b.immatriculation)),
    seriesExistantes: new Set(series.map((b) => b.numero_serie)),
    empreintesExistantes: new Set(empreintes.map((b) => empreinteDeBien(b))),
    immatriculationsDuFichier: new Map(),
    seriesDuFichier: new Map(),
    empreintesDuFichier: new Map(),
  };
}

export default async function routesReprise(app) {
  // --- Le dépôt : il analyse, et n'écrit aucun bien (RG-034) --------------
  app.post('/api/reprises', {
    preHandler: ecriture('comptable_matieres', 'logistique', 'intendant'),
    schema: { body: schemaDepot },
  }, async (request, reply) => {
    const { fichier_nom: fichierNom, contenu } = request.body;

    // Le fichier est jugé avant toute écriture : un fichier refusé ne laisse
    // pas de reprise derrière lui, qui encombrerait la liste sans rien dire.
    const lu = lireFichier(contenu);
    if (lu.erreur) throw donneesInvalides(lu.erreur.message, lu.erreur.champ);

    // RG-037 et RG-018 : la reprise se rattache à la structure de l'agent, et
    // l'écriture s'arrête à la frontière d'un établissement autonome.
    const structure = await verifierEcritureStructure(request, request.agent.structure_id);

    return enEcriture(request, async () => {
      const contexte = await contexteDeReprise(request, structure.id);

      const jugees = lu.lignes.map((ligne) => {
        if (ligne.defaut) {
          return { ...ligne, verdict: 'rejetee', motif: ligne.defaut.motif, colonne: ligne.defaut.colonne };
        }
        const v = verdictDeLigne(ligne.valeurs, contexte, ligne.numero_ligne);
        return { ...ligne, ...v };
      });

      const numero = await prochainNumero('reprise');
      const empreinte = createHash('sha256').update(contenu, 'utf8').digest('hex');

      // RG-020 : le journal est écrit avant que l'action soit confirmée.
      await journaliserDepuis(request, {
        action: 'reprise_deposee',
        objet_type: 'reprise',
        objet_id: numero,
        avant: null,
        apres: {
          fichier_nom: fichierNom,
          fichier_empreinte: empreinte,
          lignes_total: jugees.length,
          resume: resumeDesVerdicts(jugees),
        },
      });

      const reprise = await lireUn(request,
        `insert into reprise (numero, structure_id, nature, fichier_nom, fichier_empreinte,
                              lignes_total, statut, depose_par)
         values ($1, $2, 'bien', $3, $4, $5, 'analysee', $6)
         returning *`,
        [numero, structure.id, fichierNom, empreinte, jugees.length, request.agent.id],
      );

      for (const ligne of jugees) {
        await lireUn(request,
          `insert into reprise_ligne (reprise_id, structure_id, numero_ligne, donnees, verdict, motif, colonne)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [
            reprise.id, structure.id, ligne.numero_ligne, JSON.stringify(ligne.valeurs),
            ligne.verdict, ligne.motif ?? null, ligne.colonne ?? null,
          ],
        );
      }

      reply.code(201);
      return { ...reprise, resume: resumeDesVerdicts(jugees) };
    });
  });

  // --- La liste, bornée au périmètre -------------------------------------
  app.get('/api/reprises', {
    preHandler: lecture(),
    schema: { querystring: { type: 'object', properties: { ...schemaPagination } } },
  }, async (request) => {
    const p = pagination(request.query);
    const params = [];
    let ou = ' where true';
    ou += await clausePerimetre(request, params, 'r.structure_id');

    const total = await lireUn(request,
      `select count(*)::int as n from reprise r${ou}`, params);
    const donnees = await lireTous(request,
      `select r.*, s.code as structure_code,
              (select count(*)::int from reprise_ligne l
                where l.reprise_id = r.id and l.verdict = 'a_creer') as lignes_a_creer,
              (select count(*)::int from reprise_ligne l
                where l.reprise_id = r.id and l.verdict = 'creee') as lignes_creees,
              (select count(*)::int from reprise_ligne l
                where l.reprise_id = r.id and l.verdict = 'rejetee') as lignes_rejetees,
              (select count(*)::int from reprise_ligne l
                where l.reprise_id = r.id and l.verdict = 'doublon') as lignes_doublons
         from reprise r
         join structure s on s.id = r.structure_id${ou}
        order by r.cree_le desc
        limit ${p.parPage} offset ${p.decalage}`,
      params);

    return liste(donnees, total?.n ?? 0, p);
  });

  // --- Le détail ---------------------------------------------------------
  app.get('/api/reprises/:id', {
    preHandler: lecture(),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const reprise = await lireUn(request,
      `select r.*, s.code as structure_code from reprise r
         join structure s on s.id = r.structure_id where r.id = $1`,
      [request.params.id]);
    // Cloisonnée par la base : une reprise hors périmètre n'est pas rendue.
    // Le refus se nomme plutôt que de se dire « introuvable ».
    if (!reprise) {
      await refuserOuIntrouvable(request, 'reprise', request.params.id, 'Cette reprise');
    }
    await verifierLectureStricte(request, reprise.structure_id, 'Cette reprise');

    const lignes = await lireTous(request,
      'select verdict, count(*)::int as n from reprise_ligne where reprise_id = $1 group by verdict',
      [reprise.id]);
    const resume = { a_creer: 0, doublon: 0, rejetee: 0, creee: 0 };
    for (const l of lignes) resume[l.verdict] = l.n;

    return { ...reprise, resume };
  });

  // --- Le rapport, ligne par ligne ---------------------------------------
  app.get('/api/reprises/:id/lignes', {
    preHandler: lecture(),
    schema: {
      params: schemaIdParam,
      querystring: {
        type: 'object',
        properties: { ...schemaPagination, verdict: { type: 'string', enum: VERDICTS } },
      },
    },
  }, async (request) => {
    const reprise = await lireUn(request,
      'select id, structure_id from reprise where id = $1', [request.params.id]);
    if (!reprise) {
      await refuserOuIntrouvable(request, 'reprise', request.params.id, 'Cette reprise');
    }
    await verifierLectureStricte(request, reprise.structure_id, 'Cette reprise');

    // Par défaut, 200 lignes par page : le rapport se lit, et un agent qui
    // cherche sa ligne 148 ne doit pas paginer trois fois pour la trouver.
    const p = pagination(request.query, 200);
    const params = [reprise.id];
    let ou = ' where reprise_id = $1';
    if (request.query.verdict) {
      params.push(request.query.verdict);
      ou += ` and verdict = $${params.length}`;
    }

    const total = await lireUn(request,
      `select count(*)::int as n from reprise_ligne${ou}`, params);
    const donnees = await lireTous(request,
      `select numero_ligne, verdict, motif, colonne, donnees, bien_id
         from reprise_ligne${ou}
        order by numero_ligne
        limit ${p.parPage} offset ${p.decalage}`,
      params);

    return liste(donnees, total?.n ?? 0, p);
  });

  // --- L'application : c'est ici, et seulement ici, qu'on écrit ----------
  app.post('/api/reprises/:id/appliquer', {
    preHandler: ecriture('comptable_matieres', 'logistique', 'intendant'),
    schema: { params: schemaIdParam },
  }, async (request) => {
    const reprise = await lireUn(request,
      'select * from reprise where id = $1', [request.params.id]);
    if (!reprise) {
      await refuserOuIntrouvable(request, 'reprise', request.params.id, 'Cette reprise');
    }
    const structure = await verifierEcritureStructure(request, reprise.structure_id);

    // RG-036 — une reprise ne s'applique qu'une fois. Le verrou est aussi en
    // base (trigger `sigl_reprise_figee`) : celui-ci sert à rendre un refus
    // lisible plutôt qu'une erreur de contrainte.
    if (reprise.statut === 'appliquee') {
      throw erreur(
        'reprise_deja_appliquee',
        `La reprise ${reprise.numero} a déjà été appliquée le ${String(reprise.applique_le).slice(0, 10)}. Une seconde application doublerait le patrimoine, et rien ne distinguerait plus le doublon de l'original.`,
        'statut',
      );
    }

    return enEcriture(request, async () => {
      const aCreer = await lireTous(request,
        `select id, numero_ligne, donnees from reprise_ligne
          where reprise_id = $1 and verdict = 'a_creer' order by numero_ligne`,
        [reprise.id]);

      if (aCreer.length === 0) {
        throw erreur(
          'reprise_sans_ligne_a_creer',
          `La reprise ${reprise.numero} ne porte aucune ligne à créer : tout y est déjà au registre, ou refusé. Corrigez le fichier et redéposez-le.`,
          null,
        );
      }

      // Le contexte est relu à l'application, et non repris de l'analyse : le
      // registre a pu bouger entre les deux, et c'est l'état du moment qui
      // commande. Une ligne devenue doublon depuis l'analyse ne doit pas être
      // créée parce qu'elle était libre une heure plus tôt.
      const contexte = await contexteDeReprise(request, structure.id);

      await journaliserDepuis(request, {
        action: 'reprise_appliquee',
        objet_type: 'reprise',
        objet_id: reprise.numero,
        avant: { statut: reprise.statut },
        apres: { statut: 'appliquee', lignes_a_creer: aCreer.length },
      });

      let creees = 0;
      let devenuesDoublons = 0;
      for (const ligne of aCreer) {
        const v = verdictDeLigne(ligne.donnees, contexte, ligne.numero_ligne);
        if (v.verdict !== 'a_creer') {
          await lireUn(request,
            'update reprise_ligne set verdict = $2, motif = $3, colonne = $4 where id = $1',
            [ligne.id, v.verdict, v.motif, v.colonne]);
          devenuesDoublons += 1;
          continue;
        }
        const b = v.bien;
        // L'immatriculation portée par le fichier est reprise telle quelle :
        // c'est le point qui décide de l'adoption, car les étiquettes collées
        // sur les armoires doivent rester justes. Le SIGL n'en génère une que
        // pour un bien qui n'en avait pas, et RG-021 n'en donne pas aux lots.
        const immatriculation = b.suivi === 'individuel'
          ? (b.immatriculation || await prochaineImmatriculation(structure.code, b.categorie_code))
          : null;

        const bien = await lireUn(request,
          `insert into bien (immatriculation, categorie_code, designation, marque, modele,
                             numero_serie, classement, objectif_detention, mode_entree,
                             valeur_acquisition, valeur_acquisition_connue, date_acquisition,
                             etat, structure_id, site_id, detenteur_id, suivi, quantite)
           values ($1,$2,$3,$4,$5,$6,'immobilisation','operationnelle','achat',
                   $7,$8,$9,$10,$11,$12,$13,$14,$15)
           returning id, immatriculation`,
          [
            immatriculation, b.categorie_code, b.designation, b.marque, b.modele, b.numero_serie,
            b.valeur_acquisition, b.valeur_acquisition_connue, b.date_acquisition, b.etat,
            structure.id, b.site_id, b.detenteur_id, b.suivi, b.quantite,
          ],
        );

        // L'entrée au patrimoine est un mouvement : le registre dit tout, et
        // un bien dont on ne sait pas par quel acte il est entré ne se défend
        // pas devant un contrôle. Le motif nomme la reprise qui l'a produit.
        await lireUn(request,
          `insert into mouvement (bien_id, structure_id, type, quantite, date,
                                  structure_cible_code, motif, agent_id)
           values ($1, $2, 'entree', $3, $4, $5, $6, $7)`,
          [
            bien.id, structure.id, b.quantite, b.date_acquisition, structure.code,
            `Reprise de l'inventaire existant ${reprise.numero}, ligne ${ligne.numero_ligne}`,
            request.agent.id,
          ],
        );

        await lireUn(request,
          "update reprise_ligne set verdict = 'creee', bien_id = $2 where id = $1",
          [ligne.id, bien.id]);

        if (immatriculation) contexte.immatriculationsExistantes.add(immatriculation);
        if (b.numero_serie) contexte.seriesExistantes.add(b.numero_serie);
        contexte.empreintesExistantes.add(empreinteDeBien(b));
        creees += 1;
      }

      const majee = await lireUn(request,
        `update reprise set statut = 'appliquee', applique_le = now(), applique_par = $2
          where id = $1 returning *`,
        [reprise.id, request.agent.id]);

      const lignes = await lireTous(request,
        'select verdict, count(*)::int as n from reprise_ligne where reprise_id = $1 group by verdict',
        [reprise.id]);
      const resume = { a_creer: 0, doublon: 0, rejetee: 0, creee: 0 };
      for (const l of lignes) resume[l.verdict] = l.n;

      publier({
        type: 'application',
        objet: 'reprise',
        id: majee.id,
        structure_id: majee.structure_id,
        donnees: { numero: majee.numero, biens_crees: creees },
      });

      return { ...majee, resume, biens_crees: creees, devenues_doublons: devenuesDoublons };
    });
  });
}
