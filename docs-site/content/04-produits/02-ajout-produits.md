---
title: "Ajout produits"
description: "Créer ou modifier un produit vendable : informations générales, fiche technique, variantes, extras et aperçu des marges."
category: "Produits"
order: 2
featured: true
featuredOrder: 4
---

## Où trouver cet écran

Menu **Gestion des produits → Ajout produits**.

![Formulaire Ajout produits — section Informations générales](/screenshots/produits-ajout-informations-generales.png)

## Informations générales

- **Photo** — optionnelle, cliquez ou glissez une image dans le cadre.
- **Nom** (obligatoire).
- **Prix de vente (DT)** (obligatoire, doit être supérieur à 0).
- **Description** — optionnelle.
- **Catégorie** (obligatoire) — doit exister au préalable dans [Catalogue](/catalogue).
- **Sous-catégorie** — optionnelle, se débloque une fois une catégorie choisie, et doit lui
  appartenir.
- **Marge cible (optionnel)** — le taux de marge visé pour ce produit spécifiquement (ex : 0.65
  pour 65 %). Si vous ne renseignez rien, c'est la **marge cible par défaut** de l'établissement
  qui s'applique (réglable dans [Paramètres](/parametres-generaux)).
- **Taux de TVA (optionnel)** — un menu déroulant propose les taux tunisiens courants : 0 %
  (exonéré), 7 % (réduit), 13 % (intermédiaire), 19 % (standard, valeur par défaut si rien n'est
  choisi).
- **Le prix ci-dessus inclut la TVA** — bouton oui/non (oui par défaut). Détermine si le **prix de
  vente** saisi plus haut est TTC (toutes taxes comprises, le cas normal pour un prix affiché en
  carte) ou HT.
- **Disponible à la vente / Indisponible** — bascule, disponible par défaut.

## Pourquoi la marge se calcule toujours hors TVA

La **marge brute** affichée par l'application est toujours calculée sur le prix **hors taxes**
(Prix de vente HT − Coût matière), jamais sur le prix TTC — parce que la TVA collectée appartient
à l'État, pas au café : la compter dans le prix de vente gonflerait artificiellement chaque marge
affichée. Si "Le prix inclut la TVA" est activé, l'application calcule elle-même le prix HT en
retirant le taux de TVA du produit ; sinon, le prix saisi est déjà considéré comme HT.

## Fiche technique (la recette)

Optionnelle — un produit peut être vendu sans fiche technique (par exemple un article acheté déjà
fini). Cliquez sur **Ajouter un ingrédient** pour ajouter une ligne ; chaque ligne peut être de
trois natures différentes, au choix via les trois boutons **Ingrédient / Sous-recette / Produit**.

![Section Fiche technique, avec le choix entre Ingrédient, Sous-recette et Produit](/screenshots/produits-ajout-fiche-technique.png)

- **Ingrédient** — un ingrédient du stock, avec une quantité et une unité (l'unité proposée doit
  être compatible avec l'unité de stockage de l'ingrédient : par exemple un ingrédient stocké en
  kg peut être dosé en g ou en kg, jamais en litres — voir [Unités](/unites)).
- **Sous-recette** — une préparation intermédiaire déjà créée dans
  [Sous-recettes](/sous-recettes), avec une quantité dans son unité de rendement. Son coût est
  automatiquement proportionnel à la part du lot utilisée.
- **Produit** — un autre produit **déjà existant** du catalogue, utilisé comme composant d'un
  produit composé (par exemple une formule "Petit-déjeuner" faite de plusieurs produits), avec un
  simple multiplicateur (sans unité). Un produit ne peut jamais se référencer lui-même, ni
  directement ni via une chaîne d'autres produits composés — l'application bloque ce cas avec un
  message d'erreur explicite.

Le **coût matière estimé**, en haut à droite de cette section, se recalcule en direct à mesure que
vous ajoutez des lignes.

## Variantes

Une variante représente une variation du produit lui-même (taille, format...), propre à ce
produit.

![Section Variantes du formulaire produit](/screenshots/produits-ajout-variantes.png)

1. Cliquez sur **Ajouter une variante**.
2. Donnez-lui un **nom** (ex : "Grande", "Sans sucre").
3. Indiquez le **supplément de prix** en dinars, s'il y en a un (laissez à 0 s'il n'y en a pas).

Les variantes sont optionnelles — un produit reste parfaitement vendable sans aucune variante.

## Extras / suppléments

Un extra (appelé "supplément" dans l'interface) est un ajout optionnel au produit, **partagé par
tous les produits** — une fois créé, un extra comme "Chantilly" peut être proposé sur n'importe
quel produit, pas seulement celui pour lequel il a été créé la première fois.

![Section Extras / suppléments, avec la sélection d'un extra existant et la création d'un nouveau](/screenshots/produits-ajout-extras.png)

- **Utiliser un extra déjà existant** — sous "Extras existants (catalogue)", cliquez simplement
  sur son nom pour le sélectionner pour ce produit.
- **Créer un tout nouvel extra** — s'il n'existe pas encore, renseignez son nom et son prix dans
  le mini-formulaire "Créer un nouvel extra", puis cliquez sur **Ajouter** — il est créé dans le
  catalogue partagé et sélectionné automatiquement pour ce produit, sans quitter la page.

> **Pourquoi "supplément" plutôt qu'"extra".** Dans l'interface, cette section est délibérément
> appelée "Suppléments" pour ne pas la confondre avec **Extras**, qui est aussi le nom d'une vraie
> **catégorie de produits** vendables (des articles comme "Extra Fromage") — deux notions
> totalement différentes malgré le nom proche. Pour gérer ou renommer les extras/suppléments
> eux-mêmes (plutôt que d'en créer un depuis ce formulaire), voir [Catalogue](/catalogue).

## Aperçu des marges

En bas de page (et sur l'écran de vérification), quatre chiffres se recalculent en direct au fur
et à mesure de votre saisie : **Prix de vente HT**, **Coût matière**, **Marge brute** (HT − coût
matière) et **Taux de marge** (marge brute ÷ prix HT) — comparé visuellement à la marge cible du
produit (en vert si elle est atteinte ou dépassée, en rouge si elle est inférieure).

## Étapes

1. Renseignez les **informations générales**.
2. Renseignez la **fiche technique** si le produit en a une.
3. Complétez les sections **Variantes** et **Extras / suppléments** si le produit en propose.
4. Cliquez sur **Vérifier le produit**, contrôlez le récapitulatif (rien n'est encore enregistré à
   ce stade), puis **Confirmer et créer le produit**.

## Modifier un produit existant

Depuis [Produits](/produits), ouvrez le produit à modifier (icône crayon) — ce même formulaire
s'ouvre, pré-rempli avec toutes ses informations actuelles.

## Voir la suite

- [Produits](/produits)
- [Catalogue](/catalogue)
- [Sous-recettes](/sous-recettes)
