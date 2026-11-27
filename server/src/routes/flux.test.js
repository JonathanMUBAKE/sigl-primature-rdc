// Le flux temps réel : la forme des événements, la reprise après coupure, et
// surtout le filtrage par structure — le RLS ne protège pas un flux.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  publier, depuis, dansPerimetre, dansPerimetreOrdinaire, estPublie,
  chargePubliee, CHAMPS_PUBLIES, OBJETS_PUBLIES, bus,
} from './_flux.js';

test('flux — un événement porte type, objet, id, structure et horodatage', () => {
  const recus = [];
  const ecouter = (e) => recus.push(e);
  bus.on('evenement', ecouter);
  const e = publier({ type: 'sortie', objet: 'stock', id: 'st-1', structure_id: 'sgp', quantite: 12 });
  bus.removeListener('evenement', ecouter);

  assert.equal(e.objet, 'stock');
  assert.equal(e.type, 'sortie');
  assert.equal(e.quantite, 12);
  assert.ok(e.sequence > 0);
  assert.match(e.horodatage, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(recus, [e]);
});

test('flux — la reprise rend ce qui a été manqué depuis une séquence', () => {
  const premier = publier({ type: 'creation', objet: 'besoin', id: 'b-1', structure_id: 'sgp' });
  const second = publier({ type: 'visa', objet: 'besoin', id: 'b-1', structure_id: 'sgp' });
  const manques = depuis(premier.sequence).map((e) => e.sequence);
  assert.ok(manques.includes(second.sequence));
  assert.ok(!manques.includes(premier.sequence));
  assert.deepEqual(depuis('pas-un-nombre'), []);
});

test('flux — le filtrage par structure vaut aussi pour le flux', () => {
  const evenement = { objet: 'stock', structure_id: 'armp' };
  // Portée totale : tout passe.
  assert.equal(dansPerimetre(evenement, null), true);
  // Portée limitée : seulement son périmètre.
  assert.equal(dansPerimetre(evenement, ['armp']), true);
  assert.equal(dansPerimetre(evenement, ['sgp', 'cab']), false);
  // Un événement sans structure ne part jamais vers une portée limitée.
  assert.equal(dansPerimetre({ objet: 'achat', structure_id: null }, ['sgp']), false);
  assert.equal(dansPerimetre({ objet: 'achat', structure_id: null }, null), true);
});

// ---------------------------------------------------------------------------
// L'exception des publications. Décision du chef de projet du 27 novembre 2026.
//
// `offre_reemploi` est la seule table du SIGL lisible hors périmètre, parce
// qu'une offre que les autres structures ne voient pas est une étape qui
// n'existe pas. Son flux doit suivre sa politique de lecture : un flux qui
// filtrerait là où la table ne filtre pas serait une incohérence, et une offre
// qu'on ne découvre qu'en rechargeant une liste n'est pas publiée.
//
// **La seconde moitié de chaque essai est la plus importante** : c'est elle qui
// empêche l'exception de s'élargir toute seule un jour.

test('flux — une offre de réemploi atteint une structure qui n’est pas la sienne', () => {
  const offre = { objet: 'reemploi', type: 'offre_ouverte', structure_id: 'cgig' };
  assert.equal(
    dansPerimetre(offre, ['sgg']), true,
    "l'offre de la CGIG doit atteindre le flux du SGG : c'est l'objet économique du lot",
  );
  assert.equal(dansPerimetre(offre, ['cgig']), true, 'et celui de son origine, évidemment');
  assert.equal(dansPerimetre(offre, []), true, 'même une portée vide la reçoit : elle publie');
});

test('flux — mais un dossier de réforme reste cloisonné : l’exception ne s’élargit pas', () => {
  // Le dossier, la commission et les avis sont l'instruction interne d'une
  // structure. Si cet essai tombe, c'est que l'exception a débordé.
  for (const type of ['creation', 'avis', 'conclusion', 'saisine', 'decision_domaines']) {
    const dossier = { objet: 'reforme', type, structure_id: 'cgig' };
    assert.equal(
      dansPerimetre(dossier, ['sgg']), false,
      `un événement reforme/${type} de la CGIG ne doit pas atteindre le SGG`,
    );
  }
  // Et aucun autre objet du SIGL n'entre dans l'exception.
  for (const objet of ['patrimoine', 'stock', 'besoin', 'document', 'alerte', 'inventaire', 'rapprochement', 'reforme']) {
    assert.equal(
      dansPerimetre({ objet, structure_id: 'cgig' }, ['sgg']), false,
      `l'objet ${objet} doit rester cloisonné`,
    );
    assert.equal(estPublie({ objet }), false);
  }
  assert.deepEqual(OBJETS_PUBLIES, ['reemploi'], 'un seul objet publié, et il est nommé');
});

test('flux — le périmètre ordinaire reste ce qu’il était, exception comprise', () => {
  // `dansPerimetreOrdinaire` ne connaît pas l'exception : c'est lui qui dit si
  // l'agent a droit à la charge entière, et il ne doit pas se laisser attendrir
  // par l'objet de l'événement.
  const offre = { objet: 'reemploi', structure_id: 'cgig' };
  assert.equal(dansPerimetreOrdinaire(offre, ['sgg']), false);
  assert.equal(dansPerimetreOrdinaire(offre, ['cgig']), true);
  assert.equal(dansPerimetreOrdinaire(offre, null), true);
});

test('flux — hors périmètre, une offre ne porte que ce qu’elle publie', () => {
  const evenement = publier({
    type: 'reemploi_prononce',
    objet: 'reemploi',
    id: 'o-1',
    structure_id: 'cgig',
    donnees: {
      // Ce que l'offre publie : la copie publiée, résolue à l'ouverture.
      numero: 'OR-2026-00004',
      offre: 'OR-2026-00004',
      statut: 'close',
      bien: 'BRT-CGIG-INF-00042',
      bien_designation: 'Groupe électrogène de secours',
      bien_etat: 'hors_service',
      structure_origine_code: 'CGIG',
      structure_origine_nom: 'Cellule de Gestion des Immeubles du Gouvernement',
      jours_restants: 0,
      // Ce qu'elle ne publie pas, et qui ne doit pas sortir.
      dossier: 'DR-2026-00011',
      structure_demandeuse: 'Secrétariat Général du Gouvernement',
      structure_beneficiaire: 'Secrétariat Général du Gouvernement',
      acte: 'AT/2026/0007',
      detenteur_id: 'ag-1',
      demandes_pendantes: 2,
      valeur_acquisition: 4350000,
    },
  });

  const sortant = chargePubliee(evenement);
  // L'identifiant et la structure restent : ils désignent l'offre, que tout le
  // monde a le droit de relire.
  assert.equal(sortant.id, 'o-1');
  assert.equal(sortant.structure_id, 'cgig');
  assert.equal(sortant.objet, 'reemploi');
  assert.equal(sortant.sequence, evenement.sequence);

  assert.equal(sortant.donnees.numero, 'OR-2026-00004');
  assert.equal(sortant.donnees.bien_designation, 'Groupe électrogène de secours');
  assert.equal(sortant.donnees.structure_origine_nom, evenement.donnees.structure_origine_nom);

  for (const fuite of [
    'dossier', 'structure_demandeuse', 'structure_beneficiaire', 'acte',
    'detenteur_id', 'demandes_pendantes', 'valeur_acquisition',
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(sortant.donnees, fuite), false,
      `« ${fuite} » n'est pas publié par l'offre et ne doit pas sortir par le flux`,
    );
  }
  // La liste est une **autorisation** : rien d'autre ne passe, même ce qu'on
  // n'a pas pensé à interdire.
  assert.ok(Object.keys(sortant.donnees).every((c) => CHAMPS_PUBLIES.includes(c)));
  // Et l'événement d'origine n'est pas abîmé : le périmètre d'origine le lit
  // entier.
  assert.equal(evenement.donnees.structure_beneficiaire, 'Secrétariat Général du Gouvernement');
});

test('flux — un événement publié sans charge part tel quel', () => {
  // C'est le cas de ceux que le déclencheur de la base émet : ils ne portent
  // que l'identité de la ligne qui a bougé.
  const nu = { type: 'modification', objet: 'reemploi', id: 'd-1', structure_id: 'cgig' };
  assert.equal(chargePubliee(nu), nu);
  assert.deepEqual(chargePubliee({ ...nu, donnees: null }), { ...nu, donnees: null });
});

