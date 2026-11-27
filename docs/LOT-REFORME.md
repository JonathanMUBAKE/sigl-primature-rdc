# Lot « circuit de réforme, avec offre de réemploi »

**Contrat du lot, arrêté par le chef de projet.** Il complète `docs/CONTRAT-TECHNIQUE.md` et se lit
après `docs/LOT-INVENTAIRE.md`, dont il reprend les habitudes : une table par objet du circuit,
chacune portant son `structure_id` sur sa propre ligne, l'isolation tenue par la base, une règle par
refus et un essai par règle.

## Pourquoi ce lot, et ce qu'il ne fera jamais

Le décret 13/050 dispose que « la cession et la mise au rebut des biens d'actif relèvent de la
compétence de l'administration en charge des domaines privés et publics de l'État ». **Le SIGL
instruit, produit le procès-verbal, saisit les domaines et suit la décision. Il ne la prend pas** —
c'est RG-016, déjà écrite et déjà testée, et ce lot ne l'assouplit en rien.

Aujourd'hui la réforme tient en un seul geste : `POST /api/biens/:id/mouvements` avec le type
`reforme`, qui exige un motif, inscrit le mouvement, passe le bien à l'état `reforme` et édite le PV.
C'est juste, mais c'est un raccourci : il n'y a ni proposition, ni commission, ni offre de réemploi,
ni saisine, ni suivi de la décision. Un bien sort donc du service sans que rien ne prouve qu'il était
inutilisable **pour toute la Primature**, et pas seulement pour la structure qui s'en lasse.

**L'étape de réemploi est le cœur économique du lot.** Avant toute saisine, le bien est offert aux
autres structures, qui peuvent le demander. Sans elle, du matériel encore utilisable est réformé d'un
côté et racheté de l'autre — c'est le gisement d'économies le plus immédiat du projet, et c'est aussi
la seule partie du circuit qui ne découle pas du décret mais d'un constat de bon sens, emprunté au
dispositif des biens excédentaires de l'administration américaine.

## Les étapes du circuit, et qui tient chacune

| # | Étape | Qui | Ce qui en sort |
|---|---|---|---|
| 1 | **Proposition de réforme** | le détenteur ou le comptable des matières | un dossier de réforme, statut `propose` |
| 2 | **Avis de la commission** | la commission désignée, plusieurs agents | un avis motivé, favorable ou non |
| 3 | **Offre de réemploi** | la logistique centrale, vers toutes les structures | une offre ouverte, avec sa date de clôture |
| 4 | **Demande de réemploi** | toute autre structure | une demande, acceptée ou écartée par la logistique |
| 5 | **Réemploi prononcé** | la logistique | un acte de transfert, et le dossier se **clôt sans réforme** |
| 6 | **Saisine des domaines** | la logistique, faute de preneur | le PV de réforme figé, et l'attente |
| 7 | **Décision des domaines** | enregistrée, jamais prononcée | la suite : cession, rebut, ou refus |

Les étapes 3 à 5 sont la nouveauté. L'étape 7 **enregistre** une décision prise ailleurs : le champ
qui la porte nomme l'autorité, la référence de l'acte et sa date. Le SIGL n'a aucune route qui
prononce une cession.

## Les règles de gestion à écrire

| N° | Règle | Fondement |
|---|---|---|
| RG-028 | Aucune saisine des domaines sans offre de réemploi close | Conception §13 |
| RG-029 | Un bien sous offre de réemploi ouverte ne se réforme pas | Conception §13 |
| RG-030 | Qui propose la réforme ne siège pas à la commission qui l'examine | Séparation des fonctions |
| RG-031 | Un avis de commission exige un motif, favorable comme défavorable | Conception |
| RG-032 | La décision des domaines s'enregistre et ne se prononce pas : elle porte son autorité, sa référence et sa date | Décret 13/050, RG-016 |

RG-015 continue de valoir : le bien ne disparaît jamais du registre, quelle que soit l'issue.

## Ce qui est demandé à l'interface

Un écran de la réforme, et une entrée visible de l'offre de réemploi — parce que l'offre ne vaut que
si les autres structures la voient. **Un chef de structure doit trouver, en deux clics depuis son
tableau de bord, la liste des biens offerts par les autres et le bouton pour en demander un.** Si
cette entrée est enfouie, l'étape 3 ne servira à rien et le lot aura manqué son seul objet
économique.

## Ce qui a été tranché, et par qui

Les trois points laissés ouverts ci-dessus ont été tranchés par le chef de projet le 27 novembre
2026, faute d'arbitre, et consignés dans `docs/JOURNAL-DU-CHANTIER.md`. Aucune décision ne reste
en attente d'un arbitre absent — c'est la règle que `COLLABORATION.md` a tirée de l'issue #1.

- **La composition de la commission** : au moins trois membres, avis à la majorité des membres ayant
  émis un avis. Posée comme **paramètre horodaté** `reforme.commission_membres_minimum`, à un seul
  endroit, pour être renversée à peu de frais. **Reste à porter à l'institution.**
- **La durée de l'offre de réemploi** : paramètre horodaté `reemploi.duree_offre_jours`, valeur de
  départ trente jours.
- **La forme de la saisine** : le PV de réforme figé en tient lieu. La question de savoir si
  l'administration des domaines attend un bordereau propre **n'est toujours pas confirmée** ⟨H⟩ ;
  le jour où elle le sera, c'est un document de plus, lié au PV par `parent_document_id`, et non un
  circuit à refaire.

Trois décisions s'y sont ajoutées, que le contrat du lot n'avait pas vues venir et qui sont
détaillées au journal : l'offre de réemploi est une **publication** qui porte sa propre copie de ce
qu'elle publie et se lit de toutes les structures ; le réemploi ne circule qu'entre structures de
régime `integre`, parce qu'au-delà c'est une cession ; et trancher une demande **prononce** le
réemploi dans la même transaction. S'y ajoute **RG-033**, qui ferme le raccourci de la réforme
directe.
