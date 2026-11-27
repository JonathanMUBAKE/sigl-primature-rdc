import { useId } from 'react'
import clsx from 'clsx'

/*
  Un champ de formulaire : libellé, aide, erreur sous le champ.
  `type="zone"` donne un textarea, `type="choix"` un select.
*/
export default function Champ({
  libelle,
  valeur,
  surChangement,
  type = 'text',
  options = [],
  aide,
  erreur,
  obligatoire = false,
  desactive = false,
  placeholder,
  lignes = 4,
  min,
  max,
  pas,
  enCellule = false,
}) {
  const id = useId()
  const idAide = `${id}-aide`
  const idErreur = `${id}-erreur`
  const decrit = clsx(aide && idAide, erreur && idErreur) || undefined

  const communs = {
    id,
    className: 'champ-saisie',
    value: valeur ?? '',
    onChange: (e) => surChangement?.(e.target.value),
    disabled: desactive,
    'aria-describedby': decrit,
    'aria-invalid': erreur ? true : undefined,
    required: obligatoire,
  }

  return (
    <div className={clsx('champ', erreur && 'est-en-erreur', enCellule && 'est-en-cellule')}>
      <label className="champ-libelle" htmlFor={id}>
        {libelle}
        {obligatoire ? (
          <span className="champ-obligatoire" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {type === 'zone' ? (
        <textarea {...communs} rows={lignes} placeholder={placeholder} />
      ) : type === 'choix' ? (
        <select {...communs}>
          <option value="">— choisir —</option>
          {options.map((option) => (
            <option key={option.valeur} value={option.valeur}>
              {option.libelle}
            </option>
          ))}
        </select>
      ) : (
        <input {...communs} type={type} placeholder={placeholder} min={min} max={max} step={pas} />
      )}

      {aide ? (
        <span className="champ-aide" id={idAide}>
          {aide}
        </span>
      ) : null}
      {erreur ? (
        <span className="champ-erreur" id={idErreur}>
          {erreur}
        </span>
      ) : null}
    </div>
  )
}
