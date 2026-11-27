/*
  Les achats, lus tels que le serveur les sert — et il a divergé du contrat.

  Deux formes cohabitent, et l'écran doit tenir les deux :
  — la forme relevée sur l'API en service : le dossier porte `seuils_appliques`
    et rien de plus ; le délai du fournisseur n'existe que sur
    `GET /api/bons-commande`, sous `delai_moyen_jours` ;
  — la forme en cours d'arrivée côté serveur : le dossier porte en plus
    `justification_procedure` (le seuil appliqué, le suivant, la date de
    référence, et si la procédure inscrite est toujours conforme), et chaque
    bon de commande un objet `fournisseur` qui distingue le délai **déclaré**
    du délai **constaté**.

  On préfère toujours ce que le serveur affirme. On ne recalcule à partir des
  seuils figés que ce qu'il ne dit pas, et on ne formule une phrase soi-même
  que pour la typographie des montants — la décision, elle, reste la sienne.
*/

import { completerEchelle, deviseDesSeuils, expliquerProcedure } from './seuils.js'
import { libelle, montantCourt } from './format.js'

/**
 * Pourquoi cette procédure s'applique à ce dossier.
 * Rend toujours la même forme, d'où que vienne l'information :
 *   { phrase, palier, suivant, echelle, devise, conforme, dateReference }
 * `phrase` vaut `null` quand rien ne permet de l'écrire : on ne devine pas.
 */
export function justificationDeProcedure(dossier) {
  if (!dossier) return null
  const devise = deviseDesSeuils(dossier.seuils_appliques)
  const jp = dossier.justification_procedure

  if (jp && typeof jp === 'object') {
    const echelle = completerEchelle(jp.echelle ?? [])
    const plancher = jp.seuil_applique === null || jp.seuil_applique === undefined
      ? null
      : Number(jp.seuil_applique)
    const suivantPlancher = jp.seuil_suivant === null || jp.seuil_suivant === undefined
      ? null
      : Number(jp.seuil_suivant)
    const palier = plancher === null
      ? null
      : echelle.find((p) => p.plancher === plancher) ?? { procedure: jp.procedure, plancher, plafond: suivantPlancher }
    const suivant = suivantPlancher === null
      ? null
      : echelle.find((p) => p.plancher === suivantPlancher) ?? {
          procedure: jp.procedure_suivante ?? null,
          plancher: suivantPlancher,
          plafond: null,
        }

    return {
      phrase: phraseDeProcedure({
        procedure: dossier.procedure ?? jp.procedure,
        montant: dossier.montant_estime ?? jp.montant_estime,
        plancher,
        suivant,
      }) ?? (typeof jp.motif === 'string' ? jp.motif : null),
      palier,
      suivant,
      echelle: echelle.length > 0 ? echelle : (expliquerProcedure({
        montant_estime: dossier.montant_estime,
        seuils: dossier.seuils_appliques,
        procedure: dossier.procedure,
      })?.echelle ?? []),
      devise,
      conforme: jp.conforme ?? null,
      dateReference: jp.date_reference ?? null,
    }
  }

  const calculee = expliquerProcedure({
    montant_estime: dossier.montant_estime,
    seuils: dossier.seuils_appliques,
    procedure: dossier.procedure,
  })
  if (!calculee) {
    return { phrase: null, palier: null, suivant: null, echelle: [], devise, conforme: null, dateReference: null }
  }
  return { ...calculee, conforme: null, dateReference: null }
}

function phraseDeProcedure({ procedure, montant, plancher, suivant }) {
  if (!procedure) return null
  const valeur = Number(montant)
  const montantDit = Number.isFinite(valeur) ? montantCourt(valeur) : null
  const debut = montantDit
    ? `La procédure « ${libelle(procedure)} » s'applique parce que le montant estimé, ${montantDit},`
    : `La procédure « ${libelle(procedure)} » s'applique parce que le montant estimé`
  if (plancher !== null && plancher > 0 && suivant) {
    return `${debut} atteint le seuil de ${montantCourt(plancher)} sans atteindre celui de ${montantCourt(suivant.plancher)}, à partir duquel « ${libelle(suivant.procedure)} » serait exigée.`
  }
  if (plancher !== null && plancher > 0) {
    return `${debut} atteint le seuil de ${montantCourt(plancher)}, le plus haut de l'échelle en vigueur à la date du dossier.`
  }
  if (suivant) {
    return `${debut} reste sous le premier seuil, ${montantCourt(suivant.plancher)}, à partir duquel « ${libelle(suivant.procedure)} » serait exigée.`
  }
  return null
}

/**
 * Le délai du fournisseur, et d'où il vient.
 * Le **constaté** est un fait — la moyenne des livraisons passées ; le
 * **déclaré** est une promesse. On montre le constaté quand le serveur le
 * donne, et on dit toujours lequel des deux on affiche.
 */
export function delaiDuFournisseur(bon) {
  const f = bon?.fournisseur ?? {}
  const constate = premierNombre(f.delai_constate_jours, bon?.fournisseur_delai_constate_jours)
  if (constate !== null) {
    return {
      jours: constate,
      nature: 'constate',
      note: 'Délai constaté',
      livraisons: premierNombre(f.livraisons_constatees, bon?.fournisseur_livraisons_constatees) ?? 0,
      ecart: premierNombre(f.ecart_delai_jours),
    }
  }
  const declare = premierNombre(
    f.delai_declare_jours,
    bon?.fournisseur_delai_declare_jours,
    bon?.delai_moyen_jours,
  )
  if (declare !== null) {
    return { jours: declare, nature: 'declare', note: 'Délai déclaré', livraisons: 0, ecart: null }
  }
  return { jours: null, nature: 'absent', note: 'Délai non servi', livraisons: 0, ecart: null }
}

/** Le nom du fournisseur, quelle que soit la forme servie. */
export function nomDuFournisseur(bon) {
  return bon?.fournisseur?.denomination ?? bon?.fournisseur_nom ?? null
}

/** En liste noire ? RG-009 interdit tout bon de commande vers lui. */
export function enListeNoire(bon) {
  return Boolean(bon?.fournisseur?.liste_noire ?? bon?.liste_noire)
}

function premierNombre(...valeurs) {
  for (const valeur of valeurs) {
    if (valeur === null || valeur === undefined || valeur === '') continue
    const n = Number(valeur)
    if (Number.isFinite(n)) return n
  }
  return null
}

export default { justificationDeProcedure, delaiDuFournisseur, nomDuFournisseur, enListeNoire }
