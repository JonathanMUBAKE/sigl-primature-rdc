# SIGL — Contrat technique

**Lecture obligatoire avant toute ligne de code.** Ce document est le contrat commun de tous les
agents du chantier. Il fixe la pile, le modèle de données, la forme des routes, les règles de gestion
et la direction artistique. On ne s'en écarte pas sans le dire.

Décisions prises le 27 novembre 2026 par le chef de projet technico-administratif, sur la base de
`CONCEPTION.md`, `CADRE-PRIMATURE.md` et `PLAN-DE-RECHERCHE.md`, qui restent la référence métier.

---

## 1. La pile

> **Mise à jour du 27 novembre 2026.** PGlite a été remplacé par **Supabase en local, par Docker**,
> à la demande du client. Le schéma vit désormais dans `supabase/migrations/`, qui est la source de
> vérité ; `server/migrations/` a été supprimé pour qu'il n'y ait qu'une copie. La base locale est
> `postgresql://postgres:postgres@127.0.0.1:55322/postgres`, surchargeable par `DATABASE_URL`.
> Le temps réel passe par la publication `supabase_realtime` et un flux SSE côté serveur.

| Couche | Choix | Pourquoi |
|---|---|---|
| Exécution | Node.js 22+, modules ES | Standard de la maison |
| Serveur | Fastify 5 | Léger, rapide, schémas JSON natifs |
| Base | **PostgreSQL via Supabase**, en local par Docker et en production | Realtime, sécurité au niveau des lignes et authentification fournis d'office |
| Accès données | SQL écrit à la main, requêtes paramétrées | Pas d'ORM : le modèle est comptable, il doit rester lisible |
| Interface | React 19 + Vite + Tailwind 4 | Standard de la maison |
| Tests | `node:test` + `node:assert` | Aucune dépendance de plus |
| Validation | Schémas JSON Fastify | La validation est au bord, pas dans le métier |

**Arborescence**

```
supabase/
  config.jsonc       projet sigl-primature, ports 553xx
  migrations/        20261127000100_socle.sql … source de vérité du schéma
server/
  src/
    db.js            connexion, migrations, requêtes
    app.js           assemblage Fastify
    routes/          un fichier par domaine
    regles/          les règles de gestion, pures et testables
    *.test.js        à côté du code testé
  seed/              jeu de données de démonstration
web/
  src/
    main.jsx, App.jsx
    pages/           un fichier par écran
    components/      briques réutilisées
    lib/             api.js, format.js
    styles/          tokens.css
docs/
```

**Règles non négociables**

1. **Toute règle de gestion est contrôlée côté serveur.** L'interface peut la dupliquer pour le
   confort, jamais pour l'autorité.
2. **Toute action sensible est journalisée** dans `journal` : qui, quoi, quand, valeurs avant/après.
   Le journal n'est modifiable par personne.
3. **Aucun secret dans le dépôt.**
4. **Interface, messages d'erreur et documents en français.**
5. Les montants sont en **francs congolais**, stockés en `numeric(18,2)`.
6. Les identifiants techniques sont des `uuid`. Les numéros métier (immatriculation, numéros de
   documents) sont des chaînes lisibles, générées par le serveur.

---

## 2. Le modèle de données

### Socle

**`structure`** — les entités de la Primature.
`id uuid pk · code text unique · nom text · type text · regime text · parent_id uuid null · actif bool`
- `type` ∈ `cabinet`, `secretariat_general`, `cellule`, `etablissement_public`, `service`
- **`regime` ∈ `integre`, `autonome`** — c'est la distinction majeure. Une structure `integre` dépend
  entièrement de la Primature et lui demande tout. Une structure `autonome` a sa personnalité
  juridique, son budget et son comptable : elle tient sa propre comptabilité des matières, et le
  niveau central n'en a que la vue consolidée. **Ne jamais confondre les deux.**

**`site`** — `id · structure_id · nom · adresse · ville`

**`agent`** — `id · structure_id · nom · fonction · email unique · actif`

**`role`** — `code pk · libelle` — voir §4.

**`agent_role`** — `agent_id · role_code · structure_id null` (portée)

**`journal`** — `id · horodatage · agent_id · action · objet_type · objet_id · avant jsonb · apres jsonb · ip`
Insertion seule. Aucune route de modification ni de suppression.

### Patrimoine

**`categorie`** — nomenclature des biens.
`code pk · libelle · parent_code null · classement text · duree_amortissement int null`
- `classement` ∈ `immobilisation`, `stock` — valeur par défaut héritée, surchargeable par bien.

**`bien`** — la fiche centrale.
```
id uuid · immatriculation text unique · categorie_code · designation · marque · modele
numero_serie · classement text · objectif_detention text · mode_entree text
valeur_acquisition numeric(18,2) · cout_remplacement numeric(18,2) null
date_acquisition date · etat text · structure_id · site_id · detenteur_id null
suivi text · quantite int default 1 · photo_url null · reforme_le date null
cree_le · maj_le
```
- `classement` ∈ `immobilisation`, `stock` — IPSAS 45 §AG12
- `objectif_detention` ∈ `operationnelle`, `financiere` — IPSAS 45 §27, détermine la base
  d'évaluation. Défaut : `operationnelle`.
- `mode_entree` ∈ `achat`, `don`, `transfert` — commande l'évaluation initiale.
  `achat` → coût. `don`/`transfert` et immobilisation → coût réputé (IPSAS 45 §12).
  `don`/`transfert` et stock → juste valeur à la date d'entrée (IPSAS 12 §16).
- `cout_remplacement` **obligatoire** quand `classement='stock'` et que l'article est destiné à être
  distribué gratuitement — IPSAS 12 §17.
- `etat` ∈ `neuf`, `bon`, `a_reparer`, `hors_service`, `en_maintenance`, `reforme`, `perdu`
- `suivi` ∈ `individuel`, `lot` — IPSAS 45 §8 autorise le lot pour les petits matériels. Le seuil est
  un paramètre, pas une constante.

**Immatriculation** — format `GIAI` simplifié : `BRT-<code structure>-<catégorie>-<séquence 5>`,
par exemple `BRT-SGP-INF-00042`. Généré par le serveur, jamais saisi.

**`mouvement`** — tout ce qui arrive à un bien.
`id · bien_id · type · quantite · date · structure_source · structure_cible · detenteur_source ·
detenteur_cible · motif · document_id null · agent_id · cree_le`
- `type` ∈ `entree`, `sortie`, `transfert`, `maintenance`, `retour_maintenance`, `perte`,
  `declassement`, `reforme`, `reemploi`

**`stock`** — vue agrégée par article et par site.
`categorie_code · site_id · quantite · seuil_minimum · seuil_critique`

### Circuit du besoin

**`etat_besoin`** — `id · numero unique · structure_id · demandeur_id · statut · justification ·
cree_le · vise_le · viseur_id · examine_le · examinateur_id · motif_decision`
- `statut` ∈ `brouillon`, `vise`, `recu`, `examine`, `partiel`, `rejete`, `en_achat`, `livrable`,
  `livre`, `clos`

**`ligne_besoin`** — `id · etat_besoin_id · categorie_code · designation · quantite_demandee ·
quantite_accordee · motif · origine` où `origine` ∈ `stock`, `achat`, `refuse`

**`fournisseur`** — `id · denomination · rccm · id_nat · nif · adresse · telephone · email ·
categories text[] · liste_noire bool · delai_moyen_jours int · actif`

**`dossier_achat`** — `id · numero · montant_estime · procedure · statut · cree_le`
- `procedure` ∈ `gre_a_gre`, `consultation`, `aon`, `aoi` — **déterminée par les seuils, qui sont des
  paramètres administrables, jamais codés en dur.**

**`bon_commande`** — `id · numero · dossier_id · fournisseur_id · montant · statut · emis_le`

**`document`** — toute pièce émise.
`id · type · numero unique · objet_type · objet_id · contenu jsonb · signataire_id · signe_le ·
fige bool default true · parent_document_id null`
- `type` ∈ `etat_besoin`, `decision_examen`, `bon_commande`, `pv_reception`,
  **`certificat_prise_en_charge`**, `bon_livraison`, `accuse_reception`, `acte_transfert`,
  `pv_perte`, `pv_reforme`, `etat_inventaire`
- Un document `fige` ne se modifie pas : on en émet un autre, lié par `parent_document_id`.

**`parametre`** — `cle pk · valeur jsonb · maj_le · maj_par`
Y vivent : les seuils de passation, le seuil de suivi individuel, les délais d'alerte. **Horodatés et
versionnés** : une décision prise hier doit rester jugeable avec les seuils d'hier.

**`alerte`** — `id · code · gravite · objet_type · objet_id · explication · donnees jsonb · statut ·
traite_par · traite_le · suite`
- `statut` ∈ `ouverte`, `en_examen`, `justifiee`, `confirmee`, `classee`
- **Aucune alerte ne décide quoi que ce soit.** Elle ouvre un examen, un humain tranche, et la suite
  est conservée.

---

## 3. Les règles de gestion

Numérotées, testables, contrôlées côté serveur. Chaque règle a son test.

| N° | Règle | Fondement |
|---|---|---|
| RG-001 | Un état de besoin sans justification ne peut pas être visé | Conception |
| RG-002 | Un chef de structure ne peut pas viser un état de besoin dont il est le demandeur | Séparation des fonctions |
| RG-003 | Une validation partielle exige un motif non vide | Conception |
| RG-004 | Un rejet exige un motif non vide | Conception |
| RG-005 | Aucune sortie de stock supérieure à la quantité existante | Comptabilité des matières |
| RG-006 | Un état de besoin ne se clôt pas sans accusé de réception signé | Conception |
| RG-007 | La procédure de passation découle du montant estimé et des seuils en vigueur à la date du dossier | Loi 10/010 |
| RG-008 | Le système bloque et alerte si un découpage ferait passer un achat sous un seuil | Drapeau rouge R011 |
| RG-009 | Aucun bon de commande vers un fournisseur en liste noire | Drapeau rouge R046 |
| RG-010 | Le certificat de prise en charge à l'inventaire n'est émis qu'après un PV de réception | Décret 13/050 art. 137 |
| RG-011 | Aucun paiement n'est marqué possible sans certificat de prise en charge | Décret 13/050 art. 137 |
| RG-012 | Un bien de classement `stock` destiné à distribution gratuite doit porter un coût de remplacement | IPSAS 12 §17 |
| RG-013 | Les pièces de rechange et le matériel d'entretien sont classés en stock sauf s'ils répondent à la définition d'immobilisation | IPSAS 45 §AG12 |
| RG-014 | Un bien reçu sans contrepartie est évalué au coût réputé s'il est immobilisation, à la juste valeur s'il est stock | IPSAS 45 §12, IPSAS 12 §16 |
| RG-015 | Un bien ne disparaît jamais : perte et vol le laissent au registre dans un état distinct | Conception |
| RG-016 | Le SIGL ne prononce pas une cession ni une mise au rebut : il instruit et produit le PV | Décret 13/050 |
| RG-017 | Une structure ne lit que ses propres données | Conception |
| RG-018 | Une structure `autonome` n'est jamais écrite par le niveau central ; elle est lue en consolidé | Décret 13/050 |
| RG-019 | Un document figé n'est jamais modifié ; on émet un document lié | Code du numérique art. 42 |
| RG-020 | Toute action sensible est journalisée avant d'être confirmée | Conception |
| RG-021 | Un bien suivi en `lot` n'a pas d'immatriculation individuelle | IPSAS 45 §8 |
| RG-022 | Une alerte ne change aucun état métier | Principe du projet |

---

## 4. Les rôles et les droits

| Code | Rôle | Portée | Peut |
|---|---|---|---|
| `demandeur` | Agent demandeur | sa structure | créer et suivre ses états de besoin, accuser réception |
| `chef_structure` | Chef de structure | sa structure | viser les états de besoin, lire son patrimoine et ses stocks |
| `comptable_matieres` | Comptable des matières | son périmètre | prises en charge, sorties, inventaires, immatriculation |
| `magasinier` | Magasinier | ses sites | entrées et sorties physiques, écarts |
| `logistique` | Chargé de logistique centrale | tout | examiner, arbitrer, ouvrir les achats |
| `intendant` | Intendant général | central | exécution logistique, charroi, installations |
| `ordonnateur` | Ordonnateur | central | certifier le service fait |
| `controle_budget` | Contrôleur de budget | central | viser la disponibilité des crédits |
| `comptable_public` | Comptable public | central | contrôler la prise en charge, marquer payable |
| `direction` | Cabinet, Première ministre | tout, lecture | tableaux de bord consolidés |
| `controle_externe` | IGF, Cour des comptes | tout, **lecture seule** | lire, y compris le journal |
| `admin` | Administrateur | technique | référentiels, comptes, paramètres — **jamais une écriture métier ni le journal** |

**Invariants.** Qui demande ne vise pas. Qui réceptionne ne valide pas sa propre réception. Qui
engage ne paie pas. Quand une structure est trop petite pour que ce soit possible, le système exige
un visa a posteriori tracé plutôt que de laisser passer en silence.

---

## 5. L'API

Préfixe `/api`. JSON uniquement. Réponses en français.

**Forme des erreurs** — toujours celle-ci, jamais une autre :
```json
{ "erreur": { "code": "RG-002", "message": "Un chef de structure ne peut pas viser sa propre demande.", "champ": "viseur_id" } }
```
Le `code` est celui de la règle violée quand il y en a une, sinon un code court (`non_trouve`,
`non_autorise`, `donnees_invalides`).

**Listes** — `{ "donnees": [...], "total": 123, "page": 1, "parPage": 50 }`

**Routes principales**

```
GET    /api/sante
GET    /api/structures                 ?regime=&type=
GET    /api/biens                      ?structure=&categorie=&etat=&q=&page=
POST   /api/biens                      → immatricule et journalise
GET    /api/biens/:id
POST   /api/biens/:id/mouvements       transfert, maintenance, perte, réforme
GET    /api/stocks                     ?site=&sous_seuil=
GET    /api/besoins                    ?statut=&structure=
POST   /api/besoins                    brouillon
POST   /api/besoins/:id/viser          RG-001, RG-002
POST   /api/besoins/:id/examiner       RG-003, RG-004 → aiguillage ligne par ligne
POST   /api/besoins/:id/accuser        RG-006
GET    /api/fournisseurs               ?q=&liste_noire=
POST   /api/dossiers-achat             RG-007, RG-008
POST   /api/bons-commande              RG-009
POST   /api/receptions                 → PV
POST   /api/prises-en-charge           RG-010 → certificat
GET    /api/documents/:id
GET    /api/alertes                    ?statut=&gravite=
POST   /api/alertes/:id/traiter        RG-022
GET    /api/tableau-de-bord            chiffres du poste de commande central
GET    /api/journal                    contrôle externe seulement
```

**Authentification** — pas de mot de passe à ce stade : un en-tête `X-Agent-Id` désigne l'agent
courant et le serveur en déduit les rôles. Un écran de sélection de profil permet de changer
d'identité pour la démonstration. **L'authentification réelle viendra plus tard** ; les droits, eux,
sont déjà appliqués pour de bon.

---

## 6. La direction artistique

Relevée sur **servicepublic.gouv.cd**, le catalogue des services publics de la RDC. Institutionnelle,
sobre, dense. Ce n'est pas la charte Braintis : le SIGL est un outil de l'État, il porte les couleurs
de l'État.

### Les jetons

```css
--bleu-nuit:    #0A2A5E;  /* bandeau, en-têtes, barre latérale */
--bleu:         #16367F;  /* titres, texte accentué */
--bleu-clair:   #2F6FD0;  /* liens, états actifs */
--bleu-pale:    #EEF3FA;  /* fonds de section, lignes alternées */
--or:           #F0B429;  /* attention, en attente */
--rouge:        #C8372D;  /* critique, rejet, rupture */
--vert:         #1E7F४4;  /* conforme, validé */
--encre:        #1A1A2E;  /* texte principal */
--encre-douce:  #5A6072;  /* texte secondaire */
--ligne:        #D8DEE9;  /* filets et bordures */
--fond:         #FFFFFF;
--fond-gris:    #F6F8FB;
```

*(Le vert est `#1E7F44`.)*

### La typographie

**Instrument Sans** pour les titres, **Inter** pour le texte et les données. Les deux sur Google
Fonts. Base **16 px**, secondaire 14 px, légendes 12 px. Graisses 400, 500, 600, 700.
`font-variant-numeric: tabular-nums` partout où des chiffres s'alignent.

### Les formes

Angles **4 px** pour les boutons et les champs, **6 px** pour les cartes. Jamais plus : le site de
référence est anguleux, et c'est ce qui fait sérieux. Bordures de 1 px en `--ligne`. **Aucune ombre
portée** sauf sur les menus déroulants.

### Les principes d'écran

- Un bandeau bleu nuit en haut, pleine largeur, avec les armoiries à gauche et l'identité de l'agent
  à droite.
- Une barre latérale fixe, bleu nuit, pour la navigation. Icône et libellé.
- Le contenu sur fond blanc, titre de page en haut à gauche, actions en haut à droite.
- **Les tableaux sont la brique principale** : en-tête `--bleu-pale`, lignes alternées, filets
  horizontaux seulement, chiffres alignés à droite en chiffres tabulaires.
- Les états sont des pastilles de couleur **avec leur libellé**, jamais une couleur seule.
- Les chiffres clés ne sont pas des cartes décoratives : un nombre, son libellé, et il se clique.
- Pas d'émoji. Pas de dégradé. Pas d'illustration.
- Tout écran de liste a une recherche, des filtres et un compte de résultats.
- Tout écran fonctionne à partir de 1280 px, et reste utilisable à 768 px.

---

## 7. Le jeu de données

Les structures réelles relevées sur le site de la Primature, avec leur régime :

| Code | Structure | Type | Régime |
|---|---|---|---|
| CAB | Cabinet de la Première ministre | cabinet | integre |
| SGP | Secrétariat Général à la Primature | secretariat_general | integre |
| SGG | Secrétariat Général du Gouvernement | secretariat_general | integre |
| CGIG | Cellule de Gestion des Immeubles du Gouvernement | cellule | integre |
| CAID | Cellule d'Analyse des Indicateurs de Développement | cellule | integre |
| DU | Delivery Unit de la Primature | cellule | integre |
| ARMP | Autorité de Régulation des Marchés Publics | etablissement_public | autonome |
| APCSC | Agence de Pilotage, de Coordination et de Suivi des Conventions de Collaboration | etablissement_public | autonome |
| ARCCSU | Autorité de Régulation et de Contrôle de la Couverture Santé Universelle | etablissement_public | autonome |
| CNP | Caisse Nationale de Péréquation | etablissement_public | autonome |
| CNDSI | Comité National du Désarmement et de la Sécurité Internationale | cellule | integre |

Volumes de démonstration : environ 400 biens, 60 articles de stock, 25 agents, 12 fournisseurs,
30 états de besoin à tous les stades, 10 alertes.

**Aucune donnée réelle de l'institution dans le dépôt.** Noms et montants sont fictifs et
plausibles.

---

## 8. Ce qu'on ne fait pas cette nuit

Dit franchement pour que personne ne le cherche : l'authentification par mot de passe, la signature
électronique par prestataire qualifié, l'application mobile hors ligne, l'archivage conforme aux
articles 42-43, le module des valeurs inactives, et le rapprochement avec la comptabilité générale.
Chacun est documenté dans `CONCEPTION.md` et attend sa décision ou son prestataire.
