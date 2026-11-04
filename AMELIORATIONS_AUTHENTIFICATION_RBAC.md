# Évolution de l'authentification et du système de rôles & permissions (RBAC)

Ce document décrit l'état actuel de l'authentification et du RBAC dans Café Noir, et propose une
feuille de route pour les faire évoluer — en particulier vers une **authentification par email, ou
numéro de téléphone, ou CIN + mot de passe**, à la place du système actuel (CIN seul, sans mot de
passe).

---

## 1. État actuel

### 1.1 Authentification

- **Un seul identifiant : le numéro CIN.** `server/routes/auth.ts` — `POST /api/auth/login` reçoit
  `{ cin }`, vérifie qu'il correspond à un utilisateur existant (`SELECT ... FROM users WHERE cin = ?`)
  et ouvre une session. **Aucun mot de passe n'existe dans le système.** Quiconque connaît (ou devine)
  un CIN à 8 chiffres peut se connecter au compte correspondant.
- **Session par cookie httpOnly.** Un jeton aléatoire (`crypto.randomUUID()`) est stocké dans la
  table `sessions` et renvoyé au navigateur via un cookie `session` (httpOnly, `sameSite=lax`,
  `secure` en production). `server/middleware/auth.ts` (`requireAuth`) valide ce cookie sur chaque
  requête protégée.
- **Protection CSRF par double-cookie.** `server/middleware/csrf.ts` — un cookie `csrf_token` non
  httpOnly est posé sur toute requête ; le client doit le renvoyer dans l'en-tête `X-CSRF-Token`
  pour toute requête qui modifie l'état (`server/routes/*`, sauf `GET`).
- **Gestion des sessions/appareils.** `Sessions & appareils` (menu du compte, `SessionsPage.tsx`)
  liste les sessions actives (IP, appareil, dernière activité) et permet de révoquer une session à
  distance — voir `GET/DELETE /api/auth/sessions`.
- **Schéma actuel de `users` :**
  ```sql
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    cin TEXT NOT NULL UNIQUE,
    role_id TEXT REFERENCES roles(id),
    created_at TEXT NOT NULL
  );
  ```
  Pas de colonne `email`, `phone`, ni `password_hash`.

### 1.2 Rôles & permissions (RBAC)

Le RBAC a été mis en place récemment et est fonctionnel :

- **Catalogue de permissions défini dans le code**, pas en base : `src/data/rbacModel.ts`
  (`PERMISSIONS: PermissionDef[]`, format de clé `<module>:<action>`, ex. `sales:refund`,
  `purchases:cancel`, `hr:financial`, `roles:manage`). Ajouter une permission = ajouter une ligne
  dans ce tableau, sans migration de base de données.
- **Seule l'assignation d'une permission à un rôle est persistée**, dans `role_permissions
  (role_id, permission_key)`. Table `roles (id, name, description, is_system, created_at)`.
- **Deux rôles créés au démarrage** (`server/rbac/bootstrap.ts`, appelé à chaque boot du serveur) :
  - **Super Admin** (`is_system = 1`) — protégé contre le renommage/la modification/la suppression,
    et bénéficie d'un **contournement total** dans `requirePermission` (voir plus bas), donc il ne
    peut jamais être verrouillé hors de l'application même si le catalogue grandit.
  - **Compte Saisie** — rôle ordinaire (modifiable), avec un jeu de permissions minimal par défaut.
- **Application côté serveur, pas seulement dans l'interface.** `server/middleware/auth.ts` :
  - `requireAuth` peuple `req.user` avec `roleId`, `roleName`, `isSuperAdmin`, `permissions: string[]`
    (jointure `users` → `roles` → `role_permissions`).
  - `requirePermission(key)` est un middleware appliqué sur **chaque route** de chaque module
    (`server/routes/*.ts`) — un utilisateur sans la permission reçoit un `403`, quelle que soit
    l'interface utilisée pour appeler l'API.
- **Gestion des rôles et utilisateurs** : `server/routes/roles.ts` (`/api/roles`, `/api/users`,
  `/api/permissions`), protégé par la permission `roles:manage`. Comprend les garde-fous
  anti-verrouillage : impossible de supprimer/renommer le rôle Super Admin, de supprimer un rôle
  encore assigné à des utilisateurs, ou de supprimer/rétrograder le dernier Super Admin restant.
- **Interface** : `src/components/RolesPermissionsPage.tsx`, accessible **uniquement** depuis le
  menu déroulant du compte (`Header.tsx`, item « Rôles & permissions »), affiché seulement si
  `hasPermission('roles:manage')` — jamais comme module de la barre latérale, conformément à la
  demande initiale.
- **Frontend permission-aware** : `AuthContext.hasPermission()` filtre la barre latérale
  (`Sidebar.tsx`) et masque les actions non autorisées, mais ce n'est qu'un confort d'UX — le vrai
  verrou est toujours côté serveur. Le chargement initial des données (`App.tsx#loadAllData`)
  n'appelle plus que les endpoints que l'utilisateur est autorisé à voir (corrigé pour éviter les
  403 en cascade avec un rôle restreint comme Compte Saisie).

### 1.3 Limites actuelles à garder en tête

- Un CIN est une donnée semi-publique (état civil, souvent visible sur des documents administratifs
  partagés) — l'absence de mot de passe est le point le plus fragile du système aujourd'hui.
- Aucune limitation du nombre de tentatives de connexion (`POST /api/auth/login` n'a pas de
  rate-limiting) : combiné à l'absence de mot de passe, un CIN à 8 chiffres reste énumérable par
  force brute (10⁸ combinaisons, sans protection).
- Aucune récupération de compte (« mot de passe oublié ») — logique, puisqu'il n'y a pas de mot de
  passe. Cela devra être conçu en même temps que l'ajout du mot de passe.
- Le catalogue de permissions est riche, mais toujours **au niveau d'un module entier** (ex.
  `hr:financial` donne accès à tous les salaires) — pas de portée plus fine (par employé, par
  agence/point de vente, etc.).

---

## 2. Cible : connexion par (email OU téléphone OU CIN) + mot de passe

### 2.1 Principe

Remplacer l'authentification « CIN seul » par une authentification classique à deux facteurs de
connaissance : **un identifiant** (au choix : email, téléphone, ou CIN) **+ un mot de passe**. Le
CIN reste un identifiant valide (habitude déjà acquise par les utilisateurs actuels), mais n'est
plus, à lui seul, suffisant pour se connecter.

### 2.2 Schéma de données

Étendre `users` (migration idempotente dans `server/db/connection.ts`, comme celles déjà en place
pour `role_id`, `departure_date`, etc.) :

```sql
ALTER TABLE users ADD COLUMN email TEXT;             -- nullable, unique si renseigné
ALTER TABLE users ADD COLUMN phone TEXT;              -- nullable, unique si renseigné
ALTER TABLE users ADD COLUMN password_hash TEXT;      -- nullable pendant la période de transition
ALTER TABLE users ADD COLUMN password_updated_at TEXT;
ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;       -- verrouillage temporaire après trop d'échecs
```

- `email` et `phone` doivent être **nullable** (un utilisateur peut n'avoir qu'un CIN + mot de
  passe au départ) mais chacun **unique s'il est renseigné** — un index unique partiel
  (`CREATE UNIQUE INDEX ... WHERE email IS NOT NULL`) plutôt qu'une contrainte `UNIQUE` classique,
  SQLite traitant déjà plusieurs `NULL` comme distincts donc cela fonctionne nativement avec un
  simple `UNIQUE`, à vérifier lors de l'implémentation.
- `password_hash` nullable **uniquement pendant la migration** (voir §2.5) — à terme, une fois tous
  les comptes migrés, elle peut redevenir obligatoire pour toute création de compte future.

### 2.3 Hachage du mot de passe

Aucune librairie de hachage de mot de passe n'est présente dans le projet aujourd'hui. Deux options
raisonnables, sans dépendance native compliquée à builder sur le VPS :

- **`bcrypt` (ou `bcryptjs` en pur JS si la compilation native pose problème sur le VPS)** — le
  standard le plus répandu, bien documenté, coût réglable.
- **`node:crypto`'s `scrypt`** (déjà disponible, zéro dépendance) — demande un peu plus de code
  (générer un sel, stocker `sel:hash`, comparer en temps constant) mais évite complètement une
  dépendance native supplémentaire, cohérent avec le choix déjà fait pour `better-sqlite3` (seule
  dépendance native du projet).

Recommandation : commencer par `scrypt` (zéro dépendance, déjà dans Node), sauf si une bibliothèque
d'audit de sécurité est requise plus tard, auquel cas basculer vers `bcrypt`.

### 2.4 Nouvelle route de connexion

`POST /api/auth/login` change de forme :

```ts
const loginSchema = z.object({
  identifier: z.string().min(1), // email, téléphone ou CIN — résolu dans cet ordre
  password: z.string().min(1),
});
```

Résolution de l'identifiant (une seule requête, sans révéler lequel des trois champs a matché — un
message d'erreur générique « Identifiant ou mot de passe incorrect » dans tous les cas d'échec, pour
ne pas laisser un attaquant deviner quels CIN/emails existent) :

```sql
SELECT * FROM users WHERE email = ? OR phone = ? OR cin = ?
```

Puis vérification du mot de passe (`scrypt`/`bcrypt.compare`), incrémentation de
`failed_login_attempts` en cas d'échec, verrouillage temporaire (`locked_until`) après un seuil
(ex. 5 tentatives → 15 minutes de blocage) — mesure qui manque aujourd'hui même sur le système CIN
seul.

### 2.5 Migration des comptes existants (aucun mot de passe aujourd'hui)

Point le plus délicat : les comptes déjà créés (dont le Super Admin de démarrage) n'ont pas de mot
de passe. Deux approches, non exclusives :

1. **Mot de passe temporaire généré + changement forcé à la première connexion.** Au moment de la
   migration, générer un mot de passe temporaire par utilisateur, l'afficher une seule fois au
   Super Admin (ex. dans le résultat d'une commande de migration, ou dans l'écran Rôles &
   Permissions le temps de la transition), et forcer un flag `must_change_password` qui redirige
   vers un écran de changement de mot de passe obligatoire avant tout accès à l'application.
2. **Le Super Admin définit lui-même le mot de passe de chaque compte** via l'écran Rôles &
   Permissions (ajouter un champ mot de passe au formulaire de création/édition d'utilisateur dans
   `RolesPermissionsPage.tsx` et `server/routes/roles.ts`), communiqué ensuite hors-ligne à chaque
   employé.

Vu la taille de l'équipe visée par cette application (un café, quelques comptes), l'option 2 est
probablement suffisante et plus simple à mettre en œuvre — pas besoin d'un flux d'e-mail
transactionnel pour un mot de passe temporaire.

### 2.6 Récupération de compte (« mot de passe oublié »)

À concevoir en même temps, sinon un utilisateur qui oublie son mot de passe reste bloqué sans
recours (le CIN seul ne suffira plus). Deux pistes selon l'infrastructure disponible :

- **Envoi d'un lien de réinitialisation par email** — nécessite un service d'envoi d'e-mails
  (ex. Resend, SendGrid, ou SMTP direct) : nouvelle dépendance externe, coût récurrent potentiel.
- **Réinitialisation par un Super Admin uniquement** (pas de flux self-service) — le plus simple à
  implémenter et suffisant pour une petite équipe : ajouter un bouton « Réinitialiser le mot de
  passe » dans `RolesPermissionsPage.tsx` (génère un mot de passe temporaire, force
  `must_change_password`), gate par `roles:manage` comme le reste de cet écran.

Recommandation : démarrer avec la réinitialisation par Super Admin uniquement (§2.6, option 2),
qui ne demande aucune nouvelle dépendance ni service externe, et n'introduire l'envoi d'email que
si le besoin d'un flux self-service se confirme.

### 2.7 Frontend

- `src/components/LoginPage.tsx` — remplacer le champ unique « CIN » par un champ « Email,
  téléphone ou CIN » + un champ mot de passe. Garder la validation cliente du format CIN existante
  uniquement comme aide contextuelle, pas comme contrainte bloquante (l'utilisateur peut aussi
  saisir un email ou un numéro de téléphone).
- `src/auth/AuthContext.tsx` — `login(cin: string)` devient `login(identifier: string, password: string)`.
  Le reste (stockage de `user` dans le contexte, `hasPermission`) ne change pas.
- `RolesPermissionsPage.tsx` (onglet Utilisateurs) — le formulaire de création/édition
  d'utilisateur gagne des champs `email` (optionnel), `phone` (optionnel), `password` (obligatoire
  à la création), plus un bouton « Réinitialiser le mot de passe » par utilisateur existant.
- `src/data/rbacModel.ts` — `RbacUser`/`DraftUser`/`validateDraftUser` à étendre avec ces nouveaux
  champs et leurs règles de validation (email : format ; téléphone : format tunisien à 8 chiffres
  précédé optionnellement de +216 ; mot de passe : longueur minimale raisonnable, ex. 8 caractères).

### 2.8 Sécurité additionnelle à considérer à cette occasion

- **Rate-limiting sur `/api/auth/login`** (par IP et/ou par identifiant), indépendamment du
  verrouillage de compte — évite le bourrage de force brute distribué sur plusieurs comptes.
- **Rotation du cookie de session à la connexion** (déjà le cas, un nouveau jeton est généré à
  chaque login) — à conserver.
- **Politique de mot de passe minimale** (longueur, pas de mot de passe trivial) — appliquée côté
  serveur (zod `refine`), pas seulement côté client.
- **Journalisation** : consigner les connexions échouées dans `activity_log` (actuellement, seules
  les actions réussies sont journalisées) — utile pour repérer une tentative d'intrusion a
  posteriori.

---

## 3. Pistes d'évolution du RBAC (au-delà de l'authentification)

Le RBAC actuel est déjà complet dans sa mécanique (catalogue de permissions, rôles personnalisés,
application serveur systématique). Les évolutions suivantes l'enrichiraient sans le refondre :

1. **Portée plus fine (« scoping ») sur certaines permissions.** Aujourd'hui `hr:financial` donne
   accès aux salaires de *tous* les employés. Une évolution naturelle serait une permission
   scindée par employé ou par équipe (ex. un responsable qui ne voit que le suivi financier de son
   équipe) — demanderait une table de liaison `role_permission_scopes` ou équivalent.
2. **Rôles à durée limitée / accès temporaire.** Utile pour un remplaçant ponctuel : assigner un
   rôle avec une date d'expiration (`users.role_expires_at` ou une table dédiée), après laquelle le
   compte retombe automatiquement sur un rôle par défaut (ou est désactivé).
3. **Authentification à deux facteurs (2FA) pour le rôle Super Admin.** Vu qu'un compte Super Admin
   compromis a accès à tout (y compris la gestion des rôles elle-même), un 2FA (TOTP via
   `otplib`, ou codes de secours) spécifiquement exigé pour ce rôle réduit fortement le risque.
4. **Historique des changements de permissions.** `activity_log` journalise déjà les créations/
   modifications de rôles (`recordActivity('Rôles & permissions', ...)`), mais un écran dédié
   montrant « qui a changé quelle permission, quand » (plutôt que noyé dans le journal général)
   faciliterait l'audit.
5. **Permissions « en lecture seule » vs « en écriture » plus systématiques.** Certains modules
   (ex. `reports`) n'ont qu'une permission `view`/`financial` — cohérent avec leur nature
   read-only. D'autres pourraient bénéficier d'un découpage plus fin view/create/edit/delete déjà
   présent ailleurs (ex. `purchases`), à généraliser si de nouveaux besoins métier apparaissent.
6. **Comptes de service / clés API.** Si une intégration externe (comptabilité, caisse
   enregistreuse tierce, etc.) doit un jour accéder à l'API, prévoir un type de compte distinct
   (sans mot de passe interactif, avec une clé API à portée de permissions restreinte) plutôt que
   de créer un compte utilisateur classique pour cet usage.
7. **Auto-verrouillage anti-doublon de Super Admin déjà couvert** — rien à ajouter ici, le
   garde-fou existant (`assertNotLastSuperAdmin`) est suffisant et ne doit pas être affaibli par de
   futurs changements.

---

## 4. Ordre de priorité suggéré

1. **[Fondation]** Ajouter `email`/`phone`/`password_hash` à `users`, implémenter le hachage
   (`scrypt`), migrer `POST /api/auth/login` vers `{ identifier, password }`.
2. **[Fondation]** Mettre à jour `LoginPage.tsx`, `AuthContext.tsx`, et le formulaire utilisateur de
   `RolesPermissionsPage.tsx` (mot de passe à la création + bouton réinitialisation).
3. **[Sécurité]** Rate-limiting + verrouillage temporaire après échecs répétés sur `/api/auth/login`.
4. **[Migration]** Définir un mot de passe pour chaque compte existant (option §2.5.2) avant de
   couper l'ancien flux CIN-seul.
5. **[Confort]** Récupération de mot de passe par Super Admin (§2.6), puis éventuellement
   self-service par email si le besoin se confirme.
6. **[RBAC, optionnel]** 2FA pour Super Admin — le gain sécurité le plus élevé pour l'effort le
   plus contenu parmi les pistes de la section 3.
7. **[RBAC, optionnel]** Portée fine par employé/équipe, rôles à durée limitée, comptes de service —
   à n'entreprendre que si un besoin métier concret se présente, pour ne pas complexifier le
   système au-delà de ce qui est utilisé.
