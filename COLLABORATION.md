# Comment on travaille à deux

Deux assistants travaillent sur ce dépôt, pour **Braintis Technology**, sur le SIGL de la Primature
de la République démocratique du Congo.

**ChatGPT structure. Claude code.** Ce partage n'est pas arbitraire : ChatGPT ne peut ni exécuter, ni
tester, ni ouvrir un navigateur. Il conçoit et spécifie. Claude implémente, lance les tests et
vérifie que ça tourne vraiment.

---

## Qui écrit où

La règle tient en une ligne : **on ne touche jamais au dossier de l'autre.** C'est ce qui évite les
conflits, pas la bonne volonté.

| Dossier | Propriétaire | Contenu |
|---|---|---|
| `docs/` | **ChatGPT** | Conception, spécifications, règles de gestion, modèle de données, parcours |
| `docs/adr/` | **ChatGPT** | Décisions d'architecture. Claude peut en proposer une, ChatGPT tranche |
| `server/` | **Claude** | Routes, règles implémentées, tests |
| `web/` | **Claude** | Interface, composants, écrans |
| `supabase/` | **Claude** | Migrations, politiques de sécurité, temps réel |
| `README.md`, `COLLABORATION.md` | **Claude** | État réel du projet et mode d'emploi |

Deux exceptions, et elles sont nommées pour qu'il n'y ait pas de doute :

- **`docs/CONTRAT-TECHNIQUE.md`** est le point de rencontre. ChatGPT le fait évoluer ; Claude le lit
  avant d'écrire une ligne et signale par une *issue* ce qui ne tient pas à l'implémentation.
- **`docs/JOURNAL-DU-CHANTIER.md`** s'écrit à deux, par ajout en fin de fichier, jamais par
  réécriture de ce qui précède.

---

## Comment on se passe le travail

**De ChatGPT vers Claude.** Une spécification devient implémentable quand elle est numérotée. Pas
« le chef de structure vise la demande » mais :

> **RG-002** — Un chef de structure ne peut pas viser un état de besoin dont il est le demandeur.
> Fondement : séparation des fonctions. Contrôle : serveur.

Claude implémente `RG-002`, écrit `rg-002.test.js`, et le numéro fait le lien. Une règle sans numéro
ne se trace pas ; une règle sans test n'est pas livrée.

Ce qui rend une spécification exploitable : des **machines à états** complètes, avec les transitions
interdites et leur raison ; un **modèle de données** avec les types et les contraintes ; une
**matrice de droits** exhaustive ; et pour chaque champ, d'où il vient — un article de loi, un
paragraphe de norme, ou une décision assumée.

**De Claude vers ChatGPT.** Quand l'implémentation révèle que la spécification ne tient pas — un cas
oublié, deux règles qui se contredisent, une contrainte technique qui change la donne — Claude ouvre
une *issue* avec le constat et ce qu'il propose. Il n'arbitre pas seul une question de conception.

**Les deux signalent ce qu'ils ne savent pas.** Vingt et une hypothèses sont marquées dans
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
  comptable public détient ses écritures.
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

**Le dépôt est public** depuis le 27 novembre 2026, pour que les deux assistants puissent le lire
sans intermédiaire. Cela a une conséquence : tout ce qui est commité est lisible par n'importe qui.

Donc, sans exception : aucun secret, aucune clé, aucune donnée réelle de la Primature. Le jeu de
démonstration est fictif, `.env` est ignoré par git et `.env.example` ne porte que des noms de
variables. Avant d'ajouter un fichier, se demander s'il peut être lu par un tiers — et dans le doute,
ne pas l'ajouter.
