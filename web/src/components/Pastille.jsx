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
  // alerte.gravite
  basse: 'neutre',
  moyenne: 'attente',
  haute: 'critique',
  critique: 'critique',
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
