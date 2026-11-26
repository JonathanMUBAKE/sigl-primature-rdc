/*
  Les armoiries de la République démocratique du Congo, dessinées sobrement :
  la tête de léopard, la pointe d'ivoire et la lance croisée, dans l'écu.
  Un tracé, pas une illustration : une seule couleur, celle du texte autour.
*/
export default function Armoiries({ taille = 32, titre = 'Armoiries de la République démocratique du Congo' }) {
  return (
    <svg
      className="bandeau-armoiries"
      width={taille}
      height={taille}
      viewBox="0 0 64 64"
      role="img"
      aria-label={titre}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* L'écu */}
      <path d="M32 3 56 11v22c0 13-10 23-24 28C18 56 8 46 8 33V11Z" />
      {/* La lance et la pointe d'ivoire, croisées */}
      <path d="M17 20 47 46" strokeWidth="1.6" />
      <path d="M47 20 17 46" strokeWidth="1.6" />
      <path d="M44 17l5-2-2 5-3-3Z" strokeWidth="1.4" />
      <path d="M20 17l-5-2 2 5 3-3Z" strokeWidth="1.4" />
      {/* La tête de léopard, de face */}
      <circle cx="32" cy="31" r="10" strokeWidth="1.8" />
      <path d="M24 24.5c-1.5-3 0-5.5 0-5.5l3.5 3" strokeWidth="1.4" />
      <path d="M40 24.5c1.5-3 0-5.5 0-5.5l-3.5 3" strokeWidth="1.4" />
      <path d="M28.5 29.5h.01M35.5 29.5h.01" strokeWidth="2.4" />
      <path d="M29.5 35c1.5 1.3 3.5 1.3 5 0" strokeWidth="1.4" />
      <path d="M32 31v2.2" strokeWidth="1.3" />
    </svg>
  )
}
