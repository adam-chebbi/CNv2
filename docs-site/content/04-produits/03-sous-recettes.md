---
title: "Sous-recettes"
description: "Composants de recette réutilisables (une pâte, une sauce...) partagés par plusieurs produits — création, coût, et imbrication."
category: "Produits"
order: 3
---

## À quoi sert une sous-recette

Une sous-recette est une préparation intermédiaire, faite à partir d'ingrédients (et éventuellement
d'autres sous-recettes), et qui sert elle-même d'ingrédient dans un ou plusieurs produits (par
exemple une pâte à crêpe utilisée par tous les produits "crêpe" du menu, ou une sauce maison). Elle
évite de ressaisir la même recette dans chaque produit qui l'utilise, et permet de calculer son
coût une seule fois — si son coût change (un ingrédient plus cher), tous les produits qui
l'utilisent se recalculent automatiquement.

## Où trouver cet écran

Menu **Gestion des produits → Sous-recettes**.

![Liste des sous-recettes, avec rendement, composants, coût et utilisation](/screenshots/sous-recettes-liste.png)

## Le tableau des sous-recettes

| Colonne | Contenu |
|---|---|
| **Nom** | Le nom de la sous-recette. |
| **Rendement** | La quantité produite par lot, avec son unité (ex : "1000 g"). |
| **Composants** | Le nombre d'ingrédients/sous-recettes qui la composent. |
| **Coût du lot** | Le coût total estimé d'un lot complet. |
| **Utilisée par** | Combien de produits (ou d'autres sous-recettes) la référencent actuellement. |
| **Créée le** | La date de création. |
| **Actions** | Modifier, Supprimer. |

## Créer une sous-recette

1. Cliquez sur **Ajouter une sous-recette**.
2. Donnez-lui un **nom** (obligatoire, doit être unique parmi les sous-recettes existantes).
3. Indiquez la **quantité produite** (obligatoire, ex : 1000) et l'**unité** (obligatoire, ex :
   "g" si la préparation se compte en grammes une fois prête) — c'est dans cette unité que le lot
   entier est costé et consommé par les produits qui l'utilisent.
4. Une description est optionnelle.

![Formulaire "Nouvelle sous-recette"](/screenshots/sous-recettes-formulaire-creation.png)

5. Dans la section **Composition**, cliquez sur **Ajouter un composant**, puis ajoutez les
   ingrédients (ou d'autres sous-recettes) qui la composent, chacun avec sa quantité et une unité
   compatible. Au moins un composant est requis.
6. Cliquez sur **Vérifier la sous-recette**, contrôlez le récapitulatif, puis confirmez.

## Imbriquer une sous-recette dans une autre

Une sous-recette peut elle-même utiliser une autre sous-recette comme composant — pratique pour
des préparations à plusieurs étages (par exemple une "Base" utilisée dans une "Sauce", elle-même
utilisée dans un produit final). La seule limite : une sous-recette ne peut jamais se référencer
elle-même, ni directement ni via une chaîne d'imbrications — l'application détecte et bloque ce
cas de figure ("Référence circulaire détectée").

## Comprendre le coût

Le **coût du lot estimé** s'affiche en direct pendant la saisie (somme du coût de chaque
composant). Sur l'écran de vérification, un **coût par unité de rendement** est aussi calculé
(coût du lot ÷ quantité produite) — c'est exactement ce chiffre qui est utilisé quand un produit
consomme une partie de cette sous-recette dans sa propre fiche technique.

## Utiliser une sous-recette dans un produit

Une fois créée, une sous-recette apparaît dans la liste des ingrédients disponibles quand vous
composez la fiche technique d'un produit (voir [Ajout produits](/ajout-produits)) — vous pouvez
l'utiliser exactement comme un ingrédient normal.

## Supprimer une sous-recette

La colonne "Utilisée par" indique, pour chaque sous-recette, son nombre d'utilisations (par des
produits ou par d'autres sous-recettes). Une sous-recette encore utilisée **ne peut pas être
supprimée** — il faut d'abord la retirer de tout ce qui la référence.

## Voir la suite

- [Ajout produits](/ajout-produits)
- [Importer des sous-recettes depuis un fichier](/import-produits-excel-csv)
