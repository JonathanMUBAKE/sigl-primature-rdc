/*
  Une fiche se lit en couples clé/valeur, serrés, dans une carte.
*/
export default function Definitions({ entrees }) {
  return (
    <div className="definitions">
      {entrees
        .filter((entree) => entree)
        .map((entree) => (
          <div className="definition" key={entree.cle}>
            <div className="definition-cle">{entree.cle}</div>
            <div className="definition-valeur">{entree.valeur ?? '—'}</div>
          </div>
        ))}
    </div>
  )
}
