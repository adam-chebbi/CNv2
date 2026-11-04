---
title: "Rôles et permissions"
description: "Comprendre les rôles et permissions du système, ce qu'ils contrôlent, et comment gérer qui a accès à quoi."
category: "Démarrage"
order: 4
---

> Créer ou modifier un rôle, ou attribuer un rôle à un compte, est réservé aux comptes ayant la
> permission **Rôles & permissions → Gérer** — en général, le ou les gérants de l'établissement,
> jamais le personnel de caisse. Comprendre ce que sont les rôles et permissions, en revanche,
> est utile à toute l'équipe : c'est ce qui explique pourquoi certains menus ou boutons sont
> visibles pour une personne et pas pour une autre.

## Pourquoi les rôles et les permissions existent

Tout le monde dans l'équipe n'a pas besoin — ni intérêt — à avoir accès à tout. Un(e) caissier(ère)
doit pouvoir enregistrer des ventes, mais n'a aucune raison de voir les salaires de l'équipe ou de
modifier les taux de TVA ; un(e) comptable a besoin des rapports financiers, mais pas forcément de
créer des commandes d'achat. Le système répond à ce besoin avec deux notions distinctes, qu'il est
important de ne pas confondre :

- Une **permission** est le droit d'effectuer **une action précise** dans l'application (par
  exemple "Rembourser une vente", ou "Approuver une dépense").
- Un **rôle** est un **ensemble nommé de permissions** (par exemple le rôle "Caisse"), que l'on
  attribue ensuite à un compte utilisateur.

Autrement dit : **on ne coche jamais des permissions individuellement sur un compte** — on
attribue un rôle à ce compte, et c'est ce rôle qui détermine, via les permissions qu'il regroupe,
ce que la personne peut voir et faire. Changer ce qu'une personne peut faire revient donc à
changer son rôle, ou à modifier les permissions du rôle qu'elle a déjà (ce qui change alors le
comportement de **tous** les comptes qui partagent ce rôle, pas seulement le sien).

## Ce qu'une permission contrôle concrètement

Une permission conditionne deux choses à la fois : la **visibilité** d'un menu, bouton ou champ
dans l'interface (une action que vous n'avez pas le droit de faire n'apparaît simplement pas à
l'écran), et l'**autorisation réelle** d'effectuer l'action correspondante — la seconde est la
vraie barrière de sécurité, la première n'est qu'un confort visuel qui évite d'afficher des
boutons inutilisables.

## Où trouver cet écran

Menu du compte (en haut à droite, ou en bas de la barre latérale sur téléphone) → **Rôles &
permissions**. Ce n'est volontairement pas un module de la barre latérale principale, pour rester
réservé aux gérants. Deux onglets : **Rôles** et **Utilisateurs**.

![Liste des rôles et permissions](/screenshots/roles-permissions-liste.png)

## La liste complète des permissions, par module

| Module | Permissions disponibles |
|---|---|
| Tableau de bord | Consulter · Gérer (définir les objectifs mensuels de vente) |
| Notifications & Alertes | Consulter · Traiter (marquer une alerte comme traitée) |
| Gestion des ventes | Consulter · Saisir (manuel ou import) · **Rembourser** *(sensible)* · **Calcul du quotidien** *(sensible)* |
| Stock | Consulter · Gérer (mouvements, pertes/ajustements) · Importer · Inventaires |
| Gestion des produits | Consulter · Gérer (créer/modifier/supprimer produits, sous-recettes, catégories, suppléments) · Importer |
| Gestion des dépenses | Consulter · Saisir · **Approuver** *(sensible)* · **Supprimer** *(sensible)* · Catégories |
| Gestion des achats | Consulter · Créer · Modifier (brouillon uniquement) · **Annuler / Commander** *(sensible)* · Réceptionner · **Supprimer** *(sensible)* · Fournisseurs · Factures · **Paiement** *(sensible)* · Importer · OCR des factures |
| Rapports de gestion | Consulter · **Rapports financier & fiscal** *(sensible)* |
| Gestion du personnel | Consulter (employés, planning) · Gérer · **Suivi financier** *(sensible)* · **Sélection libre de l'employé** *(sensible — voir ci-dessous)* |
| Journal d'activité | Consulter |
| Paramètres | **Gérer** *(sensible)* — une seule permission pour toute la page Paramètres, y compris la section Site vitrine |
| Rôles & permissions | **Gérer** *(sensible)* — conditionne à elle seule la visibilité du menu "Rôles & permissions" |

Les permissions marquées *(sensible)* touchent à l'argent, au stock ou aux droits d'accès — à
n'accorder qu'après réflexion.

### La permission « Sélection libre de l'employé »

Sur une vente, un mouvement de stock, une commande d'achat, une réception, une facture OCR ou une
vente interne, le système doit savoir **quel employé** a effectué l'action. Cette permission
détermine comment ce champ se comporte :

- **Sans la permission** (comportement par défaut) : le champ "Employé" est verrouillé et rempli
  automatiquement avec l'employé lié au compte connecté — la personne ne peut pas l'enregistrer au
  nom de quelqu'un d'autre, même en forçant la requête depuis l'extérieur de l'interface (le
  serveur refuse la demande, pas seulement l'écran).
- **Avec la permission** : le champ redevient une liste déroulante classique, permettant de choisir
  librement n'importe quel employé actif — utile pour un(e) gérant(e) qui saisit parfois des
  ventes au nom de son équipe.

Cette permission a été ajoutée à **tous les rôles existants** au moment de son introduction (pour
ne rien casser dans les habitudes déjà en place) ; un rôle créé après coup ne l'a **pas** par
défaut, il faut la cocher explicitement si nécessaire.

## Exemples de rôles courants

| Rôle | Permissions typiques | Ce que la personne peut faire |
|---|---|---|
| **Caisse** | Ventes → Consulter, Saisir, éventuellement Calcul du quotidien | Enregistrer des ventes et faire la caisse de fin de journée — rien sur le personnel, les finances ou les rôles. |
| **Comptabilité** | Rapports → Consulter et Financier/fiscal, Dépenses, Achats → Consulter | Suivre les chiffres et les dépenses — sans nécessairement pouvoir modifier le stock ou les ventes. |
| **Super Admin** | Toutes, automatiquement | Accès total, y compris aux permissions ajoutées plus tard. Voir plus bas. |

## Créer un rôle

1. Cliquez sur **Nouveau rôle**.
2. Donnez-lui un **nom** (obligatoire, unique) et une **description** (optionnelle).
3. Cochez, module par module, les permissions que ce rôle doit avoir — un bouton **Tout
   sélectionner / Tout désélectionner** par module accélère la saisie pour un module entier.
4. Enregistrez.

**Exemple courant.** Un rôle "Caisse" typique coche uniquement : Ventes → Consulter, Ventes →
Saisir, et éventuellement Calcul du quotidien — rien sur le personnel, les rapports financiers ou
les rôles eux-mêmes.

## Créer un compte de connexion

Un compte de connexion ne se crée plus depuis cette page : il se crée **depuis la fiche employé**,
dans **Gestion du personnel → Employés**, au moment où l'on ajoute l'employé (ou en modifiant une
fiche existante qui n'en a pas encore). Voir
[Créer aussi son compte de connexion, dans le même formulaire](/employes) pour
le détail du formulaire.

Un employé et son compte de connexion restent deux entités liées mais distinctes : la fiche employé
porte les informations professionnelles et RH, le compte porte l'authentification et les droits
d'accès. Un employé peut exister sans compte de connexion (personnel sans besoin d'accès au
système) ; un compte de connexion est toujours rattaché à exactement un employé, sauf le compte
Super Admin d'origine qui n'en a pas.

L'onglet **Utilisateurs** de cette page ne sert donc plus qu'à **gérer** les comptes déjà créés :
consulter la liste, voir à quel employé chacun est lié, réattribuer un rôle, réinitialiser un mot
de passe, ou activer/désactiver l'accès.

Depuis la liste des utilisateurs, un sélecteur permet de **réattribuer un rôle** à tout moment.

## Le rôle Super Admin

Un rôle spécial, **Super Admin**, existe par défaut et ne peut être ni renommé ni supprimé ni
modifié — il a toujours accès à absolument tout, même si de nouvelles permissions sont ajoutées à
l'application plus tard. Gardez toujours au moins un compte Super Admin actif ; le système refuse
de désactiver ou de faire changer de rôle le dernier compte Super Admin restant.

**Un compte Super Admin ne peut être modifié, désactivé ou avoir son mot de passe réinitialisé que
par un autre compte Super Admin.** Un gérant qui a la permission Rôles & permissions → Gérer mais
n'est pas lui-même Super Admin voit ces actions refusées sur un compte Super Admin, aussi bien dans
l'écran (boutons désactivés) que si la demande est forcée depuis l'extérieur de l'interface (le
serveur la rejette).

## Réinitialiser le mot de passe d'un compte

Depuis la fiche d'un utilisateur, un bouton **Réinitialiser le mot de passe** régénère le mot de
passe temporaire (à nouveau le numéro CIN) — communiquez-le à la personne concernée, elle devra le
changer à sa prochaine connexion. Notez que ceci ne concerne que les mots de passe **réinitialisés**
après coup : le mot de passe choisi à la création du compte (depuis la fiche employé) est celui
saisi à ce moment-là, pas automatiquement le CIN.

## Désactiver un compte utilisateur

Un compte ne se supprime plus : il se **désactive**, depuis l'onglet Utilisateurs. La désactivation
déconnecte immédiatement toutes les sessions actives de ce compte, sur tous ses appareils, et
bloque toute nouvelle connexion — la personne voit un message clair ("Ce compte a été désactivé.
Contactez un administrateur.") si elle tente de se reconnecter. Rien de ce que ce compte a créé ou
modifié n'est supprimé ni ne change d'apparence dans l'historique. Un bouton **Réactiver** permet de
rétablir l'accès à tout moment. On ne peut pas désactiver son propre compte, ni le dernier compte
Super Admin restant.

Désactiver l'employé lié à ce compte, depuis **Gestion du personnel**, désactive automatiquement le
compte de connexion associé — voir
[Archiver un employé](/employes). L'inverse n'est pas automatique : réactiver
l'employé ne réactive pas son compte de connexion, c'est une décision distincte à prendre ici.

## Voir qui est connecté

La section **Sessions & appareils**, accessible depuis le menu du compte de chaque utilisateur,
permet à chacun de voir ses propres appareils connectés et de révoquer une session à distance si
besoin — voir [Consulter mes sessions actives](/sessions-et-appareils). Il n'existe pas, en
revanche, d'écran permettant à un gérant de consulter les sessions d'un autre compte : chacun ne
voit que les siennes.
