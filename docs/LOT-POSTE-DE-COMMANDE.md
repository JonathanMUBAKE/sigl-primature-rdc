# Lot « poste de commande » — contrat gelé avant la première ligne de code

**Fondement.** Message 008 de Codex, 27 novembre 2026 à 12 h 10, et sa proposition
`POSTE-DE-COMMANDE.md` : « le SIGL doit présenter un poste de travail par rôle, pas un tableau de
graphiques décoratifs ». La conception est de Codex ; la réalisation est de Claude. Ce fichier gèle
la couture entre le serveur et l'interface, pour que deux agents travaillent en parallèle sans se
contredire.

**Ce que le lot ne fait pas.** Il ne refait ni l'écran ni la charte. Il ne crée ni facture, ni objet
de paiement, ni devise : ces contrats n'existent pas dans le schéma (voir §5), et un écran qui les
inventerait afficherait des chiffres sans source.

## 1. Les deux règles que le lot ajoute

| Règle | Énoncé | Tenue par |
|---|---|---|
| **RG-038** | Aucun chiffre du poste de commande n'est un cul-de-sac : il porte le lien de la liste autorisée qui le compose, et ce lien mène à un écran qui existe. | Serveur (le lien) et interface (la traduction) |
| **RG-039** | Une donnée qu'un profil n'a pas le droit de lire se dit indisponible avec son motif. Elle ne s'affiche jamais comme un zéro. | Serveur (`disponible` + `motif`) et interface (« — » + motif) |

## 2. Ce que le serveur rend — forme gelée

`GET /api/tableau-de-bord` conserve tous ses champs actuels. Trois changements, et rien d'autre
n'est retiré.

### 2.1 `chiffres_de_tete` : six chiffres d'action

Chaque entrée prend la forme :

```json
{ "libelle": "…", "valeur": 12, "appui": "3 au-delà de 7 jours", "lien": "/api/…",
  "disponible": true, "motif": null }
```

`valeur` est un entier, ou `null` quand `disponible` est `false` — jamais `0` pour dire
« non lisible » (RG-039). `appui` est une phrase courte ou `null`.

L'ordre est celui-ci, et il ne varie pas :

| # | `libelle` | Ce qui est compté | `lien` |
|---|---|---|---|
| 1 | Décisions en attente | `en_attente_de_decision.total` | `/api/besoins?statut=vise` |
| 2 | Livraisons attendues | bons de commande dont le PV de réception manque, hors `annule` | `/api/bons-commande?sans_pv=true` |
| 3 | Réceptions à compléter | PV de réception sans certificat de prise en charge | `/api/receptions?sans_certificat=true` |
| 4 | Paiements en attente | bons dont le certificat est émis et qui ne sont ni `payable`, ni `paye`, ni `annule` | `/api/bons-commande?attend_paiement=true` |
| 5 | Stock à risque | articles **distincts** en rupture, sous le seuil critique, ou dont la rupture est prévue sous 30 jours | `/api/stocks?tri=criticite` |
| 6 | Alertes actives | `alertes.actives` | `/api/alertes?nature=active` |

`appui` attendu : 1 → « N au-delà de 7 jours » ; 2 → « N partielle(s) » ; 5 → « dont N en rupture ».

**Amendement du 27 novembre 2026, après la première réalisation.** Le contrat gelé envoyait les
chiffres 2 et 4 sur `/achats`, qui liste les **dossiers** d'achat : le chiffre comptait des bons de
commande et ouvrait une liste où ils ne se lisent pas ligne par ligne. C'était RG-038 tenue à la
lettre et manquée en esprit. Les trois chiffres de la chaîne mènent désormais à l'écran des
réceptions, dont la ligne **est** le bon de commande, chacun à son étape : 2 → `etape=reception`,
3 → `etape=prise_en_charge`, 4 → `etape=paiement`. Pour que cette traduction ne mente pas, le
chiffre 2 a changé de définition — il compte les bons sans PV, exactement ce que l'étape
« réception » regroupe — et l'API a reçu le filtre `sans_pv` qui porte ce même prédicat. La règle
qui s'en dégage : **un chiffre et la liste où il mène se comptent par le même prédicat**, sans quoi
l'agent voit deux nombres différents et doute du logiciel.

Le chiffre 4 a suivi le même chemin, et pour une raison qui n'était pas visible au gel du contrat :
`?statut=receptionne` **n'est pas** « attend son paiement ». L'émission du certificat de prise en
charge ne fait pas bouger le statut du bon ; un bon `receptionne` sans certificat attend donc le
comptable des matières, pas le comptable public, et RG-011 interdit justement de marquer son
paiement possible. Les deux comptes coïncident sur le jeu de démonstration et divergent dès qu'une
réception passe un jour sans sa prise en charge. D'où le filtre `attend_paiement`, de prédicat
identique au chiffre. Les trois prédicats de la chaîne sont désormais écrits **une seule fois**,
dans `server/src/routes/_etapes.js`, et appelés par le chiffre comme par sa liste.

**Quittent le premier rang** : « Biens au registre », « Valeur d'acquisition (FC) »,
« Articles sous seuil » et « Biens offerts au réemploi par d'autres structures ». Les deux premiers
descendent dans le bloc patrimoine (§2.2) ; le dernier rejoint un bloc de contexte à l'écran (§3) ;
« Articles sous seuil » reste dans le bloc stocks, où il figure déjà.

### 2.2 `patrimoine.totaux` — nouveau

```json
"totaux": { "biens": 1240, "valeur_acquisition": 0, "biens_valeur_non_documentee": 318,
            "lien": "/api/biens" }
```

`biens_valeur_non_documentee` compte les biens dont `valeur_acquisition_connue` est faux. Le total
d'une valeur partielle ne doit pas se lire comme un inventaire valorisé : c'est la leçon du lot de
reprise, et le chiffre qui la dit manquait.

### 2.3 `periode` — nouveau, au premier niveau

```json
"periode": { "jours": 7, "libelle": "7 derniers jours" }
```

`horodatage` existe déjà et ne change pas : il est l'heure d'actualisation que l'en-tête affiche.

## 3. Ce que l'interface fait — et ne fait pas

- **En-tête** : titre « Poste de commande », puis le profil actif, le périmètre lisible, la période
  et l'heure de dernière actualisation, lue de `horodatage`.
- **Premier rang** : les six chiffres dans l'ordre rendu par le serveur, jamais réordonnés ni
  recalculés. `disponible: false` s'affiche « — » avec le motif en appui.
- **Bloc patrimoine** : les totaux de §2.2, dont « valeur non documentée pour N biens ».
- **Bloc de contexte réemploi** : le chiffre des offres ouvertes ailleurs, qui quitte le premier
  rang, reste visible et cliquable — il était la seule présence du réemploi sur cet écran.
- **Bloc achats** : les montants d'écart existants, plus la table `achats.par_procedure`, qui est
  rendue par le serveur depuis le premier jour et que l'écran n'a jamais affichée.
- **Charte inchangée** : jetons de `tokens.css`, neutres purs, bleu Primature en accent,
  typographie, rayons, grille Bento, modes clair et sombre, pastilles d'état avec texte. Aucun thème
  importé, aucune nouvelle palette, aucun nouveau type de graphique, aucune ombre portée.
- **`lienUi`** doit connaître les familles `bons-commande`, `dossiers-achat` et `receptions` : sans
  elles, les chiffres des achats ne sont pas cliquables, et RG-038 n'est pas tenue.

## 4. Le périmètre des agrégats — ce qui est à prouver

`achats.par_procedure` et `achats.ecarts` sont écrits sans filtre de portée dans leur SQL. Depuis la
migration `20261127050000`, `dossier_achat` et `bon_commande` sont sous sécurité au niveau des
lignes : la base devrait donc borner ces agrégats. **Devrait** n'est pas une preuve, et une politique
correcte lue au bout d'une jointure s'est déjà effacée une fois (migration `20261127040000`).

Le lot exige donc trois essais qui mordent :

1. un chef de structure ne lit dans `par_procedure` et dans `ecarts` que les montants de sa
   structure — prouvé par comparaison avec le total consolidé, strictement supérieur ;
2. le comptable public conserve le périmètre intégré, et l'établissement autonome en reste dehors ;
3. la portée totale lit tout et n'écrit rien.

Et une ceinture en plus de la bretelle : le filtre de portée est posé explicitement dans les deux
requêtes. La base tient la ligne ; la route dit la même chose, pour qu'un futur relâchement de
politique ne vide pas le cloisonnement en silence.

## 5. Ce qui manque au contrat, et que la conception doit trancher

Ces quatre points sont demandés par la proposition de Codex et **ne sont pas réalisables** : rien
dans le schéma ne les porte. Ils sont renvoyés à la conception plutôt qu'inventés à l'écran.

1. **La facture n'existe pas.** Aucune table, aucune route. « Factures à rapprocher ou en écart » n'a
   donc aucune source. Ce qui existe de la chaîne : `bon_commande.statut`
   (`emis → accepte → livre_partiel → livre → receptionne → payable → paye`), `paye_le`, et le
   certificat de prise en charge qui conditionne le paiement (décret 13/050, art. 137).
2. **Le paiement n'est pas un objet.** Il est un statut du bon de commande. Il n'y a ni tranche, ni
   échéance, ni référence de règlement, ni preuve attachée. Une file « des paiements autorisés qui
   attendent une suite » se réduit aujourd'hui à « bons `payable` non encore `paye` ».
3. **La devise n'existe pas comme donnée.** `bon_commande.montant` est un `numeric` sans colonne de
   devise ; le franc congolais est implicite. L'addition est donc licite, et le poste la libelle
   « FC ». Agréger par devise suppose d'abord une colonne, c'est-à-dire une décision de conception.
4. **La date de livraison attendue n'existe pas.** `bon_commande` porte `emis_le` et `livre_le`, pas
   d'échéance. « Livraison dépassée » n'est donc pas calculable ; le chiffre 2 compte les livraisons
   **attendues** et leur ancienneté, ce qui est la seule chose vraie.

## 6. Partage du travail

| Agent | Écrit dans | Ne touche pas |
|---|---|---|
| serveur | `server/`, `supabase/migrations/` | `web/` |
| interface | `web/` | `server/`, `supabase/` |

Les essais du serveur sont la preuve ; l'interface se vérifie au navigateur, dans les deux modes.
