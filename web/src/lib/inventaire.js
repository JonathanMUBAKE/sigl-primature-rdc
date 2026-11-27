/*
  L'inventaire physique et le rapprochement contradictoire, côté écran.

  Ce fichier ne calcule aucune règle. Il ne fait que trois choses :
  — lire ce que le serveur rend, là où il le rend, sans rien inventer ;
  — dire en français ce qui attend, et NOMMER qui doit agir ;
  — ordonner la file d'attente par ancienneté, celle que le serveur donne
    (`anciennete_jours`), jamais une ancienneté recalculée ici.

  Les deux verdicts de clôture — celui de la campagne (RG-023, RG-024) et
  celui du rapprochement (RG-027) — sont **calculés par le serveur** et lus
  tels quels. Quand le serveur ne les rend pas, on ne les devine pas : on
  grise l'action et on dit que le verdict manque.

  Fondements : décret 13/050 du 6 février 2013, art. 120 (inventaires à dates
  fixes), art. 122 (le détenteur atteste les biens qui lui sont affectés),
  art. 123 (rapprochements périodiques contradictoires).
*/

/** Qui doit agir, à chaque étape. Les droits, eux, sont tenus par le serveur. */
export const ACTEURS = {
  preparation: 'Comptable des matières',
  constat: 'Opérateurs désignés, magasinier ou comptable des matières',
  explication: 'Détenteur du bien, ou agent désigné « détenteur » de la campagne',
  decision: 'Comptable des matières ou chargé de logistique centrale',
  cloture: 'Comptable des matières',
  attestation: 'Comptable des matières et comptable général',
}

const CHAMPS_AVANCEMENT = [
  'biens_du_perimetre',
  'constates',
  'conformes',
  'ecarts',
  'introuvables',
  'restants',
  'taux',
]

/**
 * L'avancement d'une campagne, tel que le serveur le rend.
 * Il est servi dans `avancement` par `GET /api/campagnes-inventaire/:id` ; sur
 * une ligne de liste, on l'accepte aussi à plat. Absent, il vaut `null` — et
 * l'écran montre un tiret, pas un zéro.
 */
export function avancementDe(source) {
  if (!source || typeof source !== 'object') return null
  const objet = source.avancement && typeof source.avancement === 'object' ? source.avancement : source
  const retenu = {}
  let trouve = false
  for (const champ of CHAMPS_AVANCEMENT) {
    const valeur = objet[champ]
    retenu[champ] = typeof valeur === 'number' ? valeur : null
    if (retenu[champ] !== null) trouve = true
  }
  return trouve ? retenu : null
}

/**
 * Le verdict de clôture, lu là où le contrat le pose.
 * Campagne : `clotures_possible`. Rapprochement : `cloture_possible`. Les deux
 * orthographes sont acceptées de part et d'autre, pour qu'une couture décalée
 * ne fasse pas disparaître le motif du serveur. Rien n'est recalculé : sans
 * verdict, l'action reste grisée et on dit pourquoi.
 */
export function verdictDeCloture(detail, defaut) {
  const brut = detail?.clotures_possible ?? detail?.cloture_possible ?? null
  if (!brut || typeof brut !== 'object' || typeof brut.possible !== 'boolean') {
    return {
      possible: false,
      motif:
        defaut ??
        "Le serveur n'a pas dit si la clôture est possible : l'action reste fermée tant que son verdict manque.",
      servi: false,
    }
  }
  return { possible: brut.possible, motif: brut.motif ?? null, servi: true }
}

/** Un écart n'est pas réglé tant qu'il n'est pas tranché par un humain. */
export function estEnAttente(ecart) {
  return ecart?.statut === 'constate' || ecart?.statut === 'explique'
}

/**
 * Ce qu'un écart attend, et de qui. Rien d'autre que la lecture de `statut` :
 * RG-025 (pas de décision sans explication) et RG-026 (qui constate ne
 * tranche pas) sont tenues par le serveur, qui refuse et le dit.
 */
export function tacheDeLEcart(ecart) {
  if (ecart?.statut === 'constate') {
    return {
      quoi: 'Attend l’explication du détenteur',
      acteur: ACTEURS.explication,
      regle: 'RG-025 — un écart ne se tranche qu’après l’explication du détenteur',
      ton: 'critique',
    }
  }
  if (ecart?.statut === 'explique') {
    return {
      quoi: 'Expliqué : attend la décision',
      acteur: ACTEURS.decision,
      regle: 'RG-026 — qui constate un écart ne le tranche pas',
      ton: 'attente',
    }
  }
  return null
}

/**
 * Ce qu'une campagne attend, et de qui — d'après son statut et les écarts que
 * le serveur a servis. On énonce des faits ; on ne prononce jamais le verdict
 * de clôture, qui n'appartient qu'au serveur.
 */
export function tacheDeLaCampagne(campagne, ecarts = [], avancementServi = null) {
  const enAttente = ecarts.filter(estEnAttente)
  const aExpliquer = enAttente.filter((e) => e.statut === 'constate').length
  const aTrancher = enAttente.filter((e) => e.statut === 'explique').length

  if (campagne?.statut === 'close') {
    return { quoi: 'Rien : la campagne est close.', acteur: null, ton: 'succes' }
  }
  if (campagne?.statut === 'preparee') {
    return {
      quoi: 'Désigner les agents, puis ouvrir la campagne.',
      acteur: ACTEURS.preparation,
      ton: 'attente',
    }
  }
  if (aExpliquer > 0) {
    return {
      quoi: `${aExpliquer} écart(s) attendent l’explication du détenteur.`,
      acteur: ACTEURS.explication,
      ton: 'critique',
    }
  }
  if (aTrancher > 0) {
    return {
      quoi: `${aTrancher} écart(s) sont expliqués et attendent une décision.`,
      acteur: ACTEURS.decision,
      ton: 'attente',
    }
  }
  // Le détail du serveur pose `avancement` À CÔTÉ de `campagne`, pas dedans :
  // l'appelant le passe alors lui-même. Sur une ligne de liste, il est porté
  // par la ligne, et c'est elle qu'on lit.
  const avancement = avancementServi ?? avancementDe(campagne)
  if (avancement?.restants !== null && avancement?.restants !== undefined && avancement.restants > 0) {
    return {
      quoi: `${avancement.restants} bien(s) du périmètre ne sont pas encore constatés.`,
      acteur: ACTEURS.constat,
      ton: 'attente',
    }
  }
  // On s'arrête là : dire que la clôture est possible serait prononcer RG-023
  // et RG-024 à la place du serveur. On décrit ce qu'on voit, rien de plus.
  return {
    quoi: 'Aucun écart n’attend, et aucun bien du périmètre ne reste signalé comme non constaté.',
    acteur: ACTEURS.cloture,
    ton: 'succes',
  }
}

/**
 * La file d'attente : les écarts non tranchés, les plus anciens d'abord.
 * L'ancienneté est celle du serveur (`anciennete_jours`) ; un écart qui ne la
 * porte pas passe en queue, et l'écran le dit plutôt que de la supposer.
 */
export function fileDAttente(ecarts = []) {
  return ecarts.filter(estEnAttente).sort((a, b) => {
    const va = typeof a.anciennete_jours === 'number' ? a.anciennete_jours : -1
    const vb = typeof b.anciennete_jours === 'number' ? b.anciennete_jours : -1
    if (vb !== va) return vb - va
    // À ancienneté égale, l'écart qui attend une explication passe devant :
    // c'est lui qui bloque la suite du circuit.
    const pa = a.statut === 'constate' ? 0 : 1
    const pb = b.statut === 'constate' ? 0 : 1
    return pa - pb
  })
}

/** Une attente longue se voit : au-delà de ce seuil, la ligne est signalée. */
export const SEUIL_ANCIENNETE = 10

export function attendDepuisTropLongtemps(ecart) {
  return (
    estEnAttente(ecart) &&
    typeof ecart?.anciennete_jours === 'number' &&
    ecart.anciennete_jours >= SEUIL_ANCIENNETE
  )
}

/** Le libellé d'une campagne pour un fil d'Ariane ou un titre de ligne. */
export function nomDeLaCampagne(campagne) {
  if (!campagne) return null
  const numero = campagne.numero ? String(campagne.numero) : null
  const libelle = campagne.libelle ? String(campagne.libelle) : null
  return [numero, libelle].filter(Boolean).join(' — ') || null
}

/*
  Les totaux d'un rapprochement : `GET /api/rapprochements/:id` les rend dans
  `totaux` — valeur_matieres, valeur_generale, ecart. Sur une ligne de liste,
  on les accepte aussi à plat. Absents, ils valent `null`.
*/
const CHAMPS_TOTAUX = ['valeur_matieres', 'valeur_generale', 'ecart']

export function totauxDe(source) {
  if (!source || typeof source !== 'object') return null
  const objet = source.totaux && typeof source.totaux === 'object' ? source.totaux : source
  const retenu = {}
  let trouve = false
  for (const champ of CHAMPS_TOTAUX) {
    const valeur = objet[champ]
    retenu[champ] = valeur === null || valeur === undefined || valeur === '' ? null : valeur
    if (retenu[champ] !== null) trouve = true
  }
  return trouve ? retenu : null
}

/** Une partie a-t-elle attesté ? C'est `atteste_le` qui le dit, rien d'autre. */
export function aAtteste(partie) {
  return Boolean(partie?.atteste_le)
}

/** Le nom d'un agent, où que le serveur le pose. */
export function nomDeLAgent(ligne) {
  return ligne?.nom ?? ligne?.agent_nom ?? null
}

export function fonctionDeLAgent(ligne) {
  return ligne?.fonction ?? ligne?.agent_fonction ?? null
}
