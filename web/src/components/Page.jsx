import { Link } from 'react-router-dom'

/*
  L'ossature d'un écran : fil d'Ariane, titre à gauche, actions à droite.
*/
export default function Page({ titre, sousTitre, fil = [], actions, children }) {
  return (
    <div>
      <div className="page-tete">
        <div>
          {fil.length > 0 ? (
            <nav className="page-fil" aria-label="Fil d'Ariane">
              {fil.map((etape, i) => (
                <span key={`${etape.libelle}-${i}`}>
                  {i > 0 ? <span className="page-fil-separateur"> / </span> : null}
                  {etape.to ? <Link to={etape.to}>{etape.libelle}</Link> : <span>{etape.libelle}</span>}
                </span>
              ))}
            </nav>
          ) : null}
          <h1 className="page-titre">{titre}</h1>
          {sousTitre ? <div className="page-sous-titre">{sousTitre}</div> : null}
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
      {children}
    </div>
  )
}

export function Section({ titre, note, actions, children }) {
  return (
    <section className="section">
      {titre || note || actions ? (
        <div className="section-tete">
          <h2 className="section-titre">{titre}</h2>
          {actions ?? (note ? <span className="section-note">{note}</span> : null)}
        </div>
      ) : null}
      {children}
    </section>
  )
}
