---
title: "Catégories de dépenses"
description: "Créer, renommer et gérer les catégories utilisées pour classer les dépenses du café."
category: "Dépenses"
order: 2
---

## Où trouver cet écran

Menu **Gestion des dépenses → Catégories de dépenses**.

![Liste des catégories de dépenses](/screenshots/depenses-categories-liste.png)

## Le tableau des catégories

| Colonne | Contenu |
|---|---|
| **Nom** | Le nom de la catégorie. |
| **Dépenses** | Le nombre de dépenses actuellement classées dans cette catégorie. |
| **Créée le** | Sa date de création. |
| **Actions** | Modifier, Supprimer. |

Une barre de recherche filtre la liste par nom. Les catégories sont affichées dans leur ordre de
création (la plus ancienne en premier) — il n'y a ni tri manuel, ni icône, ni couleur, ni budget
associé à une catégorie : seul son nom la caractérise.

## Les 12 catégories fournies par défaut

L'application est livrée avec 12 catégories courantes pour un café en Tunisie : **Loyer, STEG,
SONEDE, Téléphone / Internet, Personnel, Entretien, Réparation, Marketing, Fournitures, Transport,
Taxes et frais, Divers**. Elles ne bénéficient d'aucune protection particulière — elles peuvent
être renommées ou supprimées exactement comme n'importe quelle catégorie créée à la main, avec la
seule contrainte détaillée plus bas (ne pas être encore utilisée).

Si l'une d'elles a été supprimée par erreur (ou lors d'une remise à zéro des données), le bouton
**Recréer les catégories par défaut**, affiché uniquement quand au moins une catégorie par défaut
manque, indique entre parenthèses combien il en manque et permet de les recréer en un clic, sans
avoir à retaper leur nom.

## Créer une catégorie

Cliquez sur **Ajouter une catégorie**.

![Formulaire "Nouvelle catégorie"](/screenshots/depenses-categories-nouvelle-formulaire.png)

Un seul champ : le **nom de la catégorie** (obligatoire). Cliquez sur **Vérifier**, contrôlez
l'aperçu, puis **Confirmer et enregistrer**.

### La règle d'unicité

Deux catégories ne peuvent pas porter le même nom — la comparaison ignore les accents, la casse et
les espaces superflus, donc "fournitures", "Fournitures" et "FOURNITURES " sont considérées comme
le même nom et la création est refusée avec le message *"Cette catégorie existe déjà : «
{catégorie existante} »."*.

## Modifier (renommer) une catégorie

Cliquez sur l'icône crayon de la ligne concernée pour ouvrir le même formulaire, pré-rempli avec le
nom actuel.

![Formulaire de modification d'une catégorie](/screenshots/depenses-categories-modifier-formulaire.png)

La même règle d'unicité s'applique, à une exception près : renommer une catégorie vers son propre
nom actuel (par exemple sans rien changer) ne déclenche pas l'erreur de doublon.

## Supprimer une catégorie

La colonne "Dépenses" indique, pour chaque catégorie, son nombre d'utilisations. Ce nombre
détermine ce qui se passe en cliquant sur l'icône corbeille :

- **Catégorie encore utilisée** (au moins une dépense, quel que soit son statut, y compris
  Rejetée) — la suppression est bloquée : *"Suppression impossible : {N} dépense(s) utilise(nt)
  cette catégorie."* Seul un bouton **Fermer** est proposé.

  ![Suppression bloquée — catégorie encore utilisée](/screenshots/depenses-categories-suppression-bloquee.png)

- **Catégorie non utilisée** (0 dépense) — une confirmation classique s'affiche : *"Voulez-vous
  vraiment supprimer {nom} ? Cette action est irréversible."*, avec **Annuler** et **Confirmer la
  suppression**.

  ![Suppression autorisée — catégorie non utilisée](/screenshots/depenses-categories-suppression-confirmation.png)

Il n'existe pas de suppression "douce" : une fois confirmée, la catégorie est définitivement
retirée. Aucune catégorie n'a de statut actif/inactif — elle existe, ou elle a été supprimée.

## Le lien avec les dépenses

Chaque dépense doit obligatoirement être rattachée à une catégorie existante — le formulaire de
saisie d'une dépense refuse de continuer si aucune catégorie valide n'est choisie (voir
[Dépenses](/depenses)). Les catégories créées ici sont **immédiatement disponibles** dans ce
formulaire, dans le panneau de filtrage par catégorie de la liste des dépenses, et dans la
recherche (qui reconnaît aussi le nom de catégorie comme terme de recherche).

Elles alimentent également la répartition des dépenses par catégorie du **Rapport mensuel de
gestion** et du **Rapport sur les dépenses** (voir
[Comprendre les rapports de gestion](/rapports-de-gestion)) — chaque catégorie y apparaît avec le
total de ses dépenses sur la période choisie, les catégories sans dépense sur cette période étant
simplement omises du classement.

## Voir la suite

- [Dépenses](/depenses)
- [Comprendre les rapports de gestion](/rapports-de-gestion)
