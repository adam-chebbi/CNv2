---
title: "Comprendre les rapports de gestion"
description: "Les différents rapports disponibles, et ce que montre chacun."
category: "Rapports"
categoryIcon: "bar-chart"
categoryOrder: 8
order: 1
---

## Où trouver ces écrans

Menu **Rapports de gestion** — plusieurs rapports y sont regroupés.

## Rapport mensuel de gestion — la vue d'ensemble du mois

C'est le rapport le plus complet : il consolide, pour le mois choisi, tous les autres domaines en
une seule fois — ventes (CA, panier moyen, top produits, produits à faible marge), achats &
fournisseurs (total, performance des principaux fournisseurs), dépenses (total, par catégorie),
stock (valeur, pertes, écarts d'inventaire, produits sous seuil), personnel (coût), et surtout une
**synthèse du résultat estimé** :

```text
CA TTC
 − TVA collectée
 = CA HT
 − Coût matière (COGS)
 = Marge brute estimée
 − Dépenses d'exploitation
 − Coût du personnel
 = Résultat estimé
```

Les achats y sont montrés à titre d'information seulement — ils ne sont **pas** soustraits une
deuxième fois, puisqu'ils sont déjà reflétés dans le coût matière. Une section **Fiscalité** est
elle aussi purement informative : l'application n'effectue **aucune déclaration fiscale
officielle**, elle donne juste une estimation de la TVA collectée/déductible.

![Rapport mensuel de gestion](/screenshots/rapports-mensuel-de-gestion.png)

## Rapport financier

Une vue plus resserrée, uniquement sur le résultat et la marge, avec une comparaison au mois
précédent et une tendance sur 6 mois. Comme le rapport mensuel, il rappelle qu'il s'agit d'**une
estimation de gestion interne, pas un bilan comptable officiel**.

## Autres rapports disponibles

- **Rapport sur les ventes** — chiffre d'affaires, panier moyen, montant remboursé, top 10 des
  produits vendus, répartition par mode de règlement.
- **Rapport achats & fournisseurs** — total des achats, commandes en cours, montant impayé,
  performance par fournisseur (nombre de commandes, montant, délai moyen de réception).
- **Rapport sur les dépenses** — total, répartition par catégorie, dépenses fixes vs variables.
- **Rapport sur les stocks** — valeur du stock, pertes de la période, écarts d'inventaire, produits
  sous le seuil.
- **Rapport fiscal** *(accès restreint)* — ventilation de la TVA collectée et déductible, par taux
  — également informatif, pas une déclaration officielle.
- **Export** — pour extraire les données vers un fichier (Excel/CSV).
- **Archive** — la liste des employés archivés et des comptes utilisateurs désactivés, voir
  ci-dessous.

## Choisir une période

Chaque rapport propose un sélecteur de période en haut de la page — les chiffres affichés se
recalculent automatiquement pour la période choisie, généralement avec une comparaison au mois
précédent.

## Exporter des données

Depuis **Rapports de gestion → Export**, choisissez les données à exporter (ventes, stock,
dépenses...) et la période, puis téléchargez le fichier — utile pour un usage externe (comptable,
archivage).

## Archive — retrouver ce qui a été archivé ou désactivé

Depuis **Rapports de gestion → Archive**, une seule liste regroupe tout ce qui a été mis de côté
sans être supprimé :

- les **employés archivés** (voir [Archiver un employé](/employes)) ;
- les **comptes utilisateurs désactivés** (voir
  [Désactiver un compte utilisateur](/roles-et-permissions)).

Un filtre par type (Employé / Utilisateur) et une recherche par nom permettent de retrouver
rapidement un enregistrement précis ; deux indicateurs en haut de page comptent séparément les
employés archivés et les comptes désactivés. Chaque ligne propose un bouton **Réactiver**, qui
renvoie vers l'action correspondante (réactivation de l'employé, ou réactivation du compte) — voir
les pages liées ci-dessus pour ce que chacune fait précisément, notamment le fait que réactiver un
employé ne réactive **pas** automatiquement son compte de connexion associé : ce sont deux actions
distinctes, chacune avec sa propre ligne dans cette liste tant qu'elle n'a pas été effectuée.

Rien de ce qui apparaît ici n'est perdu : archiver ou désactiver ne supprime jamais l'historique des
ventes, achats, mouvements de stock ou suivis financiers déjà liés à cet employé ou ce compte.
