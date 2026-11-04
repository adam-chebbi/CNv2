---
title: "Factures"
description: "Suivre les factures fournisseurs, leurs échéances et leurs paiements — reliées ou non à une commande d'achat."
category: "Achats"
order: 3
---

## Où trouver cet écran

Menu **Gestion des achats → Factures**. Cette page regroupe **toutes** les factures fournisseurs,
qu'elles aient été saisies ici manuellement, ou créées automatiquement par
[OCR des factures](/ocr-des-factures) — rien à l'écran ne distingue les deux origines, elles se
gèrent ensuite exactement de la même façon.

## L'alerte des échéances

Si au moins une facture arrive à échéance dans les 7 prochains jours (ou l'a déjà dépassée), un
bandeau le signale en haut de page — indépendamment des filtres actifs sur le tableau. Chaque
facture concernée s'affiche comme une étiquette cliquable qui ouvre directement son détail, en
rouge si l'échéance est déjà dépassée.

## Les quatre indicateurs

Comme l'alerte ci-dessus, ces chiffres portent toujours sur **l'ensemble des factures**, jamais sur
la sélection filtrée à l'écran :

| Indicateur | Ce qu'il compte |
|---|---|
| **Total des factures** | Le nombre de factures, et la somme de leur montant TTC. |
| **Non payées** | Celles sans aucun paiement enregistré, et la somme de leur montant TTC. |
| **Partiellement payées** | Celles payées en partie, et la somme de ce qu'il **reste à payer** sur elles (pas leur montant total). |
| **Payées** | Celles entièrement réglées, et la somme de leur montant TTC. |

## Le tableau des factures

| Colonne | Contenu |
|---|---|
| **Numéro** | Le numéro de facture (badge cliquable, ouvre le détail). |
| **Fournisseur** | Le fournisseur concerné. |
| **Commande liée** | Le numéro de la commande d'achat associée, ou "—" si la facture n'en a pas. |
| **Date** | La date de la facture. |
| **Échéance** | La date limite de paiement — en rouge si dépassée (avec un ⚠), en orange si elle approche. |
| **Montant TTC** | Le montant total de la facture. |
| **Payé** | Ce qui a déjà été réglé. |
| **Statut** | **Non payée** (rouge), **Partiellement payée** (orange) ou **Payée** (vert). |
| **Actions** | Consulter, Enregistrer un paiement (si non soldée), Modifier, Supprimer. |

Le tableau est toujours trié par **échéance la plus proche en premier** — il n'existe pas d'autre
tri disponible sur cette page.

## Rechercher et filtrer

- **Recherche** — numéro de facture ou nom du fournisseur.
- **Fournisseur** et **Statut** — filtres exacts.
- **Échéance du / au** — filtre sur la date d'échéance (pas la date de facture).
- **Réinitialiser** efface tous les filtres.

## Ajouter une facture manuellement

Cliquez sur **Ajouter une facture**.

1. Choisissez le **fournisseur** (obligatoire).
2. Si cette facture correspond à une commande déjà passée, choisissez-la dans **Commande liée
   (facultatif)** — seules les commandes de ce fournisseur, pas déjà rattachées à une autre
   facture, sont proposées. La sélectionner **pré-remplit automatiquement les montants** (HT, TVA
   à 19 %, TTC) à partir du total de la commande, si vous n'avez encore rien saisi.
3. Renseignez le **numéro de facture**, le **mode de paiement** (Espèces, Carte bancaire, Chèque,
   Virement bancaire), la **date de facture** et l'**échéance** (tous obligatoires).
4. Renseignez les montants **HT**, **TVA** et **TTC** (obligatoires — le TTC doit être supérieur à
   0) — ils ne sont **pas recalculés automatiquement entre eux**, vérifiez leur cohérence
   vous-même.
5. Le **montant déjà payé** est optionnel (0 par défaut) — il ne peut pas dépasser le montant TTC.
6. Cliquez sur **Vérifier**, contrôlez le récapitulatif, puis confirmez.

Le même formulaire, pré-rempli, sert à **modifier** une facture existante (icône crayon).

## Consulter le détail d'une facture

Cliquez sur son numéro (ou l'icône œil) pour voir tous ses champs : fournisseur, commande liée,
date, échéance, mode de paiement, montant HT, TVA, montant TTC, montant payé, et le **restant dû**
(TTC − payé) calculé en direct. Un bandeau signale si l'échéance est dépassée ou proche.

> **Astuce.** L'adresse de cette page peut inclure `?invoice=<identifiant>` — un lien partageable
> qui rouvre directement le détail d'une facture précise.

## Enregistrer un paiement

Depuis la ligne d'une facture (icône carte bancaire) ou depuis son détail, cliquez sur
**Enregistrer un paiement** — disponible tant que la facture n'est pas **Payée**.

1. Saisissez le **montant** réglé — il ne peut pas dépasser le restant dû affiché.
2. Confirmez.

Une facture peut être payée en **plusieurs fois** : chaque paiement s'ajoute aux précédents, et le
**statut se met à jour automatiquement** selon le total déjà réglé comparé au montant TTC — il
n'est jamais choisi manuellement, il est toujours recalculé à partir des montants.

## Supprimer une facture

La suppression est **impossible dès qu'un paiement a été enregistré** sur la facture, même
partiel — l'icône corbeille apparaît grisée avec l'indication "Suppression impossible — des
paiements sont enregistrés". Pour une facture jamais payée, la suppression demande une
confirmation : *« Voulez-vous vraiment supprimer la facture [numéro] ? Cette action est
irréversible. »*

## Voir la suite

- [Achats et acquisitions](/achats-et-acquisitions)
- [OCR des factures](/ocr-des-factures)
