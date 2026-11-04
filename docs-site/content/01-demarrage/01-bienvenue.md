---
title: "Vue d'ensemble du système Café Noir"
description: "Ce qu'est le système, ce qu'il gère, comment ses différentes parties sont reliées entre elles, et ce qu'il apporte au café."
category: "Démarrage"
categoryIcon: "rocket"
categoryOrder: 1
order: 1
featured: true
featuredOrder: 1
---

## Qu'est-ce que le système de gestion Café Noir ?

Le système de gestion Café Noir est la solution complète que toute l'équipe utilise au quotidien
pour faire fonctionner le café : enregistrer les ventes, suivre le stock, gérer les achats auprès
des fournisseurs, suivre les dépenses, gérer l'équipe, et obtenir une vue claire de la santé
financière de l'établissement. Il remplace le besoin de tenir ces informations séparément (carnets,
tableurs, mémoire) en les réunissant dans un seul outil, accessible depuis un ordinateur ou un
téléphone.

Son objectif est simple : que chaque personne de l'équipe — caissier(ère), gérant(e), comptable —
sache toujours où en est le café, sans avoir à recouper des informations venues de partout.

## Que gère le système ?

Le système couvre l'ensemble des activités d'un café, du comptoir jusqu'à la comptabilité de
gestion :

- **Les ventes** — chaque vente réalisée, qu'elle soit consommée sur place (avec un numéro de
  table) ou à emporter, avec son mode de règlement.
- **Les produits et leurs recettes** — la carte du café, avec pour chaque produit ce qu'il faut
  pour le préparer et ce que ça coûte réellement.
- **Le stock** — les quantités d'ingrédients disponibles, leur suivi par lot et date de
  péremption, et les mouvements qui les font varier.
- **Les achats et les fournisseurs** — les commandes passées, leur réception, et l'historique des
  prix payés à chaque fournisseur.
- **Les factures** — le suivi des factures reçues et de leur règlement.
- **Les dépenses** — les charges du café (loyer, électricité, fournitures, etc.) et leur suivi.
- **L'équipe** — les fiches employé, le planning, la présence, et le suivi financier (salaires,
  avances, primes).
- **Les rapports et la rentabilité** — une vue consolidée des ventes, achats, dépenses et marges,
  pour suivre la santé financière du café dans le temps.
- **La vitrine web et le menu numérique** — un site public qui présente le café et son menu aux
  clients en ligne, alimenté directement par les produits gérés dans le système.

## Les modules principaux du système

L'application est organisée en modules, chacun dédié à un domaine précis :

| Module | À quoi il sert |
|---|---|
| **Tableau de bord** | La page d'accueil : un résumé visuel de l'activité (chiffres du jour, comparatifs, alertes). |
| **Notifications & Alertes** | Le centre d'alertes opérationnelles : stock bas, péremption, factures en retard, marges faibles. |
| **Gestion des ventes** | Enregistrer les ventes et vérifier, en fin de journée, que la caisse correspond bien à ce qui a été vendu. |
| **Stock** | Suivre les quantités d'ingrédients disponibles, leurs mouvements, et les inventaires. |
| **Gestion des produits** | Construire la carte du café : produits, recettes, variantes, suppléments. |
| **Gestion des achats** | Commander auprès des fournisseurs et suivre la réception de la marchandise. |
| **Gestion des dépenses** | Enregistrer et suivre les charges du café. |
| **Gestion du personnel** | Gérer l'équipe : fiches employé, planning, présence, suivi financier. |
| **Rapports de gestion** | Consulter des rapports consolidés sur les ventes, achats, dépenses, stock et rentabilité. |
| **Paramètres** | Ajuster les réglages qui pilotent les calculs de l'application, et gérer le contenu du site vitrine public. |
| **Rôles & permissions** | Définir qui, dans l'équipe, peut accéder à quoi. |

## Comment les modules fonctionnent ensemble

Les modules ne sont pas des outils séparés : ils s'alimentent les uns les autres, pour que
l'information saisie une seule fois serve partout où elle est utile.

Concrètement : une **vente** enregistrée consomme automatiquement les ingrédients prévus dans la
**recette** du produit vendu, ce qui fait évoluer le **stock** en temps réel. Quand le stock
descend trop bas, une **commande d'achat** permet de le réapprovisionner auprès d'un
**fournisseur** ; sa réception remet à jour le stock à son tour. Les **dépenses** et les achats
viennent nourrir le calcul du coût réel de fonctionnement du café, tout comme le **suivi financier
du personnel**. Toutes ces informations — ventes, coût matière, achats, dépenses, coût du
personnel — remontent ensuite automatiquement dans le **tableau de bord** et les **rapports de
gestion**, sans ressaisie, pour donner une vue d'ensemble toujours à jour de la rentabilité du
café.

## Les grandes capacités du système

- **Gestion centralisée** — toutes les activités du café réunies dans un seul système, accessible
  à toute l'équipe selon son rôle.
- **Suivi opérationnel au quotidien** — ventes, stock, achats et dépenses enregistrés au fil de
  l'eau, pas seulement en fin de mois.
- **Surveillance du stock** — quantités, seuils d'alerte, lots et dates de péremption suivis en
  continu.
- **Alertes** — le système signale automatiquement ce qui demande une attention (stock bas, lot
  proche de la péremption, écart de caisse, facture impayée...).
- **Suivi financier** — dépenses, achats et coûts de personnel centralisés pour une vision claire
  de ce que le café dépense réellement.
- **Traçabilité** — chaque vente, mouvement de stock ou dépense reste consultable dans son
  historique, pour comprendre ce qui s'est passé et pourquoi.
- **Rapports et analyse** — des rapports consolidés qui transforment l'activité quotidienne en
  informations de gestion exploitables.

## Les indicateurs de gestion

Le tableau de bord et les rapports de gestion donnent accès, à différents niveaux de détail, aux
grands indicateurs qui permettent de piloter le café :

- Le **chiffre d'affaires**, ses tendances, et sa répartition (par produit, par catégorie, par mode
  de règlement).
- Le montant des **achats** et des **dépenses**, avec leur répartition par catégorie ou par
  fournisseur.
- La **valeur du stock** à un instant donné, ainsi que les pertes constatées.
- Le **coût du personnel**.
- La **marge** dégagée sur les produits vendus, et une **estimation du résultat** du café sur une
  période donnée.

Chacun de ces indicateurs est détaillé plus précisément dans les sections
[Rapports de gestion](/rapports-de-gestion) et [Tableau de bord](/tableau-de-bord) de cette
documentation.

## Comment utiliser cette documentation

Les sections suivantes de cette documentation détaillent, module par module, comment réaliser
chaque action concrète — ajouter une vente, gérer le stock, créer un produit, suivre une commande,
et ainsi de suite. Utilisez le menu latéral ou la recherche pour retrouver directement la procédure
qui vous intéresse.
