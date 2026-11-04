---
title: "Ajout manuel des ventes — Mode par quantités vendues"
description: "Rattraper une journée entière en indiquant simplement combien de chaque produit a été vendu, puis vérifier le total encaissé."
category: "Ventes"
order: 3
---

## Où trouver cet écran

Menu **Gestion des ventes → Ajoute Manuelle Ventes**, puis choisissez la carte **Par quantités
vendues**.

## Pour quel contexte ce mode est fait

Ce mode ne cherche pas à reconstituer chaque ticket individuellement : il convient quand la
journée ne se prête pas à une saisie détaillée — par exemple pour rattraper toute une journée
d'un coup, ou si vous ne disposez que de totaux par produit (sans le détail table par table ou
client par client). Vous indiquez simplement **combien d'unités de chaque produit** sont parties,
puis vous vérifiez que l'argent encaissé correspond. Pour une saisie fidèle à chaque vente
individuelle, préférez le mode [Par tickets](/ajout-manuel-mode-tickets).

## Informations générales de la journée

Les mêmes trois champs que le mode par tickets : **Date**, **Shift**, **Employé** (tous
obligatoires — voir [Ajout manuel (mode Tickets)](/ajout-manuel-mode-tickets) pour le détail du
verrouillage du champ Employé selon vos permissions).

## Renseigner les quantités vendues

La liste de tous les produits du catalogue s'affiche, groupée par catégorie, comme un menu — au
repos, aucune ligne n'est développée.

1. Pour chaque produit vendu, réglez sa **quantité** avec les boutons **−** / **+** (les produits
   à 0 n'ont besoin d'aucune action).
2. Dès qu'une quantité est saisie, la ligne du produit s'ouvre et affiche deux réglages
   optionnels :

![Un produit avec sa quantité saisie, la Réduction/unité et le Dont à emporter](/screenshots/ventes-quantites-formulaire.png)

   - **Réduction / unité** — en **montant (DT)** ou en **pourcentage (%)**, appliquée soit à
     **toutes** les unités vendues de ce produit, soit à un **nombre précis** d'entre elles
     seulement (si, par exemple, seule une partie des clients a eu une remise).
   - **Dont à emporter** — combien, parmi les unités vendues, sont parties à emporter plutôt que
     consommées sur place (le reste est compté "sur place" automatiquement).

Le total (net, après réduction) de chaque ligne se recalcule en direct, ainsi qu'un récapitulatif
général en bas de page (nombre de produits actifs, unités totales, montant net).

## Vérifier les encaissements avant de confirmer

Renseignez, pour l'ensemble de la période saisie, la répartition du règlement réellement encaissé
: **Espèces**, **Carte bancaire**, **Tickets resto**. Le fonctionnement est exactement le même que
pour le mode par tickets (voir
[Ajout manuel des ventes — Mode par tickets](/ajout-manuel-mode-tickets)) : un écart entre ce total
et le total des ventes calculé demande une justification avant de pouvoir continuer.

> **Pourquoi il n'y a pas de mode de règlement ni de service par produit ici.** Contrairement au
> mode par tickets, cette saisie ne sait pas quel client a payé comment, ni pour quel produit —
> seulement des totaux globaux. L'application répartit donc automatiquement chaque quantité
> vendue entre sur place/à emporter et entre les modes de règlement, en proportion de ce que vous
> avez indiqué (à la fois la part "à emporter" de chaque produit, et la répartition globale du
> règlement) — c'est pour cette raison que chaque vente ainsi créée porte un numéro préfixé
> `QTE-`, plutôt que le préfixe habituel des tickets saisis un par un.

## Étapes

1. Renseignez les informations générales de la journée.
2. Saisissez la quantité vendue de chaque produit concerné, avec réduction et part à emporter si
   besoin.
3. Renseignez la répartition du règlement réellement encaissé.
4. Cliquez sur **Vérifier les ventes**, contrôlez le récapitulatif, puis **Confirmer et
   enregistrer**.

## Voir la suite

- [Ventes](/ventes) — les ventes ainsi créées y apparaissent avec le préfixe `QTE-`.
- [Ajout manuel des ventes — Mode par tickets](/ajout-manuel-mode-tickets)
- [Importer des ventes depuis un fichier Excel/CSV](/importer-des-ventes)
