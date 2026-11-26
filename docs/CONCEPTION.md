# SIGL — Dossier de conception fonctionnelle

Système Intégré de Gestion Logistique de la Primature de la République démocratique du Congo.
Braintis Technology. 26 novembre 2026.

---

## Comment ce document a été produit, et ce que ça implique

Il n'y a pas eu d'entretiens ni d'observation sur place. Ce document est bâti sur les textes et les
sources officielles dépouillés les jours précédents : le décret n° 13/050 du 6 novembre 2013 portant
règlement général sur la comptabilité publique, le décret n° 20/010 du 1er avril 2020 sur le Cabinet
du Premier ministre, l'ordonnance-loi n° 23/010 du 13 mars 2023 portant Code du numérique, les normes
IPSAS 12 et 45, le guide des drapeaux rouges de l'Open Contracting Partnership, et le site officiel
de la Primature.

Conséquence : **chaque affirmation sur la façon dont la Primature travaille réellement est une
hypothèse.** Elles sont marquées **⟨H⟩** dans tout le document et reprises en liste à la section 14.
Une hypothèse marquée se corrige en une réunion ; une hypothèse non marquée se découvre en
production, et coûte cher. C'est la seule façon honnête de remplacer six semaines d'enquête par une
journée de conception.

Ce qui en revanche n'est pas une hypothèse : tout ce qui est appuyé sur un article de loi ou un
paragraphe de norme. Ces passages portent la référence exacte.

---

## 1. Ce qu'on offre à la Primature

Quatre promesses. Elles sont écrites dans le vocabulaire de l'institution, pas dans celui de
l'informatique.

### Savoir ce que l'institution possède

Un registre unique de tous les biens de la Primature et de ses structures. Chaque bien
**immatriculé**, étiqueté, localisé, affecté nominativement à quelqu'un qui en répond. Un numéro, une
étiquette, un responsable.

Aujourd'hui, la question « combien de véhicules, d'ordinateurs, de climatiseurs la Primature
possède-t-elle, et où sont-ils ? » n'a probablement pas de réponse unique ⟨H⟩. Après le SIGL, elle en
a une, et la même pour tout le monde.

### Voir tout ce qui se demande

Un poste de commande au niveau central. Toutes les demandes de toutes les structures, en temps réel,
avec leur état et leur ancienneté. Ce qui attend une décision, et depuis combien de jours. Ce qui a
été refusé et pourquoi.

C'est la demande formulée : que la Primature soit en mesure de contrôler tout ce qui se passe, et de
réagir.

### Décider vite, et par écrit

Chaque structure saisit ses états de besoin dans l'outil. Le chef de structure vise. La Logistique
centrale examine et tranche : validation totale, partielle, ou rejet motivé. La décision est
instantanée pour le demandeur, et elle laisse une trace.

Si l'article est en stock, le bon de livraison se génère tout seul. S'il n'y est pas, le dossier
d'achat s'ouvre tout seul, avec la procédure qui correspond au montant.

### Pouvoir se justifier

Une piste d'audit complète, de la réception à la sortie définitive. L'état d'inventaire du patrimoine
au 31 décembre, produit automatiquement. Et le certificat de prise en charge à l'inventaire, délivré à
chaque entrée.

### L'argument qui précède tous les autres

Le SIGL ne propose pas une idée nouvelle. Il rend applicable le décret du 6 novembre 2013, qui impose
depuis douze ans une comptabilité des matières avec inventaires à dates fixes, immatriculation des
biens et rapprochements contradictoires avec la comptabilité générale. Ce n'est pas une proposition
d'outil, c'est une mise en conformité.

---

## 2. Les deux niveaux

### Le niveau central

**La Primature** : le Cabinet de la Première ministre et le Secrétariat général à la Primature. Le
site officiel indique que le Secrétariat général « assure la gestion administrative, technique,
financière et logistique de la Primature ». Le décret de 2020 confie au Cabinet « l'intendance et la
gestion de la logistique » et « la gestion du charroi automobile de la Primature », sous la
supervision directe du Conseiller administratif et financier, avec un Service d'intendance dirigé par
un Intendant général.

Le niveau central **voit tout, arbitre tout, commande**. C'est le point de passage obligé.

⟨H⟩ La répartition exacte entre le Cabinet et le Secrétariat général pour la logistique reste à
établir : les deux textes leur attribuent des missions qui se recouvrent. C'est la première question
de cadrage, parce qu'elle détermine qui est le propriétaire du système.

### Les structures

Chaque structure **déclare son patrimoine, tient son inventaire, saisit ses états de besoin, accuse
réception de ses livraisons**. Elle ne voit que ses propres données.

Liste relevée sur le site officiel de la Primature :

| Structure | Nature | Rôle dans le SIGL |
|---|---|---|
| Secrétariat Général à la Primature | Administration permanente | Acteur central, et structure consommatrice |
| Secrétariat Général du Gouvernement | Organe permanent | Structure, avec sa propre mission logistique ⟨H⟩ |
| Cellule de Gestion des Immeubles du Gouvernement (CGIG) | Structure spécialisée | Structure, et détentrice du volet immobilier — voir section 13 |
| Autorité de Régulation des Marchés Publics (ARMP) | Régulateur | Structure, et source des règles de passation |
| Cellule d'Analyse des Indicateurs de Développement (CAID) | Rattachée au SGP | Structure |
| Delivery Unit de la Primature | Pilotage stratégique | Structure, et destinataire des indicateurs |
| Agence de Pilotage, de Coordination et de Suivi des Conventions de Collaboration (APCSC) | Établissement public | Structure, périmètre étanche |
| Autorité de Régulation et de Contrôle de la Couverture Santé Universelle (ARC-CSU) | Établissement public | Structure, périmètre étanche |
| Caisse Nationale de Péréquation (CNP) | Instrument financier | Structure, périmètre étanche |
| Comité National du Désarmement et de la Sécurité Internationale (CND-SI) | Organe de coordination | Structure |

**Cette liste est incomplète.** Le site la présente par ordre alphabétique et s'arrête à la lettre D.
⟨H⟩ Le nombre réel de structures est inconnu, et c'est un paramètre de dimensionnement.

**Deux régimes différents à prévoir.** Les cellules et services rattachés au Secrétariat général
entrent naturellement dans un périmètre consolidé. Mais les **établissements publics** — APCSC,
ARC-CSU, CNP — ont leur propre personnalité juridique et leur propre comptable public : leur
comptabilité des matières leur appartient. Le SIGL doit donc gérer des **périmètres étanches avec
consolidation au niveau de la Primature**, et non un référentiel unique où tout le monde voit tout.
Le paramètre par structure s'appelle « régime » : *intégré* ou *autonome consolidé*.

---

## 3. Les acteurs, et ce que chacun peut faire

Les rôles sont ceux du droit, pas ceux d'un logiciel. C'est ce qui rend le système opposable.

| Rôle dans le système | Fondement | Ce qu'il fait | Ce qu'il ne peut pas faire |
|---|---|---|---|
| **Agent demandeur** | — | Saisit un état de besoin, suit son sort, accuse réception | Viser sa propre demande |
| **Chef de structure** | — | Vise les états de besoin de sa structure, voit son patrimoine et ses stocks | Voir une autre structure |
| **Comptable des matières** | Décret 2013, art. 119-123 | Tient la comptabilité des matières de son périmètre : prises en charge, sorties, inventaires, fiches | Modifier une écriture validée |
| **Détenteur / préposé** | Décret 2013, art. 122 | Répond des biens qui lui sont affectés, les atteste à l'inventaire | Transférer un bien sans acte |
| **Magasinier / dépositaire** | — | Entrées et sorties physiques, écarts de réception | Valider sa propre réception |
| **Intendant général et intendants** | Décret 2020 | Exécution logistique centrale, charroi, installations | Arbitrer un besoin |
| **Chargé de logistique centrale** | ⟨H⟩ | Examine les besoins, tranche, lance les achats, arbitre entre structures | Engager la dépense seul |
| **Conseiller administratif et financier** | Décret 2020 | Supervise l'intendance et la logistique ; propriétaire métier pressenti | — |
| **Ordonnateur** | Décret 2013, art. 137 | Certifie le service fait, délivre les imputations | Payer |
| **Contrôleur de budget** | Décret 2020 — mis à disposition par le Budget | Vise la disponibilité des crédits | Décider du besoin |
| **Comptable public** | Décret 2013, art. 137 — mis à disposition par les Finances | Contrôle la validité de la créance et la prise en charge à l'inventaire, paie | Décider du besoin |
| **Cabinet et Première ministre** | — | Lecture consolidée, tableaux de bord | Saisir à la place d'une structure |
| **Inspection générale des finances** | Décret 2013, art. 138 | Lecture intégrale, accès à la piste d'audit | Écrire |
| **Cour des comptes** | — | Lecture intégrale, accès à la piste d'audit | Écrire |
| **Administration des domaines** | Décret 2013 | Décide des cessions et mises au rebut | — |
| **Administrateur** | — | Référentiels, comptes, paramètres | Modifier une écriture métier ou le journal |

**Le fait de gouvernance à ne pas casser.** Le contrôleur de budget et les comptables publics sont
mis à la disposition de la Primature par le ministère du Budget ou des Finances. Ils ne sont pas ses
agents. La séparation des fonctions exigée par les principes du projet est donc **déjà organique** :
le système doit la refléter, pas la reconstruire. Concrètement, ces profils ont une traçabilité
renforcée, parce que leurs actes servent de preuve devant l'IGF et la Cour des comptes.

---

## 4. L'objet central : le bien

Le cœur du système n'est ni la commande ni le stock. C'est la fiche du bien. Tout le reste s'y
rattache.

### Ce que porte une fiche de bien

**Identification**
- Numéro d'immatriculation unique, codification GS1 GIAI. Fondement : décret 2013, art. 123, qui
  impose que les biens soient « inventoriés, **immatriculés**, valorisés et enregistrés ».
- Étiquette QR code apposée physiquement.
- Désignation, catégorie selon la nomenclature, marque, modèle, numéro de série, photo.

**Classement comptable** — c'est lui qui commande le traitement, et il n'est pas laissé au jugement de
l'agent de saisie :
- **Immobilisation ou stock.** Règle IPSAS 45 par. AG12 : les pièces de rechange, le matériel de
  secours et le matériel d'entretien sont des immobilisations quand ils répondent à la définition,
  sinon des stocks. Le système applique la règle, il ne la demande pas.
- **Objectif principal de détention** : capacité opérationnelle, ou capacité financière. IPSAS 45
  par. 27 : c'est lui qui détermine la base d'évaluation. Pour la Primature, ce sera presque toujours
  la capacité opérationnelle.
- **Suivi individuel ou en lot agrégé.** IPSAS 45 par. 8 autorise expressément à regrouper les
  éléments individuellement non significatifs — « livres de bibliothèque, périphériques informatiques
  et petits matériels » — et à appliquer les critères à la valeur agrégée. Le seuil de valeur est un
  paramètre de l'institution ⟨H⟩.

**Valeur**
- Mode d'entrée : achat, don, transfert. Il commande l'évaluation initiale.
  - Achat → coût.
  - Don ou transfert sans contrepartie, immobilisation → **coût réputé** selon IPSAS 46
    (IPSAS 45 par. 12).
  - Don ou transfert sans contrepartie, stock → **juste valeur à la date d'acquisition**
    (IPSAS 12 par. 16). Attention : ce n'est pas la même règle que pour les immobilisations.
- Pour les stocks destinés à être **distribués gratuitement ou à prix nominal** — le cas des
  fournitures de la Primature — il faut **deux valeurs** : le coût et le **coût de remplacement
  actuel**, la plus faible des deux étant retenue (IPSAS 12 par. 17). Un simple prix d'achat ne suffit
  pas.
- Amortissement selon les taux fixés par le ministre des Finances. ⟨H⟩ Taux à récupérer.

**Affectation et situation**
- Structure, site, local.
- **Détenteur nominatif**, qui en répond.
- État : neuf, bon, à réparer, hors service, en maintenance, réformé.
- Historique complet des mouvements, sans exception.

**Les biens patrimoniaux** dont la valeur ne peut être évaluée de façon fiable ne sont pas
comptabilisés mais mentionnés en notes, et comptabilisés dès que l'information devient disponible
(IPSAS 45 par. 7). Cas des objets d'art ou de prestige d'une résidence officielle ⟨H⟩.

### Les valeurs inactives : un module que la vision avait oublié

Le décret de 2013, art. 120, inclut expressément dans la comptabilité des matières « la comptabilité
des valeurs inactives : titres, formules, tickets, timbres et vignettes ». Et l'art. 122 pose que « les
régisseurs ou préposés sont **personnellement et pécuniairement responsables** des mouvements qu'ils
effectuent concernant les valeurs inactives ».

Ce n'est pas du stock ordinaire : ce sont des valeurs, suivies par série et par numéro, avec une
responsabilité pécuniaire du préposé. ⟨H⟩ Il faut vérifier si la Primature en détient. Si oui, c'est
un neuvième module, et il n'est pas facultatif.

### Les documents prescrits ailleurs

L'art. 122 précise que l'organisation comptable, « les **fiches de gestion des stocks** et les **fiches
de valeurs** sont définis par le **plan comptable de l'État** ». Ces écrans ne sont donc pas à
inventer : leur forme est fixée. ⟨H⟩ Le plan comptable de l'État est à récupérer avant de dessiner le
module 2. De même, la nomenclature des biens doit suivre le « référentiel harmonisé à l'échelle
nationale » de l'art. 123.

---

## 5. Le circuit du besoin, état par état

C'est le cœur fonctionnel. Pour chaque état : qui agit, ce qui est produit, et ce que le système
refuse.

### Chemin principal

**1. Brouillon** — *l'agent demandeur*
Il saisit : articles souhaités avec quantités, justification, pièces jointes. Le système lui montre la
disponibilité en stock central au moment de la saisie, pour éviter les demandes impossibles.
→ Produit : rien encore. *Refus du système : une demande sans justification ne part pas.*

**2. Visé par le chef de structure** — *le chef de structure*
Il vise, modifie les quantités avec motif, ou renvoie au demandeur.
→ Produit : l'**état de besoin** numéroté et signé électroniquement.
*Refus : le chef de structure ne peut pas viser une demande dont il est lui-même le demandeur.*

**3. Reçu à la Logistique centrale** — *automatique*
La demande apparaît au poste de commande central, horodatée. Le compteur d'ancienneté démarre.
→ Produit : accusé de réception automatique au demandeur.

**4. Examiné** — *le chargé de logistique centrale*
Trois issues, et une seule est sans motif obligatoire :
- **Validation totale.**
- **Validation partielle** : quantités réduites, **motif obligatoire**, et la part refusée est
  explicitement notifiée.
- **Rejet motivé** : retour au demandeur avec le motif, qui lui est lisible.
→ Produit : la **décision d'examen**, signée, attachée à l'état de besoin.
*Refus : aucune validation au-delà du crédit disponible sans visa du contrôleur de budget.*

**5. Aiguillage** — *automatique*
Le système regarde le stock :
- **Article disponible** → chemin A.
- **Article indisponible ou insuffisant** → chemin B.
Une demande peut suivre les deux chemins à la fois, ligne par ligne. C'est le cas courant, et c'est
une exigence de conception : la demande n'attend pas son article le plus lent.

### Chemin A — l'article est en stock

**6A. Bon de livraison généré** — *automatique*
→ Produit : le **bon de livraison** numéroté, lié à l'état de besoin.

**7A. Sortie de stock** — *le magasinier*
Il prélève, confirme les quantités réelles, signale tout écart.
→ Produit : l'écriture de sortie dans la comptabilité des matières, et la mise à jour du stock.
*Refus : pas de sortie supérieure à l'existant ; un écart ouvre une anomalie.*

**8A. Livré, puis accusé de réception** — *le demandeur ou le chef de structure*
Il signe l'accusé de réception à la livraison.
→ Produit : l'**accusé de réception** signé.
*Refus : la demande ne se clôt pas sans accusé signé. Les livraisons non accusées au-delà d'un délai
remontent au poste de commande.*

**9A. Clos** — l'affectation est enregistrée, le détenteur devient responsable du bien.

### Chemin B — l'article n'est pas en stock

**6B. Dossier d'achat ouvert** — *automatique*
Le système regroupe les besoins de même nature venant de plusieurs structures — c'est là que se font
les économies, et c'est aussi ce qui empêche le fractionnement.
→ Produit : le **dossier d'achat**, avec son montant estimé.

**7B. Procédure déterminée** — *automatique, puis le chargé de logistique*
Le montant estimé détermine la procédure applicable au titre de la loi n° 10/010 du 27 avril 2010 et
du décret fixant les seuils.
→ Produit : la qualification de la procédure, affichée et justifiée.
*Refus : le système **bloque** et alerte si un découpage ferait passer un achat sous un seuil — c'est
le drapeau rouge R011, fractionnement pour éviter les seuils. L'alerte est faite au moment de la
saisie, pas dans un rapport mensuel.*
⟨H⟩ Les seuils exacts du décret 10/34 ne sont pas encore vérifiés. Ils doivent être **paramétrables**,
jamais codés en dur — c'est une exigence d'architecture, pas un détail.

**8B. Bon de commande** — *le chargé de logistique, puis les visas*
Fournisseur retenu, articles, prix, délai.
→ Produit : le **bon de commande** numéroté et signé.
*Refus : pas de bon de commande vers un fournisseur inscrit sur la liste noire de l'ARMP (section 8).*

**9B. Réception fournisseur** — *le magasinier et la commission de réception*
Contrôle de conformité : quantités, qualité, conformité aux spécifications. Les écarts sont saisis
ligne par ligne.
→ Produit : le **procès-verbal de réception**.
*Le système rapproche automatiquement commandé / livré / reçu. Tout écart est tracé et remonté —
drapeaux rouges R067 et R073.*

**10B. Prise en charge à l'inventaire** — *le comptable des matières*
C'est l'étape la plus importante du système.
→ Produit : l'**entrée en stock ou l'immatriculation du bien**, et le **certificat de prise en charge
à l'inventaire**.

Fondement : décret 2013, art. 137, qui oblige le comptable public à contrôler, en matière de dépenses,
« la production des justifications et, le cas échéant, du **certificat de prise en charge à
l'inventaire** », et, en matière de patrimoine, « la prise en charge à l'inventaire des actifs
financiers et non financiers acquis ».

**Conséquence : pas de certificat sans entrée en inventaire, et pas de paiement sans certificat.** La
chaîne logistique et la chaîne de la dépense se rejoignent sur cette pièce. C'est ce qui rend le
contournement du système impossible — et le contournement est la cause d'échec numéro un des projets
comparables. Personne ne contourne l'outil qui délivre le document sans lequel il n'est pas payé.

**11B.** Puis le circuit rejoint le chemin A à l'étape 6A : bon de livraison, sortie, accusé de
réception, clôture.

### Chemin C — l'alerte de stock critique

Il n'y a pas de demande à l'origine. Le stock d'un article passe sous son seuil critique.
→ Le système ouvre un dossier d'approvisionnement, pré-rempli avec la consommation constatée et la
quantité recommandée. Le chargé de logistique confirme ou ajuste. Le circuit rejoint l'étape 7B.

C'est le passage du mode « on réagit à la rupture » au mode « on l'anticipe ». Et c'est la
fonctionnalité la plus facile à démontrer en présentation.

### Chemin D — les mouvements sans achat

- **Transfert** entre structures ou entre détenteurs : acte de transfert signé des deux côtés, le
  détenteur change, l'historique garde les deux.
- **Maintenance** : sortie pour réparation, retour, coût rattaché au bien. C'est ce qui permet
  l'arbitrage réparer ou remplacer.
- **Perte ou vol** : déclaration, procès-verbal, et le bien reste au registre dans un état distinct —
  il ne disparaît jamais silencieusement.
- **Réforme et déclassement** : voir la section 13, parce que la Primature ne décide pas seule.

---

## 6. Les documents, et leur chaînage

Chaque document porte un **numéro unique**, une **signature électronique**, et des **liens** vers ceux
qui le précèdent et le suivent. Un document validé est figé : on ne le modifie pas, on en émet un
autre.

| Document | Émis par | Déclenche | Lié à |
|---|---|---|---|
| État de besoin | Chef de structure | L'examen central | Les lignes demandées |
| Décision d'examen | Chargé de logistique | L'aiguillage | L'état de besoin |
| Dossier d'achat | Système | La procédure de passation | Un ou plusieurs états de besoin |
| Bon de commande | Chargé de logistique + visas | La réception | Le dossier d'achat, le fournisseur |
| Procès-verbal de réception | Commission de réception | La prise en charge | Le bon de commande |
| **Certificat de prise en charge à l'inventaire** | Comptable des matières | **Le paiement** | Le PV de réception, les biens immatriculés |
| Bon de livraison | Système | La sortie de stock | L'état de besoin |
| Accusé de réception | Structure destinataire | La clôture | Le bon de livraison |
| Acte de transfert | Les deux détenteurs | Le changement d'affectation | Le bien |
| PV de perte ou de vol | Chef de structure | L'enquête | Le bien |
| PV de réforme | Commission | La saisine des domaines | Le bien |
| État d'inventaire du patrimoine | Comptable des matières, au 31 décembre | Le compte de gestion | L'ensemble du périmètre |

Le dernier a un fondement précis : décret 2013, art. 32 — au 31 décembre, il est établi un
procès-verbal de l'encaisse « ainsi qu'un **état d'inventaire du patrimoine** ». ⟨H⟩ Sa forme est fixée
par un arrêté du ministre des Finances, à récupérer.

Et l'art. 121 ajoute que les comptables publics annexent à leur compte de gestion « un compte de
gestion des matières » pour les valeurs inactives.

---

## 7. Le poste de commande central

C'est la réponse à « il faut que la Primature soit en mesure de contrôler tout ce qui se passe ».

Un principe de conception gouverne tout l'écran : **aucun chiffre n'est un cul-de-sac.** Chaque
nombre affiché se déplie jusqu'à la pièce qui le compose — jusqu'à l'état de besoin, jusqu'au bien,
jusqu'à l'agent. Un tableau de bord qui ne se déplie pas ne sert qu'à décorer un rapport.

**Ce qui attend une décision.** La seule liste qui compte en ouvrant l'écran : les demandes en
attente, triées par ancienneté décroissante, avec le nom de celui qui doit agir. Pas un camembert :
une file de travail.

**Les demandes en cours**, par structure et par état, avec l'âge de chacune et le délai moyen
constaté. Le délai entre l'état de besoin et la livraison est l'indicateur de performance principal du
système.

**Le patrimoine.** Nombre de biens, dont immatriculés et étiquetés. Taux de couverture de l'inventaire
par structure. Écarts entre l'inventaire physique et la base, et leur traitement. Valeur par
catégorie.

**Les stocks.** Articles sous seuil minimum, articles sous seuil critique, ruptures prévisibles à
trente jours au rythme de consommation constaté. C'est l'écran qui fait passer la Logistique de la
réaction à l'anticipation.

**Les achats.** Dossiers en cours par procédure, délais fournisseurs constatés, écarts
commandé/livré/reçu, et les montants engagés contre les crédits disponibles.

**Les alertes.** Celles du module IA, avec leur justification et leur suite donnée (section 10).

**Consolidation et étanchéité.** Le niveau central voit tout, y compris les établissements publics
autonomes — en consolidé. Mais une structure ne voit jamais une autre structure. C'est un invariant,
pas une option de paramétrage.

---

## 8. Les fournisseurs

Un registre tenu dans le système, et non une liste dans un tableur.

**Identification** : dénomination, forme juridique, numéro RCCM, identifiant national, numéro impôt,
adresse, contacts, coordonnées bancaires.

**Qualification** : catégories de biens et services fournis, pièces administratives avec leur date de
validité, et l'alerte quand une pièce expire.

**Historique et performance** : commandes passées, montants, **délai de livraison constaté** par
commande, écarts commandé/livré/reçu, conformité des réceptions. Ces données ne servent pas à faire
joli : elles servent à choisir, et à justifier le choix.

**Contrôle d'intégrité** — et c'est ici qu'une trouvaille s'insère. Le site de l'ARMP publie une
**liste noire** des fournisseurs exclus. Le SIGL doit la confronter au registre : à l'enregistrement
d'un fournisseur, et à chaque émission de bon de commande. C'est le drapeau rouge R046, « candidat
exclu ou inscrit sur une liste de sanctions », et c'est un contrôle que personne ne fait à la main de
façon fiable.
⟨H⟩ Le format de publication de cette liste est à vérifier : si elle n'est pas exploitable
automatiquement, il faut prévoir un import périodique manuel.

**Détection de doublons et de liens** : même adresse, même téléphone, même numéro de compte, même
bénéficiaire effectif entre deux fournisseurs. Drapeaux rouges R032, R033, R042, R044. Et la
vérification que les coordonnées d'un fournisseur ne coïncident pas avec celles d'un agent de la
Primature — drapeau rouge R043.

---

## 9. L'inventaire physique, et le rapprochement

### La campagne d'inventaire

Une campagne est un objet du système : un périmètre, une date, des agents désignés, un état
d'avancement. Sur le terrain, l'application mobile scanne le QR code, confirme la présence, l'état et
le détenteur, prend une photo si nécessaire — **et fonctionne hors ligne**, en synchronisant au retour
du réseau.

Trois résultats possibles par bien : conforme, écart, introuvable. Chaque écart est une anomalie qui
suit son propre circuit : constat, explication du détenteur, décision, régularisation ou PV de perte.

Fondement : décret 2013, art. 120 — « des inventaires et comptes d'emplois sont établis **à dates
fixes** et à l'occasion des contrôles effectués par les organes habilités ».

### Le rapprochement contradictoire

L'art. 123 impose que « des **rapprochements périodiques contradictoires** sont effectués entre les
données de la comptabilité des matières et celles de la comptabilité générale de l'État ».

Ce n'est pas un rapport : c'est une fonction. Deux jeux de données, une confrontation périodique, la
liste des écarts, et la trace de leur traitement. Le système produit le constat et conserve
l'explication. ⟨H⟩ Reste à savoir comment la comptabilité générale de la Primature est tenue
aujourd'hui, et donc comment l'interfacer.

### La reprise de l'existant

L'art. 123 prévoit que les biens acquis avant l'entrée en vigueur du décret « sont inventoriés,
immatriculés, valorisés et enregistrés » selon un référentiel harmonisé national. C'est la phase
d'inventaire initial, et c'est la plus longue du projet.

L'avertissement vient de France : dans Chorus RE-FX, les données venaient de systèmes antérieurs
hétérogènes et n'ont jamais été rapprochées ni fiabilisées de façon constante. **Conséquence pour
nous : une recette formelle des données, avec procès-verbal, avant de brancher quoi que ce soit sur la
comptabilité.**

---

## 10. L'IA : ce qu'elle surveille, ce qu'elle ne décide pas

Le principe est posé et il ne bouge pas : **l'IA alerte, un humain tranche.** Chaque alerte est
conservée avec sa justification et la suite qui lui a été donnée, ce qui en fait une piste d'audit.

Ce n'est pas une position de prudence commerciale, c'est ce que dit le guide 2024 de l'Open Contracting
Partnership : un drapeau rouge ouvre un examen, il ne conclut pas. Et les données manquent souvent
pour calculer un indicateur — un indicateur partiel vaut mieux qu'un indicateur inventé.

Sur les 73 indicateurs du guide, **30 sont calculables sur les données propres du SIGL**, sans portail
d'appels d'offres ouvert. Les voici regroupés par ce qu'ils détectent, en langage courant.

**Contournement des seuils de passation**
- Un achat découpé en plusieurs commandes qui passent chacune sous le seuil (R011)
- Des achats de gré à gré répétés juste sous le seuil (R049, R055)
- Un marché attribué de gré à gré puis gonflé par avenants au-delà du seuil concurrentiel (R054)
- Une manipulation du montant estimé pour choisir la procédure (R002)
- Un recours injustifié à une procédure non concurrentielle (R010), et un taux élevé de ces
  procédures (R013)
- Des commandes contraires au plan de passation (R012)

**Prix et quantités anormaux**
- Une ligne de commande anormalement basse ou haute par rapport à l'historique (R017)
- Un montant éloigné de la moyenne de la catégorie (R016)
- Un prix attribué très proche ou supérieur à l'estimation (R031)
- Des prix dont la distribution s'écarte de la loi de Benford (R029)

**Écarts d'exécution**
- Un défaut de livraison (R067)
- Des mouvements qui dépassent le montant du contrat (R068)
- Des avenants qui augmentent le prix, ou les lignes, ou les réduisent (R064, R065, R066, R069)
- Un écart important entre le montant attribué et le montant final (R059)
- Des prestations non conformes aux spécifications (R073)

**Fournisseurs douteux**
- Fournisseur exclu ou sous sanctions (R046)
- Absent des registres du commerce (R045)
- Adresse ou téléphone anormal (R042)
- Catalogue hétérogène, sans lien entre les objets fournis (R048)
- Coordonnées identiques à celles d'un agent du projet (R043)
- Fournisseurs liés entre eux : même bénéficiaire effectif, même actionnaire, similitudes
  d'entreprise (R032, R033, R044)
- Un petit achat initial suivi d'achats bien plus importants (R052)

**Concentration et concurrence**
- Une seule offre reçue (R018)
- Peu de candidats pour une catégorie (R019)
- Part élevée des commandes concentrée sur un fournisseur (R040, R050, R051)
- Rotation suspecte des attributaires (R057)
- Spécifications techniques taillées pour un fournisseur (R007)

**Et les alertes propres à la logistique**, qui ne viennent pas du guide mais du métier : consommation
anormale d'une structure par rapport à son effectif, demandes répétées du même article par le même
agent, déclassements suspects, écarts récurrents d'inventaire sur un même détenteur, rupture de stock
sur un article à rotation régulière.

**Ce que l'IA fait aussi**, du côté de l'aide : prévision des besoins à partir de la consommation
constatée, assistant en langage naturel en français pour interroger le registre, et rapports mensuels
rédigés.

⟨H⟩ Contrainte à trancher d'emblée : le Code du numérique impose l'hébergement des données en RDC
(art. 201), et ferme aux autorités publiques les dérogations fondées sur le consentement (art. 202).
Un modèle d'IA hébergé hors du pays n'est donc pas acquis. Cette question doit être posée au cadrage,
car elle détermine l'architecture du module.

---

## 11. Les droits

Quatre règles, et elles ne se négocient pas au paramétrage.

1. **Une structure ne voit que ses données.** Jamais celles d'une autre. Y compris en recherche, en
   export et dans les suggestions de l'assistant.
2. **Le niveau central voit tout**, en consolidé, avec le détail accessible.
3. **Le contrôle externe — IGF, Cour des comptes — voit tout en lecture**, avec accès à la piste
   d'audit, et sans jamais pouvoir écrire.
4. **La séparation des fonctions est respectée** : celui qui demande ne vise pas, celui qui réceptionne
   ne valide pas sa propre réception, celui qui engage ne paie pas. Quand une structure est trop
   petite pour que ce soit possible, le système exige un contrôle compensatoire — un visa a posteriori
   tracé — plutôt que de laisser passer silencieusement.

Toute action sensible est journalisée : qui, quoi, quand, depuis où, et la valeur avant et après. Le
journal n'est modifiable par personne, administrateur compris.

---

## 12. La conformité, intégrée et non ajoutée

Ces contraintes viennent des textes lus. Elles ne sont pas des options de fin de projet : elles
dessinent l'architecture.

| Exigence | Fondement | Ce que ça impose |
|---|---|---|
| Hébergement en RDC | Code du numérique, art. 201 | Le SIGL et son site de secours sont hébergés en RDC. Aucun service tiers hors RDC ne traite de données personnelles sans autorisation préalable de l'Autorité de protection des données |
| Dérogations fermées | Art. 202 | La Primature ne peut pas invoquer le consentement des agents ni une clause contractuelle pour héberger ailleurs |
| Signature électronique | Art. 105, 108, 112, 137 | Passage obligé par un prestataire de services de confiance **qualifié et autorisé** en RDC. Seule la signature qualifiée liée à un certificat qualifié a la force probante d'une signature manuscrite |
| Autorisation préalable | Art. 15, 16 | L'hébergement d'applications et la construction de centres de données sont soumis à autorisation ministérielle |
| Homologation | Art. 19 | Les services numériques fournis à l'État doivent être conformes aux Normes et Standards du Numérique du secteur public. ⟨H⟩ Référentiel à récupérer |
| Archivage électronique | Art. 42, 43 | Documents conservés sous une forme non modifiable et non altérable, données structurées et indexées, restitution garantie dans un contexte technologique changeant |
| Régulation des archives | Art. 45, 46 | L'INACO encadre les archives électroniques publiques, et une redevance d'archivage existe. ⟨H⟩ Coût à chiffrer |
| Document validé figé | Art. 42 | Un document validé n'est jamais modifié : on en émet un nouveau |

---

## 13. Ce que le SIGL ne fait pas

Dire les limites est ce qui rend une proposition crédible.

**Il ne gère pas les immeubles du Gouvernement.** La Cellule de Gestion des Immeubles du Gouvernement
assure déjà la maintenance, l'entretien, la sécurité et la gestion des espaces. Le SIGL enregistre les
immeubles au registre du patrimoine parce que le décret de 2013 l'y oblige, mais il ne refait pas la
gestion technique. ⟨H⟩ L'articulation avec la CGIG est à trancher au cadrage.

**Il ne décide pas des sorties d'actif.** Le décret de 2013 dispose que « la cession et la mise au
rebut des biens d'actif relèvent de la compétence de l'administration en charge des domaines privés et
publics de l'État ». Le SIGL instruit le dossier, produit le procès-verbal de réforme, saisit les
domaines et suit la décision. Il ne la prend pas.

**Il ne remplace pas la comptabilité générale de l'État.** La comptabilité des matières est la
comptabilité **auxiliaire** de la comptabilité générale. Le SIGL la tient, et se rapproche de l'autre.

**Il ne remplace pas le système national des marchés publics.** Il qualifie la procédure applicable,
produit les pièces et suit l'exécution. Les procédures de passation elles-mêmes relèvent de l'ARMP et
de la DGCMP.

**Une étape à ajouter, en revanche.** Avant toute réforme, le dispositif américain des biens
excédentaires offre le bien aux autres structures, qui peuvent le demander. C'est le gisement
d'économies le plus immédiat du projet : du matériel encore utilisable circule au lieu d'être réformé
d'un côté et racheté de l'autre. Cette étape se place **avant** la saisine des domaines, pas à sa
place.

---

## 14. Les hypothèses à confirmer

Chacune se règle en une réunion. Aucune ne justifie d'attendre pour commencer.

**Sur l'organisation**
1. Qui porte la logistique entre le Cabinet et le Secrétariat général à la Primature ? Les deux
   textes se recouvrent.
2. Qui est le propriétaire métier du système : le Conseiller administratif et financier, ou
   l'Intendant général ?
3. Quelle est la liste complète des structures ? Le site officiel s'arrête à la lettre D.
4. Lesquelles sont des établissements publics autonomes, avec leur propre comptable ?
5. Qui est le comptable des matières aujourd'hui, et comment tient-il ses écritures ?

**Sur le périmètre**
6. La Primature détient-elle des valeurs inactives — timbres, vignettes, formules ?
7. Que fait-on de l'immobilier, au regard de la CGIG ?
8. Quel seuil de valeur pour un numéro d'inventaire individuel plutôt qu'un suivi en lot ?
9. Y a-t-il des biens patrimoniaux non évaluables de façon fiable ?

**Sur les textes à récupérer**
10. Le plan comptable de l'État, qui fixe la forme des fiches de stock et des fiches de valeurs.
11. Le référentiel harmonisé national d'immatriculation et de valorisation.
12. L'arrêté du ministre des Finances sur l'état d'inventaire du patrimoine.
13. Les taux d'amortissement et les règles de réévaluation.
14. Les seuils du décret 10/34, toujours non vérifiés.
15. Les Normes et Standards du Numérique du secteur public, pour l'homologation.
16. Le décret organisant le Secrétariat général à la Primature.

**Sur l'infrastructure**
17. Où héberge-t-on en RDC, et où le site de secours ?
18. Quels prestataires de services de confiance qualifiés sont effectivement autorisés en RDC ?
19. Le module IA peut-il tourner en RDC ?
20. Quel est l'état de la connectivité sur les sites, pour calibrer le mode hors ligne ?

**Sur le volume**
21. Combien de biens, de sites, d'agents, d'états de besoin par mois ? Ce sont les paramètres de
    dimensionnement, et ils sont tous inconnus.

---

## Journal

**26 novembre 2026** — Conception fonctionnelle écrite sur la base documentaire des jours précédents,
sans entretiens ni observation sur place. Vingt et une hypothèses marquées et listées. Les apports
qui ne figuraient pas dans la vision initiale : le certificat de prise en charge à l'inventaire comme
verrou du paiement, les valeurs inactives comme neuvième module, le contrôle contre la liste noire de
l'ARMP, le blocage du fractionnement au moment de la saisie, l'étape de réemploi avant la réforme, et
les deux valeurs à tenir pour les stocks distribués gratuitement.
