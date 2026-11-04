---
title: "Listes des fournisseurs"
description: "Coordonnées des fournisseurs et historique des prix d'achat — la base utilisée par les commandes et les factures."
category: "Achats"
order: 2
---

## Où trouver cet écran

Menu **Gestion des achats → Listes des fournisseurs**.

![Liste des fournisseurs, avec coordonnées et nombre d'achats](/screenshots/fournisseurs-liste-detail.png)

## Le tableau des fournisseurs

| Colonne | Contenu |
|---|---|
| **Nom / raison sociale** | Le nom du fournisseur. |
| **Matricule fiscal** | Son identifiant fiscal, s'il a été renseigné. |
| **Téléphone** | Son numéro de téléphone. |
| **Email** | Son adresse e-mail. |
| **Contact principal** | Le nom d'une personne de contact chez ce fournisseur. |
| **Achats** | Le nombre de commandes déjà passées auprès de lui. |
| **Actions** | Consulter, Modifier, Supprimer. |

## Rechercher

Une seule barre de recherche, qui cherche à la fois dans le nom, le matricule fiscal, l'email, le
téléphone et le contact principal.

## Ajouter un fournisseur

Cliquez sur **Ajouter un fournisseur**.

![Formulaire "Nouveau fournisseur"](/screenshots/fournisseurs-formulaire-creation.png)

- **Nom / raison sociale** (obligatoire) — doit être différent de tout fournisseur déjà existant.
- **Matricule fiscal** — optionnel.
- **Contact principal** — optionnel, le nom d'une personne à contacter chez ce fournisseur.
- **Téléphone** et **WhatsApp** — optionnels (deux champs distincts, un fournisseur peut avoir un
  numéro WhatsApp différent de son téléphone).
- **Email** — optionnel, mais vérifié s'il est renseigné.
- **Adresse** — optionnelle.
- **Notes** — optionnelles.

Vous pouvez aussi créer un fournisseur **directement depuis le formulaire de commande** (voir
[Achats et acquisitions](/achats-et-acquisitions)), sans passer par cette page.

## Modifier ou retirer un fournisseur

Ouvrez le fournisseur depuis la liste pour modifier ses informations. Un fournisseur déjà utilisé
dans une commande ou une facture ne peut pas être supprimé (pour ne jamais casser l'historique) —
l'application indique alors combien de commandes ou de factures l'utilisent encore.

## Consulter l'historique des prix d'un fournisseur

Ouvrez la fiche d'un fournisseur (icône œil) pour voir, en plus de ses coordonnées, son
**historique des prix d'achat** : pour chaque produit déjà commandé chez lui, le dernier prix payé
et le détail de chaque commande passée (date, numéro, prix). Ce tableau n'est pas une donnée
séparée à tenir à jour — il est reconstitué automatiquement à partir des commandes réelles, il ne
peut donc jamais être désynchronisé de la réalité.

## Comment ces informations sont utilisées ailleurs

- Dans [Achats et acquisitions](/achats-et-acquisitions), le fournisseur choisi détermine le **prix
  pré-rempli** de chaque produit (le dernier prix payé à ce fournisseur précis).
- Dans [Factures](/factures-fournisseurs) et [OCR des factures](/ocr-des-factures), chaque facture
  est rattachée à un fournisseur de cette liste.

## Voir la suite

- [Achats et acquisitions](/achats-et-acquisitions)
- [Factures](/factures-fournisseurs)
