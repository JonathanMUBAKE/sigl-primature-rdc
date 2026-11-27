// Les paramètres administrables : seuils de passation, seuil de suivi
// individuel, délais d'alerte. Ils viennent de la table `parametre`, et de
// `parametre_version` quand il faut juger une décision avec les seuils d'alors
// (RG-007). Jamais d'une constante.


import { un } from '../db.js';

export const CLES = {
  seuilsPassation: ['seuils_passation', 'seuils', 'seuils_marches_publics'],
  seuilSuiviIndividuel: ['seuil_suivi_individuel', 'seuil_immatriculation_individuelle'],
  fenetreDecoupage: ['decoupage_marche', 'fenetre_decoupage_jours'],
  delaiAlerte: ['delai_alerte_jours', 'delais_alerte'],
  // Lot « réforme ». Ni le quorum de la commission ni la durée de l'offre ne
  // sont arrêtés par l'institution (`docs/LOT-REFORME.md`, « Ce qui reste à
  // trancher ») : ce sont des paramètres horodatés, lus comme les seuils de
  // passation, et non des constantes. Une valeur codée en dur aurait fait d'un
  // choix provisoire une règle du logiciel.
  commissionMembresMinimum: ['reforme.commission_membres_minimum'],
  dureeOffreReemploi: ['reemploi.duree_offre_jours'],
};

/** La valeur en vigueur d'un paramètre, par sa clé (ou la première clé trouvée). */
export async function parametre(cles, defaut = null) {
  const liste = Array.isArray(cles) ? cles : [cles];
  for (const cle of liste) {
    const ligne = await un('select valeur from parametre where cle = $1', [cle]);
    if (ligne) return ligne.valeur;
  }
  return defaut;
}

/** La valeur d'un paramètre à une date donnée, en remontant dans l'historique. */
export async function parametreALaDate(cles, date = null) {
  const liste = Array.isArray(cles) ? cles : [cles];
  if (date) {
    for (const cle of liste) {
      const version = await un(
        `select valeur from parametre_version
          where cle = $1 and en_vigueur_du <= $2
            and (en_vigueur_au is null or en_vigueur_au > $2)
          order by en_vigueur_du desc limit 1`,
        [cle, date],
      );
      if (version) return version.valeur;
    }
  }
  return parametre(liste, null);
}

/** Les seuils de passation en vigueur à la date du dossier. */
export async function seuilsPassation(date = null) {
  return parametreALaDate(CLES.seuilsPassation, date);
}

/**
 * Les mêmes seuils, **avec leur provenance** : quelle clé a été lue, et sur
 * quelle période cette version était en vigueur. C'est ce qui permet à un
 * écran — et à un contrôleur — de dire *pourquoi* une procédure s'applique :
 * « seuils du 1er janvier 2026, dossier du 14 mars 2026 ».
 *
 * Sans version datée, on rend la valeur courante en le disant franchement :
 * `en_vigueur_du` reste nul, et l'écran n'affirme pas une date qu'il n'a pas.
 */
export async function seuilsPassationDetail(date = null) {
  for (const cle of CLES.seuilsPassation) {
    if (date) {
      const version = await un(
        `select valeur, en_vigueur_du, en_vigueur_au from parametre_version
          where cle = $1 and en_vigueur_du <= $2
            and (en_vigueur_au is null or en_vigueur_au > $2)
          order by en_vigueur_du desc limit 1`,
        [cle, date],
      );
      if (version) {
        return {
          valeur: version.valeur,
          cle,
          date_reference: date,
          en_vigueur_du: version.en_vigueur_du,
          en_vigueur_au: version.en_vigueur_au,
          versionne: true,
        };
      }
    }
    const courant = await un('select valeur, maj_le from parametre where cle = $1', [cle]);
    if (courant) {
      return {
        valeur: courant.valeur,
        cle,
        date_reference: date,
        en_vigueur_du: null,
        en_vigueur_au: null,
        maj_le: courant.maj_le,
        versionne: false,
      };
    }
  }
  return {
    valeur: null, cle: null, date_reference: date,
    en_vigueur_du: null, en_vigueur_au: null, versionne: false,
  };
}

/** Le seuil au-dessus duquel un bien est suivi en individuel. */
export async function seuilSuiviIndividuel(date = null) {
  const valeur = await parametreALaDate(CLES.seuilSuiviIndividuel, date);
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur === 'object') return Number(valeur.montant ?? valeur.valeur ?? NaN);
  return Number(valeur);
}

/**
 * Un paramètre qui ne vaut qu'un nombre entier de jours ou d'unités, lu dans
 * l'historique à la date demandée. Rend `null` quand il est absent ou
 * illisible : la route **refuse alors plutôt que de deviner**, comme RG-007
 * refuse de choisir une procédure sans seuils. Inventer un quorum ou une durée
 * d'offre serait prendre à la place de l'institution une décision qu'elle n'a
 * pas prise.
 */
async function entierParametre(cles, date = null) {
  const valeur = await parametreALaDate(cles, date);
  const nombre = typeof valeur === 'object' && valeur !== null
    ? Number(valeur.valeur ?? valeur.jours ?? valeur.nombre)
    : Number(valeur);
  return Number.isFinite(nombre) && nombre > 0 ? Math.trunc(nombre) : null;
}

/**
 * Le nombre minimal de membres de la commission de réforme, et le nombre
 * minimal d'avis pour qu'elle ait conclu. La règle qui s'en sert est posée à un
 * seul endroit : `server/src/regles/commission.js`.
 */
export async function commissionMembresMinimum(date = null) {
  return entierParametre(CLES.commissionMembresMinimum, date);
}

/** La durée d'ouverture d'une offre de réemploi, en jours. */
export async function dureeOffreReemploiJours(date = null) {
  return entierParametre(CLES.dureeOffreReemploi, date);
}

/** La fenêtre, en jours, sur laquelle on cherche un découpage d'achat (RG-008). */
export async function fenetreDecoupageJours() {
  const valeur = await parametreALaDate(CLES.fenetreDecoupage, null);
  const jours = typeof valeur === 'object' && valeur !== null
    ? Number(valeur.fenetre_jours ?? valeur.jours ?? valeur.valeur)
    : Number(valeur);
  return Number.isFinite(jours) && jours > 0 ? jours : 90;
}
