---
title: "Import Excel/CSV (Produits)"
description: "Importer en masse, depuis un fichier, de nouveaux produits (avec leurs variantes, extras et fiches techniques) ou de nouvelles sous-recettes."
category: "Produits"
order: 5
---

## Où trouver cet écran

Menu **Gestion des produits → Import Excel/CSV**.

## Deux types d'import différents

Cet écran propose un choix entre **deux imports distincts**, chacun avec son propre fichier et ses
propres colonnes : **Produits** et **Sous-recettes**.

![Choix entre l'import de Produits et l'import de Sous-recettes](/screenshots/produits-import-upload.png)

Règles communes aux deux : fichier `.csv`, `.xlsx` ou `.xls`, 5 Mo maximum, 2000 lignes maximum, et
un bouton pour télécharger un modèle déjà au bon format. Dans les deux cas, l'import se fait en
deux temps — un **aperçu** modifiable (rien n'est encore créé), puis une **confirmation**
explicite — et le bouton de confirmation reste désactivé tant qu'il reste au moins une ligne en
erreur dans le fichier.

## 1. Import "Produits"

Une ligne = un produit complet : informations générales, variantes, extras **et fiche technique**,
le tout en une seule fois.

![Import "Produits" : zone de dépôt et colonnes attendues](/screenshots/produits-import-produits-upload.png)

| Colonne | Obligatoire | Règle |
|---|---|---|
| `nom` | Oui | Le nom du nouveau produit. |
| `description` | Non | Texte libre. |
| `prix` | Oui | Le prix de vente (nombre positif). |
| `categorie` | Oui | Doit déjà exister dans [Catalogue](/catalogue). |
| `sous_categorie` | Non | Doit déjà exister, et appartenir à la catégorie indiquée. |
| `disponibilite` | Non | "Oui" ou "Non" ; vide = disponible par défaut. |
| `variantes` | Non | Séparées par `\|`, au format "Nom:supplément" (ex : `"Petite:0\|Moyenne:1\|Grande:2"`). |
| `extras` | Non | Extras déjà existants, séparés par `\|` (ex : `"Chantilly\|Sirop caramel"`). |
| `fiche_technique` | Non | Les composants de la recette, séparés par `\|` — voir la syntaxe ci-dessous. |

### La syntaxe de la fiche technique dans le fichier

Trois formats possibles pour chaque composant, séparés par `|` :

- **Ingrédient** : `Ingrédient:Quantité:Unité` — ex : `Café:80:g`.
- **Sous-recette existante** : `SOUSRECETTE:Nom:Quantité:Unité` — ex :
  `SOUSRECETTE:Pâte à Crêpe Maison:150:g`. La sous-recette référencée doit déjà exister (créée à
  la main, ou importée dans un fichier séparé au préalable).
- **Produit composé** : `PRODUIT:Nom:Quantité` (sans unité, un simple nombre d'unités) — ex :
  `PRODUIT:Cappuccino:1`, pour un produit "Menu" fait de plusieurs produits déjà existants. Le
  produit référencé doit lui aussi déjà exister dans le catalogue — **il ne peut pas se trouver
  dans la même ligne, ni ailleurs dans le même fichier**.

> **Important : ce fichier ne fait aucune vérification de doublon.** Contrairement aux imports de
> Stock ou de Sous-recettes, importer un produit avec un nom déjà utilisé **ne le met pas à jour**
> et n'est pas non plus rejeté — il crée un **second produit séparé, portant le même nom**.
> Vérifiez toujours vos noms de produits avant de confirmer un import, pour éviter des doublons
> dans le catalogue.

## 2. Import "Sous-recettes"

Une ligne = une **nouvelle** sous-recette.

![Import "Sous-recettes" : zone de dépôt, bandeau explicatif et colonnes attendues](/screenshots/produits-import-sousrecettes-upload.png)

| Colonne | Obligatoire | Règle |
|---|---|---|
| `nom` | Oui | Doit être unique — s'il existe déjà, la ligne est **rejetée** (voir ci-dessous), modifiez la sous-recette directement dans [Sous-recettes](/sous-recettes) plutôt que de la réimporter. |
| `description` | Non | Texte libre. |
| `rendement_quantite` | Oui | La quantité produite par lot (ex : 1000). |
| `rendement_unite` | Oui | Une unité de stock existante pour ce rendement (ex : g, ml). |
| `ingredients` | Oui | Les composants, séparés par `\|` — même syntaxe que ci-dessus : `Ingrédient:Quantité:Unité`, ou `SOUSRECETTE:Nom:Quantité:Unité` pour imbriquer une sous-recette déjà existante. |

> **Contrairement à l'import "Produits", celui-ci refuse les doublons.** Si le nom d'une ligne
> correspond à une sous-recette déjà existante, elle est rejetée avec le message : *"Une
> sous-recette « [nom] » existe déjà — modifiez-la directement plutôt que de la réimporter."*
>
> **Une sous-recette imbriquée (`SOUSRECETTE:...`) doit déjà exister avant l'import** — y compris
> si elle est définie sur une autre ligne du **même fichier** : deux lignes ne peuvent pas se
> référencer l'une l'autre dans un seul import, même si la première ligne est par ailleurs valide.

## L'aperçu avant confirmation

Chaque ligne s'affiche sous forme de carte, dépliable, avec un résumé (variantes, extras, nombre
de lignes de fiche technique pour un produit ; rendement et composants pour une sous-recette). Une
ligne en erreur affiche la liste de ses erreurs en rouge.

- Pour l'import **Produits**, seuls les champs **Nom, Prix, Catégorie, Sous-catégorie et
  Disponibilité** sont corrigeables directement dans l'aperçu — une erreur sur les **variantes,
  extras ou la fiche technique** ne peut être corrigée qu'en modifiant le fichier source et en le
  réimportant (bouton **Remplacer le fichier**).
- Pour l'import **Sous-recettes**, aucun champ n'est corrigeable dans l'aperçu — la seule action
  possible sur une ligne est de la **retirer** de l'import ; toute correction passe par le fichier
  source.

## Voir la suite

- [Produits](/produits)
- [Ajout produits](/ajout-produits)
- [Sous-recettes](/sous-recettes)
- [Catalogue](/catalogue)
