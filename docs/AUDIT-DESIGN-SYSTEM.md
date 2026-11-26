# Audit du design system — SIGL

27 novembre 2026, en cours de chantier. L'interface est en construction : l'audit porte sur ce qui
existe à cet instant, et sert à corriger avant que le reste ne soit écrit par-dessus.

## Résumé

**Jetons définis :** 38 · **Composants livrés :** 5 sur 13 prévus · **Écarts relevés :** 6

| | |
|---|---|
| **Ce qui est très bien tenu** | La couleur. 33 jetons, nommés en français, cohérents. Les quatre couleurs officielles du Gouvernement sont exactes. **Zéro valeur en dur** dans les composants. |
| **Ce qui manque** | Tout le reste. Pas d'échelle d'espacement, pas d'échelle typographique, pas de jetons d'ombre ni de mouvement. |
| **Ce qui est faux** | Trois paires de couleurs sous le seuil de contraste, dont une franchement illisible. |

---

## Couverture des jetons

| Famille | Définis | Valeurs en dur trouvées | Verdict |
|---|---|---|---|
| Couleurs | **33** | 0 | Complet |
| Espacement | **0** | — | **Absent** |
| Typographie | 1 (`--police`) | — | **Échelle absente** |
| Rayons | 2 (`--angle`, `--angle-carte`) | 0 | Suffisant |
| Dimensions | 2 (`--bandeau-h`, `--laterale-l`) | 0 | Partiel |
| Ombres | 0 | — | Volontaire — la charte les proscrit |
| Mouvement | 0 | — | **Absent** |

**Le constat central.** La couleur est traitée comme un système ; l'espacement et la typographie ne
le sont pas du tout. Huit composants restent à écrire. Sans échelle, chacun inventera ses marges et
ses tailles, et la dérive sera dans le code avant demain matin. C'est le moment de poser les deux
échelles manquantes, pas après.

**Les quatre couleurs officielles, vérifiées une à une** contre le document de la charte graphique du
Gouvernement de février 2022 :

| Jeton | Valeur | Référence officielle |
|---|---|---|
| `--bleu-drapeau` | `#0095c9` | Pantone 801 C |
| `--jaune-drapeau` | `#fff24b` | Pantone 803 C |
| `--rouge-drapeau` | `#db3832` | Pantone 485 C |
| `--noir-drapeau` | `#323230` | — |

---

## Contraste

Seize paires réellement employées, calculées. Treize passent le seuil de 4,5:1 exigé pour du texte
courant.

| Ratio | Paire | Verdict |
|---|---|---|
| 12,85 | `--encre` sur `--fond` | Conforme |
| 11,05 | `--encre` sur `--jaune-drapeau` | Conforme — le jaune ne porte que du texte foncé, c'est juste |
| 9,72 | `--encre-inversee` sur `--bleu-nuit` | Conforme |
| 7,78 | `--bleu-texte` sur `--fond` | Conforme |
| 7,73 | `--ambre-texte` sur `--ambre-pale` | Conforme |
| 7,02 | `--bleu-lien` sur `--bleu-pale` | Conforme |
| 6,04 | `--vert-texte` sur `--vert-pale` | Conforme |
| 5,83 | `--bleu-nuit-doux` sur `--bleu-nuit` | Conforme |
| 5,61 | `--rouge-texte` sur `--rouge-pale` | Conforme |
| 4,54 | `--encre-inversee` sur `--rouge-drapeau` | Conforme, de justesse |
| **4,20** | `--encre-faible` sur `--fond` | **Insuffisant** — réservé au texte de 24 px et plus |
| **3,42** | `--bleu-drapeau` comme texte sur `--fond` | **Insuffisant** — jamais en texte courant |
| **2,15** | `--ambre` comme texte sur `--fond` | **Illisible** — ne doit jamais porter de texte |

Les trois échecs ne sont pas des erreurs de choix : ce sont des couleurs d'aplat employées comme
couleurs de texte. Le design system doit le dire, sinon quelqu'un le fera.

---

## Complétude des composants

| Composant | États | Variantes | Accessibilité | Note |
|---|---|---|---|---|
| `Armoiries` | — | — | À vérifier : `role="img"` et `aria-label` | — |
| `Bandeau` | — | — | À vérifier : repère `banner` | — |
| `BarreLaterale` | actif | — | À vérifier : `nav` et `aria-current` | — |
| `Page` | — | — | À vérifier : hiérarchie des titres | — |
| `Pastille` | — | par état | Couleur **et** libellé : conforme au contrat | Bon |
| `Tableau` | **à écrire** | | | |
| `Recherche`, `Filtres`, `Chiffre`, `Vide`, `Dialogue`, `Champ`, `Bouton` | **à écrire** | | | |

Le composant le plus important du produit — le `Tableau` — n'est pas encore écrit. C'est la brique
principale d'un outil administratif dense, et c'est elle qui décidera de la tenue de l'ensemble.

---

## Les six écarts, par ordre d'importance

**1. Aucune échelle d'espacement.** Huit composants vont s'écrire sans référence commune. À poser
maintenant : une échelle de 4 px — 4, 8, 12, 16, 24, 32, 48 — nommée `--espace-1` à `--espace-7`.

**2. Aucune échelle typographique.** Un seul jeton de police, aucune taille. À poser : cinq tailles
seulement, de 12 à 24 px, avec leurs hauteurs de ligne et leurs graisses. Cooper Hewitt est installée
mais son chargement n'est pas vérifié.

**3. Trois couleurs employables comme texte alors qu'elles ne le sont pas.** `--ambre` à 2,15 est le
cas grave. Le remède n'est pas de changer la couleur — elle est juste en aplat — mais de nommer
l'usage : `--ambre` pour les fonds et les pastilles, `--ambre-texte` pour le texte. Les trois paires
sont à documenter comme interdites.

**4. Jetons et styles mélangés.** `tokens.css` fait 1 252 lignes pour 38 jetons : le reste est du
style de base et de composant. Séparer `tokens.css` de `base.css` rend le système lisible et
auditable.

**5. Rien sur le focus clavier.** Aucun jeton d'anneau de focus. Un outil administratif se parcourt
au clavier toute la journée. À poser : `--focus` et une règle `:focus-visible` globale.

**6. Aucun jeton de mouvement.** La charte proscrit l'ornement, pas la transition. Deux durées
suffisent — 120 ms pour un état, 200 ms pour un panneau — plus le respect de
`prefers-reduced-motion`.

---

## Actions, par priorité

1. **Poser les deux échelles manquantes** — espacement et typographie — **avant** d'écrire les huit
   composants restants. C'est l'action qui empêche le plus de dérive pour le moins de travail.
2. **Documenter les trois couleurs interdites en texte**, dans le fichier des jetons, en commentaire,
   là où quelqu'un les lira au moment de s'en servir.
3. **Ajouter le jeton de focus** et sa règle globale.
4. **Séparer les jetons du style de base.**
5. **Soigner le `Tableau`** : en-tête teinté, lignes alternées, filets horizontaux seulement, chiffres
   tabulaires alignés à droite, en-têtes de colonne cliquables pour le tri avec `aria-sort`.
6. **Vérifier que Cooper Hewitt se charge réellement**, et prévoir le repli.
