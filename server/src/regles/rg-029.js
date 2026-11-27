// RG-029 — Un bien sous offre de réemploi ouverte ne se réforme pas.
// `docs/LOT-REFORME.md` ; CONCEPTION §13.
//
// La règle tient les deux bouts d'un même principe : **la réforme et l'offre
// ouverte ne coexistent jamais**.
//
//   1. Tant qu'une offre court, le bien n'avance pas vers la réforme. Une
//      structure qui lit l'offre et prépare sa demande ne doit pas découvrir le
//      lendemain que le bien est parti au rebut avant le terme annoncé.
//
//   2. Et réciproquement : un bien dont le dossier est saisi ou clos — dont le
//      procès-verbal de réforme est donc figé et transmis aux domaines — ne se
//      réemploie plus. C'est le cas réel que cette règle attrape : une offre
//      close sur une demande restée pendante, la saisine prononcée, puis
//      quelqu'un qui tranche la vieille demande en l'acceptant. Le bien
//      passerait à une autre structure alors qu'il est déjà sous PV. Sans cette
//      seconde moitié, le registre et le procès-verbal se contrediraient.
//
// `offre` est l'offre portant sur le bien, ou `null`. `dossier_statut` et
// `etat_bien` décrivent l'autre bout. Les trois sont facultatifs : la règle ne
// parle que de ce qu'on lui donne.

import { mentionDeDate } from './dates.js';

const STATUTS_SOUS_PV = ['saisi', 'clos'];

export function rg029({ offre = null, dossier_statut = null, etat_bien = null } = {}) {
  if (offre && offre.statut === 'ouverte') {
    // La date passe par `mentionDeDate`, et pas par une troncature de
    // `Date.toString()` : ce message est affiché tel quel par l'interface, et
    // c'est ainsi qu'il avait fini par annoncer « jusqu'au Wed Dec 16 ».
    const terme = mentionDeDate("jusqu'au", offre.cloture_prevue_le);
    return {
      code: 'RG-029',
      message:
        `Ce bien est offert au réemploi${terme} : attendez le terme de l'offre ${offre.numero ?? ''} ou clôturez-la avant de poursuivre la réforme. Une structure peut encore le reprendre.`
          .replace(/\s{2,}/g, ' '),
      champ: 'statut',
    };
  }
  if (STATUTS_SOUS_PV.includes(dossier_statut) || etat_bien === 'reforme') {
    return {
      code: 'RG-029',
      message:
        "Ce bien est déjà sous procès-verbal de réforme et les domaines sont saisis : il ne se réemploie plus. L'offre et la réforme ne coexistent pas.",
      champ: 'statut',
    };
  }
  return null;
}
