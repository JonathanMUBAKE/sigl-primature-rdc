# Comment mener le SIGL

Projet SIGL — Primature de la République démocratique du Congo. Braintis Technology.
Recherche du 26 novembre 2026, sur les standards publics du Royaume-Uni, du Canada et de la France.

---

## 1. D'abord : ce n'est pas un outil de gestion de stock

La question méritait d'être posée, parce que la réponse commande tout le reste.

Le stock, c'est **un module sur huit**. Et ce n'est même pas le plus important.

Le SIGL est d'abord un **registre du patrimoine** : ce que l'État possède, où ça se trouve, qui en
répond, ce que ça vaut, dans quel état c'est. C'est ensuite un **circuit de la commande publique** :
qui demande, qui vise, qui arbitre, qui commande, qui reçoit, qui paie. Le stock est la couche du
milieu — celle qui bouge le plus vite, donc la plus visible, mais pas la plus structurante.

Trois façons de le vérifier :

- **Le droit.** Le décret du 6 novembre 2013 parle de « comptabilité des matières », dont l'objet est
  « la description des existants et des mouvements concernant les biens mobiliers et immobiliers, les
  stocks, les titres et valeurs de l'État ». Les stocks sont cités en troisième position, entre les
  immeubles et les valeurs inactives.
- **La durée de vie.** Une rame de papier traverse le système en trois semaines. Un véhicule y reste
  dix ans, avec son entretien, ses affectations successives, sa réforme. C'est le véhicule qui coûte
  cher et qui disparaît mystérieusement, pas la rame de papier.
- **Les familles de logiciels.** Un outil de gestion de stock s'appelle un IMS, ou un WMS pour la
  partie magasin. Le SIGL est un **EAM** — gestion du patrimoine sur tout le cycle de vie — avec un
  volet P2P pour la commande et un volet WMS pour le magasin. Voir `TERMINOLOGIE.md`.

**Pourquoi ça compte pour la conduite du projet.** Si on croit faire un outil de stock, on commence
par les magasins, on livre vite quelque chose qui marche, et on découvre au bout d'un an qu'on n'a
aucun inventaire du patrimoine — c'est-à-dire qu'on n'a rien fait pour l'obligation légale, ni pour
la question que la hiérarchie se pose vraiment : *qu'est-ce qu'on possède, et où est-ce ?* Si on sait
qu'on fait un registre du patrimoine, on commence par l'inventaire et l'immatriculation, qui sont
longs et ingrats, et le stock vient ensuite presque gratuitement.

---

## 2. Les trois standards publics qui font référence

### Royaume-Uni — le Service Standard du Government Digital Service

Quatorze points, et un découpage en quatre phases avec des revues obligatoires entre les phases.
https://www.gov.uk/service-manual/service-standard

1. Comprendre les utilisateurs et leurs besoins
2. Résoudre un problème entier pour l'utilisateur
3. Offrir une expérience cohérente sur tous les canaux
4. Rendre le service simple à utiliser
5. S'assurer que tout le monde peut l'utiliser
6. Avoir une équipe pluridisciplinaire
7. Travailler en méthode agile
8. Itérer et améliorer fréquemment
9. Créer un service sûr qui protège la vie privée
10. Définir ce qu'est le succès et publier les données de performance
11. Choisir les bons outils et la bonne technologie
12. Ouvrir le code source
13. Utiliser et contribuer aux standards ouverts et aux composants communs
14. Exploiter un service fiable

Les quatre phases : **discovery** (comprendre le problème), **alpha** (tester des idées par
prototypes), **beta** (construire et affiner), **live** (exploiter et continuer d'améliorer). Entre
chacune, une **revue par un jury** vérifie le respect du standard. Le point important du mécanisme :
chaque revue s'appuie sur les preuves accumulées aux phases précédentes — on ne peut pas sauter une
étape et la justifier après.

Ce qu'on en garde : les points 2, 6, 10 et 12. Le point 2 surtout — « résoudre un problème entier » :
un SIGL qui gère l'entrée en stock mais laisse le certificat de prise en charge à l'inventaire se
faire à la main n'a pas résolu un problème entier, il en a déplacé la moitié.

### Canada — les Normes numériques du gouvernement

Dix normes, Conseil du Trésor, playbook de 2021.
https://www.canada.ca/fr/gouvernement/systeme/gouvernement-numerique/normes-numeriques-gouvernement-canada.html

Les trois qui pèsent le plus ici :

- **Concevoir avec les utilisateurs.** « Faire des recherches auprès des utilisateurs pour comprendre
  leurs besoins et les problèmes à résoudre. Conduire des tests continus avec les utilisateurs pour
  guider la conception et le développement. »
- **Itérer et améliorer fréquemment.** « Essayer de nouvelles choses, commencer petit et passer à
  l'échelle. »
- **Utiliser des normes et des solutions ouvertes**, y compris le logiciel libre quand c'est
  approprié. Et, norme distincte, **travailler en transparence par défaut**.

Le Canada reste par ailleurs notre meilleur modèle institutionnel, pour une raison vue dans
`PLAN-DE-RECHERCHE.md` : il a écrit la règle avant l'outil.

### France — la méthode beta.gouv.fr de la DINUM

C'est celle qui parle le plus directement de notre situation, parce qu'elle est née dans une
administration proche de la nôtre par la culture, et parce qu'elle publie ses échecs.
https://beta.gouv.fr/approche/ · https://beta.gouv.fr/content/docs/guide.pdf

**Quatre phases :** investigation (1 à 2 mois), construction, accélération, pérennisation. Les trois
dernières durent 18 à 32 mois. Et **des jalons tous les six mois, pour décider de continuer ou
d'arrêter**.

**Trois piliers :**

- **Une équipe dédiée et autonome.** Les membres travaillent à temps plein sur le produit, par
  opposition à une équipe projet dont les membres font aussi autre chose.
- **Un problème de politique publique.** L'équipe ne part pas d'un cahier des charges mais d'une
  **fiche produit** en trois parties : un problème, souvent un drame ; une piste de solution, qui rompt
  souvent avec une habitude ancrée ; et une proposition crédible pour obtenir de premiers résultats en
  six mois.
- **Une approche incrémentale.** L'image du guide : pour inventer la mobilité individuelle, on
  commence par une bicyclette, pas par une voiture. Et on ajuste **le périmètre**, jamais les délais.

**Six facteurs clés de succès**, identifiés depuis 2013 : le sponsor, l'innovateur, le coaching, la
règle des six mois, la mesure d'impact, l'incubateur.

---

## 3. Les chiffres qui doivent nous faire peur

Ceux-ci viennent du guide de la DINUM lui-même, sur ses propres projets. Ce ne sont pas des
statistiques d'éditeur reprises de seconde main — c'est un programme public qui compte ses morts.

> **La moitié des échecs survenus entre 2013 et 2017 s'explique par un sponsorship insuffisant.**

> **Près de la moitié des start-ups d'État ayant échoué entre 2013 et 2017 comportaient des membres
> ne travaillant pas à temps plein sur le projet.**

Conséquence tirée par le programme : il n'accompagne plus aucun projet sans l'adhésion du directeur
de l'administration porteuse, et plus aucun projet sans un agent public dédié à temps plein. Ce sont
devenues des conditions d'entrée, pas des recommandations.

Et cette phrase, qui doit gouverner notre staffing :

> **« Il vaut mieux une personne à temps plein que quatre personnes à mi-temps. »**

À quoi s'ajoutent les constats rassemblés dans `PLAN-DE-RECHERCHE.md` : la gestion du changement et
la formation sous-estimées sont la cause la plus citée des échecs d'ERP publics ; la période la plus
fragile est souvent les premiers mois d'exploitation, pas la phase de construction ; et les
contournements du système après la mise en service en détruisent la valeur.

---

## 4. Comment on s'organise : l'équipe

### Les rôles indispensables

| Rôle | Qui | Pourquoi |
|---|---|---|
| **Sponsor** | La Première ministre, ou son directeur de cabinet | La moitié des échecs vient de là. Il protège l'autonomie de l'équipe et arrête les interférences du middle management. Pas un parrain honorifique : quelqu'un qui tranche. |
| **Propriétaire métier** | Le Conseiller administratif et financier, ou l'Intendant général | L'audit du PAM a montré que lorsque les décisions d'évolution appartiennent à une équipe distincte du propriétaire du processus métier, l'outil dérive des besoins. À désigner **nommément**. |
| **Intrapreneur** | Un agent de la Primature, à temps plein | Il apporte la connaissance du problème, la motivation et le réseau interne. Sans lui, nous construisons de l'extérieur et personne ne défend l'outil quand ça coince. |
| **Comptable des matières** | Celui que le décret désigne | Ce n'est pas un utilisateur à consulter, c'est le titulaire légal de la fonction. Il valide le modèle de données. |
| **Chef de produit** | Braintis | Tient la fiche produit, le périmètre, les priorités. Dit non. |
| **Développeurs** | Braintis, à temps plein | Deux au minimum pour éviter le facteur d'autobus. |
| **Conception et interface** | Braintis | Le contournement se gagne ou se perd sur les écrans. |
| **Référent sécurité et conformité** | Braintis + un juriste | Code du numérique, hébergement, signature électronique, archivage. Ce n'est pas une revue finale, c'est une contrainte d'architecture. |

### Les rôles à ne pas oublier côté contrôle

Le contrôleur de budget et les comptables publics de la Primature sont **mis à disposition par le
ministère du Budget ou des Finances** : ce ne sont pas des agents de la Primature. Ils doivent être
associés dès la conception, parce qu'ils vont contrôler ce que le système produit. Et l'Inspection
générale des finances a compétence générale sur les biens publics : elle sera lectrice de la piste
d'audit.

### La règle de staffing

Une personne à temps plein vaut mieux que quatre à mi-temps. Si la Primature ne peut dégager personne
à temps plein, c'est un signal à traiter avant de commencer, pas pendant.

---

## 5. Ce qu'on fait avant de coder

Quatre étapes. Aucune ne produit de code.

### Étape 1 — L'investigation (4 à 6 semaines)

**Objet :** vérifier qu'on a compris le problème, et le mesurer.

- Rencontrer les gens qui font le travail aujourd'hui : l'Intendant général, les intendants, le
  Service administratif et financier, un magasinier, un chef de structure, un agent demandeur. Les
  **regarder faire**, pas seulement les interroger. Un formulaire trop long, un champ manquant, un
  geste répété trois fois — ça se voit, ça ne se raconte pas.
- Collecter les documents réels : les états de besoin tels qu'ils sont remplis aujourd'hui, les bons
  de commande, les fiches de stock, les PV de réception. Les vrais, avec leurs ratures.
- Chiffrer l'existant : combien de structures, combien de sites, combien de biens, combien d'états de
  besoin par mois, combien de temps entre la demande et la livraison, combien de ruptures de stock
  l'an dernier. Ce sont les questions ouvertes de la vision, et elles n'ont pas de réponse à ce jour.
- Récupérer les quatre textes manquants listés dans `CADRE-PRIMATURE.md` : le plan comptable de
  l'État, le référentiel national d'immatriculation, l'arrêté sur l'état d'inventaire, les taux
  d'amortissement.

**Livrable :** une **fiche produit** d'une page, dans la forme de la DINUM — le problème, la piste de
solution, et une proposition crédible de premier résultat en six mois. Plus un relevé chiffré de
l'existant.

**Critère de passage :** on sait nommer le problème avec un chiffre, et on sait quel premier service
rendre à qui en six mois.

### Étape 2 — Les procédures écrites (4 à 6 semaines, en parallèle)

**Objet :** écrire les règles avant l'outil. C'est la leçon canadienne, et la phase 1 de la feuille de
route de la vision.

- Le manuel de procédures de comptabilité des matières de la Primature. Des modèles existent, listés
  dans `TERMINOLOGIE.md` : la directive CEMAC, le manuel guinéen, le décret ivoirien.
- La nomenclature des biens, alignée sur le référentiel national s'il existe.
- Le projet de texte de la Primature qui rend le SIGL obligatoire et désigne le registre de référence.
  C'est la clause « APSR » : toute liste tenue à côté n'a aucune valeur.

**Livrable :** un manuel de procédures et un projet d'arrêté ou de note de service.

**Critère de passage :** les procédures sont validées par le comptable des matières et le Service
administratif et financier. Pas par nous.

### Étape 3 — La conception (6 à 8 semaines)

**Objet :** décider, et le mettre par écrit.

- Le cahier des charges fonctionnel : acteurs, droits, les huit modules, le circuit état par état, les
  documents générés, les règles de gestion.
- L'architecture : hébergement en RDC, prestataire de signature électronique, archivage conforme,
  mobile hors ligne, piste d'audit inaltérable.
- Les maquettes des parcours, par rôle.
- Le registre des risques et le plan de gestion du changement.

**Livrable :** le dossier de conception, et les maquettes.

**Critère de passage :** la Primature a validé le périmètre de la première version, et il est plus
petit que ce qu'elle voudrait.

### Étape 4 — Le premier périmètre (la décision la plus difficile)

**Objet :** choisir ce qu'on construit d'abord, et l'assumer.

La règle : on ajuste le périmètre, jamais les délais. Et on cherche un premier impact réel en six
mois, pas une preuve de faisabilité technique.

Notre recommandation, à discuter : **l'inventaire et l'immatriculation d'une structure pilote, plus le
certificat de prise en charge à l'inventaire.** Pourquoi ces deux-là ensemble :

- L'inventaire est la partie longue et ingrate. Si on ne la fait pas d'abord, on ne la fait jamais —
  c'est l'enseignement de Chorus RE-FX, où les données héritées n'ont jamais été fiabilisées.
- Le certificat de prise en charge est la pièce que le comptable public contrôle avant de payer
  (article 137). C'est le seul mécanisme qui rend le contournement impossible : personne ne contourne
  l'outil qui délivre le document sans lequel il n'est pas payé.

Les états de besoin, les bons de commande et le module IA viennent après. Ils sont plus
spectaculaires en démonstration, et c'est précisément pour ça qu'il faut résister.

---

## 6. Les décisions à prendre avant la première ligne de code

Toutes sortent de la recherche menée. Aucune n'est technique.

1. **Qui est le sponsor ?** Nommément.
2. **Qui est le propriétaire métier ?** Conseiller administratif et financier, ou Intendant général.
3. **Qui est l'intrapreneur à temps plein ?** Et son nom figure dans la convention.
4. **Quel est le périmètre des structures ?** La liste officielle s'arrête à la lettre D : il faut la
   liste complète. Et les établissements publics rattachés ont leur propre comptable, donc leur propre
   comptabilité des matières : périmètres étanches, consolidation au niveau de la Primature.
5. **Que fait-on de l'immobilier ?** La CGIG gère déjà les immeubles du Gouvernement. On s'interface,
   ou on s'arrête au mobilier et aux équipements.
6. **Quel seuil de valeur pour un numéro d'inventaire individuel ?** IPSAS 45 paragraphe 8 autorise le
   regroupement des petits matériels. En dessous du seuil, suivi en lot.
7. **Où héberge-t-on, et le site de secours ?** L'article 201 du Code du numérique impose la RDC, et
   les dérogations par consentement sont fermées aux autorités publiques.
8. **Quel prestataire de signature électronique ?** Il doit être qualifié et autorisé en RDC. S'il
   n'en existe aucun, il faut un plan de repli, et le dire aux décideurs, parce que cela change la
   valeur probante de la piste d'audit.
9. **Le module IA tourne-t-il en RDC ?** Même contrainte que l'hébergement. À poser explicitement.
10. **La Primature détient-elle des valeurs inactives ?** Timbres, vignettes, formules. Module non
    prévu, et responsabilité pécuniaire attachée.
11. **Qui conduit l'inventaire physique initial, et avec quels moyens ?** C'est la phase qui fait
    échouer les inventaires.
12. **Code ouvert ou non ?** Le Royaume-Uni et le Canada le recommandent. Pour un système touchant la
    sécurité des biens de la Primature, la réponse n'est pas évidente. À trancher avec un argumentaire.

---

## 7. Les garde-fous : chaque cause d'échec, et sa contre-mesure

| Cause d'échec constatée ailleurs | Ce qu'on met en face |
|---|---|
| Sponsorship insuffisant — la moitié des échecs de la DINUM | Un sponsor nommé, qui tranche, et des jalons tous les six mois où il décide de continuer ou d'arrêter |
| Membres d'équipe à temps partiel — près de la moitié des échecs | Un intrapreneur à temps plein, condition d'entrée et non souhait |
| Gestion du changement et formation sous-estimées — cause la plus citée | Un plan de formation chiffré dans le budget initial, pas en option ; et la formation avant la bascule, pas après |
| Contournement du système après la mise en service | Le certificat de prise en charge à l'inventaire : pas de paiement sans lui. Plus des écrans plus rapides que le tableur |
| Données héritées jamais fiabilisées — Chorus RE-FX | Une phase de fiabilisation certifiée avant de brancher la comptabilité, avec un PV de recette des données |
| Décisions d'évolution hors du propriétaire métier — audit PAM 2021 | Le propriétaire métier décide des évolutions. Écrit dans la convention |
| Dépendance au prestataire pour exploiter son propre système — FEDCOM | Obligation de transfert de compétences, et un critère de sortie : la Primature exploite sans Braintis |
| Déploiement précipité, tests insuffisants | Périmètre ajustable, délais non ajustables. Une structure pilote avant toute généralisation |
| Propriété des données non définie après la mise en service | Désignée dans le texte de la Primature, dès l'étape 2 |
| Registres parallèles qui réapparaissent — audit DoD | Périmètre fermé, et clause de registre de référence dans le texte |
| Chiffres et promesses non étayés devant les décideurs | Aucun pourcentage dans la présentation qui ne vienne d'une source primaire lue |

---

## 8. La cadence

- **Chaque jour :** un point debout de quinze minutes dans l'équipe.
- **Chaque semaine :** une démonstration de ce qui marche, devant le propriétaire métier. Pas un
  rapport d'avancement, une démonstration.
- **Chaque mois :** un comité avec le sponsor. Trois questions : qu'est-ce qui a été livré, qu'est-ce
  qui bloque, qu'est-ce qu'on arrête.
- **Tous les six mois :** le jalon. Quel impact réel, mesuré. On continue, on réoriente, ou on
  arrête.
- **Les indicateurs :** éviter les mesures de vanité. Pas « nombre de connexions », mais « nombre de
  biens immatriculés et rapprochés », « délai entre l'état de besoin et la livraison », « écart entre
  l'inventaire physique et la base ». Au démarrage l'appréciation peut être qualitative — le
  témoignage d'un intendant à qui le système a rendu un service. Ensuite il faut du chiffre.

---

## 9. Une tension à trancher, et notre recommandation

Le guide de la DINUM dit une chose qu'il faut regarder en face :

> « Cette méthode n'est pas adaptée pour réaliser de simples développements informatiques, par
> exemple lorsqu'un cahier des charges a été élaboré et qu'on est sûr que sa réalisation donnera
> satisfaction. » Et même : « en repartant du problème, elle risque de faire perdre du temps et de
> l'argent à l'administration en lui faisant faire un pas en arrière. »

Nous ne sommes pas dans ce cas : il n'y a pas encore de cahier des charges, et personne n'est sûr que
la solution imaginée donnera satisfaction. La méthode s'applique donc. Mais elle pose une question
désagréable sur notre propre plan de travail.

**L'objectif était : un cahier des charges complet, puis une présentation, puis le développement.**
La méthode dit plutôt : une fiche produit d'une page, une structure pilote, un premier service rendu
en six mois, et le périmètre complet construit ensuite par itérations.

**Notre recommandation : les deux, dans cet ordre, sans les confondre.**

- Le **dossier de conception complet** reste nécessaire. Pas comme plan de développement, mais comme
  **pièce de décision** : c'est ce qui permet à la Primature d'engager un budget, de passer un marché,
  et de voir que le projet a été pensé jusqu'au bout. Les décideurs n'engagent pas plusieurs centaines
  de milliers de dollars sur une fiche d'une page.
- Mais le **plan de construction** ne suit pas l'ordre du dossier. Il suit la règle des six mois :
  l'inventaire d'une structure pilote et le certificat de prise en charge d'abord, le reste ensuite.

Dire cela explicitement dans la présentation est un atout, pas un aveu de faiblesse. Les décideurs
ont déjà vu des projets informatiques annoncés complets et livrés jamais. Un projet qui annonce ce
qu'il livre dans six mois, et qui s'engage à être arrêté s'il ne le livre pas, est plus crédible qu'un
projet qui promet tout dans deux ans.

---

## 10. Ce qu'il nous manque encore

- Les réponses aux douze décisions de la section 6. La plupart ne dépendent que d'une réunion avec la
  Primature.
- Les quatre textes du ministère des Finances, listés dans `CADRE-PRIMATURE.md`.
- Le décret organisant le Secrétariat général à la Primature.
- Les seuils du décret 10/34, et le pourcentage de l'étude de la Banque mondiale — les deux PDF
  bloqués, à déposer dans `docs/sources/`.
- Le manuel guinéen de comptabilité des matières, qui dépasse 10 Mo et doit être téléchargé à la main.
  C'est le modèle le plus proche de ce qu'il faut écrire à l'étape 2.

---

## Journal

**26 novembre 2026** — Recherche sur la conduite de projet : Service Standard britannique (14 points,
quatre phases avec revues), Normes numériques canadiennes (10 normes, playbook 2021), méthode
beta.gouv.fr de la DINUM (guide de lancement lu intégralement : trois piliers, six facteurs clés,
quatre phases, règle des six mois). Deux chiffres de première main retenus : la moitié des échecs de
la DINUM entre 2013 et 2017 vient d'un sponsorship insuffisant, et près de la moitié comportaient des
membres à temps partiel. Douze décisions à prendre avant la première ligne de code, et onze
contre-mesures aux causes d'échec constatées.
