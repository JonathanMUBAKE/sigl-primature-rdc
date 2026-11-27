import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'

/*
  La bande du poste de commande.

  POURQUOI ELLE N'EST PAS UNE RANGÉE DE CHIFFRES. Six grands nombres alignés en
  haut d'écran, c'est la bande de statistiques d'un site vitrine — « 10 000
  clients », « 99,9 % de disponibilité » — où le nombre est la vedette. Dans un
  poste de commande, le nombre n'est pas le message : le message est ce qui doit
  être fait, par qui, depuis combien de temps. La bande redescend donc au rang
  d'instrument.

  Trois choix tiennent ce rang.

  **L'étiquette passe avant la valeur.** On lit « DÉCISIONS EN ATTENTE », puis
  12. L'ordre de lecture dit lequel des deux commande l'autre.

  **Un zéro n'a pas le poids d'un douze.** Une absence s'écrit en encre douce :
  elle se constate, elle ne se mesure pas. Rendus à la même graisse, « 0 » et
  « 12 » se ressemblaient, et l'écran annonçait une mesure là où il n'y avait
  rien à faire.

  **Les cellules sont séparées par un filet, pas par des cartes.** Une carte
  dans une carte fabrique une profondeur qui ne veut rien dire. Un filet suffit
  à séparer deux lectures.

  LA PROFONDEUR, ET CE QU'ELLE SERT. La bande reste en place pendant que la file
  de travail défile dessous : deux plans, deux vitesses. Ce n'est pas un effet —
  c'est ce qui permet de travailler la file sans perdre ses indicateurs de vue,
  et c'est le même procédé que l'en-tête de tableau, déjà posé par la charte. Le
  détachement se marque par un filet qui s'épaissit, jamais par une ombre
  portée : la charte n'en porte aucune.

  LE TEMPS RÉEL. `vif` fait battre la cellule que le flux vient de toucher,
  avec l'animation `marquage` de la charte. Un chiffre qui change sous les yeux
  doit se voir changer, sinon un écran vivant ne se distingue pas d'un écran
  figé.
*/
export default function BandeDeCommande({ cellules = [], enTete = null }) {
  const sentinelle = useRef(null)
  const [detachee, setDetachee] = useState(false)

  // Le détachement se constate, il ne se calcule pas à chaque pixel : une
  // sentinelle d'un pixel au-dessus de la bande suffit, et l'observateur ne
  // réveille le rendu qu'aux deux franchissements.
  useEffect(() => {
    const cible = sentinelle.current
    if (!cible || typeof IntersectionObserver === 'undefined') return undefined
    const observateur = new IntersectionObserver(
      ([entree]) => setDetachee(!entree.isIntersecting),
      { threshold: 0 },
    )
    observateur.observe(cible)
    return () => observateur.disconnect()
  }, [])

  if (cellules.length === 0) return null

  return (
    <>
      <div ref={sentinelle} className="bande-sentinelle" aria-hidden="true" />
      <div className={clsx('bande-commande', detachee && 'est-detachee')}>
        {enTete ? <div className="bande-entete">{enTete}</div> : null}
        <div
          className="bande-cellules"
          role="group"
          aria-label="Indicateurs du poste de commande"
        >
          {cellules.map((c) => {
            const estNul = c.nul === true
            const contenu = (
              <>
                <span className="bande-libelle">{c.libelle}</span>
                <span className={clsx('bande-valeur', estNul && 'est-nulle')}>{c.valeur}</span>
                {c.appui ? <span className="bande-appui">{c.appui}</span> : null}
              </>
            )
            const classe = clsx('bande-cellule', c.vif && 'vient-de-changer')
            return c.vers ? (
              <Link key={c.cle} to={c.vers} className={clsx(classe, 'est-cliquable')}>
                {contenu}
              </Link>
            ) : (
              <div key={c.cle} className={classe}>
                {contenu}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
