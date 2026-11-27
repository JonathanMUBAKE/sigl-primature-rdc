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

/** La fenêtre, en jours, sur laquelle on cherche un découpage d'achat (RG-008). */
export async function fenetreDecoupageJours() {
  const valeur = await parametreALaDate(CLES.fenetreDecoupage, null);
  const jours = typeof valeur === 'object' && valeur !== null
    ? Number(valeur.fenetre_jours ?? valeur.jours ?? valeur.valeur)
    : Number(valeur);
  return Number.isFinite(jours) && jours > 0 ? jours : 90;
}
