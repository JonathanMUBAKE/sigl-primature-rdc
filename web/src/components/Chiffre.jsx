import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { nombre as direNombre } from '../lib/format.js'

/*
  Un chiffre clé n'est pas une carte décorative : un nombre, son libellé, et
  il se clique. Sans valeur du serveur, on montre un tiret, pas un zéro.
*/
export default function Chiffre({ valeur, libelle, appui, vers, ton, brut = false }) {
  const contenu = (
    <>
      <div className="chiffre-valeur">{brut ? (valeur ?? '—') : direNombre(valeur)}</div>
      <div className="chiffre-libelle">{libelle}</div>
      {appui ? <div className="chiffre-appui">{appui}</div> : null}
    </>
  )

  const classe = clsx('chiffre', ton && `ton-${ton}`)

  if (vers) {
    return (
      <Link className={classe} to={vers}>
        {contenu}
      </Link>
    )
  }
  return <div className={classe}>{contenu}</div>
}

export function RangeeChiffres({ children }) {
  return <div className="rangee-chiffres">{children}</div>
}
