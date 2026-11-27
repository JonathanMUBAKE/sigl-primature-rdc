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
