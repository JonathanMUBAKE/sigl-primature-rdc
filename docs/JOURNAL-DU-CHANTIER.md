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
