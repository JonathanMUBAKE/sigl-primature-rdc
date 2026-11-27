# Lot « reprise des inventaires existants »

Contrat gelé le 27 novembre 2026, avant la première ligne de code, comme les lots inventaire et
réforme. Il dit ce que le lot fait, ce qu'il refuse de faire, et sur quoi reposent les décisions
prises à l'intérieur.

Fondement du lot : `RESULTAT-A-ATTEINDRE.md`, §7.1 — « un système de patrimoine qui démarre vide ne
sert à personne : les agents retournent à leurs classeurs, et l'outil meurt en trois semaines ».

---

## Pourquoi ce lot passe avant les autres

La Primature possède déjà ses inventaires : sur papier, en tableur, dans des registres tenus à la
main. Le SIGL n'arrive pas dans un vide — il arrive après eux, et c'est à lui de reprendre leur
contenu, pas aux agents de le retaper.

Trois conséquences, qui commandent tout ce qui suit.

**Un rejet muet est pire qu'un rejet.** Un import qui annonce « 412 lignes sur 1 500 importées » sans
dire lesquelles ni pourquoi oblige l'agent à comparer deux listes à la main. Il abandonne, et c'est
l'outil qu'il abandonne. Chaque ligne écartée nomme donc **sa colonne et son motif**.

**La reprise se rejoue.** Un premier dépôt corrige un fichier, un deuxième le complète, un troisième
arrive six mois plus tard avec un nouveau bâtiment. Aucun de ces dépôts n'écrase ce qui est déjà
saisi : ce qui existe est reconnu et écarté, jamais remplacé.

**Les numéros d'inventaire existants sont conservés.** C'est le point qui décide de l'adoption : si
le SIGL renumérote, le registre à l'écran ne correspond plus aux étiquettes collées sur les armoires,
et plus personne ne s'y retrouve. Une immatriculation portée par le fichier est reprise telle quelle.
Le SIGL n'en génère une que pour un bien qui n'en avait pas.

---

## Les deux temps, et pourquoi il y en a deux

**Temps 1 — le dépôt analyse, et n'écrit rien au registre.** Le fichier est reçu, lu, chaque ligne
est confrontée à la nomenclature, au périmètre et au registre existant. Le résultat est un rapport
ligne par ligne. **Aucun bien n'est créé.**

**Temps 2 — l'application écrit, et seulement sur décision d'un humain.** L'agent lit le rapport,
voit ce qui passe, ce qui est déjà là, ce qui est refusé et pourquoi. Il corrige son fichier et
redépose, ou il applique.

Ce découpage n'est pas une commodité d'interface : c'est la règle du projet — l'IA propose, un humain
décide — appliquée à la seule opération du SIGL qui crée des milliers de lignes d'un coup. Une
reprise appliquée directement au dépôt serait la seule action du logiciel qu'on ne pourrait ni
relire ni refuser avant qu'elle ait lieu.

---

## Le format déposé

Un fichier texte à séparateur point-virgule, encodé en UTF-8, avec une ligne d'en-tête nommant les
colonnes. Le point-virgule est le séparateur qu'Excel francophone écrit par défaut : exiger la
virgule serait exiger une manipulation que personne ne fera correctement.

L'ordre des colonnes est libre. Une colonne inconnue fait **refuser le fichier entier**, en la
nommant — une colonne mal orthographiée est une colonne perdue en silence, et perdre une donnée sans
le dire est le défaut que ce lot existe pour éviter.

| Colonne | Obligatoire | Contenu |
|---|---|---|
| `designation` | oui | Le libellé du bien, tel que l'inventaire existant le porte |
| `categorie` | oui | Un code de la nomenclature (`categorie.code`) |
| `date_acquisition` | oui | `AAAA-MM-JJ`, ou `JJ/MM/AAAA` |
| `immatriculation` | non | Le numéro d'inventaire existant. Repris tel quel |
| `marque`, `modele`, `numero_serie` | non | — |
| `etat` | non | `neuf`, `bon`, `a_reparer`, `hors_service`. Par défaut `bon` |
| `valeur_acquisition` | non | Voir la décision ci-dessous |
| `site` | non | Le **nom** du site, dans la structure de la reprise |
| `detenteur_email` | non | L'adresse de l'agent détenteur, dans la structure de la reprise |
| `suivi` | non | `individuel` (défaut) ou `lot` |
| `quantite` | non | Pour un lot. Par défaut 1 |

---

## Les règles de gestion à écrire

| N° | Règle | Fondement | Contrôle |
|---|---|---|---|
| **RG-034** | Une reprise ne crée aucun bien avant qu'un agent habilité l'ait appliquée. Le dépôt analyse et propose; l'application écrit. | Décision assumée : l'IA propose, un humain décide. | Serveur |
| **RG-035** | Une ligne dont l'identité est déjà au registre est écartée comme doublon, jamais écrasée. L'identité est l'immatriculation portée par le fichier, à défaut le numéro de série. | Décision assumée : une reprise rejouable ne détruit rien (§7.1). | Serveur |
| **RG-036** | Une reprise ne s'applique qu'une fois. | Décision assumée : deux applications doubleraient le patrimoine. | Serveur et base |
| **RG-037** | Une reprise ne crée de biens que dans la structure à laquelle elle est rattachée. | ADR-001, et RG-018 : un établissement autonome n'est jamais écrit d'en haut. | Serveur et base |

---

## Ce qui a été tranché, et par qui

Décisions prises par Claude le 27 novembre 2026, sur mandat de Jonathan MUBAKE — « décide seul » —
et consignées ici pour qu'elles se renversent d'un mot.

**1. Une valeur d'acquisition inconnue se dit inconnue, elle ne vaut pas zéro.**

`bien.valeur_acquisition` est `not null`. Un inventaire papier, lui, ne porte presque jamais la
valeur d'entrée : exiger la colonne ferait rejeter l'essentiel des lignes, et le lot manquerait son
objet. Écrire zéro en silence serait pire — zéro est le prix d'un don, et le registre affirmerait
une fausseté qu'aucun écran ne pourrait démentir.

La colonne `valeur_acquisition` est donc facultative, et une ligne qui ne la porte pas crée un bien
à zéro **marqué `valeur_acquisition_connue = false`**. Les écrans qui montrent une valeur montrent
alors « non documentée », jamais un montant. Migration additive, sans `DROP` : une colonne booléenne
à `true` par défaut, de sorte que tout le patrimoine déjà saisi reste réputé documenté.

**2. Le détenteur se désigne par son adresse, jamais par son nom.**

Rapprocher « Mbala D. » d'un agent par ressemblance de nom affecterait des biens à la mauvaise
personne, et l'historique de garde est précisément ce qu'un contrôle vient vérifier. L'adresse est
la seule clé unique de la table `agent`. Une adresse introuvable dans la structure de la reprise fait
écarter la ligne en nommant la colonne — l'agent corrige, plutôt que le logiciel devine.

**3. Ce lot reprend les biens durables, pas encore les articles de stock.**

Un article de stock n'a pas d'identité individuelle : sa reprise est un état de quantités par site à
une date, c'est-à-dire la même opération qu'un inventaire, qui a déjà son circuit et ses règles
(RG-023 à RG-026). La reprise des stocks passera donc par une campagne d'inventaire initiale, et non
par ce format. C'est dit ici pour que l'absence ne se lise pas comme un oubli.

**4. L'étiquetage n'est pas dans ce lot.**

L'impression des étiquettes et la lecture optique (§7.2) viennent après : elles supposent un registre
peuplé et des immatriculations stables, ce que ce lot produit. Les faire d'abord serait imprimer des
étiquettes pour des biens qui ne sont pas encore au registre.

---

## Ce qui est demandé à l'interface

Un écran « Reprise » qui dépose un fichier, montre le rapport ligne par ligne — numéro de ligne,
verdict, motif, colonne en cause — compte les verdicts, et n'offre l'application que si au moins une
ligne est à créer. Le rapport se lit avant l'application, jamais après seulement.

Aucun cul-de-sac : chaque compteur du résumé mène aux lignes qu'il compte.
