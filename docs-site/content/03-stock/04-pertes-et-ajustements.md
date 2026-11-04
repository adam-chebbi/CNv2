---
title: "Pertes & ajustements"
description: "Signaler un produit cassé, périmé ou perdu, ou corriger le stock sans passer par un inventaire complet."
category: "Stock"
order: 4
---

## Où trouver cet écran

Menu **Stock → Pertes & ajustements**.

## Quand utiliser cet écran plutôt qu'un mouvement classique

Une **perte** est un cas particulier de sortie de stock : de la casse, un produit périmé jeté, une
erreur de préparation... L'intérêt de la déclarer ici plutôt que comme un simple mouvement de
sortie est de garder une trace claire du **motif de perte**, séparée des mouvements normaux — utile
pour repérer, avec le temps, les produits qui posent le plus de problème (casse fréquente,
péremption trop rapide...). Cet écran permet aussi l'opération inverse : un **ajustement** qui
augmente le stock (par exemple pour corriger une erreur de saisie antérieure sans repasser par un
inventaire complet).

## Étapes

1. Cliquez sur **Enregistrer une perte**, puis choisissez la direction : **Diminuer le stock
   (perte)** ou **Augmenter le stock (ajustement)**.

![Formulaire "Nouvelle perte / ajustement", direction Perte](/screenshots/stock-pertes-formulaire-perte.png)

2. Sélectionnez le **produit** (obligatoire) et la **zone** (obligatoire, Réserve principale ou
   Dépôt).
3. Indiquez la **quantité** (obligatoire, supérieure à 0).
4. Choisissez le **motif** (obligatoire) dans la liste : Perte, Casse, Péremption, Consommation
   interne, Produit offert, Erreur de préparation, Ajustement d'inventaire, ou Autre.
5. Renseignez la **date et l'heure** (obligatoire, par défaut maintenant) et l'**employé**
   (obligatoire) qui déclare. Sans la permission **Gestion du personnel → Sélection libre de
   l'employé**, ce champ est automatiquement verrouillé sur l'employé lié à votre compte — voir
   [Rôles et permissions](/roles-et-permissions).
6. Si le produit est suivi par lot, choisissez le **lot concerné** (obligatoire).
7. Un commentaire libre est optionnel. Cliquez sur **Vérifier**, puis confirmez.

![Formulaire "Nouvelle perte / ajustement", direction Ajustement (augmente le stock)](/screenshots/stock-pertes-formulaire-ajustement.png)

Avant de confirmer, l'écran affiche les **conséquences sur le stock** : stock actuel → nouveau
stock prévu, avec une mise en évidence rouge si le résultat deviendrait négatif.

## Effet sur le stock et les rapports

La quantité déclarée est immédiatement appliquée au stock, et l'opération apparaît dans le
**Rapport sur les stocks**, avec sa valeur (quantité × coût moyen) — ce qui permet de suivre le
coût réel de la casse et des pertes sur une période donnée. Seules les lignes de motif **Perte**
(pas les Ajustements) comptent dans les indicateurs **Quantité totale perdue** et **Valeur totale
estimée des pertes**, en haut de cette page — eux-mêmes recalculés selon les filtres actifs
(produit, catégorie, motif, zone, dates).

## Voir la suite

- [Stock](/stock)
- [Mouvements](/mouvements)
