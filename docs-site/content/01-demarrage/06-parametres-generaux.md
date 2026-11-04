---
title: "Paramètres"
description: "Les seuils et taux utilisés dans les calculs de l'application, et les informations affichées sur le site vitrine public."
category: "Démarrage"
order: 6
---

## À quoi sert cette page

**Paramètres** regroupe les réglages qui pilotent le comportement de toute l'application — des
seuils qui déclenchent des alertes, des taux utilisés dans des calculs, et le contenu affiché sur
le site public du café. Ce n'est pas une page qu'on visite au quotidien : on y retourne surtout
pour ajuster une valeur ponctuellement (par exemple si le taux de commission des tickets
restaurant change), ou pour tenir à jour les informations publiques du café.

## Où trouver cet écran

Menu **Paramètres** (réservé aux comptes ayant la permission **Paramètres → Gérer** — voir
[Rôles et permissions](/roles-et-permissions)). La page est organisée en deux catégories de
réglages : **Réglages généraux** et **Site vitrine**.

## Catégorie 1 — Réglages généraux

Contrairement à ce qu'on pourrait imaginer, cette section ne contient ni le nom du café ni ses
coordonnées (ces informations vivent dans **Site vitrine**, plus bas — voir pourquoi ci-dessous) :
ce sont six réglages purement **opérationnels**, qui pilotent des calculs et des alertes dans
toute l'application.

| Réglage | Plage | Valeur par défaut | Ce qu'il contrôle |
|---|---|---|---|
| Délai d'alerte de péremption | 1 à 60 jours | 7 jours | Nombre de jours avant la date de péremption d'un lot à partir duquel il est signalé "Expiration proche" (Stock, Lots, notifications, tableau de bord). |
| Seuil d'écart d'inventaire | 0 à 1000 DT | 30 DT | Montant, en dinars, au-delà duquel un écart constaté lors d'un inventaire déclenche une alerte. |
| Fenêtre de recherche des écarts d'inventaire | 1 à 365 jours | 60 jours | Période sur laquelle l'application recherche un écart d'inventaire récent à signaler. |
| Commission Ticket resto | 0 à 30 % | 10 % | Pourcentage retenu par l'émetteur des tickets restaurant, déduit automatiquement dans [Calcul du quotidien](/calcul-du-quotidien). |
| Marge cible par défaut | 0 à 100 % | 65 % | Marge visée pour tout produit qui ne définit pas sa propre marge cible (voir [Ajout produits](/ajout-produits)). |
| Nombre maximum de shifts | 1 à 6 | 2 | Nombre de shifts différents que vous pouvez créer dans [Planning & Présence](/planning-et-presence). Réduire ce nombre n'affecte jamais les shifts déjà créés. |

Deux boutons en bas de cette section : **Valeurs par défaut** (revient aux valeurs d'origine, sans
encore enregistrer) et **Enregistrer**.

> **Attention avant de modifier un réglage.** Ces valeurs sont utilisées dans les calculs affichés
> partout dans l'application (marges, alertes de stock, calcul du quotidien, planning) — une
> modification s'applique **immédiatement** à toute nouvelle saisie, sans confirmation
> supplémentaire. Vérifiez la valeur avant de cliquer sur **Enregistrer**.

## Catégorie 2 — Site vitrine (cafenoir.tn)

Cette section pilote le contenu du **site public de présentation** du café (cafenoir.tn) — c'est
ici, et pas ailleurs, que se trouvent les vraies coordonnées et horaires du café.

| Groupe de champs | Contenu |
|---|---|
| Coordonnées et horaires | Phrase d'accroche, adresse, téléphone, e-mail, horaires (texte affiché en pied de page), heures d'ouverture/fermeture et ville (ces deux dernières servent uniquement au référencement Google, elles ne sont pas affichées telles quelles sur le site). |
| Réseaux sociaux | Un lien par réseau : Instagram, Facebook, TikTok, YouTube, WhatsApp, X, LinkedIn. Un réseau non renseigné n'apparaît simplement pas sur le site. |
| Plan Google Maps | Le code d'intégration obtenu depuis Google Maps, dont l'application extrait automatiquement le lien nécessaire, avec un aperçu de la carte affiché en direct. |

![Paramètres — section Site vitrine](/screenshots/parametres-site-vitrine.png)

Pour récupérer le code d'intégration de la carte :

1. Ouvrez Google Maps et recherchez l'emplacement du café.
2. Cliquez sur **Partager → Intégrer une carte**.
3. Copiez le code proposé et collez-le dans le champ **Plan interactif** — l'application se charge
   d'en extraire ce dont elle a besoin, vous n'avez rien à modifier dans le code copié.

Le catalogue de produits affiché sur le site vitrine, lui, n'est pas géré ici : il reprend
directement ce qui est configuré dans **Gestion des produits**.

Trois actions en bas de cette section : **Valeurs par défaut** (avec confirmation, car cela
réinitialise tout le contenu du site public), **Annuler les modifications** (revient à la dernière
version enregistrée), et **Enregistrer**. Les changements sont visibles sur le site public en
quelques secondes, sans nécessiter de redéploiement technique.
