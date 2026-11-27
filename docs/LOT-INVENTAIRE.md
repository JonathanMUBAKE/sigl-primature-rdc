# Lot « inventaire physique et rapprochement contradictoire »

**Contrat du lot, arrêté par le chef de projet avant ouverture.** Il complète
`docs/CONTRAT-TECHNIQUE.md`, qui reste la référence pour la pile, les droits, la forme des routes et
la direction artistique. Ce qui est écrit ici n'est pas négociable entre agents : c'est la couture.

Fondements : décret 13/050 du 6 février 2013, art. 120 (« des inventaires et comptes d'emplois sont
établis **à dates fixes** »), art. 122 (le détenteur atteste les biens qui lui sont affectés),
art. 123 (« des **rapprochements périodiques contradictoires** sont effectués entre les données de la
comptabilité des matières et celles de la comptabilité générale de l'État »).

---

## 1. Les tables — migration `20261127070000_inventaire.sql`

Toutes portent `structure_id uuid not null` **sur leur propre ligne**, résolu à l'écriture, et
entrent dans le cloisonnement tenu par la base. C'est la leçon de la migration `20261127040000` :
un périmètre lu au bout d'une jointure externe vers une table cloisonnée rend `null`, et un `null`
ne se distingue pas d'une absence de cloisonnement.

### `campagne_inventaire`
```
id uuid pk · numero text unique · libelle text not null
structure_id uuid not null references structure · site_id uuid null references site
date_arretee date not null          -- la date à laquelle l'inventaire est arrêté (art. 120)
statut text not null default 'preparee'
ouverte_le timestamptz null · ouverte_par uuid null
close_le timestamptz null · close_par uuid null
cree_par uuid not null · cree_le timestamptz default now() · maj_le timestamptz
```
- `statut` ∈ `preparee`, `en_cours`, `close`
- `numero` : série `CI`, par `prochainNumero('campagne_inventaire')` → `CI-2026-00001`.
  Ajouter `campagne_inventaire: 'CI'` et `rapprochement: 'RAP'` à `PREFIXES` dans `_numeros.js`.

### `campagne_agent` — les agents désignés
```
id uuid pk · campagne_id uuid not null references campagne_inventaire on delete cascade
agent_id uuid not null references agent · structure_id uuid not null
qualite text not null · designe_le timestamptz default now() · designe_par uuid
unique (campagne_id, agent_id, qualite)
```
- `qualite` ∈ `operateur`, `detenteur`, `temoin`

### `constat_inventaire` — un par bien constaté
```
id uuid pk · campagne_id uuid not null references campagne_inventaire on delete cascade
bien_id uuid not null references bien · structure_id uuid not null
resultat text not null                 -- conforme | ecart | introuvable
quantite_comptee int null · etat_constate text null
detenteur_constate_id uuid null references agent · site_constate_id uuid null references site
observation text null
constate_par uuid not null references agent · constate_le timestamptz default now()
unique (campagne_id, bien_id)
```

### `ecart_inventaire` — le circuit de l'anomalie
```
id uuid pk · constat_id uuid not null unique references constat_inventaire on delete cascade
campagne_id uuid not null · bien_id uuid not null · structure_id uuid not null
nature text not null                   -- quantite | etat | detenteur | localisation | introuvable
ecart_quantite int null
statut text not null default 'constate'
explication text null · explique_par uuid null · explique_le timestamptz null
decision text null                     -- regularisation | perte | maintien
motif_decision text null · tranche_par uuid null · tranche_le timestamptz null
document_id uuid null references document · mouvement_id uuid null references mouvement
cree_le timestamptz default now()
```
- `statut` ∈ `constate`, `explique`, `tranche`
- `decision` n'est renseignée qu'au moment où un humain tranche. **Aucune décision automatique.**

### `rapprochement` — art. 123
```
id uuid pk · numero text unique · structure_id uuid not null references structure
periode_debut date not null · periode_fin date not null
statut text not null default 'ouvert'  -- ouvert | constate | clos
conclusion text null · clos_le timestamptz null · clos_par uuid null
cree_par uuid not null · cree_le timestamptz default now()
```

### `rapprochement_poste` — la liste des écarts, poste par poste
```
id uuid pk · rapprochement_id uuid not null references rapprochement on delete cascade
structure_id uuid not null · categorie_code text not null references categorie
valeur_matieres numeric(18,2) not null   -- calculée par le système, depuis `bien`
valeur_generale numeric(18,2) null       -- saisie : la comptabilité générale n'est pas interfacée
explication text null
unique (rapprochement_id, categorie_code)
```

### `rapprochement_partie` — le contradictoire
```
id uuid pk · rapprochement_id uuid not null references rapprochement on delete cascade
structure_id uuid not null · agent_id uuid not null references agent
qualite text not null                    -- comptable_matieres | comptable_general
atteste_le timestamptz null · reserve text null
unique (rapprochement_id, qualite)
```

### Cloisonnement et temps réel
- Ajouter les sept tables aux politiques de l'ADR-001, exactement comme
  `20261127050000_cloisonner_chaine_achat.sql` : lecture `sigl_lecture_permise(structure_id)`,
  écriture `sigl_ecriture_chaine_achat(structure_id)` **non** — ici
  `sigl_ecriture_permise(structure_id)` suffit : le comptable public ne tient pas l'inventaire.
- Les ajouter à la publication `supabase_realtime` et au déclencheur de notification, avec pour
  `objet` : `inventaire` (campagne, constat, écart) et `rapprochement`. **Au singulier** — c'est la
  convention du serveur, et l'interface écoute ces noms-là.

---

## 2. Les règles de gestion — cinq de plus

Chacune dans `server/src/regles/rg-0NN.js`, pure, avec son test à côté. À ajouter au tableau de la
section 3 du contrat technique.

| N° | Règle | Fondement |
|---|---|---|
| RG-023 | Une campagne d'inventaire ne se clôt pas tant qu'un bien de son périmètre n'a pas été constaté | Décret 13/050 art. 120 |
| RG-024 | Aucune campagne ne se clôt sur un écart non tranché | Décret 13/050 art. 120 |
| RG-025 | Un écart ne se tranche qu'après l'explication du détenteur | Décret 13/050 art. 122 |
| RG-026 | Qui constate un écart ne le tranche pas | Séparation des fonctions |
| RG-027 | Un rapprochement n'est clos qu'attesté par les deux parties | Décret 13/050 art. 123 |

Un écart tranché en `perte` relève de **RG-015** (le bien reste au registre, dans l'état `perdu`) et
de **RG-016** (le SIGL ne prononce pas : il instruit et produit le PV). Ne pas les redoubler.

---

## 3. Les routes — `server/src/routes/inventaire.js` et `rapprochements.js`

Forme, erreurs, pagination : section 5 du contrat. Chaque écriture est journalisée **avant** d'être
confirmée (RG-020) et publiée au flux.

```
GET    /api/campagnes-inventaire              ?statut=&structure=&page=&parPage=
POST   /api/campagnes-inventaire              { libelle, structure_id, site_id?, date_arretee }
GET    /api/campagnes-inventaire/:id
POST   /api/campagnes-inventaire/:id/agents   { agent_id, qualite }
POST   /api/campagnes-inventaire/:id/ouvrir
POST   /api/campagnes-inventaire/:id/constats { bien_id, resultat, quantite_comptee?, etat_constate?,
                                                detenteur_constate_id?, site_constate_id?, observation? }
POST   /api/campagnes-inventaire/:id/clore    RG-023, RG-024
GET    /api/ecarts-inventaire                 ?statut=&campagne=&structure=&page=
POST   /api/ecarts-inventaire/:id/expliquer   { explication }
POST   /api/ecarts-inventaire/:id/trancher    { decision, motif_decision }  RG-025, RG-026

GET    /api/rapprochements                    ?statut=&structure=&page=
POST   /api/rapprochements                    { structure_id, periode_debut, periode_fin }
GET    /api/rapprochements/:id
POST   /api/rapprochements/:id/postes         { categorie_code, valeur_generale, explication? }
POST   /api/rapprochements/:id/parties        { agent_id, qualite }
POST   /api/rapprochements/:id/attester       { reserve? }
POST   /api/rapprochements/:id/clore          { conclusion }  RG-027
```

**Droits.** Écriture : `comptable_matieres` tient la campagne et le rapprochement ; `magasinier`,
`comptable_matieres` et un agent désigné `detenteur` saisissent un constat ; l'explication d'un écart
est portée par le détenteur du bien ou un agent désigné `detenteur` ; `trancher` est réservé au
`comptable_matieres` et à la `logistique`. Lecture : la garde `lecture()` ordinaire, portée RG-017.

**Le constat engendre l'écart, et rien d'autre.** Un `resultat` qui vaut `ecart` ou `introuvable`
ouvre une ligne d'`ecart_inventaire` dans la même transaction, avec sa `nature` déduite de ce qui
diffère réellement entre le constat et la fiche du bien. Un `conforme` n'en ouvre aucune. **Le
constat ne modifie jamais la fiche du bien** : c'est la décision humaine qui régularise.

**Trancher.**
- `regularisation` → aligne la fiche du bien sur le constat (quantité, état, détenteur, site) et
  inscrit un `mouvement` qui en porte le motif. `statut` → `tranche`.
- `perte` → `bien.etat = 'perdu'` (RG-015 : le bien reste au registre), un `mouvement` de type
  `perte`, un document `pv_perte` figé (RG-016). `statut` → `tranche`.
- `maintien` → la fiche ne bouge pas ; le motif est obligatoire et conservé. `statut` → `tranche`.

**Réponses.** `GET /api/campagnes-inventaire/:id` rend, en plus de la campagne :
```json
{
  "campagne": { "id","numero","libelle","statut","date_arretee","structure_id","structure_nom","site_nom" },
  "agents": [ { "agent_id","nom","fonction","qualite" } ],
  "avancement": { "biens_du_perimetre": 0, "constates": 0, "conformes": 0, "ecarts": 0,
                  "introuvables": 0, "restants": 0, "taux": 0 },
  "constats": [ { "id","bien_id","immatriculation","designation","resultat","quantite_comptee",
                  "etat_constate","observation","constate_par","constate_par_nom","constate_le" } ],
  "ecarts":   [ { "id","bien_id","immatriculation","designation","nature","ecart_quantite","statut",
                  "explication","decision","motif_decision","anciennete_jours" } ],
  "clotures_possible": { "possible": true, "motif": null }
}
```
`clotures_possible` est **calculé par le serveur**, jamais par l'interface : il dit d'avance ce que
RG-023 et RG-024 répondraient, pour que l'écran sache griser le bouton et nommer le motif.

`GET /api/rapprochements/:id` rend `{ rapprochement, postes[], parties[], totaux: { valeur_matieres,
valeur_generale, ecart }, cloture_possible: { possible, motif } }`.

---

## 4. L'interface — `web/src/`

Deux écrans et une entrée de navigation. Rien n'est recalculé côté interface : tous les chiffres
viennent du serveur, et chaque chiffre porte son lien.

- **`web/src/pages/Inventaire.jsx`** — la liste des campagnes : numéro, libellé, structure, date
  arrêtée, statut, avancement en proportion, écarts non tranchés. Un bouton « Ouvrir une campagne ».
- **`web/src/pages/Campagne.jsx`** — le poste de travail de la campagne : l'avancement, les agents
  désignés, la saisie d'un constat bien par bien, la table des écarts avec leur circuit
  (expliquer / trancher), le bouton de clôture **grisé avec son motif** quand
  `clotures_possible.possible` est faux.
- **`web/src/pages/Rapprochements.jsx`** — la liste et le détail : les postes avec les deux colonnes
  et l'écart, les deux parties et leur attestation, la clôture.
- Entrées dans `App.jsx` (`/inventaire`, `/inventaire/:id`, `/rapprochements`), dans la navigation,
  dans `web/src/lib/api.js` et dans la table de `web/src/lib/liens.js` (`/api/campagnes-inventaire`
  → `/inventaire`, `/api/ecarts-inventaire` → `/inventaire`, `/api/rapprochements` →
  `/rapprochements`).
- Temps réel : `useRafraichissementVivant(['inventaire', 'rapprochement'], …)` — **au singulier**,
  comme le serveur les nomme.

---

## 5. Ce qui est vérifié avant de livrer

- `npm test` passe et le nombre d'essais a monté. Chaque règle a son test ; les cinq nouvelles
  règles sont éprouvées **à travers une route**, pas seulement en pur.
- Un essai en base, sous le rôle non privilégié, prouve qu'un chef de structure ne lit aucune
  campagne ni aucun constat d'une autre structure, et qu'une écriture du niveau central dans un
  établissement autonome est refusée (RG-018).
- Les deux écrans sont regardés dans un navigateur, en mode clair et en mode sombre.
