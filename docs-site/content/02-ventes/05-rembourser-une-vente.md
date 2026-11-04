---
title: "Rembourser une vente"
description: "Annuler proprement une vente déjà enregistrée : le stock et les effets comptables sont automatiquement corrigés."
category: "Ventes"
order: 5
---

## Pourquoi ne jamais supprimer une vente

Une vente saisie a déjà eu des effets : elle a déduit des ingrédients du stock (via sa fiche
technique), et elle apparaît dans les rapports. La supprimer laisserait ces effets en place sans
la vente elle-même — ce qui fausserait le stock et les chiffres. Le **remboursement** est la bonne
façon d'annuler une vente : il défait proprement tout ce que la vente avait fait, dans une seule
opération, tout ou rien.

## Étapes

1. Allez dans [Ventes](/ventes) (menu **Gestion des ventes → Ventes**).
2. Retrouvez la vente à rembourser (utilisez la recherche ou les filtres par date si besoin).
3. Sur la ligne de la vente, cliquez sur l'icône **Rembourser cette vente**.
4. Une confirmation s'affiche : *« Rembourser le ticket [numéro] ? Les ingrédients consommés
   seront réintégrés au stock… »* — confirmez.

Le bouton n'apparaît que sur les ventes encore au statut **Payé** ; une vente déjà remboursée ne
peut pas l'être une seconde fois.

## Ce qui se passe automatiquement au remboursement

- Tous les **mouvements de stock** liés à cette vente sont annulés : les ingrédients consommés par
  la fiche technique des articles vendus sont **réintégrés au stock**, dans la zone et la
  quantité exactes d'origine.
- La vente passe au statut **Remboursé** dans la liste (elle reste visible, pour garder une trace,
  mais n'est plus comptée dans le chiffre d'affaires ni dans le nombre de tickets des indicateurs).
  Le montant remboursé est cependant totalisé à part, comme indicateur, sur le
  [Rapport sur les ventes](/rapports-de-gestion).
- La vente reste **imprimable** normalement.

Ces étapes s'exécutent comme une seule opération indivisible : soit elles réussissent toutes,
soit aucune n'est appliquée — il n'y a jamais de remboursement à moitié fait.

## Qui peut rembourser une vente

Le remboursement est une action sensible (elle touche au stock et à la caisse) — seuls les comptes
ayant la permission **Ventes → Rembourser** peuvent le faire. Si le bouton n'apparaît pas pour
vous, demandez à un gérant ; voir [Rôles et permissions](/roles-et-permissions).
