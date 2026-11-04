---
title: "Stock"
description: "La vue d'ensemble du stock : quantités par zone, valeur, seuils et alertes — ce que chaque colonne et chaque indicateur signifie."
category: "Stock"
categoryIcon: "boxes"
categoryOrder: 3
order: 1
featured: true
featuredOrder: 2
---

## Où trouver cet écran

Menu **Stock → Stock**. C'est l'écran de **consultation** du stock — pour agir dessus (entrées,
sorties, inventaires, pertes), utilisez les pages dédiées accessibles par les boutons en haut de
page.

![Liste du stock avec les indicateurs, filtres et le tableau détaillé](/screenshots/stock-liste-produits-detail.png)

## Les trois indicateurs en haut de page

Ces trois chiffres suivent **les filtres actuellement actifs** (zone, recherche, catégorie,
statut) — ce ne sont donc pas des totaux figés, ils se recalculent à chaque changement de filtre.

- **Valeur totale du stock** — la valorisation de tous les produits affichés, **au coût moyen
  pondéré (CMP)** : pour chaque produit, quantité en stock × coût moyen d'achat, puis somme de
  tous les produits. Si une zone précise est sélectionnée, le titre affiche "(Nom de la zone)" et
  seule la quantité de cette zone est comptée.
- **Articles sous seuil** — nombre de produits dont la quantité (selon la zone filtrée) est
  strictement inférieure à leur seuil minimum configuré.
- **Alertes stock** — le nombre total de signaux actifs : un même produit peut compter pour
  plusieurs alertes à la fois (par exemple sous seuil **et** un lot qui expire bientôt), donc ce
  chiffre peut dépasser le nombre de produits en alerte.

## Rechercher et filtrer

- **Recherche** — nom du produit ou référence (SKU).
- **Zone** — Tous / Réserve principale / Dépôt. Changer la zone ne masque aucun produit : elle
  recalcule simplement la quantité, la valeur et le statut affichés pour **cette zone précisément**
  (voir ci-dessous).
- **Catégorie** — Café & Boissons, Produits laitiers, Pâtisserie & Boulangerie, Emballages &
  Consommables, Sirops & Additifs, Épicerie.
- **Statut** — voir la liste des statuts plus bas.
- **Réinitialiser** remet tous les filtres à leur valeur par défaut.

## Les deux zones de stockage

L'application ne connaît que **deux zones**, fixes : **Réserve principale** et **Dépôt** — il n'y
a pas de troisième zone à créer. Chaque produit a sa propre quantité dans chacune.

## Le tableau du stock

| Colonne | Contenu |
|---|---|
| **Produit** | Nom et référence (SKU). Colonne triable. |
| **Catégorie** | La catégorie du produit. |
| **Réserve principale / Dépôt** | La quantité dans chaque zone — affichées **uniquement quand le filtre Zone est sur "Tous"**. Si vous filtrez sur une zone précise, ces deux colonnes disparaissent au profit d'une seule quantité (voir la note ci-dessous). |
| **Stock total** (ou **Total (zone)** si une zone est filtrée) | La quantité totale du produit (les deux zones additionnées), ou la quantité de la seule zone choisie. En **rouge** si la valeur est négative. Colonne triable. |
| **Unité** | L'unité de mesure du produit (kg, g, litres, unité...), gérée depuis [Unités](/unites). |
| **Seuil min.** | Le seuil configuré pour ce produit — en dessous, il est signalé "Sous seuil". |
| **Stock cible** | Le niveau visé lors d'un réapprovisionnement (indicatif). |
| **Statut** | Un badge — voir la liste ci-dessous. |
| **Valeur du stock** | Quantité (selon la zone filtrée) × coût moyen d'achat. Colonne triable. |

> **Une petite particularité d'affichage.** Quand vous filtrez sur une zone précise (par exemple
> "Dépôt"), l'en-tête du tableau affiche à la fois "Quantité (Dépôt)" et "Total (zone)" — mais
> une seule colonne de chiffres apparaît réellement, sous "Total (zone)". Ce n'est pas une donnée
> manquante : c'est simplement que ces deux en-têtes désignent la même quantité, celle de la zone
> choisie.

## Comprendre le statut d'un produit

Chaque produit n'affiche **qu'un seul statut à la fois**, même s'il correspond à plusieurs
situations en même temps — l'application retient toujours la plus grave, dans cet ordre de
priorité :

| Priorité | Statut | Condition | Couleur du badge |
|---|---|---|---|
| 1 (la plus grave) | **Stock négatif** | Quantité < 0 | Rouge |
| 2 | **Expiré** | Au moins un lot de ce produit a dépassé sa date de péremption | Rouge |
| 3 | **Sous seuil** | Quantité positive mais inférieure au seuil minimum | Amber |
| 4 | **Expiration proche** | Au moins un lot arrive à péremption dans le délai d'alerte (7 jours par défaut, réglable dans [Paramètres](/parametres-generaux)) | Orange |
| 5 (par défaut) | **Normal** | Aucune des situations ci-dessus | Vert |

Concrètement : un produit à la fois en négatif et proche de la péremption affichera "Stock
négatif" — pas les deux badges. Filtrer par statut "Expiré" ne fera donc jamais remonter un produit
déjà classé "Stock négatif", même s'il a aussi un lot expiré.

![Filtre par zone appliqué (Dépôt) : quantités et valeurs recalculées pour cette seule zone](/screenshots/stock-liste-filtre-zone-depot.png)

## Que faire à partir de cette page

Cette page est uniquement une **vue de consultation** — les boutons en haut de page vous amènent
vers les écrans qui permettent d'agir :

- [Mouvements](/mouvements) — entrées, sorties, transferts.
- [Inventaires](/inventaires) — comptage physique et ajout de nouveaux ingrédients.
- [Pertes & ajustements](/pertes-et-ajustements)
- [Lots & péremptions](/lots-et-peremptions)
- [Unités](/unites)
- [Importer depuis un fichier Excel/CSV](/import-excel-csv)
