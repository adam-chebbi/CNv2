---
title: "Dépenses"
description: "Suivre toutes les dépenses du café — saisies à la main ou générées automatiquement par un paiement fournisseur ou un salaire — et leur validation."
category: "Dépenses"
categoryIcon: "wallet"
categoryOrder: 6
order: 1
featured: true
featuredOrder: 4
---

## Où trouver cet écran

Menu **Gestion des dépenses → Dépenses**.

![Liste des dépenses, avec indicateurs, catégories et tableau](/screenshots/depenses-liste-detail.png)

## Les quatre indicateurs

Ces quatre chiffres portent toujours sur **l'ensemble des dépenses enregistrées**, sans tenir
compte des filtres ni de la catégorie sélectionnée dans le panneau de gauche — c'est un résumé
stable, toujours visible en haut de page :

- **Total des dépenses** — la somme du montant de **toutes** les dépenses, tous statuts confondus,
  avec le nombre total de dépenses en sous-titre.
- **Dépenses en attente** — la somme des dépenses au statut **En attente**.
- **Dépenses approuvées** — la somme de celles au statut **Approuvé**.
- **Dépenses rejetées** — la somme de celles au statut **Rejeté**.

## Le panneau des catégories

À gauche de la liste, chaque catégorie affiche le nombre de dépenses qui lui sont associées — ce
panneau reflète lui aussi **toutes** les dépenses, indépendamment des filtres de la barre de
recherche. Cliquer sur une catégorie (ou sur "Toutes les catégories") filtre le tableau à droite ;
un pied de panneau affiche alors le **montant total pour cette catégorie précise**.

![Filtre par catégorie, avec le total de la catégorie sélectionnée](/screenshots/depenses-filtre-categorie-selectionnee.png)

## Rechercher et filtrer

- **Recherche** — titre, nom de catégorie, ou commentaire.
- **Statut** — En attente / Approuvé / Rejeté / Tous les statuts.
- **Fixe & variable** — filtre par nature (voir plus bas pourquoi "Variable" n'apparaît plus que sur
  d'anciennes dépenses ou des dépenses générées automatiquement).
- **Mode de paiement** — Espèces, Carte bancaire, Chèque, Virement bancaire.
- **Dates** — une plage libre (du / au) ; il n'existe pas de raccourci "ce mois-ci" sur cette page,
  contrairement au tableau de bord ou aux rapports.
- **Réinitialiser** efface tous les filtres et revient à la première page.

Le tableau est trié par **date décroissante** (la dépense la plus récente en premier) et affiché 8
lignes par page.

| Colonne | Contenu |
|---|---|
| **Titre / Description** | Le titre saisi, avec une icône trombone si un justificatif est joint. |
| **Catégorie** | Le nom de la catégorie associée. |
| **Montant** | En DT. |
| **Date** | Au format jj/mm/aaaa. |
| **Paiement** | Le mode de paiement. |
| **Statut** | Menu déroulant En attente / Approuvé / Rejeté, modifiable directement depuis le tableau. |
| **Actions** | Consulter, Modifier, Supprimer. |

## Enregistrer une dépense manuellement

Cliquez sur **Enregistrer une dépense**.

![Formulaire "Nouvelle dépense"](/screenshots/depenses-nouvelle-depense-formulaire.png)

| Champ | Détail |
|---|---|
| **Titre / Objet** * | Texte libre, par exemple "Facture STEG - Octobre 2026". |
| **Montant (DT)** * | Doit être supérieur à 0. |
| **Date** * | Aujourd'hui par défaut. |
| **Catégorie** * | Doit être choisie parmi les catégories existantes (voir [Catégories de dépenses](/categories-de-depenses)). |
| **Récurrence** | Ponctuelle (par défaut), Hebdomadaire, Mensuelle, Trimestrielle ou Annuelle — voir la mise en garde plus bas. |
| **Mode de paiement** * | Espèces, Carte bancaire, Chèque, ou Virement bancaire. |
| **Commentaire** | Optionnel. |
| **Justificatif (photo ou PDF)** | Optionnel, jusqu'à 5 Mo — la photo ou le PDF est conservé avec la dépense pour garder une trace. |

Remplissez le formulaire, cliquez sur **Vérifier** pour passer au récapitulatif, puis **Confirmer
et enregistrer** — rien n'est encore sauvegardé tant que cette dernière étape n'a pas été validée.

![Formulaire rempli, prêt à être vérifié](/screenshots/depenses-nouvelle-depense-formulaire-rempli.png)

![Récapitulatif avant enregistrement d'une dépense](/screenshots/depenses-recapitulatif-verification.png)

Une fois confirmée, un écran de succès s'affiche, avec le choix d'enregistrer une autre dépense ou
de revenir à la liste.

![Confirmation après enregistrement d'une dépense](/screenshots/depenses-confirmation-succes.png)

Une dépense saisie manuellement démarre toujours au statut **En attente**.

### Pourquoi il n'y a plus de choix "Fixe / Variable" à la saisie

Le récapitulatif affiche un champ **Nature**, toujours à **Fixe** pour une dépense saisie à la
main — ce choix n'est plus proposé dans le formulaire : **toute nouvelle dépense manuelle est
désormais classée "Fixe"**. La valeur "Variable" ne disparaît pas pour autant : elle reste affichée
et filtrable pour d'anciennes dépenses saisies avant ce changement, et c'est aussi la nature
utilisée automatiquement pour toutes les dépenses générées par le système (voir ci-dessous).

### À propos de la "Récurrence"

Le champ Récurrence (Ponctuelle, Hebdomadaire, Mensuelle, Trimestrielle, Annuelle) est une simple
étiquette descriptive — **il ne déclenche aucune génération automatique**. Choisir "Mensuelle" pour
un loyer n'entraîne pas la création d'une nouvelle dépense le mois suivant ; il n'existe pas de
tâche planifiée dans l'application pour cela. Ce champ sert uniquement à catégoriser et filtrer vos
dépenses par la suite ; il faut ressaisir chaque occurrence à la main.

## Dépenses générées automatiquement par le système

Certaines dépenses n'ont pas besoin d'être saisies à la main : elles sont créées **automatiquement**
par l'application au moment où un paiement réel a déjà eu lieu ailleurs dans le système. Dans ce
cas, il n'y a rien à valider avant enregistrement — puisqu'il n'y a personne pour "proposer" un
montant à vérifier, l'application enregistre directement ce qui a été réellement payé, avec le
statut **Approuvé** dès la création (pas de passage par "En attente").

![Détail d'une dépense générée automatiquement — salaire payé](/screenshots/depenses-detail-consultation.png)

Deux sources déclenchent aujourd'hui une dépense automatique :

| Source | Déclencheur | Titre généré | Catégorie | Montant |
|---|---|---|---|---|
| **Paiement d'une facture fournisseur** | Vous enregistrez un paiement sur une facture, depuis [Factures](/factures-fournisseurs). | "Facture fournisseur {numéro} — {fournisseur}" | Fournitures | Le montant du paiement enregistré (pas le solde total de la facture) — un paiement en plusieurs fois crée donc plusieurs dépenses distinctes. |
| **Paiement d'un salaire** | Vous renseignez le montant payé sur le suivi financier d'un employé, depuis [Suivi financier](/suivi-financier). | "Salaire — {employé} ({mois/année})" | Personnel | Le montant payé lors de la création du suivi financier ; en cas de modification ultérieure, seule la **différence** (montant payé − montant déjà comptabilisé) est ajoutée, pour ne jamais compter deux fois le même paiement. |

Pour les deux, le **mode de paiement** est repris de sa source (celui choisi sur la facture, ou
"Espèces" par défaut pour un salaire) et un commentaire précise qu'il s'agit d'une dépense générée
automatiquement. Ces dépenses apparaissent dans la liste exactement comme les autres, au même titre
et avec les mêmes actions (modifier le statut, consulter, supprimer) — rien ne les distingue
visuellement dans le tableau, si ce n'est leur catégorie et leur titre.

Si la catégorie correspondante ("Fournitures" ou "Personnel") avait été supprimée entre-temps,
l'application la recrée automatiquement à la volée pour que l'enregistrement ne puisse jamais
échouer faute de catégorie.

### Ce qui n'est plus (ou jamais) automatique

- **La TVA collectée sur les ventes** n'apparaît **pas**, et n'apparaît plus, dans la liste des
  dépenses. Ce comportement a existé, puis a été retiré : il faisait doublon avec l'information déjà
  présentée à titre d'analyse dans **Gestion des ventes → Calcul du quotidien** (section "Analyse
  comptable HT / TVA", voir [Calcul du quotidien](/calcul-du-quotidien)) et dans le Rapport fiscal.
- **Une commande d'achat** ne génère, à elle seule, aucune dépense — seul le fait de **payer** une
  facture fournisseur (pas la commande elle-même) déclenche une dépense automatique.
- Il n'existe **aucune génération automatique liée à la récurrence** (voir plus haut).

### Effet sur les rapports

Pour éviter de compter deux fois le même coût, le **Rapport financier** (résultat estimé) exclut
les dépenses générées par un paiement de facture ou de salaire de sa ligne "Dépenses
d'exploitation" — logique, puisque ces montants sont déjà comptés ailleurs dans le même rapport, via
le **coût matière** et le **coût du personnel** (voir [Comprendre les rapports de gestion](/rapports-de-gestion)).
L'indicateur "Dépenses" du tableau de bord applique une exclusion voisine mais légèrement
différente : il exclut les dépenses issues d'un paiement de facture, mais **inclut** celles issues
d'un paiement de salaire.

## Faire évoluer le statut d'une dépense

Une dépense saisie manuellement démarre à **En attente**. Depuis le tableau ou depuis la fiche
détaillée (**Consulter**), son statut peut être changé librement vers **Approuvé** ou **Rejeté** —
et aussi bien remis à "En attente" ou inversé plus tard, sans règle de progression imposée.

![Fiche détaillée d'une dépense, avec les trois statuts possibles](/screenshots/depenses-detail-consultation.png)

Le statut n'est pas qu'une étiquette : les indicateurs du tableau de bord et le résultat estimé des
rapports ne comptent que les dépenses **Approuvées** comme un coût réel, tandis que le Rapport sur
les dépenses compte tout ce qui n'est pas **Rejeté** (En attente + Approuvé) — utile pour anticiper
une dépense pas encore validée. Une dépense **Rejetée** reste visible dans l'historique mais
n'entre dans aucun total de coût.

## Modifier ou supprimer une dépense

**Modifier** rouvre le même formulaire en deux étapes (Vérifier → Confirmer) pré-rempli avec les
valeurs actuelles — le statut, lui, ne se change jamais depuis ce formulaire, uniquement depuis le
menu déroulant Statut ou la fiche détaillée. **Supprimer** demande une confirmation puis retire
définitivement la dépense ; l'action est irréversible.

## Voir la suite

- [Catégories de dépenses](/categories-de-depenses)
- [Factures](/factures-fournisseurs)
- [Suivi financier](/suivi-financier)
- [Comprendre les rapports de gestion](/rapports-de-gestion)
