/*
  La grille bento du tableau de bord : des blocs de tailles inégales, pas une
  liste de cartes identiques. Douze colonnes ; chaque bloc dit sa largeur.
*/
export default function Bento({ children }) {
  return <div className="bento">{children}</div>
}

export function Bloc({ large = 4, titre, note, actions, serre = false, children }) {
  return (
    <section className={`bento-bloc large-${large}${serre ? ' sans-marge-interne' : ''}`}>
      {titre || note || actions ? (
        <div className="bento-tete">
          <h2 className="bento-titre">{titre}</h2>
          {actions ?? (note ? <span className="bento-note">{note}</span> : null)}
        </div>
      ) : null}
      {children}
    </section>
  )
}
