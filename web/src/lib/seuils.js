/*
  Les seuils de passation, lus pour être expliqués.

  RG-007 : la procédure découle du montant estimé et des seuils en vigueur à la
  date du dossier. **C'est le serveur qui décide** — il range la procédure dans
  `dossier_achat.procedure` et conserve, à côté, les seuils qu'il a appliqués ce
  jour-là dans `seuils_appliques`. Une décision prise hier reste donc jugeable
  avec les seuils d'hier.

  Ce fichier ne décide rien : il relit ces mêmes seuils pour dire à l'agent
  **pourquoi** la procédure s'applique. Rien n'est codé en dur ; sans
  `seuils_appliques`, on ne devine pas, on le dit.

  Forme reçue du serveur, telle qu'observée :
    { gre_a_gre: 0, consultation: 30000000, aon: 180000000, aoi: 1800000000,
      devise: 'CDF' }
*/

import { libelle, montantCourt } from './format.js'

const PROCEDURES = ['gre_a_gre', 'consultation', 'aon', 'aoi']

/** Range des paliers du plus bas au plus haut et leur donne leur plafond. */
export function completerEchelle(paliers) {
  const brut = (Array.isArray(paliers) ? paliers : [])
    .map((p) => ({ procedure: p.procedure ?? p.code, plancher: Number(p.plancher ?? p.seuil) }))
    .filter((p) => PROCEDURES.includes(p.procedure) && Number.isFinite(p.plancher))
    .sort((a, b) => a.plancher - b.plancher)
  return brut.map((palier, i) => ({
    ...palier,
    plafond: i + 1 < brut.length ? brut[i + 1].plancher : null,
  }))
}

/** L'échelle des seuils, du plus bas au plus haut, avec son plafond. */
export function echelleDesSeuils(seuils) {
  if (!seuils || typeof seuils !== 'object') return []
  if (Array.isArray(seuils)) return completerEchelle(seuils)
  return completerEchelle(
    Object.entries(seuils).map(([procedure, plancher]) => ({ procedure, plancher })),
  )
}

/** La devise déclarée avec les seuils ; francs congolais à défaut (contrat §1). */
export function deviseDesSeuils(seuils) {
  return typeof seuils?.devise === 'string' && seuils.devise !== '' ? seuils.devise : 'CDF'
}

/**
 * Pourquoi cette procédure s'applique, dit en une phrase.
 * `procedure` est celle que le serveur a retenue : on l'explique, on ne la
 * recalcule pas. Rend `null` quand les seuils manquent — on ne devine pas.
 */
export function expliquerProcedure({ montant_estime, seuils, procedure }) {
  const echelle = echelleDesSeuils(seuils)
  if (echelle.length === 0) return null

  const palier = echelle.find((p) => p.procedure === procedure) ?? null
  const suivant = palier && palier.plafond !== null
    ? echelle.find((p) => p.plancher === palier.plafond) ?? null
    : null

  const montant = Number(montant_estime)
  const montantDit = Number.isFinite(montant) ? montantCourt(montant) : null

  let phrase = null
  if (palier) {
    const debut = montantDit
      ? `La procédure « ${libelle(procedure)} » s'applique parce que le montant estimé, ${montantDit},`
      : `La procédure « ${libelle(procedure)} » s'applique parce que le montant estimé`
    if (palier.plancher > 0 && suivant) {
      phrase = `${debut} atteint le seuil de ${montantCourt(palier.plancher)} sans atteindre celui de ${montantCourt(suivant.plancher)}, à partir duquel « ${libelle(suivant.procedure)} » serait exigée.`
    } else if (palier.plancher > 0) {
      phrase = `${debut} atteint le seuil de ${montantCourt(palier.plancher)}, le plus haut de l'échelle en vigueur à la date du dossier.`
    } else if (suivant) {
      phrase = `${debut} reste sous le premier seuil, ${montantCourt(suivant.plancher)}, à partir duquel « ${libelle(suivant.procedure)} » serait exigée.`
    } else {
      phrase = `${debut} se situe dans le seul palier déclaré.`
    }
  }

  return {
    echelle,
    palier,
    suivant,
    devise: deviseDesSeuils(seuils),
    phrase,
  }
}

/** Le palier qu'un montant atteint, pour expliquer un cumul (RG-008). */
export function palierAtteint(montant, seuils) {
  const echelle = echelleDesSeuils(seuils)
  const valeur = Number(montant)
  if (!Number.isFinite(valeur)) return null
  let retenu = null
  for (const palier of echelle) if (valeur >= palier.plancher) retenu = palier
  return retenu
}

export default { completerEchelle, echelleDesSeuils, deviseDesSeuils, expliquerProcedure, palierAtteint }
