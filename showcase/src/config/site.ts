// Fixed facts of the showcase, and where its data comes from.
//
// The editable content of the site (contact details, hours, social links, Google map) is NOT here: the
// team manages it from the management app (Paramètres → Site vitrine) and the site reads it at runtime
// (src/lib/siteInfo.tsx). Products and categories come from the catalogue the same way.

/** Public address of the deployed site, for canonical links (set VITE_SITE_URL at build time to change it). */
export const SITE_URL: string = (import.meta.env.VITE_SITE_URL ?? 'https://cafenoir.tn').replace(/\/+$/, '');

/**
 * Base URL of the management app's public API. In dev it's '' so calls go through the Vite `/api`
 * proxy (same-origin). In a production build it defaults to the management app's own domain — the
 * showcase is hosted on a DIFFERENT URL, so it must call the system by absolute URL (the route is
 * CORS-open). Override at build time with VITE_API_BASE_URL.
 */
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? '' : 'https://system.cafenoir.tn')
).replace(/\/+$/, '');

export const SITE = { name: 'Café Noir' } as const;

// The credit in the footer is fixed on purpose: it is not part of the editable site info.
export const CREDIT = { name: 'Creative Comet', href: 'https://creativecomet.tn' } as const;

export const NAV_ITEMS = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'menu', label: 'Menu' },
  { id: 'histoire', label: 'Notre histoire' },
  { id: 'galerie', label: 'Galerie' },
  { id: 'contact', label: 'Contact' },
] as const;

// Photography lives in public/images — swap a file (same name) to change a picture.
export const IMAGES = {
  hero: '/images/hero.jpg',
  story: '/images/story.jpg',
  ambiance: '/images/ambiance.jpg',
  cafes: '/images/cafes.jpg',
  boissons: '/images/boissons.jpg',
  patisseries: '/images/patisseries.jpg',
  sales: '/images/sales.jpg',
} as const;

export const GALLERY = [
  { src: IMAGES.hero, alt: 'Un cappuccino et des viennoiseries sur une table en marbre' },
  { src: IMAGES.story, alt: 'Le comptoir et la salle de Café Noir' },
  { src: IMAGES.cafes, alt: 'Un café latte dans une tasse noire' },
  { src: IMAGES.boissons, alt: 'Un latte matcha glacé' },
  { src: IMAGES.patisseries, alt: 'Un croissant doré' },
  { src: IMAGES.sales, alt: 'Un avocado toast' },
  { src: IMAGES.ambiance, alt: 'La salle de Café Noir, lumière naturelle et verdure' },
] as const;
