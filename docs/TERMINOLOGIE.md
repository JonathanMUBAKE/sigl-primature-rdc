# Comment s'appelle un système comme le SIGL

Projet SIGL — Primature de la République démocratique du Congo. Braintis Technology.
Recherche du 26 novembre 2026.

La question posée était : pour les documents on dit GED, gestion électronique des documents ; pour la
logistique et le patrimoine, on dit quoi ?

**La réponse courte : il n'y a pas un sigle, il y en a une famille, et le SIGL en recoupe quatre.**
Mais il existe un nom qui compte plus que tous les autres pour ce projet, et il est congolais :
**comptabilité des matières**. C'est le terme du décret de 2013, et c'est celui qui doit figurer dans
la présentation à la Primature. Les sigles commerciaux servent à parler aux informaticiens ; celui-là
sert à parler aux décideurs.

---

## 1. La famille des sigles, et ce que chacun couvre

### EAM — Enterprise Asset Management

Gestion du patrimoine sur tout le cycle de vie, de l'acquisition à la mise hors service, avec le
volet financier : amortissement, valeur résiduelle, arbitrage réparer ou remplacer, coût du cycle de
vie, criticité. Le registre comptable des immobilisations en fait partie.

C'est le sigle le plus proche du cœur du SIGL. En français on dit EAM, ou « gestion d'actifs », ou
« gestion de patrimoine ».

**Attention à un piège pour la présentation :** l'EAM est une catégorie d'éditeurs, pas une norme.
Aucun texte normatif ne la définit. La norme, c'est ISO 55001 — et elle porte sur le *système de
management* des actifs, pas sur le logiciel. Ne pas présenter l'EAM comme un standard : présenter
ISO 55001 comme le référentiel, et l'EAM comme la catégorie d'outils qui l'outille.

### GMAO — Gestion de Maintenance Assistée par Ordinateur (CMMS en anglais)

Les interventions de maintenance : ordres de travail, maintenance préventive planifiée, historique,
réparations. C'est un **sous-ensemble** de l'EAM, souvent livré comme un module à l'intérieur d'un
EAM. Historiquement conçue pour un site unique, là où l'EAM gère le multisite.

Pour le SIGL, c'est le module 7, partie maintenance. Ce n'est pas le système entier — et dire « GMAO »
réduirait le projet.

### ITAM — IT Asset Management, et SAM pour les logiciels

Branche spécialisée de l'EAM, consacrée au matériel informatique, aux logiciels, aux ressources en
nuage et aux licences. L'accent est financier et contractuel : coût, détenteur, date d'achat,
garantie, droit d'usage de licence, mise au rebut. Norme : **ISO/IEC 19770-1**, déjà citée dans la
vision du projet.

Le parc informatique de la Primature relève de là, et il justifie à lui seul un traitement
particulier à cause des licences.

### WMS — Warehouse Management System

L'exécution physique en magasin : réception, mise en stock, prélèvement, emballage, expédition. Il se
branche sur le matériel — lecteurs de codes-barres, terminaux radio, automatisation. Ce n'est pas la
quantité et la valeur qui l'intéressent, c'est la tâche et le mouvement.

Pour le SIGL, c'est le module 2 vu depuis le magasin, et la partie que l'application mobile de
terrain va servir.

### IMS — Inventory Management System

Le suivi des stocks : niveaux, points de recommande, données d'article. Il est utilisé par les
acheteurs et la comptabilité, là où le WMS est utilisé par le magasinier. C'est l'outil des petites
structures à faible nombre de références.

Dans le SIGL, c'est le module 2 vu depuis la Logistique centrale, avec les seuils minimum et
critiques.

### P2P — Procure-to-Pay, et S2P — Source-to-Pay

La chaîne demande d'achat → bon de commande → réception → facture → paiement, côté finances et
achats. Les produits connus sont SAP Ariba, Coupa, Procurify. Le **rapprochement à trois voies** (bon
de commande, réception, facture) appartient à cette famille.

Dans le SIGL, c'est les modules 3, 4, 5 et 6. C'est aussi la partie où le cadre congolais pèse le
plus, puisque les achats passent par la loi sur les marchés publics.

### IWMS — Integrated Workplace Management System, et CAFM

Terme créé par Gartner en 2004, attribué à l'analyste Michael Bell : logiciel d'entreprise couvrant
le cycle de vie de l'immobilier et des installations, de l'acquisition à la cession. Il est bâti
au-dessus du CAFM et de la GMAO. En Europe et au Royaume-Uni on dit plutôt **CAFM**, gestion des
installations assistée par ordinateur.

Le CAFM part des bâtiments et des occupants, la GMAO part des actifs et des travaux. Pour un
ministère exploitant plusieurs bâtiments occupés, la littérature recommande un CAFM à maintenance
solide, ou une GMAO complétée d'écrans de gestion des installations.

**À retenir pour le périmètre :** l'immobilier de la Primature est déjà pris en charge par la
**Cellule de Gestion des Immeubles du Gouvernement (CGIG)**, qui assure la maintenance, l'entretien,
la sécurité et la gestion des espaces des immeubles du Gouvernement. Le SIGL ne doit pas refaire un
IWMS : il doit s'articuler avec la CGIG. C'est une décision de périmètre à trancher au cadrage.

### APSR — Accountable Property System of Record

Le concept du secteur public américain, et le plus important à importer. Ce n'est pas une catégorie
de logiciel, c'est un **statut** : le système désigné comme faisant foi pour la comptabilité des
biens. Tenir un registre en dehors de lui est une non-conformité.

Son équivalent congolais existe et il est plus fort, parce qu'il est dans la loi : la comptabilité
des matières du décret de 2013.

### Les autres, pour mémoire

- **APM** — Asset Performance Management : la couche analytique au-dessus de l'EAM, prédiction de
  panne et performance.
- **TMS** — Transport Management System : le transport. Hors périmètre du SIGL, sauf le charroi.
- **Fixed Asset Register**, en français **gestion des immobilisations** : la couche comptable pure,
  souvent un module de l'ERP.
- **SCM / MM** — Supply Chain Management, et Materials Management, le nom du module d'un ERP comme
  SAP. C'est sous ce nom que la logistique existe dans les ERP publics étudiés.

---

## 2. Comment les sigles s'empilent

Un montage courant, décrit dans la littérature : l'ERP ou l'IMS tient les articles au sens financier,
les achats et les commandes ; le WMS exécute les tâches physiques et renvoie les mouvements au
système hôte ; le P2P couvre le côté achat. Les trois sont complémentaires, pas interchangeables.

Appliqué au SIGL, qui les réunit dans un seul produit :

| Module de la vision | Famille | Norme ou référentiel associé |
|---|---|---|
| 1. Inventaire et patrimoine | EAM, Fixed Asset Register | ISO 55001, IPSAS 45, GS1 GIAI |
| 2. Gestion des stocks | IMS pour le pilotage, WMS pour le magasin | IPSAS 12 |
| 3. États de besoin | P2P, amont | — |
| 4. Validation et arbitrage | P2P, workflow | Loi 10/010, décret 10/34 |
| 5. Approvisionnement et achats | P2P / S2P | Loi 10/010, ISO 28000 |
| 6. Livraisons et réceptions | P2P, rapprochement à trois voies | — |
| 7. Mouvements et déclassements | EAM, GMAO pour la maintenance | IPSAS 45, décret de 2013 |
| 8. Alertes et tableaux de bord | APM, informatique décisionnelle | ISO 31000, ISO/IEC 42001 |
| Parc informatique | ITAM / SAM | ISO/IEC 19770-1 |
| Immeubles | IWMS / CAFM — **déjà couvert par la CGIG** | — |

Le SIGL n'entre donc dans aucune case du marché. C'est un fait à assumer plutôt qu'à masquer : aucun
produit du commerce ne couvre à la fois le patrimoine, les stocks, le circuit de la commande publique
congolaise et la comptabilité des matières. C'est précisément ce qui justifie un développement sur
mesure, et c'est un argument à mettre dans la présentation.

---

## 3. Le nom qui compte : comptabilité des matières

### Ce que c'est

Dans la tradition des finances publiques francophones, la **comptabilité des matières** est une
comptabilité d'inventaire permanent qui décrit les existants et les mouvements des biens meubles et
immeubles, et des stocks autres que les deniers et valeurs. Elle est tenue par un **comptable des
matières**, en partie simple, et elle constitue la **comptabilité auxiliaire** de la comptabilité
générale de l'État.

Elle permet de connaître, en quantité et en valeur, les moyens matériels dont dispose une
administration — ce qui sert à préparer ses plans d'investissement.

### Pourquoi c'est le bon nom pour le SIGL

Parce que c'est le nom que la loi congolaise emploie. Le **décret n° 13/050 du 6 novembre 2013**
portant règlement général sur la comptabilité publique dispose que la comptabilité de l'État comprend
trois volets : budgétaire, générale, et **comptabilité des matières**. Les articles 120 à 123 en
fixent l'objet, la tenue et les obligations. Voir `CADRE-PRIMATURE.md` pour le détail.

Conséquence pour la présentation : le SIGL ne propose pas une idée nouvelle à la Primature. Il
**outille une obligation en vigueur depuis 2013**. Ce n'est pas le même argument de vente, et c'est
un argument beaucoup plus fort.

### Ce que ça change dans le vocabulaire du projet

| Ne pas dire | Dire |
|---|---|
| Inventaire | Comptabilité des matières, ou état d'inventaire du patrimoine |
| Gestionnaire de stock | Comptable des matières, régisseur, préposé |
| Entrée en stock | Prise en charge à l'inventaire |
| Fiche article | Fiche de gestion des stocks, fiche de valeurs |
| Mise au rebut | Cession, mise au rebut, réforme — avec les compétences que le décret fixe |
| Numéro d'inventaire | Immatriculation |
| Validation | Certification, imputation, visa, selon l'acteur |

Ce n'est pas du formalisme. Les documents sont nommés dans le plan comptable de l'État, les actes
sont nommés dans le décret, et les rôles aussi. Un cahier des charges qui emploie le vocabulaire
légal se fait lire ; un cahier des charges qui emploie le vocabulaire des éditeurs se fait reprendre.

### Des modèles à récupérer

D'autres administrations francophones ont déjà écrit leur manuel de procédures de comptabilité des
matières. Ce sont des modèles directement réutilisables pour la phase de cadrage, qui doit produire
les procédures écrites.

- **Directive CEMAC sur la comptabilité des matières** : prévoit un inventaire tournant périodique
  conduit par le comptable-matières (art. 52), et un inventaire de fin d'exercice organisé par
  l'ordonnateur avec le comptable-matières.
  https://cemac-prgfp.org/CEMAC/useruploads/pageTypePays/215/ressources/1.%20Niveau%20R%C3%A9glementaire/1.1%20Directive%20(C.H.F.P.)/Directive%20Comptabilit%C3%A9%20des%20Mati%C3%A8res.pdf
- **Guide didactique CEMAC** de la même directive.
  https://cemac-prgfp.org/CEMAC/useruploads/pageTypePays/215/ressources/2.%20Niveau%20M%C3%A9thodologique/2.1.%20Guide%20Didactique%20Pratique%20Reporting/Guide%20Directive%20CDM.pdf
- **Manuel de procédures de gestion de la comptabilité matières, Guinée**, ministère délégué au
  Budget, 2022. Le document le plus proche de ce qu'il faut écrire. Il dépasse 10 Mo, donc à
  télécharger depuis un navigateur ordinaire.
  https://mbudget.gov.gn/wp-content/uploads/2022/06/MANUEL-DE-PROCEDURES-DE-GESTION-DE-LA-COMPTABILITE-MATIERES-VFF-def-def-def-3.pdf
- **Article de doctrine**, Afrilex, université de Bordeaux : la comptabilité matières dans le
  renouveau des finances publiques.
  https://afrilex.u-bordeaux.fr/wp-content/uploads/2021/03/comptabilite_matieres_en_finances_publiques_S-_OUEDRAOGO.pdf
- **Décret ivoirien** portant règlement général sur la comptabilité publique, pour comparaison de
  rédaction. https://igt.tresor.gouv.ci/t/wp-content/uploads/2019/05/DECRET-PORTANT-REGLEMENT-GENERAL-SUR-COMPTABILITE-PUBLIQUE.pdf

Réserve : la RDC n'appartient ni à l'UEMOA ni à la CEMAC. Ces textes ne s'y appliquent pas. Ils
servent de modèle de rédaction et de source d'idées de procédure, pas de fondement juridique — le
fondement, c'est le décret de 2013.

---

## 4. Comment nommer le produit

Trois registres, pour trois publics.

**Devant la Primature et les corps de contrôle :** « système de comptabilité des matières et de
gestion du patrimoine de la Primature ». C'est le vocabulaire du décret de 2013 ; personne ne peut
objecter qu'il s'agit d'une lubie informatique.

**Devant des informaticiens, dans un appel d'offres ou un marché :** « plateforme EAM et P2P avec
module WMS et composante ITAM, conforme à ISO 55001 et aux IPSAS 12 et 45 ». C'est ce qui permet de
comparer avec le marché et de qualifier des prestataires.

**Comme nom d'usage :** SIGL, Système Intégré de Gestion Logistique. Court, prononçable, et il ne
ferme aucune porte.

Une remarque sur le sigle : « SIGL » existe déjà ailleurs, et « système de gestion de la comptabilité
matière » est parfois abrégé SIGM ou GestMat dans la zone UEMOA. À vérifier avant de déposer un nom
ou d'acheter un domaine.
