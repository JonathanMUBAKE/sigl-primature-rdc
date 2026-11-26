import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import Page from '../components/Page.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import { Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { jours, nombre, texte } from '../lib/format.js'

/*
  Les fournisseurs. GET /api/fournisseurs ?q=&liste_noire=
  Un fournisseur en liste noire reste visible : aucun bon de commande ne part
  vers lui — RG-009 — mais on doit pouvoir le constater.
*/
export default function Fournisseurs() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const listeNoire = params.get('liste_noire') ?? ''

  function poser(cle, valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, valeur)
    else prochain.delete(cle)
    setParams(prochain, { replace: true })
  }

  const { donnees, chargement, erreur, recharger } = useRequete(
    (o) => api.fournisseurs({ q, liste_noire: listeNoire || undefined }, o),
    [q, listeNoire],
  )
  const { lignes, total } = depouillerListe(donnees)

  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant('achats', recharger, marquer)

  const colonnes = useMemo(
    () => [
      { cle: 'denomination', titre: 'Dénomination', rendu: (f) => texte(f.denomination) },
      {
        cle: 'liste_noire',
        titre: 'Situation',
        rendu: (f) =>
          f.liste_noire ? (
            <Pastille ton="critique" valeur="liste_noire" texte="Liste noire" titre="RG-009 : aucun bon de commande" />
          ) : f.actif === false ? (
            <Pastille ton="neutre" valeur="inactif" texte="Inactif" />
          ) : (
            <Pastille ton="succes" valeur="actif" texte="Actif" />
          ),
      },
      { cle: 'rccm', titre: 'RCCM', rendu: (f) => <span className="mono cellule-faible">{texte(f.rccm)}</span> },
      { cle: 'id_nat', titre: 'Id. nat.', rendu: (f) => <span className="mono cellule-faible">{texte(f.id_nat)}</span> },
      { cle: 'nif', titre: 'NIF', rendu: (f) => <span className="mono cellule-faible">{texte(f.nif)}</span> },
      {
        cle: 'categories',
        titre: 'Catégories',
        rendu: (f) =>
          Array.isArray(f.categories) && f.categories.length > 0 ? (
            <span className="cellule-faible">{f.categories.join(', ')}</span>
          ) : (
            '—'
          ),
      },
      { cle: 'ville', titre: 'Adresse', rendu: (f) => <span className="cellule-faible">{texte(f.adresse)}</span> },
      { cle: 'telephone', titre: 'Téléphone', rendu: (f) => <span className="mono">{texte(f.telephone)}</span> },
      {
        cle: 'delai_moyen_jours',
        titre: 'Délai moyen',
        nombre: true,
        valeur: (f) => Number(f.delai_moyen_jours ?? 0),
        rendu: (f) =>
          f.delai_moyen_jours === null || f.delai_moyen_jours === undefined
            ? '—'
            : jours(f.delai_moyen_jours),
      },
    ],
    [],
  )

  return (
    <Page
      titre="Fournisseurs"
      sousTitre="Le fichier des fournisseurs, avec leur situation et leur délai moyen"
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Fournisseurs' }]}
    >
      <Filtres total={erreur || chargement ? undefined : total} nom="fournisseur">
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Dénomination, RCCM, identification nationale, NIF…"
        />
        <Filtre
          libelle="Liste noire"
          valeur={listeNoire}
          surChangement={(v) => poser('liste_noire', v)}
          options={[
            { valeur: 'true', libelle: 'Seulement en liste noire' },
            { valeur: 'false', libelle: 'Hors liste noire' },
          ]}
          toutes="Tous les fournisseurs"
        />
      </Filtres>

      <Etat chargement={chargement} erreur={erreur} recharger={recharger} texteChargement="Lecture du fichier des fournisseurs…">
        <Tableau
          colonnes={colonnes}
          lignes={lignes}
          nomDesLignes="fournisseur"
          triInitial={{ cle: 'denomination', sens: 'asc' }}
          ligneSignalee={(f) => Boolean(f.liste_noire)}
          ligneMarquee={(f) => estMarque(f.id)}
          titreVide="Aucun fournisseur"
          texteVide={
            q || listeNoire
              ? 'Aucun fournisseur ne répond à ces critères.'
              : "Le fichier des fournisseurs est vide. Il se remplit par le référentiel, du ressort de l'administrateur."
          }
          pied={`${nombre(lignes.length)} affiché(s) sur ${nombre(total)}`}
        />
      </Etat>
    </Page>
  )
}
