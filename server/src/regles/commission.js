// La commission de réforme : son quorum et sa majorité, **à un seul endroit**.
//
// POURQUOI UN SEUL ENDROIT. `docs/LOT-REFORME.md` le dit franchement : la
// composition de la commission n'est pas arrêtée. Combien de membres, désignés
// par qui, et quelle majorité pour un avis — à défaut d'arrêté connu, le lot
// prend trois membres et la majorité des membres ayant émis un avis, « et la
// règle posée à un seul endroit pour être renversée à peu de frais ». Le jour
// où l'institution tranchera, c'est ce fichier qu'on change, et rien d'autre.
//
// Le nombre, lui, n'est pas ici : il vient du paramètre horodaté
// `reforme.commission_membres_minimum`, comme les seuils de passation viennent
// de `parametre`. Une constante aurait fait d'un choix provisoire une règle du
// logiciel.
//
// Fonctions pures : elles reçoivent les lignes déjà chargées.

/**
 * Où en est la commission, et ce qu'elle a conclu.
 *
 * `membres` : les lignes de `membre_commission`.
 * `avis`    : les lignes d'`avis_commission`.
 * `membres_minimum` : le paramètre, qui sert **deux fois** — comme nombre
 *   minimal de membres désignés, et comme nombre minimal d'avis rendus. Le
 *   second point est le quorum : avec trois membres désignés et un seul avis,
 *   la « majorité des membres ayant émis un avis » serait la voix d'un seul,
 *   ce qui viderait la collégialité de son sens.
 *
 * `sens` est l'avis de la commission : `favorable`, `defavorable`, ou `null`
 * tant qu'elle n'a pas conclu — y compris sur une égalité de voix, où elle n'a
 * tout simplement pas de majorité et où il faut un avis de plus.
 */
export function avisDeLaCommission({ membres = [], avis = [], membres_minimum = null } = {}) {
  const minimum = Number(membres_minimum);
  const minimumConnu = Number.isFinite(minimum) && minimum > 0;

  const favorables = avis.filter((a) => a.avis === 'favorable').length;
  const defavorables = avis.filter((a) => a.avis === 'defavorable').length;

  const quorumMembres = minimumConnu ? membres.length >= minimum : false;
  const quorumAvis = minimumConnu ? avis.length >= minimum : false;

  // La règle de majorité, et elle est écrite une fois : la majorité des membres
  // ayant émis un avis. L'égalité ne fait pas majorité.
  let majorite = null;
  if (favorables > defavorables) majorite = 'favorable';
  else if (defavorables > favorables) majorite = 'defavorable';

  const conclu = quorumMembres && quorumAvis && majorite !== null;

  return {
    membres_minimum: minimumConnu ? minimum : null,
    membres: membres.length,
    avis_rendus: avis.length,
    favorables,
    defavorables,
    quorum_membres: quorumMembres,
    quorum_avis: quorumAvis,
    majorite,
    conclu,
    // Le statut que le dossier prend quand la commission a conclu, et `null`
    // tant qu'elle n'a pas conclu. C'est ici, et nulle part ailleurs, que
    // l'avis de la commission devient un état du dossier.
    statut_du_dossier: conclu ? (majorite === 'favorable' ? 'examine' : 'rejete') : null,
  };
}

/**
 * Ce qui manque à la commission pour conclure, dit en français, ou `null`
 * quand elle a conclu. L'écran l'affiche tel quel ; il ne le recalcule pas.
 */
export function manqueALaCommission(etat) {
  if (!etat) return 'La commission n’a pas encore été réunie.';
  if (etat.membres_minimum === null) {
    return "Le paramètre « reforme.commission_membres_minimum » n'est pas renseigné : demandez à l'administrateur de le poser, le serveur ne devine pas un quorum.";
  }
  if (!etat.quorum_membres) {
    const reste = etat.membres_minimum - etat.membres;
    return `Désignez encore ${reste} membre${reste > 1 ? 's' : ''} : la commission en compte ${etat.membres} sur les ${etat.membres_minimum} requis.`;
  }
  if (!etat.quorum_avis) {
    const reste = etat.membres_minimum - etat.avis_rendus;
    return `Recueillez encore ${reste} avis : ${etat.avis_rendus} sur ${etat.membres_minimum} ont été rendus.`;
  }
  if (etat.majorite === null) {
    return `Les avis s'équilibrent (${etat.favorables} favorables, ${etat.defavorables} défavorables) : il faut un avis de plus pour qu'une majorité se dégage.`;
  }
  return null;
}
