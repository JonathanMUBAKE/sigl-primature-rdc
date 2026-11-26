import { useId } from 'react'
import { compte as direCompte } from '../lib/format.js'

/*
  Les filtres d'un écran de liste, et le compte de résultats à droite.

  Un filtre : { cle, libelle, valeur, options: [{ valeur, libelle }], toutes? }
*/
export function Filtre({ libelle, valeur, options, surChangement, toutes = 'Toutes' }) {
  const id = useId()
  return (
    <div className="filtre">
      <label className="filtre-libelle" htmlFor={id}>
        {libelle}
      </label>
      <select
        id={id}
        className="filtre-choix"
        value={valeur ?? ''}
        onChange={(e) => surChangement(e.target.value)}
      >
        <option value="">{toutes}</option>
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function Filtres({ children, total, nom = 'résultat', nomPluriel, note }) {
  return (
    <div className="barre-outils">
      {children}
      <div className="compte-resultats">
        {typeof total === 'number' ? direCompte(total, nom, nomPluriel) : null}
        {note ? <span> · {note}</span> : null}
      </div>
    </div>
  )
}
