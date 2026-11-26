# SIGL — Système Intégré de Gestion Logistique

Patrimoine, stocks et commande publique de la **Primature de la République démocratique du Congo**.

Développé par **Braintis Technology**, Kinshasa.

---

## Ce que c'est

Le SIGL outille la **comptabilité des matières** que le décret n° 13/050 du 6 novembre 2013 portant
règlement général sur la comptabilité publique impose depuis douze ans : description des existants et
des mouvements des biens mobiliers et immobiliers, des stocks, des titres et valeurs de l'État
(art. 120), avec immatriculation des biens, inventaires à dates fixes et rapprochements
contradictoires avec la comptabilité générale (art. 123).

Ce n'est pas un outil de gestion de stock. Le stock est une partie ; le cœur est le **registre du
patrimoine** et le **circuit de la commande publique**.

Sa pièce maîtresse est le **certificat de prise en charge à l'inventaire**. L'article 137 du même
décret en fait une pièce que le comptable public contrôle avant de payer. Le système le génère à la
réception : pas de certificat sans entrée en inventaire, pas de paiement sans certificat.

## Démarrer

Il faut **Node.js 22 ou plus**. Rien d'autre : la base tourne en local, intégrée.

```bash
npm install
npm run seed     # crée la base et le jeu de démonstration
npm run dev      # serveur sur :3000, interface sur :5173
```

Puis ouvrir **http://localhost:5173**. Un écran de choix de profil permet de prendre l'identité d'un
agent — demandeur, chef de structure, comptable des matières, chargé de logistique, contrôle
externe — et de voir le système tel qu'il le voit.

### Les commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur et interface, en rechargement automatique |
| `npm run dev:serveur` | Le serveur seul |
| `npm run dev:web` | L'interface seule |
| `npm test` | Les tests, dont un par règle de gestion |
| `npm run seed` | Recrée la base et le jeu de démonstration |
| `npm run build` | Compile l'interface dans `web/dist` |
| `npm start` | Démarre le serveur en production |

## Déployer

Le système est prévu pour un **hébergement en République démocratique du Congo**. L'article 201 du
Code du numérique dispose que les données personnelles sont stockées et hébergées en RDC, et
l'article 202 ferme aux autorités publiques les dérogations fondées sur le consentement : la
Primature ne peut pas héberger ailleurs en invoquant l'accord de ses agents.

**En production**, la base est PostgreSQL. Deux variables suffisent :

```bash
DATABASE_URL=postgres://utilisateur:motdepasse@hote:5432/sigl
PORT=3000
```

```bash
npm ci
npm run build          # compile l'interface
npm run seed           # la première fois seulement
npm start              # sert l'API et l'interface compilée
```

Le serveur sert `web/dist` : un seul processus, aucun serveur web à configurer devant, même si un
reverse proxy reste recommandé pour le TLS.

**Avant une mise en service réelle**, quatre points restent ouverts et sont documentés dans
`docs/CONCEPTION.md` : l'authentification par mot de passe, la signature électronique par un
prestataire de services de confiance qualifié et autorisé en RDC (Code du numérique, art. 105 et
112), l'archivage conforme aux articles 42 et 43, et l'homologation de l'article 19.

## Les documents

| Fichier | Contenu |
|---|---|
| `docs/CONTRAT-TECHNIQUE.md` | La pile, le modèle de données, les règles, les routes, la direction artistique |
| `docs/CONCEPTION.md` | La conception fonctionnelle complète, et les hypothèses à confirmer |
| `docs/CADRE-PRIMATURE.md` | L'organisation de la Primature et le cadre juridique, article par article |
| `docs/PLAN-DE-RECHERCHE.md` | La recherche comparative et les 73 indicateurs de risque |
| `docs/TERMINOLOGIE.md` | Le vocabulaire imposé et la famille de systèmes |
| `docs/JOURNAL-DU-CHANTIER.md` | Les décisions prises, et pourquoi |

## Les partis pris

**Le vocabulaire est celui du droit.** On dit « prise en charge à l'inventaire », pas « entrée en
stock » ; « immatriculation », pas « numéro d'inventaire » ; « comptabilité des matières », pas
« gestion de stock ». Un cahier des charges qui emploie le vocabulaire légal se fait lire.

**Deux régimes de structures, jamais confondus.** Les structures intégrées dépendent entièrement de
la Primature et lui demandent tout. Les établissements publics autonomes ont leur personnalité
juridique, leur budget et leur comptable : leur comptabilité des matières leur appartient, et le
niveau central n'en a que la vue consolidée.

**Les seuils de passation sont des paramètres horodatés**, jamais des constantes. Une décision prise
hier doit rester jugeable avec les seuils d'hier.

**L'IA alerte, un humain décide.** Aucune décision automatique. Chaque alerte est conservée avec sa
justification et la suite qui lui a été donnée, ce qui en fait une piste d'audit.

**Toute règle de gestion est contrôlée côté serveur** et porte son test. Toute action sensible est
journalisée, et le journal n'est modifiable par personne.

## L'identité visuelle

Celle de l'État, pas celle du prestataire. Les couleurs et la typographie viennent de la **charte
graphique du Gouvernement de la RDC**, février 2022 : bleu `#0095c9` (Pantone 801 C), jaune
`#fff24b` (Pantone 803 C), rouge `#db3832` (Pantone 485 C), noir `#323230`, et la typographie
**Cooper Hewitt**, sous licence SIL Open Font.

## Licence

Logiciel développé pour la Primature de la République démocratique du Congo. Tous droits réservés,
Braintis Technology.
