/*
  Le circuit de réforme et l'offre de réemploi, côté écran.

  Ce fichier ne juge rien et ne calcule rien. Il fait trois choses :
  — lire ce que le serveur rend, là où le contrat GELÉ le pose, sans rien
    inventer et sans renommer un champ ;
  — dire en français ce qu'une étape attend, et NOMMER qui doit agir ;
  — refuser de deviner : sans verdict servi, l'action reste fermée et l'écran
    dit que le verdict manque.

  L'avancement du circuit vient du serveur, dans `etapes` — sept étapes,
  chacune { numero, libelle, etat, le, par_nom } avec
  etat ∈ faite | courante | a_venir | sautee. Si l'interface le recalculait,
  elle en détiendrait l'autorité et les deux jugements finiraient par diverger.

  Les trois verdicts d'action — `offre_possible`, `saisine_possible`,
  `decision_possible` — sont des { possible, code, motif } du serveur. Le
  bouton se grise d'après `possible` et le motif est affiché TEL QUEL : RG-028,
  RG-029, RG-030, RG-031 et RG-032 ne sont réimplémentées nulle part ici.

  Fondements : décret 13/050 du 6 février 2013 — la cession et la mise au rebut
  relèvent de l'administration en charge des domaines (RG-016) ; contrat du lot
  dans `docs/LOT-REFORME.md`.
*/

/** Qui tient chaque étape. Les droits, eux, sont tenus par le serveur. */
export const ACTEURS = {
  proposition: 'Détenteur du bien, magasinier ou comptable des matières',
  commission: 'Membres désignés à la commission, hors celui qui a proposé',
  offre: 'Chargé de logistique centrale',
  demande: 'Chef de structure, magasinier ou comptable des matières de la structure demandeuse',
  arbitrage: 'Chargé de logistique centrale',
  saisine: 'Chargé de logistique centrale',
  domaines: 'Administration des domaines — le SIGL enregistre, il ne prononce pas',
}

/** Les rôles que le serveur attend pour chaque geste — §5, « Droits ». */
export const ROLES_DE_PROPOSITION = ['detenteur', 'magasinier', 'comptable_matieres']
export const ROLES_DE_LOGISTIQUE = ['logistique']
export const ROLES_DE_DEMANDE = ['chef_structure', 'magasinier', 'comptable_matieres']

/** Les statuts d'un dossier de réforme — contrat technique §5. */
export const STATUTS_DOSSIER = [
  { valeur: 'propose', libelle: 'Proposé' },
  { valeur: 'examine', libelle: 'Examiné par la commission' },
  { valeur: 'rejete', libelle: 'Rejeté — le bien reste en service' },
  { valeur: 'offert', libelle: 'Offert au réemploi' },
  { valeur: 'reemploye', libelle: 'Réemployé — clos sans réforme' },
  { valeur: 'saisi', libelle: 'Domaines saisis' },
  { valeur: 'clos', libelle: 'Clos — décision enregistrée' },
]

/** L'avis de la commission — RG-031 : un motif, favorable comme défavorable. */
export const AVIS = [
  { valeur: 'favorable', libelle: 'Favorable — le bien est inutilisable' },
  { valeur: 'defavorable', libelle: 'Défavorable — le bien reste en service' },
]

/*
  La qualité d'un membre de la commission. Le contrat gèle la route et le corps
  — { agent_id, qualite } — mais la composition de la commission est une
  décision ouverte du lot : « combien de membres, désignés par qui, et quelle
  majorité ». Ces trois valeurs sont donc une proposition de l'interface, pas
  un acquis du contrat, et elles sont posées ICI, à un seul endroit.
*/
export const QUALITES_COMMISSION = [
  { valeur: 'president', libelle: 'Président — il conduit la commission' },
  { valeur: 'rapporteur', libelle: 'Rapporteur — il rédige l’avis' },
  { valeur: 'secretaire', libelle: 'Secrétaire — il tient la séance' },
  { valeur: 'membre', libelle: 'Membre' },
]

/** Trancher une demande de réemploi : accepter, c'est faire l'acte. */
export const DECISIONS_DEMANDE = [
  {
    // Le verbe, pas l'état : la route attend `accepte` / `ecarte`, et c'est la
    // demande qui passe ensuite à `acceptee` / `ecartee`.
    valeur: 'accepte',
    libelle: 'Accepter — prononcer le réemploi',
    effet:
      'Accepter, c’est faire l’acte : un seul geste et une seule transaction — le bien est transféré par un mouvement de réemploi, un acte de transfert est émis, l’offre est close, les autres demandes sont écartées d’office et le dossier passe à « réemployé », clos sans réforme.',
  },
  {
    valeur: 'ecarte',
    libelle: 'Écarter la demande',
    effet:
      'La demande est écartée, avec son motif. L’offre reste ouverte pour les autres structures jusqu’à sa clôture.',
  },
]

/** La suite d'une décision des domaines — enregistrée, jamais prononcée. */
export const SUITES_DOMAINES = [
  { valeur: 'cession', libelle: 'Cession — le bien est cédé' },
  { valeur: 'rebut', libelle: 'Mise au rebut' },
  { valeur: 'refus', libelle: 'Refus — les domaines n’ont pas suivi la saisine' },
]

const ETATS_ETAPE = new Set(['faite', 'courante', 'a_venir', 'sautee'])

/**
 * Les étapes du circuit, telles que le serveur les rend dans `etapes`.
 * Rien n'est déduit : une liste absente ou hors forme vaut `[]`, et l'écran
 * dit alors que l'avancement n'est pas servi plutôt que de le reconstituer.
 */
export function etapesDe(detail) {
  const brut = Array.isArray(detail?.etapes) ? detail.etapes : null
  if (!brut) return []
  return brut
    .filter((etape) => etape && typeof etape === 'object')
    .map((etape, index) => ({
      numero: typeof etape.numero === 'number' ? etape.numero : index + 1,
      libelle: etape.libelle ?? null,
      etat: ETATS_ETAPE.has(String(etape.etat)) ? String(etape.etat) : null,
      le: etape.le ?? null,
      par_nom: etape.par_nom ?? null,
    }))
}

/** L'étape courante, s'il y en a une. Le serveur seul la désigne. */
export function etapeCourante(etapes = []) {
  return etapes.find((etape) => etape.etat === 'courante') ?? null
}

/**
 * Un verdict d'action du serveur : `offre_possible`, `saisine_possible`,
 * `decision_possible`. Lu tel quel, jamais recalculé. Sans verdict servi,
 * l'action reste fermée — et on le dit, au lieu de l'ouvrir par optimisme.
 */
export function verdictDe(detail, cle) {
  const brut = detail?.[cle] ?? null
  if (!brut || typeof brut !== 'object' || typeof brut.possible !== 'boolean') {
    return {
      possible: false,
      code: null,
      motif: `Le serveur n'a pas dit si cette action est possible (« ${cle} » n'est pas servi) : elle reste fermée tant que son verdict manque.`,
      servi: false,
    }
  }
  return {
    possible: brut.possible,
    code: brut.code ?? null,
    motif: brut.motif ?? null,
    servi: true,
  }
}

/** Le motif d'un refus, dit avec son code de règle quand il y en a un. */
export function motifDuVerdict(verdict) {
  if (!verdict) return null
  if (verdict.possible) return null
  return verdict.code ? `${verdict.code} — ${verdict.motif ?? ''}`.trim() : verdict.motif
}

/*
  Les champs d'une LIGNE de liste de dossiers ne sont pas gelés par le contrat,
  qui ne décrit que le détail. On lit donc chaque valeur à deux ou trois noms
  plausibles, ici et nulle part ailleurs : le jour où le serveur arrête son
  nom, une seule ligne change. Aucun nom n'est inventé pour l'affichage : ce
  qui n'est pas servi reste vide, et l'écran montre un tiret.
*/
export function bienDuDossier(ligne) {
  if (!ligne || typeof ligne !== 'object') return {}
  const bien = ligne.bien && typeof ligne.bien === 'object' ? ligne.bien : {}
  return {
    id: ligne.bien_id ?? bien.id ?? null,
    immatriculation: ligne.bien_immatriculation ?? ligne.immatriculation ?? bien.immatriculation ?? null,
    designation: ligne.bien_designation ?? ligne.designation ?? bien.designation ?? null,
    categorie_code: ligne.bien_categorie_code ?? ligne.categorie_code ?? bien.categorie_code ?? null,
    etat: ligne.bien_etat ?? bien.etat ?? null,
    structure_nom: ligne.structure_nom ?? bien.structure_nom ?? null,
    structure_code: ligne.structure_code ?? bien.structure_code ?? null,
    site_nom: ligne.site_nom ?? bien.site_nom ?? null,
  }
}

/**
 * Le bien d'un dossier, lu des deux endroits où le détail le pose : l'objet
 * `bien` que `GET /api/dossiers-reforme/:id` rend à côté du dossier, et la
 * ligne du dossier elle-même. On préfère ce qui est servi ; ce qui manque des
 * deux côtés reste vide, et l'écran montre un tiret.
 */
export function bienDuDetail(detail) {
  const parLeDossier = bienDuDossier(detail?.dossier ?? {})
  const parLObjet = bienDuDossier({ bien: detail?.bien ?? {} })
  const retenu = {}
  for (const cle of Object.keys(parLeDossier)) {
    retenu[cle] = parLObjet[cle] ?? parLeDossier[cle]
  }
  return retenu
}

/** Le nom d'un dossier pour un titre ou un fil d'Ariane. */
export function nomDuDossier(dossier) {
  if (!dossier) return null
  const numero = dossier.numero ? String(dossier.numero) : null
  const bien = bienDuDossier(dossier)
  return [numero, bien.designation].filter(Boolean).join(' — ') || null
}

/*
  Ce que publie une offre de réemploi. CES NOMS SONT GELÉS par le contrat :
  l'offre porte sa propre copie de ce qu'elle publie, et on la lit sur l'offre.
  Aller chercher le bien serait aller chercher une table cloisonnée, qui rend
  null hors périmètre — l'offre serait alors vidée de son contenu par une
  politique de sécurité correcte.
*/
export function offrePubliee(offre) {
  if (!offre || typeof offre !== 'object') return {}
  return {
    id: offre.id ?? null,
    statut: offre.statut ?? null,
    designation: offre.bien_designation ?? null,
    immatriculation: offre.bien_immatriculation ?? null,
    categorie_code: offre.bien_categorie_code ?? null,
    etat: offre.bien_etat ?? null,
    structure_origine_code: offre.structure_origine_code ?? null,
    structure_origine_nom: offre.structure_origine_nom ?? null,
    site_origine_nom: offre.site_origine_nom ?? null,
    cloture_prevue_le: offre.cloture_prevue_le ?? null,
  }
}

/*
  Le motif de la proposition. La table le nomme `motif_proposition` ; on admet
  `motif` par prudence, si la route le renomme en chemin.
*/
export function motifDeLaProposition(dossier) {
  return dossier?.motif_proposition ?? dossier?.motif ?? null
}

/**
 * La décision des domaines, lue des deux endroits possibles : l'objet
 * `decision` que le détail peut rendre, ou les quatre colonnes que le dossier
 * porte — `decision_autorite`, `decision_reference`, `decision_date`,
 * `decision_suite`. Elles n'auraient aucun sens si la décision était prise
 * ici : elles ne servent qu'à ENREGISTRER un acte pris ailleurs (RG-016).
 * Sans autorité ni référence, il n'y a pas de décision : on rend `null`.
 */
export function decisionDuDetail(detail) {
  const dossier = detail?.dossier ?? null
  const brut = detail?.decision && typeof detail.decision === 'object' ? detail.decision : {}
  const decision = {
    autorite: brut.autorite ?? brut.decision_autorite ?? dossier?.decision_autorite ?? null,
    reference: brut.reference ?? brut.decision_reference ?? dossier?.decision_reference ?? null,
    date_acte: brut.date_acte ?? brut.decision_date ?? dossier?.decision_date ?? null,
    suite: brut.suite ?? brut.decision_suite ?? dossier?.decision_suite ?? null,
    enregistre_le:
      brut.enregistree_le ?? brut.enregistre_le ?? brut.cree_le ?? dossier?.close_le ?? null,
    par_nom: brut.par_nom ?? brut.enregistre_par_nom ?? null,
  }
  return decision.autorite || decision.reference || decision.suite ? decision : null
}

/**
 * Où en est la commission, tel que le serveur le dit dans `commission_etat` :
 * membres désignés, avis rendus, favorables, défavorables, quorum, majorité,
 * et `manque` — la phrase qui dit ce qui manque encore. **Aucun de ces
 * chiffres n'est recompté ici** : « 2 avis sur 3 » est une phrase du serveur,
 * et la règle de majorité vit à un seul endroit, chez lui.
 */
export function etatDeLaCommission(detail) {
  const brut = detail?.commission_etat
  if (!brut || typeof brut !== 'object') return null
  return brut
}

/** Le PV de réforme, figé à la saisine (RG-019). Null tant qu'il n'existe pas. */
export function pvDuDossier(detail) {
  const pv = detail?.pv
  return pv && typeof pv === 'object' ? pv : null
}

/** Une offre « ouverte » est un fait, pas une alerte : elle ne rougit pas. */
export function tonDuStatutOffre(statut) {
  if (statut === 'ouverte') return 'info'
  if (statut === 'close') return 'neutre'
  return undefined
}

/** Une demande non tranchée attend quelqu'un. */
export function estDeposee(demande) {
  return demande?.statut === 'deposee'
}

/**
 * Ce que le dossier attend, et de qui — d'après l'étape COURANTE servie par le
 * serveur, et rien d'autre. On n'énonce jamais qu'une action est possible :
 * cela n'appartient qu'au serveur, qui le dit dans ses trois verdicts.
 */
export function tacheDuDossier(dossier, etapes = []) {
  const courante = etapeCourante(etapes)
  if (courante) {
    return {
      quoi: courante.libelle ?? `Étape ${courante.numero}`,
      acteur: acteurDeLEtape(courante.numero),
      ton: 'attente',
    }
  }
  if (dossier?.statut === 'reemploye') {
    return {
      quoi: 'Rien : le bien a été réemployé et le dossier est clos sans réforme.',
      acteur: null,
      ton: 'succes',
    }
  }
  if (dossier?.statut === 'rejete') {
    return {
      quoi: 'Rien : la commission a donné un avis défavorable, le bien reste en service.',
      acteur: null,
      ton: 'neutre',
    }
  }
  if (dossier?.statut === 'clos') {
    return {
      quoi: 'Rien : la décision des domaines est enregistrée.',
      acteur: null,
      ton: 'neutre',
    }
  }
  return {
    quoi: 'Le serveur ne désigne aucune étape courante pour ce dossier.',
    acteur: null,
    ton: 'neutre',
  }
}

/** Qui tient l'étape numéro N — les sept étapes du lot, dans l'ordre. */
export function acteurDeLEtape(numero) {
  const acteurs = {
    1: ACTEURS.proposition,
    2: ACTEURS.commission,
    3: ACTEURS.offre,
    4: ACTEURS.demande,
    5: ACTEURS.arbitrage,
    6: ACTEURS.saisine,
    7: ACTEURS.domaines,
  }
  return acteurs[Number(numero)] ?? null
}
