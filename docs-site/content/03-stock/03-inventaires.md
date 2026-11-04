---
title: "Inventaires"
description: "Comptage physique du stock réel, comparaison avec le stock théorique, ajustement des écarts, et ajout de nouveaux ingrédients."
category: "Stock"
order: 3
featured: true
featuredOrder: 2
---

## Où trouver cet écran

Menu **Stock → Inventaires**. Cette page sert à deux choses différentes : **lancer un inventaire**
(compter le stock réel et corriger d'éventuels écarts) et **ajouter un nouvel ingrédient** au
système.

![Écran Inventaires : lancement d'un inventaire et historique des écarts](/screenshots/stock-inventaires-choix-type.png)

## Lancer un nouvel inventaire

1. Choisissez le **type d'inventaire** : **Inventaire complet** (tous les produits), **Inventaire
   par catégorie** (choisissez la catégorie), ou **Inventaire par zone** (choisissez Réserve
   principale ou Dépôt). Le nombre de produits concernés s'affiche en direct.
2. Cliquez sur **Lancer l'inventaire**.
3. Indiquez qui **réalise** l'inventaire (champ **Réalisé par**, obligatoire). Sans la permission
   **Gestion du personnel → Sélection libre de l'employé**, ce champ est automatiquement verrouillé
   sur l'employé lié à votre compte — voir [Rôles et permissions](/roles-et-permissions).
4. Pour chaque produit concerné, saisissez le **Stock réel** compté physiquement — le **Stock
   théorique** (ce que le système pense avoir : le total des deux zones, ou la quantité d'une
   seule zone si l'inventaire est fait "Par zone") s'affiche à côté, en lecture seule, et
   l'**Écart (aperçu)** — Stock réel − Stock théorique — se calcule et s'affiche en direct dès que
   vous saisissez un chiffre, en rouge si l'écart est négatif.

![Comptage d'un inventaire, avec l'écart calculé en direct pour le premier produit compté](/screenshots/stock-inventaires-comptage-ecart.png)

5. Une fois tous les produits comptés, cliquez sur **Vérifier l'inventaire**. L'écran de
   vérification affiche : le nombre de produits comptés, le nombre d'écarts détectés, et la valeur
   totale de l'écart (quantité en écart × coût moyen d'achat).
6. Pour chaque écart, choisissez comment le traiter : **Ajuster le stock au stock réel** (le
   système adopte le chiffre que vous avez compté — le stock change réellement) ou **Conserver le
   stock théorique** (le stock système n'est pas modifié, l'écart est noté à titre indicatif
   uniquement).

Dans les deux cas, l'écart reste **visible dans l'historique des inventaires**, en bas de page —
rien n'est jamais silencieusement effacé, même un écart "conservé" (non appliqué au stock) laisse
une trace. Si l'inventaire n'est pas fait "Par zone", un ajustement s'applique par convention à la
**Réserve principale**.

## L'historique des écarts d'inventaire

En bas de page, un tableau récapitule tous les écarts déjà constatés — qu'ils viennent d'un
inventaire manuel ou d'un [import de fichier](/import-excel-csv) — avec pour chacun : la date, le
produit, la **portée** (zone/catégorie concernée, ou la mention de l'import dont il provient), le
stock théorique, le stock réel, l'écart, sa valeur en DT, et le choix retenu (**Ajusté** ou
**Conservé**).

## Ajouter un ou plusieurs nouveaux ingrédients

Pour créer un ingrédient qui n'existe pas encore dans le système (par exemple un nouveau produit
que vous venez d'acheter pour la première fois) :

1. Cliquez sur **Ajout inventaire ou ingrédient**, en haut de la page.
2. Remplissez la fiche du premier ingrédient :
   - **Nom de l'ingrédient** (obligatoire) — doit être différent de tout ingrédient déjà existant.
   - **Catégorie** (obligatoire) — Café & Boissons, Produits laitiers, Pâtisserie & Boulangerie,
     Emballages & Consommables, Sirops & Additifs, ou Épicerie.
   - **Unité de stock** (obligatoire) — l'unité dans laquelle ce produit se compte, choisie parmi
     celles définies dans [Unités](/unites).
   - **Coût moyen d'achat (DT)** (obligatoire) — sert de base à toutes les valorisations (valeur
     du stock, coût matière des produits, valeur des pertes, écarts d'inventaire).
   - **Référence (SKU)** — optionnelle : si vous la laissez vide, une référence est générée
     automatiquement à partir du nom (ex : `ING-CAFE-ARABICA-1KG`).
   - **Stock initial** — un champ pour la Réserve principale, un pour le Dépôt (0 par défaut).
   - **Seuil minimum** — la quantité en dessous de laquelle ce produit sera signalé "Sous seuil"
     sur la page [Stock](/stock).
   - **Stock cible** — le niveau visé lors d'un réassort (purement indicatif, ne déclenche pas
     d'alerte).
   - **Gestion par lot** (case à cocher, désactivée par défaut) — à cocher si ce produit doit être
     suivi par numéro de lot et date de péremption à chaque entrée en stock (voir
     [Lots & péremptions](/lots-et-peremptions)).
3. Pour ajouter un deuxième ingrédient dans la foulée, cliquez sur **Ajouter un ingrédient** — un
   nouveau formulaire vide apparaît en dessous, sans perdre le premier. Répétez autant de fois que
   nécessaire.
4. Une fois tous les ingrédients renseignés, cliquez sur **Enregistrer** — ils sont tous créés en
   même temps.

![Formulaire d'ajout d'un nouvel ingrédient](/screenshots/stock-inventaires-ajout-ingredient.png)

> **Le numéro de lot est optionnel.** Si l'ingrédient est suivi par lot, vous ne le renseignez pas
> ici — il n'est demandé qu'au moment où vous enregistrez la première **entrée** de stock pour cet
> ingrédient (voir [Mouvements](/mouvements)), et même à ce moment-là il
> reste optionnel : un numéro est généré automatiquement si vous ne le connaissez pas encore.

## Importer plusieurs ingrédients ou un comptage depuis un fichier

Si vous avez une longue liste de nouveaux ingrédients à créer d'un coup, ou un comptage
d'inventaire déjà fait sur papier/tableur, il est plus rapide de passer par
[Import Excel/CSV](/import-excel-csv) plutôt que de tout saisir un par un ici — le formulaire manuel et
l'import utilisent exactement les mêmes règles de validation, pour que les deux ne divergent
jamais.

## Voir la suite

- [Stock](/stock)
- [Mouvements](/mouvements)
- [Unités](/unites)
