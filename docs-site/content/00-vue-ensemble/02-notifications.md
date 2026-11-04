---
title: "Notifications & Alertes"
description: "Le centre d'alertes opérationnelles : ce que chaque type d'alerte signale, comment le traiter, et à qui c'est réservé."
category: "Vue d'ensemble"
order: 2
---

## Où trouver cet écran

Menu **Notifications & Alertes** (accessible directement depuis la barre latérale). Nécessite la
permission **Notifications & Alertes → Consulter**.

![Liste des alertes actives](/screenshots/notifications-liste-alertes.png)

## À quoi sert cette page

C'est le centre d'alertes opérationnelles de Café Noir : stock, péremption, fournisseurs et marges.
Le sous-titre de la page le précise explicitement : **ces alertes s'affichent uniquement dans
l'application** — aucun SMS, WhatsApp ou e-mail n'est envoyé pour l'instant.

## Un point essentiel à comprendre : d'où viennent ces alertes

Il n'existe **pas de liste d'alertes stockée quelque part** que le système remplit au fil de
l'eau. À chaque fois que vous ouvrez cette page, l'application **rescanne en direct** l'état actuel
du stock, des lots, des factures fournisseurs et des marges des produits, et reconstruit la liste
complète des situations qui posent problème **à cet instant précis**. Concrètement :

- Une alerte apparaît dès que la situation qui la déclenche existe (par exemple un produit descend
  sous son seuil de stock).
- Elle **disparaît automatiquement**, sans aucune action de votre part, dès que la situation est
  corrigée (le produit est réapprovisionné, la facture est payée, etc.) — il n'y a rien à "fermer"
  ni à supprimer.
- La seule chose que l'application retient réellement, dans sa base de données, est le fait que
  **vous ayez marqué une alerte comme traitée** (voir plus bas) — ce marquage est partagé par toute
  l'équipe, sur tous les appareils.

## Les indicateurs en haut de page

- Un badge à côté du titre affiche le nombre total d'alertes **non traitées**, toutes catégories
  confondues.
- Quatre cartes résument, par niveau de sévérité, le nombre d'alertes **non traitées** : Critique,
  Important, Attention, Information. Cliquer sur une carte l'utilise directement comme filtre de
  sévérité.

> **Le niveau "Information" est actuellement toujours à zéro.** Aucune des situations que
> l'application sait détecter aujourd'hui n'est classée à ce niveau — les quatre types existants
> (voir le tableau plus bas) sont tous classés Critique, Important ou Attention. Ce n'est pas un
> bug : c'est prévu pour un usage futur, pas encore utilisé.

## Les types d'alertes, et ce qui les déclenche exactement

| Type | Sévérité | Se déclenche quand… | Vous amène vers |
|---|---|---|---|
| Stock négatif | Critique | La quantité en stock d'un produit est passée sous 0 — signe d'une erreur de saisie ou d'un mouvement non enregistré. | Stock |
| Rupture de stock | Important | La quantité en stock d'un produit est tombée exactement à 0. | Stock |
| Stock faible | Attention | La quantité en stock est positive mais sous le seuil minimum défini pour ce produit. | Stock |
| Produit périmé | Critique | Un lot encore en stock (quantité > 0) a dépassé sa date de péremption. | Lots & péremptions |
| Péremption proche | Attention | Un lot arrive à péremption dans les prochains jours — la fenêtre par défaut est de 7 jours, réglable dans [Paramètres](/parametres-generaux). | Lots & péremptions |
| Facture en retard | Critique | Une facture fournisseur non entièrement payée a dépassé sa date d'échéance. | Factures |
| Échéance proche | Attention | Une facture non payée arrive à échéance dans les 7 prochains jours. | Factures |
| Écart de stock important | Important | Un inventaire confirmé récemment (fenêtre par défaut : 60 jours) a révélé un écart dont la valeur dépasse le seuil défini (30 DT par défaut) — voir [Paramètres](/parametres-generaux). | Inventaires |
| Marge sous l'objectif | Important ou Attention | Un produit avec une fiche technique vend en dessous de sa marge cible (65 % par défaut, ou la marge cible propre au produit si elle a été définie) — sévérité Important si la marge est carrément négative, Attention sinon. | Gestion des produits |

Un produit ne peut déclencher **qu'une seule** des trois alertes de stock à la fois (négatif,
rupture, ou faible) — c'est toujours le cas le plus grave qui s'affiche pour ce produit.

## Ce que montre chaque ligne d'alerte

- Un badge de **sévérité** et le **type** d'alerte.
- Un badge de **statut** : **Non traité** ou **Traité**.
- Un **titre** et une **description** expliquant précisément la situation (avec les chiffres
  concernés : quantité, montant, nombre de jours...).
- L'**élément concerné** (nom du produit, numéro de lot, numéro de facture...).
- La **date** de détection de l'alerte, au format JJ/MM/AAAA (une date précise, pas un "il y a X
  jours" — contrairement à la carte "Principales alertes" du tableau de bord, qui affiche cette
  même information en temps relatif).

Cliquez sur l'icône **œil** pour voir le détail complet d'une alerte, y compris une **action
recommandée** en texte clair (par exemple : *"Retirer le lot du stock et enregistrer une perte pour
péremption."*). L'icône de **flèche** vous amène directement dans le module concerné (Stock,
Factures, Lots...).

## Rechercher et filtrer

- Une **recherche libre** (titre, produit, facture...).
- Un filtre par **type**, par **sévérité**, et par **statut**.
- Un interrupteur **Afficher uniquement les alertes non traitées**.
- Un bouton **Réinitialiser** efface tous les filtres actifs.

La liste est paginée (8 alertes par page).

## Marquer une alerte comme traitée

1. Sur la ligne de l'alerte (ou dans sa fenêtre de détail), cliquez sur l'icône **Marquer comme
   traité**.
2. L'alerte passe au statut **Traité** — ce changement est enregistré côté serveur, avec votre nom
   et l'heure, et reste visible par **toute l'équipe**, sur n'importe quel appareil.

Pour revenir en arrière, utilisez l'icône **Marquer comme non traité** sur une alerte déjà traitée.

> **Traiter une alerte ne corrige rien automatiquement.** Marquer une alerte comme "Traité" note
> seulement que quelqu'un s'en est occupé — cela ne change ni le stock, ni une facture, ni un prix.
> Si la situation qui a déclenché l'alerte existe encore, l'alerte réapparaîtra "Non traité" dès
> qu'elle sera recalculée si la cause sous-jacente n'a pas réellement été corrigée. À l'inverse, si
> vous corrigez la cause (vous réapprovisionnez le produit, par exemple) sans cliquer sur "traité",
> l'alerte disparaît simplement d'elle-même, sans qu'il y ait besoin de la traiter.

### Traiter plusieurs alertes d'un coup

Le bouton **Marquer les alertes affichées comme traitées**, en haut de page, traite en une seule
fois **toutes les alertes qui correspondent aux filtres actuellement actifs** (pas seulement celles
visibles sur la page en cours) — utile par exemple pour traiter d'un coup toutes les alertes de
type "Péremption proche" une fois la vérification faite.

## Qui peut faire quoi

Voir les alertes nécessite la permission **Notifications & Alertes → Consulter** ; les marquer
comme traitées (ou revenir en arrière) nécessite **Notifications & Alertes → Traiter**. Si votre
compte n'a que la permission de consultation, les boutons de traitement restent visibles à l'écran,
mais l'action sera refusée par le serveur — un message d'erreur s'affichera.

## Le lien avec la carte "Principales alertes" du tableau de bord

Le [Tableau de bord](/tableau-de-bord) affiche, sur sa carte "Principales alertes", les **4**
alertes les plus importantes calculées par ce même moteur — mais c'est un aperçu simplifié, pas un
raccourci vers cette page : il n'a pas connaissance des alertes marquées "Traité" ici, et son
propre bouton d'action se contente de masquer temporairement l'alerte sur votre écran (jusqu'au
prochain rechargement), sans rien enregistrer. Pour un suivi réel, partagé par toute l'équipe,
utilisez toujours cette page **Notifications & Alertes**.

## Voir la suite

- [Tableau de bord](/tableau-de-bord)
- [Paramètres](/parametres-generaux) — pour ajuster les seuils qui déclenchent certaines alertes.
