---
title: "Ajout manuel des ventes — Mode par tickets"
description: "Saisir chaque vente séparément, comme à la caisse : articles, service et règlement propres à chaque ticket."
category: "Ventes"
order: 2
---

## Où trouver cet écran

Menu **Gestion des ventes → Ajoute Manuelle Ventes**, puis choisissez la carte **Par tickets**.

## Pour quel contexte ce mode est fait

Ce mode reproduit fidèlement le fonctionnement d'une **caisse/terminal de point de vente** : un
client, une commande, un règlement — un ticket à la fois, exactement comme lors du passage en
caisse. C'est le mode à utiliser pour saisir les ventes au moment où elles ont lieu, ou pour
rattraper des ventes une par une avec le même niveau de détail qu'une vraie caisse (produits
précis, variantes, extras, table ou comptoir, mode de règlement propre à ce client). Si votre
journée ne se prête pas à ce niveau de détail (pas de caisse tenue ticket par ticket), utilisez
plutôt le mode [Par quantités vendues](/ajout-manuel-mode-quantites).

![Mode "Par tickets" de la saisie manuelle des ventes](/screenshots/ventes-saisie-manuelle-mode-tickets.png)

## Informations générales de la vente

Trois champs, communs à tous les tickets de cette saisie :

- **Date** (obligatoire, aujourd'hui par défaut) — la journée à laquelle ces ventes ont eu lieu.
- **Shift** (obligatoire) — le service concerné, tel que défini dans
  [Planning & Présence](/planning-et-presence).
- **Employé** (obligatoire) — la personne qui a réalisé (ou saisit) la vente. Sans la permission
  **Gestion du personnel → Sélection libre de l'employé**, ce champ est automatiquement verrouillé
  sur l'employé lié à votre compte — voir [Rôles et permissions](/roles-et-permissions).

## Ajouter et remplir un ticket

1. Cliquez sur **Ajouter un ticket** — un nouveau formulaire vide apparaît, sans perdre les
   précédents. Répétez autant de fois que nécessaire ; le bouton **Tout développer/réduire**
   replie les tickets déjà saisis pour garder une vue d'ensemble pendant une longue saisie.
2. Pour chaque article vendu dans ce ticket :
   - Choisissez le **produit** (les articles sont groupés par catégorie, avec leur prix TTC
     affiché à côté du nom).
   - Réglez la **quantité** avec les boutons **−** / **+**.
   - Si le produit propose une **variante** (ex : une taille), choisissez-la — sinon elle reste
     "Standard".
   - Ajoutez des **extras** si besoin (ex : chantilly, shot supplémentaire) — ils s'affichent en
     chips, avec leur supplément de prix.
   - Cliquez sur **Ajouter un article** pour ajouter une autre ligne au même ticket.
3. Renseignez le **service** : **Sur place** (avec le **numéro de table**, obligatoire dans ce cas)
   ou **À emporter** (avec le nom du **comptoir**, obligatoire dans ce cas).
4. Choisissez le **mode de règlement** de ce ticket : **Espèces**, **Carte bancaire** ou
   **Ticket resto**.

Le total du ticket, puis le total général (nombre de tickets, d'articles, montant), se recalculent
en direct en bas de l'écran.

> **Astuce.** C'est le même principe utilisé ailleurs dans l'application partout où vous pouvez
> ajouter plusieurs éléments d'un coup (par exemple pour ajouter plusieurs ingrédients dans
> **Stock → Inventaires**) : un bouton "Ajouter…" qui ouvre un nouveau formulaire vide à chaque
> clic, sans jamais perdre ce qui est déjà saisi.

## Vérifier les encaissements avant de confirmer

![Section "Vérification des encaissements" en bas du formulaire](/screenshots/ventes-tickets-verification-encaissements.png)

Avant de pouvoir enregistrer, cliquez sur **Vérifier les ventes** : l'écran compare le **total
encaissé** (le montant réel, réparti entre Espèces/Carte/Ticket resto, que vous saisissez ici) au
**total des ventes** (calculé automatiquement à partir des tickets que vous avez saisis).

- Si les deux montants correspondent (à 0,01 DT près), rien de plus n'est demandé.
- S'il y a un écart, une **justification** devient obligatoire — choisissez une suggestion
  courante (pourboire laissé, erreur de comptage à vérifier, rendu de monnaie non enregistré,
  remise verbale non saisie, écart à régulariser) ou décrivez la situation. Cette note reste
  attachée à la vente.

> **Le règlement en espèces peut être arrondi.** Seul le montant réglé en espèces est arrondi à la
> coupure la plus proche réellement disponible — le montant exact de la vente, lui, reste toujours
> enregistré tel quel dans les rapports. Les paiements par carte et par ticket resto se règlent
> toujours au montant exact, jamais arrondis.

Une fois la vérification passée, l'écran affiche un **récapitulatif complet** — rien n'est encore
enregistré à ce stade. Cliquez sur **Confirmer et enregistrer** pour valider, ou **Modifier les
ventes** pour revenir en arrière.

## Voir la suite

- [Ventes](/ventes) — pour retrouver, imprimer ou rembourser les tickets déjà saisis.
- [Ajout manuel des ventes — Mode par quantités vendues](/ajout-manuel-mode-quantites)
- [Importer des ventes depuis un fichier Excel/CSV](/importer-des-ventes)
