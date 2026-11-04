---
title: "Lots & péremptions"
description: "Suivre les produits par numéro de lot et repérer ce qui approche de la date de péremption."
category: "Stock"
order: 5
---

## Où trouver cet écran

Menu **Stock → Lots & péremptions**. Cette page est une page de **consultation** — un lot ne se
crée jamais directement ici : il se crée automatiquement lors d'un **mouvement d'entrée**, et les
sorties/transferts consomment ou déplacent un lot déjà existant. Voir
[Mouvements](/mouvements).

![Écran Lots & péremptions : indicateurs, filtres et bannière d'information](/screenshots/stock-lots-liste-detail.png)

## Quels produits sont concernés

Seuls les produits marqués **"gestion par lot"** (réglage fait lors de la création de l'ingrédient,
voir [Inventaires](/inventaires)) apparaissent ici. Un bandeau en
haut de page rappelle combien de produits sont dans ce cas, et répète la règle : "Les lots se
créent lors d'un mouvement d'entrée ; les sorties et transferts consomment ou déplacent un lot
existant."

## Les trois indicateurs

- **Lots suivis** — le nombre total de lots actifs, tous statuts confondus.
- **Expiration proche** — le nombre de lots dont la péremption approche (voir ci-dessous).
- **Lots expirés** — le nombre de lots dont la date de péremption est déjà passée.

Un champ **Délai d'alerte (jours)**, à côté de l'indicateur "Expiration proche", permet d'ajuster
**temporairement, rien que pour cette page**, le nombre de jours utilisé pour classer un lot en
"Expiration proche" — la valeur par défaut (7 jours) vient de [Paramètres](/parametres-generaux).

## Comment un lot est classé

- **Expiré** — sa date de péremption est déjà passée.
- **Expiration proche** — il reste moins de jours que le délai d'alerte avant péremption.
- **Valide** — au-delà de ce délai.

## Le tableau des lots

| Colonne | Contenu |
|---|---|
| **Produit** | Le produit concerné. |
| **N° de lot** | Le numéro du lot (saisi ou généré automatiquement). |
| **Quantité** | La quantité restante dans ce lot. |
| **Zone** | Réserve principale ou Dépôt. |
| **Date de péremption** | La date renseignée à l'entrée. |
| **Statut** | Valide / Expiration proche / Expiré. |
| **Jours avant expiration** | Le nombre de jours restants (ou "Expiré depuis N j" si dépassé). |

Utilisez cette page en début de journée pour décider quoi utiliser en priorité (méthode "premier
arrivé, premier utilisé").

## Rechercher et filtrer

Recherche par produit ou numéro de lot, plus des filtres par produit, zone, statut et une date
limite ("expire avant le").

## Le numéro de lot est optionnel à la saisie

Quand vous enregistrez une entrée de stock pour un produit suivi par lot (voir
[Mouvements](/mouvements)), vous n'êtes pas obligé de connaître le numéro de
lot exact au moment de la saisie — laissez le champ vide et un numéro est généré automatiquement
(format `AUTO-AAAAMMJJ-XXXX`). Seule la **date de péremption** reste obligatoire, puisque c'est
elle qui permet le suivi.

## Voir la suite

- [Stock](/stock)
- [Mouvements](/mouvements)
