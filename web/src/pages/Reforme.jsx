import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Gavel,
  Landmark,
  Lock,
  MessageSquareQuote,
  PackageOpen,
  RefreshCw,
  Scale,
  UserPlus,
} from 'lucide-react'
import Page, { Section } from '../components/Page.jsx'
import Bento, { Bloc } from '../components/Bento.jsx'
import Tableau from '../components/Tableau.jsx'
import Pastille from '../components/Pastille.jsx'
import Bouton from '../components/Bouton.jsx'
import Champ from '../components/Champ.jsx'
import Definitions from '../components/Definitions.jsx'
import Dialogue from '../components/Dialogue.jsx'
import CheminDeFer from '../components/CheminDeFer.jsx'
import Vide, { Erreur, Etat } from '../components/Vide.jsx'
import api from '../lib/api.js'
import { depouillerListe, useRequete } from '../lib/requete.js'
import { useAgent, useRoles } from '../lib/agent.jsx'
import { useMarquage, useRafraichissementVivant } from '../lib/flux.js'
import { fonctionDeLAgent, nomDeLAgent } from '../lib/inventaire.js'
import { date, dateEnClair, horodatage, jours, libelle, nombre, texte } from '../lib/format.js'
import {
  ACTEURS,
  AVIS,
  DECISIONS_DEMANDE,
  QUALITES_COMMISSION,
  ROLES_DE_LOGISTIQUE,
  SUITES_DOMAINES,
  bienDuDetail,
  decisionDuDetail,
  estDeposee,
  etapesDe,
  etatDeLaCommission,
  motifDeLaProposition,
  motifDuVerdict,
  pvDuDossier,
  nomDuDossier,
  offrePubliee,
  tacheDuDossier,
  tonDuStatutOffre,
  verdictDe,
} from '../lib/reforme.js'

/*
  Le dossier de réforme : un POSTE DE TRAVAIL, pas un rapport.

  Décret 13/050 : la cession et la mise au rebut des biens d'actif relèvent de
  l'administration en charge des domaines. Le SIGL instruit, produit le
  procès-verbal, saisit les domaines et suit la décision — il ne la prend pas,
  RG-016, et RG-032 veut que la décision s'enregistre avec son autorité, sa
  référence et sa date.

  Ce que le serveur rend, et que cet écran se contente d'afficher :
    { dossier, bien, commission[], avis[], offre, demandes[], decision, etapes }

  `etapes` porte les SEPT étapes du circuit, chacune jugée par le serveur :
  { numero, libelle, etat, le, par_nom }. **L'écran l'affiche, il ne la déduit
  pas.** S'il recalculait l'avancement, il en détiendrait l'autorité et les
  deux jugements finiraient par diverger.

  `offre_possible`, `saisine_possible` et `decision_possible` sont des
  { possible, code, motif } : le bouton se grise d'après `possible` et le motif
  est affiché TEL QUEL. RG-028 (pas de saisine sans offre close), RG-029,
  RG-030, RG-031 et RG-032 ne sont réimplémentées nulle part ici.
*/

export default function Reforme() {
  const { id } = useParams()
  const { agent } = useAgent()
  const { aLeRole } = useRoles()

  const fiche = useRequete((o) => api.dossierReforme(id, o), [id])
  const { marquer, estMarque } = useMarquage()
  useRafraichissementVivant(['reforme', 'reemploi'], fiche.recharger, marquer)

  const [action, setAction] = useState(null)
  const [demandeOuverte, setDemandeOuverte] = useState(null)

  const detail = fiche.donnees ?? null
  const dossier = detail?.dossier ?? null
  const bien = bienDuDetail(detail)
  const commission = Array.isArray(detail?.commission) ? detail.commission : []
  const avis = Array.isArray(detail?.avis) ? detail.avis : []
  const offre = detail?.offre ?? null
  const publiee = offrePubliee(offre)
  const demandes = Array.isArray(detail?.demandes) ? detail.demandes : []
  const decision = decisionDuDetail(detail)
  const etapes = etapesDe(detail)
  const etatCommission = etatDeLaCommission(detail)
  const pv = pvDuDossier(detail)

  const verdictOffre = verdictDe(detail, 'offre_possible')
  const verdictSaisine = verdictDe(detail, 'saisine_possible')
  const verdictDecision = verdictDe(detail, 'decision_possible')
  const tache = tacheDuDossier(dossier, etapes)

  const estLogistique = aLeRole(...ROLES_DE_LOGISTIQUE)
  const raisonLogistique = estLogistique
    ? null
    : `Offrir au réemploi, clore l'offre, trancher une demande, saisir les domaines et enregistrer leur décision reviennent au chargé de logistique centrale. ${ACTEURS.offre}.`

  // Être désigné à la commission se LIT dans `commission[]` : ce n'est pas un
  // jugement de règle, c'est une appartenance. RG-030 — qui propose ne siège
  // pas — reste tenue par le serveur, qui refuse et le dit.
  const estMembre = commission.some((m) => String(m.agent_id) === String(agent?.id))
  const raisonAvis = estMembre
    ? null
    : `Un avis est donné par un membre désigné à la commission, hors celui qui a proposé la réforme — RG-030. ${ACTEURS.commission}.`

  // Les trois gestes de la logistique : le verdict du serveur d'abord, la
  // raison de profil ensuite. On n'ouvre jamais une action sans verdict.
  const raisonOffre = raisonLogistique ?? motifDuVerdict(verdictOffre)
  const raisonSaisine = raisonLogistique ?? motifDuVerdict(verdictSaisine)
  const raisonDecision = raisonLogistique ?? motifDuVerdict(verdictDecision)
  const raisonCloture =
    raisonLogistique ??
    (offre?.statut === 'ouverte'
      ? null
      : offre
        ? `Cette offre est « ${libelle(offre.statut)} » : elle ne se clôt qu'une fois.`
        : "Aucune offre de réemploi n'est ouverte sur ce dossier.")

  if (fiche.chargement || fiche.erreur || !dossier) {
    return (
      <Page
        titre="Dossier de réforme"
        fil={[
          { libelle: 'SIGL', to: '/' },
          { libelle: 'Réformes', to: '/reforme' },
          { libelle: 'Dossier' },
        ]}
        actions={
          <Bouton icone={RefreshCw} surClic={fiche.recharger}>
            Actualiser
          </Bouton>
        }
      >
        <Etat
          chargement={fiche.chargement}
          erreur={fiche.erreur}
          recharger={fiche.recharger}
          texteChargement="Lecture du dossier, de sa commission, de son offre et des demandes reçues…"
          vide={!dossier}
          titreVide="Ce dossier n'est pas lisible"
          texteVide="Le serveur n'a rendu aucun dossier pour cette adresse : il n'existe pas, ou il relève d'une autre structure — RG-017."
          actionVide={
            <Bouton allure="principale" vers="/reforme">
              Revenir aux réformes
            </Bouton>
          }
        >
          {null}
        </Etat>
      </Page>
    )
  }

  return (
    <Page
      titre={nomDuDossier(dossier) ?? 'Dossier de réforme'}
      sousTitre={`${texte(bien.structure_nom ?? bien.structure_code)} · ${texte(
        bien.site_nom,
      )} · dossier ouvert le ${dateEnClair(dossier.cree_le ?? dossier.propose_le)}`}
      fil={[
        { libelle: 'SIGL', to: '/' },
        { libelle: 'Réformes', to: '/reforme' },
        { libelle: texte(dossier.numero) },
      ]}
      actions={
        <>
          <Bouton icone={RefreshCw} surClic={fiche.recharger}>
            Actualiser
          </Bouton>
          <Bouton icone={UserPlus} surClic={() => setAction('membre')}>
            Désigner un membre
          </Bouton>
          <Bouton
            icone={MessageSquareQuote}
            desactive={Boolean(raisonAvis)}
            titre={raisonAvis ?? undefined}
            surClic={() => setAction('avis')}
          >
            Proposer un avis
          </Bouton>
          <Bouton
            icone={PackageOpen}
            desactive={Boolean(raisonOffre)}
            titre={raisonOffre ?? undefined}
            surClic={() => setAction('offrir')}
          >
            Offrir au réemploi
          </Bouton>
          <Bouton
            icone={Landmark}
            desactive={Boolean(raisonSaisine)}
            titre={raisonSaisine ?? undefined}
            surClic={() => setAction('saisir')}
          >
            Saisir les domaines
          </Bouton>
          <Bouton
            allure="principale"
            icone={Scale}
            desactive={Boolean(raisonDecision)}
            titre={raisonDecision ?? undefined}
            surClic={() => setAction('decision')}
          >
            Enregistrer la décision
          </Bouton>
        </>
      }
    >
      <Bento>
        <Bloc
          large={12}
          titre="Le circuit"
          note="Les sept étapes, et leur état, tels que le serveur les rend"
        >
          <CheminDeFer etapes={etapes} />
          <div className="circuit-etape est-courante marge-dessus-3">
            <span className="circuit-puce" aria-hidden="true" />
            <span className="circuit-nom">
              {tache.quoi}
              {tache.acteur ? <span className="texte-note"> — {tache.acteur}</span> : null}
            </span>
          </div>
        </Bloc>

        <Bloc
          large={5}
          titre="Le bien concerné"
          actions={
            bien.id ? (
              <Bouton taille="petite" allure="discrete" vers={`/patrimoine/${bien.id}`}>
                Ouvrir la fiche du bien
              </Bouton>
            ) : null
          }
        >
          <Definitions
            entrees={[
              {
                cle: 'Immatriculation',
                valeur: bien.id ? (
                  <Link className="mono" to={`/patrimoine/${bien.id}`}>
                    {texte(bien.immatriculation)}
                  </Link>
                ) : (
                  <span className="mono">{texte(bien.immatriculation)}</span>
                ),
              },
              { cle: 'Désignation', valeur: texte(bien.designation) },
              { cle: 'Catégorie', valeur: texte(bien.categorie_code) },
              {
                cle: 'État au registre',
                valeur: bien.etat ? <Pastille valeur={bien.etat} /> : '—',
              },
              { cle: 'Structure', valeur: texte(bien.structure_nom ?? bien.structure_code) },
              { cle: 'Site', valeur: texte(bien.site_nom) },
              { cle: 'Statut du dossier', valeur: <Pastille valeur={dossier.statut} /> },
              { cle: 'Motif de la proposition', valeur: texte(motifDeLaProposition(dossier)) },
              { cle: 'Proposé par', valeur: texte(dossier.propose_par_nom ?? dossier.par_nom) },
            ]}
          />
          <p className="marge-dessus-3 texte-note largeur-propos">
            RG-015 : le bien ne disparaît jamais du registre, quelle que soit
            l'issue du circuit.
          </p>
        </Bloc>

        <Bloc
          large={7}
          titre="Ce que le serveur répond à chaque action"
          note="Les motifs sont affichés tels quels — aucune règle n'est rejugée ici"
        >
          <Verdict
            titre="Offrir au réemploi"
            verdict={verdictOffre}
            quand="L'offre précède la saisine : un bien encore utile à une autre structure ne part pas aux domaines."
          />
          <Verdict
            titre="Saisir les domaines"
            verdict={verdictSaisine}
            quand="RG-028 — aucune saisine des domaines sans offre de réemploi close."
          />
          <Verdict
            titre="Enregistrer la décision des domaines"
            verdict={verdictDecision}
            quand="RG-032 — la décision s'enregistre et ne se prononce pas : elle porte son autorité, sa référence et sa date."
          />
        </Bloc>
      </Bento>

      <Section
        titre="La commission et ses avis"
        note="Qui propose la réforme ne siège pas à la commission qui l'examine — RG-030"
        actions={
          <>
            <Bouton taille="petite" icone={UserPlus} surClic={() => setAction('membre')}>
              Désigner un membre
            </Bouton>
            <Bouton
              taille="petite"
              icone={MessageSquareQuote}
              desactive={Boolean(raisonAvis)}
              titre={raisonAvis ?? undefined}
              surClic={() => setAction('avis')}
            >
              Proposer un avis
            </Bouton>
          </>
        }
      >
        {etatCommission ? (
          <div className="marge-dessus-3">
            <Definitions
              entrees={[
                {
                  cle: 'Membres désignés',
                  valeur:
                    etatCommission.membres_minimum === null
                      ? nombre(etatCommission.membres)
                      : `${nombre(etatCommission.membres)} sur ${nombre(
                          etatCommission.membres_minimum,
                        )} requis`,
                },
                {
                  cle: 'Avis rendus',
                  valeur:
                    etatCommission.membres_minimum === null
                      ? nombre(etatCommission.avis_rendus)
                      : `${nombre(etatCommission.avis_rendus)} sur ${nombre(
                          etatCommission.membres_minimum,
                        )}`,
                },
                { cle: 'Favorables', valeur: nombre(etatCommission.favorables) },
                { cle: 'Défavorables', valeur: nombre(etatCommission.defavorables) },
                {
                  cle: 'Majorité dégagée',
                  valeur: etatCommission.majorite ? (
                    <Pastille valeur={etatCommission.majorite} />
                  ) : (
                    <span className="texte-note">Aucune pour l’instant</span>
                  ),
                },
                {
                  cle: 'La commission a conclu',
                  valeur: etatCommission.conclu ? 'Oui' : 'Pas encore',
                },
              ]}
            />
            {etatCommission.manque ? (
              <p className="marge-dessus-3 sans-marge largeur-propos texte-faible">
                {etatCommission.manque}
              </p>
            ) : null}
            <div className="texte-note marge-dessus-1">
              Ces chiffres et la règle de majorité viennent du serveur, dans
              « commission_etat » : l'écran les affiche sans les refaire.
            </div>
          </div>
        ) : null}

        <div className="marge-dessus-5" />

        {commission.length === 0 ? (
          <Vide
            titre="Aucun membre n'est désigné"
            texte="La composition de la commission est une décision ouverte du lot : à défaut d'arrêté connu, le serveur retient au moins trois membres et un avis à la majorité de ceux qui se sont prononcés. Le paramètre vit dans « reforme.commission_membres_minimum », jamais dans une constante."
            action={
              <Bouton allure="principale" icone={UserPlus} surClic={() => setAction('membre')}>
                Désigner un membre
              </Bouton>
            }
          />
        ) : (
          <Tableau
            lignes={commission}
            cleDeLigne={(m, i) => `${m.agent_id}-${m.qualite}-${i}`}
            nomDesLignes="membre"
            nomDesLignesPluriel="membres"
            colonnes={[
              { cle: 'nom', titre: 'Membre', rendu: (m) => texte(nomDeLAgent(m)) },
              {
                cle: 'fonction',
                titre: 'Fonction',
                rendu: (m) => <span className="cellule-faible">{texte(fonctionDeLAgent(m))}</span>,
              },
              { cle: 'qualite', titre: 'Qualité', rendu: (m) => libelle(m.qualite) },
              {
                cle: 'avis',
                titre: 'A donné son avis',
                rendu: (m) => {
                  const sien = avis.find((a) => String(a.agent_id) === String(m.agent_id))
                  return sien ? (
                    <Pastille valeur={sien.avis} />
                  ) : (
                    <span className="texte-note">Pas encore</span>
                  )
                },
              },
            ]}
          />
        )}

        <div className="marge-dessus-5">
          {avis.length === 0 ? (
            <Vide
              titre="Aucun avis n'est encore émis"
              texte="Un avis de commission exige un motif, favorable comme défavorable — RG-031. Sans avis, le dossier reste au statut « proposé »."
            />
          ) : (
            <Tableau
              lignes={avis}
              cleDeLigne={(a, i) => a.id ?? `${a.agent_id}-${i}`}
              nomDesLignes="avis"
              nomDesLignesPluriel="avis"
              triInitial={{ cle: 'par_nom', sens: 'asc' }}
              ligneMarquee={(a) => estMarque(a.id)}
              colonnes={[
                {
                  cle: 'avis',
                  titre: 'Avis',
                  largeur: '14%',
                  rendu: (a) => <Pastille valeur={a.avis} />,
                },
                {
                  cle: 'par_nom',
                  titre: 'Donné par',
                  largeur: '24%',
                  rendu: (a) => (
                    <span className="cellule-deux-lignes">
                      <span>{texte(nomDeLAgent(a) ?? a.par_nom)}</span>
                      <span className="texte-note">
                        {horodatage(a.rendu_le ?? a.le ?? a.cree_le)}
                      </span>
                    </span>
                  ),
                },
                {
                  cle: 'motif',
                  titre: 'Motif — RG-031',
                  largeur: '62%',
                  triable: false,
                  rendu: (a) => <span className="cellule-faible">{texte(a.motif)}</span>,
                },
              ]}
            />
          )}
        </div>
      </Section>

      <Section
        titre="L'offre de réemploi et les demandes reçues"
        note="L'étape qui évite qu'un bien soit réformé d'un côté et racheté de l'autre"
        actions={
          <>
            <Bouton
              taille="petite"
              icone={PackageOpen}
              desactive={Boolean(raisonOffre)}
              titre={raisonOffre ?? undefined}
              surClic={() => setAction('offrir')}
            >
              Offrir au réemploi
            </Bouton>
            <Bouton
              taille="petite"
              icone={Lock}
              desactive={Boolean(raisonCloture)}
              titre={raisonCloture ?? undefined}
              surClic={() => setAction('clore')}
            >
              Clore l'offre
            </Bouton>
          </>
        }
      >
        {!offre ? (
          <Vide
            titre="Aucune offre de réemploi"
            texte="Avant toute saisine, le bien est offert aux autres structures, qui peuvent le demander — c'est le cœur économique du lot, et RG-028 interdit la saisine sans offre close. Le réemploi ne circule qu'entre structures de régime intégré : faire entrer un bien de la Primature dans le patrimoine d'un établissement autonome serait une cession, que le SIGL ne prononce jamais."
            action={
              <Bouton
                allure="principale"
                icone={PackageOpen}
                desactive={Boolean(raisonOffre)}
                titre={raisonOffre ?? undefined}
                surClic={() => setAction('offrir')}
              >
                Offrir au réemploi
              </Bouton>
            }
          />
        ) : (
          <Definitions
            entrees={[
              {
                cle: 'Statut de l’offre',
                valeur: <Pastille valeur={publiee.statut} ton={tonDuStatutOffre(publiee.statut)} />,
              },
              { cle: 'Désignation publiée', valeur: texte(publiee.designation) },
              {
                cle: 'Immatriculation publiée',
                valeur: <span className="mono">{texte(publiee.immatriculation)}</span>,
              },
              { cle: 'Catégorie publiée', valeur: texte(publiee.categorie_code) },
              {
                cle: 'État publié',
                valeur: publiee.etat ? <Pastille valeur={publiee.etat} /> : '—',
              },
              {
                cle: 'Structure d’origine',
                valeur: `${texte(publiee.structure_origine_code)} — ${texte(
                  publiee.structure_origine_nom,
                )}`,
              },
              { cle: 'Site d’origine', valeur: texte(publiee.site_origine_nom) },
              { cle: 'Offerte le', valeur: horodatage(offre.ouverte_le) },
              {
                cle: 'Clôture prévue',
                valeur: (
                  <span className="cellule-deux-lignes">
                    <span>{dateEnClair(publiee.cloture_prevue_le)}</span>
                    {typeof offre.jours_restants === 'number' ? (
                      <span className="texte-note">
                        {offre.statut === 'ouverte'
                          ? `Reste ${jours(offre.jours_restants)}`
                          : 'Offre close'}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                cle: 'Durée annoncée',
                valeur:
                  typeof offre.duree_jours === 'number' ? jours(offre.duree_jours) : '—',
              },
              { cle: 'Close le', valeur: offre.close_le ? horodatage(offre.close_le) : '—' },
              { cle: 'Demandes reçues', valeur: nombre(demandes.length) },
            ]}
          />
        )}

        <div className="marge-dessus-5">
          {demandes.length === 0 ? (
            <Vide
              titre="Aucune demande reçue"
              texte={
                offre
                  ? "L'offre est publiée : elle est lisible de toutes les structures, et non seulement de la vôtre. Tant qu'aucune demande n'est déposée, le circuit attend la clôture de l'offre."
                  : "Il n'y a pas d'offre, donc pas de demande."
              }
            />
          ) : (
            <Tableau
              lignes={demandes}
              nomDesLignes="demande"
              nomDesLignesPluriel="demandes"
              triInitial={{ cle: 'statut', sens: 'asc' }}
              ligneSignalee={estDeposee}
              ligneMarquee={(d) => estMarque(d.id)}
              colonnes={[
                {
                  cle: 'structure_demandeuse_nom',
                  titre: 'Structure demandeuse',
                  largeur: '24%',
                  rendu: (d) => (
                    <span className="cellule-deux-lignes">
                      <span>
                        {texte(d.structure_demandeuse_nom ?? d.structure_demandeuse_code)}
                      </span>
                      <span className="texte-note">
                        {horodatage(d.cree_le ?? d.deposee_le)}
                      </span>
                    </span>
                  ),
                },
                {
                  cle: 'statut',
                  titre: 'Statut',
                  largeur: '12%',
                  rendu: (d) => <Pastille valeur={d.statut} />,
                },
                {
                  cle: 'motif',
                  titre: 'Motif de la demande',
                  largeur: '34%',
                  triable: false,
                  rendu: (d) => <span className="cellule-faible">{texte(d.motif)}</span>,
                },
                {
                  cle: 'motif_decision',
                  titre: 'Décision',
                  largeur: '18%',
                  triable: false,
                  rendu: (d) =>
                    estDeposee(d) ? (
                      <span className="texte-note">Non tranchée</span>
                    ) : (
                      <span className="cellule-deux-lignes">
                        <span>
                          {libelle(d.statut)}
                          {d.tranchee_le ? ` · ${date(d.tranchee_le)}` : ''}
                        </span>
                        <span className="texte-note">{texte(d.motif_decision)}</span>
                      </span>
                    ),
                },
                {
                  cle: 'actions',
                  titre: '',
                  largeur: '12%',
                  triable: false,
                  rendu: (d) =>
                    estDeposee(d) ? (
                      <Bouton
                        taille="petite"
                        allure="principale"
                        icone={Gavel}
                        desactive={Boolean(raisonLogistique)}
                        titre={raisonLogistique ?? undefined}
                        surClic={() => setDemandeOuverte(d)}
                      >
                        Trancher
                      </Bouton>
                    ) : (
                      <span className="texte-note">Tranchée</span>
                    ),
                },
              ]}
              pied={`${nombre(demandes.filter(estDeposee).length)} demande(s) non tranchée(s) sur ${nombre(
                demandes.length,
              )} · accepter, c'est prononcer le réemploi en un seul geste`}
            />
          )}
        </div>
      </Section>

      <Section
        titre="La décision des domaines"
        note="Enregistrée, jamais prononcée — RG-016 et RG-032"
      >
        {pv ? (
          <div className="marge-dessus-3">
            <Definitions
              entrees={[
                {
                  cle: 'Procès-verbal de réforme',
                  valeur: <span className="mono">{texte(pv.numero)}</span>,
                },
                { cle: 'Type de pièce', valeur: libelle(pv.type) },
                {
                  cle: 'Figé',
                  valeur: pv.fige
                    ? 'Oui — un document figé ne se modifie pas, on en émet un autre lié (RG-019)'
                    : 'Non',
                },
                { cle: 'Signataire', valeur: texte(pv.signataire_nom) },
                { cle: 'Signé le', valeur: horodatage(pv.signe_le) },
              ]}
            />
            <div className="marge-dessus-5" />
          </div>
        ) : null}

        {!decision ? (
          <Vide
            titre="Aucune décision enregistrée"
            texte="Le SIGL n'a aucune route qui prononce une cession ni une mise au rebut : il instruit, produit le PV de réforme, saisit les domaines et attend. Quand leur décision arrive, on l'enregistre avec l'autorité qui l'a prise, la référence de l'acte et sa date."
            action={
              <Bouton
                allure="principale"
                icone={Scale}
                desactive={Boolean(raisonDecision)}
                titre={raisonDecision ?? undefined}
                surClic={() => setAction('decision')}
              >
                Enregistrer la décision
              </Bouton>
            }
          />
        ) : (
          <Definitions
            entrees={[
              { cle: 'Suite donnée', valeur: <Pastille valeur={decision.suite} /> },
              { cle: 'Autorité', valeur: texte(decision.autorite) },
              {
                cle: 'Référence de l’acte',
                valeur: <span className="mono">{texte(decision.reference)}</span>,
              },
              { cle: 'Date de l’acte', valeur: dateEnClair(decision.date_acte) },
              {
                cle: 'Enregistrée le',
                valeur: horodatage(decision.enregistre_le ?? decision.cree_le),
              },
              { cle: 'Enregistrée par', valeur: texte(decision.par_nom) },
            ]}
          />
        )}
      </Section>

      {action === 'membre' ? (
        <DialogueMembre
          dossier={dossier}
          commission={commission}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
          }}
        />
      ) : null}

      {action === 'avis' ? (
        <DialogueAvis
          dossier={dossier}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
          }}
        />
      ) : null}

      {action === 'offrir' ? (
        <DialogueOffre
          dossier={dossier}
          bien={bien}
          verdict={verdictOffre}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
          }}
        />
      ) : null}

      {action === 'clore' ? (
        <DialogueClotureOffre
          offre={offre}
          publiee={publiee}
          demandes={demandes}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
          }}
        />
      ) : null}

      {action === 'saisir' ? (
        <DialogueSaisine
          dossier={dossier}
          verdict={verdictSaisine}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
          }}
        />
      ) : null}

      {action === 'decision' ? (
        <DialogueDecision
          dossier={dossier}
          verdict={verdictDecision}
          surFermeture={() => setAction(null)}
          surSucces={() => {
            setAction(null)
            fiche.recharger()
          }}
        />
      ) : null}

      {demandeOuverte ? (
        <DialogueTrancherDemande
          demande={demandeOuverte}
          surFermeture={() => setDemandeOuverte(null)}
          surSucces={() => {
            setDemandeOuverte(null)
            fiche.recharger()
          }}
        />
      ) : null}
    </Page>
  )
}

/* --------------------------------------------------------------------- */
/* Un verdict du serveur, affiché tel quel                               */
/* --------------------------------------------------------------------- */

function Verdict({ titre, verdict, quand }) {
  return (
    <div className="marge-dessus-3">
      <div className="ligne-outils">
        <Pastille
          valeur="verdict"
          ton={verdict.possible ? 'succes' : verdict.servi ? 'attente' : 'neutre'}
          texte={verdict.possible ? 'Possible' : verdict.servi ? 'Fermée' : 'Verdict non servi'}
        />
        <span>{titre}</span>
        {verdict.code ? <span className="texte-note mono">{verdict.code}</span> : null}
      </div>
      <p className="marge-dessus-1 sans-marge largeur-propos texte-faible">
        {verdict.possible ? quand : (verdict.motif ?? quand)}
      </p>
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Désigner un membre — POST /api/dossiers-reforme/:id/commission        */
/* --------------------------------------------------------------------- */

function DialogueMembre({ dossier, commission, surFermeture, surSucces }) {
  const [agentId, setAgentId] = useState('')
  const [qualite, setQualite] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const profils = useRequete((o) => api.profils(o), [])
  const liste = depouillerListe(profils.donnees).lignes

  const doublon = commission.some((m) => String(m.agent_id) === String(agentId))
  const valide = agentId !== '' && qualite !== '' && !doublon

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.designerMembreCommission(dossier.id, { agent_id: agentId, qualite })
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
      titre="Désigner un membre de la commission"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={UserPlus}
            desactive={!valide || envoi}
            surClic={envoyer}
            titre={doublon ? 'Cet agent siège déjà à cette commission.' : undefined}
          >
            {envoi ? 'Envoi…' : 'Désigner'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        Qui propose la réforme ne siège pas à la commission qui l'examine —
        RG-030, séparation des fonctions. Le serveur refuse la désignation de
        celui qui a proposé, et il le dit. À défaut d'arrêté connu, le lot
        retient au moins trois membres, et l'avis se prend à la majorité de
        ceux qui se sont prononcés : la valeur vit dans le paramètre
        « reforme.commission_membres_minimum », horodaté comme les seuils de
        passation.
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
          erreur={doublon ? 'Cet agent siège déjà à cette commission.' : undefined}
        />
        <Champ
          libelle="Qualité"
          type="choix"
          obligatoire
          valeur={qualite}
          surChangement={setQualite}
          options={QUALITES_COMMISSION}
          aide="Président, rapporteur ou membre. La composition exacte reste à arrêter par l'institution."
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
/* Proposer un avis — POST /api/dossiers-reforme/:id/avis   RG-030, 031  */
/* --------------------------------------------------------------------- */

function DialogueAvis({ dossier, surFermeture, surSucces }) {
  const [avis, setAvis] = useState('')
  const [motif, setMotif] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const valide = avis !== '' && motif.trim().length >= 5

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.donnerAvisReforme(dossier.id, { avis, motif: motif.trim() })
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
      titre="Proposer un avis de commission"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={MessageSquareQuote}
            desactive={!valide || envoi}
            surClic={envoyer}
            titre={valide ? undefined : 'Un avis et son motif sont attendus — RG-031.'}
          >
            {envoi ? 'Envoi…' : "Porter l'avis"}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        Un avis de commission exige un motif, favorable comme défavorable —
        RG-031. Un avis défavorable laisse le bien en service et le dossier
        passe à « rejeté ». L'action est journalisée avant d'être confirmée —
        RG-020.
      </p>

      <div className="marge-dessus-3 pile largeur-formulaire">
        <Champ
          libelle="Avis"
          type="choix"
          obligatoire
          valeur={avis}
          surChangement={setAvis}
          options={AVIS}
        />
        <Champ
          libelle="Motif de l'avis"
          type="zone"
          lignes={4}
          obligatoire
          valeur={motif}
          surChangement={setMotif}
          aide="Obligatoire dans les deux sens. C'est lui qu'un contrôleur viendra lire."
        />
      </div>

      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé l'avis" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Offrir au réemploi — POST /api/dossiers-reforme/:id/offrir            */
/* --------------------------------------------------------------------- */

function DialogueOffre({ dossier, bien, verdict, surFermeture, surSucces }) {
  const [duree, setDuree] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.offrirAuReemploi(
        dossier.id,
        duree === '' ? {} : { duree_jours: Number(duree) },
      )
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
      titre="Offrir le bien au réemploi"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={PackageOpen}
            desactive={envoi || !verdict.possible}
            titre={verdict.possible ? undefined : (verdict.motif ?? undefined)}
            surClic={envoyer}
          >
            {envoi ? 'Envoi…' : 'Publier l’offre'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        L'offre est une <strong>publication</strong> : elle devient lisible de
        toutes les structures, et elle porte sa propre copie de ce qu'elle
        publie — désignation, immatriculation, catégorie, état, structure et
        site d'origine. Ce qui a été offert reste ce qui a été offert. Le
        réemploi ne circule qu'entre structures de régime intégré.
      </p>
      <p className="marge-dessus-3 sans-marge largeur-propos">
        {verdict.possible
          ? 'Le serveur annonce l’offre possible.'
          : (verdict.motif ?? 'Le serveur n’a pas rendu son verdict.')}
      </p>

      <div className="marge-dessus-3">
        <Definitions
          entrees={[
            { cle: 'Dossier', valeur: <span className="mono">{texte(dossier.numero)}</span> },
            {
              cle: 'Bien',
              valeur: `${texte(bien.immatriculation)} — ${texte(bien.designation)}`,
            },
            { cle: 'Structure d’origine', valeur: texte(bien.structure_nom ?? bien.structure_code) },
          ]}
        />
      </div>

      <div className="marge-dessus-3 largeur-formulaire">
        <Champ
          libelle="Durée de l'offre, en jours (facultatif)"
          type="number"
          min={1}
          valeur={duree}
          surChangement={setDuree}
          aide="Laissé vide, le serveur applique le paramètre « reemploi.duree_offre_jours », horodaté comme les seuils de passation — trente jours au départ. Ce n'est jamais une constante d'écran."
        />
      </div>

      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé l'offre" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Clore l'offre — POST /api/offres-reemploi/:id/clore                   */
/* --------------------------------------------------------------------- */

function DialogueClotureOffre({ offre, publiee, demandes, surFermeture, surSucces }) {
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const nonTranchees = demandes.filter(estDeposee).length

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.cloreOffreReemploi(offre.id)
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
      titre="Clore l'offre de réemploi"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton allure="principale" icone={Lock} desactive={envoi} surClic={envoyer}>
            {envoi ? 'Envoi…' : "Clore l'offre"}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        Clore l'offre, c'est constater qu'aucune structure n'a pris le bien —
        et c'est ce qui ouvre la saisine des domaines : RG-028 interdit la
        saisine sans offre close. Les structures ne pourront plus demander ce
        bien.
      </p>
      {nonTranchees > 0 ? (
        <p className="marge-dessus-3 sans-marge largeur-propos">
          {nonTranchees} demande(s) ne sont pas tranchées. Examinez-les avant de
          clore : une demande acceptée prononce le réemploi et clôt le dossier
          sans réforme.
        </p>
      ) : null}
      <div className="marge-dessus-3">
        <Definitions
          entrees={[
            { cle: 'Bien offert', valeur: texte(publiee.designation) },
            {
              cle: 'Immatriculation',
              valeur: <span className="mono">{texte(publiee.immatriculation)}</span>,
            },
            { cle: 'Clôture prévue', valeur: dateEnClair(publiee.cloture_prevue_le) },
            { cle: 'Demandes reçues', valeur: nombre(demandes.length) },
          ]}
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

/* --------------------------------------------------------------------- */
/* Trancher une demande — POST /api/demandes-reemploi/:id/trancher       */
/* --------------------------------------------------------------------- */

function DialogueTrancherDemande({ demande, surFermeture, surSucces }) {
  const [decision, setDecision] = useState('')
  const [motif, setMotif] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const effet = DECISIONS_DEMANDE.find((d) => d.valeur === decision)?.effet ?? null
  const valide = decision !== '' && motif.trim().length >= 5

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.trancherDemandeReemploi(demande.id, { decision, motif: motif.trim() })
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
      titre="Trancher la demande de réemploi"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={Gavel}
            desactive={!valide || envoi}
            surClic={envoyer}
            titre={valide ? undefined : 'Une décision et son motif sont attendus.'}
          >
            {envoi ? 'Envoi…' : 'Trancher'}
          </Bouton>
        </>
      }
    >
      <Definitions
        entrees={[
          {
            cle: 'Structure demandeuse',
            valeur: texte(demande.structure_demandeuse_nom ?? demande.structure_demandeuse_code),
          },
          { cle: 'Déposée le', valeur: horodatage(demande.cree_le ?? demande.deposee_le) },
          { cle: 'Statut', valeur: <Pastille valeur={demande.statut} /> },
          { cle: 'Motif de la demande', valeur: texte(demande.motif) },
        ]}
      />

      <p className="marge-dessus-3 texte-faible largeur-propos">
        Accepter, c'est faire l'acte : un seul geste, une seule transaction. Le
        serveur transfère le bien par un mouvement de réemploi, émet l'acte de
        transfert, clôt l'offre, écarte d'office les autres demandes et passe le
        dossier à « réemployé » — clos sans réforme. Un établissement autonome
        ne prend pas un bien par cette voie : ce serait une cession, que le SIGL
        ne prononce jamais (RG-016, RG-018), et le serveur le refuse en ces
        termes.
      </p>

      <div className="marge-dessus-3 pile largeur-formulaire">
        <Champ
          libelle="Décision"
          type="choix"
          obligatoire
          valeur={decision}
          surChangement={setDecision}
          options={DECISIONS_DEMANDE}
        />
        {effet ? <p className="texte-note sans-marge largeur-propos">{effet}</p> : null}
        <Champ
          libelle="Motif de la décision"
          type="zone"
          lignes={4}
          obligatoire
          valeur={motif}
          surChangement={setMotif}
          aide="Obligatoire et conservé, quelle que soit la décision."
        />
      </div>

      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé la décision" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Saisir les domaines — POST /api/dossiers-reforme/:id/saisir   RG-028  */
/* --------------------------------------------------------------------- */

function DialogueSaisine({ dossier, verdict, surFermeture, surSucces }) {
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.saisirLesDomaines(dossier.id)
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
      titre="Saisir l'administration des domaines"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={Landmark}
            desactive={envoi || !verdict.possible}
            titre={verdict.possible ? undefined : (verdict.motif ?? undefined)}
            surClic={envoyer}
          >
            {envoi ? 'Envoi…' : 'Saisir les domaines'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        La saisine fige le PV de réforme et place le dossier en attente : un
        document figé ne se modifie jamais, on en émet un autre lié — RG-019.
        Aucune saisine sans offre de réemploi close — RG-028. Le SIGL ne
        prononce ni la cession ni la mise au rebut : il instruit et produit le
        PV — RG-016.
      </p>
      <p className="marge-dessus-3 sans-marge largeur-propos">
        {verdict.possible
          ? 'Le serveur annonce la saisine possible.'
          : (verdict.motif ?? 'Le serveur n’a pas rendu son verdict.')}
      </p>
      <div className="marge-dessus-3">
        <Definitions
          entrees={[
            { cle: 'Dossier', valeur: <span className="mono">{texte(dossier.numero)}</span> },
            { cle: 'Statut', valeur: <Pastille valeur={dossier.statut} /> },
            { cle: 'Ouvert le', valeur: date(dossier.cree_le ?? dossier.propose_le) },
          ]}
        />
      </div>
      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé la saisine" />
        </div>
      ) : null}
    </Dialogue>
  )
}

/* --------------------------------------------------------------------- */
/* Enregistrer la décision — POST /api/dossiers-reforme/:id/decision     */
/* RG-032 : elle s'enregistre et ne se prononce pas                      */
/* --------------------------------------------------------------------- */

function DialogueDecision({ dossier, verdict, surFermeture, surSucces }) {
  const [autorite, setAutorite] = useState('')
  const [reference, setReference] = useState('')
  const [dateActe, setDateActe] = useState('')
  const [suite, setSuite] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const valide =
    autorite.trim().length >= 3 && reference.trim().length >= 2 && dateActe !== '' && suite !== ''

  async function envoyer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.enregistrerDecisionDomaines(dossier.id, {
        autorite: autorite.trim(),
        reference: reference.trim(),
        date_acte: dateActe,
        suite,
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
      titre="Enregistrer la décision des domaines"
      surFermeture={surFermeture}
      pied={
        <>
          <Bouton surClic={surFermeture}>Annuler</Bouton>
          <Bouton
            allure="principale"
            icone={Scale}
            desactive={!valide || envoi || !verdict.possible}
            titre={
              verdict.possible
                ? valide
                  ? undefined
                  : "L'autorité, la référence de l'acte, sa date et la suite donnée sont attendues."
                : (verdict.motif ?? undefined)
            }
            surClic={envoyer}
          >
            {envoi ? 'Envoi…' : 'Enregistrer'}
          </Bouton>
        </>
      }
    >
      <p className="texte-faible sans-marge largeur-propos">
        Cette décision a été prise ailleurs : le SIGL l'<strong>enregistre</strong>,
        il ne la prononce pas — RG-016 et RG-032. Elle porte donc l'autorité qui
        l'a prise, la référence de son acte et sa date. Aucune route du SIGL ne
        prononce une cession.
      </p>
      <p className="marge-dessus-3 sans-marge largeur-propos">
        {verdict.possible
          ? 'Le serveur annonce l’enregistrement possible.'
          : (verdict.motif ?? 'Le serveur n’a pas rendu son verdict.')}
      </p>

      <div className="marge-dessus-3 pile largeur-formulaire">
        <Champ
          libelle="Autorité qui a décidé"
          obligatoire
          valeur={autorite}
          surChangement={setAutorite}
          placeholder="Administration des domaines privés et publics de l'État"
          aide="Le nom de l'administration, du service ou de l'acte qui a tranché."
        />
        <Champ
          libelle="Référence de l'acte"
          obligatoire
          valeur={reference}
          surChangement={setReference}
          aide="Le numéro ou la référence que porte l'acte reçu."
        />
        <Champ
          libelle="Date de l'acte"
          type="date"
          obligatoire
          valeur={dateActe}
          surChangement={setDateActe}
        />
        <Champ
          libelle="Suite donnée"
          type="choix"
          obligatoire
          valeur={suite}
          surChangement={setSuite}
          options={SUITES_DOMAINES}
          aide="Cession, mise au rebut, ou refus. C'est la décision reçue, pas une décision du SIGL."
        />
      </div>

      {erreur ? (
        <div className="marge-dessus-3">
          <Erreur erreur={erreur} titre="Le serveur a refusé l'enregistrement" />
        </div>
      ) : null}
    </Dialogue>
  )
}
