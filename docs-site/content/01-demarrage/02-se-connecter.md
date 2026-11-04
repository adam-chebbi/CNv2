---
title: "Première connexion"
description: "L'écran de connexion, le mot de passe temporaire, le changement de mot de passe obligatoire, et la marche à suivre en cas d'oubli."
category: "Démarrage"
order: 2
---

## La page de connexion

C'est la toute première chose que vous voyez en ouvrant l'application dans un navigateur — sur
ordinateur comme sur téléphone. Tant que vous n'êtes pas connecté(e), aucune autre page de
l'application n'est accessible : c'est la porte d'entrée obligatoire.

![Écran de connexion Café Noir](/screenshots/login-ecran-de-connexion.png)

### Les éléments visibles sur cette page

- **Email, téléphone ou CIN** — le champ où vous saisissez votre identifiant. Les trois formats
  fonctionnent indifféremment, selon ce qui a été enregistré pour votre compte au moment de sa
  création : une adresse e-mail, un numéro de téléphone, ou votre numéro de CIN.
- **Mot de passe** — le champ où vous saisissez votre mot de passe (affiché masqué, comme partout
  ailleurs).
- Le bouton **Se connecter**.
- Un message d'erreur s'affiche directement sous les champs si l'identifiant ou le mot de passe
  sont incorrects, ou si l'un des deux champs est resté vide.
- Sous le formulaire, une **horloge** affiche l'heure et la date du jour — un simple repère visuel,
  sans effet sur la connexion.

### Se connecter

1. Ouvrez l'application dans votre navigateur.
2. Saisissez votre identifiant (e-mail, téléphone ou CIN).
3. Saisissez votre mot de passe.
4. Cliquez sur **Se connecter**.

## Première connexion : le mot de passe temporaire

Quand un compte est créé pour vous, vous ne choisissez pas vous-même votre premier mot de passe :
il vous est attribué automatiquement, et il s'agit toujours de votre **numéro CIN**. C'est ce
numéro que vous utilisez comme mot de passe la toute première fois que vous vous connectez.

## Le changement de mot de passe obligatoire

Dès que vous vous connectez avec ce mot de passe temporaire, l'application vous redirige
automatiquement vers un écran **Changement de mot de passe requis**, à la place du reste de
l'application — vous ne pouvez ni le fermer, ni naviguer ailleurs, ni le reporter à plus tard.
Cette étape est volontairement impossible à contourner : c'est une mesure de sécurité, pour
qu'aucun compte ne reste durablement protégé par un mot de passe que quelqu'un d'autre (la
personne qui a créé le compte) connaît aussi.

![Écran "Changement de mot de passe requis"](/screenshots/changement-mot-de-passe-oblige.png)

### Les champs de ce formulaire

| Champ | Rôle | Règle de validation |
|---|---|---|
| Mot de passe actuel (temporaire) | Le mot de passe avec lequel vous venez de vous connecter (votre CIN, ou celui donné par un gérant après une réinitialisation). | Doit correspondre au mot de passe temporaire réel. |
| Nouveau mot de passe | Le mot de passe que vous choisissez et utiliserez désormais. | Au moins 8 caractères. |
| Confirmer le nouveau mot de passe | Une seconde saisie du même mot de passe, pour éviter une erreur de frappe invisible (le mot de passe est masqué à l'écran). | Doit être strictement identique au champ précédent. |

Si l'une de ces règles n'est pas respectée, un message d'erreur s'affiche sous le formulaire et
rien n'est modifié — vous pouvez corriger et réessayer autant de fois que nécessaire.

### Étapes

1. Connectez-vous avec votre mot de passe temporaire (votre CIN).
2. L'écran **Changement de mot de passe requis** s'affiche automatiquement.
3. Saisissez ce même mot de passe temporaire dans **Mot de passe actuel (temporaire)**.
4. Choisissez un **nouveau mot de passe** (8 caractères minimum) et saisissez-le une seconde fois
   dans **Confirmer le nouveau mot de passe**.
5. Cliquez sur **Valider le nouveau mot de passe**.

### Ce qui se passe une fois le mot de passe changé

Vous êtes automatiquement redirigé(e) vers l'application, avec votre nouveau mot de passe déjà
actif — aucune reconnexion supplémentaire n'est nécessaire. Ce nouvel écran ne réapparaîtra plus
aux connexions suivantes, sauf si votre mot de passe est de nouveau réinitialisé par un gérant
(voir ci-dessous).

Un lien discret **Se déconnecter**, sous le formulaire, permet de quitter cet écran sans changer le
mot de passe — utile si vous vous êtes trompé(e) de compte — mais vous devrez de toute façon passer
par ce même écran à la prochaine connexion.

## Mot de passe oublié

Il n'existe pas d'option "mot de passe oublié" en libre-service dans l'application — pour une
question de sécurité, personne ne peut réinitialiser son propre mot de passe sans mot de passe
actuel. La marche à suivre est la suivante :

1. Contactez un gérant ou un administrateur (un compte ayant la permission **Rôles & permissions →
   Gérer**).
2. Cette personne réinitialise votre mot de passe depuis **Rôles & permissions → Utilisateurs**,
   sur votre fiche, via le bouton **Réinitialiser le mot de passe**.
3. Votre mot de passe repart alors sur votre **numéro CIN** — la personne vous communique que
   votre mot de passe a été réinitialisé (vous connaissez déjà votre propre CIN).
4. À votre prochaine connexion, l'écran **Changement de mot de passe requis** décrit plus haut
   s'affiche de nouveau : vous devez choisir un nouveau mot de passe avant de continuer, exactement
   comme lors de votre toute première connexion.

Voir [Rôles et permissions](/roles-et-permissions) pour plus de détails sur cette procédure côté
administrateur.

## Voir la suite

- [Consulter mes sessions actives et mes appareils](/sessions-et-appareils)
- [Rôles et permissions](/roles-et-permissions)
