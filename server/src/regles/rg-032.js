// RG-032 — La décision des domaines s'enregistre et ne se prononce pas : elle
// porte son autorité, sa référence et sa date.
// Décret 13/050 : « la cession et la mise au rebut des biens d'actif relèvent
// de la compétence de l'administration en charge des domaines privés et publics
// de l'État ». RG-016, qu'on n'assouplit pas d'un pouce.
//
// COMMENT UNE RÈGLE PEUT EMPÊCHER UN LOGICIEL DE DÉCIDER. On ne l'empêche pas
// en interdisant un bouton : on l'empêche en rendant la décision
// **inenregistrable sans son auteur**. Les trois champs exigés ici — qui a
// décidé, par quel acte, à quelle date — n'ont de sens que si la décision a été
// prise ailleurs. Une décision sans autorité nommée serait une décision prise
// par le SIGL, et c'est exactement ce que RG-016 interdit. La règle s'appuie
// donc sur elle : elle lui passe la main d'abord, et ne juge la forme de
// l'enregistrement qu'ensuite.
//
// `suite` est ce que l'administration a décidé, et les trois valeurs couvrent
// le champ : `cession` (le bien est vendu ou cédé), `rebut` (il est détruit),
// `refus` (les domaines refusent la réforme — le bien **revient au service**,
// et c'est une issue que le circuit doit savoir enregistrer).

import { rg016 } from './rg-016.js';

export const SUITES = ['cession', 'rebut', 'refus'];

const vide = (valeur) => (valeur ?? '').toString().trim().length === 0;

export function rg032({
  autorite, reference, date_acte, suite,
  action = 'enregistrer_decision_domaines',
} = {}) {
  // RG-016 d'abord : si l'action demandée est de prononcer la cession ou la
  // mise au rebut, rien de ce qui suit n'a à être examiné.
  const interdite = rg016({ action });
  if (interdite) return interdite;

  if (vide(autorite)) {
    return {
      code: 'RG-032',
      message:
        "Nommez l'autorité qui a pris la décision : le SIGL enregistre la décision des domaines, il ne la prend pas. Sans autorité nommée, il n'y a pas de décision à enregistrer.",
      champ: 'autorite',
    };
  }
  if (vide(reference)) {
    return {
      code: 'RG-032',
      message:
        "Portez la référence de l'acte des domaines : c'est elle qui rattache l'écriture du SIGL à une décision réelle et vérifiable.",
      champ: 'reference',
    };
  }
  if (!date_acte) {
    return {
      code: 'RG-032',
      message:
        "Portez la date de l'acte : la date du jour n'est pas celle de la décision, et c'est la seconde qui compte au registre.",
      champ: 'date_acte',
    };
  }
  if (!SUITES.includes(suite)) {
    return {
      code: 'RG-032',
      message:
        "Indiquez la suite donnée par les domaines : « cession », « rebut » ou « refus ». Un refus ramène le bien au service.",
      champ: 'suite',
    };
  }
  return null;
}
