# Café Noir — site vitrine

Site public de Café Noir, fidèle à la maquette validée : une **page d'accueil** d'un seul tenant
(Accueil · Notre histoire · Galerie · Contact, avec un aperçu du menu) et une **page Menu** dédiée
(`/menu`) atteinte par « Découvrir notre menu », « Voir le menu complet » et le lien Menu de
l'en-tête. C'est un projet **indépendant** de l'application de gestion : il vit dans ce dossier, a son
propre `package.json`, son propre build, et se déploie sur **une autre URL** que le système
(`cafe.cafenoir.tn`).

- **Logo** : texte « Café Noir » en serif (composant `src/components/Logo.tsx`, aucune image).
- **Typographie / couleurs** : titres en *Newsreader*, texte en *DM Sans*, vert menthe `#5DD3B2`
  sur fond crème (jeu de couleurs dans `src/index.css`).
- **Mode clair / sombre** : bouton lune/soleil dans l'en-tête ; choix mémorisé, sinon préférence de
  l'appareil.
- **Responsive** : mobile (menu hamburger), tablette et ordinateur.
- **Menu dynamique** : les produits viennent en direct du système via
  `GET https://cafe.cafenoir.tn/api/products` (route publique en lecture seule ; l'ancienne URL
  `/api/public/products` répond aussi — voir `../PUBLIC_PRODUCTS_API.md`). Le CRUD des produits se
  fait uniquement dans le système ; le site ne fait que lire.
  - Sur l'accueil, les cartes (Cafés, Boissons, Pâtisseries, Salés…) sont **les catégories du système**,
    avec leurs produits et prix en TND (jusqu'à 4 cartes, 5 produits chacune ; une seule catégorie =
    une carte large). « + N autres » ouvre la page Menu sur la bonne catégorie.
  - La page **Menu** (`/menu`) liste tous les produits par catégorie (recherche, filtres, descriptions,
    tailles avec prix, suppléments, photos).
  - Un produit ajouté, modifié, rendu indisponible ou supprimé dans le système apparaît/disparaît
    tout seul : le site se rafraîchit toutes les 30 secondes et au retour sur l’onglet.
  - Si le système a une photo pour un produit de la catégorie, elle remplace la photo par défaut de la carte.

## SEO

Tout le SEO est généré au build (`seo/seoPlugin.ts`, données dans `src/config/seo.ts`) :

- **Un `<head>` par page**, en HTML statique (donc lu aussi par les robots et les aperçus de liens qui
  n'exécutent pas JavaScript) : `index.html` pour `/`, `menu/index.html` pour `/menu` — titre, description,
  canonical, hreflang, Open Graph, Twitter Card, géolocalisation, `robots`.
- **Données structurées JSON-LD** : `CafeOrCoffeeShop` (adresse, coordonnées GPS, horaires, lien vers le
  menu et le plan), `WebSite` et `BreadcrumbList` sur `/menu`.
- **Image de partage (Open Graph / Twitter)** : `public/images/ambiance.jpg`. Sa largeur et sa hauteur sont
  lues dans le fichier au build : remplacez-le par une autre photo et tout reste juste (idéal : 1200×630 ou
  1600×900, sujet au centre).
- **Fichiers générés** : `sitemap.xml`, `robots.txt`, `llms.txt`, avec l'adresse publique du site.
  `manifest.webmanifest`, `favicon.ico`, les icônes PNG et `apple-touch-icon.png` sont dans `public/`.
- **Adresse publique** : par défaut `https://test.cafenoir.tn`. Pour un autre domaine, construire avec
  `VITE_SITE_URL=https://mon-domaine.tn npm run build`.
- Le titre, la description et le canonical suivent aussi la navigation dans le site ; une adresse inconnue
  est en `noindex` (et nginx répond un vrai code 404).
- Le SEO du menu ne cite aucun produit ni aucune catégorie : ils viennent du système.

## Photos

Les images sont dans `public/images/` : `hero.jpg`, `cafes.jpg`, `boissons.jpg`, `patisseries.jpg`,
`sales.jpg`, `story.jpg`, `ambiance.jpg`. **Ce sont des extraits basse résolution de la maquette** : pour
la mise en ligne, remplacez chaque fichier par la vraie photo **en gardant le même nom**.
Tailles conseillées : `hero` 1800×1000, `ambiance` 2000×700, `story` 1200×600, cartes 800×450.
La galerie (`GALLERY` dans `src/config/site.ts`) réutilise ces mêmes fichiers.

## Contenu à personnaliser

Les informations du site — phrase d'accroche, adresse, téléphone, e-mail, horaires, ville / code postal,
**liens des réseaux sociaux** (Instagram, Facebook, TikTok, YouTube, WhatsApp, X, LinkedIn), **plan Google Maps
interactif** et lien de la fiche du lieu — se gèrent depuis le système, page **Paramètres → « Site vitrine »**
(`cafe.cafenoir.tn`, permission `settings:manage`). Elles sont servies par `GET /api/public/site-info` et le site
les reprend en moins d'une minute, sans redéploiement. Un réseau sans adresse n'est pas affiché ; un téléphone ou
un e-mail vide disparaît du site. Pour le plan : Google Maps → Partager → Intégrer une carte → coller le code
`<iframe>` en entier (seule l'adresse `src` est conservée ; seules les adresses `https://www.google.com/maps/embed…`
sont acceptées).

Les valeurs par défaut (avant toute modification) et les règles de validation sont dans le fichier partagé
`../src/data/showcaseSettingsModel.ts`. Le téléphone et l'e-mail par défaut sont ceux de la maquette : ils ne sont pas
annoncés à Google (données structurées) tant qu'ils n'ont pas été remplacés.

Le crédit « Site réalisé par **Creative Comet** » (lien vers <https://creativecomet.tn>) est **fixe** : il est écrit
dans `src/config/site.ts` (`CREDIT`) et n'est pas modifiable depuis les Paramètres.
Il n'y a pas de système de réservation : le bouton de l'en-tête est « Voir le menu complet ».

## Développement

```bash
cd showcase
npm install
npm run dev        # http://localhost:3100
```

Le serveur de dev redirige `/api` vers le système local (`http://localhost:4000`, lancé avec
`npm run server:dev` à la racine). Pour viser un autre serveur : `SHOWCASE_DEV_API_TARGET=… npm run dev`.

## Build

```bash
cd showcase
npm run build      # typecheck + build → showcase/dist
```

En production, le site appelle l'API par URL absolue : par défaut `https://cafe.cafenoir.tn`
(défini dans `src/config/site.ts`). Pour changer : `VITE_API_BASE_URL=https://autre.domaine npm run build`.

## Déploiement — sur une URL différente du système

| Site | URL | Servi par |
| --- | --- | --- |
| Système de gestion | `cafe.cafenoir.tn` | Node/PM2 (`cnsystemmanagement`, port 3011) derrière nginx |
| Vitrine (menu client) | `test.cafenoir.tn` | nginx, fichiers statiques de `showcase/dist` |

La vitrine ne partage rien avec le processus du système : le navigateur du visiteur lit le catalogue
sur `https://cafe.cafenoir.tn/api/products` (route publique, lecture seule, CORS ouvert). Aucun produit
ni aucune catégorie n'est écrit dans le code de la vitrine.

Mise en ligne / mise à jour sur le serveur :

```bash
cd /var/www/CNsystemmanagement && git pull --ff-only
cd showcase
npm ci
VITE_API_BASE_URL=https://cafe.cafenoir.tn VITE_SITE_URL=https://test.cafenoir.tn npm run build   # typecheck + build -> showcase/dist
```

nginx : la configuration exacte utilisée en production est `deploy/test.cafenoir.tn.nginx.conf`
(à installer dans `/etc/nginx/sites-available/test.cafenoir.tn`, puis
`sudo nginx -t && sudo systemctl reload nginx`). `deploy/nginx.conf.example` sert de modèle pour un
autre domaine (DNS + `sudo certbot --nginx -d <domaine>` à prévoir).

Le déploiement de la vitrine ne touche ni au processus PM2 du système, ni à sa base de données, ni
à son bloc nginx. Mettre à jour la vitrine ne demande aucun redémarrage : nginx sert les nouveaux
fichiers (index.html n'est jamais mis en cache ; les fichiers de `assets/` sont versionnés).

Retour arrière : restaurer la sauvegarde de la configuration nginx puis `sudo systemctl reload nginx`.
