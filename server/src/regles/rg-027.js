// RG-027 — Un rapprochement n'est clos qu'attesté par les deux parties.
// Décret 13/050 art. 123 : « des rapprochements périodiques **contradictoires**
// sont effectués entre les données de la comptabilité des matières et celles de
// la comptabilité générale de l'État ».
//
// « Contradictoire » est le mot qui porte la règle. Un rapprochement signé d'un
// seul côté n'est pas un rapprochement : c'est une déclaration. Les deux
// comptables attestent, chacun pouvant porter sa réserve — la réserve n'empêche
// pas l'attestation, elle est au contraire ce que le contradictoire conserve.

export const QUALITES_PARTIE = ['comptable_matieres', 'comptable_general'];

const LIBELLES = {
  comptable_matieres: 'le comptable des matières',
  comptable_general: 'le comptable général',
};

/** Les qualités qui n'ont pas attesté — absentes de la table ou muettes. */
export function attestationsManquantes(parties = []) {
  const liste = Array.isArray(parties) ? parties : [];
  return QUALITES_PARTIE.filter((qualite) => {
    const partie = liste.find((p) => p?.qualite === qualite);
    return !partie || !partie.atteste_le;
  });
}

export function rg027({ parties } = {}) {
  const manquantes = attestationsManquantes(parties);
  if (manquantes.length === 0) return null;
  const noms = manquantes.map((q) => LIBELLES[q] ?? q);
  return {
    code: 'RG-027',
    message:
      `Faites attester ce rapprochement par ${noms.join(' et ')} avant de le clore : `
      + "l'art. 123 veut un rapprochement contradictoire, et un seul côté ne contredit personne.",
    champ: 'parties',
  };
}
