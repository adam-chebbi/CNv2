---
title: "Import Excel/CSV (Achats)"
description: "Importer en masse, depuis un fichier, des commandes d'achat, des fournisseurs, ou des factures fournisseurs."
category: "Achats"
order: 5
---

## Où trouver cet écran

Menu **Gestion des achats → Import Excel/CSV**.

## Trois types d'import différents

Un choix entre trois imports totalement indépendants : **Achats et acquisitions**, **Listes des
fournisseurs**, **Factures** — chacun avec son propre fichier et ses propres colonnes.

Règles communes aux trois : fichier `.csv`, `.xlsx` ou `.xls`, 5 Mo maximum, 2000 lignes maximum,
un bouton pour télécharger un modèle déjà au bon format, et le principe habituel **aperçu d'abord,
confirmation ensuite** — rien n'est enregistré tant que vous n'avez pas cliqué sur **Confirmer et
enregistrer**, et ce bouton reste désactivé tant qu'il reste une ligne en erreur.

> **Important : les trois imports ne gèrent pas les doublons de la même façon.** Vérifiez toujours
> vos données avant d'importer, en particulier pour les achats et les factures.

## 1. Import "Achats et acquisitions"

Une ligne = une commande complète (fournisseur, employé, et tous les produits commandés).

| Colonne | Obligatoire | Règle |
|---|---|---|
| `date` | Oui | Date d'achat (`AAAA-MM-JJ` ou `JJ/MM/AAAA`). |
| `fournisseur` | Oui | Doit déjà exister dans [Listes des fournisseurs](/listes-des-fournisseurs). |
| `employe` | Oui | Doit déjà exister dans la liste des employés. Sans la permission **Gestion du personnel → Sélection libre de l'employé**, cette colonne est ignorée et chaque commande est rattachée à l'employé lié à votre compte — voir [Rôles et permissions](/roles-et-permissions). |
| `produits` | Oui | Les articles commandés, séparés par `\|`, chacun au format `"quantité x produit @ prix unitaire"` — ex : `"50x Grains de café Arabica @ 2.500\|20x Gobelets carton @ 1.800"`. Chaque produit doit déjà exister dans le stock. |
| `date_prevue` | Non | Date de livraison prévue. |
| `notes` | Non | Texte libre. |

Chaque ligne du fichier crée une nouvelle commande au statut **Brouillon**, avec un numéro
attribué automatiquement (le fichier n'en fournit pas). Toutes les lignes du tableau d'aperçu sont
**modifiables directement à l'écran** : vous pouvez changer le fournisseur, l'employé, chaque
article (produit, quantité, prix), ou en ajouter/retirer, sans avoir besoin de remplacer le
fichier.

> **Aucune vérification de doublon.** Importer deux fois le même fichier crée **deux commandes
> séparées et identiques** — rien ne prévient ni ne bloque ce cas. Vérifiez votre fichier avant de
> confirmer.

## 2. Import "Listes des fournisseurs"

Une ligne = un nouveau fournisseur.

| Colonne | Obligatoire | Règle |
|---|---|---|
| `nom` | Oui | Doit être unique — voir ci-dessous. |
| `matricule_fiscal` | Non | — |
| `telephone` | Non | — |
| `whatsapp` | Non | — |
| `email` | Non | Doit être une adresse valide si renseignée. |
| `adresse` | Non | — |
| `contact_principal` | Non | — |
| `notes` | Non | — |

> **C'est le seul des trois imports qui refuse les doublons.** Si le nom d'une ligne correspond à
> un fournisseur déjà existant — **ou à un autre fournisseur déjà validé plus haut dans le même
> fichier** — la ligne est rejetée avec le message *"Ce fournisseur existe déjà : « [nom] »."*.
> Deux lignes portant le même nom dans un seul fichier se bloquent donc mutuellement.

## 3. Import "Factures"

Une ligne = une nouvelle facture fournisseur.

| Colonne | Obligatoire | Règle |
|---|---|---|
| `fournisseur` | Oui | Doit déjà exister. |
| `numero_facture` | Oui | Aucune vérification d'unicité (voir ci-dessous). |
| `date_facture` | Oui | — |
| `echeance` | Oui | — |
| `montant_ht` | Oui | Nombre positif ou nul. |
| `tva` | Oui | Nombre positif ou nul. |
| `montant_ttc` | Oui | Nombre strictement supérieur à 0. |
| `montant_paye` | Non | Par défaut 0 ; ne peut pas dépasser le montant TTC. |
| `mode_paiement` | Oui | Espèces, Carte bancaire, Chèque, ou Virement bancaire. |
| `commande` | Non | Le numéro d'une commande déjà existante, à relier à cette facture. |

Comme pour l'import de fournisseurs et de commandes, chaque ligne est modifiable directement dans
l'aperçu (fournisseur, montants, dates, mode de paiement, commande liée).

> **Aucune vérification de doublon ici non plus.** Un numéro de facture déjà utilisé — par une
> facture existante, ou par une autre ligne du même fichier — n'est **jamais signalé** :
> réimporter le même fichier deux fois crée deux factures séparées avec le même numéro. Là encore,
> vérifiez votre fichier avant de confirmer, en particulier si vous réimportez après une
> correction.

## Voir la suite

- [Achats et acquisitions](/achats-et-acquisitions)
- [Listes des fournisseurs](/listes-des-fournisseurs)
- [Factures](/factures-fournisseurs)
