// RG-030 — Qui propose la réforme ne siège pas à la commission qui l'examine.
// Séparation des fonctions.
//
// Même invariant que RG-002 pour le visa d'un état de besoin et RG-026 pour
// l'arbitrage d'un écart : qui demande ne vise pas, qui constate ne tranche
// pas, qui propose ne juge pas sa propre proposition. Le détenteur qui se lasse
// d'un matériel est la personne la moins bien placée pour dire qu'il est
// inutilisable pour toute la Primature — c'est précisément ce que la commission
// est là pour vérifier.
//
// La règle vise les deux gestes, parce qu'ils vaudraient la même chose : être
// désigné membre, et rendre un avis. Un proposant désigné « secrétaire » qui
// rendrait ensuite un avis aurait contourné la règle en deux temps.

export function rg030({ propose_par, agent_id } = {}) {
  if (propose_par && agent_id && String(propose_par) === String(agent_id)) {
    return {
      code: 'RG-030',
      message:
        "Faites examiner ce dossier par d'autres agents : celui qui a proposé la réforme ne siège pas à la commission et n'y rend pas d'avis.",
      champ: 'agent_id',
    };
  }
  return null;
}
