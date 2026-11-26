# Contexte et mission — conception du SIGL (Primature de la RDC)

> **Comment utiliser ce document.** Colle-le en entier comme premier message. Il contient le besoin,
> les faits vérifiés sur l'institution, le cadre juridique et normatif, et les contraintes. **Il ne
> contient aucune décision de conception : c'est ton travail.** La mission est à la section 12, les
> règles de rédaction à la section 13. Lis-les avant de commencer.

---

## 1. Qui tu es, et ce qu'on attend de toi

Tu es l'architecte fonctionnel d'un système d'information pour une institution publique. Tu travailles
pour **Braintis Technology**, société congolaise de développement logiciel basée à Kinshasa, qui
conçoit ce système pour la **Primature de la République démocratique du Congo**.

**Tu produis la conception.** Le découpage fonctionnel, le modèle de données, les circuits, les
documents, les écrans, les règles : tout cela est à toi. Personne ne l'a décidé avant toi, et ce
document se garde volontairement d'anticiper tes choix.

Ce qui t'est fourni, et que tu ne dois pas refaire : la recherche documentaire, le relevé du cadre
juridique, et l'analyse comparative de ce qui s'est fait ailleurs. C'est dans les sections 4 à 9.
Appuie-toi dessus. Ne contredis pas un article de loi cité ici, et n'en invente aucun autre.

Un développeur reprendra tes livrables pour écrire le code sans avoir à te reposer de questions.
Écris donc pour lui : des règles numérotées, des machines à états complètes, un modèle de données
explicite, une matrice de droits exhaustive. Pas de prose inspirante.

---

## 2. Le besoin, tel que le client l'exprime

Ce qui suit est la demande, dans les termes où elle a été formulée. C'est ton point de départ.

### Le problème

La Primature et ses structures ne disposent pas d'une vision fiable de ce qu'elles possèdent. La
question « combien de véhicules, d'ordinateurs, de climatiseurs l'institution possède-t-elle, et où
sont-ils, et qui en répond ? » n'a aujourd'hui pas de réponse unique et vérifiable.

Les besoins en matériel et fournitures remontent des structures sans que le niveau central dispose
d'une vue d'ensemble de ce qui est demandé, de ce qui a été accordé, de ce qui a été refusé et
pourquoi, ni de ce qui attend une décision depuis trop longtemps.

Les ruptures de stock se constatent au moment où elles se produisent, pas avant.

Et la traçabilité nécessaire pour se justifier devant les corps de contrôle n'existe pas de façon
systématique.

### Ce que le client veut obtenir

**Un inventaire complet de tous les biens de la Primature**, entendue comme l'institution entière :
le Cabinet, le Secrétariat général, et l'ensemble des établissements et structures qui en dépendent.
Chaque bien identifié et rattaché à quelqu'un qui en répond.

**Le périmètre est total.** Le client est explicite sur ce point : **tout**, sans exception. La
gestion du **patrimoine immobilier**, le **charroi automobile**, les **stocks courants** de
fournitures, le matériel informatique, les équipements, le mobilier. Rien n'est écarté au motif
qu'une autre structure s'en occupe déjà par ailleurs : s'il existe un recouvrement, ta conception doit
proposer l'articulation, pas l'exclusion.

**Que la Primature soit en mesure de contrôler tout ce qui se passe.** Au niveau central, voir toutes
les demandes effectuées par toutes les structures, et pouvoir réagir.

**Que les structures elles-mêmes utilisent l'outil**, à leur niveau : déclarer leurs biens, tenir
leurs inventaires, saisir leurs états de besoin. Ce ne sont pas des objets administrés de loin, ce
sont des utilisateurs.

**Et qu'on ne mélange pas deux populations de structures.** C'est une exigence explicite du client, et
elle est structurante :

- Celles qui **dépendent entièrement de la Primature** et **attendent tout d'elle** : elles n'achètent
  pas, elles demandent. Leurs besoins remontent au niveau central, qui arbitre, commande et livre.
  Leur patrimoine est le patrimoine de la Primature, confié à elles.
- Celles qui sont **autonomes** : elles ont leur propre personnalité juridique, leur propre budget et
  leur propre comptable public. Leur patrimoine est le leur. Elles tiennent leur propre comptabilité
  des matières, et la Primature a besoin d'en avoir la vue consolidée sans se substituer à elles.

Ces deux populations n'ont pas le même circuit de décision, pas le même régime de propriété des biens,
pas les mêmes droits et pas le même rapport au niveau central. **Ne les traite pas comme un seul cas
avec des variantes de paramétrage** : vérifie si ce sont deux modèles distincts, et dis ce que tu en
conclus. La section 4 donne les faits juridiques qui fondent cette distinction.

**Que la demande déclenche la suite.** Une structure fait une demande, elle arrive au niveau central,
et de là découle la commande. Les fournisseurs sont enregistrés dans le système.

**Anticiper au lieu de subir** : que des seuils de stock déclenchent une alerte avant la rupture.

**Contrôler** : une traçabilité complète, et une intelligence artificielle qui détecte les
incohérences entre les opérations. Avec un principe qui ne se discute pas : **l'IA alerte, un humain
décide**. Jamais de décision automatique.

### Le périmètre d'usage attendu

Accès web sur ordinateur, et une **application mobile** pour l'inventaire de terrain, avec lecture de
code à barres ou QR, et **fonctionnement hors ligne avec synchronisation** — parce que l'inventaire se
fait là où il n'y a pas forcément de réseau.

### Ce que ce n'est pas

Ce n'est pas un outil de gestion de stock. Le stock en fait partie, mais le besoin central est le
**patrimoine** : ce que l'institution possède, où, dans quel état, sous la responsabilité de qui. Le
stock est la partie qui bouge le plus vite, donc la plus visible, pas la plus structurante. Garde
cette hiérarchie en tête quand tu décideras du découpage.

### Le nom d'usage

Le projet s'appelle **SIGL — Système Intégré de Gestion Logistique**. Dans le vocabulaire du droit
congolais, ce qu'il met en œuvre s'appelle la **comptabilité des matières** (voir sections 5 et 7).

---

## 3. L'argument qui porte le projet

Il ne s'agit pas d'une innovation proposée à une administration. Le **décret n° 13/050 du 6 novembre
2013** impose depuis douze ans une comptabilité des matières, avec inventaires à dates fixes,
immatriculation des biens et rapprochements contradictoires avec la comptabilité générale.
L'obligation existe ; ce qui manque, c'est l'outil qui la rend applicable.

Ce cadrage a une conséquence pour toi : **une conception qui s'écarte des exigences de ce décret est
une conception inutilisable**, quelle que soit sa qualité par ailleurs. Les articles sont en
section 5.

---

## 4. L'institution — faits vérifiés sur sources officielles

### Les trois niveaux

Le **décret n° 20/010 du 1er avril 2020 portant organisation et fonctionnement du Cabinet du Premier
ministre** pose que le Premier ministre « bénéficie également de l'appui d'une administration, *le
Secrétariat général à la Primature*, et, éventuellement, de certains services publics appelés
*Services rattachés* ». Un décret particulier règle l'organisation du Secrétariat général — **ce texte
n'a pas été retrouvé**.

1. **Le Cabinet de la Première ministre** — politique, renouvelé avec le gouvernement.
2. **Le Secrétariat général à la Primature** — administration permanente, personnel de carrière soumis
   au statut des agents de l'État. Le site officiel indique qu'il « assure la gestion administrative,
   technique, financière et **logistique** de la Primature ».
3. **Les services et structures rattachés** — établissements publics et cellules spécialisées.

### Qui fait la logistique, selon le décret de 2020

Le **Personnel d'appoint**, « sous la coordination du Directeur Coordonnateur et la supervision
directe du **Conseiller administratif et financier** », est chargé notamment de :

- la réception et l'enregistrement du courrier adressé au Premier ministre et aux membres du Cabinet ;
- la saisie, l'expédition et la transmission interne et externe du courrier ;
- **l'intendance et la gestion de la logistique** ;
- l'entretien des installations du Cabinet ;
- **la gestion du charroi automobile de la Primature** ;
- la constitution, la conservation et la préservation des archives.

Deux services sont nommément prévus par le décret :

- **Service administratif et financier** : un Comptable public principal, un Contrôleur de budget, un
  Sous-gestionnaire des crédits, un Comptable public subordonné, un Chargé de suivi budgétaire, un
  Chargé du personnel, deux secrétaires.
- **Service d'intendance** : un **Intendant général**, assisté d'un intendant à la Primature et d'un
  intendant à la résidence officielle du Premier ministre, et un agent de sécurité.

Le décret prévoit aussi un **personnel d'appui à la résidence** du Premier ministre, composé
essentiellement d'agents domestiques sous l'autorité d'un Chargé de mission.

### Le fait de gouvernance le plus important

Le décret précise que « le Sous-gestionnaire des crédits, le Contrôleur de budget et les Comptables
publics sont **mis à la disposition du Cabinet du Premier ministre par le Ministre chargé du Budget ou
le Ministre chargé des Finances** selon le cas ».

Autrement dit : **les agents qui contrôlent la dépense à la Primature ne sont pas ses agents.** La
séparation des fonctions est donc déjà organique, inscrite dans l'organisation et non à construire.
Et ces profils relèvent d'une administration tierce, ce qui a des conséquences sur les droits et sur
la force probante de leurs actes — à toi d'en tirer les conséquences de conception.

### Les structures rattachées, telles que publiées

Relevé sur le site officiel : https://www.primature.gouv.cd/primature/structures-rattachees-primature/

| Structure | Nature, selon le site officiel |
|---|---|
| **Secrétariat Général à la Primature** | Administration permanente ; assure la gestion administrative, technique, financière et logistique de la Primature |
| **Secrétariat Général du Gouvernement (SGG)** | Organe permanent d'appui technique, administratif et **logistique** du travail gouvernemental ; prépare le Conseil des Ministres |
| **Cellule de Gestion des Immeubles du Gouvernement (CGIG)** | Assure **déjà** la maintenance, l'entretien, la sécurité et la gestion des espaces des immeubles du Gouvernement |
| **Autorité de Régulation des Marchés Publics (ARMP)** | Régulateur des marchés publics ; **publie une liste noire de fournisseurs** |
| **Cellule d'Analyse des Indicateurs de Développement (CAID)** | Rattachée au Secrétariat général ; collecte et centralise des données sur 145 territoires |
| **Delivery Unit de la Primature (DU)** | Pilotage stratégique, suivi rapproché des projets, indicateurs de performance |
| **Agence de Pilotage, de Coordination et de Suivi des Conventions de Collaboration (APCSC)** | Établissement public |
| **Autorité de Régulation et de Contrôle de la Couverture Santé Universelle (ARC-CSU)** | Établissement public |
| **Caisse Nationale de Péréquation (CNP)** | Instrument financier de l'État |
| **Comité National du Désarmement et de la Sécurité Internationale (CND-SI)** | Organe de coordination |

**Trois avertissements sur cette liste.**

**Un : elle est incomplète.** Le site la présente par ordre alphabétique et s'arrête à la lettre D,
sur la Delivery Unit, sans pagination ni suite. Le nombre réel de structures est inconnu.

**Deux : ces entités n'ont pas toutes le même statut juridique, et c'est le fait qui fonde la
distinction demandée en section 2.** Les cellules et services rattachés au Secrétariat général n'ont
pas de personnalité juridique propre : ils relèvent du budget de la Primature et dépendent d'elle pour
leurs moyens. Les **établissements publics** — APCSC, ARC-CSU, CNP et possiblement d'autres dans la
partie non publiée de la liste — ont une personnalité juridique propre et disposent de leur propre
comptable public : **leur comptabilité des matières leur appartient en droit**, puisque le décret de
2013 la confie au comptable public de l'entité. La Primature ne peut pas la tenir à leur place. C'est
un fait juridique, pas une préférence de conception.

**Trois : le rôle de la CGIG n'est pas une exclusion de périmètre.** La Cellule de Gestion des
Immeubles du Gouvernement assure aujourd'hui la maintenance, l'entretien, la sécurité et la gestion
des espaces des immeubles du Gouvernement. Mais le client veut l'immobilier dans le SIGL, et le décret
de 2013 l'y oblige de toute façon, puisque la comptabilité des matières porte sur « les biens
mobiliers **et immobiliers** » (art. 120). La question n'est donc pas « faut-il traiter l'immobilier »
— la réponse est oui — mais **comment le SIGL s'articule avec une cellule qui en assure déjà
l'exploitation technique**. Propose cette articulation.

---

## 5. Le cadre juridique congolais — articles vérifiés

Ne cite aucun autre article que ceux-ci. Si ta conception a besoin d'une règle de droit absente de
cette liste, signale-le comme un point à vérifier plutôt que d'inventer une référence.

### Décret n° 13/050 du 6 novembre 2013 portant règlement général sur la comptabilité publique

Texte lu intégralement. C'est le texte fondateur du projet.

**La comptabilité de l'État comprend trois volets** : « une comptabilité budgétaire, une comptabilité
générale et une comptabilité des matières **tenues par le comptable public** ».

**Article 120 — l'objet.** La comptabilité des matières « a pour objet la description des existants et
des mouvements concernant les biens mobiliers et immobiliers, les stocks, les titres et valeurs de
l'État ». Elle permet le suivi des immobilisations incorporelles, des immobilisations corporelles, des
actifs financiers et des stocks. Elle concerne également « la comptabilité des **valeurs inactives :
titres, formules, tickets, timbres et vignettes** ». Elle « peut être tenue en partie simple ou en
partie double selon que la nomenclature comptable des matières existe ou non ». Et : « Des
**inventaires et comptes d'emplois sont établis à dates fixes** et à l'occasion des contrôles
effectués par les organes habilités. »

**Article 121.** Les comptables publics annexent à leur compte de gestion l'état de développement des
comptes de l'actif et du passif, ainsi qu'un **compte de gestion des matières** pour ce qui concerne
les valeurs inactives.

**Article 122 — la responsabilité et les documents.** « Les régisseurs ou préposés sont
**personnellement et pécuniairement responsables** des mouvements qu'ils effectuent concernant les
valeurs inactives. » Et : l'organisation et le système comptable applicable à la comptabilité des
matières, « les **fiches de gestion des stocks** et les **fiches de valeurs** sont définis par le
**plan comptable de l'État** ».

**Article 123 — reprise de l'existant et rapprochements.** Les biens corporels et incorporels acquis
avant l'entrée en vigueur du décret « sont **inventoriés, immatriculés, valorisés et enregistrés**
dans les livres suivant les modalités, méthodes et techniques définies dans un **référentiel
harmonisé à l'échelle nationale** ». « Les nouvelles acquisitions sont enregistrées au fur et à mesure
des **certifications et imputations délivrées par les ordonnateurs**. » « Des **rapprochements
périodiques contradictoires** sont effectués entre les données de la comptabilité des matières et
celles de la comptabilité générale de l'État. »

**Article 32 — l'inventaire annuel.** Au 31 décembre de chaque année, les comptables publics
principaux arrêtent toutes les caisses publiques et produisent leurs balances de comptes. À cette date
est établi un procès-verbal constatant et détaillant l'état de l'encaisse, des deniers et valeurs,
« ainsi qu'un **état d'inventaire du patrimoine** ». Un arrêté du ministre des Finances fixe les
modalités relatives à l'organisation, au déroulement, au délai d'exploitation et de publication.

**Article 137 — les contrôles du comptable public.**
*En matière de dépenses*, il contrôle : la qualité d'ordonnateur et l'assignation de la dépense ; la
validité de la créance, portant sur la justification du service fait résultant de la certification
délivrée par l'ordonnateur ainsi que les pièces justificatives produites ; l'intervention préalable
des contrôles, autorisations, approbations, avis ou visas réglementaires ; « la production des
justifications et, le cas échéant, du **certificat de prise en charge à l'inventaire** » ;
l'application des règles de prescription et de déchéance ; le caractère libératoire du paiement.
*En matière de patrimoine*, il contrôle : « la **prise en charge à l'inventaire** des actifs
financiers et non financiers acquis » ; « la conservation des droits, privilèges et hypothèques des
immobilisations incorporelles et corporelles ».

**Les sorties d'actif.** « La cession et la mise au rebut des biens d'actif relèvent de la compétence
de **l'administration en charge des domaines privés et publics de l'État**. » Les modalités de prise
en charge, d'emploi et de conservation des biens, matières, objets et valeurs sont fixées selon les
règles régissant la comptabilité des matières. Les règles de classement et d'évaluation des éléments
du patrimoine, les taux d'amortissement, les provisions pour dépréciation et les modalités de
réévaluation sont fixés par le ministre des Finances. Les biens du domaine public de l'État sont
insaisissables.

**Article 138 — le contrôle externe.** « L'Inspection générale des finances dispose d'une compétence
générale en matière de contrôle des finances et **des biens publics**. »

### Ordonnance-loi n° 23/010 du 13 mars 2023 portant Code du numérique

Texte lu intégralement, 168 pages. Ces articles contraignent l'architecture.

**Article 201 — l'hébergement.** Alinéa 1 : « Les données personnelles sont **stockées et/ou hébergées
en République Démocratique du Congo**. » Un transfert vers une « ambassade digitale », un hébergeur
d'un État tiers ou une organisation internationale n'est possible que si l'Autorité de protection des
données constate un niveau de protection adéquat et suffisant — apprécié au regard de l'état de droit,
de l'existence d'une autorité de contrôle indépendante dans le pays tiers et de ses engagements
internationaux. Et : « Avant tout transfert effectif de données à caractère personnel vers un État
tiers ou une organisation internationale, le responsable du traitement doit préalablement obtenir
**l'autorisation de l'Autorité de protection des données** », le transfert faisant ensuite l'objet
d'un contrôle régulier.

**Article 202 — le piège pour une autorité publique.** L'article liste six dérogations permettant un
transfert vers un pays n'assurant pas un niveau de protection adéquat. Mais il précise que les points
1, 2 et 3 — le consentement de la personne, l'exécution d'un contrat avec elle, un contrat conclu dans
son intérêt — « **ne sont pas applicables aux activités des autorités publiques dans l'exercice de
leurs prérogatives de puissance publique** ». Restent la sauvegarde d'un intérêt public important, les
intérêts vitaux d'une personne, le registre public, ou une autorisation du Conseil des Ministres après
avis conforme de l'Autorité.

**Articles 104 à 113 — la signature électronique.**
- Art. 104 : la signature électronique est un élément de validité d'un acte juridique ; elle identifie
  celui qui l'appose et manifeste son consentement aux obligations qui en découlent. Elle est admise
  dans les échanges et les transactions électroniques. Elle peut être simple ou qualifiée.
- Art. 105 : « Toute personne désireuse d'apposer sa signature électronique simple sur un document
  **recourt au prestataire des services de confiance**. »
- Art. 106 : la signature qualifiée est liée au signataire de manière univoque, permet de l'identifier,
  est créée avec des données que le signataire peut utiliser sous son contrôle exclusif avec un niveau
  de confiance élevé, et est liée aux données associées de telle sorte que toute modification
  ultérieure soit détectable.
- Art. 107 : la fiabilité du procédé est présumée établie, jusqu'à preuve du contraire, lorsqu'il met
  en œuvre une signature qualifiée au moyen d'un dispositif sécurisé de création et d'un dispositif
  qualifié de vérification.
- Art. 108 : « La signature électronique qualifiée liée à un certificat électronique qualifié a **la
  même force probante que la signature manuscrite**. »
- Art. 109 : un document écrit sous forme électronique portant une signature qualifiée est présumé
  avoir été signé par son auteur et son texte présumé non modifié, sauf preuve contraire.
- Art. 112 point 3 : la génération ou la gestion des données de création de signature pour le compte
  du signataire « est **exclusivement confiée à un prestataire de services de confiance qualifié** ».

**Articles 129 à 140 — les prestataires de services de confiance.** Huit services sont concernés
(art. 130) : la signature électronique, le cachet électronique, l'horodatage électronique,
**l'archivage électronique**, la certification électronique, l'authentification de sites internet,
l'envoi recommandé électronique, la cryptologie. Deux catégories : qualifiés et non qualifiés
(art. 136). Les **prestataires qualifiés sont soumis au régime d'autorisation**, les non qualifiés au
régime de déclaration (art. 137 du Livre II). L'Autorité Nationale de Certification Électronique
certifie les technologies employées (art. 134). Un prestataire étranger n'est assimilé à un
prestataire congolais que s'il a une représentation sur le territoire de la RDC **et** satisfait aux
conditions, après vérification par l'ANCE (art. 135). L'article 131 prévoit que le Gouvernement met en
place une **infrastructure à clés publiques nationale**.

**Article 15 — le régime d'autorisation.** Y sont soumis, entre autres : les opérateurs et
fournisseurs de services numériques **construisant des centres de données** ; les fournisseurs de
services numériques de confiance qualifiée ; les fournisseurs de services numériques essentiels ; les
**fournisseurs de services d'hébergement d'applications**. L'autorisation est délivrée par le Ministre
du Numérique après avis écrit de l'Autorité de Régulation du Numérique, de l'ANCE ou de l'Agence
Nationale de Cybersécurité selon les cas (art. 16).

**Article 19 — l'homologation.** Ce régime « atteste que les infrastructures et services numériques
**fournis à l'État** sont conformes aux **Normes et Standards du Numérique applicables au secteur
public** en République démocratique du Congo ainsi qu'aux bonnes pratiques en la matière ». **Ce
référentiel n'a pas été retrouvé.**

**Articles 42 à 46 — l'archivage électronique.**
- Art. 42 : la conservation de documents électroniques archivés doit garantir que l'information est
  accessible et consultable ; que le document est conservé sous la forme sous laquelle il a été créé,
  envoyé ou reçu, ou sous une forme dont on peut démontrer qu'elle n'est susceptible ni de
  modification ni d'altération de son contenu, le document transmis et celui conservé étant
  strictement identiques ; et que l'origine, la destination, la date et l'heure sont conservées.
  L'archivage garantit l'authenticité et l'intégrité.
- Art. 43 : les données doivent être structurées, indexées et conservées sur des formats appropriés à
  la conservation et à la migration, avec restitution garantie dans leur intégrité ou accessibilité
  dans un contexte technologique changeant. Les règles s'appliquent indifféremment aux documents
  numérisés et à ceux conçus nativement sur support électronique.
- Art. 45 : l'**Institut National des Archives du Congo (INACO)** assure l'encadrement et la
  régulation des conditions générales de gestion des archives électroniques, ainsi que l'assistance et
  le conseil aux services publics.
- Art. 46 : une **redevance d'archivage** est instituée sur tous les actes et documents émis par les
  services et établissements publics destinés à être sauvegardés ou archivés ; son taux est fixé par
  arrêté interministériel.

### Loi n° 10/010 du 27 avril 2010 relative aux marchés publics

Elle pose le principe de l'appel d'offres, avec recours exceptionnel au gré à gré, et prévoit que
l'appel d'offres peut être ouvert, restreint ou sur concours. Le **décret n° 010/34 du 28 décembre
2010** fixe les seuils de passation, de contrôle et d'approbation. Le **décret n° 010/22 du 2 juin
2010** porte manuel de procédures. L'**ARMP** régule, la **DGCMP** contrôle.

**Les seuils n'ont pas pu être vérifiés** : le site de l'ARMP refuse les requêtes automatisées. Les
sources secondaires se contredisent — on trouve 50 millions de francs congolais pour les travaux,
fournitures et services courants, 20 millions pour les prestations intellectuelles et délégations de
service public, 100 millions comme seuil de préqualification en appel d'offres restreint ; et pour
l'appel d'offres international, 16 milliards ou 8 milliards pour les travaux selon la source.

**Conséquence : les seuils ne peuvent pas être traités comme des constantes connues.** À toi de dire
comment ta conception s'en accommode.

### Autres textes du cadre, non dépouillés

Loi n° 11/011 du 13 juillet 2011 relative aux finances publiques (LOFIP). Convention de Malabo sur la
cybersécurité et la protection des données, ratifiée le 27 juin 2025.

---

## 6. Les normes comptables et techniques — paragraphes vérifiés

### IPSAS 12, *Inventories* (stocks)

- **Par. 9 — définition.** Les stocks sont des actifs sous forme de matières ou fournitures destinées
  à être consommées dans le processus de production ; **à être consommées ou distribuées dans le cadre
  de la prestation de services** ; détenues pour être vendues ou distribuées dans le cours normal des
  activités ; ou en cours de production pour être vendues ou distribuées.
- **Par. 9 — définitions associées.** Le *coût de remplacement actuel* est le coût que l'entité
  supporterait pour acquérir l'actif à la date de clôture. La *valeur nette de réalisation* est le prix
  de vente estimé dans le cours normal des activités, diminué des coûts estimés d'achèvement et des
  coûts nécessaires à la vente, l'échange ou la distribution.
- **Par. 15 — règle générale.** Les stocks sont évalués au plus faible du coût et de la valeur nette de
  réalisation, sauf application des paragraphes 16 ou 17.
- **Par. 16 — acquisition sans contrepartie.** Les stocks acquis par une transaction sans contrepartie
  sont évalués à leur **juste valeur à la date d'acquisition**.
- **Par. 17 — distribution gratuite ou à prix nominal.** Les stocks détenus pour être **distribués
  gratuitement ou à prix nominal**, ou consommés dans la production de biens destinés à l'être, sont
  évalués au plus faible du coût et du **coût de remplacement actuel**.
- **Par. 18 — le coût.** Il comprend tous les coûts d'achat, les coûts de transformation et les autres
  coûts encourus pour amener les stocks à leur emplacement et dans leur état actuels.

### IPSAS 45, *Property, Plant and Equipment* (immobilisations), mai 2023, remplace IPSAS 17

- **Par. 6 — comptabilisation.** Un bien est comptabilisé si, et seulement si, il est probable que des
  avantages économiques futurs **ou un potentiel de service** lui soient associés, et s'il peut être
  évalué de façon fiable.
- **Par. 7 — biens patrimoniaux.** Un bien patrimonial qui répond à la définition d'un actif mais ne
  satisfait pas au critère d'évaluation fiable n'est pas comptabilisé : il est mentionné en notes, et
  comptabilisé dès que l'information sur son coût ou sa valeur courante devient disponible.
- **Par. 8 — l'unité de comptabilisation.** La norme **ne prescrit pas** ce qui constitue un élément
  d'immobilisation : c'est une affaire de jugement. Il peut être approprié de désagréger les éléments
  individuellement significatifs, comme les étages d'un bâtiment, ou d'**agréger les éléments
  individuellement non significatifs — « livres de bibliothèque, périphériques informatiques et petits
  matériels » — et d'appliquer les critères à la valeur agrégée**.
- **Par. 11 à 13 — évaluation initiale.** Un bien qui remplit les critères est évalué à son coût, sauf
  s'il est acquis par transaction sans contrepartie. Dans ce cas il est évalué à son **coût réputé**
  (*deemed cost*), déterminé selon IPSAS 46. Cette évaluation initiale ne constitue pas une
  réévaluation. **Ce n'est donc pas la même règle que pour les stocks**, qui vont à la juste valeur
  selon IPSAS 12 par. 16.
- **Par. 27 et 28 — base d'évaluation en valeur courante.** C'est **l'objectif principal de détention**
  qui détermine la base : un bien détenu principalement pour sa **capacité opérationnelle** est évalué
  à la *current operational value*, un bien détenu pour sa **capacité financière** à la juste valeur. La
  base s'applique de façon constante, sauf changement de l'objectif de détention, auquel cas le
  changement de base est approprié. Le par. AG21 précise qu'un bien détenu dans un objectif de
  prestation de service relève de la capacité opérationnelle.
- **Par. AG12 — frontière avec les stocks.** Les pièces de rechange, le matériel de secours et le
  matériel d'entretien sont comptabilisés selon IPSAS 45 quand ils répondent à la définition d'une
  immobilisation ; **sinon ils sont classés en stocks** selon IPSAS 12.
- **Par. 45 et 29** : la dotation aux amortissements est comptabilisée en résultat sauf incorporation
  dans le coût d'un autre actif ; les réévaluations doivent être faites avec une régularité suffisante
  pour que la valeur comptable ne diffère pas significativement de la valeur courante à la clôture.

### Les autres normes du cadre

- **ISO 55001:2024** — deuxième édition publiée en juillet 2024, remplace celle de 2014. Elle spécifie
  les exigences d'un **système de management** des actifs : politique de gestion d'actifs, objectifs,
  système, amélioration continue fondée sur des revues périodiques. Elle suit la structure de haut
  niveau de l'Annexe SL. L'édition 2024 ajoute des exigences sur l'identification des parties
  intéressées et de leurs besoins, et sur le leadership de la direction. Famille : ISO 55002 (guide
  d'application), **ISO 55011** (politique publique favorisant l'adoption de la gestion d'actifs —
  pertinent pour un État), ISO 55012 (implication et compétence des personnes), ISO 55013 (données
  d'actifs).
  **Attention : ISO 55001 porte sur le système de management, pas sur le logiciel.** Aucune norme ne
  définit l'« EAM » comme catégorie de logiciels : c'est un vocabulaire d'éditeurs.
- **ISO/IEC 19770-1** — gestion des actifs logiciels et informatiques.
- **ISO/IEC 27001:2022** — sécurité de l'information. **ISO/IEC 42001:2023** — management de
  l'intelligence artificielle. **ISO 28000:2022** — sécurité de la chaîne d'approvisionnement.
  **ISO 31000** — management du risque. **ISO 37001** — anti-corruption. **ISO 15489** — archives.
- **GS1 GIAI**, *Global Individual Asset Identifier* — identifiant globalement unique pour un actif
  individuel, alphanumérique de **30 caractères au maximum**, composé d'un préfixe d'entreprise attribué
  par l'organisation GS1 et d'une référence d'actif dont la structure est laissée au propriétaire ou au
  gestionnaire du bien. Porteurs possibles : GS1 QR Code, GS1 DataMatrix, GS1-128. Exemples d'usage
  cités par GS1 : matériel de bureau, matériel de transport, matériel informatique, véhicules.
  C'est la codification retenue par le client pour l'étiquetage.

---

## 7. Le vocabulaire imposé

Les documents, les actes et les rôles sont nommés par le droit congolais. Un document de conception
qui emploie le vocabulaire légal se fait lire ; un document qui emploie le vocabulaire des éditeurs se
fait reprendre. Emploie systématiquement la colonne de droite.

| Ne pas dire | Dire |
|---|---|
| Gestion de stock (le domaine) | Comptabilité des matières |
| Inventaire (le document annuel) | État d'inventaire du patrimoine |
| Gestionnaire de stock | Comptable des matières, régisseur, préposé, détenteur |
| Entrée en stock | Prise en charge à l'inventaire |
| Fiche article | Fiche de gestion des stocks, fiche de valeurs |
| Numéro d'inventaire | Immatriculation |
| Mise au rebut, sans distinction | Cession, mise au rebut, réforme, déclassement |
| Validation, sans précision | Certification, imputation, visa — selon l'acteur |
| Utilisateur | Le rôle précis : agent demandeur, chef de structure, comptable des matières… |

Pour mémoire, la définition doctrinale du concept dans les finances publiques francophones : la
comptabilité des matières est une **comptabilité d'inventaire permanent** ayant pour objet la
description des existants, des biens meubles et immeubles, et des stocks autres que les deniers et
valeurs. Elle est tenue par un **comptable des matières** et constitue la **comptabilité auxiliaire**
de la comptabilité générale de l'État.

---

## 8. Ressource — le catalogue des indicateurs de risque

Le client demande une IA qui détecte les incohérences entre opérations. Plutôt que d'inventer des
indicateurs, appuie-toi sur un catalogue éprouvé : le guide **« Red flags in public procurement »** de
l'**Open Contracting Partnership**, édition 2024. Il recense 73 indicateurs, chacun avec sa
définition, sa formule et les données nécessaires.
https://www.open-contracting.org/wp-content/uploads/2024/12/OCP2024-RedFlagProcurement-1.pdf

**Deux avertissements du guide, à reprendre dans ta conception.** D'abord, les données manquent souvent
pour calculer un indicateur : on ne calcule alors qu'un indicateur partiel, ou rien. Ensuite, **un
drapeau rouge ouvre un examen, il ne conclut pas** — ce qui rejoint exactement le principe posé par le
client.

Le catalogue complet, par catégorie. **C'est à toi de déterminer lesquels sont calculables sur les
données d'un système interne comme le SIGL, lesquels supposent des données qu'il n'aura pas, et
lesquels doivent être adaptés.**

**Faible transparence** — R001 documents de planification non disponibles · R004 publicité
insuffisante de l'appel à concurrence · R005 informations et documents clés non disponibles · R013
recours élevé aux procédures non concurrentielles · R039 questions des candidats restées sans réponse ·
R063 contrat non publié

**Faible concurrence** — R018 une seule offre reçue · R019 nombre de candidats faible pour la
catégorie d'articles · R040 part élevée des contrats d'un même acheteur · R050 part de marché élevée ·
R051 concentration élevée du marché

**Fraude** — R042 adresse ou téléphone anormal du candidat · R045 candidat absent des registres du
commerce · R046 candidat exclu ou sous sanctions · R047 fournisseur introuvable · R048 fournisseur
hétérogène · R064 contrat ayant fait l'objet de modifications · R065 avenants réduisant les lignes ·
R066 avenants augmentant les lignes · R067 défaut de livraison · R068 mouvements dépassant le montant
du contrat · R069 avenants augmentant le prix · R073 écarts entre prestations réalisées et
spécifications

**Risque d'entente** — R017 ligne anormalement basse ou haute · R022 forte dispersion des prix ·
R023 prix en multiples fixes · R024 prix proche de l'offre gagnante · R025 offres perdantes en excès ·
R026 prévalence des groupements · R027 candidats manquants · R028 prix identiques · R032 même
bénéficiaire effectif · R033 même actionnaire principal · R034 offres déposées dans le même ordre ·
R041 similitudes matérielles entre documents · R044 similitudes d'entreprise · R053 co-soumissionnaires
avec gagnant récurrent · R057 rotation des gagnants · R058 offre fortement remisée · R070 perdants
recrutés comme sous-traitants · R071 titulaire sous-traitant tout ou presque · R072 prévalence élevée
de la sous-traitance

**Truquage de la procédure** — R002 manipulation des seuils · R003 délai de remise trop court ·
R006 préqualification déraisonnable · R007 spécifications techniques déraisonnables · R008 frais de
participation déraisonnables · R009 coût du dossier augmenté · R010 recours injustifié à une procédure
non concurrentielle · R011 fractionnement pour éviter les seuils · R012 gré à gré contraire au plan de
passation · R014 délai court entre publication et ouverture · R015 délai long entre ouverture et
évaluation · R016 valeur éloignée de la moyenne de la catégorie · R020 marché faisant l'objet d'une
plainte · R021 critères d'évaluation discrétionnaires · R029 prix s'écartant de la loi de Benford ·
R030 offre tardive gagnante · R031 prix gagnant très proche ou supérieur à l'estimation · R035 toutes
les offres sauf la gagnante écartées · R036 offre la moins chère écartée · R037 disqualifications mal
motivées · R038 disqualifications excessives · R043 candidat ayant les coordonnées d'un agent du
projet · R049 gré à gré juste sous le seuil · R052 petit achat initial suivi d'achats importants ·
R054 gré à gré puis avenants dépassant le seuil · R055 gré à gré répétés au-dessus ou juste sous le
seuil · R056 offre gagnante ne satisfaisant pas aux critères · R059 écart important entre montant
attribué et montant final · R060 délai long entre attribution et signature · R061 délai de décision
extrêmement court · R062 délai de décision extrêmement long

**Une ressource à exploiter** : l'ARMP publie une liste noire de fournisseurs exclus, accessible depuis
son site. Son format de publication reste à vérifier.

---

## 9. Les enseignements comparés — ce qui a marché et raté ailleurs

Recherche menée sur sources primaires : textes officiels, rapports d'institutions de contrôle, audits
internes. Ce sont des faits documentés, pas des opinions de prestataires.

**France — Chorus RE-FX.** Patrimoine immobilier de l'État, sous SAP Flexible Real Estate Management,
avec le module des immobilisations intégré depuis 2009. Ce qui fonctionne : un référentiel unique qui
fait foi pour la politique immobilière et alimente la comptabilité générale sans double saisie, la
mise à jour étant confiée à un gestionnaire du référentiel désigné dans chaque service —
responsabilité nominative. Ce qui a raté : les données venaient de systèmes antérieurs hétérogènes et
n'ont pas été rapprochées ni fiabilisées de façon constante, constat de la Cour des comptes. Le module
décrit le parc, il ne le gère pas.

**Belgique — FEDCOM.** Comptabilité générale fédérale intégrée au budgétaire, sous SAP, avec un volet
actifs et le scan des éléments d'inventaire. Ce qui a raté : la Cour des comptes a estimé les objectifs
non totalement atteints et relevé que les fonctionnaires de l'administration centrale devaient faire
appel à des tiers pour gérer le système. La comptabilité analytique ne couvre que les dépenses.

**Canada — Directive sur la gestion du matériel** du Conseil du Trésor, en vigueur le 13 mai 2021,
modifiée le 11 juillet 2023. Elle remplace trois textes antérieurs, définit le matériel comme tous les
biens meubles à l'exception de l'argent et des documents, et **oblige chaque ministère à disposer d'un
système d'information de gestion du matériel** : l'obligation porte sur la tenue de l'information, pas
sur un produit. Puis **GCfm**, solution SAP S/4HANA avec un **gabarit unique** imposé à tous les
ministères plutôt que vingt paramétrages divergents.

**États-Unis — DPAS devenu ELMS, et IUID.** La notion d'**APSR**, *Accountable Property System of
Record* : un seul système est désigné comme faisant foi pour la comptabilité des biens, et tenir un
registre en dehors de lui est en soi une non-conformité — une inspection générale a précisément
épinglé une agence qui conservait des enregistrements hors du système de référence, et un audit plus
ancien a montré que le système ne couvrait pas la totalité des biens. L'**IUID** impose une
identification unique avec registre central pour les biens au-delà d'un seuil de valeur, où tout
changement d'état ou sortie d'inventaire oblige à mettre à jour le registre, y compris pour les biens
confiés aux prestataires, qui les déclarent eux-mêmes.

**États-Unis — GSAXcess et FMR 41 CFR 102-36.** Avant toute mise au rebut, le bien excédentaire est
déclaré et offert aux autres administrations, qui peuvent le demander, en général dans l'ordre
d'arrivée ; un agent nommé par agence répond de ce circuit.

**Programme alimentaire mondial — LESS.** Gestion en temps réel des marchandises sur la chaîne
logistique, sous SAP. Deux audits internes publics. Celui de 2021 relève que les décisions de
changement et d'allocation de ressources relevaient d'une équipe distincte du propriétaire du
processus métier, et recommande de réexaminer les capacités du système face aux besoins réels des
utilisateurs.

**Causes d'échec convergentes des ERP publics**, relevées sur plusieurs sources : gestion du changement
et formation sous-estimées — cause la plus citée, loin devant les causes techniques ; absence de
contrôle formalisé des changements ; autorité floue et coordination de projet faible ; déploiements
précipités et tests insuffisants ; **contournements du système après la mise en service** ; propriété
des données non définie après le démarrage. La période la plus fragile est souvent les premiers mois
d'exploitation, pas la phase de construction.

---

## 10. Les contraintes non négociables

Celles-ci ne sont pas des préférences : elles viennent du droit ou du client.

**Du droit**

1. **Hébergement en RDC**, site de secours compris. Aucun traitement de données personnelles par un
   service tiers hors RDC sans autorisation préalable de l'Autorité de protection des données, et les
   dérogations fondées sur le consentement sont fermées aux autorités publiques (art. 201 et 202).
   Cela vaut aussi pour tout service d'IA.
2. **Signature électronique via un prestataire de services de confiance qualifié et autorisé en RDC.**
   Le système ne fabrique pas ses propres signatures (art. 105, 108, 112).
3. **Exigences d'intégrité de l'archivage** : forme non modifiable et non altérable, données
   structurées et indexées, formats adaptés à la conservation et à la migration, restitution garantie
   dans un contexte technologique changeant (art. 42 et 43).
4. **Les seuils de passation changent par décret** et ne sont pas connus à ce jour.
5. **Le système ne décide pas des cessions ni des mises au rebut** : cette compétence appartient à
   l'administration des domaines.
6. **L'Inspection générale des finances a compétence générale sur les biens publics** (art. 138), et
   la Cour des comptes exerce son contrôle. Ce sont des lecteurs du système.

**Du client**

7. **Le périmètre couvre tout** : patrimoine immobilier, charroi automobile, stocks courants,
   matériel informatique, équipements, mobilier, et les valeurs inactives si la Primature en détient.
   Aucune catégorie de biens n'est écartée au motif qu'une autre structure s'en occupe déjà.
8. **Les structures dépendantes et les structures autonomes ne se traitent pas de la même façon**, et
   le système ne doit pas les confondre. Exigence en section 2, faits juridiques en section 4.
9. **Une structure ne voit que ses propres données.** Le niveau central voit tout, en consolidé pour
   les structures autonomes.
10. **L'IA alerte, un humain décide.** Aucune décision automatique, jamais, et chaque alerte est
    conservée avec sa justification et la suite qui lui a été donnée.
11. **Séparation des fonctions respectée**, et traçabilité de toute action sensible.
12. **Document validé figé.**
13. **Pas de développement spécifique par structure.** Les particularités d'une structure se règlent
    en paramètres. Cela ne contredit pas le point 8 : deux régimes distincts, oui ; vingt
    paramétrages divergents, non.
14. **Tout en français** : interface, messages d'erreur, documents générés, assistant en langage
    naturel.
15. **Mobile avec fonctionnement hors ligne et synchronisation.**

---

## 11. Les faits non vérifiés

Il n'y a pas eu d'entretiens ni d'observation sur place : le client n'a pas ce temps. Les points
suivants ne sont donc pas établis. Quand ta conception dépend de l'un d'eux, **dis-le à cet endroit
précis**, et propose si possible une solution qui tienne dans les deux cas.

**Organisation** — Qui porte réellement la logistique entre le Cabinet et le Secrétariat général à la
Primature : les deux textes leur attribuent des missions qui se recouvrent. Qui serait le propriétaire
métier du système. La liste complète des structures, la source officielle s'arrêtant à la lettre D.
Lesquelles sont des établissements publics autonomes avec leur propre comptable. Qui est le comptable
des matières aujourd'hui, et comment il tient ses écritures.

**Périmètre** — Si la Primature détient des valeurs inactives au sens de l'article 120. Comment
s'articulent concrètement le SIGL et la CGIG sur l'exploitation des immeubles — l'immobilier est dans
le périmètre, c'est le partage des tâches qui reste à établir. S'il existe des biens patrimoniaux non
évaluables de façon fiable au sens d'IPSAS 45 par. 7. Quelle est l'étendue du charroi automobile, et
s'il est déjà suivi quelque part.

**Structures dépendantes et autonomes** — La répartition exacte entre les deux populations n'est pas
établie, puisque la liste officielle est incomplète. Pour chaque structure il faudra savoir : si elle
a une personnalité juridique propre, si elle dispose de son propre budget et de son propre comptable
public, et si elle achète elle-même ou attend tout de la Primature. **Ta conception doit fonctionner
sans connaître cette répartition à l'avance** : le régime d'une structure est une donnée, pas une
hypothèse de développement.

**Textes à récupérer** — Le plan comptable de l'État, qui fixe la forme des fiches de gestion des
stocks et des fiches de valeurs (art. 122). Le référentiel harmonisé national d'immatriculation et de
valorisation (art. 123). L'arrêté du ministre des Finances sur l'état d'inventaire du patrimoine
(art. 32). Les taux d'amortissement et les règles de réévaluation. Les seuils du décret 10/34. Les
Normes et Standards du Numérique du secteur public, pour l'homologation (art. 19). Le décret
organisant le Secrétariat général à la Primature.

**Infrastructure** — Où héberger en RDC, et où placer le site de secours. Quels prestataires de
services de confiance qualifiés sont effectivement autorisés, et l'état de l'infrastructure à clés
publiques nationale de l'article 131. L'état de la connectivité sur les sites, pour calibrer le mode
hors ligne.

**Volume** — Combien de biens, de sites, d'agents, de demandes par mois. Tous inconnus, et tous
nécessaires au dimensionnement.

---

## 12. Ta mission

**Le découpage fonctionnel est à toi.** Ne cherche pas dans ce document une liste de modules : il n'y
en a pas. À partir du besoin de la section 2, des faits de la section 4, du droit des sections 5 et 6
et des contraintes de la section 10, décide toi-même comment le système se structure, et justifie ton
découpage.

Produis les livrables suivants. Chacun est un document autonome.

**12.1 — L'architecture fonctionnelle.** Ton découpage, et pourquoi celui-là. Ce que chaque ensemble
couvre et où passent les frontières. Le périmètre est total — immobilier, charroi, stocks courants,
équipements, matériel informatique — donc ne propose pas d'exclusion de catégorie de biens. En
revanche, traite explicitement **deux articulations** : avec la CGIG, qui assure déjà l'exploitation
technique des immeubles du Gouvernement, et avec l'administration des domaines, seule compétente pour
les cessions et mises au rebut. Et traite **la distinction entre structures dépendantes et structures
autonomes** : dis si ce sont deux modèles ou un modèle paramétré, et défends ta réponse.

**12.2 — Le modèle de données.** Toutes les entités, leurs champs avec types et contraintes, les
relations. Pour chaque champ, sa source : un article de loi, un paragraphe de norme, ou une décision
de conception qui t'appartient — dis laquelle. Explicite les clés, les index utiles, ce qui est
historisé, et comment tu traites le multi-structures au regard des statuts juridiques différents
relevés en section 4.

**12.3 — Les circuits, sous forme de machines à états.** Pour chaque objet qui a un cycle de vie : les
états, qui peut agir dans chacun, les transitions permises, **celles qui sont interdites et pourquoi**,
ce qui est produit, ce qui est journalisé.

**12.4 — Les règles de gestion numérotées.** Une par ligne, formulée de façon testable, avec son
fondement et le lieu du contrôle. Forme attendue : « RG-042 — *énoncé de la règle*. Fondement : *article
ou principe*. Contrôle : serveur. »

**12.5 — La matrice de droits.** Rôles en lignes, objets et actions en colonnes. Exhaustive. Traite
explicitement le cas d'une structure trop petite pour que la séparation des fonctions soit matériellement
possible.

**12.6 — Les documents générés.** Lesquels, pourquoi ceux-là, et pour chacun : son contenu champ par
champ, sa règle de numérotation, qui le signe, à quoi il est lié, ce qu'il déclenche, ses conditions
d'émission. Accorde une attention particulière aux pièces que le droit nomme expressément.

**12.7 — Les écrans, par rôle.** Pour chaque rôle, les écrans dont il a besoin, ce qu'il y voit, ce
qu'il y fait, dans quel ordre. Dis par quels parcours tu commences et pourquoi. Pour les écrans de
pilotage destinés au niveau central, détaille les blocs et ce que chaque chiffre permet d'atteindre.

**12.8 — La détection d'anomalies.** Quels indicateurs tu retiens parmi le catalogue de la section 8,
lesquels tu écartes et pourquoi, lesquels tu ajoutes au titre du métier logistique. Pour chacun : la
règle en langage précis, les données nécessaires, le seuil de déclenchement proposé et comment il se
règle, le risque de faux positif, et ce que l'humain voit quand l'alerte tombe.

**12.9 — L'inventaire physique et le rapprochement.** Comment une campagne se déroule, comment
fonctionne le mode hors ligne et quelle est la politique de résolution de conflit, comment les écarts
sont traités, et comment tu réalises le rapprochement contradictoire exigé par l'article 123.

**12.10 — Le plan de mise en œuvre par lots.** Dans quel ordre construire, et pourquoi cet ordre.
Découpe-le pour qu'un service réel soit rendu à une structure pilote tôt, et non pour que tout arrive
à la fin. Dis quel lot tu mettrais en premier et défends ce choix.

**12.11 — Le registre des risques.** Chaque risque avec sa probabilité, son impact, et la contre-mesure
que ta conception lui oppose. Appuie-toi sur la section 9 : les causes d'échec y sont documentées.

---

## 13. Les règles de rédaction

**À faire**

- Écris **en français**. Interface, documents, exemples, tout.
- Emploie le **vocabulaire de la section 7**, systématiquement.
- **Cite tes fondements** : quand une règle vient d'un article ou d'un paragraphe de norme, donne la
  référence exacte, et seulement parmi celles des sections 5 et 6.
- **Distingue ce qui t'est imposé de ce que tu décides.** Pour chaque choix de conception, dis s'il
  découle d'une contrainte ou s'il est à toi — et dans le second cas, donne l'alternative que tu as
  écartée.
- **Marque les points qui dépendent d'un fait non vérifié** (section 11), à l'endroit où ils
  interviennent.
- **Numérote tout ce qui sera implémenté** : règles, états, transitions, écrans. Un développeur doit
  pouvoir dire « j'ai fait RG-042 ».
- **Sois exhaustif plutôt qu'élégant.** Un tableau complet vaut mieux qu'un paragraphe bien tourné.
- **Signale les erreurs ou contradictions** que tu trouves dans ce document, explicitement, plutôt que
  de les corriger en silence.

**À ne pas faire**

- **Aucun budget, aucun coût, aucun chiffrage, aucune durée en jours-hommes.** Ni dans les livrables,
  ni en annexe, ni en exemple. C'est une consigne du client, elle est absolue. Pour le plan de mise en
  œuvre, parle d'ordre et de lots, pas de calendrier chiffré.
- **N'invente aucune référence juridique** : ni numéro d'article, ni date, ni intitulé de texte. Si tu
  as besoin d'une règle absente des sections 5 et 6, écris « à vérifier » et décris ce qu'il faudrait
  trouver.
- **N'avance aucun pourcentage ni statistique** qui ne figure pas dans ce document. Les chiffres
  d'échec des projets informatiques circulent beaucoup et sont presque tous des citations de seconde
  main.
- **Ne cite pas un produit du commerce comme solution.** Aucun produit existant ne couvre à la fois le
  patrimoine, les stocks, le circuit de la commande publique congolaise et la comptabilité des
  matières.
- **Ne réduis pas le projet à la gestion de stock.**
- **Ne présente pas l'« EAM » comme une norme** : c'est un vocabulaire d'éditeurs. La norme est
  ISO 55001, et elle porte sur le système de management.
- **Ne prévois aucune étape où un système décide seul.** L'IA propose, un humain décide : c'est une
  exigence du client, et la responsabilité personnelle et pécuniaire de l'article 122 comme les
  contrôles de l'article 137 la rendent juridiquement nécessaire.
- **Pas de prose de présentation.** Ce sont des documents de travail destinés à un développeur.

---

## 14. La réalisation, pour information

Un développeur reprendra tes livrables. Il travaille en **Node.js, Fastify, PostgreSQL, React avec
Vite et Tailwind**. Tu n'as pas à concevoir la technique, mais tes livrables doivent être
immédiatement traduisibles.

Deux règles de l'équipe de développement, à respecter dans la conception : **toute règle de gestion
est contrôlée côté serveur**, jamais seulement dans l'interface ; et **toute action sensible est
journalisée**, le journal n'étant modifiable par personne, administrateur compris.

---

## 15. Comment commencer

Ne commence pas par rédiger. Rends-moi d'abord, en une page au maximum :

1. Les **contradictions, lacunes ou erreurs** que tu as repérées dans ce document.
2. Les **questions dont la réponse changerait ta conception**, classées par importance. Dis pour
   chacune ce que tu ferais faute de réponse.
3. Les **trois décisions de conception les plus lourdes de conséquences** selon toi, et ta
   recommandation sur chacune, avec l'alternative écartée.
4. Ton **découpage fonctionnel pressenti**, en quelques lignes, et l'**ordre** dans lequel tu
   produirais les onze livrables.

Puis attends ma réponse avant d'attaquer le premier livrable.
