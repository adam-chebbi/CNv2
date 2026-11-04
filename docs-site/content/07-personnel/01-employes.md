---
title: "Employés"
description: "Créer et gérer les fiches employé — informations personnelles, poste, salaire et pièce d'identité — et comprendre leurs liens avec le reste de l'application."
category: "Personnel"
categoryIcon: "users"
categoryOrder: 7
order: 1
featured: true
featuredOrder: 7
---

## Où trouver cet écran

Menu **Gestion du personnel → Employés**.

![Liste des employés, avec indicateurs, filtres et tableau](/screenshots/personnel-employes-liste-detail.png)

## Les quatre indicateurs

- **Total employés** — le nombre total de fiches, tous statuts confondus.
- **Employés actifs** — ceux au statut **Actif**.
- **Employés inactifs** — le complément (total moins actifs).
- **Nouveaux employés** — ceux dont la **date d'entrée** se situe dans les 30 derniers jours (fenêtre
  glissante à partir d'aujourd'hui, pas le mois calendaire).

## Rechercher et filtrer

- **Recherche** — nom, prénom ou numéro CIN.
- **Statut** — Actif / Inactif / Tous les statuts.
- **Poste** — liste dynamique, construite à partir des postes réellement utilisés par les employés
  existants (pas d'une liste figée).
- **Date d'entrée** — une plage (du / au).
- **Réinitialiser** efface tous les filtres.

Le tableau est trié par **date d'entrée décroissante** (l'employé le plus récent en premier) — ce
tri n'est pas modifiable par un clic sur les colonnes. Affichage 8 lignes par page.

| Colonne | Contenu |
|---|---|
| **Photo** | L'avatar de l'employé, ou ses initiales à défaut de photo. |
| **Nom & prénom** | Nom complet. |
| **Téléphone** | |
| **Poste** | Texte libre (voir plus bas). |
| **Date d'entrée** | Au format jj/mm/aaaa. |
| **Statut** | Badge Actif / Inactif. |
| **Salaire** | En DT. |
| **CIN** | Numéro de la carte d'identité. |
| **Actions** | Voir, Modifier, Archiver (ou Réactiver pour un employé déjà Inactif). |

## Ajouter un employé

Cliquez sur **Ajouter un employé**.

![Formulaire "Ajouter un employé"](/screenshots/personnel-employes-nouveau-formulaire.png)

| Champ | Détail |
|---|---|
| **Photo** | Optionnelle, image uniquement, jusqu'à 3 Mo. |
| **Prénom** * | |
| **Nom** * | |
| **Téléphone** * | Doit ressembler à un numéro (chiffres, espaces, points ou tirets, au moins 7 caractères) — le format tunisien n'est pas imposé strictement, seul le champ "+216 XX XXX XXX" est suggéré en exemple. |
| **Poste** * | Texte libre, avec des suggestions courantes (Barista, Serveur(se), Cuisinier(ère), Pâtissier(ère), Caissier(ère), Manager, Plongeur(se)) qui apparaissent en tapant, sans vous limiter à cette liste — il n'existe pas de catalogue de postes géré séparément. |
| **Date d'entrée** * | Aujourd'hui par défaut. |
| **Statut** | Actif (par défaut) ou Inactif. |
| **Salaire (DT)** * | Doit être 0 ou plus — c'est cette valeur qui préremplit automatiquement le [suivi financier](/suivi-financier) de l'employé. |
| **Numéro CIN** * | Exactement 8 chiffres, et **doit être unique** — un doublon est refusé, en indiquant à qui appartient déjà ce numéro. |
| **Date de délivrance** * | De la CIN. |
| **Copie de la CIN** | Optionnelle, photo ou PDF, jusqu'à 5 Mo. |

Cliquez sur **Vérifier**, contrôlez le récapitulatif ("rien n'est encore enregistré"), puis
**Confirmer et enregistrer**.

### Créer aussi son compte de connexion, dans le même formulaire

Une case **Compte de connexion (optionnel)**, tout en bas du formulaire, permet de donner à cet
employé ses propres identifiants dès sa création — sans passer par un écran séparé. Si vous la
laissez décochée, l'employé est enregistré comme une simple fiche RH, sans aucun accès à
l'application.

Si vous la cochez, quatre champs apparaissent :

| Champ | Détail |
|---|---|
| **Email** | Optionnel — l'employé pourra aussi se connecter avec son numéro CIN si aucun email n'est renseigné. |
| **Rôle** * | Choisi dans la liste des rôles existants (voir [Rôles et permissions](/roles-et-permissions)) — détermine ce que ce compte pourra voir et faire. |
| **Mot de passe** * | Au moins 8 caractères. |
| **Confirmation du mot de passe** * | Doit correspondre exactement au mot de passe. |

Le compte créé est **définitivement lié** à cette fiche employé (voir plus bas) — inutile de passer
ensuite par la mise en correspondance manuelle d'un numéro CIN. Contrairement au mot de passe
temporaire habituel (le numéro CIN, à changer obligatoirement à la première connexion), un compte
créé ainsi peut se connecter directement avec le mot de passe choisi ici.

Pour gérer un compte déjà créé (changer son rôle, réinitialiser son mot de passe, l'activer ou le
désactiver), direction [Rôles et permissions](/roles-et-permissions) — ce formulaire ne sert qu'à
la création initiale.

## Consulter la fiche d'un employé

Cliquez sur l'icône **œil (Voir)**.

![Fiche détaillée d'un employé, avec son document d'identité](/screenshots/personnel-employes-detail-consultation.png)

Cette fenêtre reprend toutes les informations du tableau, avec en plus la **copie de la CIN** si
elle a été jointe : une image s'affiche directement (cliquable pour l'agrandir en plein écran), un
PDF s'ouvre dans un nouvel onglet. Un bouton **Modifier** ouvre directement le formulaire d'édition
depuis cette fenêtre.

## Modifier un employé

Cliquez sur l'icône **crayon**, ou sur **Modifier** depuis la fiche détaillée. Le même formulaire
en trois étapes s'ouvre, pré-rempli.

![Formulaire de modification d'un employé](/screenshots/personnel-employes-modifier-formulaire.png)

## Archiver un employé (remplace la suppression)

![Confirmation d'archivage, avec avertissement sur le compte lié](/screenshots/personnel-employes-suppression-confirmation.png)

Il n'existe **aucun moyen de supprimer définitivement** une fiche employé — seul l'archivage existe,
et c'est volontaire : **rien n'est jamais effacé**. Cliquez sur l'icône d'archive sur la ligne de
l'employé, confirmez, et :

- Son statut passe à **Inactif**, avec la date du jour enregistrée comme date de sortie.
- **Rien n'est supprimé** — son planning, ses jours de présence passés et tout son suivi financier
  restent intacts, consultables, et continuent d'afficher son nom exactement comme avant.
- **Si un compte de connexion est lié à cet employé, il est désactivé immédiatement** : la personne
  est déconnectée de toutes ses sessions actives et ne peut plus se reconnecter, sans que son compte
  soit supprimé pour autant (voir [Rôles et permissions](/roles-et-permissions)).

Un employé déjà Inactif affiche à la place une action **Réactiver**, qui remet son statut à Actif
et efface la date de sortie — **sans jamais réactiver automatiquement son compte de connexion** :
redonner l'accès à l'application est toujours une action séparée et volontaire, à faire depuis
[Rôles et permissions](/roles-et-permissions).

> Si l'employé est lié au compte d'un **Super Admin**, seul un autre Super Admin peut l'archiver —
> une protection qui empêche qu'un compte moins privilégié ne coupe, même par erreur, l'accès du
> seul compte capable de tout réparer.

Tous les employés archivés/inactifs, avec leurs comptes désactivés, sont aussi regroupés dans la
page [Archive](/archive), sous Rapports et analyses.

## Comment cette fiche se connecte au reste de l'application

- **Salaire** → préremplit automatiquement le [Suivi financier](/suivi-financier) (nouveau suivi ou
  actions rapides +Avance/+Prime) — uniquement au moment de la création, et seulement si le champ
  salaire de base y est encore vide.
- **Nom complet** → apparaît, comme simple texte (pas de lien direct vers la fiche), dans de
  nombreux sélecteurs "Effectué par" ailleurs dans l'application (saisie manuelle des ventes,
  mouvements de stock, pertes, achats, OCR des factures, ventes internes...). Un employé archivé
  n'apparaît plus dans ces listes pour de nouvelles saisies, mais les enregistrements passés
  gardent le nom tel qu'il était au moment de la saisie, sans jamais être modifiés rétroactivement.
  Voir aussi [Rôles et permissions](/roles-et-permissions) pour la permission qui détermine si un
  compte peut choisir librement l'employé dans ces sélecteurs, ou s'il est automatiquement limité au
  sien.
- **Photo** → utilisée uniquement sur les écrans Employés (tableau, formulaire, fiche détaillée) ;
  elle n'apparaît nulle part ailleurs dans l'application.
- **Compte de connexion** — désormais **lié en permanence** à cette fiche dès sa création (voir
  ci-dessus), et non plus un simple rapprochement par numéro CIN. La fiche employé reste les
  informations RH (poste, salaire, planning...), le compte reste l'authentification et les droits
  d'accès — deux enregistrements distincts, mais reliés durablement.

## Voir la suite

- [Planning & Présence](/planning-et-presence)
- [Suivi financier](/suivi-financier)
