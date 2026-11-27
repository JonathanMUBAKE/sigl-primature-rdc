# Journal du chantier SIGL

Les décisions prises seul, avec leur raison. Toute décision non écrite ici n'a pas été prise.

## Nuit du 26 au 27 novembre 2026

**Direction artistique — la charte du Gouvernement, pas celle de Braintis.**
Le SIGL est un outil de l'État : il porte les couleurs de l'État. Les valeurs viennent du document
officiel « Charte Graphique du Gouvernement de la RDC », février 2022, dépouillé pour l'occasion :
bleu `#0095c9` (Pantone 801 C), jaune `#fff24b` (Pantone 803 C), rouge `#db3832` (Pantone 485 C),
noir `#323230`. La typographie officielle y est nommée : **Cooper Hewitt**, complétée par Garamond.
Cooper Hewitt est sous licence SIL Open Font : elle est installée dans le projet par
`@fontsource/cooper-hewitt`. La charte Braintis reste celle des documents de la société, pas celle du
produit livré à l'institution.

**Le site servicepublic.gouv.cd a servi de second repère** pour les partis pris d'écran — angles de
4 à 5 px, base 16 px, densité, absence d'ornement. Relevé par extraction des styles calculés.

**Pile technique.** Node 22, Fastify 5, PostgreSQL via PGlite en local et Supabase en production,
React 19 + Vite + Tailwind 4. SQL écrit à la main, sans ORM : le modèle est comptable, il doit rester
lisible par un comptable des matières. Tests avec `node:test`, sans dépendance supplémentaire.

**Pas d'ORM, pas de bibliothèque de composants.** Les écrans sont denses et administratifs ; une
bibliothèque générique aurait imposé ses arrondis et ses ombres, contre la sobriété voulue.

**Authentification remise à plus tard, droits appliqués tout de suite.** Un en-tête `X-Agent-Id`
désigne l'agent et le serveur en déduit ses rôles et sa portée. Les règles de séparation des fonctions
sont donc réellement appliquées, mais l'identité n'est pas encore prouvée. C'est un choix assumé : la
signature électronique exige un prestataire de services de confiance qualifié et autorisé en RDC
(Code du numérique, art. 105 et 112), qui n'est pas encore identifié.

**Deux régimes de structures, jamais confondus.** `integre` pour celles qui dépendent entièrement de
la Primature et attendent tout d'elle ; `autonome` pour les établissements publics qui ont leur
personnalité juridique, leur budget et leur comptable public. Le décret 13/050 confie la comptabilité
des matières au comptable public de l'entité : la Primature ne peut pas la tenir à leur place, elle
n'en a que la vue consolidée. C'est la règle RG-018.

**Les seuils de passation sont des paramètres, jamais des constantes.** Le décret 10/34 n'a pas pu
être vérifié — le site de l'ARMP refuse les requêtes automatisées. Les seuils vivent dans la table
`parametre`, horodatés : une décision prise hier doit rester jugeable avec les seuils d'hier.

**Le certificat de prise en charge à l'inventaire est le cœur du système.** L'article 137 du décret
13/050 en fait une pièce que le comptable public contrôle avant de payer. Le SIGL le génère à la
réception : plus de certificat sans entrée en inventaire, plus de paiement sans certificat. C'est le
mécanisme qui rend le contournement du système impossible.

**Sur « Kobra systems ».** La recherche ne trouve pas de design system ni de bibliothèque d'interface
de ce nom. Elle trouve **KobrA**, une méthode d'ingénierie logicielle par composants du Fraunhofer
IESE, qui décrit un système comme un arbre de composants dont chacun est spécifié **comme s'il était
un système autonome**. C'est le principe appliqué ici : le contrat technique spécifie chaque brique
indépendamment, et des agents distincts les réalisent sans se marcher dessus. Si ce n'était pas ce
qui était visé, le point est à reprendre.

**Organisation du chantier.** Un chef de projet technico-administratif et trois profils : architecte
des données, développeur serveur, concepteur d'interface. Chacun a sa fiche de poste dans
`.claude/agents/` et un périmètre de fichiers disjoint, pour qu'ils travaillent en parallèle sans
conflit.

## 27 novembre 2026 — deux décisions sur les alertes et les écarts de réception

**Une alerte de stock ne se referme jamais toute seule, mais elle ne bâillonne plus la suivante.**

Le comportement constaté était celui-ci : un article passe sous son seuil, l'alerte s'ouvre ; il est
réapprovisionné, la quantité repasse au-dessus, et l'alerte reste `ouverte` — ce qui est juste, RG-022
veut que le système n'décide rien et qu'un humain classe. Mais le garde-fou anti-doublon ne regardait
que le statut : tant qu'une alerte du même code était en cours, aucune autre ne pouvait s'ouvrir.
Conséquence, invisible par construction : **un article qui replonge ne levait aucune nouvelle alerte.**

Une alerte qui traîne sur un article réapprovisionné n'est que du bruit. Une rupture qui se répète et
reste muette est une alerte manquée, et dans un système dont le métier est d'avertir, c'est la panne
la plus coûteuse qui soit — personne ne la voit passer.

Trois changements, et pas un quatrième :

1. **Le retour au-dessus du seuil est horodaté** dans `donnees` de l'alerte : `condition_levee_le` et
   `quantite_au_retour`. L'alerte ne se referme pas pour autant. L'humain classe en sachant que la
   condition n'est plus réunie, au lieu de le deviner.
2. **Le verrou anti-doublon saute quand la condition a été levée.** Une alerte dont la condition est
   levée n'attend plus qu'un classement : un nouveau franchissement ouvre une alerte **nouvelle**, et
   l'ancienne reste ouverte, à classer. Tant que la condition tient, en revanche, le verrou tient : on
   ne harcèle pas le magasinier pendant qu'il instruit.
3. **Les deux natures sont dites explicitement dans l'API**, pas déduites par l'interface :
   `nature` ∈ `active` (la condition est réunie — ça brûle), `a_classer` (la condition est levée,
   personne n'a tranché), `tranchee` (un humain s'est prononcé), avec `condition_levee`,
   `condition_levee_le`, `quantite_au_retour` et `en_cours`. `GET /api/alertes` accepte `?nature=` et
   rend son résumé par nature ; le tableau de bord sépare les deux et son chiffre de tête, renommé
   « Alertes actives », ne compte plus que ce qui brûle.

Rien là-dedans ne change un état métier : ni la quantité, ni les seuils, ni le statut d'une alerte.
RG-022 tient. Migration `supabase/migrations/20261127020000_alerte_condition_levee.sql`, preuves dans
`server/src/alerte-seuil-bout-en-bout.test.js` (franchissement, retour au-dessus, nouveau
franchissement : **deux** alertes et non une) et `server/src/routes/alertes-nature.test.js`.

**La quantité livrée d'une réception reste facultative.**

Les écarts de réception se lisent désormais en trois colonnes — commandé, livré, reçu — parce que les
trois ne se confondent pas : le fournisseur présente une quantité au bordereau, le magasinier en
accepte une autre, la commande en demandait une troisième. La quantité livrée est **facultative**, et
sans elle le livré vaut le reçu.

C'est délibéré. Supposer un écart qu'on n'a pas constaté serait pire que de n'en rien dire : un écart
inventé déclenche une enquête pour rien et décrédibilise tous les autres. Le jour où la Primature
imposera un bordereau de livraison opposable, la quantité livrée deviendra obligatoire — ce sera une
décision de l'institution, pas la nôtre. La note est portée à l'endroit du code qui la tient,
`server/src/routes/receptions.js`.

**Au passage, un défaut que les tests ne voyaient pas.** La politique `journal_lecture` de l'ADR-001
réserve le journal au mode consolidation, le journal ne portant pas de `structure_id`. Lu sous une
transaction métier ordinaire, il ne rendait rien : la **consommation constatée était donc toujours
vide pour le magasinier et le comptable des matières**, c'est-à-dire pour ceux-là mêmes qui ouvrent
l'écran des stocks — et avec elle les jours de couverture, la date de rupture prévisible et la
criticité « rupture prévue ». Corrigé par une lecture consolidée nommée et strictement bornée (une
seule action, les seuls articles déjà filtrés par la sécurité au niveau des lignes), commentée sur
place. `GET /api/journal` reste réservé au contrôle externe.

---

## 27 novembre 2026 — Un contrôle de périmètre lu au bout d'une jointure externe

**Le constat.** La route qui marque un bon de commande payable contrôlait le périmètre sur une
structure lue ainsi : `bon_commande` → `dossier_achat` → `left join etat_besoin`. Or `etat_besoin`
est cloisonnée par la sécurité au niveau des lignes. Quand le bon relevait d'un établissement
autonome, la base masquait l'état de besoin, la jointure rendait `null`, et `verifierLecture` — qui
sort sans rien vérifier sur une structure vide — laissait passer. La route répondait ensuite
« certificat manquant » (RG-011), faute de voir un certificat qui existait bel et bien chez l'ARMP.

Trois symptômes pour une seule cause : le contrôle s'effaçait **exactement** dans le cas où il
devait mordre, le message d'erreur désignait le mauvais coupable, et l'essai rouge accusait RG-011
alors que le défaut était dans RG-017.

**La règle qu'on en tire.** Un contrôle de sécurité ne se lit pas au bout d'une jointure externe vers
une table cloisonnée. La base a le droit de rendre `null`, et un `null` ne se distingue pas d'une
absence de cloisonnement : l'erreur de lecture vaut alors autorisation, ce qui est l'inverse de ce
qu'on attend d'un contrôle. Le rattachement se résout **à l'écriture**, seul moment où il est connu
à coup sûr, et s'inscrit sur la ligne.

**Ce qui a été fait.** Migration `supabase/migrations/20261127040000_perimetre_achats.sql` :
`dossier_achat` et `bon_commande` portent leur propre `structure_id`, `not null`, avec reprise de
l'existant et refus d'appliquer la migration si une ligne reste sans rattachement — mieux vaut un
déploiement arrêté qu'un contrôle muet. Un déclencheur `sigl_rattacher_chaine_achat()` le résout à
l'insertion pour qui ne le fournit pas. Les lectures de périmètre de `achats.js` portent désormais
sur la colonne de la ligne. `verifierLectureStricte` refuse un périmètre indéterminable au lieu de
l'ignorer. Effet de bord voulu : la suppression d'un état de besoin (`on delete set null`) ne fait
plus perdre au dossier son rattachement.

**Un cas que les essais ont rattrapé, et c'est le bon signe.** Un dossier d'achat **peut** s'ouvrir
sans état de besoin : c'est un achat du niveau central. L'ancienne clause de repli
`or d.etat_besoin_id is null` n'était donc pas du code mort, et la supprimer a cassé sept essais.
Un tel dossier relève de la structure de l'agent qui l'ouvre, et la route le dit maintenant
explicitement. 139 essais, 139 passent.

**Ce qui reste ouvert, et qui n'est pas à nous.** `dossier_achat` et `bon_commande` restent hors de
`tables_cloisonnees` : leur isolation est tenue par la route, pas par la base — ce qui s'écarte de la
règle posée dans `COLLABORATION.md`. Les y mettre maintenant changerait la réponse : la ligne
devenant invisible, la route répondrait 404 au lieu du 403 / RG-017 que la spécification demande, et
le comptable public perdrait l'explication « ce bon relève de l'ARMP, qui tient ses propres
écritures ». C'est un arbitrage de conception, donc celui de ChatGPT. Signalé sur l'issue.

**Et la même faute, un cran plus loin : la liste des dossiers d'achat ne filtrait rien.**

`GET /api/dossiers-achat` s'écrivait `where true`, plus le statut et la procédure. `dossier_achat`
n'étant pas cloisonnée par la base, **tout agent voyait les dossiers de toutes les structures**,
établissements autonomes compris — sous une étiquette qui annonçait pourtant « N dossier(s) dans
votre périmètre ». Le détail `GET /api/dossiers-achat/:id` ne contrôlait rien non plus : on ouvrait
n'importe quel dossier par son identifiant.

Le symptôme visible semblait anodin, et c'est ce qui rend le cas instructif : chaque ligne annonçait
« Sans état de besoin rattaché » tout en nommant l'état de besoin dans son objet. L'interface ne
mentait pas — `etat_besoin`, elle, **est** cloisonnée, donc pour un dossier hors portée la base
masquait le besoin et la jointure rendait `null`. Une contradiction à l'écran était la trace d'une
fuite de périmètre.

Trouvé en ouvrant l'écran dans le navigateur, pas par les essais : l'agent de démonstration courant
est directrice à l'ARMP, un établissement autonome, et elle voyait les douze dossiers de toute la
Primature. Quatre essais ajoutés avant la correction (`perimetre-achats.test.js`), trois rouges.
143 essais, 143 passent.

---

## 27 novembre 2026 — Trois décisions de conception, tranchées et assumées

Ces trois questions étaient marquées « à trancher par la conception » et laissées à ChatGPT sur
l'issue #1. Vérification faite, **ChatGPT n'a jamais écrit sur ce dépôt** : les six commentaires de
l'issue sont de moi, postés sous le compte du client faute d'autre identité ; dix-sept commits sur
dix-huit sont de moi ; aucune branche, aucune *pull request*, aucune issue d'un autre auteur. Un
dépôt public est lisible par lui, mais il ne peut rien y écrire et ne se réveille que lorsqu'on lui
parle. Les trois questions n'étaient donc pas déléguées : elles étaient en attente, pendant que le
code avançait en les supposant résolues. C'était une erreur de conduite de ma part.

Le client a tranché le 27 novembre : décider seul. Ces trois décisions sont donc les miennes, et
voici sur quoi elles reposent. Que l'institution les renverse ne coûtera rien : chacune est posée à
un seul endroit, nommé ci-dessous.

**1. Le périmètre du comptable public est transversal, et s'arrête à la frontière juridique.**

Il lit l'ensemble des structures de régime `integre`, pas seulement celle où se trouve son bureau. Le
fondement n'est pas pratique mais juridique : il n'est pas un agent de la structure, il est mis à
disposition par le ministère du Budget ou des Finances, et le décret 13/050 art. 137 lui confie un
contrôle en matière de dépenses **et** en matière de patrimoine. Sa fonction porte sur l'institution.
Borner sa lecture à sa cellule rompait la chaîne de la commande au paiement : il voyait les bons de
toute la Primature et aucun certificat de prise en charge hors de sa structure, et RG-011 lui opposait
l'absence d'une pièce qui existait.

Elle s'arrête à un établissement public autonome — ARMP, APCSC, ARC-CSU, Caisse Nationale de
Péréquation. Celui-ci a sa personnalité juridique, son budget et **son propre comptable public** : sa
comptabilité des matières ne se lit pas d'en haut. Posé dans
`supabase/migrations/20261127030000_portee_comptable_public.sql`.

**2. Un dossier d'achat ouvert sans état de besoin relève de la structure de l'agent qui l'ouvre.**

C'est un achat du niveau central. L'alternative aurait été un « achat hors structure », sans
rattachement : je l'ai écartée, parce qu'une dépense sans structure responsable n'a personne à qui
l'imputer, et qu'un contrôle de périmètre sur une valeur absente ne contrôle rien — c'est exactement
la faute corrigée le même jour. Posé à l'écriture, dans `server/src/routes/achats.js`.

**3. `dossier_achat` et `bon_commande` entrent dans le cloisonnement tenu par la base.**

C'était la plus ouverte des trois, et celle qui demandait du code. Ces deux tables portent
l'engagement de la dépense publique et étaient les seules de la chaîne à rester hors de
`tables_cloisonnees` : leur isolation ne tenait qu'au code des routes. Deux oublis successifs, le
même jour, ont montré ce que cela coûte. Une règle qui ne tient qu'à la vigilance du code finit par
céder ; celle-ci descend dans la base, comme le veut l'ADR-001.

J'avais relevé l'objection moi-même : une ligne cloisonnée devient invisible, donc la route répond
« introuvable » au lieu du refus motivé « ce bon relève de l'ARMP, qui tient ses propres écritures ».
Un « introuvable » se lit comme une panne du logiciel. D'où la troisième voie, retenue :
`sigl_structure_rattachement()` rend **l'identifiant de structure et rien d'autre** — une donnée que
tout agent lit déjà dans l'organigramme — et la route conserve son 403 / RG-017 nommé.

Une difficulté réelle est apparue en cours de route, et elle valait la peine d'être tranchée plutôt
que contournée : appliquée telle quelle, la politique d'écriture aurait interdit au comptable public
de marquer payable un bon hors de sa portée propre, c'est-à-dire aurait rétabli le défaut d'origine.
`sigl_ecriture_chaine_achat()` ajoute donc le périmètre **intégré** du comptable public, et lui seul.
La justification n'est pas de commodité : marquer un bon payable est un acte de la chaîne de la
dépense de la Primature, dont il est le comptable, et non une écriture dans la comptabilité des
matières d'une personnalité juridique distincte — ce que RG-018 protège. La branche ajoutée exige
`regime = 'integre'`, donc **RG-018 tient entière**, chaîne d'achat comprise.

Quatre essais le prouvent en base, sous le rôle non privilégié, et non à travers les routes
(`perimetre-achats.test.js`, « La base tient le cloisonnement de la chaîne d'achat »). Le troisième
est le plus parlant : avant cette migration, le comptable public **pouvait** modifier en base le bon
de l'ARMP, et seule la route l'en empêchait. Migration
`supabase/migrations/20261127050000_cloisonner_chaine_achat.sql`. 147 essais, 147 passent.

Vérifié au navigateur : la logistique centrale voit ses douze dossiers avec leur état de besoin et
leur structure — « EB/2026/0015 · CAID » là où l'écran annonçait « Sans état de besoin rattaché ».

---

## 27 novembre 2026 — Le poste de commande taisait la consommation à ceux qui la règlent

**Le défaut, et sa famille.** `GET /api/tableau-de-bord` lisait la consommation constatée dans le
`journal` par une jointure placée dans sa propre requête. La politique `journal_lecture` de l'ADR-001
réserve le journal au mode consolidation : il ne porte pas de `structure_id`, il ne peut donc pas
être cloisonné par structure, et il est fermé plutôt qu'entrouvert. Jointe sous une transaction
métier ordinaire, la table ne rendait rien. Mesuré, pas supposé : **zéro ligne sous la transaction
d'un magasinier, deux cent quatre-vingt-une en consolidation.**

Conséquence : pour le magasinier et le comptable des matières — précisément ceux qui ouvrent ce
tableau pour savoir ce qui va manquer — les jours de couverture valaient toujours `null`, « rupture
sous 30 jours » valait toujours zéro, et la liste des articles à surveiller était toujours vide. Une
politique de sécurité correcte vidait une fonction métier de son contenu. Aucun essai ne le voyait,
parce que les essais interrogeaient le serveur avec les droits qu'il faut, ceux de la logistique, de
portée totale.

C'est le troisième défaut de cette famille sur ce chantier, après les bons de commande et l'écran des
seuils. La leçon est désormais une règle de travail : **pour chaque écran spécifié, se demander ce
que le rôle a le droit de lire pour faire ce qu'on lui demande.** Un flux silencieux ressemble à un
flux calme, et un zéro ressemble à un calme.

**Ce qui a été décidé.** La lecture nommée qui corrigeait déjà l'écran des stocks est remontée dans
`server/src/routes/_consommation.js`, et les deux appelants emploient la même — elle est consolidée
mais strictement bornée : l'action `sortie_stock`, l'objet `stock`, et seulement les articles que le
cloisonnement a déjà laissé passer en amont. Le journal dans son ensemble reste réservé au contrôle
externe par `GET /api/journal`. L'alternative — donner un `structure_id` au journal et le cloisonner
par la base — est plus propre sur le fond mais touche à la table d'audit elle-même, insérée par
toutes les routes : elle mérite son propre lot, pas un passage en force dans celui-ci.

**Et l'activité ne se tait plus.** Le même tableau comptait l'activité des derniers jours dans le
journal, donc rendait zéro à tout agent de portée propre. Elle rend maintenant
`disponible: false` avec son motif, plutôt qu'un zéro qui se lit comme un calme.

Essai qui mord : `server/src/routes/tableau-de-bord-couverture.test.js` — le même article, la même
consommation, lu par un magasinier et par la logistique : six jours de couverture des deux côtés.

**La suite d'essais était dépendante de l'ordre, et personne ne le savait.** `node --test` exécute
les fichiers en parallèle, autant que de processeurs. Or trois de ces fichiers écoutent le même canal
`sigl_flux` et comptent les événements d'alerte sur une base unique : lancés ensemble, ils se
polluent. Constaté ici — un essai de la chaîne d'alerte rouge en groupe, vert seul. Le vert de la
nuit dernière devait donc quelque chose à l'ordonnancement. `npm test` passe désormais
`--test-concurrency=1` : cinq secondes de plus, et un résultat reproductible. Corollaire pour la
méthode du chantier : **deux agents ne lancent jamais `npm test` en même temps sur la même base.**

---

## 27 novembre 2026 — L'inventaire physique et le rapprochement contradictoire

Le lot a été conduit par deux agents en parallèle, sur des périmètres de fichiers disjoints — la base
et le serveur d'un côté, les écrans de l'autre — contre un contrat écrit **avant** leur ouverture,
`docs/LOT-INVENTAIRE.md`. C'est la méthode du chantier, et c'est la troisième fois qu'elle tient :
les seules coutures à reprendre l'ont été par le chef de projet, et aucune ne venait d'un désaccord
sur la forme des données.

**147 essais au début de la session, 239 à la fin, aucun échec.**

### Ce que j'ai tranché seul, comme chef de projet

**Le contrat du lot a été écrit avant d'ouvrir les agents, pas pendant.** Les tables, leurs colonnes,
les cinq règles, les dix-sept routes et la forme exacte des réponses JSON y figuraient. Les deux
agents ont donc codé contre le même texte sans se parler. Ce qui a dû être repris après coup est
minime et tient en deux points : `avancement` est servi **à côté** de `campagne` et non dedans, et
`taux` est une proportion entre 0 et 1 — deux ambiguïtés de mon propre contrat, que l'agent
d'interface a trouvées en regardant l'écran plutôt qu'en supposant.

**Les écarts ne sont pas comptés « aucun » tant que la liste n'est pas servie.** Pendant la seconde
de chargement, la colonne des écarts non tranchés affichait « aucun » sur toutes les campagnes. Un
zéro inventé pendant une seconde se lit comme une campagne saine. C'est la faute que ce chantier a
déjà payée trois fois sous d'autres formes ; la colonne affiche un tiret tant qu'elle ne sait pas.

**L'issue #1 n'est pas rouverte.** Elle a été close le 27 novembre comme n'étant pas un canal : les
sept commentaires qui s'y trouvaient étaient tous de moi, postés faute d'autre identité, et trois
décisions de conception y ont attendu un arbitre qui ne pouvait pas répondre. Y écrire de nouveau un
compte rendu de session serait refaire exactement cette erreur. **Le registre des décisions est ce
journal**, et il le reste tant que personne d'autre n'a d'identité d'écriture sur ce dépôt.

### Le garde-fou de RG-020 ne gardait pas grand-chose

Les douze actions de l'inventaire et du rapprochement étaient journalisées par leurs routes, mais
n'étaient pas **déclarées** dans `ACTIONS_SENSIBLES`. La règle ne mordait donc pas sur elles : le
serveur avait le droit de les confirmer sans trace, et rien ne l'aurait dit.

Plutôt que d'ajouter les douze et de passer, j'ai écrit l'essai qui ferme la classe entière :
`rg-020.test.js` lit les sources des routes, en extrait chaque action journalisée et la confronte à
la liste déclarée, dans les deux sens. **Il a trouvé du premier coup quatre manques antérieurs à ce
lot** — la création d'un état de besoin, le réglage des seuils d'un article, la mise en liste noire
d'un fournisseur et le blocage d'un découpage d'achat (RG-008). La mise en liste noire d'un
fournisseur hors de toute garde de journalisation était la plus fâcheuse des quatre.

Il a trouvé aussi l'inverse : `immatriculation` était déclarée sensible et **aucune route ne l'a
jamais émise**. Le numéro est attribué dans `POST /api/biens` et figure dans les valeurs « après » de
`creation_bien` — il est donc tracé, et une seconde ligne de journal l'aurait redoublé. La
déclaration morte est retirée : elle donnait l'illusion d'une garde qui n'existait pas.

### Les décisions des agents que je fais miennes

Elles sont posées chacune à un seul endroit et se renversent à peu de frais.

1. **Le périmètre d'une campagne** est borné par la date arrêtée : les biens de la structure — et du
   site s'il est désigné —, non réformés, acquis au plus tard à cette date. Sans cette borne, le
   périmètre bougerait pendant la campagne et l'avancement ne voudrait rien dire (art. 120, « à dates
   fixes »). Les biens à l'état `perdu` y restent : c'est à l'inventaire de confirmer qu'ils sont
   toujours introuvables (RG-015).
2. **Une régularisation n'a pas inventé un type de mouvement.** Elle constate qu'un acte a eu lieu
   sans être inscrit, et c'est cet acte qu'elle inscrit : `entree`, `sortie`, `transfert`,
   `declassement` ou `retour_maintenance` selon ce qui diffère. Vérifié au navigateur puis en base :
   régulariser un écart de détenteur inscrit bien un `transfert` dont le motif nomme la campagne, et
   la fiche du bien suit le comptage. Une régularisation sur un écart `introuvable` est refusée : on
   ne régularise pas ce qu'on n'a pas vu.
3. **Les clés étrangères des tables filles sont composites** `(structure_id, id)` : un constat ne
   peut pas porter une structure différente de celle de sa campagne, même si une route se trompait.
   C'est l'ADR-001 appliqué au lot.
4. **`sigl_identite_agent()`**, fonction `security definer` bornée au nom, à la fonction et à
   l'activité. Elle a été nécessaire : le comptable général n'est pas un agent de la structure
   (art. 123, il est mis à disposition), donc la jointure de `rapprochement_partie` vers `agent`
   effaçait purement et simplement la ligne de la partie. C'est le piège de la migration 040000 pris
   par l'autre bout — là un `null` valait autorisation, ici une jointure interne valait effacement.
5. **L'écriture passe par `sigl_ecriture_permise`**, non par `sigl_ecriture_chaine_achat` :
   l'inventaire n'est pas de la dépense, le comptable public le contrôle sans le tenir.
6. **Trois exigences ajoutées au contrat** : une campagne ne s'ouvre pas sans au moins un agent
   désigné (art. 122 — sans opérateur ni détenteur, l'inventaire n'a personne) ; sa clôture émet un
   `etat_inventaire` figé ; le motif est obligatoire pour les trois décisions, pas seulement pour le
   maintien.

### Ce qui est vérifié, et ce qui ne l'est pas

Vérifié au navigateur, en clair et en sombre : les trois écrans, et **l'arbitrage d'un écart mené de
bout en bout** — dialogue, décision, motif, puis contrôle en base que la fiche du bien a suivi, que
le mouvement est inscrit avec son motif, et que le journal porte l'avant et l'après.

Pas vérifié à l'écran : la clôture d'une campagne (le jeu de démonstration laisse dix-neuf biens à
constater, et c'est volontaire), et le circuit complet du rapprochement. Les routes en sont
éprouvées par les essais, l'écran ne l'est pas.

Deux limites connues, dites franchement : `mouvement.agent_id` reste nul quand un agent du niveau
central arbitre un écart d'une structure intégrée, parce que la clé étrangère est composite — le
journal, lui, nomme toujours l'auteur ; et aucune campagne n'existe dans un établissement autonome,
donc les écrans d'un comptable de l'ARMP sont vides sur ce lot.
