import clsx from 'clsx'
import Vide from './Vide.jsx'
import { horodatage, libelle, texte } from '../lib/format.js'

/*
  Le chemin de fer d'un circuit : les étapes dans l'ordre, l'état de chacune,
  et la pièce qui fait comprendre le circuit d'un coup d'œil.

  **L'avancement vient du serveur.** Cette brique affiche une liste d'étapes
  déjà jugées — { numero, libelle, etat, le, par_nom } avec
  etat ∈ faite | courante | a_venir | sautee — et ne déduit rien d'un statut.
  Sans étapes servies, elle ne dessine pas un circuit vide : elle le dit.

  L'état n'est jamais porté par la couleur seule : chaque étape écrit son état
  en mots, sous son libellé. Aucune ombre portée ; les jetons seuls décident
  des couleurs, dans les deux modes.
*/
export default function CheminDeFer({
  etapes = [],
  titreVide = "L'avancement n'est pas servi",
  texteVide = "Le serveur n'a pas rendu la liste des étapes de ce circuit. Rien n'est déduit ici : il n'y a donc pas de chemin de fer à montrer.",
}) {
  if (!Array.isArray(etapes) || etapes.length === 0) {
    return <Vide titre={titreVide} texte={texteVide} />
  }

  return (
    <ol className="chemin-de-fer">
      {etapes.map((etape, index) => (
        <li
          key={etape.numero ?? index}
          className={clsx('chemin-etape', etape.etat && `est-${etape.etat}`)}
          aria-current={etape.etat === 'courante' ? 'step' : undefined}
        >
          <span className="chemin-rang" aria-hidden="true">
            {etape.numero ?? index + 1}
          </span>
          <span className="chemin-corps">
            <span className="chemin-nom">{texte(etape.libelle)}</span>
            <span className="chemin-note">{noteDeLEtape(etape)}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/*
  Ce que l'étape dit d'elle-même, en mots : son état, et quand et par qui elle
  a été franchie quand le serveur le sert. Jamais une couleur seule.
*/
function noteDeLEtape(etape) {
  const etat = etape.etat ? libelle(etape.etat) : 'État non servi'
  const quand = etape.le ? horodatage(etape.le) : null
  const qui = etape.par_nom ? String(etape.par_nom) : null
  const appui = [quand, qui].filter(Boolean).join(' · ')
  return appui ? `${etat} — ${appui}` : etat
}
