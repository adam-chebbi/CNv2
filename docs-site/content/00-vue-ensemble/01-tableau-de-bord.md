---
title: "Tableau de bord"
description: "La page d'accueil de l'application : indicateurs clés, graphiques, calendrier d'activité et alertes — ce que chaque chiffre représente et comment il est calculé."
category: "Vue d'ensemble"
categoryIcon: "gauge"
categoryOrder: 1
order: 1
featured: true
featuredOrder: 5
---

## Où trouver cet écran

Menu **Tableau de bord** — c'est la page qui s'affiche automatiquement à la connexion. Elle
nécessite la permission **Tableau de bord → Consulter**.

![Tableau de bord, avec indicateurs, graphique et alertes](/screenshots/dashboard-tableau-de-bord.png)

## Une règle importante à comprendre avant tout le reste

Cette page contient **deux familles de chiffres** qui ne réagissent pas de la même façon au
sélecteur de période (Aujourd'hui / Hier / Semaine / Mois / Période personnalisée) situé en haut
de page :

- Les **5 indicateurs clés "classiques"** et **la répartition par catégorie du donut** suivent ce
  sélecteur : ils changent quand vous changez la période.
- **Tout le reste** — la bannière du haut, le calendrier d'activité, l'objectif et le réalisé du
  mois, les deux graphiques Ventes/Achats, les classements de produits, le stock faible, la valeur
  du stock, et les alertes — a sa **propre fenêtre de temps fixe**, indépendante du sélecteur. Le
  détail de chaque fenêtre est précisé section par section ci-dessous.

C'est volontaire : un objectif mensuel ou un classement "tous temps confondus" n'aurait pas de sens
s'il se remettait à zéro chaque fois que vous changez le filtre pour regarder juste "hier".

## Le bouton Récupérer

En haut à droite, le bouton **Récupérer** recharge l'intégralité des données de l'application
(pas seulement celles du tableau de bord) — utile si vous pensez que l'écran affiche des chiffres
un peu anciens. Une confirmation "Données actualisées avec succès !" s'affiche une fois terminé.

## La bannière du haut

Toujours centrée sur **aujourd'hui** (jour calendaire), quel que soit le sélecteur de période
choisi plus bas :

- **Aujourd'hui, les ventes** — le chiffre d'affaires TTC (TVA incluse) de la journée, ventes
  payées uniquement.
- **La croissance** — l'évolution de ce chiffre par rapport à **hier**, en pourcentage.

Quatre raccourcis (**Ventes**, **Dépenses**, **Achats**, **Rapports mensuels**) permettent de
sauter directement vers ces modules.

## Choisir une période d'analyse

Le sélecteur propose : **Aujourd'hui**, **Hier**, **Semaine** (les 7 derniers jours glissants,
aujourd'hui inclus — pas une semaine calendaire lundi-dimanche), **Mois** (du 1er du mois en cours
à aujourd'hui), ou **Période personnalisée** (dates de début/fin au choix).

Le bouton **Vs période préc.** affiche ou masque, sur chaque indicateur concerné, la comparaison
avec la période équivalente précédente — mais ne change jamais le chiffre lui-même, seulement s'il
est accompagné de son évolution en %. La période de comparaison est toujours **la même durée,
immédiatement avant** la période choisie (ex : pour "Semaine", elle compare aux 7 jours d'avant ;
pour "Mois", au mois civil précédent).

Le bouton **Calcul** ouvre un encart explicatif rappelant ces règles directement dans l'application.

> **Comment se lit un pourcentage d'évolution.** S'il n'y a aucune activité sur la période
> précédente (valeur à 0), l'application affiche "Nouveau" plutôt qu'un pourcentage qui n'aurait
> pas de sens mathématique (division par zéro).

## Les indicateurs clés

Cinq indicateurs sont toujours affichés ; quatre de plus apparaissent derrière **Voir plus
d'indicateurs (+4)**. Chaque carte est cliquable et vous amène directement au module concerné.

| Indicateur | Suit le sélecteur de période ? | Ce qu'il calcule |
|---|---|---|
| **Ventes totales** | Oui | Somme du montant TTC de chaque vente **payée** dont la date tombe dans la période. |
| **Achat total des biens et services** | Oui | Somme du total de chaque commande d'achat de la période, **sauf** celles au statut Brouillon ou Annulée. |
| **Total des dépenses** | Oui | Somme des dépenses **Approuvées** de la période — les dépenses générées automatiquement par le système (TVA collectée, paiement de facture fournisseur) sont exclues pour ne jamais compter un même montant deux fois. |
| **Bénéfices** | Oui | Ventes de la période **hors TVA**, moins les achats de la période, moins les dépenses de la période. |
| **Total caisse actuelle** | **Non — instantané** | Espèces + Carte bancaire + Tickets resto (nets), reconstitué depuis la dernière vérification de caisse confirmée — exactement le même calcul que sur [Calcul du quotidien](/calcul-du-quotidien), pour que les deux pages soient toujours cohérentes entre elles. |
| *(+4)* **Coût du personnel** | **Non — toujours le mois civil en cours** | Salaires de base + primes − retenues de tous les employés pour le mois calendaire actuel (jamais réduit par les avances — voir [Suivi financier](/suivi-financier)). Affiché aussi en % du chiffre d'affaires du mois en cours (pas de la période sélectionnée, pour éviter un ratio absurde si vous regardez une seule journée). |
| *(+4)* **Valeur du stock** | **Non — instantané** | Quantité actuelle × coût moyen d'achat, pour chaque ingrédient en stock, à l'instant présent. |
| *(+4)* **Nombre de tickets** | Oui | Nombre de ventes payées sur la période, avec le nombre moyen d'articles par ticket. |
| *(+4)* **Marge estimée** | Oui | Chiffre d'affaires hors TVA de la période, moins le coût matière des articles effectivement vendus (calculé à partir de leur fiche technique) — voir la note ci-dessous. |

> **Comment la marge estimée traite un produit sans fiche technique.** Si un article vendu ne
> correspond à aucune fiche technique connue (ou que son nom ne peut pas être associé au
> catalogue), son coût est compté comme **nul** — c'est-à-dire que tout son prix de vente est
> considéré comme de la marge pure. C'est un choix délibérément prudent : plutôt que d'inventer un
> coût, l'application préfère ne jamais sous-estimer artificiellement la marge affichée.

## Le calendrier d'activité — "Ventes par jour"

Une grille façon "carte de contributions", couvrant **toujours les 8 derniers mois calendaires**
(indépendamment du sélecteur de période) — plus une case est foncée, plus la journée a généré de
chiffre d'affaires (seules les ventes payées comptent).

- **Survoler** une case affiche : chiffre d'affaires, nombre d'opérations (tickets), articles
  vendus, vente moyenne, et la part que représente cette journée dans le total de sa semaine.
- **Cliquer** sur une case épingle cette info-bulle (elle reste affichée) et fait apparaître un
  bouton pour copier ces détails.

## Vue d'ensemble du plan

Ce bloc combine deux échelles de temps différentes, à bien distinguer :

- Le **donut de répartition par catégorie** (Café chaud, Boisson lactée, Pâtisserie...) suit le
  **sélecteur de période** en haut de page — il montre comment les ventes de la période choisie se
  répartissent entre catégories de produits (top 6, en montant TTC).
- **Objectif mois**, **Réalisé** et **Progression**, eux, sont **toujours calculés sur le mois
  civil en cours** (du 1er du mois à aujourd'hui), quelle que soit la période choisie dans le
  sélecteur :
  - **Réalisé** = chiffre d'affaires du mois en cours à ce jour.
  - **Objectif mois** = le montant que vous avez défini pour ce mois (voir ci-dessous) — ou, à
    défaut, le chiffre d'affaires réel du **mois précédent**, utilisé comme repère par défaut.
  - **Progression** = Réalisé ÷ Objectif, en pourcentage.

### Fixer un objectif mensuel de vente

1. Cliquez sur **Objectif mois**.
2. Choisissez un montant parmi les suggestions rapides (identique au mois dernier, +10 %, +20 %,
   +30 %) ou saisissez un **montant personnalisé** — un aperçu de la nouvelle progression s'affiche
   en direct avant de valider.
3. Cliquez sur **Confirmer l'objectif**.

Cette action nécessite la permission **Tableau de bord → Gérer** ; sans elle, la fenêtre reste
utilisable mais l'enregistrement final est refusé, avec un message d'erreur.

## Ventes par jours

Un graphique en courbes avec trois onglets — **Jours**, **Mois**, **Année** — qui a sa **propre
fenêtre fixe, indépendante du sélecteur de période** :

- **Jours** : les 7 derniers jours ; chaque jour est comparé au **même jour de la semaine
  précédente** (pas à la veille).
- **Mois** : les 9 derniers mois civils ; chaque mois comparé au mois précédent.
- **Année** : les 4 dernières années ; chaque année comparée à l'année précédente.

Seules les ventes payées comptent. Le bouton **Vs période préc.** (le même qu'en haut de page)
affiche ou masque la courbe en pointillé de la période de comparaison ; un badge de croissance
globale (période affichée vs. équivalent précédent) est visible en permanence, avec ou sans ce
réglage. Survoler un point du graphique affiche le montant, le montant de la période équivalente
précédente, et le nombre de tickets encaissés ce jour/mois/année-là.

## Vue d'ensemble des achats

Un graphique en barres, mêmes onglets **Jours / Mois / Année**, également **indépendant du
sélecteur de période** et basé sur les mêmes 7 derniers jours / 9 derniers mois / 4 dernières
années que le graphique des ventes — mais sans courbe de comparaison (une commande d'achat n'a
qu'une date, pas d'heure précise, donc il n'y a pas de granularité plus fine à comparer). Seules
les commandes ni Brouillon ni Annulées sont comptées, comme pour la carte "Achat total".

## Produits les plus/moins vendus, meilleures marges

Ce bloc regroupe **toutes les ventes payées, depuis toujours** — sans aucune limite de période,
indépendamment du sélecteur en haut de page.

- **Produits les plus vendables / les moins vendus** — top 5 par quantité totale vendue, dans un
  sens puis dans l'autre. Seuls les produits ayant déjà été vendus au moins une fois apparaissent
  (un produit jamais vendu n'apparaît dans aucun des deux classements).
- **Top Chiffre d'affaires / Meilleures marges** — top 5 par montant total vendu (TTC) d'une part,
  et top 5 par taux de marge d'autre part. Seuls les produits ayant une fiche technique reconnue
  apparaissent dans le classement par marge (un produit sans recette n'a pas de marge calculable).

Chaque liste propose un lien vers la vue complète correspondante (catalogue produits, ou rapport de
rentabilité).

## Stock faible

Les 5 premiers produits actuellement **en dessous de leur seuil minimum**, classés par urgence :
**Critique** (stock à 0 ou en dessous de 50 % du seuil), **Faible** (en dessous de 80 % du seuil),
ou **Modéré**. C'est un **instantané du stock à cet instant**, indépendant du sélecteur de période
— exactement la même donnée que celle affichée dans [Consulter le stock](/stock).
Les boutons **Réapprovisionner** et **Créer bon de commande fournisseur** ouvrent le formulaire de
commande d'achat.

## Principales alertes

Les 4 alertes opérationnelles les plus importantes du moment (par sévérité, puis par date de
détection) — le même moteur d'alertes que la page [Notifications](/notifications), qui en donne la
liste complète, filtrable, avec un vrai suivi "traité/non traité" partagé par toute l'équipe.

> **À ne pas confondre avec "traiter" une alerte.** Sur cette carte du tableau de bord, cliquer sur
> le bouton d'une alerte la **masque seulement pour vous, temporairement** — elle réapparaît au
> prochain rechargement de la page, et cela n'a aucun effet sur son vrai statut. De même, le lien
> "Historique des alertes traitées" ne montre pas un historique : il réaffiche simplement les
> alertes que vous aviez masquées. Pour un suivi réel et partagé par toute l'équipe (marquer une
> alerte comme traitée de façon durable), utilisez la page
> [Notifications](/notifications).

## Voir la suite

- [Notifications](/notifications)
- [Comprendre les rapports de gestion](/rapports-de-gestion)
