import clsx from 'clsx'
import { libelle as direLibelle } from '../lib/format.js'

/*
  Un état est une pastille : une couleur ET son libellé, jamais une couleur
  seule. La couleur découle du code métier du contrat, section 2.
*/
const TONS = {
  // bien.etat
  neuf: 'succes',
  bon: 'succes',
  a_reparer: 'attente',
  en_maintenance: 'attente',
  hors_service: 'critique',
  perdu: 'critique',
  reforme: 'neutre',
  // etat_besoin.statut
  brouillon: 'neutre',
  vise: 'info',
  recu: 'info',
  examine: 'info',
  partiel: 'attente',
  rejete: 'critique',
  en_achat: 'info',
  livrable: 'attente',
  livre: 'succes',
  clos: 'neutre',
  // ligne_besoin.origine
  stock: 'info',
  achat: 'attente',
  refuse: 'critique',
  // alerte.statut
  ouverte: 'critique',
  en_examen: 'attente',
  justifiee: 'succes',
  confirmee: 'critique',
  classee: 'neutre',
  // alerte.gravite — information, attention, critique
  information: 'info',
  attention: 'attente',
  critique: 'critique',
  // stock.criticite
  rupture: 'critique',
  sous_minimum: 'attente',
  rupture_prevue: 'attente',
  normal: 'succes',
  // dossier_achat.statut
  ouvert: 'info',
  en_consultation: 'attente',
  attribue: 'info',
  execute: 'succes',
  annule: 'neutre',
  // bon_commande.statut — « payable » et « payé » sont des fins heureuses,
  // « livré en partie » demande une instruction de l'écart.
  emis: 'attente',
  receptionne: 'info',
  livre_partiel: 'attente',
  payable: 'succes',
  paye: 'neutre',
  // structure.regime
  integre: 'info',
  autonome: 'attente',
  // classement
  immobilisation: 'info',
}

export default function Pastille({ valeur, ton, texte, titre }) {
  if (valeur === null || valeur === undefined || valeur === '') {
    if (!texte) return <span className="texte-note">—</span>
  }
  const tonRetenu = ton ?? TONS[String(valeur)] ?? 'neutre'
  return (
    <span className={clsx('pastille', `ton-${tonRetenu}`)} title={titre}>
      <span className="pastille-point" aria-hidden="true" />
      {texte ?? direLibelle(valeur)}
    </span>
  )
}
