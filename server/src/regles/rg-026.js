// RG-026 — Qui constate un écart ne le tranche pas. Séparation des fonctions.
//
// Même invariant que RG-002 pour le visa d'un état de besoin : qui demande ne
// vise pas, qui constate ne décide pas. Celui qui a relevé l'anomalie sur le
// terrain est la personne la moins bien placée pour en arrêter la suite — c'est
// sa propre constatation qu'il validerait.
//
// La règle ne vise que l'arbitrage. L'explication, elle, est précisément
// attendue du détenteur, y compris quand c'est lui qui a constaté (art. 122).

export function rg026({ constate_par, tranche_par } = {}) {
  if (constate_par && tranche_par && String(constate_par) === String(tranche_par)) {
    return {
      code: 'RG-026',
      message:
        "Faites trancher cet écart par un autre agent : celui qui a porté le constat ne décide pas de sa suite.",
      champ: 'tranche_par',
    };
  }
  return null;
}
