# Plan d'implémentation — Site de documentation privé `docs.cafenoir.tn`

Ce document est un **plan d'implémentation et de décisions techniques/produit** pour un nouveau
site, `docs.cafenoir.tn`, qui héberge l'aide et la documentation du système de gestion Café Noir.
Il ne contient pas de code — il décrit l'architecture, les décisions de sécurité, la structure du
contenu, l'UX et l'ordre de mise en œuvre, pour que l'implémentation puisse ensuite être conduite
(par un développeur, ou par un assistant IA) sans ambiguïté.

**Exigence centrale, non négociable :** `docs.cafenoir.tn` n'a **aucune page publique**. Ouvrir
n'importe quelle URL du site sans être déjà connecté à l'application de gestion doit échouer —
avant même qu'une seule ligne de contenu ne quitte le serveur. Ce n'est pas une page protégée par
un mot de passe séparé : c'est la **même session** que celle de l'application de gestion.

> **Note sur le nom de domaine.** `system.cafenoir.tn` est désormais le nom de domaine réel du
> système de gestion en production (`cafe.cafenoir.tn`, l'ancien nom utilisé un temps pendant la
> migration vers ce nouveau serveur, redirige maintenant vers `system.cafenoir.tn`). Le point
> important reste que le système de gestion et le site de documentation partagent le **même
> domaine racine** `cafenoir.tn` (l'un et l'autre n'étant que des sous-domaines) — c'est ce qui
> permet le partage de session décrit ci-dessous.

---

## 1. Architecture générale

```
Utilisateur (navigateur)
   │
   │ 1. Se connecte normalement sur system.cafenoir.tn (CIN/e-mail/tél. + mot de passe)
   ▼
system.cafenoir.tn (Node/Express + SPA React — existant)
   │ pose un cookie de session httpOnly, portée sur tout *.cafenoir.tn (voir §2.1)
   ▼
Utilisateur clique sur "Aide & Support" dans system.cafenoir.tn
   │ 2. Ouverture de https://docs.cafenoir.tn (nouvel onglet ou même onglet)
   ▼
nginx sur docs.cafenoir.tn (nouveau — reverse proxy + garde d'accès)
   │ 3. Le cookie de session est automatiquement envoyé par le navigateur (même domaine racine)
   │ 4. nginx vérifie la session AVANT de servir quoi que ce soit (auth_request, voir §2.2)
   ├── session valide   → sert le site de documentation (fichiers statiques)
   └── session invalide → bloque et renvoie l'utilisateur se connecter sur system.cafenoir.tn
```

**Décision d'architecture clé : pas d'OAuth/SAML, pas de jeton dans l'URL.** Un vrai protocole SSO
(OAuth2, SAML, OIDC) est fait pour authentifier un utilisateur *entre deux organisations ou deux
produits indépendants*. Ici, `docs.cafenoir.tn` et `system.cafenoir.tn` sont **le même produit, le
même éditeur, le même domaine racine** — la solution la plus simple, la plus sûre et la plus
facile à maintenir est un **cookie de session partagé au niveau du domaine racine**, combiné à une
vérification de ce cookie **côté nginx, avant de servir le site**. Pas de jeton visible dans
l'URL (qui fuiterait dans les logs, l'historique, l'en-tête `Referer`), pas de nouvelle base
d'identités à synchroniser, pas de bibliothèque OAuth à intégrer et maintenir.

**Ce que ça implique concrètement pour le code existant** (résumé — le détail est au §2) :
1. Le cookie de session (`server/routes/auth.ts`) reçoit l'attribut `Domain=.cafenoir.tn` en
   production, au lieu d'être limité au sous-domaine exact qui l'a posé.
2. Un nouvel endpoint léger, `GET /api/auth/verify`, est ajouté au serveur existant — il ne fait
   que confirmer "session valide oui/non", sans renvoyer de données.
3. nginx, sur le nouveau serveur `docs.cafenoir.tn`, appelle cet endpoint pour **chaque requête**
   avant de servir un fichier — c'est `auth_request`, une fonctionnalité standard de nginx conçue
   exactement pour ce cas d'usage (déléguer la décision d'accès à un service d'authentification
   existant).

---

## 2. Authentification, validation de session, protection contre l'accès direct

### 2.1 Cookie de session partagé entre sous-domaines

Le cookie de session existe déjà (`server/routes/auth.ts`, cookie httpOnly, `secure` en
production, `sameSite=lax`, valable 7 jours). Aujourd'hui il n'a pas d'attribut `Domain` explicite,
donc le navigateur le limite au sous-domaine exact où il a été posé (`system.cafenoir.tn`
uniquement). Pour qu'il soit aussi envoyé vers `docs.cafenoir.tn`, il doit porter
`Domain=.cafenoir.tn` (le point initial signifie "ce domaine et tous ses sous-domaines").

- **Uniquement en production**, via une variable d'environnement (ex. `SESSION_COOKIE_DOMAIN`,
  vide en développement local) — en local, `localhost` n'a pas de sous-domaines partagés, et poser
  un `Domain` y casserait la session.
- Le cookie de déconnexion (`res.clearCookie`) et celui du token CSRF doivent utiliser **exactement
  le même** attribut `Domain` que celui utilisé pour le poser — un navigateur ne supprime un cookie
  que si le `Domain` (et le `Path`) correspondent exactement à ceux avec lesquels il a été créé.
  Un oubli ici est le bug le plus probable : la déconnexion aurait l'air de fonctionner sur
  `system.cafenoir.tn` (un autre cookie, sans `Domain`, serait effacé) alors que le vrai cookie de
  session, lui, resterait actif sur `.cafenoir.tn` — c'est un point à tester explicitement (voir
  checklist §12).
- `SameSite=Lax` reste correct sans changement : deux sous-domaines du même domaine racine sont
  considérés "same-site" par les navigateurs, `Lax` continue donc d'envoyer le cookie normalement.
- `httpOnly` et `secure` restent inchangés — le cookie n'est toujours lisible que par le serveur,
  jamais par du JavaScript, sur aucun des deux sous-domaines.

### 2.2 Garde d'accès côté nginx — `auth_request`

C'est le mécanisme qui empêche **toute** page (pas seulement la page d'accueil) d'être servie sans
session valide, avant même que le contenu ne soit envoyé au navigateur :

- Le nouvel endpoint serveur `GET /api/auth/verify` réutilise la même logique de validation de
  session que `requireAuth` aujourd'hui (cookie présent → session non révoquée en base → non
  expirée) mais **ne renvoie aucune donnée** : juste un code `204` (session valide) ou `401`
  (absente/invalide/expirée). Volontairement minimal, pour rester rapide et ne rien exposer.
- Le bloc nginx de `docs.cafenoir.tn` déclare une zone interne (`location = /internal-auth-check`)
  qui relaie la requête vers cet endpoint, puis applique `auth_request` sur **tous** les autres
  `location` du site (le HTML, mais aussi le JS, le CSS, les images, et le fichier d'index de
  recherche — voir §12, tester spécifiquement que les fichiers statiques ne sont pas eux-mêmes une
  fuite de contenu).
- **Résultat pratique :** un `curl https://docs.cafenoir.tn/` sans cookie, ou avec un cookie
  expiré/révoqué, reçoit une erreur — jamais le HTML, jamais un fichier JS ou un `.json` d'index de
  recherche. La documentation n'est **jamais** livrée à qui n'est pas déjà connecté, quel que soit
  le chemin demandé.
- **Performance :** `auth_request` déclencherait un aller-retour vers le serveur Node à chaque
  fichier chargé (une page de doc charge plusieurs fichiers : HTML, JS, CSS, images). Pour éviter
  de surcharger le serveur applicatif, la réponse de `/api/auth/verify` est mise en cache par nginx
  pendant une courte durée (30 à 60 secondes) avec `proxy_cache`, à la granularité du cookie de
  session — un utilisateur déjà vérifié ne redéclenche pas une vérification en base à chaque clic.
- **Où pointe l'appel :** si `docs.cafenoir.tn` est hébergé sur le **même serveur physique** que
  `system.cafenoir.tn` (cas le plus probable, comme `test.cafenoir.tn` aujourd'hui — voir
  `showcase/deploy/test.cafenoir.tn.nginx.conf`), nginx appelle directement le processus Node en
  local (`http://127.0.0.1:<port>/api/auth/verify`), sans repasser par Internet — plus rapide et
  plus sûr. Sinon, l'appel se fait vers `https://system.cafenoir.tn/api/auth/verify` en HTTPS.

### 2.3 Que se passe-t-il quand l'accès est refusé

Un `401` brut de nginx (page blanche "401 Authorization Required") serait incompréhensible pour un
utilisateur non technique. À la place :
- nginx intercepte le `401` (`error_page 401 = @redirect_to_login`) et redirige le navigateur vers
  `https://system.cafenoir.tn/login?next=<url demandée>`.
- Après connexion réussie sur `system.cafenoir.tn`, l'application renvoie l'utilisateur vers l'URL
  d'origine sur `docs.cafenoir.tn` (paramètre `next`) — pour ne pas le faire atterrir sur la page
  d'accueil de la documentation alors qu'il voulait un article précis. **Amélioration de confort,
  pas un prérequis de sécurité** — peut être livrée en phase 2 (§11) sans bloquer le lancement.

### 2.4 CORS — uniquement pour les appels applicatifs, jamais pour le contenu

Le site de documentation lui-même n'est pas chargé par CORS (c'est nginx, pas le navigateur, qui
valide la session avant de servir les fichiers). CORS n'entre en jeu que si le site de
documentation fait, depuis le navigateur, un appel `fetch()` vers l'API de `system.cafenoir.tn` —
par exemple pour afficher "Connecté en tant que {nom}" dans l'en-tête, via `GET /api/auth/me`
(endpoint qui existe déjà).

- **Jamais de `Access-Control-Allow-Origin: *`** pour ces appels (contrairement à l'endpoint
  public `GET /api/products`, ouvert à tous, sans cookie) : ce sont des requêtes **avec
  identifiants** (le cookie de session part avec). La liste blanche doit contenir exactement
  `https://docs.cafenoir.tn`, et la réponse doit porter `Access-Control-Allow-Credentials: true`.
- Concrètement : `GET /api/auth/me` gagne une vérification d'origine (liste blanche d'un seul nom
  de domaine, lu depuis une variable d'environnement `DOCS_ORIGIN`) en plus de sa logique actuelle.
- `GET /api/auth/verify` (§2.2), lui, n'est **jamais appelé depuis le navigateur** — seulement par
  nginx, en interne — donc il n'a pas besoin d'en-têtes CORS du tout.

### 2.5 Cas particulier : mot de passe temporaire (`must_change_password`)

Aujourd'hui, un compte avec un mot de passe temporaire est bloqué sur *toutes* les routes tant
qu'il n'a pas changé son mot de passe (`requireAuth`), sauf les 2-3 routes indispensables pour
justement le changer. **Décision retenue pour `/api/auth/verify` : même règle, sans exception** —
un compte qui doit encore changer son mot de passe n'a pas non plus accès à la documentation tant
que ce n'est pas fait. Cohérent avec le reste de l'application, et évite un cas limite où un compte
compromis via un mot de passe temporaire connu (voir `AMELIORATIONS_AUTHENTIFICATION_RBAC.md`)
pourrait quand même consulter des pages internes.

---

## 3. "Aide & Support" dans `system.cafenoir.tn`

- Un nouveau point d'entrée dans l'application : une entrée **"Aide & Support"** dans le menu du
  compte (`Header.tsx`, le même menu déroulant que "Sessions & appareils" et "Paramètres" — et,
  sur mobile, dans le même bloc en bas de la barre latérale ajouté récemment, voir le reste du
  dépôt) et, si utile, un bouton "?" discret dans l'en-tête, toujours visible.
- Au clic : ouverture de `https://docs.cafenoir.tn` **dans un nouvel onglet** (pas de navigation
  qui quitte l'application en cours — l'utilisateur peut avoir une saisie en cours ailleurs). Comme
  le cookie de session est déjà partagé (§2.1), l'utilisateur arrive directement sur la
  documentation, déjà connecté — aucune étape de connexion supplémentaire, aucun jeton à
  transmettre dans l'URL.
- Optionnel (phase 2) : passer un paramètre de contexte dans l'URL pour atterrir directement sur
  l'article pertinent selon la page où se trouvait l'utilisateur (ex. depuis "Calcul du
  quotidien", ouvrir directement l'article correspondant) — un identifiant de page en clair dans
  l'URL, jamais un jeton d'authentification.

---

## 4. Déconnexion et expiration de session

- **Déconnexion.** `POST /api/auth/logout` révoque déjà la session en base et efface le cookie.
  Comme le même cookie (même `Domain=.cafenoir.tn`) couvre les deux sous-domaines, se déconnecter
  depuis `system.cafenoir.tn` invalide **immédiatement** l'accès à `docs.cafenoir.tn` aussi — dès
  la requête suivante (rechargement de page, ou prochaine vérification mise en cache par nginx qui
  expire, §2.2). Aucune action séparée à faire côté documentation.
- **Expiration naturelle.** Le cookie expire après 7 jours (`SESSION_MAX_AGE_MS` existant) — même
  comportement des deux côtés, sans code supplémentaire, puisque c'est le même cookie.
- **Révocation à distance.** La page "Sessions & appareils" existante permet déjà de révoquer une
  session depuis un autre appareil. Une session révoquée de cette façon perd aussi son accès à la
  documentation, pour la même raison (même table `sessions` en base, interrogée par
  `/api/auth/verify` comme par `requireAuth`).
- **Sur `docs.cafenoir.tn` :** si une vérification échoue en cours de navigation (session expirée
  pendant la lecture d'un article), le prochain chargement de page ou de recherche redirige vers la
  connexion (§2.3) — pas de fausse impression de rester connecté indéfiniment côté client.

---

## 5. Autorisation et considérations de sécurité (récapitulatif)

| Risque | Parade |
|---|---|
| Accès direct à une URL de doc sans session | `auth_request` nginx bloque avant de servir un octet de contenu (§2.2) |
| Accès direct à un fichier "de données" (JSON de recherche, image) en contournant la page d'accueil | `auth_request` s'applique à *tous* les chemins du site, pas seulement `/` |
| Cookie de session volé via XSS | `httpOnly` déjà en place — inchangé, aucun script (sur aucun des deux sous-domaines) ne peut le lire |
| Cookie intercepté en clair | `secure` déjà en place — jamais envoyé hors HTTPS |
| CSRF sur la documentation | sans objet en v1 (site 100% lecture seule, aucune requête qui modifie un état) — à réévaluer si un widget "cet article vous a aidé ?" est ajouté (réutiliser alors le CSRF à double cookie déjà en place, §2.4 de `server/middleware/csrf.ts`) |
| Cookie partagé élargit la surface d'exposition à tout `*.cafenoir.tn` | acceptable ici : tous les sous-domaines existants (`system`/`cafe`, `test`, désormais `docs`) sont opérés par la même équipe — à ne plus faire si un sous-domaine tiers (ex. un prestataire externe) est ajouté un jour |
| Clickjacking (le site de doc affiché dans une `<iframe>` piégée) | en-têtes `X-Frame-Options: SAMEORIGIN` / `frame-ancestors 'self'` sur `docs.cafenoir.tn`, même pattern que `test.cafenoir.tn.nginx.conf` |
| Indexation par les moteurs de recherche | `robots.txt` en interdiction totale + méta `noindex` — même s'ils sont bloqués par `auth_request`, mieux vaut ne jamais tenter de le crawler (résultat 401 systématique, pas d'intérêt et bruit inutile dans les logs) |
| Surcharge du serveur applicatif par les vérifications répétées | mise en cache courte côté nginx de la vérification de session (§2.2) |

---

## 6. Structure du site, navigation, recherche, catégories

Le contenu suit le plan déjà défini dans
[PLAN_DOCUMENTATION_CLIENT.md](PLAN_DOCUMENTATION_CLIENT.md) (§1.2 et §2 de ce document) — ce
plan-ci ne redéfinit pas le contenu, seulement **comment il est organisé et parcouru** une fois sur
`docs.cafenoir.tn`.

### 6.1 Arborescence

```
Accueil
 ├─ Les 5 actions les plus fréquentes (raccourcis en tuiles, identiques au guide de démarrage)
 ├─ Barre de recherche (mise en avant, en haut de toutes les pages)
 └─ Catégories (une par module de l'application) :
     ├─ Ventes
     ├─ Stock
     ├─ Produits
     ├─ Achats
     ├─ Dépenses
     ├─ Personnel
     ├─ Rapports
     ├─ Paramètres
     └─ Rôles & permissions / Administration (réservé, voir §8)
         └─ chaque catégorie → liste d'articles → un article = un parcours pas-à-pas
```

- **Un article = un objectif de l'utilisateur**, pas une page technique. Le nom de l'article est
  la question que l'utilisateur se pose ("Comment saisir une vente ?"), jamais un nom d'écran ou de
  composant.
- **Fil d'Ariane** (`Accueil > Ventes > Comment saisir une vente ?`) en haut de chaque article, pour
  toujours savoir où l'on est et remonter facilement.
- **Sommaire de l'article** (ancre vers chaque étape) pour les articles longs, en particulier sur
  desktop où il peut rester visible en marge pendant la lecture.
- **Liens "voir aussi"** en bas de chaque article, vers 2-3 articles liés (ex. depuis "Ajouter une
  dépense", lien vers "Catégories de dépenses").

### 6.2 Recherche

- Recherche en texte plein sur les titres et le contenu des articles — pas besoin d'un moteur de
  recherche serveur pour ce volume de contenu (quelques dizaines d'articles) : un **index généré au
  moment du build** (un fichier JSON listant titre/texte/mots-clés par article), chargé une fois et
  filtré côté navigateur.
- Résultats affichés **en direct pendant la frappe**, avec l'extrait de texte qui correspond
  surligné — pas seulement une liste de titres.
- Tolère les fautes de frappe courantes et les synonymes du métier (ex. "caisse" doit aussi
  trouver "Calcul du quotidien" ; "avance" doit aussi trouver "Suivi financier") — une petite table
  de synonymes maintenue à la main dans le fichier d'index suffit, pas besoin de recherche
  sémantique.
- La recherche reste **derrière la garde d'accès** comme le reste du site (§2.2) — son fichier
  d'index n'est jamais accessible sans session valide.

---

## 7. Exigences UI/UX — plateforme de documentation professionnelle

Public cible : personnel non technique du café (gérant, caissiers, comptable) — les mêmes
personnes qui utilisent déjà `system.cafenoir.tn`. Le site de documentation doit avoir l'air d'une
**extension naturelle** de l'application, pas d'un outil différent.

- **Cohérence visuelle avec `system.cafenoir.tn` :** même palette de couleurs, même typographie,
  mêmes composants d'interface (boutons, cartes, badges) que l'application de gestion — réutiliser
  le même système de design (Tailwind + les mêmes tokens de couleur) plutôt que d'en inventer un
  nouveau. L'utilisateur ne doit jamais se demander s'il a quitté l'application.
- **En-tête simple et constant sur toutes les pages :** logo Café Noir (retour à l'accueil de la
  doc), barre de recherche, lien "Retour à l'application" vers `system.cafenoir.tn`, nom de
  l'utilisateur connecté.
- **Page d'accueil orientée tâches**, pas orientée menu technique : les 5 actions les plus
  fréquentes d'abord (grandes tuiles cliquables avec icône + une phrase), catégories ensuite.
- **Un article = étapes numérotées + captures d'écran annotées**, jamais de longs paragraphes de
  texte. Vocabulaire strictement celui des boutons/menus réels de l'application (voir
  `PLAN_DOCUMENTATION_CLIENT.md` §1.2) — pas de jargon technique.
- **Mode lecture imprimable/PDF** par article (utile pour un employé qui veut une fiche papier
  affichée près de la caisse) — un bouton "Imprimer cet article" qui applique une feuille de style
  d'impression épurée (sans navigation, sans en-tête).
- **États clairs et rassurants**, jamais d'écran d'erreur technique : "Vous devez vous reconnecter"
  avec un bouton, plutôt qu'un message d'erreur serveur brut (§2.3).

---

## 8. Rôles / permissions — v1 et extension future

- **v1 : accès uniforme.** N'importe quel compte authentifié dans `system.cafenoir.tn`, quel que
  soit son rôle (Super Admin, Compte Saisie, ou un rôle personnalisé), a accès à l'intégralité de
  la documentation. C'est un choix délibéré : le personnel de caisse a autant besoin de savoir
  "comment saisir une vente" qu'un gérant, et la documentation elle-même ne contient aucune donnée
  sensible (ni chiffres réels, ni identifiants) — seulement des captures d'écran d'un jeu de
  démonstration (voir `PLAN_DOCUMENTATION_CLIENT.md` §3).
- **Extension future (non requise pour le lancement) : sections réservées.** Si un jour une
  section doit être réservée (ex. "Guide administrateur" uniquement pour qui a la permission
  `roles:manage`), le mécanisme s'ajoute **sans changer l'architecture d'accès** (§2) :
  1. `GET /api/auth/me` (déjà appelé pour afficher le nom de l'utilisateur, §2.4) renvoie déjà les
     permissions du compte — le site de doc les a donc déjà à disposition côté client.
  2. Les sections réservées sont simplement masquées côté client si la permission manque — exactement
     le même principe de défense qu'aujourd'hui dans `Sidebar.tsx` (`hasPermission(...)` cache un
     lien, sans être la vraie barrière de sécurité).
  3. Si un vrai besoin de confidentialité de contenu apparaît (pas juste de confort de
     navigation), la vraie barrière resterait le même mécanisme qu'ailleurs dans l'application :
     une vérification côté serveur — ici, un deuxième `auth_request` plus strict sur les chemins
     concernés, qui vérifierait aussi la permission (pas seulement la session) via un endpoint
     dédié (ex. `GET /api/auth/verify?require=roles:manage`).
  - **Non retenu pour le lancement** — à ne construire que si le besoin se confirme, pour ne pas
    complexifier la v1 avec une fonctionnalité non demandée.

---

## 9. Recommandation technologique

Basée sur ce qui existe déjà dans ce dépôt (réutilisation d'outillage plutôt qu'un nouveau choix
technique à maintenir) :

- **Le site lui-même : un site statique**, construit avec **Vite + React + TypeScript + Tailwind**
  — exactement la même chaîne que `showcase/` (le site vitrine `test.cafenoir.tn`) déjà présent
  dans ce dépôt. Pas de serveur applicatif dédié à la documentation : uniquement des fichiers
  HTML/JS/CSS statiques servis par nginx, ce qui simplifie considérablement la sécurité (rien à
  patcher côté "backend de la doc", puisqu'il n'y en a pas — la seule pièce serveur est le petit
  endpoint `/api/auth/verify` déjà décrit, sur le serveur applicatif existant).
- **Contenu en Markdown**, un fichier par article, converti en pages au moment du build (même
  esprit que la génération de l'index de recherche, §6.2) — un rédacteur non développeur peut
  modifier un article sans toucher au code de présentation.
- **Composants réutilisés du système de design existant** (icônes `lucide-react`, palette de
  couleurs Tailwind déjà définie pour `system.cafenoir.tn`) plutôt que réinventés.
- **Hébergement** : nouveau dossier au niveau racine du dépôt (ex. `help-center/`, au même niveau
  que `showcase/`), avec son propre `package.json`/`vite.config.ts`, son propre pipeline de build
  (`npm run build` → `help-center/dist/`), et son propre bloc nginx
  (`help-center/deploy/docs.cafenoir.tn.nginx.conf`), sur le modèle exact de
  `showcase/deploy/test.cafenoir.tn.nginx.conf` — avec en plus le bloc `auth_request` (§2.2), que
  `test.cafenoir.tn` n'a pas besoin d'avoir puisqu'il est volontairement public.

---

## 10. Déploiement, domaine, HTTPS, variables d'environnement

- **DNS :** un enregistrement `docs.cafenoir.tn` pointant vers le même serveur que
  `system.cafenoir.tn` (recommandé, pour l'appel `auth_request` en local/loopback, §2.2) ou vers un
  autre serveur si nécessaire (l'appel se fait alors en HTTPS vers le domaine public).
- **HTTPS :** certificat Let's Encrypt dédié pour `docs.cafenoir.tn`, même procédure que
  `test.cafenoir.tn` (`certbot`), redirection HTTP → HTTPS systématique, même structure de bloc
  nginx que `showcase/deploy/test.cafenoir.tn.nginx.conf`.
- **Variables d'environnement à ajouter côté serveur applicatif** (`.env`, à documenter dans
  `.env.example`) :
  - `SESSION_COOKIE_DOMAIN` — `.cafenoir.tn` en production, vide en développement (§2.1).
  - `DOCS_ORIGIN` — `https://docs.cafenoir.tn`, utilisée pour la liste blanche CORS de
    `GET /api/auth/me` (§2.4).
- **Rien côté site de documentation lui-même** : c'est un site statique, sans secret ni clé d'API à
  configurer (l'URL de l'endpoint de vérification est un détail de configuration nginx, pas du
  code JavaScript embarqué dans le site).
- **Déploiement :** même mécanisme que le reste du projet (build → copie de `dist/` sur le
  serveur → `nginx -t && systemctl reload nginx`), pas de nouvelle méthode de déploiement à
  introduire.

---

## 11. Phases d'implémentation (ordre recommandé)

1. **Fondations serveur.** Ajouter `GET /api/auth/verify`, la prise en compte de
   `SESSION_COOKIE_DOMAIN` sur les 3 cookies concernés (session, CSRF, et leur effacement au
   logout), et la liste blanche CORS pour `DOCS_ORIGIN` sur `GET /api/auth/me`. Vérifiable
   indépendamment du reste (via `curl`), avant même que `docs.cafenoir.tn` existe.
2. **Garde d'accès nginx, à vide.** Configurer le bloc `docs.cafenoir.tn` avec `auth_request`
   pointant vers l'endpoint de l'étape 1, servant une page statique de test minimale ("ça
   fonctionne"). Valider la checklist de sécurité (§12) sur cette coquille vide, avant d'y mettre
   le moindre contenu — plus simple à déboguer sans le bruit du vrai contenu.
3. **Squelette du site.** Mise en place du projet (`help-center/`), en-tête/navigation/recherche
   fonctionnels mais avec un contenu minimal ou fictif — valide l'expérience de navigation et la
   cohérence visuelle avec `system.cafenoir.tn`.
4. **Contenu.** Rédaction et intégration des articles, selon le plan déjà établi dans
   `PLAN_DOCUMENTATION_CLIENT.md` (captures d'écran, catégories, articles) — la plus grosse partie
   du travail, indépendante du reste de ce plan.
5. **Point d'entrée dans l'application.** Lien "Aide & Support" dans `system.cafenoir.tn` (§3).
6. **Confort.** Redirection post-connexion vers l'URL demandée (§2.3), lien contextuel depuis une
   page de l'application vers l'article correspondant (§3) — améliorations, pas des prérequis.
7. **Revue de sécurité et lancement.** Exécution complète de la checklist §12, puis ouverture
   DNS/certificat en production.

---

## 12. Checklist de test et de vérification sécurité

À exécuter avant chaque mise en production, et à rejouer après toute modification touchant
l'authentification :

**Accès non autorisé (le plus important — à tester en premier)**
- [ ] Navigation privée, aucun cookie : ouvrir `https://docs.cafenoir.tn/` → doit être bloqué
      (redirigé vers la connexion), jamais afficher de contenu.
- [ ] Navigation privée : ouvrir directement un lien profond vers un article précis → même blocage
      (pas seulement la page d'accueil).
- [ ] Navigation privée : requête directe sur un fichier statique (`/assets/....js`,
      `/search-index.json`) sans passer par le HTML → également bloqué, aucune fuite de contenu.
- [ ] `curl` sans cookie sur plusieurs chemins du site → toujours un statut de refus, jamais `200`.

**Session valide**
- [ ] Connexion normale sur `system.cafenoir.tn`, puis ouverture de `docs.cafenoir.tn` → accès
      immédiat, sans reconnexion.
- [ ] Le cookie de session est bien visible, dans les outils développeur du navigateur, avec
      `Domain=.cafenoir.tn` (pas `system.cafenoir.tn` seul).
- [ ] Navigation, recherche, articles : tout fonctionne normalement une fois connecté.

**Déconnexion / expiration**
- [ ] Déconnexion depuis `system.cafenoir.tn`, puis rechargement de `docs.cafenoir.tn` → accès
      révoqué (immédiatement, ou au plus après l'expiration du cache nginx, §2.2).
- [ ] Révocation d'une session depuis "Sessions & appareils" (sur un autre appareil) → l'accès à la
      documentation sur cet appareil est révoqué aussi.
- [ ] Un cookie de session expiré (au-delà de 7 jours) est refusé.

**CORS et en-têtes**
- [ ] `GET /api/auth/me` depuis l'origine `https://docs.cafenoir.tn` fonctionne (avec
      identifiants) ; depuis toute autre origine, la requête est refusée par le navigateur.
- [ ] En-têtes `X-Frame-Options` / `frame-ancestors`, `X-Content-Type-Options` présents sur
      `docs.cafenoir.tn`, sur le modèle de `test.cafenoir.tn.nginx.conf`.
- [ ] `robots.txt` interdit tout crawl ; balises `noindex` présentes.

**Performance / robustesse**
- [ ] Le cache nginx de la vérification de session est actif — vérifier qu'une navigation normale
      ne déclenche pas une requête vers le serveur applicatif à chaque fichier chargé.
- [ ] Le serveur applicatif reste réactif même en cas de forte navigation sur la documentation
      (l'endpoint `/api/auth/verify` reste très rapide, sans requête base de données coûteuse).

**Expérience non technique**
- [ ] Un utilisateur non connecté qui arrive sur `docs.cafenoir.tn` voit un message clair et un
      bouton "Se connecter", jamais une page d'erreur brute.
- [ ] Un compte avec un mot de passe temporaire (`must_change_password`) est traité de façon
      cohérente avec le reste de l'application (§2.5), et le message affiché l'explique clairement.
