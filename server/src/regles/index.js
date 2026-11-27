// Les 33 règles de gestion de la section 3 du contrat, en un seul point d'entrée.
// Toutes pures : elles reçoivent les données déjà chargées et rendent null ou
// { code, message, champ }.

export { rg001 } from './rg-001.js';
export { rg002 } from './rg-002.js';
export { rg003 } from './rg-003.js';
export { rg004 } from './rg-004.js';
export { rg005 } from './rg-005.js';
export { rg006 } from './rg-006.js';
export { rg007 } from './rg-007.js';
export { rg008 } from './rg-008.js';
export { rg009 } from './rg-009.js';
export { rg010 } from './rg-010.js';
export { rg011 } from './rg-011.js';
export { rg012 } from './rg-012.js';
export { rg013, estPieceOuEntretien } from './rg-013.js';
export { rg014, baseEvaluationAttendue } from './rg-014.js';
export { rg015 } from './rg-015.js';
export { rg016 } from './rg-016.js';
export { rg017 } from './rg-017.js';
export { rg018 } from './rg-018.js';
export { rg019 } from './rg-019.js';
export { rg020, estSensible, ACTIONS_SENSIBLES } from './rg-020.js';
export { rg021, suiviAttendu } from './rg-021.js';
export { rg022 } from './rg-022.js';
export { rg023, restantsAConstater } from './rg-023.js';
export { rg024, ecartsNonTranches } from './rg-024.js';
export { rg025 } from './rg-025.js';
export { rg026 } from './rg-026.js';
export { rg027, attestationsManquantes, QUALITES_PARTIE } from './rg-027.js';
export { rg028, demandesPendantes } from './rg-028.js';
export { rg029 } from './rg-029.js';
export { rg030 } from './rg-030.js';
export { rg031, AVIS } from './rg-031.js';
export { rg032, SUITES } from './rg-032.js';
export { rg033, ROUTE_DU_CIRCUIT } from './rg-033.js';

// Le quorum et la majorité de la commission de réforme : posés à un seul
// endroit, pour être renversés à peu de frais quand l'institution tranchera.
export { avisDeLaCommission, manqueALaCommission } from './commission.js';

// Les dates dans les messages. Le seul endroit où une date devient du texte
// dans une règle : les refus sont affichés tels quels par l'interface, et un
// `Date.toString()` tronqué y avait écrit « jusqu'au Wed Dec 16 ».
export { dateEnFrancais, mentionDeDate } from './dates.js';

export { normaliserSeuils, procedurePourMontant, plancherFranchi, rangProcedure, PROCEDURES } from './seuils.js';
export * from './roles.js';
