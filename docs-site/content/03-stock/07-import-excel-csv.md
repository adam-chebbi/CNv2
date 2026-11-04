---
title: "Import Excel/CSV (Stock)"
description: "Importer en masse, depuis un fichier, un comptage d'inventaire, des mouvements de stock, ou de nouveaux ingrédients."
category: "Stock"
order: 7
---

## Où trouver cet écran

Menu **Stock → Import Excel/CSV**.

## Trois types d'import différents

Cet écran n'est pas un import unique : c'est un **choix entre trois imports distincts**, chacun
avec son propre fichier, ses propres colonnes, et son propre effet sur le stock. Aucun des trois
ne crée de produit, d'unité ou de zone à votre place au-delà de ce qui est explicitement décrit
ci-dessous — toute référence (produit, unité, zone) doit déjà exister, sauf pour l'import
"Nouveaux ingrédients" qui, lui, sert justement à les créer.

![Les trois types d'import disponibles pour le Stock](/screenshots/stock-import-choix-type.png)

Règles communes aux trois : fichier `.csv`, `.xlsx` ou `.xls`, 5 Mo maximum, 2000 lignes maximum,
et un bouton pour télécharger un modèle déjà au bon format.

## 1. Nouveaux ingrédients

À utiliser pour **créer en masse** des ingrédients qui n'existent pas encore dans le stock — si un
nom existe déjà, la ligne est rejetée avec un message vous renvoyant vers l'import "Mouvements de
stock" à la place.

![Import "Nouveaux ingrédients" : zone de dépôt et colonnes attendues](/screenshots/stock-import-nouveaux-ingredients.png)

| Colonne | Obligatoire | Règle |
|---|---|---|
| `nom` | Oui | Doit être unique — ne doit correspondre à aucun ingrédient déjà existant. |
| `categorie` | Oui | Une des 6 catégories existantes (Café & Boissons, Produits laitiers, Pâtisserie & Boulangerie, Emballages & Consommables, Sirops & Additifs, Épicerie). |
| `unite` | Oui | Doit correspondre à une unité déjà créée dans [Unités](/unites) — sinon, créez-la d'abord là-bas. |
| `sku` | Non | Référence interne ; laissez vide pour la générer automatiquement à partir du nom. |
| `seuil_minimum` | Non | Par défaut : 0. |
| `stock_cible` | Non | Par défaut : 0. |
| `gestion_par_lot` | Non | "Oui" ou "Non" ; par défaut : Non. |
| `cout_moyen` | Oui | Le coût moyen d'achat par unité (DT), utilisé pour toutes les valorisations. |
| `stock_initial_reserve` | Non | Quantité initiale en Réserve principale ; par défaut : 0. |
| `stock_initial_depot` | Non | Quantité initiale en Dépôt ; par défaut : 0. |

Sur confirmation, chaque ligne valide crée un nouvel ingrédient — aucun lot n'est créé
automatiquement, même pour un ingrédient marqué "gestion par lot" (les lots se créent, comme
d'habitude, à la première entrée de stock réelle).

## 2. Mouvements de stock

À utiliser pour **ajuster des produits déjà existants** en masse : ajouter une quantité (toujours
une entrée, jamais une sortie), et/ou modifier leur seuil minimum ou leur stock cible.

![Import "Mouvements de stock" : zone de dépôt et colonnes attendues](/screenshots/stock-import-mouvements.png)

| Colonne | Obligatoire | Règle |
|---|---|---|
| `produit` | Oui | Doit correspondre à un produit déjà existant. |
| `categorie` | Non | À titre de vérification uniquement — doit correspondre à la catégorie réelle du produit si renseignée. |
| `unite` | Non | À titre de vérification uniquement — doit correspondre **exactement** à l'unité réelle du produit (aucune conversion, même entre kg et g — voir [Unités](/unites)). |
| `zone` | Non | "Réserve principale" ou "Dépôt" ; obligatoire si une quantité est renseignée. |
| `quantite` | Non | Si renseignée, doit être strictement positive — cet import ne peut qu'**ajouter** du stock (une entrée), jamais en retirer. Laissez vide pour ne mettre à jour que le seuil ou la cible. |
| `seuil_minimum` | Non | Laissez vide pour ne pas le modifier. |
| `stock_cible` | Non | Laissez vide pour ne pas le modifier. |
| `lot` | Non | Numéro de lot ; laissez vide pour qu'il soit généré automatiquement. |
| `date_peremption` | Non | Obligatoire si une quantité est renseignée pour un produit à gestion par lot. |

Une ligne totalement vide (ni quantité, ni seuil, ni cible) est rejetée. Sur confirmation, chaque
ligne avec une quantité crée un mouvement d'**Entrée** (visible dans
[Mouvements](/mouvements)) ; les lignes avec seulement un seuil et/ou une
cible mettent à jour le produit directement, sans mouvement associé. Une étape supplémentaire par
rapport aux deux autres imports : vous devez choisir l'employé **Effectué par** avant de pouvoir
confirmer. Sans la permission **Gestion du personnel → Sélection libre de l'employé**, ce champ est
automatiquement verrouillé sur l'employé lié à votre compte — voir
[Rôles et permissions](/roles-et-permissions).

## 3. Inventaires

À utiliser pour importer un **comptage physique** déjà fait sur papier ou tableur.

| Colonne | Obligatoire | Règle |
|---|---|---|
| `produit` | Oui | Doit correspondre à un produit déjà existant. |
| `zone` | Oui | "Réserve principale" ou "Dépôt". |
| `stock_reel` | Oui | La quantité réellement comptée (nombre positif ou nul). |
| `choix` | Non | "Ajusté" (par défaut) ou "Conservé" — voir [Inventaires](/inventaires) pour la différence entre les deux. |
| `commentaire` | Non | Texte libre. |

> **Le stock théorique n'est jamais lu depuis le fichier.** Comme pour un inventaire saisi à la
> main, le stock théorique de comparaison est toujours celui du système, **au moment de
> l'import** — l'écart (stock réel − stock théorique) est donc calculé en direct, pas recopié
> d'une colonne du fichier.

Avant de confirmer, l'aperçu affiche un tableau Ligne / Produit / Zone / Théorique / Réel / Écart /
Choix pour chaque ligne. Seules les lignes où un écart réel existe produisent un mouvement dans
l'historique : une ligne "Conservé" avec un écart est tout de même enregistrée (pour garder une
trace), mais sans modifier le stock ; une ligne "Ajusté" modifie le stock du montant de l'écart.
Une ligne sans aucun écart n'ajoute rien à l'historique.

## Le principe commun aux trois : aperçu avant confirmation

Quel que soit le type choisi, l'import se fait toujours en deux temps : un **aperçu** modifiable
(rien n'est encore enregistré), puis une **confirmation** explicite. Une ligne en erreur (produit,
catégorie, unité ou zone introuvable, valeur manquante ou invalide) est signalée directement dans
l'aperçu, avec la possibilité de corriger le champ concerné sans avoir à rouvrir le fichier. Le
bouton de confirmation reste désactivé tant qu'il reste au moins une erreur dans le fichier.

## Voir la suite

- [Stock](/stock)
- [Inventaires](/inventaires)
- [Mouvements](/mouvements)
- [Unités](/unites)
