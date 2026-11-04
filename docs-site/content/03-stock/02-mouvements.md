---
title: "Mouvements"
description: "Enregistrer une entrée, une sortie ou un transfert de stock, et consulter l'historique complet des mouvements."
category: "Stock"
order: 2
---

## Où trouver cet écran

Menu **Stock → Mouvements**.

## Les trois types de mouvement

- **Entrée** — vous recevez de la marchandise (hors commande fournisseur formelle, qui a son
  propre mécanisme de réception) : le stock augmente.
- **Sortie** — vous sortez de la marchandise du stock (casse, usage interne...) : le stock diminue.
- **Transfert** — vous déplacez une quantité d'une zone vers l'autre (Réserve principale ↔
  Dépôt) : la quantité totale ne change pas, seule sa répartition entre les deux zones change.

## Enregistrer un mouvement

Cliquez sur **Créer un mouvement**.

![Formulaire "Nouveau mouvement", type Entrée](/screenshots/stock-mouvements-formulaire-entree.png)

1. Choisissez le type de mouvement en haut du formulaire.
2. Sélectionnez le **produit** (obligatoire) et indiquez la **quantité** (obligatoire).
3. Pour une Entrée ou une Sortie, choisissez la **zone** (obligatoire) concernée. Pour un
   Transfert, choisissez la **zone d'origine** et la **zone de destination** (les deux
   obligatoires, et forcément différentes).

![Formulaire "Nouveau mouvement", type Transfert — une zone d'origine et une zone de destination](/screenshots/stock-mouvements-formulaire-transfert.png)

4. Indiquez le **motif** (obligatoire, texte libre — ex : "Réception fournisseur", "Réassort
   comptoir") et l'**employé** qui **effectue** le mouvement (obligatoire). Sans la permission
   **Gestion du personnel → Sélection libre de l'employé**, ce champ est automatiquement verrouillé
   sur l'employé lié à votre compte — voir [Rôles et permissions](/roles-et-permissions).
5. Un **commentaire** est optionnel.
6. Si le produit est suivi par lot :
   - **Entrée** — le **numéro de lot** reste optionnel (laissez-le vide pour qu'il soit généré
     automatiquement), mais la **date de péremption** devient obligatoire.
   - **Sortie / Transfert** — vous devez choisir le **lot concerné** parmi les lots existants du
     produit dans cette zone. Pour un transfert, la quantité se pré-remplit avec la quantité
     totale du lot, car **un transfert déplace toujours le lot entier**.
7. Cliquez sur **Vérifier le mouvement**, contrôlez le récapitulatif, puis **Confirmer et
   enregistrer**.

## Effet sur le stock

- **Entrée** : la quantité de la zone choisie augmente d'autant.
- **Sortie** : la quantité de la zone choisie diminue d'autant.
- **Transfert** : la zone d'origine diminue et la zone de destination augmente, de la même
  quantité — le total du produit (toutes zones confondues) ne bouge pas.

## L'historique des mouvements

En dessous du formulaire, un tableau liste tous les mouvements déjà enregistrés — filtrable par
produit, motif/commentaire (recherche libre), zone, type et date.

![Historique des mouvements de stock, avec type, zone, quantité, motif et statut](/screenshots/stock-mouvements-historique.png)

| Colonne | Contenu |
|---|---|
| **Date & heure** | Quand le mouvement a été enregistré. |
| **Type** | Entrée, Sortie ou Transfert (badge coloré). |
| **Produit** | Le produit concerné. |
| **Zone** | La zone affectée. |
| **Quantité** | Positive (vert) pour une entrée, négative (rouge) pour une sortie. |
| **Motif** | Le motif renseigné à la saisie. |
| **Effectué par** | L'employé désigné. |
| **Statut** | **Confirmé**, ou **Annulé** si le mouvement a été annulé depuis. |

## Annuler un mouvement

Un mouvement déjà confirmé peut être annulé depuis cet historique (icône d'annulation sur sa
ligne, avec le nom de l'**employé qui annule**, soumis à la même permission que ci-dessus) — le
stock est alors remis dans l'état où il était avant ce mouvement. Un mouvement **lié à un lot** ne
peut pas être annulé depuis cet écran.

## Pour un import en masse

Si vous avez plusieurs mouvements à saisir d'un coup depuis un fichier, utilisez
[Import Excel/CSV](/import-excel-csv) plutôt que de les saisir un par un ici.

## Voir la suite

- [Stock](/stock)
- [Lots & péremptions](/lots-et-peremptions)
