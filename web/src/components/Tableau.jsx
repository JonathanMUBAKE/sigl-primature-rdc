import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import Vide from './Vide.jsx'
import { compte as direCompte } from '../lib/format.js'

/*
  La brique principale du SIGL.
  En-tête teinté, lignes alternées, filets horizontaux seulement, chiffres
  alignés à droite en chiffres tabulaires, tri par colonne.

  Une colonne : { cle, titre, nombre?, triable?, valeur?, rendu?, largeur? }
  - valeur(ligne) sert au tri ; rendu(ligne) à l'affichage.
*/
export default function Tableau({
  colonnes,
  lignes,
  cleDeLigne = (l, i) => l?.id ?? i,
  surClic,
  ligneSignalee,
  ligneMarquee,
  triInitial,
  pied,
  nomDesLignes = 'ligne',
  nomDesLignesPluriel,
  titreVide = 'Aucune ligne',
  texteVide = "Ce tableau n'a rien à montrer pour les critères retenus.",
  actionVide,
}) {
  const [tri, setTri] = useState(triInitial ?? null)

  const valeurDe = (colonne, ligne) =>
    colonne.valeur ? colonne.valeur(ligne) : ligne?.[colonne.cle]

  const ordonnees = useMemo(() => {
    if (!tri) return lignes
    const colonne = colonnes.find((c) => c.cle === tri.cle)
    if (!colonne) return lignes
    const sens = tri.sens === 'desc' ? -1 : 1
    return [...lignes].sort((a, b) => {
      const va = valeurDe(colonne, a)
      const vb = valeurDe(colonne, b)
      if (va === vb) return 0
      if (va === null || va === undefined) return 1
      if (vb === null || vb === undefined) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sens
      return String(va).localeCompare(String(vb), 'fr', { numeric: true }) * sens
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes, tri, colonnes])

  function basculer(cle) {
    setTri((actuel) =>
      actuel?.cle === cle
        ? { cle, sens: actuel.sens === 'asc' ? 'desc' : 'asc' }
        : { cle, sens: 'asc' },
    )
  }

  return (
    <div className="tableau-enveloppe">
      <div className="tableau-defilement">
        <table className="tableau">
          <thead>
            <tr>
              {colonnes.map((colonne) => {
                const estTriee = tri?.cle === colonne.cle
                const Fleche = !estTriee ? ChevronsUpDown : tri.sens === 'asc' ? ArrowUp : ArrowDown
                return (
                  <th
                    key={colonne.cle}
                    className={clsx(colonne.nombre && 'col-nombre')}
                    style={colonne.largeur ? { width: colonne.largeur } : undefined}
                    aria-sort={estTriee ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none'}
                    scope="col"
                  >
                    {colonne.triable === false ? (
                      colonne.titre
                    ) : (
                      <button
                        type="button"
                        className="tableau-tri"
                        onClick={() => basculer(colonne.cle)}
                        title={`Trier par ${colonne.titre}`}
                      >
                        {colonne.titre}
                        <Fleche size={12} aria-hidden="true" />
                      </button>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {ordonnees.length === 0 ? (
              <tr>
                <td colSpan={colonnes.length} style={{ padding: 0, borderBottom: 'none' }}>
                  <Vide titre={titreVide} texte={texteVide} action={actionVide} />
                </td>
              </tr>
            ) : null}
            {ordonnees.map((ligne, index) => (
              <tr
                key={cleDeLigne(ligne, index)}
                className={clsx(
                  surClic && 'est-cliquable',
                  ligneSignalee?.(ligne) && 'est-signalee',
                  ligneMarquee?.(ligne) && 'vient-de-changer',
                )}
                onClick={surClic ? () => surClic(ligne) : undefined}
                tabIndex={surClic ? 0 : undefined}
                onKeyDown={
                  surClic
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          surClic(ligne)
                        }
                      }
                    : undefined
                }
              >
                {colonnes.map((colonne) => (
                  <td key={colonne.cle} className={clsx(colonne.nombre && 'col-nombre')}>
                    {colonne.rendu ? colonne.rendu(ligne) : affichageBrut(valeurDe(colonne, ligne))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tableau-pied">
        {pied ?? direCompte(ordonnees.length, nomDesLignes, nomDesLignesPluriel)}
      </div>
    </div>
  )
}

function affichageBrut(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return '—'
  return String(valeur)
}
