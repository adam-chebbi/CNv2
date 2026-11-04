---
title: "Catalogue"
description: "Gérer les catégories, sous-catégories et suppléments qui structurent le menu — la base sur laquelle repose chaque produit."
category: "Produits"
order: 4
---

## Où trouver cet écran

Menu **Gestion des produits → Catalogue**. Cette page ne gère pas les produits eux-mêmes (voir
[Produits](/produits) et [Ajout produits](/ajout-produits)) — elle gère la **structure** sur
laquelle ils reposent : les catégories, les sous-catégories, et les suppléments partagés.

![Onglet Catégories du Catalogue](/screenshots/produits-catalogue-detail.png)

Trois onglets : **Catégories**, **Sous-catégories**, **Suppléments**.

## Catégories

| Colonne | Contenu |
|---|---|
| **Nom** | Le nom de la catégorie. |
| **Sous-catégories** | Le nombre de sous-catégories qui en dépendent. |
| **Produits** | Le nombre de produits actuellement classés dans cette catégorie. |
| **Créée le** | Sa date de création. |

1. Cliquez sur **Ajouter une catégorie**.
2. Saisissez son **nom** (obligatoire, doit être unique).
3. Cliquez sur **Vérifier**, puis **Confirmer et enregistrer**.

### Supprimer une catégorie

La suppression est bloquée dans deux cas, vérifiés dans cet ordre :

1. Si des produits sont encore classés dans cette catégorie : *"{N} produit(s) utilisent cette
   catégorie."*
2. Sinon, si des sous-catégories en dépendent encore : *"{N} sous-catégorie(s) dépendent de cette
   catégorie."*

Tant que l'un des deux blocages s'applique, seul un bouton **Fermer** est proposé — la suppression
est impossible, pas seulement déconseillée.

## Sous-catégories

| Colonne | Contenu |
|---|---|
| **Nom** | Le nom de la sous-catégorie. |
| **Catégorie** | Sa catégorie parente. |
| **Produits** | Le nombre de produits qui l'utilisent. |
| **Créée le** | Sa date de création. |

1. Cliquez sur **Ajouter une sous-catégorie**.
2. Choisissez sa **catégorie parente** (obligatoire).
3. Saisissez son **nom** (obligatoire, doit être unique **au sein de cette catégorie** — deux
   catégories différentes peuvent avoir chacune une sous-catégorie du même nom).

Modifier une sous-catégorie permet aussi de la **réaffecter à une autre catégorie parente**.

### Supprimer une sous-catégorie

Bloquée si des produits l'utilisent encore : *"{N} produit(s) utilisent cette sous-catégorie."*
Une sous-catégorie n'a pas d'enfants, donc pas de second blocage comme pour les catégories.

## Suppléments

Un formulaire plus simple que les deux onglets précédents (pas d'étape de vérification séparée) :
**Nom** (obligatoire, ex : "Chantilly, Shot espresso supplémentaire") et **Prix (DT)** (obligatoire,
0 ou plus).

![Onglet Suppléments du Catalogue](/screenshots/produits-catalogue-supplements.png)

| Colonne | Contenu |
|---|---|
| **Nom** | Le nom du supplément. |
| **Prix** | Son prix, en DT. |
| **Produits** | Le nombre de produits qui le proposent actuellement. |

### Supprimer un supplément

Bloqué si au moins un produit le propose encore : *"{N} produit(s) proposent ce supplément."*

## Pourquoi "Suppléments" et pas "Extras"

Dans l'interface, cet onglet est délibérément appelé **"Suppléments"**, et non "Extras", pour ne
jamais le confondre avec **Extras** en tant que **catégorie de produits** à part entière (des
articles vendables comme "Extra Fromage") — deux notions sans rapport qui portent presque le même
nom. "Suppléments" désigne ici les ajouts optionnels et partagés (comme la chantilly), gérés dans
cet onglet et sélectionnables sur n'importe quel produit depuis
[Ajout produits](/ajout-produits).

## Rechercher

Chaque onglet propose sa propre barre de recherche (par nom uniquement), indépendante des deux
autres onglets.

## Comment cette page alimente le reste de l'application

Les catégories, sous-catégories et suppléments créés ici sont **immédiatement disponibles**
partout ailleurs dans l'application, sans étape de synchronisation supplémentaire : dans les
filtres et le formulaire de [Produits](/produits) et [Ajout produits](/ajout-produits), et dans
tout import de produits (voir [Import Excel/CSV](/import-produits-excel-csv)).

## Voir la suite

- [Produits](/produits)
- [Ajout produits](/ajout-produits)
