---
title: "Produits"
description: "Le catalogue complet des produits vendus : prix, coût matière, marges, disponibilité — et la fiche détaillée de chaque produit."
category: "Produits"
categoryIcon: "chef-hat"
categoryOrder: 4
order: 1
featured: true
featuredOrder: 3
---

## Où trouver cet écran

Menu **Gestion des produits → Produits**.

![Liste des produits, avec indicateurs, filtres et tableau détaillé](/screenshots/produits-liste-detail.png)

## Les trois indicateurs en haut de page

Contrairement à d'autres pages de l'application, ces trois chiffres portent toujours sur
**l'ensemble du catalogue**, pas sur la sélection filtrée à l'écran :

- **Produits** — le nombre total de produits dans le catalogue.
- **Produits disponibles** — combien, sur ce total, sont actuellement en vente (X / total).
- **Marge moyenne estimée** — la moyenne du taux de marge, calculée uniquement sur les produits
  qui ont **à la fois** une fiche technique et un prix renseigné (un produit sans recette n'a pas
  de marge calculable, donc n'entre pas dans cette moyenne).

## Rechercher et filtrer

- **Recherche** — par nom de produit.
- **Catégorie** — la liste des catégories définies dans [Catalogue](/catalogue).
- **Sous-catégorie** — se limite automatiquement aux sous-catégories de la catégorie choisie.
- **Disponibilité** — Toutes / Disponible / Indisponible.
- **Réinitialiser** remet tous les filtres à zéro.

## Le tableau des produits

| Colonne | Contenu |
|---|---|
| **Photo** | La photo du produit, ou une icône vide si aucune n'a été ajoutée. |
| **Nom** | Le nom du produit. |
| **Catégorie / Sous-catégorie** | Telles que définies sur la fiche du produit. |
| **Prix** | Le prix de vente tel que saisi (TTC ou HT selon le réglage du produit). |
| **Coût matière** | Calculé à partir de la fiche technique — 0 si le produit n'en a pas. |
| **Marge brute (HT)** | Prix de vente hors taxes moins le coût matière (l'info-bulle de l'en-tête le rappelle explicitement). |
| **Taux marge** | Marge brute ÷ prix HT, en %. En **vert** si le taux dépasse la marge cible du produit, en **rouge** s'il est inférieur, en gris s'il correspond exactement à la cible. |
| **Disponibilité** | Un badge cliquable — voir ci-dessous. |
| **Variantes / Extras** | Le nombre de variantes et d'extras associés au produit. |
| **Actions** | Consulter (œil), Modifier (crayon), Supprimer (corbeille). |

## Rendre un produit indisponible sans le supprimer

Cliquez directement sur le badge **Disponible / Indisponible** d'un produit pour basculer son
état — **sans aucune confirmation demandée**, l'effet est immédiat. Un produit indisponible
n'apparaîtra plus dans aucun mode de vente (saisie manuelle, quantités, import), mais son
historique (ventes passées, recette) reste intact, et il reste modifiable normalement.

## Consulter le détail d'un produit

Cliquez sur l'icône **œil (Consulter)** pour ouvrir la fiche complète du produit, sans quitter la
liste.

![Fiche détaillée d'un produit : prix, coût, marge, fiche technique, variantes et extras](/screenshots/produits-detail-modal.png)

Cette fenêtre affiche : la catégorie/sous-catégorie et la disponibilité, le **prix** (avec sa
valeur HT en petit, sous le prix affiché), le **coût matière**, la **marge brute**, le **taux de
marge** (avec la marge cible utilisée pour la comparaison, entre parenthèses), la **fiche
technique** complète (chaque ingrédient ou sous-recette avec sa quantité), les **variantes**, et
les **extras / suppléments** associés.

> **Astuce.** L'adresse de cette page peut inclure `?product=<identifiant>` — un lien partageable
> qui rouvre directement la fiche d'un produit précis si vous le collez dans votre navigateur.

## Modifier un produit

Cliquez sur l'icône **crayon (Modifier)** — le formulaire [Ajout produits](/ajout-produits)
s'ouvre, entièrement pré-rempli avec les informations actuelles du produit (y compris sa fiche
technique, ses variantes et ses extras).

## Supprimer un produit

Cliquez sur l'icône **corbeille (Supprimer)**. Une confirmation s'affiche : *« Voulez-vous
vraiment supprimer [nom] ? Cette action est irréversible. »* — il n'existe **aucune vérification
préalable** sur les ventes passées ou toute autre donnée liée au produit ; contrairement aux
catégories, sous-catégories ou suppléments (voir [Catalogue](/catalogue)), un produit peut
toujours être supprimé, même s'il a déjà été vendu.

## Ajouter de nouveaux produits

Cette page est une page de **consultation et de gestion au cas par cas** — pour créer un nouveau
produit, ou en importer plusieurs à la fois :

- [Ajout produits](/ajout-produits)
- [Importer depuis un fichier Excel/CSV](/import-produits-excel-csv)
