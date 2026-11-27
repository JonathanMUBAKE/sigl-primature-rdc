// RG-023 — Une campagne d'inventaire ne se clôt pas tant qu'un bien de son
// périmètre n'a pas été constaté. Décret 13/050 art. 120.
//
// L'inventaire est « établi à dates fixes » : ce n'est pas un échantillon. Une
// campagne close sur un périmètre incomplet produirait un état d'inventaire qui
// affirme plus qu'il n'a vu, et c'est précisément ce que l'art. 120 interdit.
//
// La règle est pure : elle juge deux décomptes, que la route a calculés sur le
// périmètre arrêté de la campagne (structure, site éventuel, et date arrêtée).

/** Combien de biens du périmètre restent à constater. Jamais négatif. */
export function restantsAConstater({ biens_du_perimetre, constates } = {}) {
  const attendus = Number(biens_du_perimetre ?? 0) || 0;
  const faits = Number(constates ?? 0) || 0;
  return Math.max(attendus - faits, 0);
}

export function rg023({ biens_du_perimetre, constates } = {}) {
  const restants = restantsAConstater({ biens_du_perimetre, constates });
  if (restants === 0) return null;
  return {
    code: 'RG-023',
    message:
      `Constatez les ${restants} bien${restants > 1 ? 's' : ''} qui rest${restants > 1 ? 'ent' : 'e'} du périmètre avant de clore : `
      + "un inventaire arrêté à une date fixe couvre tout son périmètre, et celui-ci n'est pas complet.",
    champ: 'statut',
  };
}
