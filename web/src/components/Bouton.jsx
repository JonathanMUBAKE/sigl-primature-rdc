import { Link } from 'react-router-dom'
import clsx from 'clsx'

/*
  Allures : neutre (défaut), principale, danger, discrete.
  Tailles : normale, petite.
*/
export default function Bouton({
  children,
  allure = 'neutre',
  taille = 'normale',
  icone: Icone,
  vers,
  surClic,
  type = 'button',
  desactive = false,
  titre,
}) {
  const classe = clsx(
    'bouton',
    allure !== 'neutre' && `allure-${allure}`,
    taille === 'petite' && 'taille-petite',
  )

  const contenu = (
    <>
      {Icone ? <Icone size={15} aria-hidden="true" /> : null}
      {children}
    </>
  )

  if (vers && !desactive) {
    return (
      <Link className={classe} to={vers} title={titre}>
        {contenu}
      </Link>
    )
  }

  return (
    <button className={classe} type={type} onClick={surClic} disabled={desactive} title={titre}>
      {contenu}
    </button>
  )
}
