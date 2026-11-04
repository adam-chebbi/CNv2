---
title: "Achats et acquisitions"
description: "Passer une commande auprès d'un fournisseur, suivre sa réception, et consulter l'historique complet des achats."
category: "Achats"
categoryIcon: "shopping-cart"
categoryOrder: 5
order: 1
featured: true
featuredOrder: 6
---

## Où trouver cet écran

Menu **Gestion des achats → Achats et acquisitions**.

![Liste des achats, avec indicateurs, alertes de factures et tableau](/screenshots/achats-liste-commandes-detail.png)

## L'alerte des factures à échéance

En haut de page, si au moins une facture fournisseur arrive à échéance ou l'a déjà dépassée, un
bandeau la signale — chaque facture concernée s'affiche sous forme d'étiquette cliquable (fournisseur,
numéro, date d'échéance, avec la mention "(dépassée)" le cas échéant), qui ouvre directement le
détail de cette facture. Voir [Factures](/factures-fournisseurs).

## Les cinq indicateurs

Ces cinq chiffres portent toujours sur **l'ensemble des achats enregistrés**, indépendamment des
filtres ou de l'onglet actif à l'écran :

- **Total des achats** — le nombre total de commandes enregistrées, tous statuts confondus.
- **Achats actifs** — celles encore en Brouillon, Commandée, ou Partiellement reçue.
- **Achats inactifs** — celles Reçues ou Annulées.
- **Montant total de l'achat** — la somme du montant de **toutes** les commandes, y compris les
  Brouillons et les Annulées.
- **Ce mois-ci** — le montant (et le nombre) des commandes passées dans le mois calendaire en
  cours.

> **À ne pas confondre avec le tableau de bord.** Contrairement à l'indicateur "Achat total des
> biens et services" du [Tableau de bord](/tableau-de-bord), qui exclut volontairement les
> commandes en Brouillon et Annulées, les indicateurs de cette page comptent **absolument toutes**
> les commandes — les deux chiffres répondent donc à des questions différentes et ne
> correspondront pas forcément.

## Rechercher, filtrer et exporter

- **Recherche** — numéro d'achat, fournisseur ou article.
- **Fournisseur** — limite aux commandes d'un fournisseur précis.
- **Dates** — une plage de dates d'achat.
- **Réinitialiser** — efface tous les filtres.
- Trois onglets : **Tous les achats**, **Activité** (achats actifs), **Pas actif** (inactifs).
- **Exportation** (en haut de page) télécharge un fichier CSV des commandes affichées (numéro,
  fournisseur, nombre d'articles, montant total, date, statut).

## Créer une commande

Cliquez sur **Ajouter l'achat**.

![Formulaire "Nouvel achat"](/screenshots/achats-nouvelle-commande-formulaire.png)

1. Choisissez le **fournisseur** (obligatoire) — s'il n'existe pas encore, cliquez sur
   **+ Nouveau fournisseur** juste à côté pour le créer sans quitter cet écran ; il est
   automatiquement sélectionné pour la commande en cours.
2. Choisissez qui a **passé la commande** (employé, obligatoire). Sans la permission **Gestion du
   personnel → Sélection libre de l'employé**, ce champ est automatiquement verrouillé sur
   l'employé lié à votre compte — voir [Rôles et permissions](/roles-et-permissions).
3. Renseignez la **date d'achat** (obligatoire, aujourd'hui par défaut) et, si vous la connaissez,
   la **date de livraison prévue** (optionnelle, purement informative).
4. Ajoutez une ligne par produit commandé : **produit**, **quantité** (supérieure à 0) et **prix
   unitaire** (obligatoires). Un même produit ne peut pas apparaître deux fois dans la commande.
5. Une note libre est optionnelle. Cliquez sur **Vérifier**, contrôlez le récapitulatif, puis
   confirmez — la commande est créée avec le statut **Brouillon**.

### Le prix se pré-remplit tout seul

Dès que vous choisissez un produit, si le champ prix unitaire est encore vide, l'application le
pré-remplit avec le **dernier prix payé à ce fournisseur précis pour ce produit précis** — ou, à
défaut d'historique, avec le coût moyen actuel du produit. C'est pourquoi il vaut mieux choisir le
**fournisseur avant les produits** : le prix proposé sera le bon dès le départ.

## Faire évoluer le statut d'une commande

Une commande suit cet ordre logique : **Brouillon** → **Commandée** → **Reçue** (ou
**Partiellement reçue** en cas de réception incomplète), avec la possibilité d'**Annuler** à tout
moment tant qu'elle n'est pas terminée. Changez le statut depuis la liste des commandes. Seule une
commande encore en **Brouillon** peut être modifiée ou supprimée — une fois passée à "Commandée",
il n'est plus possible que de l'annuler.

## Consulter le détail d'une commande

Cliquez sur l'icône **œil (Consulter)** pour ouvrir la fiche complète de la commande.

![Fiche détaillée d'une commande, avec fournisseur, articles, réceptions et facture liée](/screenshots/achats-detail-commande-modal.png)

Cette fenêtre regroupe tout ce qui concerne la commande : les coordonnées du **fournisseur**, le
**résumé de l'achat** (sous-total, taxe, total), les **articles commandés** (avec la quantité
commandée et reçue côte à côte), l'**historique des réceptions** (date, zone, quantités, par qui),
et, si une facture y est déjà rattachée, sa **facture fournisseur** complète (montants, échéance,
statut de paiement).

## Réceptionner une commande

Depuis le détail d'une commande, cliquez sur **Ajouter une réception** (visible tant qu'il reste
des articles à recevoir) :

1. Indiquez la **date de réception**, la **zone** de stockage (Réserve principale ou Dépôt) et
   qui a **réceptionné**. Comme pour "qui a passé la commande", ce champ est verrouillé sur votre
   propre employé sans la permission **Sélection libre de l'employé**.
2. Pour chaque ligne pas encore totalement reçue, saisissez la **quantité reçue** — elle ne peut
   jamais dépasser ce qu'il reste à recevoir sur cette ligne.
3. Confirmez.

Chaque quantité reçue **augmente le stock immédiatement**, exactement comme une entrée de stock
manuelle (voir [Mouvements](/mouvements)). Une **réception partielle est
possible** : vous pouvez réceptionner une partie de la commande aujourd'hui et le reste plus tard,
en plusieurs fois si besoin — la commande passe alors au statut **Partiellement reçue**, et ne
repasse à **Reçue** que lorsque tout a été livré.

## Voir la suite

- [Listes des fournisseurs](/listes-des-fournisseurs)
- [Factures](/factures-fournisseurs)
- [OCR des factures](/ocr-des-factures)
- [Importer depuis un fichier Excel/CSV](/import-achats-excel-csv)
