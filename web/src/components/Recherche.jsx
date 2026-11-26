import { Search } from 'lucide-react'

/*
  Tout écran de liste a une recherche. Elle ne décide rien : elle filtre.
*/
export default function Recherche({
  valeur,
  surChangement,
  placeholder = 'Rechercher…',
  etiquette = 'Rechercher',
}) {
  return (
    <div className="recherche">
      <Search className="recherche-icone" size={15} aria-hidden="true" />
      <input
        type="search"
        className="recherche-saisie"
        value={valeur}
        onChange={(e) => surChangement(e.target.value)}
        placeholder={placeholder}
        aria-label={etiquette}
      />
    </div>
  )
}
