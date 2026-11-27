# Comment on travaille sur ce dépôt

Ce dépôt porte le SIGL de la Primature de la République démocratique du Congo, pour
**Braintis Technology**.

## Ce qui était prévu, et ce qui s'est passé

Il était prévu que deux assistants travaillent ici : **ChatGPT structure, Claude code**. Le partage
n'était pas arbitraire — ChatGPT ne peut ni exécuter, ni tester, ni ouvrir un navigateur ; il conçoit
et spécifie, l'autre implémente et vérifie que ça tourne vraiment.

**Cela n'a pas eu lieu, et il faut le dire ici plutôt que de laisser le document le démentir.** Au
27 novembre 2026, ChatGPT n'a rien écrit sur ce dépôt : les commentaires de l'issue #1 sont de
Claude, postés sous le compte du client faute d'autre identité ; dix-sept commits sur dix-huit sont
de Claude ; aucune branche, aucune *pull request*, aucune issue d'un autre auteur.

La raison est structurelle, et non un manque de bonne volonté : ChatGPT n'a pas d'identifiants
GitHub sur ce dépôt. Il peut le **lire** depuis qu'il est public, mais il ne peut rien y écrire, et
il ne se réveille que lorsqu'on lui parle. Un dépôt n'est pas un canal entre deux assistants : c'est
une boîte aux lettres dont l'un n'a pas la clef d'écriture, et que seul le client peut relever.

**Conséquence, et elle a coûté quelque chose.** Des décisions de conception ont été laissées « à
trancher par ChatGPT » et tenues pour déléguées, alors qu'elles étaient simplement en attente,
pendant que le code avançait en les supposant résolues. Le 27 novembre 2026, le client a tranché :
décider seul. Les trois décisions concernées sont consignées et assumées dans
`docs/JOURNAL-DU-CHANTIER.md`.

**Donc, en l'état : un seul assistant tient les deux rôles.** Si ChatGPT reprend le travail, ce
document redevient le partage décrit plus bas — mais il faudra d'abord régler l'écriture : soit le
client porte les messages dans les deux sens, soit ChatGPT reçoit une identité GitHub propre. Tant
que ni l'un ni l'autre n'est fait, **aucune décision ne doit être laissée en attente d'un arbitre
absent** : on tranche, on inscrit la raison, et on note où le choix est posé pour qu'il puisse être
renversé à peu de frais.

---

## Qui écrit où

Si les deux rôles reviennent, la règle tient en une ligne : **on ne touche jamais au dossier de
l'autre.** C'est ce qui évite les conflits, pas la bonne volonté.

| Dossier | Propriétaire | Contenu |
|---|---|---|
| `docs/` | **Conception** | Conception, spécifications, règles de gestion, modèle de données, parcours |
| `docs/adr/` | **Conception** | Décisions d'architecture |
| `server/` | **Code** | Routes, règles implémentées, tests |
| `web/` | **Code** | Interface, composants, écrans |
| `supabase/` | **Code** | Migrations, politiques de sécurité, temps réel |
| `README.md`, `COLLABORATION.md` | **Code** | État réel du projet et mode d'emploi |

Deux exceptions, nommées pour qu'il n'y ait pas de doute :

- **`docs/CONTRAT-TECHNIQUE.md`** est le point de rencontre. La conception le fait évoluer ; le code
  le lit avant d'écrire une ligne et signale par une *issue* ce qui ne tient pas à l'implémentation.
- **`docs/JOURNAL-DU-CHANTIER.md`** s'écrit par ajout en fin de fichier, jamais par réécriture de ce
  qui précède.

Tant qu'un seul assistant tient les deux rôles, il écrit partout — mais il garde la séparation des
genres : une décision de conception se consigne dans `docs/`, jamais seulement dans un commentaire
de code.

---

## Comment une spécification devient du code

Une spécification est implémentable quand elle est **numérotée**. Pas « le chef de structure vise la
demande » mais :

> **RG-002** — Un chef de structure ne peut pas viser un état de besoin dont il est le demandeur.
> Fondement : séparation des fonctions. Contrôle : serveur.

`RG-002` s'implémente, `rg-002.test.js` l'éprouve, et le numéro fait le lien. Une règle sans numéro
ne se trace pas ; une règle sans test n'est pas livrée.

Ce qui rend une spécification exploitable : des **machines à états** complètes, avec les transitions
interdites et leur raison ; un **modèle de données** avec les types et les contraintes ; une
**matrice de droits** exhaustive ; et pour chaque champ, d'où il vient — un article de loi, un
paragraphe de norme, ou une décision assumée.

Quand l'implémentation révèle que la spécification ne tient pas — un cas oublié, deux règles qui se
contredisent, une contrainte technique qui change la donne — on ouvre une *issue* avec le constat et
ce qu'on propose. Et on n'oublie pas qu'une issue sans lecteur n'est pas un arbitrage : si personne
ne répond, on tranche et on l'écrit.

**On signale ce qu'on ne sait pas.** Vingt et une hypothèses sont marquées dans
`docs/CONCEPTION.md` : ce sont des faits sur le fonctionnement réel de la Primature que personne n'a
vérifiés. Quand une conception en dépend, on le dit à cet endroit précis plutôt que de trancher en
silence.

---

## À lire avant d'écrire quoi que ce soit

Dans cet ordre. Ce dépôt n'est pas vide : il porte déjà une recherche documentaire, un cadre
juridique dépouillé article par article, et du code qui tourne.

1. **`README.md`** — ce qu'est le projet, comment il démarre, comment il se déploie
2. **`docs/CONTRAT-TECHNIQUE.md`** — la pile, le modèle de données, les 22 règles, les rôles, les
   routes, la direction artistique
3. **`docs/CONCEPTION.md`** — la conception fonctionnelle, et les hypothèses non vérifiées
4. **`docs/CADRE-PRIMATURE.md`** — l'organisation de la Primature et le droit, article par article
5. **`docs/adr/`** — les décisions d'architecture déjà prises
6. **`docs/JOURNAL-DU-CHANTIER.md`** — ce qui a été décidé seul, et pourquoi

---

## Ce qui ne se discute pas

Ces règles viennent du droit congolais ou du client. Elles ne se renégocient pas en cours de route.

- **Toute règle de gestion est contrôlée côté serveur** et porte son test. Jamais seulement dans
  l'interface.
- **`npm test` passe**, et le nombre de tests ne baisse jamais.
- **L'isolation entre structures est tenue par la base**, par la sécurité au niveau des lignes, pas
  par le code. Une structure de régime `autonome` n'est jamais écrite par le niveau central — son
  comptable public détient ses écritures. Un contrôle de périmètre ne se lit jamais au bout d'une
  jointure externe vers une table cloisonnée : la base a le droit de rendre `null`, et un `null` ne
  se distingue pas d'une absence de cloisonnement.
- **Les seuils de passation sont des paramètres horodatés**, jamais des constantes. Une décision
  prise hier reste jugeable avec les seuils d'hier.
- **Toute action sensible est journalisée**, et le journal n'est modifiable par personne,
  administrateur compris.
- **L'IA alerte, un humain décide.** Aucune décision automatique, nulle part.
- **Tout en français** : interface, messages d'erreur, documents générés, commits.
- **Aucun chiffrage, aucun budget**, nulle part. Consigne du client.
- **Aucune donnée réelle de l'institution** dans le dépôt. Le jeu de démonstration est fictif.
- **Aucun secret** dans le dépôt. `.env` est ignoré, `.env.example` sert de modèle.
- **L'identité visuelle est celle de l'État**, pas celle du prestataire : charte graphique du
  Gouvernement de la RDC, février 2022.

---

## Le vocabulaire

Les actes et les documents sont nommés par le droit. On emploie la colonne de droite, partout, y
compris dans le code et les noms de tables.

| Ne pas dire | Dire |
|---|---|
| Gestion de stock | Comptabilité des matières |
| Entrée en stock | Prise en charge à l'inventaire |
| Numéro d'inventaire | Immatriculation |
| Fiche article | Fiche de gestion des stocks |
| Mise au rebut | Cession, mise au rebut, réforme, déclassement |
| Validation | Certification, imputation, visa — selon l'acteur |

---

## L'accès

**Le dépôt est public** depuis le 27 novembre 2026. Cela a une conséquence : tout ce qui est commité
est lisible par n'importe qui, définitivement.

Donc, sans exception : aucun secret, aucune clé, aucune donnée réelle de la Primature. Le jeu de
démonstration est fictif, `.env` est ignoré par git et `.env.example` ne porte que des noms de
variables. Avant d'ajouter un fichier, se demander s'il peut être lu par un tiers — et dans le doute,
ne pas l'ajouter.
