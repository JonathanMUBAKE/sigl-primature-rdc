# SIGL — Plan de recherche comparative

Projet SIGL (Système Intégré de Gestion Logistique) — Primature de la République démocratique du Congo.
Porté par Braintis Technology. Phase : conception.

Ce document sert à deux choses : chercher les bonnes références, et consigner ce qui a déjà été trouvé.
Il se lit avant d'écrire le cahier des charges, l'architecture et la présentation aux décideurs.

Date de la première passe de recherche : 26 novembre 2026.

---

## 1. Comment chercher pour trouver quelque chose

Une recherche générale sur ce sujet rend surtout des pages d'éditeurs de logiciels et des
comparateurs. Ils décrivent des produits, pas des pratiques, et leurs chiffres sont presque toujours
des citations de seconde main. C'est ce qui est arrivé sur la première passe : sur « government asset
management best practices », huit résultats sur dix étaient des fiches commerciales.

Les références qui tiennent devant des décideurs sont ailleurs : dans les textes de normes, et dans
les rapports des institutions de contrôle, qui disent ce qui a échoué et pourquoi. La correction est
simple et c'est elle qui change tout : **limiter la recherche au domaine de l'institution avec
l'opérateur `site:`**. Toutes les requêtes du plan ci-dessous sont écrites comme ça.

### Les cinq rangs de source

| Rang | Source | Ce qu'on y cherche |
|---|---|---|
| 1 | **Textes de normes et de loi** — ISO, IPSASB/IFAC, GS1, Journal officiel, Legifrance, ARMP | Les seules sources qui créent une obligation. On les cite par numéro d'article ou de clause. |
| 2 | **Institutions de contrôle** — Cours des comptes, Bureau du vérificateur général, GAO, inspections générales, audits internes ONU et PAM | Ce qui a échoué, avec des faits. La ressource la plus sous-utilisée, et la plus utile. |
| 3 | **Documentation officielle des administrations** — directives, manuels de procédures, jeux de données ouverts | Ce qui est réellement en service, pas ce qui est vendu. |
| 4 | **Littérature académique revue par les pairs** | Les méthodes : détection d'anomalies, ententes, gestion du changement. Vérifier qu'une version publiée existe derrière le préprint. |
| 5 | **Éditeurs de logiciels et comparateurs** | À citer uniquement pour décrire un produit. Jamais pour établir une bonne pratique ni un chiffre. |

### Quatre réflexes

**Chercher l'audit, pas la brochure.** Pour chaque système repéré, chercher son rapport d'audit. Un
système public en service a presque toujours été contrôlé, et le rapport est public. C'est là que
sont les enseignements transposables.

**Chercher dans la langue du pays.** Les textes français et belges ne ressortent pas sur des requêtes
en anglais, et inversement. Le même concept s'appelle « gestion du matériel » au Canada, « personal
property management » aux États-Unis, « comptabilité des matières » en droit administratif
francophone, « materiel management » dans les textes anglophones. Chercher les quatre.

**Noter la date de chaque source.** FEDCOM, DPAS et les seuils congolais ont tous changé depuis les
documents qui en parlent le mieux. Une bonne source périmée reste périmée.

**Préférer le texte au résumé.** Un article de cabinet d'avocats sur le Code du numérique ne remplace
pas l'article de loi. Pour les deux points qui engagent l'architecture — hébergement des données et
signature électronique — seul le texte compte.

---

## 2. Plan de recherche

Dix blocs, dans l'ordre où ils servent. Les requêtes sont à copier telles quelles.
`site:` restreint au domaine ; les requêtes marquées **(Scholar)** vont sur Google Scholar.

### Bloc 1 — Normes et comptabilité publique

Le socle réglementaire. Ces textes fixent le vocabulaire (actif, stock, immobilisation, réforme) et
les obligations de tenue d'inventaire. À lire avant d'écrire une ligne de spécification : ils
décident du modèle de données.

```
ISO 55001:2024 asset management system requirements public service implementation
site:iso.org ISO 55011 public policy asset management guidance
site:ifac.org IPSAS 45 property plant equipment handbook 2025
site:ifac.org IPSAS 12 inventories "held for distribution" public sector
"ISO/IEC 19770-1" IT asset management government implementation
GS1 GIAI "global individual asset identifier" implementation guideline asset labelling
ISO 28000:2022 security management supply chain public procurement
```

### Bloc 2 — France

L'État français tient son patrimoine immobilier dans un référentiel unique (Chorus RE-FX) qui
alimente directement la comptabilité générale. C'est le modèle « un référentiel qui fait foi ». Les
rapports de la Cour des comptes disent ce qui n'a pas marché, et c'est la partie utile.

```
Chorus RE-FX inventaire immobilier État référentiel immobilisations
site:ccomptes.fr inventaire patrimoine État fiabilité comptes immobilisations
site:economie.gouv.fr DGFiP recensement physique immobilisations instruction comptable
"recueil des normes comptables de l'État" immobilisations corporelles stocks
"Direction des achats de l'État" dématérialisation commande fournitures magasin stock
site:legifrance.gouv.fr GBCP comptabilité publique inventaire biens meubles
```

### Bloc 3 — Belgique

FEDCOM est le cas d'école de l'ERP public dont les objectifs n'ont pas été tenus : la Cour des
comptes a relevé que l'administration devait recourir à des tiers pour faire tourner son propre
système. À lire pour rédiger la clause de transfert de compétences du marché.

```
FEDCOM SAP comptabilité fédérale volet actifs inventaire scan
site:ccrek.be FEDCOM audit comptabilité fédérale inventaire patrimoine
"Régie des Bâtiments" inventaire patrimoine base de données immobilier fédéral
site:bosa.belgium.be e-Procurement e-Catalogue commande fournitures fédérales
```

### Bloc 4 — Canada (le plus transposable)

Le Canada fait les choses dans l'ordre qui nous intéresse : une directive écrite qui oblige chaque
ministère à disposer d'un système d'information de gestion du matériel, puis un gabarit SAP unique
imposé à tous. C'est exactement la séquence « procédures d'abord, outil ensuite » de la feuille de
route du SIGL.

```
site:tbs-sct.canada.ca "Directive sur la gestion du matériel"
"Guide to the Management of Materiel for Departments and Agencies" Treasury Board
GCfm "Financial and Materiel Management" SAP S/4HANA Government of Canada template
DRMIS "Defence Resource Management Information System" materiel accountability
site:oag-bvg.gc.ca gestion du matériel inventaire vérification
GCSurplus aliénation biens excédentaires processus réemploi
```

### Bloc 5 — États-Unis (la doctrine la plus solide)

Deux idées à prendre : l'**APSR** (un seul système fait foi pour la comptabilité des biens, tout
registre parallèle est une non-conformité) et l'**IUID** (identification unique obligatoire avec
registre central, y compris pour les biens confiés aux prestataires). Les audits du GAO et de
l'inspection générale du DoD montrent où ça casse.

```
DoDI 5000.64 "accountable property system of record" APSR requirements
ELMS "Enterprise Logistics Management System" DPAS property accountability
IUID "item unique identification" registry policy DoD guidelines marking
site:gao.gov property accountability inventory material weakness agency
site:dodig.mil audit "accountable property system of record"
"41 CFR 102-36" excess personal property GSAXcess utilization donation
FASAB SFFAS 48 "general property, plant, and equipment" deemed cost
```

### Bloc 6 — Contrôle interne, fraude, IA

Le module IA ne s'invente pas : il se spécifie à partir d'indicateurs déjà éprouvés. Le guide 2024 de
l'Open Contracting Partnership en donne 73, avec les formules et les données nécessaires (voir
l'annexe de ce document). Le reste de la littérature sert à calibrer les faux positifs.

```
"red flags in public procurement" Open Contracting Partnership guide 2024 indicators
site:openknowledge.worldbank.org procurement fraud red flags data analytics
site:oecd.org "Principles for Integrity in Public Procurement"
machine learning detection bid rigging collusion public procurement          (Scholar)
anomaly detection isolation forest public procurement contracts              (Scholar)
"three-way match" purchase order goods receipt invoice segregation of duties control
"comptabilité des matières" comptable des matières responsabilité nominative inventaire
```

### Bloc 7 — République démocratique du Congo

Le cadre que le SIGL doit respecter. Les seuils de passation sont le point le plus sensible : les
sources secondaires se contredisent, il faut le texte consolidé de l'ARMP. Même chose pour la
localisation des données dans le Code du numérique.

```
site:armp-rdc.cd décret 10/34 seuils passation contrôle approbation marchés publics
site:armp-rdc.cd décret 10/22 manuel de procédures marchés publics
DGCMP RDC contrôle a priori marchés publics manuel procédures
"loi 11/011" LOFIP RDC décret 2013 règlement général comptabilité publique patrimoine
"ordonnance-loi 23/010" code du numérique RDC signature électronique prestataire de confiance
RDC instruction ministère finances inventaire biens meubles de l'État comptabilité matières
```

### Bloc 8 — Inventaire terrain, QR, mobile hors ligne

La phase 2 de la feuille de route (recensement physique et étiquetage) est celle qui fait échouer les
inventaires : si le terrain ne suit pas, la base ne vaut rien. Chercher des procédures de recensement
et de rapprochement, pas des fiches produit d'éditeurs.

```
physical inventory count procedure asset tagging reconciliation government policy
offline-first mobile data collection ODK KoboToolbox asset survey low connectivity
RFID asset tracking government pilot evaluation results lessons
QR code asset label durability outdoor equipment tagging standard
conflict resolution synchronization offline mobile inventory design            (Scholar)
```

### Bloc 9 — Pourquoi ces projets échouent

Le bloc le plus rentable. Les causes reviennent partout : gestion du changement et formation
sous-estimées, déploiement précipité, tests insuffisants, propriété des données non définie après la
mise en service, contournement du système par des fichiers parallèles. À transformer en registre des
risques du projet.

```
government ERP implementation failure lessons learned post-implementation review
IFMIS implementation sustainability assessment Africa World Bank
change management critical success factors public sector ERP adoption training   (Scholar)
site:gao.gov ERP implementation schedule cost overrun lessons learned
```

### Bloc 10 — Organisations internationales

Le PAM et l'ONU gèrent des chaînes logistiques dans des contextes proches du nôtre, et surtout ils
publient leurs audits internes. C'est la source la plus franche sur ce qui ne fonctionne pas dans un
système en production.

```
site:wfp.org internal audit LESS logistics execution support system
UN Umoja SAP supply chain Board of Auditors report asset management
UNHCR audit asset management inventory physical verification
MONUSCO peacekeeping property management inventory audit RDC
```

---

## 3. Sources à interroger directement

Les points d'entrée, plutôt que d'espérer qu'un moteur les remonte. Ce sont les domaines à mettre
derrière `site:`.

**Normes et comptabilité**
- ISO/TC 251, famille 55000 — https://committee.iso.org/tc251.html
- IPSASB, recueil des normes — https://www.ipsasb.org/publications/2025-handbook-international-public-sector-accounting-pronouncements
- GS1, clés d'identification — https://www.gs1.org/standards/id-keys/global-individual-asset-identifier-giai

**Institutions de contrôle**
- Cour des comptes, France — https://www.ccomptes.fr
- Cour des comptes, Belgique — https://www.ccrek.be
- Bureau du vérificateur général, Canada — https://www.oag-bvg.gc.ca
- GAO, États-Unis — https://www.gao.gov
- Inspection générale du DoD — https://www.dodig.mil
- Audits internes du PAM — https://www.wfp.org/audit-reports

**Administrations**
- Conseil du Trésor du Canada, directives — https://www.tbs-sct.canada.ca/pol/index-fra.aspx
- GSA, biens meubles — https://www.gsa.gov
- Direction de l'immobilier de l'État, open data — https://data.economie.gouv.fr

**Intégrité et marchés publics**
- Open Contracting Partnership — https://www.open-contracting.org
- OCDE, intégrité — https://www.oecd.org
- Banque mondiale, base de connaissances — https://openknowledge.worldbank.org

**République démocratique du Congo**
- ARMP, textes et documents types — https://armp-rdc.cd
- Ministère du Budget, marchés publics — https://budget.gouv.cd
- Code du numérique, texte intégral — https://droitnumerique.cd

---

## 4. Ce que la première recherche a déjà donné

Huit systèmes ou dispositifs. La ligne **à retenir** est une décision à prendre au cadrage, pas un
commentaire.

### France — Chorus RE-FX
*Direction de l'immobilier de l'État / AIFE*

- **Périmètre** : patrimoine immobilier de l'État, inventaire physique et comptable.
- **Socle** : SAP Flexible Real Estate Management, avec le module des immobilisations (FI-AA) intégré depuis 2009.
- **Ce qui marche** : un référentiel unique qui fait foi pour la politique immobilière et alimente la
  comptabilité générale sans double saisie. La mise à jour est confiée à un gestionnaire du
  référentiel désigné dans chaque service : responsabilité nominative.
- **Ce qui a coincé** : les données venaient de systèmes antérieurs hétérogènes et n'ont pas été
  rapprochées ni fiabilisées de façon constante (constat de la Cour des comptes). Le module décrit le
  parc, il ne le gère pas.
- **À retenir** : la reprise de l'existant est le vrai risque, pas le logiciel. Prévoir une phase de
  fiabilisation certifiée avant de brancher la comptabilité.
- Sources : [question au Sénat](https://www.senat.fr/questions/base/2024/qSEQ240900147.html) ·
  [avis du Conseil de l'immobilier de l'État](https://www.economie.gouv.fr/files/files/directions_services/cie/missions/documents/avis/gouvernance/cie_2015-06_outils-gestion-immobilier.pdf) ·
  [descriptif du parc en open data](https://data.economie.gouv.fr/api/datasets/1.0/parc_immobilier_etat_20211231/attachments/descriptif_donnees_parc_immobilier_etat_pdf)

### Belgique — FEDCOM
*Administration fédérale (SPF Budget / BOSA)*

- **Périmètre** : comptabilité générale fédérale intégrée au budgétaire, avec un volet actifs et le
  scan des éléments d'inventaire.
- **Socle** : SAP.
- **Ce qui marche** : comptabilité générale et comptabilité budgétaire dans un seul système, avec une
  saisie d'inventaire outillée.
- **Ce qui a coincé** : la Cour des comptes a estimé les objectifs non totalement atteints et relevé
  que les fonctionnaires de l'administration centrale devaient faire appel à des tiers pour gérer le
  système. La comptabilité analytique ne couvre que les dépenses, pas les recettes.
- **À retenir** : écrire dans le marché une obligation de transfert de compétences et un critère de
  sortie — l'équipe de la Primature doit pouvoir exploiter le système sans l'éditeur.
- Sources : [projet FEDCOM, portail fédéral](https://news.belgium.be/fr/projet-fedcom) ·
  [critiques de la Cour des comptes](https://datanews.levif.be/ict/actualite/la-cour-des-comptes-continue-de-critiquer-le-logiciel-comptable-fedcom/article-normal-358065.html) ·
  [question écrite au Sénat, volet inventaire](https://senate.be/www/?LANG=fr&LEG=4&MIval=Vragen%2FSVPrint&NR=6691)

### Canada — Directive sur la gestion du matériel
*Conseil du Trésor*

- **Périmètre** : tous les biens meubles, à l'exception de l'argent et des documents. En vigueur le
  13 mai 2021, modifiée le 11 juillet 2023 pour les procédures obligatoires de parc automobile.
- **Nature** : texte réglementaire, pas un logiciel. Remplace trois textes antérieurs.
- **Ce qui marche** : la directive oblige chaque ministère à disposer d'un système d'information de
  gestion du matériel. L'obligation porte sur la tenue de l'information, pas sur un produit.
- **La limite** : transposable seulement si l'équivalent congolais existe. Sans texte de la
  Primature, le système n'a aucun fondement opposable.
- **À retenir** : livrable de la phase de cadrage — un arrêté ou une note de service de la Primature
  qui définit le matériel, nomme les responsables et rend le SIGL obligatoire. Sans ce texte, le
  reste est facultatif de fait.
- Sources : [la directive](https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32690) ·
  [guide aux ministères](https://wiki.gccollab.ca/images/5/5a/Guide_to_the_Management_of_Materiel_for_Departments_and_Agencies.pdf) ·
  [publication officielle](https://publications.gc.ca/site/eng/9.910252/publication.html)

### Canada — GCfm
*Bureau du contrôleur général*

- **Périmètre** : solution normalisée de gestion financière et du matériel du gouvernement du Canada.
- **Socle** : SAP S/4HANA, noyau numérique « gabarit A », hébergé en nuage approuvé Protégé B.
- **Ce qui marche** : un gabarit unique imposé à tous les ministères plutôt que vingt paramétrages
  divergents. Les ministères migrent depuis leurs propres ERP vers ce standard.
- **Réserve** : le constat vient d'une évaluation de facteurs relatifs à la vie privée d'il y a
  environ trois ans. L'état actuel du déploiement reste à confirmer.
- **À retenir** : pour la Primature et ses structures, un seul paramétrage de référence, et les
  particularités traitées en paramètres — jamais en développements propres à une structure.
- Source : [évaluation des facteurs relatifs à la vie privée, MPO](https://www.dfo-mpo.gc.ca/transparency-transparence/atip-aiprp/privacy-privee/materiel-solution-eng.html)

### États-Unis — DPAS, devenu ELMS
*Département de la Défense*

- **Périmètre** : système de référence comptable des biens (*Accountable Property System of Record*),
  intégré au registre d'identification unique.
- **Ce qui marche** : la notion d'APSR est la plus forte à reprendre — un seul système fait foi, et
  tenir un registre en dehors de lui est en soi une non-conformité. Une inspection générale a
  précisément relevé une agence qui conservait des enregistrements hors du système de référence.
- **Ce qui a coincé** : un audit ancien a montré que le système ne couvrait pas la totalité des biens
  du ministère. Si le périmètre n'est pas fermé, les registres parallèles réapparaissent.
- **À retenir** : inscrire dans le texte que le SIGL est le registre de référence du patrimoine de la
  Primature, et que toute autre liste — fichier Excel compris — n'a aucune valeur. Puis concevoir les
  écrans qui rendent le SIGL plus rapide que le fichier Excel, sinon la règle sera contournée.
- Sources : [fiche DPAS / ELMS](https://www.dau.edu/acquipedia-article/defense-property-accountability-system-dpas) ·
  [DoDI 5000.64](https://static.e-publishing.af.mil/production/1/af_a4/publication/dodi5000.64_dafi23-111/dodi5000.64_dafi23-111.pdf) ·
  [audit : enregistrements hors système de référence](https://media.defense.gov/2008/Jul/24/2001712416/-1/-1/1/08-114.pdf)

### États-Unis — IUID
*Département de la Défense*

- **Périmètre** : identification unique des articles, avec registre central. Les biens au-delà de
  5 000 dollars y sont suivis.
- **Socle** : marquage physique lisible par machine et registre central ; traçabilité sur tout le
  cycle de vie (32 CFR 273.9).
- **Ce qui marche** : l'équivalent fonctionnel du GIAI prévu pour le SIGL, avec deux apports — tout
  changement d'état ou sortie d'inventaire oblige à mettre à jour le registre, et les biens confiés à
  un prestataire sont déclarés par le prestataire lui-même.
- **La limite** : le seuil de 5 000 dollars laisse hors périmètre une masse de petits équipements.
  C'est l'arbitrage entre l'exhaustivité et le coût de l'étiquetage.
- **À retenir** : deux décisions au cadrage — le seuil de valeur à partir duquel un bien reçoit un
  numéro d'inventaire individuel, et l'obligation faite aux prestataires de déclarer les biens de la
  Primature qu'ils détiennent.
- Sources : [32 CFR 273.9, traçabilité des articles identifiés](https://www.law.cornell.edu/cfr/text/32/273.9) ·
  [comptabilisation des biens fournis par l'État](https://www.army.mil/article/117860/accounting_for_government_furnished_property)

### États-Unis — GSAXcess et FMR 41 CFR 102-36
*General Services Administration*

- **Périmètre** : réemploi, transfert et aliénation des biens meubles excédentaires entre
  administrations.
- **Socle** : plateforme web de déclaration et de recherche, avec un agent désigné par agence
  (*National Utilization Officer*).
- **Ce qui marche** : avant toute mise au rebut, le bien excédentaire est déclaré et offert aux
  autres administrations, qui le demandent — en général dans l'ordre d'arrivée. Un agent nommé par
  agence répond de ce circuit.
- **La condition** : un référentiel de nomenclature commun pour que les autres structures retrouvent
  le bien, et un arbitre pour les demandes concurrentes.
- **À retenir** : le module 7 du SIGL (mouvements et déclassements) gagne une étape qui n'était pas
  prévue — avant la réforme sur procès-verbal, une offre de réemploi aux autres structures de la
  Primature. C'est le gisement d'économies le plus immédiat du projet.
- Sources : [guide de gestion des biens meubles](https://origin-www.gsa.gov/system/files/General_Supplies__Services/20-00819_PPMCustodialGuide_final508.pdf) ·
  [règles de saisie GSAXcess](https://gsaxcess.gov/htm/XCESSENTRYGUIDH.HTML)

### Organisations internationales — LESS
*Programme alimentaire mondial*

- **Périmètre** : gestion en temps réel des marchandises sur la chaîne logistique — localisation,
  disponibilité par lot, arrivées et départs prévus.
- **Socle** : SAP, dernière phase du programme WINGS II.
- **Ce qui marche** : deux audits internes publics, en 2015 sur le déploiement et en 2021 sur les
  fonctionnalités et les contrôles applicatifs. Source rare : un retour d'expérience franc sur un
  système en production dans des contextes difficiles.
- **Ce qui a coincé** : l'audit 2021 relève que les décisions de changement et d'allocation de
  ressources relevaient d'une équipe distincte du propriétaire du processus métier, et recommande de
  réexaminer les capacités du système face aux besoins réels des utilisateurs.
- **À retenir** : nommer dès le cadrage un propriétaire métier du SIGL, du côté de la chargée de
  logistique, qui décide des évolutions. Si la main reste à la direction informatique ou au
  prestataire, l'outil dérive des besoins.
- Sources : [audit interne LESS 2021](https://www.wfp.org/audit-reports/internal-audit-less-functionalities-and-application-controls-february-2021) ·
  [audit interne du déploiement](https://wfp.org/audit-reports/internal-audit-logistics-execution-support-system-less-implementation-wfp-december)

---

## 5. Les trois idées à reprendre

**Un seul registre fait foi.** La notion d'APSR américaine : le SIGL est le registre de référence, et
tout fichier tenu à côté est une non-conformité. C'est une clause de texte, pas une fonction
logicielle — et elle ne tient que si l'outil est plus rapide que le tableur qu'il remplace.

**La règle avant l'outil.** Le Canada a publié une directive qui oblige chaque ministère à tenir
l'information, puis a imposé un gabarit unique. La feuille de route du SIGL commence déjà par les
procédures écrites : c'est le bon ordre, il faut le tenir même sous pression de calendrier.

**Le réemploi avant la réforme.** Le circuit américain des biens excédentaires ajoute une étape au
module des déclassements : offrir le bien aux autres structures avant de le réformer. Économie
immédiate et visible — un bon argument pour la présentation aux décideurs.

---

## 6. Ce qui fait échouer ces projets

Constats convergents, mais à consolider sur sources primaires avant toute citation chiffrée
(voir les questions ouvertes).

- Gestion du changement et formation sous-estimées. C'est la cause la plus souvent citée, loin devant
  les causes techniques. Un cas kenyan relève que le personnel n'avait pas été formé correctement et
  ne comprenait pas les raisons du changement.
- Absence de contrôle formalisé des changements et de procédures claires pour le soutenir.
- Autorité floue, coordination de projet faible, technologie inadaptée, chocs externes.
- Déploiements précipités, tests insuffisants, planification pauvre.
- Contournements : les agents reviennent aux anciennes pratiques après la mise en service.
- Propriété des données non définie après le démarrage. La période la plus fragile est souvent les
  premiers mois d'exploitation, pas la phase de construction.

Sources : [FreeBalance, synthèse sur les échecs d'ERP publics](https://www.freebalance.com/en/blog/government-digital-transformation/erp-failures-in-government/) ·
[étude sur l'ERP public en Afrique](https://www.thinkmind.org/articles/sysmea_v12_n34_2019_11.pdf) ·
[facteurs de gestion du changement, cas kenyan](https://iiste.org/Journals/index.php/EJBM/article/viewFile/61752/63743)

---

## 7. Ce qui est tranché, sur le texte

Travail du 26 novembre 2026. Les textes ont été lus intégralement, pas résumés. Les numéros
d'articles et de paragraphes ci-dessous sont vérifiés.

### 7.1 Code du numérique — l'hébergement en RDC est bien la règle

**Ordonnance-loi n° 23/010 du 13 mars 2023, article 201, alinéa 1 :** « Les données personnelles sont
stockées et/ou hébergées en République Démocratique du Congo. » C'est une règle de principe, pas une
simple préférence. Les deux lectures qui circulaient étaient toutes les deux partielles : la règle
est bien l'hébergement en RDC, **et** les transferts sont encadrés.

**Le régime de transfert (article 201, alinéas 2 et suivants).** Un transfert vers une « ambassade
digitale », un hébergeur d'un État tiers ou une organisation internationale n'est possible que si
l'Autorité de protection des données constate un niveau de protection adéquat et suffisant, apprécié
au regard de l'état de droit, de l'existence d'une autorité de contrôle indépendante dans le pays
tiers et des engagements internationaux de ce pays. Surtout : **le responsable de traitement doit
obtenir l'autorisation préalable de l'Autorité de protection des données avant tout transfert
effectif**, et le transfert fait ensuite l'objet d'un contrôle régulier.

**Le point décisif pour la Primature (article 202, dernier alinéa de l'énumération).** L'article 202
liste six dérogations permettant de transférer vers un pays n'offrant pas un niveau adéquat. Mais il
précise que **les points 1, 2 et 3 — le consentement de la personne, l'exécution d'un contrat avec
elle, un contrat conclu dans son intérêt — « ne sont pas applicables aux activités des autorités
publiques dans l'exercice de leurs prérogatives de puissance publique »**. La Primature ne peut donc
pas s'appuyer sur le consentement des agents ni sur une clause contractuelle pour héberger ses
données ailleurs. Restent la sauvegarde d'un intérêt public important (point 4), les intérêts vitaux
d'une personne (point 5), le registre public (point 6), ou une autorisation du Conseil des Ministres
après avis conforme de l'Autorité de protection des données.

> **Conséquence d'architecture.** Le SIGL s'héberge en RDC. Le site de secours aussi, sauf
> autorisation préalable de l'Autorité de protection des données — et une autorisation obtenue au
> titre de l'article 201 ne dispense pas du contrôle régulier qui suit. Aucun service tiers hors RDC
> ne traite de données personnelles du système sans cette autorisation : ni sauvegarde en nuage
> étranger, ni service d'envoi de courriels, ni modèle d'IA hébergé hors du pays. Ce dernier point
> mérite d'être posé explicitement au cadrage, car il contraint le choix du module IA.

### 7.2 Code du numérique — la signature électronique passe par un tiers agréé

**Articles 104 à 113.** La signature électronique est un élément de validité d'un acte juridique ;
elle identifie celui qui l'appose et manifeste son consentement (art. 104). Elle peut être simple ou
qualifiée.

- **Signature simple (art. 105) :** « Toute personne désireuse d'apposer sa signature électronique
  simple sur un document recourt au prestataire des services de confiance. » Même la signature simple
  passe par un prestataire.
- **Signature qualifiée (art. 106) :** liée au signataire de manière univoque, permettant de
  l'identifier, créée avec des données que le signataire utilise sous son contrôle exclusif avec un
  niveau de confiance élevé, et liée aux données signées de sorte que toute modification ultérieure
  soit détectable.
- **Force probante (art. 108) :** « La signature électronique qualifiée liée à un certificat
  électronique qualifié a la même force probante que la signature manuscrite. » Et l'article 109
  ajoute une présomption : un document électronique portant une signature qualifiée est présumé signé
  par son auteur et non modifié, sauf preuve contraire.
- **Art. 112, point 3 :** la génération ou la gestion des données de création de signature pour le
  compte du signataire « est exclusivement confiée à un prestataire de services de confiance
  qualifié ».

**Les prestataires de services de confiance (articles 129 à 140).** Huit services sont concernés,
dont la signature électronique, le cachet électronique, l'horodatage, l'archivage électronique et la
certification (art. 130). Deux catégories : qualifiés et non qualifiés (art. 136). **Les prestataires
qualifiés sont soumis au régime d'autorisation**, les non qualifiés au régime de déclaration
(art. 137). L'Autorité Nationale de Certification Électronique certifie les technologies employées
(art. 134). Un prestataire étranger n'est assimilé à un prestataire congolais qu'à deux conditions :
avoir une représentation sur le territoire de la RDC, et satisfaire aux conditions du Livre après
vérification par l'ANCE (art. 135). Enfin, l'article 131 prévoit que le Gouvernement met en place une
infrastructure à clés publiques nationale.

> **Conséquence d'architecture.** Le SIGL ne fabrique pas ses propres signatures. Les documents
> générés — état de besoin, bon de commande, bon de livraison, accusé de réception, procès-verbal de
> réception — sont signés via un prestataire de services de confiance **qualifié et autorisé en
> RDC**. À faire au cadrage : identifier les prestataires qualifiés effectivement autorisés, et
> savoir où en est l'infrastructure à clés publiques nationale de l'article 131. Si aucun prestataire
> qualifié n'est disponible, il faut un plan de repli — signature simple via prestataire, ou signature
> manuscrite scannée rattachée au document — et le dire aux décideurs, parce que cela change la
> valeur probante de la piste d'audit.

### 7.3 Code du numérique — autorisation préalable et archivage

**Article 15 : le régime d'autorisation.** Y sont soumis, entre autres, les opérateurs et
fournisseurs de services numériques **construisant des centres de données**, les fournisseurs de
services numériques de confiance qualifiée, les fournisseurs de services numériques essentiels et
**les fournisseurs de services d'hébergement d'applications**. L'autorisation est délivrée par le
Ministre du Numérique après avis écrit de l'Autorité de Régulation du Numérique, de l'ANCE ou de
l'Agence Nationale de Cybersécurité selon le cas (art. 16).

**Article 19 : l'homologation.** Régime distinct, et directement applicable au SIGL : il « atteste
que les infrastructures et services numériques fournis à l'État sont conformes aux Normes et
Standards du Numérique applicables au secteur public en République Démocratique du Congo ». Il faut
récupérer ce référentiel de normes et standards : c'est une contrainte de conformité qui n'était pas
dans la vision.

**Archivage électronique, articles 42 à 46.** La conservation doit garantir que l'information reste
accessible et consultable, que le document est conservé sous la forme où il a été créé ou sous une
forme dont on peut démontrer qu'elle n'est susceptible ni de modification ni d'altération, et que
l'origine, la destination, la date et l'heure sont conservées (art. 42). Les données doivent être
structurées, indexées et conservées sur des formats appropriés à la conservation et à la migration,
avec restitution garantie dans un contexte technologique changeant (art. 43). L'Institut National des
Archives du Congo (INACO) encadre et régule les archives électroniques publiques et conseille les
services publics (art. 45). L'article 46 institue en outre une redevance d'archivage sur les actes et
documents émis par les services publics, dont le taux est fixé par arrêté interministériel.

> **Conséquence d'architecture.** L'exigence « document validé figé » devient une obligation légale,
> pas un choix de conception : format de conservation, indexation, horodatage, migration. L'INACO est
> une partie prenante à ajouter à la liste. Et la redevance de l'article 46 est un coût de
> fonctionnement à vérifier avant de chiffrer le projet.

### 7.4 IPSAS 12 — ce qu'est un stock, et à quelle valeur

Texte lu : IPSAS 12, *Inventories*, édition IFAC de décembre 2024.

**Définition (par. 9).** Les stocks sont des actifs sous forme de matières ou fournitures destinées à
être consommées dans le processus de production, ou **à être consommées ou distribuées dans le cadre
de la prestation de services**, ou détenues pour être vendues ou distribuées dans le cours normal des
activités, ou en cours de production pour être vendues ou distribuées.

**Évaluation (par. 15 à 17).** La règle générale est le plus faible du coût et de la valeur nette de
réalisation. Mais deux exceptions comptent pour nous :

- **Par. 16 :** les stocks acquis par une transaction sans contrepartie — dons, transferts de
  partenaires — sont évalués à leur **juste valeur à la date d'acquisition**.
- **Par. 17 :** les stocks détenus pour être **distribués gratuitement ou à prix nominal**, ou
  consommés dans la production de biens destinés à l'être, sont évalués au plus faible du coût et du
  **coût de remplacement actuel** (*current replacement cost*), défini au paragraphe 9 comme le coût
  que l'entité supporterait pour acquérir l'actif à la date de clôture.

> **Conséquence sur le modèle de données.** Les fournitures de la Primature distribuées aux
> structures sans contrepartie relèvent du paragraphe 17 : il faut stocker, pour chaque article, le
> coût **et** un coût de remplacement actuel, et savoir lequel est retenu à chaque clôture. Pour les
> dons, il faut un champ de juste valeur à la date d'entrée et la trace de son mode de détermination.
> Un simple prix d'achat ne suffit pas.

### 7.5 IPSAS 45 — ce qu'est une immobilisation, et le seuil d'inventaire individuel

Texte lu : IPSAS 45, *Property, Plant, and Equipment*, mai 2023, qui remplace IPSAS 17.

**Comptabilisation (par. 6).** Un bien est comptabilisé si, et seulement si, il est probable que des
avantages économiques futurs ou un **potentiel de service** lui soient associés, et s'il peut être
évalué de façon fiable. Le « potentiel de service » est le critère qui vaut pour un bien
administratif qui ne rapporte rien.

**La réponse au seuil d'inventaire individuel (par. 8).** La norme **ne prescrit pas l'unité de
comptabilisation** : c'est une affaire de jugement. Et elle autorise explicitement à « regrouper des
éléments individuellement non significatifs, tels que les livres de bibliothèque, les périphériques
informatiques et les petits matériels, et à appliquer les critères à la valeur agrégée ». Le seuil de
5 000 dollars du dispositif IUID américain n'est donc pas une entorse à la norme comptable : c'est
exactement l'arbitrage que le paragraphe 8 autorise.

**Biens reçus sans contrepartie (par. 11 à 13).** Un bien acquis par transaction sans contrepartie
est évalué à son **coût réputé** (*deemed cost*), déterminé selon IPSAS 46 (par. 12). Et cette
évaluation initiale ne constitue pas une réévaluation (par. 13). Attention : ce n'est pas la même
règle que pour les stocks, qui vont à la juste valeur selon IPSAS 12 par. 16.

**Base d'évaluation en valeur courante (par. 27 et 28).** C'est **l'objectif principal de détention**
qui détermine la base : un bien détenu principalement pour sa **capacité opérationnelle** est évalué
à la *current operational value*, un bien détenu pour sa **capacité financière** à la juste valeur. La
base doit être appliquée de façon constante, sauf changement de l'objectif de détention. Le
paragraphe AG21 précise qu'un bien détenu dans un objectif de prestation de service relève de la
capacité opérationnelle. Le patrimoine de la Primature relève donc, dans sa quasi-totalité, de la
*current operational value*.

**Frontière avec les stocks (par. AG12).** Les pièces de rechange, le matériel de secours et le
matériel d'entretien sont comptabilisés en immobilisations quand ils répondent à la définition ;
sinon ils sont classés en stocks selon IPSAS 12. C'est une règle de classement à implémenter, pas une
appréciation laissée à l'agent de saisie.

**Biens patrimoniaux (par. 7).** Un bien patrimonial qui répond à la définition d'un actif mais dont
le coût ou la valeur courante ne peut être évalué de façon fiable n'est pas comptabilisé : il est
mentionné en notes, et comptabilisé dès que l'information devient disponible.

> **Conséquences sur le modèle de données.** Chaque bien porte : son objectif principal de détention
> (opérationnel ou financier), car il commande la base d'évaluation ; son mode d'entrée (achat, don,
> transfert), car il commande l'évaluation initiale ; et son classement immobilisation ou stock, avec
> la règle AG12 appliquée automatiquement aux pièces de rechange et au matériel d'entretien. Et une
> décision à prendre au cadrage : le seuil de valeur en dessous duquel les biens sont suivis en lot
> agrégé plutôt qu'avec un numéro d'inventaire individuel.

---

## 8. Questions encore ouvertes

Les points marqués **bloquant** engagent l'architecture ou les règles de gestion : à régler avant le
cahier des charges, pas pendant le développement.

### Bloquant — Seuils de passation en RDC : le décret n'a pas pu être lu

Le site de l'ARMP refuse les requêtes automatisées : le PDF du décret n° 010/34 du 28 décembre 2010
renvoie une erreur 403, et la page du décret sur armp-rdc.cd ne contient qu'un lien de
téléchargement, sans texte consultable. Le texte consolidé n'est donc toujours pas vérifié.

Ce que les sources secondaires donnent, sans concordance : 50 millions de francs congolais pour les
travaux, fournitures et services courants, 20 millions pour les prestations intellectuelles et les
délégations de service public, 100 millions comme seuil de préqualification en appel d'offres
restreint. Pour l'appel d'offres international, un document du ministère du Budget indique
16 milliards pour les travaux au niveau central, 1 milliard pour les fournitures et services et
500 millions pour les prestations intellectuelles ; un site spécialisé en cite 8 milliards pour les
travaux. Les seuils commandent tout le module de validation et d'arbitrage, et plusieurs indicateurs
d'anomalie en dépendent directement (R002, R011, R049, R055).

**Comment débloquer :** télécharger les deux PDF depuis un navigateur ordinaire, puis les déposer
dans `SIGL-Primature/docs/sources/` pour dépouillement.

- Décret 10/34, seuils : https://armp-rdc.cd/wp-content/uploads/2021/09/DECRET_10-34_fixant_le_seuil.pdf
- Décret 10/22, manuel de procédures : https://armp-rdc.cd/wp-content/uploads/2022/03/DECRET_10-22_Manuel_de_procedures.pdf

### Bloquant — Chiffres d'échec : l'étude est identifiée, le chiffre ne l'est pas

L'étude derrière le « 18 % d'IFMIS non durables » existe et elle est sérieuse : **Cem Dener, Joanna
Watkins et William Leslie Dorotinsky, *Financial Management Information Systems: 25 Years of World
Bank Experience on What Works and What Doesn't*, Banque mondiale, 2011**. Son assise est solide :
depuis 1984, la Banque mondiale a financé 87 projets de systèmes d'information de gestion financière
dans 51 pays, pour plus de 2,2 milliards de dollars.

Mais le chiffre lui-même reste non vérifié : le dépôt openknowledge.worldbank.org renvoie une erreur
403 sur le PDF. Un extrait fragmentaire laisse apparaître « 67 % » pour les résultats et « 87 % » pour
la durabilité, sans qu'on sache à quel sous-ensemble ces taux se rapportent — ce qui, au passage, ne
recoupe pas exactement le « 18 % » colporté. **Ne pas citer de pourcentage dans la présentation aux
décideurs avant d'avoir lu le tableau d'origine.** En revanche, citer l'étude et ses 87 projets sur
51 pays est sans risque.

**Comment débloquer :** télécharger le PDF depuis un navigateur ordinaire.
https://openknowledge.worldbank.org/server/api/core/bitstreams/0bb4a8f7-16c7-581f-b0f0-9c837fbc2b6d/content

### À compléter — Normes et standards du numérique du secteur public congolais

L'article 19 du Code du numérique soumet à homologation les infrastructures et services numériques
fournis à l'État, au regard d'un référentiel de « Normes et Standards du Numérique applicables au
secteur public ». Ce référentiel n'a pas été trouvé. C'est une contrainte de conformité qui ne
figurait pas dans la vision.

```
RDC "normes et standards du numérique" secteur public homologation référentiel
```

### À compléter — Prestataires de services de confiance effectivement autorisés en RDC

Les articles 136 à 140 posent le régime, mais rien ne dit quels prestataires qualifiés sont
réellement autorisés, ni où en est l'infrastructure à clés publiques nationale de l'article 131. Sans
cette réponse, la signature électronique du SIGL n'est pas spécifiable.

```
RDC Autorité Nationale de Certification Electronique prestataire services de confiance agréé liste
```

### À compléter — France : quel système pour le mobilier et les stocks ?

Les recherches n'ont rendu que l'immobilier (Chorus RE-FX). Rien n'est ressorti sur un système
interministériel de gestion des biens meubles et des stocks de fournitures. Soit il n'existe pas et
chaque ministère fait à sa main — ce qui est en soi un enseignement — soit la requête était mauvaise.

```
ministère France application gestion des stocks fournitures magasin inventaire biens meubles
```

### À compléter — Canada : DRMIS et GCSurplus

Le système de la Défense et la plateforme d'aliénation n'ont pas été documentés. Ce sont pourtant les
deux pièces qui complètent la directive du Conseil du Trésor.

```
site:canada.ca DRMIS OR GCSurplus gestion matériel aliénation biens
```

### À compléter — ONU : Umoja non vérifié

Umoja est cité de mémoire comme l'ERP SAP du Secrétariat des Nations unies. Aucune source ne l'a
confirmé dans cette recherche. Les rapports du Comité des commissaires aux comptes sont la bonne
entrée.

```
United Nations Umoja Board of Auditors report property management inventory
```

### À compléter — La séparation des fonctions dans une petite structure

Le principe exige que celui qui réceptionne, celui qui approuve et celui qui paie soient distincts.
Dans une structure de quelques agents, c'est impossible, et la littérature renvoie à des contrôles
compensatoires (visa a posteriori, revue périodique). Il faut savoir lesquels sont admis avant de
coder les circuits de validation.

```
compensating controls segregation of duties small entity internal control public sector
```

---

## Annexe — Les 73 drapeaux rouges de l'Open Contracting Partnership

Liste du guide *Red flags in public procurement*, édition 2024. Chaque indicateur vient, dans le
guide, avec sa définition, sa formule, les champs de données nécessaires et l'étape du cycle où il se
détecte.

Deux avertissements du guide, à reprendre dans la spécification du module IA :

1. Les données manquent souvent pour calculer un indicateur. On ne calcule alors qu'un indicateur
   partiel, ou rien du tout.
2. **Un drapeau rouge ouvre un examen, il ne conclut pas.** C'est exactement le principe retenu pour
   le SIGL : l'IA alerte, un humain tranche.

La colonne **SIGL** marque les indicateurs qu'un système interne comme le SIGL peut calculer sur ses
propres données, sans portail d'appels d'offres ouvert. Ce sont les candidats du module de détection
d'anomalies : 30 sur 73.

Guide complet : https://www.open-contracting.org/wp-content/uploads/2024/12/OCP2024-RedFlagProcurement-1.pdf

### Faible transparence

| Code | Indicateur | SIGL |
|---|---|---|
| R001 | Documents de planification non disponibles | |
| R004 | Publicité insuffisante de l'appel à concurrence | |
| R005 | Informations et documents clés de l'appel d'offres non disponibles | |
| R013 | Recours élevé aux procédures non concurrentielles | ● |
| R039 | Questions des candidats restées sans réponse | |
| R063 | Contrat non publié | |

### Faible concurrence

| Code | Indicateur | SIGL |
|---|---|---|
| R018 | Une seule offre reçue | ● |
| R019 | Nombre de candidats faible pour la catégorie d'articles | ● |
| R040 | Part élevée des contrats d'un même acheteur | ● |
| R050 | Part de marché élevée d'un fournisseur | ● |
| R051 | Concentration élevée du marché | ● |

### Fraude

| Code | Indicateur | SIGL |
|---|---|---|
| R042 | Adresse ou numéro de téléphone anormal du candidat | ● |
| R045 | Candidat absent des registres du commerce | ● |
| R046 | Candidat exclu ou inscrit sur une liste de sanctions | ● |
| R047 | Fournisseur introuvable | |
| R048 | Fournisseur hétérogène : objets sans lien entre eux | ● |
| R064 | Le contrat a fait l'objet de modifications | ● |
| R065 | Avenants réduisant les lignes de commande | ● |
| R066 | Avenants augmentant les lignes de commande | ● |
| R067 | Défaut de livraison | ● |
| R068 | Les mouvements dépassent le montant du contrat | ● |
| R069 | Avenants augmentant le prix | ● |
| R073 | Écarts entre les prestations réalisées et les spécifications | ● |

### Risque d'entente

| Code | Indicateur | SIGL |
|---|---|---|
| R017 | Ligne de commande anormalement basse ou haute | ● |
| R022 | Forte dispersion des prix entre les offres | |
| R023 | Prix d'offres en multiples fixes | |
| R024 | Prix très proche de l'offre gagnante | |
| R025 | Offres perdantes en excès pour un même candidat | |
| R026 | Prévalence des groupements d'entreprises | |
| R027 | Candidats manquants alors qu'ils étaient attendus | |
| R028 | Prix d'offres identiques | |
| R032 | Candidats partageant le même bénéficiaire effectif | ● |
| R033 | Candidats partageant le même actionnaire principal | ● |
| R034 | Offres déposées dans le même ordre | |
| R041 | Similitudes matérielles dans les documents de candidats différents | |
| R044 | Similitudes d'entreprise entre candidats | ● |
| R053 | Paires de co-soumissionnaires avec le même gagnant récurrent | |
| R057 | Rotation des gagnants | ● |
| R058 | Offre fortement remisée | |
| R070 | Candidats perdants recrutés comme sous-traitants | |
| R071 | Un titulaire sous-traite tout ou presque | |
| R072 | Prévalence élevée de la sous-traitance | |

### Truquage de la procédure

| Code | Indicateur | SIGL |
|---|---|---|
| R002 | Manipulation des seuils de passation | ● |
| R003 | Délai de remise des offres trop court | |
| R006 | Exigences de préqualification déraisonnables | |
| R007 | Spécifications techniques déraisonnables | ● |
| R008 | Frais de participation déraisonnables | |
| R009 | L'acheteur augmente le coût du dossier d'appel d'offres | |
| R010 | Recours injustifié à une procédure non concurrentielle | ● |
| R011 | Fractionnement des achats pour éviter les seuils | ● |
| R012 | Marchés de gré à gré contraires au plan de passation | ● |
| R014 | Délai court entre la publication et l'ouverture des offres | |
| R015 | Délai long entre l'ouverture et l'évaluation des offres | |
| R016 | Valeur du marché éloignée de la moyenne de la catégorie | ● |
| R020 | Le marché fait l'objet d'une plainte | |
| R021 | Recours élevé à des critères d'évaluation discrétionnaires | |
| R029 | Prix s'écartant de la loi de Benford | ● |
| R030 | Offre tardive déclarée gagnante | |
| R031 | Prix gagnant très proche ou supérieur à l'estimation | ● |
| R035 | Toutes les offres sauf la gagnante écartées | |
| R036 | L'offre la moins chère écartée | |
| R037 | Disqualifications mal motivées | |
| R038 | Nombre excessif d'offres disqualifiées | |
| R043 | Candidat ayant les mêmes coordonnées qu'un agent du projet | ● |
| R049 | Gré à gré juste sous le seuil | ● |
| R052 | Petit achat initial suivi d'achats bien plus importants | ● |
| R054 | Gré à gré suivi d'avenants dépassant le seuil concurrentiel | ● |
| R055 | Gré à gré répétés au-dessus ou juste sous le seuil | ● |
| R056 | L'offre gagnante ne satisfait pas aux critères d'attribution | |
| R059 | Écart important entre le montant attribué et le montant final | ● |
| R060 | Délai long entre l'attribution et la signature | |
| R061 | Délai de décision extrêmement court | |
| R062 | Délai de décision extrêmement long | |

---

## Journal

**26 novembre 2026, matin** — Première passe de recherche : normes (ISO 55001:2024, IPSAS 12 et 45,
GS1 GIAI), circuit achat et contrôle interne, systèmes publics de France, Belgique, Canada,
États-Unis et PAM, causes d'échec des ERP publics, cadre légal RDC. Les 73 drapeaux rouges de l'OCP
ont été extraits du guide 2024. Huit questions ouvertes, dont quatre bloquantes.

**26 novembre 2026, après-midi** — Dépouillement des textes primaires. Trois questions bloquantes sur
quatre sont tranchées (section 7) : le Code du numérique a été lu intégralement (168 pages), ainsi
qu'IPSAS 12 et IPSAS 45. Résultats qui changent la conception : hébergement en RDC obligatoire et
dérogations par consentement fermées aux autorités publiques (art. 201 et 202) ; signature
électronique obligatoirement via un prestataire de services de confiance, qualifié et autorisé
(art. 105, 108, 112 et 137) ; homologation des services fournis à l'État (art. 19) ; obligations
d'archivage et redevance INACO (art. 42 à 46) ; stocks distribués gratuitement évalués au coût de
remplacement actuel (IPSAS 12 par. 17) ; base d'évaluation déterminée par l'objectif de détention
(IPSAS 45 par. 27) et regroupement des petits matériels autorisé (par. 8).

Reste bloquant : le décret 10/34 sur les seuils de passation, et le pourcentage de l'étude de la
Banque mondiale. Dans les deux cas le serveur refuse l'accès automatisé — les PDF doivent être
téléchargés depuis un navigateur ordinaire et déposés dans `docs/sources/`.
