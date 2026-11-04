---
title: "Unités"
description: "Les unités utilisées pour mesurer les produits en stock, et comment fonctionne (et ne fonctionne pas) la conversion entre elles."
category: "Stock"
order: 6
---

## Où trouver cet écran

Menu **Stock → Unités**.

![Liste des unités, avec le nombre de produits qui utilisent chacune](/screenshots/stock-unites-liste.png)

## À quoi sert cette page

Chaque ingrédient en stock est mesuré dans une **unité** (kg, litres, unité...), choisie parmi
celles définies ici. C'est cette liste qui alimente le menu déroulant "Unité de stock" quand vous
[ajoutez un ingrédient](/inventaires), et qui détermine les unités
proposées pour les lignes de recette dans [Ajout produits](/ajout-produits).

## Le tableau des unités

| Colonne | Contenu |
|---|---|
| **Nom** | Le nom de l'unité (ex : "kg", "litres", "unité"). |
| **Produits associés** | Le nombre de produits en stock qui utilisent actuellement cette unité. |
| **Créée le** | La date de création de l'unité. |
| **Actions** | Un bouton pour la modifier. |

## Ajouter une unité

1. Cliquez sur **Ajouter une unité**.
2. Saisissez son **nom** (obligatoire) — il doit être différent, y compris à l'accent ou à
   l'espace près, de toute unité déjà existante.

![Formulaire "Nouvelle unité"](/screenshots/stock-unites-formulaire-creation.png)

3. Cliquez sur **Vérifier**, contrôlez le récapitulatif, puis **Confirmer et enregistrer**.

## Renommer une unité déjà utilisée

Cliquez sur l'icône crayon d'une unité pour la renommer. Si elle est déjà utilisée par des
produits, un message vous prévient : "{N} produit(s) utilisent actuellement cette unité et seront
mis à jour avec le nouveau nom" — ce n'est pas un blocage, juste une information : en confirmant,
**tous les produits concernés basculent automatiquement vers le nouveau nom**, sans que vous ayez
à les modifier un par un.

## Il n'est pas possible de supprimer une unité

Une unité, une fois créée, ne peut être que **renommée** — il n'existe pas de bouton de
suppression, qu'elle soit utilisée ou non par des produits.

## Comment fonctionne (et ne fonctionne pas) la conversion entre unités

C'est le point le plus important à comprendre sur cette page, car il a un effet concret ailleurs
dans l'application (fiches techniques des produits, imports) : **la conversion automatique entre
unités ne fonctionne que pour 4 noms précis** — `g`, `kg`, `ml` et `litres` — regroupés en deux
familles :

- **Masse** : g ↔ kg.
- **Volume** : ml ↔ litres.

Une unité de masse ne se convertit jamais vers une unité de volume (ni l'inverse), et **toute
autre unité que ces quatre noms exacts** (par exemple "unité", "pièce", ou une unité que vous
créez vous-même comme "cl" ou "sachet") n'est reconnue par aucune conversion automatique : elle ne
peut être utilisée que là où elle correspond **exactement**, nom pour nom.

> **Ce que ça change concrètement.** Dans la fiche technique d'un produit (voir
> [Ajout produits](/ajout-produits)), quand vous ajoutez un ingrédient stocké en
> "kg", le menu déroulant de l'unité de la ligne de recette ne propose que "kg" et "g" (les deux
> seules unités compatibles) — jamais "litres" ou une unité personnalisée sans rapport. De même,
> lors d'un [import de mouvements de stock](/import-excel-csv), une colonne "unité" fournie à titre de
> vérification doit correspondre **exactement** à l'unité réelle du produit, sans conversion
> possible : "kg" et "g" ne sont, dans ce cas précis, pas interchangeables automatiquement.

## Voir la suite

- [Stock](/stock)
- [Inventaires](/inventaires)
- [Ajout produits](/ajout-produits)
