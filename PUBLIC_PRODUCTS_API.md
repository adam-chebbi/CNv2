# API publique des produits Café Noir — guide pour le développeur de la vitrine

Ce document explique comment récupérer le catalogue produits de Café Noir depuis un site public
("vitrine") hébergé sur un domaine différent de l'application de gestion. L'application de gestion
expose seulement les données via une route publique ; le site vitrine officiel de ce dépôt vit dans
le dossier [`showcase/`](showcase/README.md) (projet indépendant, avec son propre build et son
propre déploiement) et consomme cette API. Un autre site tiers peut la consommer de la même façon.

## Ce qui est public — et ce qui ne l'est pas

Une seule route est publique et ne demande aucune authentification :

```
GET https://system.cafenoir.tn/api/products
```

(`GET https://system.cafenoir.tn/api/public/products` renvoie exactement la même réponse ; les deux
adresses sont équivalentes. Seule la lecture `GET` est publique : `/api/products` n'accepte ni
création ni modification, le CRUD des produits se fait dans l'application de gestion, après connexion.)

Elle renvoie uniquement les données nécessaires pour afficher un menu/catalogue produits :
catégories, sous-catégories, extras (suppléments) et produits (nom, prix, description, image,
disponibilité, extras compatibles, variantes).

**Tout le reste de l'application reste privé** : ventes, stock, achats, fournisseurs, employés,
finances, etc. Aucune de ces données n'est accessible sans connexion. De même, pour chaque produit,
deux champs internes ne sont **jamais** renvoyés par cette route car ils révèlent la structure de
coûts et la marge visée de Café Noir :

- la recette (liste des ingrédients et quantités utilisés)
- le taux de marge cible

Si un jour la vitrine a besoin d'une donnée qui n'est pas dans la réponse ci-dessous, il faut
l'ajouter explicitement côté serveur (`server/routes/public.ts`) — ne jamais essayer d'appeler une
autre route de l'API de gestion depuis la vitrine, ces routes exigent une connexion et ne sont pas
prévues pour un usage public.

## Requête

- **Méthode** : `GET`
- **Authentification** : aucune
- **CORS** : la route autorise les requêtes cross-origin (`Access-Control-Allow-Origin: *`), donc
  elle peut être appelée directement en JavaScript depuis n'importe quel domaine, y compris depuis
  le navigateur du client final.
- **Cache** : pas de cache serveur particulier ; le freelance peut mettre en cache la réponse côté
  vitrine (quelques minutes) pour réduire les appels, la carte ne change pas d'une minute à l'autre.

Exemple d'appel :

```js
const res = await fetch('https://system.cafenoir.tn/api/products');
const { categories, subCategories, extras, products } = await res.json();
```

## Forme de la réponse

```jsonc
{
  "categories": [
    { "id": "cat-1", "name": "Café chaud" }
  ],
  "subCategories": [
    { "id": "sub-1", "categoryId": "cat-1", "name": "Espresso & Ristretto" }
  ],
  "extras": [
    { "id": "extra-1", "name": "Shot espresso supplémentaire", "price": 1.0 }
  ],
  "products": [
    {
      "id": "art-1",
      "name": "Cappuccino",
      "category": "Café chaud",
      "subCategory": null,
      "price": 3.5,
      "description": null,
      "imageUrl": null,
      "extraIds": ["extra-3", "extra-4"],
      "variants": [
        { "id": "petit", "label": "Petit", "priceDelta": 0 },
        { "id": "moyen", "label": "Moyen", "priceDelta": 1.0 },
        { "id": "grand", "label": "Grand", "priceDelta": 2.0 }
      ]
    }
  ]
}
```

## Entités de données

### `Category`

| Champ  | Type   | Description                                  |
| ------ | ------ | --------------------------------------------- |
| `id`   | string | Identifiant unique de la catégorie            |
| `name` | string | Nom affichable (ex. "Café chaud", "Snack")    |

Les catégories sont l'axe principal de rangement du menu (les onglets ou sections de la vitrine).

### `SubCategory`

| Champ        | Type   | Description                                      |
| ------------ | ------ | -------------------------------------------------- |
| `id`         | string | Identifiant unique de la sous-catégorie             |
| `categoryId` | string | Référence `Category.id` — sous-catégorie de laquelle elle dépend |
| `name`       | string | Nom affichable (ex. "Espresso & Ristretto")        |

Optionnelles pour l'affichage : toutes les catégories n'ont pas de sous-catégories, et tous les
produits n'ont pas de sous-catégorie renseignée (voir `Product.subCategory`, qui peut être `null`).
Utile pour un sous-regroupement fin à l'intérieur d'une catégorie, mais la vitrine peut très bien
se limiter au regroupement par `category` seul si une UI plus simple est préférée.

### `Extra`

| Champ   | Type   | Description                                  |
| ------- | ------ | --------------------------------------------- |
| `id`    | string | Identifiant unique de l'extra                |
| `name`  | string | Nom affichable (ex. "Sirop vanille")         |
| `price` | number | Prix additionnel en dinars tunisiens (DT)    |

### `Product`

| Champ        | Type                    | Description                                                                 |
| ------------ | ----------------------- | ---------------------------------------------------------------------------- |
| `id`         | string                  | Identifiant unique du produit                                               |
| `name`       | string                  | Nom affichable                                                              |
| `category`   | string                  | Nom de la catégorie (correspond à `Category.name`)                         |
| `subCategory`| string \| null          | Nom de la sous-catégorie, ou `null` si non renseignée                      |
| `price`      | number                  | Prix de base en DT (avant extras/variantes)                                |
| `description`| string \| null          | Description libre, ou `null`                                               |
| `imageUrl`   | string \| null          | URL de l'image du produit, ou `null` si aucune image n'a été renseignée    |
| `extraIds`   | string[]                | Liste d'`Extra.id` proposables avec ce produit (peut être vide)            |
| `variants`   | VariantOption[]         | Variantes du produit (taille, type de lait…), peut être vide               |

`VariantOption` :

| Champ        | Type              | Description                                                           |
| ------------ | ----------------- | ------------------------------------------------------------------------ |
| `id`         | string            | Identifiant de l'option (ex. `"grand"`)                                |
| `label`      | string            | Libellé affichable (ex. "Grand")                                      |
| `priceDelta` | number \| undefined | Supplément de prix en DT par rapport au prix de base (absent = +0 DT) |

Seuls les produits marqués disponibles sont renvoyés — un produit temporairement retiré de la
vente côté gestion (rupture de stock, saisonnalité…) disparaît automatiquement de cette réponse,
sans action nécessaire côté vitrine.

## Comment afficher les produits (recommandations)

1. **Regrouper par catégorie**, dans l'ordre où `categories` est reçu, puis lister les `products`
   dont `category` correspond au `name` de la catégorie.
2. **Sous-regrouper par `subCategory`** à l'intérieur d'une catégorie si l'UX le justifie (menu
   dense), sinon ignorer ce champ et afficher une liste plate par catégorie — les deux approches
   sont valides selon le design retenu.
3. **Prix affiché** : `price` est le prix de base. Si le client choisit une variante, ajouter son
   `priceDelta` (souvent 0 pour l'option la moins chère). Si le client ajoute un extra, ajouter le
   `price` de cet extra. Le prix final = `price + (variantDelta ?? 0) + somme des extras choisis`.
4. **Résoudre `extraIds`** : chercher chaque id dans le tableau `extras` reçu à la racine de la
   réponse pour obtenir son nom et son prix — ne pas coder une liste d'extras en dur côté vitrine,
   elle doit toujours venir de cette réponse pour rester synchronisée avec la gestion.
5. **Produits sans variantes ni extras** : `variants` et `extraIds` peuvent être des tableaux vides
   — dans ce cas, ne pas afficher de sélecteur de taille/extra pour ce produit.
6. **Images manquantes** : `imageUrl` est souvent `null` (peu de produits ont une image dans la
   gestion actuellement) — prévoir un visuel de repli (placeholder) par catégorie plutôt que de
   masquer le produit.
7. **Rafraîchissement** : recharger `GET /api/products` périodiquement (ou à chaque visite
   de page) suffit — il n'y a pas de mécanisme de notification en temps réel, et ce n'est pas
   nécessaire pour un menu qui change rarement dans la journée.

## Dépannage — la vitrine n'affiche pas les produits

| Symptôme | Cause probable |
| --- | --- |
| `401` « Authentification requise » sur `/api/products` | Le serveur de gestion n'a pas encore été mis à jour avec cette route publique (déployer la dernière version du dépôt). |
| Erreur CORS dans la console du navigateur | Le domaine de l'API est mauvais (`VITE_API_BASE_URL`) ou la réponse ne vient pas du serveur de gestion. |
| Réponse `200` mais HTML au lieu de JSON | L'URL appelée est celle d'un site (le fichier `index.html`), pas celle de l'API. |
| Menu vide | Aucun produit n'est marqué disponible dans la gestion. |

La vitrine officielle (`showcase/`) attend la réponse 15 s au maximum, retente une fois en cas de
coupure réseau ou d'erreur 5xx, puis affiche « Le menu ne peut pas s'afficher » avec un bouton
Réessayer. Elle se rafraîchit ensuite toute seule chaque minute.

## Informations du site — `GET /api/public/site-info`

Deuxième route publique, en lecture seule (mêmes règles CORS, sans authentification), utilisée par la vitrine pour
afficher l'adresse, le téléphone, l'e-mail, les horaires, les réseaux sociaux et le plan Google Maps. Ces valeurs se
modifient dans le système : **Paramètres → « Site vitrine »**. Réponse (`Cache-Control: no-cache`) :

```json
{
  "tagline": "Café · Brunch · Pâtisserie",
  "address": "Centre Makni, Rue Ahmed Ghanmi, Tunis 1013",
  "city": "Tunis", "postalCode": "1013",
  "phone": "+216 …", "email": "contact@…",
  "hours": "Nous vous accueillons tous les jours de 7h à 22h.",
  "opensAt": "07:00", "closesAt": "22:00",
  "mapEmbedUrl": "https://www.google.com/maps/embed?pb=…",
  "mapUrl": "https://www.google.com/maps/place/…",
  "socials": [{ "platform": "instagram", "href": "https://www.instagram.com/…" }],
  "updatedAt": "2026-09-21T07:16:00.000Z"
}
```

`socials` ne contient que les réseaux dont l'adresse est renseignée (`instagram`, `facebook`, `tiktok`, `youtube`,
`whatsapp`, `x`, `linkedin`). `phone` et `email` peuvent être vides. Tant que rien n'a été enregistré, la route renvoie
les valeurs par défaut. Le crédit du site (Creative Comet) n'en fait pas partie : il est fixe dans la vitrine.

## Ce que cette route ne fait pas (hors périmètre)

- Pas de prise de commande, panier ou paiement — c'est uniquement de la lecture de catalogue.
- Pas de gestion de stock en temps réel (rupture immédiate) — seule la disponibilité manuelle
  (activée/désactivée côté gestion) est reflétée.
- Pas d'authentification client — aucune notion de compte utilisateur côté vitrine n'existe dans
  cette API.

Ces sujets (commande en ligne, panier, compte client…) sont hors du périmètre actuel du projet et
seront traités séparément si/quand la vitrine évolue dans cette direction.
