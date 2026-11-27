import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FolderPlus, RefreshCw } from 'lucide-react'
import Page from '../components/Page.jsx'
import Bento, { Bloc } from '../components/Bento.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Recherche from '../components/Recherche.jsx'
import Filtres, { Filtre } from '../components/Filtres.jsx'
import Bouton from '../components/Bouton.jsx'
import Champ from '../components/Champ.jsx'
import Chiffre, { RangeeChiffres } from '../components/Chiffre.jsx'
import Definitions from '../components/Definitions.jsx'
import Dialogue from '../components/Dialogue.jsx'
import Tiroir from '../components/Tiroir.jsx'
import { Chargement, Erreur, Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { useRequete, depouillerListe } from '../lib/requete.js'
import { useRoles } from '../lib/agent.jsx'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { date, horodatage, jours, libelle, montant, montantCourt, nombre, texte } from '../lib/format.js'
import { delaiDuFournisseur, enListeNoire, justificationDeProcedure, nomDuFournisseur } from '../lib/achats.js'

/*
  Les achats — GET /api/dossiers-achat, GET /api/bons-commande.

  Ce que le serveur rend, relevé sur l'API et non sur le contrat, qui a divergé :
  — la liste des dossiers porte `objet`, `montant_estime` (chaîne numeric),
    `procedure`, `statut`, `seuils_appliques`, `nombre_bons`, `montant_commande`,
    `anciennete_jours`, et la structure de l'état de besoin rattaché ;
  — le détail ajoute `bons_commande` et `alertes`, **mais aucune ligne** : les
    lignes regroupées se lisent sur l'état de besoin, par `etat_besoin_id` ;
  — `GET /api/bons-commande` est le seul endroit qui porte le `delai_moyen_jours`
    du fournisseur ; le détail du dossier ne le donne pas.

  RG-007 : la procédure découle du montant et des seuils en vigueur **à la date
  du dossier**. Le serveur a tranché, l'écran dit pourquoi — voir `lib/seuils.js`.
  RG-008 : quand un découpage ferait passer un achat sous un seuil, le serveur
  bloque et joint l'alerte qu'il lève. L'écran explique le reproche et montre
  les achats concernés ; il n'affiche jamais le code seul.
*/

const PROCEDURES = ['gre_a_gre', 'consultation', 'aon', 'aoi']
const STATUTS = ['ouvert', 'en_consultation', 'attribue', 'execute', 'clos', 'annule']

export default function Achats() {
  const [params, setParams] = useSearchParams()
  const navigue = useNavigate()
  const { id: dossierOuvert } = useParams()
  const { aLeRole } = useRoles()

  const q = params.get('q') ?? ''
  const procedure = params.get('procedure') ?? ''
  const statut = params.get('statut') ?? ''

  function poser(cle, valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, valeur)
    else prochain.delete(cle)
    setParams(prochain, { replace: true })
  }

  const { donnees, chargement, erreur, recharger } = useRequete(
    (o) =>
      api.dossiersAchat(
        {
          q: q || undefined,
          procedure: procedure || undefined,
          statut: statut || undefined,
          parPage: 100,
        },
        o,
      ),
    [q, procedure, statut],
  )
  const { lignes, total } = depouillerListe(donnees)

  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant('achats', recharger, marquer)

  const [ouvertureEnCours, setOuvertureEnCours] = useState(false)
  const peutOuvrir = aLeRole('logistique', 'intendant', 'ordonnateur')

  const resume = useMemo(() => {
    const somme = (choix, champ) =>
      lignes.filter(choix).reduce((t, d) => t + Number(d[champ] ?? 0), 0)
    return {
      ouverts: lignes.filter((d) => d.statut === 'ouvert').length,
      attribues: lignes.filter((d) => d.statut === 'attribue').length,
      estime: somme(() => true, 'montant_estime'),
      commande: somme(() => true, 'montant_commande'),
      bons: lignes.reduce((t, d) => t + Number(d.nombre_bons ?? 0), 0),
    }
  }, [lignes])

  const colonnes = useMemo(
    () => [
      {
        cle: 'numero',
        titre: 'Dossier',
        largeur: '14%',
        rendu: (d) => (
          <span className="cellule-deux-lignes">
            <span className="mono">{texte(d.numero)}</span>
            <span className="texte-note">{date(d.cree_le)}</span>
          </span>
        ),
      },
      {
        cle: 'objet',
        titre: 'Objet',
        largeur: '26%',
        rendu: (d) => (
          <span className="cellule-deux-lignes">
            <span>{texte(d.objet)}</span>
            <span className="texte-note">
              {d.etat_besoin_numero
                ? `${d.etat_besoin_numero} · ${texte(d.structure_code)}`
                : 'Sans état de besoin rattaché'}
            </span>
          </span>
        ),
      },
      {
        cle: 'procedure',
        titre: 'Procédure',
        largeur: '17%',
        rendu: (d) => {
          const justification = justificationDeProcedure(d)
          const plancher = justification?.palier?.plancher
          return (
            <span className="cellule-deux-lignes">
              <span>{libelle(d.procedure)}</span>
              <span className="texte-note">
                {plancher === null || plancher === undefined
                  ? 'Seuils non conservés par le serveur'
                  : plancher > 0
                    ? `Seuil franchi : ${montantCourt(plancher)}`
                    : 'Sous le premier seuil'}
                {justification?.conforme === false ? ' · écart avec les seuils figés' : ''}
              </span>
            </span>
          )
        },
      },
      {
        cle: 'montant_estime',
        titre: 'Estimé',
        nombre: true,
        largeur: '13%',
        valeur: (d) => Number(d.montant_estime ?? 0),
        rendu: (d) => montantCourt(d.montant_estime),
      },
      {
        cle: 'montant_commande',
        titre: 'Commandé',
        nombre: true,
        largeur: '13%',
        valeur: (d) => Number(d.montant_commande ?? 0),
        rendu: (d) => (
          <span className={Number(d.montant_commande ?? 0) > Number(d.montant_estime ?? 0) ? undefined : 'cellule-faible'}>
            {montantCourt(d.montant_commande)}
          </span>
        ),
      },
      {
        cle: 'nombre_bons',
        titre: 'Bons',
        nombre: true,
        largeur: '5%',
        valeur: (d) => Number(d.nombre_bons ?? 0),
        rendu: (d) => nombre(d.nombre_bons),
      },
      {
        cle: 'statut',
        titre: 'État',
        largeur: '12%',
        rendu: (d) => <Pastille valeur={d.statut} />,
      },
    ],
    [],
  )

  return (
    <Page
      titre="Achats"
      sousTitre="Les dossiers de passation, la procédure que les seuils imposent, et les bons de commande rattachés"
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Achats' }]}
      actions={
        <>
          <Bouton icone={RefreshCw} surClic={recharger}>
            Actualiser
          </Bouton>
          <Bouton
            allure="principale"
            icone={FolderPlus}
            desactive={!peutOuvrir}
            surClic={() => setOuvertureEnCours(true)}
            titre={
              peutOuvrir
                ? undefined
                : "L'ouverture d'un dossier revient au chargé de logistique, à l'intendant ou à l'ordonnateur"
            }
          >
            Ouvrir un dossier
          </Bouton>
        </>
      }
    >
      <Bento>
        <Bloc large={12} titre="Les dossiers d'achat" note="Montants en francs congolais">
          <RangeeChiffres>
            <Chiffre valeur={total} libelle="Dossiers suivis" vers="/achats" />
            <Chiffre valeur={resume.ouverts} libelle="Ouverts" vers="/achats?statut=ouvert" ton="attente" />
            <Chiffre valeur={resume.attribues} libelle="Attribués" vers="/achats?statut=attribue" />
            <Chiffre valeur={resume.bons} libelle="Bons de commande" vers="/receptions" />
            <Chiffre brut valeur={montantCourt(resume.estime)} libelle="Estimé, cumulé" />
            <Chiffre brut valeur={montantCourt(resume.commande)} libelle="Commandé, cumulé" />
          </RangeeChiffres>
        </Bloc>
      </Bento>

      <Filtres
        total={erreur || chargement ? undefined : lignes.length}
        nom="dossier"
        note={
          procedure || statut || q
            ? undefined
            : `${nombre(total)} dossier(s) dans votre périmètre`
        }
      >
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Numéro de dossier, objet…"
        />
        <Filtre
          libelle="Procédure"
          valeur={procedure}
          surChangement={(v) => poser('procedure', v)}
          options={PROCEDURES.map((code) => ({ valeur: code, libelle: libelle(code) }))}
          toutes="Toutes les procédures"
        />
        <Filtre
          libelle="État"
          valeur={statut}
          surChangement={(v) => poser('statut', v)}
          options={STATUTS.map((code) => ({ valeur: code, libelle: libelle(code) }))}
          toutes="Tous les états"
        />
      </Filtres>

      <Etat
        chargement={chargement}
        erreur={erreur}
        recharger={recharger}
        texteChargement="Lecture des dossiers d'achat…"
      >
        <Tableau
          colonnes={colonnes}
          lignes={lignes}
          nomDesLignes="dossier"
          triInitial={{ cle: 'numero', sens: 'desc' }}
          surClic={(d) => navigue(`/achats/${d.id}${window.location.search}`)}
          ligneChoisie={(d) => d.id === dossierOuvert}
          ligneSignalee={(d) => Number(d.montant_commande ?? 0) > Number(d.montant_estime ?? 0)}
          ligneMarquee={(d) => estMarque(d.id)}
          titreVide="Aucun dossier d'achat"
          texteVide={
            q || procedure || statut
              ? 'Aucun dossier ne répond à ces critères. Retirez un filtre pour voir le reste.'
              : "Aucun dossier d'achat n'existe pour votre périmètre. Un dossier naît de l'examen d'un état de besoin, pour ses lignes d'origine « achat »."
          }
          pied={`${nombre(lignes.length)} dossier(s) affiché(s) sur ${nombre(total)} · les lignes signalées dépassent leur estimation`}
        />
      </Etat>

      {dossierOuvert ? (
        <FicheDossier
          id={dossierOuvert}
          surFermeture={() => navigue(`/achats${window.location.search}`)}
        />
      ) : null}

      {ouvertureEnCours ? (
        <OuvertureDeDossier
          surFermeture={() => setOuvertureEnCours(false)}
          surSucces={(cree) => {
            setOuvertureEnCours(false)
            recharger()
            if (cree?.id) navigue(`/achats/${cree.id}`)
          }}
        />
      ) : null}
    </Page>
  )
}

/* --------------------------------------------------------------------- */
/* Le détail d'un dossier, en tiroir latéral                             */
/* --------------------------------------------------------------------- */

function FicheDossier({ id, surFermeture }) {
  const fiche = useRequete((o) => api.dossierAchat(id, o), [id])
  // Le détail du dossier ne porte pas le délai des fournisseurs : il n'est
  // servi que par la liste des bons de commande. On la demande pour ce dossier.
  const bons = useRequete((o) => api.bonsCommande({ dossier: id, parPage: 100 }, o), [id])

  useRafraichissementVivant('achats', () => {
    fiche.recharger()
    bons.recharger()
  })

  const d = fiche.donnees ?? {}
  const explication = justificationDeProcedure(d)
  const lignesBons = depouillerListe(bons.donnees).lignes
  // À défaut de la liste — droits, ou route en défaut —, le détail du dossier
  // porte déjà les bons, sans leur délai.
  const bonsAffiches = lignesBons.length > 0 ? lignesBons : (d.bons_commande ?? [])

  return (
    <Tiroir
      ouvert
      surFermeture={surFermeture}
      surTitre="Dossier d'achat"
      titre={fiche.chargement ? 'Chargement…' : <span className="mono">{texte(d.numero)}</span>}
      sousTitre={fiche.chargement ? null : texte(d.objet)}
      pied={
        <span className="texte-faible">
          {d.statut ? <Pastille valeur={d.statut} /> : null}
        </span>
      }
    >
      {fiche.chargement ? (
        <Chargement texte="Lecture du dossier d'achat…" />
      ) : fiche.erreur ? (
        <Erreur
          erreur={fiche.erreur}
          surReessai={fiche.recharger}
          titre="Le dossier d'achat n'a pas pu être lu"
        />
      ) : (
        <>
          <h3 className="section-titre">La procédure, et pourquoi elle s'applique</h3>
          <div className="marge-dessus-3">
            <Definitions
              entrees={[
                { cle: 'Procédure retenue', valeur: libelle(d.procedure) },
                { cle: 'Montant estimé', valeur: montant(d.montant_estime) },
                {
                  cle: 'Seuil qui la détermine',
                  valeur: explication?.palier
                    ? montant(explication.palier.plancher)
                    : 'Non conservé par le serveur',
                },
                {
                  cle: 'Seuil suivant',
                  valeur: explication?.suivant
                    ? `${montant(explication.suivant.plancher)} — ${libelle(explication.suivant.procedure)}`
                    : "Aucun : c'est le palier le plus haut",
                },
                { cle: 'Devise des seuils', valeur: explication?.devise ?? 'CDF' },
                {
                  cle: 'Procédure toujours conforme',
                  valeur:
                    explication?.conforme === null || explication?.conforme === undefined
                      ? 'Non vérifié par le serveur'
                      : explication.conforme
                        ? 'Oui, au regard des seuils figés'
                        : 'Non : la procédure inscrite s’écarte des seuils figés — à examiner',
                },
                { cle: 'Ouvert le', valeur: horodatage(d.cree_le) },
                { cle: 'Clos le', valeur: horodatage(d.clos_le) },
                {
                  cle: 'Ancienneté',
                  valeur: d.anciennete_jours === undefined ? '—' : jours(d.anciennete_jours),
                },
              ]}
            />
          </div>
          <p className="marge-dessus-3 largeur-propos texte-faible">
            {explication?.phrase ??
              "Le serveur n'a pas conservé les seuils appliqués à ce dossier : la procédure est celle qu'il a retenue, mais le seuil qui l'a déterminée ne peut pas être affiché sans inventer un chiffre."}
          </p>
          {explication?.echelle?.length ? (
            <div className="marge-dessus-3">
              <Tableau
                lignes={explication.echelle}
                cleDeLigne={(p) => p.procedure}
                nomDesLignes="palier"
                ligneChoisie={(p) => p.procedure === d.procedure}
                colonnes={[
                  { cle: 'procedure', titre: 'Procédure', rendu: (p) => libelle(p.procedure) },
                  {
                    cle: 'plancher',
                    titre: 'À partir de',
                    nombre: true,
                    rendu: (p) => montantCourt(p.plancher),
                  },
                  {
                    cle: 'plafond',
                    titre: 'Jusqu’à',
                    nombre: true,
                    rendu: (p) => (p.plafond === null ? 'Sans plafond' : montantCourt(p.plafond)),
                  },
                ]}
                pied="Les seuils en vigueur à la date du dossier, tels que le serveur les a conservés — RG-007"
              />
            </div>
          ) : null}

          <h3 className="section-titre separe-dessus">Les lignes regroupées</h3>
          <LignesRegroupees
            etatBesoinId={d.etat_besoin_id}
            numero={d.etat_besoin_numero}
          />

          <h3 className="section-titre separe-dessus">Les bons de commande rattachés</h3>
          <div className="marge-dessus-3">
            <Tableau
              lignes={bonsAffiches}
              nomDesLignes="bon de commande"
              nomDesLignesPluriel="bons de commande"
              titreVide="Aucun bon de commande"
              texteVide="Ce dossier n'a encore été attribué à aucun fournisseur : il n'y a donc rien à réceptionner ni à payer."
              colonnes={[
                {
                  cle: 'numero',
                  titre: 'Bon',
                  rendu: (b) => (
                    <span className="cellule-deux-lignes">
                      <span className="mono">{texte(b.numero)}</span>
                      <span className="texte-note">{date(b.emis_le)}</span>
                    </span>
                  ),
                },
                {
                  cle: 'fournisseur_nom',
                  titre: 'Fournisseur',
                  valeur: (b) => nomDuFournisseur(b) ?? '',
                  rendu: (b) => (
                    <span className="cellule-deux-lignes">
                      <span>{texte(nomDuFournisseur(b))}</span>
                      <span className="texte-note">
                        {enListeNoire(b) ? 'En liste noire — RG-009' : 'Hors liste noire'}
                      </span>
                    </span>
                  ),
                },
                {
                  cle: 'delai',
                  titre: 'Délai',
                  nombre: true,
                  valeur: (b) => delaiDuFournisseur(b).jours ?? -1,
                  rendu: (b) => {
                    const delai = delaiDuFournisseur(b)
                    return (
                      <span className="cellule-deux-lignes">
                        <span>{delai.jours === null ? '—' : jours(delai.jours)}</span>
                        <span className="texte-note">{delai.note}</span>
                      </span>
                    )
                  },
                },
                {
                  cle: 'montant',
                  titre: 'Montant',
                  nombre: true,
                  valeur: (b) => Number(b.montant ?? 0),
                  rendu: (b) => montantCourt(b.montant),
                },
                { cle: 'statut', titre: 'Où il en est', rendu: (b) => <Pastille valeur={b.statut} /> },
              ]}
              pied={
                lignesBons.length > 0
                  ? `${nombre(bonsAffiches.length)} bon(s) · cumul commandé ${montantCourt(
                      bonsAffiches.reduce((t, b) => t + Number(b.montant ?? 0), 0),
                    )} pour une estimation de ${montantCourt(d.montant_estime)}`
                  : 'Les bons viennent du détail du dossier : le délai du fournisseur peut y manquer.'
              }
            />
          </div>

          {(d.alertes ?? []).length > 0 ? (
            <>
              <h3 className="section-titre separe-dessus">Les examens ouverts sur ce dossier</h3>
              <div className="marge-dessus-3">
                <Tableau
                  lignes={d.alertes}
                  nomDesLignes="examen"
                  colonnes={[
                    {
                      cle: 'explication',
                      titre: 'Ce qui est reproché',
                      rendu: (a) => (
                        <span className="cellule-deux-lignes">
                          <span>{texte(a.explication)}</span>
                          <span className="texte-note mono">{texte(a.code)}</span>
                        </span>
                      ),
                    },
                    { cle: 'gravite', titre: 'Gravité', rendu: (a) => <Pastille valeur={a.gravite} /> },
                    { cle: 'statut', titre: 'Suite', rendu: (a) => <Pastille valeur={a.statut} /> },
                    { cle: 'cree_le', titre: 'Ouvert le', nombre: true, rendu: (a) => date(a.cree_le) },
                  ]}
                  pied="Aucune alerte ne décide quoi que ce soit : elle ouvre un examen, un humain tranche — RG-022"
                />
              </div>
            </>
          ) : null}
        </>
      )}
    </Tiroir>
  )
}

/** Les lignes du dossier viennent de l'état de besoin regroupé, pas du dossier. */
function LignesRegroupees({ etatBesoinId, numero }) {
  const besoin = useRequete(
    (o) => (etatBesoinId ? api.besoin(etatBesoinId, o) : Promise.resolve(null)),
    [etatBesoinId],
  )

  if (!etatBesoinId) {
    return (
      <p className="marge-dessus-3 largeur-propos texte-faible">
        Ce dossier n'est rattaché à aucun état de besoin : il a été ouvert
        directement, et il n'y a donc pas de ligne regroupée à montrer. Les
        quantités se lisent alors sur les bons de commande.
      </p>
    )
  }
  if (besoin.chargement) return <Chargement texte="Lecture des lignes regroupées…" lignes={2} />
  if (besoin.erreur) {
    return (
      <div className="marge-dessus-3">
        <Erreur
          erreur={besoin.erreur}
          surReessai={besoin.recharger}
          titre={`Les lignes de l'état de besoin ${texte(numero)} n'ont pas pu être lues`}
        />
      </div>
    )
  }

  const e = besoin.donnees ?? {}
  const lignes = Array.isArray(e.lignes) ? e.lignes : []
  const dAchat = lignes.filter((l) => l.origine === 'achat')

  return (
    <div className="marge-dessus-3">
      <Tableau
        lignes={lignes}
        nomDesLignes="ligne regroupée"
        nomDesLignesPluriel="lignes regroupées"
        titreVide="Aucune ligne"
        texteVide="L'état de besoin rattaché ne porte aucune ligne : il n'y a rien à regrouper."
        colonnes={[
          {
            cle: 'designation',
            titre: 'Désignation',
            rendu: (l) => (
              <span className="cellule-deux-lignes">
                <span>{texte(l.designation)}</span>
                <span className="texte-note">{texte(l.categorie_libelle ?? l.categorie_code)}</span>
              </span>
            ),
          },
          {
            cle: 'quantite_demandee',
            titre: 'Demandée',
            nombre: true,
            rendu: (l) => nombre(l.quantite_demandee),
          },
          {
            cle: 'quantite_accordee',
            titre: 'Accordée',
            nombre: true,
            rendu: (l) =>
              l.quantite_accordee === null || l.quantite_accordee === undefined
                ? '—'
                : nombre(l.quantite_accordee),
          },
          { cle: 'origine', titre: 'Origine', rendu: (l) => <Pastille valeur={l.origine} /> },
        ]}
        pied={`${texte(e.numero)} · ${nombre(dAchat.length)} ligne(s) d'origine « achat » sur ${nombre(lignes.length)} · le reste est servi sur stock`}
      />
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* L'ouverture d'un dossier, et le refus pour fractionnement — RG-008    */
/* --------------------------------------------------------------------- */

function OuvertureDeDossier({ surFermeture, surSucces }) {
  const [objet, setObjet] = useState('')
  const [montantEstime, setMontantEstime] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const valeur = Number(montantEstime)
  const complet = objet.trim().length >= 3 && Number.isFinite(valeur) && valeur > 0

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      const cree = await api.creerDossierAchat({
        objet: objet.trim(),
        montant_estime: valeur,
      })
      surSucces(cree)
    } catch (cause) {
      setErreur(cause)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialogue
      ouvert
      // Le refus pour fractionnement porte un tableau : il lui faut la place.
      large={erreur?.code === 'RG-008'}
      titre="Ouvrir un dossier d'achat"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton allure="principale" desactive={!complet || envoi} surClic={envoyer}>
            {envoi ? 'Envoi…' : 'Ouvrir le dossier'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        La procédure n'est pas choisie ici : le serveur la déduit du montant
        estimé et des seuils en vigueur à la date du dossier — RG-007. Si ce
        dossier prolongeait un découpage, il sera refusé et un examen sera
        ouvert — RG-008.
      </p>
      <div className="marge-dessus-3 largeur-formulaire pile">
        <Champ
          libelle="Objet du dossier"
          valeur={objet}
          surChangement={setObjet}
          obligatoire
          aide="Trois caractères au moins. C'est l'objet qui sert à rapprocher les dossiers d'un même achat."
        />
        <Champ
          libelle="Montant estimé, en francs congolais"
          type="number"
          valeur={montantEstime}
          surChangement={setMontantEstime}
          obligatoire
          min={1}
          aide="Strictement positif. Le seuil franchi déterminera la procédure."
        />
      </div>
      {erreur ? (
        erreur.code === 'RG-008' ? (
          <RefusFractionnement erreur={erreur} />
        ) : (
          <div className="marge-dessus-3">
            <Erreur erreur={erreur} titre="Le serveur a refusé l'ouverture" />
          </div>
        )
      ) : null}
    </Dialogue>
  )
}

/**
 * RG-008 — le reproche, pas le code.
 * Le serveur joint l'alerte qu'il vient de lever : elle porte le cumul, la
 * procédure que ce dossier seul aurait suivie, celle que le cumul impose, la
 * fenêtre de surveillance et les identifiants des dossiers concernés. On les
 * résout pour les montrer.
 */
function RefusFractionnement({ erreur }) {
  const donnees = erreur.alerte?.donnees ?? {}
  const identifiants = Array.isArray(donnees.dossiers_lies)
    ? donnees.dossiers_lies.filter((v) => typeof v === 'string' && v !== '')
    : []

  const concernes = useRequete(
    (o) =>
      identifiants.length === 0
        ? Promise.resolve([])
        : Promise.all(
            identifiants.map((identifiant) =>
              api.dossierAchat(identifiant, o).catch(() => ({ id: identifiant, illisible: true })),
            ),
          ),
    [identifiants.join('|')],
  )

  return (
    <div className="marge-dessus-3">
      <div className="vide est-erreur" role="alert">
        <div className="ligne-outils">
          <span className="vide-titre">Fractionnement reproché</span>
          <Pastille valeur="critique" texte="Blocage" />
        </div>
        <p className="vide-texte largeur-propos">{erreur.message}</p>
        <div className="texte-note">
          Ce dossier n'a pas été ouvert. Un examen a été ouvert à votre nom :
          regroupez ces achats en un seul dossier, ou justifiez l'écart. Aucune
          alerte ne tranche à votre place — RG-022.
        </div>
      </div>

      <div className="marge-dessus-3">
        <Definitions
          entrees={[
            { cle: 'Montant de ce dossier', valeur: montant(donnees.montant_estime) },
            { cle: 'Cumul avec les dossiers liés', valeur: montant(donnees.cumul) },
            {
              cle: 'Ce dossier seul suivrait',
              valeur: donnees.procedure_seule ? libelle(donnees.procedure_seule) : '—',
            },
            {
              cle: 'Le cumul impose',
              valeur: donnees.procedure_cumul ? libelle(donnees.procedure_cumul) : '—',
            },
            {
              cle: 'Fenêtre de surveillance',
              valeur: donnees.fenetre_jours ? jours(donnees.fenetre_jours) : '—',
            },
            { cle: 'Objet rapproché', valeur: texte(donnees.objet) },
          ]}
        />
      </div>

      <h3 className="section-titre separe-dessus">Les achats concernés</h3>
      {concernes.chargement ? (
        <Chargement texte="Lecture des dossiers rapprochés…" lignes={2} />
      ) : concernes.erreur ? (
        <div className="marge-dessus-3">
          <Erreur
            erreur={concernes.erreur}
            surReessai={concernes.recharger}
            titre="Les dossiers rapprochés n'ont pas pu être lus"
          />
        </div>
      ) : (
        <div className="marge-dessus-3">
          <Tableau
            lignes={concernes.donnees ?? []}
            nomDesLignes="dossier rapproché"
            nomDesLignesPluriel="dossiers rapprochés"
            titreVide="Aucun dossier identifié"
            texteVide="Le serveur a bloqué sans nommer les dossiers rapprochés : son message ci-dessus reste la seule explication disponible."
            colonnes={[
              {
                cle: 'numero',
                titre: 'Dossier',
                rendu: (d) =>
                  d.illisible ? (
                    <span className="texte-note mono">{texte(d.id)}</span>
                  ) : (
                    <span className="mono">{texte(d.numero)}</span>
                  ),
              },
              {
                cle: 'objet',
                titre: 'Objet',
                rendu: (d) =>
                  d.illisible ? (
                    <span className="texte-note">Hors de votre périmètre de lecture — RG-017</span>
                  ) : (
                    texte(d.objet)
                  ),
              },
              {
                cle: 'montant_estime',
                titre: 'Estimé',
                nombre: true,
                valeur: (d) => Number(d.montant_estime ?? 0),
                rendu: (d) => (d.illisible ? '—' : montantCourt(d.montant_estime)),
              },
              {
                cle: 'procedure',
                titre: 'Procédure',
                rendu: (d) => (d.illisible ? '—' : libelle(d.procedure)),
              },
              { cle: 'cree_le', titre: 'Ouvert le', nombre: true, rendu: (d) => date(d.cree_le) },
            ]}
            pied="Les dossiers de même objet ouverts dans la fenêtre de surveillance, que le serveur a cumulés"
          />
        </div>
      )}
    </div>
  )
}
