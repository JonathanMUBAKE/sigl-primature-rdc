import { ChevronLeft, ChevronRight } from 'lucide-react'
import Bouton from './Bouton.jsx'
import { compte as direCompte, nombre } from '../lib/format.js'

/*
  La pagination d'un écran de liste. Elle ne compte rien elle-même : `total`,
  `page` et `parPage` sont ceux du serveur, tels qu'il les rend dans
  { donnees, total, page, parPage }. Le nombre de pages est une division de ces
  trois nombres — une mise en forme, pas un chiffre métier.

  Sans total servi, aucune page n'est annoncée : les deux flèches restent là,
  et le compte reste muet plutôt que de mentir.
*/
export default function Pagination({ page = 1, parPage = 50, total, nom = 'résultat', nomPluriel, surPage }) {
  const totalServi = typeof total === 'number' ? total : null
  const taille = typeof parPage === 'number' && parPage > 0 ? parPage : 50
  const pageCourante = typeof page === 'number' && page > 0 ? page : 1
  const pages = totalServi === null ? null : Math.max(1, Math.ceil(totalServi / taille))

  // Une seule page et rien de plus à dire : la barre ne prend pas la place.
  if (pages !== null && pages <= 1) return null

  const premier = (pageCourante - 1) * taille + 1
  const dernier = totalServi === null ? null : Math.min(totalServi, pageCourante * taille)

  return (
    <div className="pagination">
      <span className="pagination-dit">
        {pages === null
          ? `Page ${nombre(pageCourante)}`
          : `Page ${nombre(pageCourante)} sur ${nombre(pages)}`}
        {dernier === null
          ? null
          : ` · ${nombre(premier)} à ${nombre(dernier)} sur ${direCompte(totalServi, nom, nomPluriel)}`}
      </span>
      <div className="pagination-gestes">
        <Bouton
          taille="petite"
          icone={ChevronLeft}
          desactive={pageCourante <= 1}
          surClic={() => surPage?.(pageCourante - 1)}
          titre={pageCourante <= 1 ? 'Vous êtes sur la première page.' : undefined}
        >
          Précédente
        </Bouton>
        <Bouton
          taille="petite"
          icone={ChevronRight}
          desactive={pages !== null && pageCourante >= pages}
          surClic={() => surPage?.(pageCourante + 1)}
          titre={pages !== null && pageCourante >= pages ? 'Vous êtes sur la dernière page.' : undefined}
        >
          Suivante
        </Bouton>
      </div>
    </div>
  )
}
