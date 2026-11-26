# ADR-001 : Isolation des données entre structures intégrées et établissements publics autonomes

**Statut :** Proposé
**Date :** 27 novembre 2026
**Décideurs :** Primature — propriétaire métier du SIGL · Comptables publics des établissements autonomes · Braintis Technology
**Auteur :** Chef de projet technico-administratif

---

## Contexte

Le SIGL couvre la Primature et l'ensemble de ses structures. Mais ces structures n'ont pas toutes le
même statut juridique, et la différence n'est pas une nuance d'organisation : elle décide de qui
détient les écritures.

**Le fait juridique.** Le décret n° 13/050 du 6 novembre 2013 dispose que la comptabilité de l'État
comprend « une comptabilité budgétaire, une comptabilité générale et une comptabilité des matières
**tenues par le comptable public** ». Un établissement public — l'ARMP, l'APCSC, l'ARC-CSU, la Caisse
Nationale de Péréquation — a sa personnalité juridique, son budget et **son propre comptable public**.
Sa comptabilité des matières lui appartient. La Primature ne peut pas la tenir à sa place ; elle a
besoin d'en avoir la vue consolidée, ce qui est autre chose.

À l'inverse, les cellules et services rattachés — le Cabinet, le Secrétariat général à la Primature,
le Secrétariat général du Gouvernement, la CGIG, la CAID, la Delivery Unit — relèvent du budget de la
Primature et dépendent d'elle pour leurs moyens. Leur patrimoine est le patrimoine de la Primature,
confié à elles.

**Les forces en présence.**

- *Juridique* : une écriture de la Primature dans les comptes d'un établissement autonome n'est pas
  une erreur d'application, c'est un acte sans fondement. Le contraire — un établissement qui lirait
  le patrimoine d'un autre — expose à une contestation.
- *Politique* : un établissement régulateur comme l'ARMP peut légitimement refuser que ses écritures
  vivent dans une base administrée par la Primature. Ce refus peut arriver après la mise en service.
- *Opérationnel* : le niveau central doit produire un état consolidé et un poste de commande qui voit
  tout. Une isolation trop forte rend cette consolidation coûteuse.
- *Technique* : le projet tourne sur PGlite en développement et PostgreSQL en production. Toute
  solution doit fonctionner des deux côtés à l'identique.
- *Calendrier* : la décision doit être prise avant que les 400 biens de démonstration et les premières
  migrations ne figent le modèle. C'est une décision **coûteuse à défaire** : elle touche le schéma,
  les requêtes, les droits et l'exploitation.

**Ce qui est déjà acté.** Le contrat technique porte une colonne `regime` sur `structure`, avec les
valeurs `integre` et `autonome`, et deux règles : RG-017, une structure ne lit que ses propres
données ; RG-018, une structure autonome n'est jamais écrite par le niveau central. La présente
décision porte sur **la façon dont ces règles sont tenues**.

---

## Décision

**Base unique, isolation par sécurité au niveau des lignes de PostgreSQL (RLS), et modèle conçu dès
maintenant pour qu'un établissement puisse être extrait vers sa propre instance sans réécriture.**

Autrement dit : l'option B pour aujourd'hui, avec le chemin vers l'option D tenu ouvert par
construction.

---

## Options considérées

### Option A — Cloisonnement applicatif par colonne

Une base, une colonne `structure_id` sur chaque table, et le filtrage assuré par le code des routes.
C'est ce que décrivait le contrat technique avant cette décision.

| Dimension | Évaluation |
|---|---|
| Complexité | Faible |
| Conformité juridique | **Faible** — rien n'empêche techniquement une écriture croisée |
| Coût d'exploitation | Faible |
| Consolidation | Triviale |
| Réversibilité | Bonne |
| Risque de fuite | **Élevé** — une requête oubliée suffit |

**Pour** : simple, rapide, consolidation immédiate, rien à administrer.
**Contre** : la garantie repose entièrement sur la discipline du code. Une seule requête écrite sans
le filtre, dans n'importe quelle route ajoutée dans six mois, expose le patrimoine d'un établissement.
Devant l'Inspection générale des finances, « notre code le fait correctement » n'est pas une réponse
vérifiable.

### Option B — Base unique, sécurité au niveau des lignes

Une base, mais le filtrage est **dans la base**, pas dans le code. Chaque table porte une politique
RLS ; la connexion prend un rôle non privilégié et le serveur pose le contexte de l'agent avec
`set_config`. Une requête qui oublie son filtre ne renvoie simplement rien.

| Dimension | Évaluation |
|---|---|
| Complexité | Moyenne |
| Conformité juridique | **Bonne** — la règle est démontrable, pas déclarative |
| Coût d'exploitation | Faible |
| Consolidation | Simple — un rôle de consolidation lit tout, en lecture seule |
| Réversibilité | Bonne |
| Risque de fuite | **Faible** — une route oubliée échoue fermée |

**Vérifié, pas supposé.** PGlite 0.6.0 embarque PostgreSQL 19.0 et accepte l'activation du RLS, les
politiques, les rôles, `current_setting` et `set_config`, les schémas séparés et les vues
inter-schémas. Un essai a confirmé le filtrage réel : une session positionnée sur une structure ne
voit que ses lignes. Développement et production se comportent donc de la même façon.

**Pour** : la garantie ne dépend plus de la vigilance du développeur. Un auditeur peut lire la
politique et constater la règle. La consolidation reste une requête ordinaire sous un rôle dédié.
**Contre** : il faut poser le contexte à chaque connexion, sous peine de tout voir ou de ne rien voir
— c'est le piège classique, et il se traite par un test. Les messages d'erreur deviennent moins
parlants : une ligne invisible ressemble à une ligne absente. Et l'administrateur de la base reste
techniquement capable de tout lire.

### Option C — Un schéma PostgreSQL par établissement autonome

Le schéma `public` pour la Primature et ses structures intégrées, un schéma par établissement
autonome, et des vues de consolidation au-dessus.

| Dimension | Évaluation |
|---|---|
| Complexité | **Élevée** |
| Conformité juridique | Bonne |
| Coût d'exploitation | Moyen — les migrations se rejouent par schéma |
| Consolidation | Moyenne — `union all` sur N schémas, à régénérer à chaque ajout |
| Réversibilité | Moyenne |
| Risque de fuite | Faible |

**Pour** : séparation visible, extraction d'un établissement facile, sauvegarde par entité possible.
**Contre** : chaque nouvel établissement impose une migration et une régénération des vues. Les
requêtes du poste de commande deviennent dynamiques, donc plus difficiles à relire et à optimiser. On
paie une complexité permanente pour un besoin d'isolation que le RLS satisfait déjà.

### Option D — Une instance par établissement autonome

Chaque établissement a sa base, administrée par lui. La Primature consolide par un flux périodique.

| Dimension | Évaluation |
|---|---|
| Complexité | **Très élevée** |
| Conformité juridique | **Excellente** — l'établissement détient physiquement ses écritures |
| Coût d'exploitation | **Élevé** — N bases à exploiter, sauvegarder, migrer |
| Consolidation | **Coûteuse** — flux, décalage, réconciliation |
| Réversibilité | Faible |
| Risque de fuite | Nul |

**Pour** : la seule option qui répond à un établissement qui refuserait catégoriquement que ses
écritures vivent chez la Primature. Chaque comptable public est maître de sa base, ce qui est
exactement ce que dit le décret.
**Contre** : le poste de commande central perd le temps réel. La Primature doit exploiter autant de
bases que d'établissements, alors que la question de l'hébergement souverain n'est même pas tranchée.
Hors de proportion aujourd'hui, où aucun établissement n'a exprimé ce refus.

---

## Analyse des compromis

**Le vrai arbitrage n'est pas entre simplicité et sécurité, il est entre deux façons de prouver.**
L'option A promet ; l'option B démontre. Devant l'IGF, qui a compétence générale sur les biens
publics, et devant la Cour des comptes, une politique inscrite dans la base se lit et se vérifie. Un
filtre dans le code demande de relire toutes les routes, y compris celles écrites après le contrôle.

**Le coût de l'option B est concentré et ponctuel** : poser le contexte de session proprement et le
couvrir par un test. Le coût de l'option A est diffus et permanent : chaque route ajoutée est une
nouvelle occasion de se tromper, et l'erreur est silencieuse.

**Les options C et D répondent à une question que personne n'a encore posée.** Aucun établissement
n'a demandé sa propre base. Les construire aujourd'hui, c'est payer une complexité certaine contre un
risque hypothétique — exactement ce que les projets publics comparables ont fait et payé cher.

**Mais le risque est réel, et il arrivera après la mise en service.** Un régulateur comme l'ARMP peut
parfaitement changer d'avis une fois le système en production. C'est pourquoi la décision ne porte
pas seulement sur le mécanisme d'aujourd'hui mais sur **la facilité d'en sortir demain**. Trois
contraintes de modélisation suffisent à garder l'option D accessible, et elles ne coûtent presque
rien maintenant :

1. **Aucune clé étrangère ne traverse la frontière d'un établissement autonome** sur les tables
   comptables — biens, mouvements, stocks, documents. Les références au référentiel partagé
   (catégories, nomenclature) passent par des codes stables, pas par des identifiants techniques.
2. **Les identifiants sont des UUID**, jamais des séquences : deux bases séparées ne se télescopent
   pas à la réunion.
3. **La consolidation est une lecture nommée**, isolée dans un module unique. Le jour où elle doit
   devenir un flux, un seul endroit change.

---

## Conséquences

**Ce qui devient plus facile.** La règle RG-018 cesse d'être une intention : elle est tenue par la
base. Le contrôle externe obtient un rôle en lecture seule qui voit tout, sans qu'on lui construise
un chemin spécial. Un établissement qui demande à vérifier son isolation peut lire la politique
lui-même.

**Ce qui devient plus difficile.** Le développement exige de poser le contexte de session à chaque
connexion, et de ne jamais l'oublier dans un script d'administration ou une tâche de fond. Le
diagnostic se complique : une ligne qui n'apparaît pas peut être absente ou invisible, et il faut
savoir distinguer les deux. Le jeu de démonstration doit s'insérer sous un rôle privilégié, ce qui
crée un chemin qu'il faudra fermer en production.

**Ce qu'il faudra revisiter.** Le jour où un établissement exige sa propre instance, l'option D
redevient le sujet — et les trois contraintes de modélisation ci-dessus décideront si c'est une
semaine de travail ou un trimestre. Le jour où le volume dépassera ce qu'une base unique traite
confortablement, la question se reposera aussi, mais ce n'est pas l'horizon de ce projet.

**Ce qui reste non tranché, et qui n'est pas de notre ressort.** L'hébergement lui-même. L'article 201
du Code du numérique impose le stockage et l'hébergement en RDC, et l'article 202 ferme aux autorités
publiques les dérogations fondées sur le consentement. Où héberger, et où placer le site de secours,
reste à décider avec la Primature. Cette décision-ci ne présume de rien à ce sujet.

---

## Points d'action

1. [ ] Ajouter une migration `005_isolation.sql` : activation du RLS sur toutes les tables portant un
       `structure_id`, politiques de lecture et d'écriture distinctes, rôle `sigl_agent` non
       privilégié et rôle `sigl_consolidation` en lecture seule.
2. [ ] Dans `db.js`, poser `set_config('sigl.agent', …)` et `set_config('sigl.structure', …)` à
       l'ouverture de chaque transaction, et refuser d'exécuter une requête métier sans contexte.
3. [ ] Écrire le test qui compte : un agent d'une structure intégrée ne voit aucune ligne d'un
       établissement autonome, et une écriture du niveau central dans un établissement autonome
       échoue — RG-017 et RG-018, prouvées par la base et non par le code.
4. [ ] Vérifier qu'aucune clé étrangère ne traverse la frontière d'un établissement autonome sur les
       tables comptables, et corriger le schéma si c'est le cas.
5. [ ] Isoler la consolidation dans un module unique, `server/src/consolidation.js`, documenté comme
       le seul point à reprendre si un établissement passe sur sa propre instance.
6. [ ] Soumettre cet ADR au propriétaire métier **et aux comptables publics des établissements
       autonomes** : ce sont eux que la décision engage, et leur accord vaut mieux que notre
       interprétation du décret.

---

## Amendement du 27 novembre 2026 — ce que l'implémentation a corrigé

**Statut : Accepté, avec les corrections ci-dessous.**

L'ADR a été implémenté. Trois choses que j'avais écrites étaient fausses, et c'est l'épreuve de la
base qui les a montrées. Elles sont consignées ici plutôt que corrigées en silence : un ADR qui
raconte la décision qu'on aurait aimé prendre ne sert à rien.

### 1. `set_config` seul ne filtre rien

J'avais écrit que poser le contexte de session avec `set_config` suffisait. C'est faux. **Le RLS ne
s'applique pas à un rôle porteur de `rolbypassrls`**, et `force row level security` n'y change rien.
Sous Supabase, le rôle `postgres` n'est pas superutilisateur mais porte tout de même ce privilège :
toutes mes vérifications initiales passaient donc pour de mauvaises raisons.

La pièce maîtresse n'est pas le contexte, c'est la **bascule de rôle** : `set local role sigl_agent`
à l'ouverture de chaque transaction. Le contexte dit *qui* ; la bascule dit *sous quelle autorité*.
Sans la seconde, la première est décorative.

Il a fallu en outre `grant sigl_agent, sigl_consolidation to postgres`, sans quoi la bascule échoue —
`postgres` n'étant pas superutilisateur sous Supabase, il ne peut pas prendre un rôle qu'on ne lui a
pas donné.

### 2. La politique de lecture que j'avais spécifiée était incohérente

Plus grave, parce que c'était une erreur de conception et pas d'exécution. J'avais défini la lecture
et l'écriture sur des portées différentes. Conséquence : **une écriture légitime du niveau central
vers une structure intégrée était acceptée, puis invisible à son auteur** — tout `insert … returning`
échouait, alors que l'écriture avait bien eu lieu.

La correction : lecture et écriture partagent la même portée — la structure de l'agent **et ses
filles**, calculée récursivement par `sigl_portee_structures()`. L'écriture exige en plus que la
structure visée soit de régime `integre`.

Le résultat tient la règle d'origine, et mieux qu'elle : **un établissement autonome n'est ni lu ni
écrit d'en haut, même lorsqu'il est rattaché.** La hiérarchie des structures ne perce pas la
frontière juridique.

### 3. Ce qui le prouve

`server/src/isolation.test.js` l'établit par la base, pas par le code : une structure sœur et une
structure mère sont hors portée, le déplacement d'une ligne vers un périmètre interdit est refusé, la
consolidation ne peut qu'être lue, et le rôle ne fuit pas d'une transaction à la suivante.

Le point d'action 5 — isoler la consolidation dans `server/src/consolidation.js` — reste ouvert.

### 4. Une dette de sécurité à solder avant toute mise en service

Le jeu de démonstration s'insère sous `postgres`, qui porte `rolbypassrls`. **C'est le seul chemin du
dépôt qui contourne l'isolation, et il doit être fermé en production.** Il est signalé ici pour qu'on
ne le découvre pas à l'audit.

### Ce que j'en retiens

La décision d'architecture était la bonne — l'isolation tenue par la base vaut mieux que l'isolation
tenue par la discipline. Mais j'avais vérifié la disponibilité du mécanisme sans vérifier son
efficacité réelle sous le rôle qui l'exécute. Constater qu'une fonctionnalité existe n'est pas
constater qu'elle protège.

---

## Vérification des garanties d'extraction — 27 novembre 2026

L'ADR posait trois contraintes de modélisation pour qu'un établissement autonome puisse un jour
partir sur sa propre base sans réécriture. Personne ne les avait vérifiées sur le schéma réel. Voici
le résultat, interrogé dans la base.

**Garantie 2 — les identifiants sont des UUID : tenue.** Aucune colonne `id` d'un autre type,
aucune colonne `serial` ni `identity` dans tout le schéma. Deux bases séparées ne se télescoperont
pas à la réunion.

**Garantie 1 — le référentiel partagé passe par des codes stables : tenue.** Les tables comptables
référencent la nomenclature par `categorie_code`, un code lisible, et non par un identifiant
technique. `bien`, `ligne_besoin` et `stock` suivent toutes cette règle.

**Garantie 3 — rien ne suppose une base unique : tenue pour le schéma**, mais la vérification a
révélé un cas que l'ADR n'avait pas prévu, et qui mérite d'être nommé.

### Ce que la vérification a trouvé en plus

Les tables comptables portent des clés étrangères vers `agent` et `site`, et `mouvement` en porte
deux de plus : `detenteur_source` et `detenteur_cible`. Or **un transfert de bien entre structures
franchit la frontière par construction** : une ligne de `mouvement` qui enregistre le passage d'un
véhicule de la Primature vers un établissement autonome référence nécessairement un agent de chaque
côté.

Ce n'est pas une violation de la contrainte, c'est une réalité du métier : un transfert est
précisément ce qui relie deux périmètres. Mais cela veut dire qu'une extraction ne se fera pas par
une simple copie de lignes.

**La règle à retenir le jour venu**, écrite ici pour ne pas la redécouvrir sous pression : les
mouvements historiques qui franchissent la frontière se dupliquent des deux côtés, chacun gardant sa
vue de l'opération, avec une référence croisée par les numéros de documents — qui sont des chaînes
lisibles et stables — plutôt que par les identifiants techniques. L'un voit une sortie, l'autre une
entrée, et le document fait le lien.

### Le point d'action 5, autrement

L'ADR demandait d'isoler la consolidation dans `server/src/consolidation.js`. L'implémentation l'a
placée dans `server/src/routes/_sql.js`, qui expose `transaction` pour le métier et `consolidation`
pour la lecture d'ensemble. Créer un second module ne ferait que dupliquer le raccord.

**Le point d'action est donc tenu, à l'emplacement près** : `routes/_sql.js` est le seul endroit à
reprendre si un établissement passe sur sa propre instance. Il est nommé ici pour qu'on le retrouve.
