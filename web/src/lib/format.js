/*
  Mises en forme — français de la République démocratique du Congo.
  Les montants sont en francs congolais (CDF), stockés en numeric(18,2) :
  ils arrivent souvent sous forme de chaîne, on les accepte telles quelles.
*/

const LOCALE = 'fr-CD'

const nombreEntier = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const nombreDecimal = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const dateCourte = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const dateLongue = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const dateHeure = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export const ABSENT = '—'

function versNombre(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null
  const n = typeof valeur === 'number' ? valeur : Number(String(valeur).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** 1 250 000 */
export function nombre(valeur) {
  const n = versNombre(valeur)
  return n === null ? ABSENT : nombreEntier.format(n)
}

/** 1 250 000,00 */
export function decimal(valeur) {
  const n = versNombre(valeur)
  return n === null ? ABSENT : nombreDecimal.format(n)
}

/** 1 250 000,00 FC — francs congolais, sans arrondi silencieux */
export function montant(valeur) {
  const n = versNombre(valeur)
  return n === null ? ABSENT : `${nombreDecimal.format(n)} FC`
}

/** 1 250 000 FC — pour les tableaux denses */
export function montantCourt(valeur) {
  const n = versNombre(valeur)
  return n === null ? ABSENT : `${nombreEntier.format(Math.round(n))} FC`
}

function versDate(valeur) {
  if (!valeur) return null
  const d = valeur instanceof Date ? valeur : new Date(valeur)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 05/03/2026 */
export function date(valeur) {
  const d = versDate(valeur)
  return d ? dateCourte.format(d) : ABSENT
}

/** 5 mars 2026 */
export function dateEnClair(valeur) {
  const d = versDate(valeur)
  return d ? dateLongue.format(d) : ABSENT
}

/** 05/03/2026 14:32 */
export function horodatage(valeur) {
  const d = versDate(valeur)
  return d ? dateHeure.format(d) : ABSENT
}

/** « il y a 3 jours », « dans 2 heures » */
export function depuis(valeur) {
  const d = versDate(valeur)
  if (!d) return ABSENT
  const secondes = Math.round((d.getTime() - Date.now()) / 1000)
  const echelles = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [2592000, 'day'],
    [31536000, 'month'],
    [Infinity, 'year'],
  ]
  const diviseurs = { second: 1, minute: 60, hour: 3600, day: 86400, month: 2592000, year: 31536000 }
  const absolu = Math.abs(secondes)
  const unite = echelles.find(([borne]) => absolu < borne)[1]
  const relatif = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
  return relatif.format(Math.round(secondes / diviseurs[unite]), unite)
}

/** 12 jours — un nombre de jours dit en français */
export function jours(valeur) {
  const n = versNombre(valeur)
  if (n === null) return ABSENT
  const arrondi = Math.round(n)
  return `${nombreEntier.format(arrondi)} ${Math.abs(arrondi) <= 1 ? 'jour' : 'jours'}`
}

/** 42 % */
export function pourcentage(valeur, decimales = 0) {
  const n = versNombre(valeur)
  if (n === null) return ABSENT
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: decimales }).format(n)} %`
}

/** « 3 biens », « 1 bien » */
export function compte(n, singulier, pluriel = `${singulier}s`) {
  const v = versNombre(n) ?? 0
  return `${nombreEntier.format(v)} ${Math.abs(v) <= 1 ? singulier : pluriel}`
}

/** Les valeurs d'énumération du contrat, dites en français. */
const LIBELLES = {
  // bien.etat
  neuf: 'Neuf',
  bon: 'Bon état',
  a_reparer: 'À réparer',
  hors_service: 'Hors service',
  en_maintenance: 'En maintenance',
  reforme: 'Réformé',
  perdu: 'Perdu',
  // bien.classement
  immobilisation: 'Immobilisation',
  stock: 'Stock',
  // bien.objectif_detention
  operationnelle: 'Détention opérationnelle',
  financiere: 'Détention financière',
  // bien.mode_entree
  achat: 'Achat',
  don: 'Don',
  transfert: 'Transfert',
  // bien.suivi
  individuel: 'Suivi individuel',
  lot: 'Suivi par lot',
  // etat_besoin.statut
  brouillon: 'Brouillon',
  vise: 'Visé',
  recu: 'Reçu',
  examine: 'Examiné',
  partiel: 'Accordé en partie',
  rejete: 'Rejeté',
  en_achat: 'En achat',
  livrable: 'Livrable',
  livre: 'Livré',
  clos: 'Clos',
  // ligne_besoin.origine
  refuse: 'Refusé',
  // mouvement.type
  entree: 'Entrée',
  sortie: 'Sortie',
  maintenance: 'Mise en maintenance',
  retour_maintenance: 'Retour de maintenance',
  perte: 'Perte',
  declassement: 'Déclassement',
  reemploi: 'Réemploi',
  // dossier_achat.procedure
  gre_a_gre: 'Gré à gré',
  consultation: 'Consultation restreinte',
  aon: "Appel d'offres national",
  aoi: "Appel d'offres international",
  // alerte.statut
  ouverte: 'Ouverte',
  en_examen: 'En examen',
  justifiee: 'Justifiée',
  confirmee: 'Confirmée',
  classee: 'Classée',
  // alerte.gravite
  basse: 'Basse',
  moyenne: 'Moyenne',
  haute: 'Haute',
  critique: 'Critique',
  // structure.regime
  integre: 'Intégrée',
  autonome: 'Autonome',
  // structure.type
  cabinet: 'Cabinet',
  secretariat_general: 'Secrétariat général',
  cellule: 'Cellule',
  etablissement_public: 'Établissement public',
  service: 'Service',
  // document.type
  etat_besoin: 'État de besoin',
  decision_examen: "Décision d'examen",
  bon_commande: 'Bon de commande',
  pv_reception: 'PV de réception',
  certificat_prise_en_charge: 'Certificat de prise en charge',
  bon_livraison: 'Bon de livraison',
  accuse_reception: 'Accusé de réception',
  acte_transfert: 'Acte de transfert',
  pv_perte: 'PV de perte',
  pv_reforme: 'PV de réforme',
  etat_inventaire: "État d'inventaire",
  // rôles
  demandeur: 'Agent demandeur',
  chef_structure: 'Chef de structure',
  comptable_matieres: 'Comptable des matières',
  magasinier: 'Magasinier',
  logistique: 'Chargé de logistique centrale',
  intendant: 'Intendant général',
  ordonnateur: 'Ordonnateur',
  controle_budget: 'Contrôleur de budget',
  comptable_public: 'Comptable public',
  direction: 'Direction',
  controle_externe: 'Contrôle externe',
  admin: 'Administrateur',
}

/** Dit une valeur d'énumération en français ; à défaut, la rend lisible. */
export function libelle(code) {
  if (code === null || code === undefined || code === '') return ABSENT
  const cle = String(code)
  if (LIBELLES[cle]) return LIBELLES[cle]
  const mot = cle.replaceAll('_', ' ')
  return mot.charAt(0).toUpperCase() + mot.slice(1)
}

/** Texte vide ou absent → tiret cadratin. */
export function texte(valeur) {
  if (valeur === null || valeur === undefined) return ABSENT
  const t = String(valeur).trim()
  return t === '' ? ABSENT : t
}

export default {
  ABSENT,
  nombre,
  decimal,
  montant,
  montantCourt,
  date,
  dateEnClair,
  horodatage,
  depuis,
  jours,
  pourcentage,
  compte,
  libelle,
  texte,
}
