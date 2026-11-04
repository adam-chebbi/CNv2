---
title: "Ventes"
description: "L'historique complet des ventes : consulter, filtrer, imprimer un reçu, exporter, ou rembourser un ticket."
category: "Ventes"
categoryIcon: "receipt"
categoryOrder: 2
order: 1
featured: true
featuredOrder: 1
---

## Où trouver cet écran

Menu **Gestion des ventes → Ventes**. C'est l'historique complet des ventes enregistrées — que ce
soit par saisie manuelle (ticket par ticket ou par quantités vendues) ou par import de fichier.

![Liste des ventes, avec indicateurs, filtres et tableau](/screenshots/ventes-liste-des-ventes.png)

## Les trois indicateurs en haut de page

Ces trois chiffres se recalculent en fonction des filtres actuellement actifs (année, mois,
recherche, service, règlement, catégorie, employé — voir plus bas) — ils ne représentent donc pas
forcément "toute l'activité", mais l'activité **selon la sélection en cours**. Les ventes
**remboursées** ne comptent dans aucun des trois, pour ne jamais afficher un chiffre d'affaires
qui inclurait de l'argent déjà rendu.

- **Ventes totales (Tickets)** — nombre de ventes payées correspondant aux filtres actifs.
- **Chiffre d'affaires encaissé** — somme du montant TTC de ces mêmes ventes.
- **Panier / Ticket moyen** — chiffre d'affaires encaissé ÷ nombre de tickets.

## Choisir la période affichée

Une barre dédiée permet de naviguer par **année** (flèches gauche/droite) puis par **mois** (douze
pastilles, chacune affichant son nombre de tickets) — avec des raccourcis **Mois en cours** et
**Toute l'année**. Un bandeau juste en dessous résume la période choisie : nombre de tickets et
montant total.

## Rechercher et filtrer

- **Recherche libre** — cherche dans le numéro de vente, les articles, la table/zone, le nom du
  barista, le service et le mode de règlement à la fois.
- **Service** — Tous / Sur place / À emporter.
- **Mode de règlement** — Tous / Espèces / Carte bancaire / Ticket resto.
- **Catégorie** — la liste des catégories de produits réellement vendues (alimentée par
  [Gestion des produits](/produits), pas une liste figée).
- **Employé** — tous les employés ayant déjà enregistré au moins une vente.
- **Réinitialiser** efface tous ces filtres et revient au mois en cours.

Tous ces filtres se combinent, et tout se recalcule instantanément (aucun rechargement de page).

## Le tableau des ventes

| Colonne | Contenu |
|---|---|
| **N° de vente** | Le numéro du ticket (badge cliquable) — cliquer dessus ouvre le reçu détaillé (voir plus bas). |
| **Consommations & Articles** | Le résumé des articles vendus, le nombre d'articles, et le barista. |
| **Service** | Sur place (avec la table) ou À emporter. |
| **Règlement** | Le mode de paiement utilisé. |
| **Total (TTC)** | Le montant total de la vente. |
| **Date & Heure** | Quand la vente a été enregistrée. |
| **Statut** | **Payé** (badge vert) ou **Remboursé** (badge rouge). |
| **Ticket** | Une icône imprimante (ouvre le reçu) et, si la vente est encore Payé, une icône de remboursement. |

Les colonnes **N° de vente**, **Total (TTC)** et **Date & Heure** sont triables (cliquez sur l'en-tête). Par défaut, la liste est triée de la **vente la plus récente à la plus ancienne**.

## Consulter et imprimer le reçu d'une vente

Cliquez sur le **numéro de vente** (ou sur l'icône imprimante de sa ligne) pour ouvrir sa fiche
détaillée.

![Fiche détaillée d'une vente, avec l'aperçu du reçu et les options d'impression](/screenshots/ventes-detail-recu-impression.png)

Cette fenêtre affiche, à gauche, un **aperçu fidèle du reçu** (ticket, date, heure, barista,
service/table, chaque article avec sa quantité, son prix et sa TVA, le sous-total HT, la TVA, le
total TTC, et le mode de règlement) — c'est exactement ce qui sera imprimé.

À droite, quatre options :

| Bouton | Ce qu'il produit |
|---|---|
| **Impression thermique** | Ouvre la boîte de dialogue d'impression du navigateur avec un ticket au format 80 mm, adapté à une imprimante thermique de caisse. |
| **A4 Imprimer** | Ouvre la boîte de dialogue d'impression avec une présentation détaillée sur papier A4 standard. |
| **Fichier HTML** | Télécharge le reçu au format HTML, pour l'enregistrer ou le personnaliser. |
| **Générer le fichier PDF** | Ouvre la boîte de dialogue d'impression du format A4 — choisissez "Enregistrer au format PDF" comme destination pour obtenir un fichier PDF (il n'y a pas de génération PDF directe, c'est la fonction d'impression du navigateur qui s'en charge). |

## Exporter la liste

Le bouton **Exporter les tickets**, en haut de page, télécharge un fichier CSV de **toutes les
ventes correspondant aux filtres actifs** (pas seulement celles de la page affichée) — numéro,
service, emplacement, articles, mode de paiement, barista, montant, date, heure. Pratique pour un
usage externe (comptable, archivage).

## Rembourser une vente

L'icône de remboursement (visible uniquement sur une vente encore **Payé**) permet d'annuler
proprement une vente déjà enregistrée. Voir [Rembourser une vente](/rembourser-une-vente) pour le
détail complet de ce que cette action fait.

## Ajouter de nouvelles ventes

Cette page est une page de **consultation et de suivi** — pour ajouter de nouvelles ventes :

- [Ajout manuel des ventes — Mode par tickets](/ajout-manuel-mode-tickets)
- [Ajout manuel des ventes — Mode par quantités vendues](/ajout-manuel-mode-quantites)
- [Importer des ventes depuis un fichier Excel/CSV](/importer-des-ventes)
