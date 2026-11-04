---
title: "OCR des factures"
description: "Déposer une photo ou un scan de facture fournisseur et laisser le système en extraire les informations, à vérifier avant intégration."
category: "Achats"
order: 4
---

## Où trouver cet écran

Menu **Gestion des achats → OCR des factures**.

![Écran de dépôt d'une facture, avec l'explication du fonctionnement](/screenshots/achats-ocr-upload.png)

## À quoi sert cette page

Plutôt que de ressaisir à la main chaque information d'une facture papier ou scannée, vous déposez
directement la facture (photo, PDF ou fichier Word) et le système **tente de reconnaître**
automatiquement le fournisseur, le numéro, la date, les montants et les articles — à vous de
vérifier et corriger avant que quoi que ce soit ne soit réellement enregistré.

Formats acceptés : image (JPG, PNG, WEBP), PDF ou DOCX, jusqu'à 20 Mo.

## Ce que le système lit, concrètement

- Une **image** est lue par reconnaissance de caractères (adaptée au français).
- Un **PDF** déjà numérique (texte sélectionnable) est lu directement, plus rapide et plus fiable ;
  un PDF **scanné** (une simple image collée dans un PDF) est traité page par page comme une
  image, avec la même reconnaissance de caractères.
- Un **DOCX** est lu directement comme du texte.

## Déposer une facture

1. Glissez-déposez le fichier sur la zone prévue, ou cliquez sur **Importer depuis l'appareil**
   pour choisir un fichier existant (photo, PDF ou DOCX). Sur un téléphone ou une tablette, un
   second bouton, **Prendre une photo**, ouvre directement l'appareil photo de l'appareil pour
   photographier la facture sur place — ce bouton n'apparaît pas sur ordinateur, où il n'a pas de
   sens.
2. **Si vous avez pris une photo (ou choisi une image depuis l'appareil)**, un écran de
   confirmation s'affiche avant toute analyse : *"Cette photo convient-elle ?"*, avec la photo en
   grand.
   - **Reprendre la photo** (✗) l'abandonne et rouvre directement la même source (l'appareil photo
     si vous veniez de photographier, le sélecteur de fichier sinon), pour recommencer sans étape
     supplémentaire.
   - **Valider cette photo** (✓) lance l'analyse. Rien n'est envoyé à la reconnaissance de texte
     avant cette confirmation explicite — l'idée est d'écarter tout de suite une photo floue,
     coupée ou mal cadrée plutôt que de découvrir le problème après plusieurs secondes d'analyse.
   - Un PDF ou un DOCX n'a pas d'aperçu visuel utile à confirmer de cette façon : ces formats
     passent directement à l'analyse, sans écran de confirmation.
3. Le système analyse le document et affiche l'écran de vérification — cela peut prendre quelques
   instants, surtout pour une image ou un PDF scanné.

## Vérifier et corriger les informations détectées

![Écran de vérification : document original, champs détectés, et écart de cohérence signalé](/screenshots/achats-ocr-verification.png)

Un bandeau le rappelle explicitement : **rien n'est encore intégré**, et la reconnaissance
automatique peut se tromper — vérifiez chaque champ avant de valider. À gauche, le document
d'origine reste visible (avec un bouton **Voir le texte détecté** pour inspecter le texte brut
reconnu) ; à droite, chaque champ est modifiable.

| Champ | Peut être auto-détecté ? | Doit toujours être choisi à la main |
|---|---|---|
| **Fournisseur** | Oui — reconnu parmi les fournisseurs existants si son nom apparaît dans le texte ; sinon, un nom brut est proposé et vous pouvez basculer sur "Nouveau fournisseur". | — |
| **Numéro de facture** | Oui, si un motif du type "facture n°…" est repéré. | — |
| **Date de facture** | Oui, si une date au format reconnaissable apparaît. | — |
| **Échéance** | Pré-remplie avec la date de facture par défaut, à ajuster. | — |
| **Montant HT / TVA / Montant TTC** | Oui, si les mots-clés correspondants sont repérés à côté d'un nombre. | — |
| **Articles** (lignes) | Oui, si le document contient un tableau reconnaissable (désignation, quantité, prix). Chaque libellé détecté est ensuite comparé aux produits existants. | Chaque **produit** doit être confirmé/choisi manuellement — une correspondance automatique erronée reste possible. |
| **Mode de paiement** | Jamais détecté. | Toujours à choisir. |
| **Zone de réception** | Jamais détectée (par défaut "Réserve principale"). | Toujours à confirmer. |
| **Effectué par** | Jamais détecté. | Toujours à choisir (un employé valide). Sans la permission **Gestion du personnel → Sélection libre de l'employé**, verrouillé sur l'employé lié à votre compte. |

### Une vérification de cohérence automatique

Si la somme des montants des lignes détectées ne correspond pas au montant TTC saisi (à 0,5 DT
près), un avertissement s'affiche sous les montants : *"Le total des lignes ([montant] DT) diffère
du montant TTC saisi ([montant] DT)."* — un simple signal, pas un blocage : vous pouvez tout de
même valider, mais c'est l'occasion de vérifier si un montant ou une ligne a été mal reconnu.

### Mémoriser une correspondance produit

Quand le libellé détecté sur la facture ne correspond pas exactement au nom du produit choisi (par
exemple "Grains de cafe Arabica" détecté pour le produit "Grains de café Arabica"), l'icône
**Mémoriser cette correspondance** sur cette ligne l'enregistre : la prochaine facture du même
fournisseur portant ce même libellé reconnaîtra automatiquement le bon produit, sans que vous ayez
à le rechoisir.

## Confirmer l'intégration

Le bouton **Valider et intégrer** reste désactivé tant qu'il manque un champ obligatoire
(fournisseur, numéro, dates, mode de paiement, zone, employé, montant TTC supérieur à 0, et un
produit valide sur chaque ligne). Une fois cliqué, **trois enregistrements sont créés d'un coup**,
par le même mécanisme que s'ils avaient été saisis à la main :

1. Le fournisseur, si vous aviez choisi "Nouveau fournisseur".
2. Une **commande d'achat**, directement au statut **Commandée**.
3. Une **réception complète** de cette commande — toutes les quantités des lignes sont considérées
   reçues intégralement, le stock est donc mis à jour immédiatement, sans étape de réception
   séparée à refaire.
4. La **facture fournisseur** elle-même, non payée par défaut — vous enregistrez son paiement
   ensuite, exactement comme pour une facture saisie à la main (voir [Factures](/factures-fournisseurs)).

## Voir la suite

- [Factures](/factures-fournisseurs)
- [Achats et acquisitions](/achats-et-acquisitions)
