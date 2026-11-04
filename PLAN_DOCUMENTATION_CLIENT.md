# Plan de documentation client — Café Noir (gestion)

Ce document décrit **quoi livrer** au client comme documentation, **le contenu de chaque
document**, et **comment le produire** — pas la documentation elle-même. Objectif : un client non
technique (gérant, caissier, comptable) doit pouvoir apprendre à utiliser l'application sans avoir
besoin d'un développeur à côté de lui.

Règle de base : **peu de documents, mais complets.** Un document par petite fonctionnalité (10, 20
fichiers séparés) est plus difficile à maintenir et à retrouver pour le client qu'un seul guide
bien structuré avec un sommaire cliquable. On vise **3 livrables + 1 site d'aide en ligne**, pas
plus.

---

## 1. Les 3 documents à livrer (PDF, consolidés)

### 1.1 Guide de démarrage rapide (`Guide_Demarrage_Rapide.pdf`, 4-6 pages)

**Pour qui :** toute nouvelle personne qui ouvre l'application pour la première fois (gérant,
nouvel employé de caisse).

**Contenu :**
- Se connecter (CIN + mot de passe, changement du mot de passe temporaire au premier login).
- Vue d'ensemble de l'écran principal en une image annotée : barre latérale (modules), en-tête  (recherche, notifications, profil), tableau de bord.
- Les 5 actions les plus fréquentes, chacune en 3-4 étapes maximum avec capture d'écran :
  1. Saisir une vente (mode "Par tickets").
  2. Consulter le stock d'un ingrédient.
  3. Faire le calcul du quotidien (caisse) en fin de journée.
  4. Ajouter une dépense.
  5. Consulter le tableau de bord du jour.
- Où trouver de l'aide (renvoi vers le site `docs.cafenoir.tn` et vers le guide complet).

**Pourquoi séparé du guide complet :** c'est le document qu'on imprime ou qu'on envoie par
WhatsApp à un nouvel employé le premier jour — il doit être court.

### 1.2 Guide utilisateur complet (`Guide_Utilisateur_CafeNoir.pdf`, un seul PDF, un chapitre par module)

**Pour qui :** gérant et employés qui utilisent l'application au quotidien.

**Contenu (un chapitre par module, avec sommaire cliquable en début de document) :**
1. Ventes — saisie manuelle (par tickets / par quantités), import Excel/CSV, remboursement,
   Calcul du quotidien (caisse).
2. Stock — consulter le stock, mouvements, inventaires (y compris "Ajouter un ingrédient"),
   pertes/ajustements, lots & péremption, unités.
3. Produits — ajouter un produit (fiche technique, variantes, extras), catalogue, sous-recettes.
4. Achats — commandes, fournisseurs, factures, OCR de factures.
5. Dépenses — ajouter une dépense, catégories.
6. Personnel — fiches employé, planning, suivi financier (avances, primes, salaires).
7. Rapports — mensuel, ventes, achats, dépenses, stock, financier, fiscal, export.
8. Paramètres — informations de l'établissement, taux, seuils d'alerte, page vitrine.

**Format de chaque section :** un objectif en une phrase, puis des étapes numérotées, chacune avec
une capture d'écran annotée (flèches/encadrés rouges sur le bouton ou le champ concerné). Pas de
vocabulaire technique (pas de "endpoint", "payload", "composant" — uniquement le vocabulaire que
l'utilisateur voit à l'écran : les noms exacts des boutons et des menus).

**Astuce production :** ce document peut être généré à partir du contenu du site d'aide (§3) —
même texte, mise en page PDF en plus — pour ne rédiger le contenu qu'une seule fois.

### 1.3 Guide administrateur (`Guide_Administrateur.pdf`, 6-10 pages)

**Pour qui :** uniquement la ou les personnes avec un rôle Super Admin — le gérant, jamais le
personnel de caisse.

**Contenu :**
- Gérer les comptes utilisateurs (créer, désactiver, réinitialiser un mot de passe).
- Rôles & permissions — créer un rôle, cocher les permissions, cas d'usage type ("un rôle Caisse
  qui ne voit que la saisie de vente").
- Sessions & appareils — voir qui est connecté, révoquer une session à distance.
- Paramètres sensibles — taux de TVA, seuils de marge, sauvegarde/export des données.
- Que faire en cas de problème (checklist courte) avant d'appeler le support.

---

## 2. Site d'aide en ligne — `docs.cafenoir.tn`

**Objectif :** la même matière que le Guide utilisateur complet (§1.2), mais consultable dans un
navigateur, sur mobile, avec une recherche, sans avoir à ouvrir/faire défiler un PDF. C'est vers
cette adresse que pointent les messages d'erreur et l'aide contextuelle de l'application à terme.

**Contenu attendu (repris du §1.2, pas réécrit) :**
- Page d'accueil : les 5 actions fréquentes (mêmes que le guide de démarrage rapide), en tuiles
  cliquables.
- Une page par module (Ventes, Stock, Produits, Achats, Dépenses, Personnel, Rapports,
  Paramètres), avec les mêmes parcours pas-à-pas et captures d'écran que le guide PDF.
- Une page "Rôles & permissions" dédiée pour les gérants.
- Une page "Questions fréquentes" (FAQ) — alimentée au fil des questions réellement posées par le
  client une fois l'application en usage.
- Un moteur de recherche simple (recherche texte plein sur les titres/contenu des pages suffit,
  pas besoin d'indexation complexe).

**Recommandation technique :** un générateur de site statique léger (ex. un dossier de pages
Markdown → HTML, dans le même esprit que `showcase/` déjà présent dans ce dépôt pour
`test.cafenoir.tn`) publié sur un sous-domaine `docs.cafenoir.tn`, avec le même pipeline de
déploiement nginx que le reste du projet. Pas besoin d'un CMS ni d'un compte à créer : c'est un
site de documentation en lecture seule.

---

## 3. Captures d'écran — à faire une fois, réutiliser partout

Toutes les captures des 3 PDF et du site viennent de la **même séance de captures**, prise sur un
environnement de démonstration avec des données réalistes (pas des données de test vides ni des
données réelles de clients). Prévoir :

- Un jeu de données de démo cohérent (quelques produits, quelques ventes, un ou deux employés)
  avant de commencer les captures, pour que les chiffres affichés aient l'air réels.
- Une capture par étape numérotée de chaque parcours listé au §1.2 — pas une capture par écran
  entier uniquement, mais aussi des captures rapprochées ("zoom") sur le bouton ou le champ dont
  parle l'étape.
- Les mêmes captures, annotées une fois (flèches, encadrés, numéros d'étape), sont réutilisées à
  la fois dans le PDF et sur le site — ne pas refaire deux séries de captures différentes.
- Nommage prévisible des fichiers (`module_action_etape.png`) pour les retrouver facilement lors
  d'une mise à jour de l'application qui changerait un écran.

---

## 4. Ce qu'on ne livre PAS comme document séparé

Pour rester à 3 documents + 1 site, les sujets suivants sont des **sections** des documents
ci-dessus, jamais des fichiers à part : un document par module, une FAQ en PDF séparé, un guide
par rôle utilisateur, une notice d'installation technique (celle-ci reste dans `README.md` /
`.env.example`, destinée aux développeurs, pas au client).

---

## 5. Plan de production (ordre des étapes)

1. Préparer un jeu de données de démonstration réaliste.
2. Rédiger le contenu du Guide utilisateur complet (§1.2), module par module — c'est le texte le
   plus long, et il sert de base aux deux autres documents.
3. Prendre toutes les captures d'écran en une seule séance, les annoter.
4. En extraire le Guide de démarrage rapide (5 parcours les plus fréquents) et le Guide
   administrateur (sections réservées au Super Admin).
5. Mettre en page les 3 PDF.
6. Publier le même contenu sur `docs.cafenoir.tn`.
7. Relecture par une personne non technique (idéalement quelqu'un qui n'a jamais utilisé
   l'application) — si elle bloque sur une étape, l'étape doit être reformulée ou une capture
   ajoutée.
8. Livraison au client avec un court message expliquant quel document lit qui (§1) et le lien vers
   `docs.cafenoir.tn`.
