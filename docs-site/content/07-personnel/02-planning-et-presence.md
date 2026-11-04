---
title: "Planning & Présence"
description: "Planifier les horaires des employés et enregistrer manuellement leur présence, sur une grille hebdomadaire — sans dispositif biométrique."
category: "Personnel"
order: 2
---

## Où trouver cet écran

Menu **Gestion du personnel → Planning & Présence**. La page l'annonce elle-même dans son
sous-titre : *"Planifiez les horaires et enregistrez la présence manuellement — aucun dispositif
biométrique n'est utilisé."*

![Grille hebdomadaire du planning, avec indicateurs du jour](/screenshots/personnel-planning-grille-semaine.png)

## Le planning et la présence partagent la même case

Point important à bien comprendre avant tout le reste : il n'existe **pas** de système de pointage
(pas d'heure d'arrivée/de départ enregistrée, pas de badge, pas de dispositif biométrique). Le
planning prévu et la présence réelle sont **le même enregistrement** — une case par employé et par
jour — dont on change simplement le **statut** au fil de la journée. Créer un planning place une
case en "Planifié" ; constater que l'employé est bien venu consiste à rouvrir cette même case et à
la faire passer manuellement à "Présent". La valeur précédente n'est pas conservée : une fois
écrasée, il n'est plus possible de savoir ce qui était initialement prévu sur cette case.

Il n'existe donc aucune transition automatique (rien ne marque jamais tout seul un employé
"Absent" ou "En retard" à une heure donnée) — chaque changement de statut est un clic volontaire.

## Les sept statuts

| Statut | Signifie |
|---|---|
| **Planifié** | Un horaire est prévu pour ce jour, pas encore constaté. |
| **Présent** | L'employé est venu, conformément (ou non) au planning. |
| **Absent** | L'employé n'est pas venu. |
| **Congé** | Absence de type congé/vacances. |
| **Repos** | Jour de repos prévu, sans travail attendu. |
| **Retard** | Présent, mais en retard. |
| **Doublage** | A travaillé les deux shifts de la journée. |

Les statuts **Planifié, Présent, Retard et Doublage** exigent qu'un (ou, pour Doublage, les deux)
shift(s) soit associé à la case ; **Absent, Congé et Repos** n'en ont pas besoin.

## Les indicateurs du jour

Les six cartes en haut de page (Employés planifiés, Présents, Absents, En congé, En repos, En
retard) sont un simple comptage des statuts du jour **courant uniquement** — elles ne portent pas
sur la semaine affichée par la grille en dessous, qui peut être une semaine différente. Aucune
heure travaillée ou planifiée n'est calculée nulle part sur cette page — ce sont des décomptes de
personnes, pas de temps.

## Naviguer dans la grille

La grille affiche une semaine à la fois (lundi à dimanche), une ligne par employé **actif**
uniquement — un employé passé Inactif dans [Employés](/employes) disparaît de la grille et ne peut
plus être sélectionné pour un nouveau planning, sans que son historique déjà enregistré soit
supprimé pour autant.

- Les flèches **◄ / ►** changent de semaine.
- **Aujourd'hui** revient à la semaine en cours.
- Le sélecteur de date permet de sauter directement à une semaine précise (celle contenant la date
  choisie).

Il n'existe qu'**une seule vue** : cette grille hebdomadaire. Il n'y a ni vue journalière, ni vue
mensuelle, ni vue dédiée par employé, ni recherche/filtre sur la grille elle-même.

## Modifier la présence d'un jour

Cliquez sur n'importe quelle case de la grille.

![Fenêtre de modification d'un jour — statut et shift](/screenshots/personnel-planning-modifier-presence.png)

1. Choisissez le **statut**.
2. Si le statut choisi nécessite un shift, sélectionnez-le (ou les deux, pour Doublage).
3. **Enregistrer.**

Si la case était en **Repos** et que vous choisissez un autre statut que Repos/Absent/Congé, un
avertissement apparaît ("remplacement d'un jour de repos") et vous devez cocher une case de
confirmation avant de pouvoir enregistrer — pour éviter de faire travailler quelqu'un par erreur un
jour prévu comme repos.

Un bouton **Supprimer**, visible seulement si la case contient déjà un enregistrement, propose de
retirer **ce jour uniquement**, ou — si ce jour provient d'un planning récurrent — **toute la
récurrence** (tous les jours générés par ce même planning répétitif, passés et à venir).

## Créer un planning (plusieurs jours d'un coup)

Cliquez sur **Créer un planning** — un assistant en 5 étapes.

![Étape 1 : choix de l'employé](/screenshots/personnel-planning-wizard-employe.png)

1. **Employé** — un seul employé actif à la fois.
2. **Période** — dates de début et de fin (aujourd'hui → aujourd'hui + 27 jours par défaut).

   ![Étape 2 : période à planifier](/screenshots/personnel-planning-wizard-periode.png)

3. **Horaire** — pour chaque jour de la semaine, Repos ou Travail ; si Travail, un ou deux shifts
   (les deux = Doublage).

   ![Étape 3 : horaire par jour de la semaine](/screenshots/personnel-planning-wizard-horaire.png)

4. **Récurrence** — activer "Rendre ce planning récurrent" répète ce même horaire hebdomadaire
   chaque semaine jusqu'à la date de fin ; désactivé, l'horaire ne s'applique qu'une seule fois,
   sur la période exacte indiquée.

   ![Étape 4 : activer ou non la récurrence](/screenshots/personnel-planning-wizard-recurrence.png)

5. **Aperçu** — récapitulatif complet, avec **détection des conflits** : si des jours de la période
   ont déjà un enregistrement, ils sont listés et vous devez cocher "Je confirme le remplacement
   des jours existants" avant de pouvoir confirmer — les jours existants sont alors **écrasés**.

   ![Étape 5 : aperçu avec avertissement de conflit](/screenshots/personnel-planning-wizard-apercu.png)

Cliquez sur **Confirmer le planning**. Les jours "Travail" sont créés au statut **Planifié**, les
jours "Repos" au statut **Repos**.

Cet assistant ne détecte que les **jours** déjà occupés (au niveau de la date), pas un chevauchement
d'horaires à l'intérieur d'une même journée — il n'existe pas de vérification empêchant, par
exemple, deux shifts qui se chevaucheraient dans le temps.

## Gérer les shifts

Cliquez sur **Gérer les shifts** pour ouvrir la liste des créneaux disponibles (par exemple "Matin
06:30–15:00", "Soir 15:00–23:59") — un shift est un simple nom avec une heure de début et de fin,
sans notion de poste ou de rôle associé.

![Fenêtre "Gérer les shifts"](/screenshots/personnel-planning-gerer-shifts.png)

Le nombre de shifts est limité (2 par défaut, réglable de 1 à 6 depuis **Paramètres généraux**, voir
[Paramètres généraux](/parametres-generaux)) — au-delà de cette limite, il faut supprimer un shift
existant avant d'en créer un nouveau. **Ajouter un shift** demande un nom (unique), une heure de
début et une heure de fin (la fin doit être après le début).

### Supprimer un shift

Bloqué si ce shift est encore utilisé par au moins un jour de planning : *"Ce shift est utilisé
dans le planning et ne peut pas être supprimé."* — contrairement à la suppression d'un employé
(voir [Employés](/employes)), qui elle n'est jamais bloquée.

## Ce que cette page ne fait pas

- Aucun calcul d'heures planifiées ou travaillées, ni par jour, ni par semaine, ni par employé.
- Aucun indicateur de sous-effectif ou de couverture par créneau.
- Aucune alerte générée (absence, retard...) ailleurs dans l'application.
- Aucun export, impression, ou "dupliquer cette semaine" — seule la récurrence (répétition future
  automatique définie à la création) permet de reproduire un horaire sans tout ressaisir.
- **Aucun lien avec le Suivi financier** : les heures planifiées ou constatées ici n'entrent dans
  aucun calcul de salaire — voir [Suivi financier](/suivi-financier), dont tous les montants sont
  saisis manuellement, indépendamment de cette page.

## Voir la suite

- [Employés](/employes)
- [Suivi financier](/suivi-financier)
