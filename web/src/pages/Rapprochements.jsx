import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Lock, Plus, RefreshCw, Scale, UserPlus } from 'lucide-react'
import clsx from 'clsx'
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
import Vide, { Erreur, Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { depouillerListe, useRequete } from '../lib/requete.js'
import { useAgent, useRoles } from '../lib/agent.jsx'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { date, dateEnClair, horodatage, libelle, montant, montantCourt, nombre, texte } from '../lib/format.js'
import {
  ACTEURS,
  aAtteste,
  fonctionDeLAgent,
  nomDeLAgent,
  totauxDe,
  verdictDeCloture,
} from '../lib/inventaire.js'

/*
  Le rapprochement périodique contradictoire — décret 13/050, article 123 :
  « des rapprochements périodiques contradictoires sont effectués entre les
  données de la comptabilité des matières et celles de la comptabilité
  générale de l'État ».

  Contradictoire veut dire deux parties, et deux attestations : le comptable
  des matières et le comptable général. RG-027 : un rapprochement n'est clos
  qu'attesté par les deux. La règle est tenue par le serveur, qui rend son
  verdict dans `cloture_possible` ; l'écran l'affiche et grise le bouton.

  La comptabilité générale de l'État n'est pas interfacée : `valeur_generale`
  est une SAISIE, tandis que `valeur_matieres` est calculée par le système
  depuis le registre des biens. L'écart entre les deux vient du serveur, dans
  `totaux` — il n'est pas soustrait ici.
*/

const STATUTS = [
  { valeur: 'ouvert', libelle: 'Ouvert' },
  { valeur: 'constate', libelle: 'Constaté' },
  { valeur: 'clos', libelle: 'Clos' },
]

const TON_STATUT = { ouvert: 'attente', constate: 'info', clos: 'succes' }

const QUALITES = [
  { valeur: 'comptable_matieres', libelle: 'Comptable des matières' },
  { valeur: 'comptable_general', libelle: 'Comptable général' },
]

const ROLES_DE_TENUE = ['comptable_matieres', 'logistique']

export default function Rapprochements() {
  const [params, setParams] = useSearchParams()
  const navigue = useNavigate()
  const { id: ouvert } = useParams()
  const { aLeRole } = useRoles()

  const q = params.get('q') ?? ''
  const statut = params.get('statut') ?? ''
  const structure = params.get('structure') ?? ''

  function poser(cle, valeur) {
    const prochain = new URLSearchParams(params)
    if (valeur) prochain.set(cle, valeur)
    else prochain.delete(cle)
    setParams(prochain, { replace: true })
  }

  const liste = useRequete(
    (o) => api.rapprochements({ statut, structure, parPage: 200 }, o),
    [statut, structure],
  )
  const structures = useRequete((o) => api.structures(null, o), [])
  const [creation, setCreation] = useState(false)

  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant(['inventaire', 'rapprochement'], liste.recharger, marquer)

  const lignes = depouillerListe(liste.donnees).lignes
  const listeStructures = depouillerListe(structures.donnees).lignes

  const filtrees = useMemo(() => {
    const motif = q.trim().toLocaleLowerCase('fr')
    if (!motif) return lignes
    return lignes.filter((r) =>
      [r.numero, r.structure_nom, r.conclusion]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase('fr').includes(motif)),
    )
  }, [lignes, q])

  // Sans réponse du serveur, pas de chiffre : un tiret, jamais un zéro inventé.
  const sansListe = liste.chargement || Boolean(liste.erreur)

  const resume = useMemo(
    () => ({
      total: sansListe ? null : lignes.length,
      ouverts: sansListe ? null : lignes.filter((r) => r.statut === 'ouvert').length,
      constates: sansListe ? null : lignes.filter((r) => r.statut === 'constate').length,
      clos: sansListe ? null : lignes.filter((r) => r.statut === 'clos').length,
    }),
    [lignes, sansListe],
  )

  const peutTenir = aLeRole(...ROLES_DE_TENUE)
  const raisonCreation = peutTenir
    ? null
    : `L'ouverture d'un rapprochement revient au comptable des matières. ${ACTEURS.attestation}.`

  const colonnes = useMemo(
    () => [
      {
        cle: 'numero',
        titre: 'Rapprochement',
        largeur: '15%',
        rendu: (r) => (
          <span className="cellule-deux-lignes">
            <span className="mono">{texte(r.numero)}</span>
            <span className="texte-note">{texte(r.structure_nom)}</span>
          </span>
        ),
      },
      {
        cle: 'periode_debut',
        titre: 'Période',
        largeur: '16%',
        valeur: (r) => r.periode_debut ?? '',
        rendu: (r) => (
          <span className="cellule-deux-lignes">
            <span>
              du {date(r.periode_debut)} au {date(r.periode_fin)}
            </span>
            <span className="texte-note">
              {r.clos_le ? `clos le ${date(r.clos_le)}` : 'non clos'}
            </span>
          </span>
        ),
      },
      {
        cle: 'statut',
        titre: 'Statut',
        largeur: '11%',
        rendu: (r) => <Pastille valeur={r.statut} ton={TON_STATUT[r.statut]} />,
      },
      {
        cle: 'valeur_matieres',
        titre: 'Comptabilité des matières',
        nombre: true,
        largeur: '16%',
        valeur: (r) => Number(totauxDe(r)?.valeur_matieres ?? -1),
        rendu: (r) => direMontant(totauxDe(r)?.valeur_matieres),
      },
      {
        cle: 'valeur_generale',
        titre: 'Comptabilité générale',
        nombre: true,
        largeur: '16%',
        valeur: (r) => Number(totauxDe(r)?.valeur_generale ?? -1),
        rendu: (r) => direMontant(totauxDe(r)?.valeur_generale),
      },
      {
        cle: 'ecart',
        titre: 'Écart',
        nombre: true,
        largeur: '17%',
        valeur: (r) => Math.abs(Number(totauxDe(r)?.ecart ?? 0)),
        rendu: (r) => <Ecart valeur={totauxDe(r)?.ecart} />,
      },
      {
        cle: 'conclusion',
        titre: 'Conclusion',
        largeur: '11%',
        triable: false,
        rendu: (r) => <span className="cellule-faible">{texte(r.conclusion)}</span>,
      },
    ],
    [],
  )

  return (
    <Page
      titre="Rapprochements contradictoires"
      sousTitre="Des rapprochements périodiques contradictoires entre la comptabilité des matières et la comptabilité générale de l'État — décret 13/050, article 123"
      fil={[{ libelle: 'SIGL', to: '/' }, { libelle: 'Rapprochements' }]}
      actions={
        <>
          <Bouton icone={RefreshCw} surClic={liste.recharger}>
            Actualiser
          </Bouton>
          <Bouton
            allure="principale"
            icone={Plus}
            desactive={Boolean(raisonCreation)}
            titre={raisonCreation ?? undefined}
            surClic={() => setCreation(true)}
          >
            Ouvrir un rapprochement
          </Bouton>
        </>
      }
    >
      <Bento>
        <Bloc large={12} titre="Ce qui attend" note="Deux parties, deux attestations — RG-027">
          <RangeeChiffres>
            <Chiffre valeur={resume.total} libelle="Rapprochements" vers="/rapprochements" />
            <Chiffre
              valeur={resume.ouverts}
              libelle="Ouverts : les postes restent à saisir"
              appui={ACTEURS.attestation}
              vers="/rapprochements?statut=ouvert"
              ton={resume.ouverts > 0 ? 'attente' : undefined}
            />
            <Chiffre
              valeur={resume.constates}
              libelle="Constatés : attendent les attestations"
              appui={ACTEURS.attestation}
              vers="/rapprochements?statut=constate"
              ton={resume.constates > 0 ? 'attente' : undefined}
            />
            <Chiffre
              valeur={resume.clos}
              libelle="Clos"
              vers="/rapprochements?statut=clos"
              ton={resume.clos > 0 ? 'succes' : undefined}
            />
          </RangeeChiffres>
          <p className="marge-dessus-3 texte-faible largeur-propos sans-marge">
            La comptabilité générale de l'État n'est pas interfacée : la valeur
            générale de chaque poste est <strong>saisie</strong>, tandis que la
            valeur des matières est calculée par le système depuis le registre
            des biens. L'écart affiché est celui que le serveur rend ; il n'est
            pas soustrait par cet écran.
          </p>
        </Bloc>
      </Bento>

      <Filtres
        total={liste.erreur || liste.chargement ? undefined : filtrees.length}
        nom="rapprochement"
        nomPluriel="rapprochements"
      >
        <Recherche
          valeur={q}
          surChangement={(v) => poser('q', v)}
          placeholder="Numéro, structure, conclusion…"
        />
        <Filtre
          libelle="Statut"
          valeur={statut}
          surChangement={(v) => poser('statut', v)}
          options={STATUTS}
          toutes="Tous les statuts"
        />
        <Filtre
          libelle="Structure"
          valeur={structure}
          surChangement={(v) => poser('structure', v)}
          options={listeStructures.map((s) => ({ valeur: s.id, libelle: s.nom }))}
          toutes="Toutes les structures"
        />
      </Filtres>

      <Etat
        chargement={liste.chargement}
        erreur={liste.erreur}
        recharger={liste.recharger}
        texteChargement="Lecture des rapprochements…"
      >
        <Tableau
          colonnes={colonnes}
          lignes={filtrees}
          nomDesLignes="rapprochement"
          nomDesLignesPluriel="rapprochements"
          triInitial={{ cle: 'periode_debut', sens: 'desc' }}
          surClic={(r) => navigue(`/rapprochements/${r.id}${window.location.search}`)}
          ligneChoisie={(r) => String(r.id) === String(ouvert)}
          ligneSignalee={(r) => Number(totauxDe(r)?.ecart ?? 0) !== 0}
          ligneMarquee={(r) => estMarque(r.id)}
          titreVide="Aucun rapprochement"
          texteVide={
            q || statut || structure
              ? 'Aucun rapprochement ne répond à ces critères. Retirez un filtre pour voir le reste.'
              : "Aucun rapprochement n'existe pour votre périmètre. L'article 123 du décret 13/050 en veut un périodiquement : ouvrez-en un sur une période, saisissez les postes, puis faites attester les deux parties."
          }
          actionVide={
            peutTenir ? (
              <Bouton allure="principale" icone={Plus} surClic={() => setCreation(true)}>
                Ouvrir un rapprochement
              </Bouton>
            ) : (
              <span className="texte-note">{raisonCreation}</span>
            )
          }
          pied={`${nombre(filtrees.length)} rapprochement(s) affiché(s) · les lignes signalées portent un écart non nul`}
        />
        <p className="marge-dessus-3 texte-note largeur-propos">
          Les totaux d'un rapprochement sont servis avec son détail. Quand la
          liste ne les porte pas, la colonne reste à « non servi » : rien n'est
          supposé ici. Ouvrez une ligne pour voir les postes, les deux parties
          et le verdict de clôture.
        </p>
      </Etat>

      {ouvert ? (
        <FicheRapprochement
          id={ouvert}
          surFermeture={() => navigue(`/rapprochements${window.location.search}`)}
          surChangement={liste.recharger}
        />
      ) : null}

      {creation ? (
        <DialogueRapprochement
          structures={listeStructures}
          surFermeture={() => setCreation(false)}
          surSucces={(cree) => {
            setCreation(false)
            liste.recharger()
            if (cree?.id) navigue(`/rapprochements/${cree.id}`)
          }}
        />
      ) : null}
    </Page>
  )
}

function direMontant(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') {
    return <span className="texte-note">non servi</span>
  }
  return montantCourt(valeur)
}

/** L'écart entre les deux comptabilités, tel que le serveur le rend. */
function Ecart({ valeur, long = false }) {
  if (valeur === null || valeur === undefined || valeur === '') {
    return <span className="texte-note">non servi</span>
  }
  const n = Number(valeur)
  if (!Number.isFinite(n)) return <span className="texte-note">—</span>
  if (n === 0) return <span>{long ? montant(0) : montantCourt(0)}</span>
  return (
    <span className={clsx(n !== 0 && 'cellule-deux-lignes')}>
      <span>
        {n > 0 ? '+' : '−'}
        {long ? montant(Math.abs(n)) : montantCourt(Math.abs(n))}
      </span>
      <span className="texte-note">
        {n > 0 ? 'matières > générale' : 'générale > matières'}
      </span>
    </span>
  )
}

/* --------------------------------------------------------------------- */
/* Le détail : les postes, les deux parties, la clôture                  */
/* --------------------------------------------------------------------- */

function FicheRapprochement({ id, surFermeture, surChangement }) {
  const { agent } = useAgent()
  const { aLeRole } = useRoles()
  const fiche = useRequete((o) => api.rapprochement(id, o), [id])
  const [action, setAction] = useState(null) // 'poste' | 'partie' | 'attester' | 'cloture'

  const detail = fiche.donnees ?? null
  const rapprochement = detail?.rapprochement ?? null
  const postes = Array.isArray(detail?.postes) ? detail.postes : []
  const parties = Array.isArray(detail?.parties) ? detail.parties : []
  const totaux = totauxDe(detail)
  const verdict = verdictDeCloture(detail)

  const maPartie = parties.find((p) => String(p.agent_id) === String(agent?.id)) ?? null
  const manquantes = QUALITES.filter(
    (q) => !parties.some((p) => p.qualite === q.valeur && aAtteste(p)),
  )

  const peutTenir = aLeRole(...ROLES_DE_TENUE)
  const raisonTenue = peutTenir
    ? null
    : "La tenue d'un rapprochement revient au comptable des matières."

  const raisonAttestation = !maPartie
    ? "Vous n'êtes pas désigné partie de ce rapprochement : seules les deux parties désignées attestent — décret 13/050, article 123."
    : aAtteste(maPartie)
      ? `Vous avez déjà attesté, le ${dateEnClair(maPartie.atteste_le)}.`
      : rapprochement?.statut === 'clos'
        ? 'Ce rapprochement est clos : il n’y a plus rien à attester.'
        : null

  const raisonCloture = raisonTenue ?? (verdict.possible ? null : verdict.motif)

  return (
    <>
      <Tiroir
        ouvert
        surFermeture={surFermeture}
        surTitre="Rapprochement contradictoire"
        titre={
          rapprochement ? (
            <span className="mono">{texte(rapprochement.numero)}</span>
          ) : fiche.chargement ? (
            'Lecture…'
          ) : (
            'Non lisible'
          )
        }
        sousTitre={
          rapprochement
            ? `${texte(rapprochement.structure_nom)} · du ${date(rapprochement.periode_debut)} au ${date(rapprochement.periode_fin)}`
            : undefined
        }
        pied={
          <>
            <Bouton
              icone={Plus}
              desactive={Boolean(raisonTenue) || rapprochement?.statut === 'clos'}
              titre={
                rapprochement?.statut === 'clos'
                  ? 'Ce rapprochement est clos : ses postes sont arrêtés.'
                  : (raisonTenue ?? undefined)
              }
              surClic={() => setAction('poste')}
            >
              Saisir un poste
            </Bouton>
            <Bouton
              icone={UserPlus}
              desactive={Boolean(raisonTenue) || rapprochement?.statut === 'clos'}
              titre={raisonTenue ?? undefined}
              surClic={() => setAction('partie')}
            >
              Désigner une partie
            </Bouton>
            <Bouton
              icone={BadgeCheck}
              desactive={Boolean(raisonAttestation)}
              titre={raisonAttestation ?? undefined}
              surClic={() => setAction('attester')}
            >
              Attester
            </Bouton>
            <Bouton
              allure="principale"
              icone={Lock}
              desactive={Boolean(raisonCloture)}
              titre={raisonCloture ?? undefined}
              surClic={() => setAction('cloture')}
            >
              Clore
            </Bouton>
          </>
        }
      >
        <Etat
          chargement={fiche.chargement}
          erreur={fiche.erreur}
          recharger={fiche.recharger}
          texteChargement="Lecture du rapprochement, de ses postes et de ses parties…"
          vide={!rapprochement && !fiche.chargement && !fiche.erreur}
          titreVide="Ce rapprochement n'est pas lisible"
          texteVide="Le serveur n'a rendu aucun rapprochement pour cette adresse : il n'existe pas, ou il relève d'une autre structure — RG-017."
        >
          <Definitions
            entrees={[
              {
                cle: 'Statut',
                valeur: <Pastille valeur={rapprochement?.statut} ton={TON_STATUT[rapprochement?.statut]} />,
              },
              { cle: 'Période', valeur: `du ${date(rapprochement?.periode_debut)} au ${date(rapprochement?.periode_fin)}` },
              { cle: 'Structure', valeur: texte(rapprochement?.structure_nom) },
              { cle: 'Comptabilité des matières', valeur: direMontant(totaux?.valeur_matieres) },
              { cle: 'Comptabilité générale', valeur: direMontant(totaux?.valeur_generale) },
              { cle: 'Écart', valeur: <Ecart valeur={totaux?.ecart} long /> },
              { cle: 'Conclusion', valeur: texte(rapprochement?.conclusion) },
              { cle: 'Clos le', valeur: horodatage(rapprochement?.clos_le) },
            ]}
          />

          <h3 className="section-titre separe-dessus">Le contradictoire</h3>
          <p className="marge-dessus-3 texte-faible largeur-propos sans-marge">
            {manquantes.length === 0
              ? 'Les deux parties ont attesté : le contradictoire est établi — RG-027.'
              : `Il manque l'attestation de : ${manquantes.map((q) => q.libelle).join(' et ')}. Un rapprochement n'est clos qu'attesté par les deux parties — RG-027.`}
          </p>
          <div className="marge-dessus-3">
            {parties.length === 0 ? (
              <Vide
                titre="Aucune partie n'est désignée"
                texte="Un rapprochement contradictoire se tient à deux : le comptable des matières et le comptable général. Sans les deux, il ne se clôt pas."
              />
            ) : (
              <Tableau
                lignes={parties}
                cleDeLigne={(p, i) => p.id ?? `${p.agent_id}-${p.qualite}-${i}`}
                nomDesLignes="partie"
                nomDesLignesPluriel="parties"
                /* Pas de largeurs dans le tiroir : un tableau à colonnes
                   fixées porte une largeur minimale de lecture, et il
                   défilerait de côté dans un panneau étroit. */
                colonnes={[
                  {
                    cle: 'qualite',
                    titre: 'Qualité',
                    rendu: (p) => libelle(p.qualite),
                  },
                  {
                    cle: 'nom',
                    titre: 'Agent',
                    rendu: (p) => (
                      <span className="cellule-deux-lignes">
                        <span>{texte(nomDeLAgent(p))}</span>
                        <span className="texte-note">{texte(fonctionDeLAgent(p))}</span>
                      </span>
                    ),
                  },
                  {
                    // La réserve se lit sous l'attestation qu'elle qualifie,
                    // et non dans une colonne de plus : le tiroir est étroit.
                    cle: 'atteste_le',
                    titre: 'Attestation et réserve',
                    rendu: (p) => (
                      <span className="cellule-deux-lignes">
                        {aAtteste(p) ? (
                          <Pastille valeur="atteste" ton="succes" texte="Attesté" />
                        ) : (
                          <Pastille valeur="attendu" ton="attente" texte="Attendu" />
                        )}
                        <span className="texte-note" title={p.reserve ?? undefined}>
                          {aAtteste(p) ? horodatage(p.atteste_le) : 'Attendue'}
                          {p.reserve ? ` · réserve : ${p.reserve}` : ''}
                        </span>
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </div>

          <h3 className="section-titre separe-dessus">Les postes, catégorie par catégorie</h3>
          <div className="marge-dessus-3">
            {postes.length === 0 ? (
              <Vide
                titre="Aucun poste n'est saisi"
                texte="Un rapprochement se fait poste par poste : pour chaque catégorie, la valeur portée par la comptabilité des matières, celle portée par la comptabilité générale, et l'explication de l'écart. Saisissez le premier poste."
                action={
                  <Bouton
                    allure="principale"
                    icone={Plus}
                    desactive={Boolean(raisonTenue)}
                    titre={raisonTenue ?? undefined}
                    surClic={() => setAction('poste')}
                  >
                    Saisir un poste
                  </Bouton>
                }
              />
            ) : (
              <Tableau
                lignes={postes}
                nomDesLignes="poste"
                nomDesLignesPluriel="postes"
                ligneSignalee={(p) => ecartDuPoste(p) !== null && ecartDuPoste(p) !== 0}
                colonnes={[
                  {
                    // Le tiroir est étroit : l'explication tient sous la
                    // catégorie plutôt que dans une cinquième colonne qui
                    // ferait défiler le tableau de côté.
                    cle: 'categorie_code',
                    titre: 'Catégorie',
                    rendu: (p) => (
                      <span className="cellule-deux-lignes">
                        <span>
                          <span className="mono">{texte(p.categorie_code)}</span>{' '}
                          {texte(p.categorie_libelle)}
                        </span>
                        <span className="texte-note" title={p.explication ?? undefined}>
                          {texte(p.explication) === '—' ? 'Sans explication' : texte(p.explication)}
                        </span>
                      </span>
                    ),
                  },
                  {
                    cle: 'valeur_matieres',
                    titre: 'Matières',
                    nombre: true,
                    valeur: (p) => Number(p.valeur_matieres ?? 0),
                    rendu: (p) => direMontant(p.valeur_matieres),
                  },
                  {
                    cle: 'valeur_generale',
                    titre: 'Générale',
                    nombre: true,
                    valeur: (p) => Number(p.valeur_generale ?? -1),
                    rendu: (p) =>
                      p.valeur_generale === null || p.valeur_generale === undefined ? (
                        <span className="texte-note">non saisie</span>
                      ) : (
                        montantCourt(p.valeur_generale)
                      ),
                  },
                  {
                    cle: 'ecart',
                    titre: 'Écart',
                    nombre: true,
                    valeur: (p) => Math.abs(ecartDuPoste(p) ?? 0),
                    rendu: (p) => <Ecart valeur={ecartDuPoste(p)} />,
                  },
                ]}
                pied={
                  totaux
                    ? `Totaux servis par le serveur — matières ${texteMontant(totaux.valeur_matieres)} · générale ${texteMontant(totaux.valeur_generale)} · écart ${texteMontant(totaux.ecart)}`
                    : `${nombre(postes.length)} poste(s) · les totaux ne sont pas servis par le serveur`
                }
              />
            )}
          </div>

          <h3 className="section-titre separe-dessus">La clôture</h3>
          <p className="marge-dessus-3 sans-marge largeur-propos">
            {verdict.possible
              ? 'Le serveur annonce la clôture possible : les deux parties ont attesté — RG-027.'
              : verdict.motif}
          </p>
          <div className="texte-note marge-dessus-1">
            {verdict.servi
              ? 'Verdict rendu par le serveur dans « cloture_possible ». Cet écran l’affiche sans le refaire.'
              : "Aucun verdict n'est servi par le serveur : par prudence, la clôture reste fermée."}
          </div>
        </Etat>
      </Tiroir>

      {action === 'poste' && rapprochement ? (
        <DialoguePoste
          rapprochement={rapprochement}
          postes={postes}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
            surChangement?.()
          }}
        />
      ) : null}

      {action === 'partie' && rapprochement ? (
        <DialoguePartie
          rapprochement={rapprochement}
          parties={parties}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
            surChangement?.()
          }}
        />
      ) : null}

      {action === 'attester' && rapprochement ? (
        <DialogueAttestation
          rapprochement={rapprochement}
          partie={maPartie}
          totaux={totaux}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
            surChangement?.()
          }}
        />
      ) : null}

      {action === 'cloture' && rapprochement ? (
        <DialogueClotureRapprochement
          rapprochement={rapprochement}
          verdict={verdict}
          totaux={totaux}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
            surChangement?.()
          }}
        />
      ) : null}
    </>
  )
}

/*
  L'écart d'un poste vient du serveur, qui le rend à côté des deux valeurs et
  le laisse à `null` tant que la comptabilité générale n'est pas saisie. On ne
  soustrait rien ici : sans écart servi, la colonne reste vide et le dit.
*/
function ecartDuPoste(poste) {
  if (poste?.ecart !== null && poste?.ecart !== undefined && poste.ecart !== '') {
    return Number(poste.ecart)
  }
  return null
}

function texteMontant(valeur) {
  return valeur === null || valeur === undefined || valeur === '' ? 'non servi' : montant(valeur)
}

/* --------------------------------------------------------------------- */
/* Ouvrir un rapprochement — POST /api/rapprochements                    */
/* --------------------------------------------------------------------- */

function DialogueRapprochement({ structures, surFermeture, surSucces }) {
  const [structureId, setStructureId] = useState('')
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const periodeInversee = debut !== '' && fin !== '' && fin < debut
  const valide = structureId !== '' && debut !== '' && fin !== '' && !periodeInversee

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      const reponse = await api.creerRapprochement({
        structure_id: structureId,
        periode_debut: debut,
        periode_fin: fin,
      })
      surSucces(reponse?.rapprochement ?? reponse)
    } catch (cause) {
      setErreur(cause)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialogue
      ouvert
      titre="Ouvrir un rapprochement contradictoire"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton allure="principale" icone={Scale} desactive={!valide || envoi} surClic={envoyer}>
            {envoi ? 'Envoi…' : 'Ouvrir'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        Le rapprochement porte sur une période. Il naît <strong>ouvert</strong> :
        ses postes restent à saisir, catégorie par catégorie, et ses deux
        parties à désigner — le comptable des matières et le comptable général.
      </p>
      <div className="marge-dessus-3 pile largeur-formulaire">
        <Champ
          libelle="Structure"
          type="choix"
          obligatoire
          valeur={structureId}
          surChangement={setStructureId}
          options={structures.map((s) => ({ valeur: s.id, libelle: `${s.code} — ${s.nom}` }))}
          aide="Une structure autonome tient sa propre comptabilité des matières : son rapprochement est le sien."
        />
        <Champ
          libelle="Début de la période"
          type="date"
          obligatoire
          valeur={debut}
          surChangement={setDebut}
        />
        <Champ
          libelle="Fin de la période"
          type="date"
          obligatoire
          valeur={fin}
          surChangement={setFin}
          erreur={periodeInversee ? 'La fin de période précède son début.' : undefined}
        />
      </div>
      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé le rapprochement" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Saisir un poste — POST /api/rapprochements/:id/postes                 */
/* --------------------------------------------------------------------- */

function DialoguePoste({ rapprochement, postes, surFermeture, surSucces }) {
  const [categorie, setCategorie] = useState('')
  const [valeur, setValeur] = useState('')
  const [explication, setExplication] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const categories = useRequete((o) => api.categories(null, o), [])
  const liste = depouillerListe(categories.donnees).lignes
  const dejaSaisies = new Set(postes.map((p) => String(p.categorie_code)))

  const doublon = categorie !== '' && dejaSaisies.has(String(categorie))
  const valide = categorie !== '' && valeur !== '' && Number.isFinite(Number(valeur)) && !doublon

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.ajouterPosteRapprochement(rapprochement.id, {
        categorie_code: categorie,
        valeur_generale: Number(valeur),
        ...(explication.trim() === '' ? {} : { explication: explication.trim() }),
      })
      surSucces()
    } catch (cause) {
      setErreur(cause)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialogue
      ouvert
      titre="Saisir un poste du rapprochement"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton allure="principale" icone={Plus} desactive={!valide || envoi} surClic={envoyer}>
            {envoi ? 'Envoi…' : 'Enregistrer le poste'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        La valeur de la comptabilité des matières est calculée par le système
        depuis le registre des biens : elle ne se saisit pas. Ce qui se saisit,
        c'est la valeur portée par la <strong>comptabilité générale de
        l'État</strong>, qui n'est pas interfacée — et l'explication de l'écart,
        quand il y en a un.
      </p>
      {categories.erreur ? (
        <div className="marge-dessus-3">
          <Erreur
            erreur={categories.erreur}
            surReessai={categories.recharger}
            titre="La nomenclature n'a pas pu être lue"
          />
        </div>
      ) : null}
      <div className="marge-dessus-3 pile largeur-formulaire">
        <Champ
          libelle="Catégorie"
          type="choix"
          obligatoire
          valeur={categorie}
          surChangement={setCategorie}
          options={liste.map((c) => ({ valeur: c.code, libelle: `${c.code} — ${c.libelle}` }))}
          erreur={doublon ? 'Cette catégorie porte déjà un poste dans ce rapprochement.' : undefined}
        />
        <Champ
          libelle="Valeur portée par la comptabilité générale (FC)"
          type="number"
          obligatoire
          pas="0.01"
          valeur={valeur}
          surChangement={setValeur}
          aide="En francs congolais. C'est une saisie : le SIGL ne lit pas la comptabilité générale."
        />
        <Champ
          libelle="Explication de l'écart"
          type="zone"
          lignes={3}
          valeur={explication}
          surChangement={setExplication}
          aide="Facultative tant qu'il n'y a pas d'écart ; attendue dès qu'il y en a un."
        />
      </div>
      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé le poste" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Désigner une partie — POST /api/rapprochements/:id/parties            */
/* --------------------------------------------------------------------- */

function DialoguePartie({ rapprochement, parties, surFermeture, surSucces }) {
  const [agentId, setAgentId] = useState('')
  const [qualite, setQualite] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const profils = useRequete((o) => api.profils(o), [])
  const liste = depouillerListe(profils.donnees).lignes
  const prise = qualite !== '' && parties.some((p) => p.qualite === qualite)
  const valide = agentId !== '' && qualite !== '' && !prise

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.ajouterPartieRapprochement(rapprochement.id, { agent_id: agentId, qualite })
      surSucces()
    } catch (cause) {
      setErreur(cause)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialogue
      ouvert
      titre="Désigner une partie du rapprochement"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton allure="principale" icone={UserPlus} desactive={!valide || envoi} surClic={envoyer}>
            {envoi ? 'Envoi…' : 'Désigner'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        Le rapprochement est <strong>contradictoire</strong> : il se tient entre
        le comptable des matières et le comptable général — décret 13/050,
        article 123. Une seule personne par qualité.
      </p>
      {profils.erreur ? (
        <div className="marge-dessus-3">
          <Erreur
            erreur={profils.erreur}
            surReessai={profils.recharger}
            titre="La liste des agents n'a pas pu être lue"
          />
        </div>
      ) : null}
      <div className="marge-dessus-3 pile largeur-formulaire">
        <Champ
          libelle="Agent"
          type="choix"
          obligatoire
          valeur={agentId}
          surChangement={setAgentId}
          options={liste.map((a) => ({
            valeur: a.id,
            libelle: `${texte(a.nom)} — ${texte(a.fonction)} (${texte(a.structure_code)})`,
          }))}
        />
        <Champ
          libelle="Qualité"
          type="choix"
          obligatoire
          valeur={qualite}
          surChangement={setQualite}
          options={QUALITES}
          erreur={prise ? 'Cette qualité est déjà portée par une partie désignée.' : undefined}
        />
      </div>
      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé la désignation" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Attester — POST /api/rapprochements/:id/attester                      */
/* --------------------------------------------------------------------- */

function DialogueAttestation({ rapprochement, partie, totaux, surFermeture, surSucces }) {
  const [reserve, setReserve] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.attesterRapprochement(rapprochement.id, {
        ...(reserve.trim() === '' ? {} : { reserve: reserve.trim() }),
      })
      surSucces()
    } catch (cause) {
      setErreur(cause)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialogue
      ouvert
      titre="Attester le rapprochement"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton allure="principale" icone={BadgeCheck} desactive={envoi} surClic={envoyer}>
            {envoi ? 'Envoi…' : 'Attester'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        Vous attestez en qualité de <strong>{libelle(partie?.qualite)}</strong>.
        L'attestation est datée et journalisée — RG-020. Une réserve, si vous en
        portez une, est conservée telle quelle et lisible par le contrôle
        externe : elle n'empêche pas la clôture, elle la qualifie.
      </p>
      <div className="marge-dessus-3">
        <Definitions
          entrees={[
            { cle: 'Rapprochement', valeur: <span className="mono">{texte(rapprochement.numero)}</span> },
            {
              cle: 'Période',
              valeur: `du ${date(rapprochement.periode_debut)} au ${date(rapprochement.periode_fin)}`,
            },
            { cle: 'Comptabilité des matières', valeur: direMontant(totaux?.valeur_matieres) },
            { cle: 'Comptabilité générale', valeur: direMontant(totaux?.valeur_generale) },
            { cle: 'Écart', valeur: <Ecart valeur={totaux?.ecart} long /> },
          ]}
        />
      </div>
      <div className="marge-dessus-3">
        <Champ
          libelle="Réserve (facultative)"
          type="zone"
          lignes={4}
          valeur={reserve}
          surChangement={setReserve}
          aide="Ce sur quoi vous n'êtes pas d'accord, dit en clair. Conservée au rapprochement."
        />
      </div>
      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé l'attestation" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Clore — RG-027, vérifiée par le serveur                               */
/* --------------------------------------------------------------------- */

function DialogueClotureRapprochement({ rapprochement, verdict, totaux, surFermeture, surSucces }) {
  const [conclusion, setConclusion] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const valide = conclusion.trim().length >= 5 && verdict.possible

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.cloreRapprochement(rapprochement.id, { conclusion: conclusion.trim() })
      surSucces()
    } catch (cause) {
      setErreur(cause)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialogue
      ouvert
      titre="Clore le rapprochement"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={Lock}
            desactive={!valide || envoi}
            titre={
              verdict.possible
                ? valide
                  ? undefined
                  : 'Une conclusion est attendue.'
                : (verdict.motif ?? undefined)
            }
            surClic={envoyer}
          >
            {envoi ? 'Envoi…' : 'Clore'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        Un rapprochement n'est clos qu'attesté par les deux parties — RG-027. La
        règle est tenue par le serveur ; ce qui est affiché ici est son verdict.
      </p>
      <p className="marge-dessus-3 sans-marge largeur-propos">
        {verdict.possible ? 'Le serveur annonce la clôture possible.' : verdict.motif}
      </p>
      <div className="marge-dessus-3">
        <Definitions
          entrees={[
            { cle: 'Rapprochement', valeur: <span className="mono">{texte(rapprochement.numero)}</span> },
            {
              cle: 'Période',
              valeur: `du ${date(rapprochement.periode_debut)} au ${date(rapprochement.periode_fin)}`,
            },
            { cle: 'Écart constaté', valeur: <Ecart valeur={totaux?.ecart} long /> },
          ]}
        />
      </div>
      <div className="marge-dessus-3">
        <Champ
          libelle="Conclusion du rapprochement"
          type="zone"
          lignes={4}
          obligatoire
          valeur={conclusion}
          surChangement={setConclusion}
          aide="Ce que les deux comptabilités disent ensemble, et ce qui reste à régulariser. Conservée au rapprochement."
        />
      </div>
      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé la clôture" />
        </div>
      ) : null}
    </Dialogue>
  )
}
