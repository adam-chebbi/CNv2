---
title: "Suivi financier"
description: "Suivre salaires, avances, primes et retenues par employé et par mois — un outil de suivi interne, pas un logiciel de paie."
category: "Personnel"
order: 3
---

## Où trouver cet écran

Menu **Gestion du personnel → Suivi financier**. La page le précise elle-même : *"Suivi des
salaires, avances, primes et retenues — n'est ni un logiciel de paie ni de déclaration sociale."*
Il n'y a ici aucun calcul de charges sociales, d'impôts, d'heures supplémentaires, ni de génération
automatique d'une fiche de paie mensuelle — uniquement les montants que vous saisissez vous-même.

![Vue d'ensemble du suivi financier — indicateurs, répartition et tableau](/screenshots/personnel-financier-liste-detail.png)

## Une fiche par employé et par mois

Chaque enregistrement (`suivi financier`) concerne **un employé, pour un mois et une année donnés**
— il ne peut pas exister deux fiches pour le même employé sur la même période ; la création est
refusée dans ce cas : *"Un suivi financier existe déjà pour cet employé sur cette période."* Une
fiche regroupe :

| Champ | Rôle |
|---|---|
| **Salaire de base** | Repris du salaire renseigné sur la fiche de l'employé (voir [Employés](/employes)), modifiable ici. |
| **Avances** | Argent déjà remis à l'employé **avant** la paie normale, pour ce même mois. |
| **Primes** | Bonus qui s'ajoutent à ce qui est dû ce mois-là. |
| **Retenues** | Montant déduit du coût global. |
| **Montant payé** | Ce qui a été effectivement réglé à l'employé. |
| **Date de paiement** | Obligatoire dès qu'un montant payé supérieur à 0 est saisi. |

## Les deux formules clés

- **Coût réel de l'employé ce mois** = `Salaire de base + Primes − Retenues`. Les avances ne sont
  **jamais** soustraites de ce chiffre : une avance est le même salaire, payé plus tôt, pas un coût
  supplémentaire.
- **Reste à payer** = `Coût réel − Avances`, moins ce qui a déjà été réglé (`Montant payé`), sans
  jamais descendre sous 0. **Exemple concret** : salaire de base 1000 DT, une avance de 500 DT en
  cours de mois → reste à payer 500 DT, pas 1000 DT, puisque 500 DT ont déjà été remis.

Ces deux chiffres répondent à des questions différentes et ne doivent pas être confondus : "coût
réel" sert à savoir combien l'employé coûte réellement ce mois-ci (utile pour les rapports), "reste
à payer" sert à savoir combien lui régler maintenant.

## Le montant payé ne peut jamais dépasser le net dû

Le **net dû** de la période, c'est `Salaire de base + Primes − Avances − Retenues`. Que ce soit
dans le formulaire complet ou via les boutons rapides +Avance/+Prime, le système refuse
d'enregistrer un **montant payé** supérieur à ce net dû — saisir, par exemple, un montant payé de
1500 DT pour un net dû de 1000 DT affiche une erreur claire (*"Le montant payé (1500.00 DT) dépasse
le montant dû (1000.00 DT)."*) et bloque l'enregistrement, aussi bien dans l'écran que si la
demande est forcée depuis l'extérieur de l'interface. C'est toujours une erreur de saisie : un
employé ne peut pas être payé plus que ce qui lui est dû sur la période.

## Les six indicateurs

Tous portent sur la **période actuellement sélectionnée** (voir plus bas), pas sur "aujourd'hui" :

- **Coût global du personnel** — somme de "Salaire de base + Primes − Retenues" sur tous les
  employés de la période.
- **Salaires de base** — somme des salaires de base, avec le nombre de fiches en sous-titre.
- **Montant payé** — somme des montants payés, avec le "Restant dû" (somme des restes à payer,
  calculé **employé par employé** puis additionné — un employé payé en trop ne compense jamais un
  autre employé pas encore payé) en sous-titre.
- **Avances** — somme des avances déjà versées.
- **Primes** — somme des primes accordées.
- **Retenues** — somme des retenues, déduites du coût global.

En dessous, un panneau **"Vue d'ensemble du coût du personnel"** affiche une barre de progression
Payé / Coût global, et trois mini-barres comparant Salaires de base, Primes et Retenues entre elles
— purement visuel, sans nouveau calcul.

## Choisir une période

Un sélecteur **Mois / Année** (avec "Toute l'année" comme option de mois) filtre l'intégralité de
la page — indicateurs, panneau de répartition, et tableau. Changer de période **ne crée rien
automatiquement** : une période sans aucune fiche affiche simplement un tableau vide.

## Rechercher et filtrer

- **Recherche** — nom de l'employé.
- **Employé** — un employé précis, ou tous.
- **Statut** — Non payé / Partiellement payé / Payé / Tous les statuts.
- **Réinitialiser** remet aussi le mois/l'année sur la période réelle actuelle (pas sur "Toute
  l'année").

Le tableau est trié par nom d'employé, 8 lignes par page.

## Le statut, toujours calculé, jamais saisi

| Statut | Condition |
|---|---|
| **Non payé** | Montant payé ≤ 0. |
| **Partiellement payé** | Montant payé > 0 mais inférieur au coût réel moins les avances. |
| **Payé** | Montant payé couvre au moins ce qui restait dû. |

Ce statut n'est jamais stocké tel quel : il est recalculé à chaque affichage à partir des montants
de la fiche.

## Deux façons d'enregistrer un paiement

### Les boutons rapides +Avance / +Prime

![Fenêtre "Ajouter une avance"](/screenshots/personnel-financier-avance-formulaire.png)

Ciblent toujours le **mois calendaire réel en cours** (jamais le mois affiché par le filtre de
période, si vous consultez un autre mois). Choisissez l'employé, le montant, la date, puis
confirmez — un aperçu montre en direct le nouveau reste à payer avant validation. Si l'employé n'a
pas encore de fiche ce mois-ci, elle est créée automatiquement, avec le salaire de base repris de
sa fiche employé ; si une fiche existe déjà, l'avance ou la prime s'ajoute simplement à celle en
cours.

### Le formulaire complet "Nouveau suivi financier"

![Formulaire "Nouveau suivi financier"](/screenshots/personnel-financier-nouveau-formulaire.png)

Accessible via **Ajouter un suivi**. Contrairement aux boutons rapides, il permet de choisir
**n'importe quel mois/année** (passé ou futur), et de renseigner en une fois salaire de base,
avances, primes, retenues, montant payé et date de paiement. Cliquez sur **Vérifier**, contrôlez le
récapitulatif, puis **Confirmer et enregistrer**.

## Consulter le détail d'une fiche

Cliquez sur l'icône **œil (Consulter)**.

![Fiche détaillée d'un suivi financier, avec net dû et reste à payer](/screenshots/personnel-financier-detail-consultation.png)

Affiche l'employé, le détail Rémunération (salaire de base, avances, primes, retenues), le détail
Paiement (montant payé, date, statut), et un encart récapitulant le **net dû pour la période** et le
**reste à payer**. Un bouton **Modifier** ouvre le formulaire complet pré-rempli.

## Modifier ou supprimer une fiche

**Modifier** rouvre le formulaire complet (Vérifier → Confirmer), avec les mêmes règles de
validation. **Supprimer** demande une confirmation puis retire définitivement la fiche —
irréversible, sans suppression douce.

## Un paiement enregistré ici crée aussi une dépense

Chaque fois que le **montant payé** augmente (à la création ou lors d'une modification), seule
l'**augmentation** est prise en compte — jamais le total déjà comptabilisé, pour ne jamais compter
deux fois le même paiement. Cette augmentation est automatiquement enregistrée comme une dépense
dans **Gestion des dépenses**, catégorie "Personnel", intitulée "Salaire — {employé}
({mois}/{année})", avec le mode de paiement "Espèces" par défaut (le suivi financier n'a pas son
propre champ mode de paiement). Voir [Dépenses](/depenses) pour le détail de ce mécanisme.

Pour éviter de compter ce coût deux fois, le **Rapport financier** exclut ces dépenses générées
automatiquement de ses "Dépenses d'exploitation" — le coût du personnel y est déjà compté séparément
via le "Coût réel" décrit plus haut (voir [Comprendre les rapports de gestion](/rapports-de-gestion)).
De la même façon, le tableau de bord affiche un indicateur "Coût du personnel", toujours calculé sur
le **mois calendaire en cours** (indépendamment de la période sélectionnée ailleurs sur le tableau
de bord) — voir [Tableau de bord](/tableau-de-bord).

## Le lien avec Employés et Planning & Présence

- **Employés** — le salaire de base d'une nouvelle fiche est repris automatiquement de la fiche
  employé (uniquement à la création, et seulement si le champ est encore vide) ; le statut
  Actif/Inactif de l'employé n'a aucune incidence ici, un employé Inactif restant sélectionnable
  (utile pour régler un dernier salaire).
- **Planning & Présence** — **aucun lien**. Les heures planifiées ou constatées sur la grille de
  présence n'entrent dans aucun calcul de cette page ; tous les montants sont saisis à la main, de
  façon totalement indépendante du planning (voir [Planning & Présence](/planning-et-presence)).

## Voir la suite

- [Employés](/employes)
- [Planning & Présence](/planning-et-presence)
- [Dépenses](/depenses)
