import {
  DEFAULT_EMAIL,
  DEFAULT_MAP_URL,
  DEFAULT_PHONE,
  DEFAULT_SHOWCASE_SITE_INFO,
  SOCIAL_PLATFORMS,
  parsePlaceCoordinates,
  type ShowcaseSiteInfo,
} from '../../../src/data/showcaseSettingsModel';

// SEO facts shared by the site (client-side updates on route change) and the build
// (seo/seoPlugin.ts: static <head> per page, sitemap.xml, robots.txt, llms.txt, JSON-LD).
// Pure data and functions on purpose — no import.meta.env, no DOM — because the Vite config imports it in Node.

export const SEO_SITE = {
  name: 'Café Noir',
  lang: 'fr',
  locale: 'fr_TN',
  themeColor: '#FAF9F5',
  // Picture used when a page is shared (Open Graph / Twitter). Swap the file to change it; the width
  // and height announced to social networks are read from the file at build time.
  ogImage: '/images/ambiance.jpg',
  ogImageAlt: 'Le comptoir de Café Noir : bar vert menthe, fleurs blanches et ambiance lumineuse à Tunis',
} as const;

export type SeoPath = '/' | '/menu';

export interface SeoPage {
  title: string; // ≈ 60 characters or fewer
  description: string; // ≈ 155 characters or fewer
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: string;
}

// The menu's own products and categories come from the management system at runtime, so nothing
// about them is written here — the copy stays true whatever the menu contains.
export const SEO_PAGES: Record<SeoPath, SeoPage> = {
  '/': {
    title: 'Café Noir — Café, brunch & pâtisserie à Tunis',
    description:
      'Café Noir, coffee shop au Centre Makni à Tunis : cafés d’exception, brunch, pâtisseries artisanales et produits locaux. Découvrez notre menu et venez nous voir.',
    changefreq: 'weekly',
    priority: '1.0',
  },
  '/menu': {
    title: 'Menu — Café Noir | Boissons, brunch, pâtisseries et plats à Tunis',
    description:
      'Le menu complet de Café Noir à Tunis : toutes nos boissons, pâtisseries et plats avec leurs prix en dinars (TND), mis à jour en direct.',
    changefreq: 'daily',
    priority: '0.9',
  },
};

export const NOT_FOUND_TITLE = 'Page introuvable — Café Noir';

// Static facts of the build-time <head> (geo meta, llms.txt, the JSON-LD written into the HTML). They come
// from the same defaults the management app starts with; once the team edits the site info in Paramètres,
// the site refreshes the JSON-LD block from the live values (see buildBusinessJsonLd + seoClient.ts).
const defaultCoords = parsePlaceCoordinates(DEFAULT_MAP_URL) ?? { latitude: 36.8465365, longitude: 10.1536695 };
export const BUSINESS = {
  streetAddress: DEFAULT_SHOWCASE_SITE_INFO.address,
  locality: DEFAULT_SHOWCASE_SITE_INFO.city,
  postalCode: DEFAULT_SHOWCASE_SITE_INFO.postalCode,
  country: 'TN',
  region: 'TN-11', // ISO 3166-2: Tunis governorate
  latitude: defaultCoords.latitude,
  longitude: defaultCoords.longitude,
  mapsUrl: DEFAULT_MAP_URL,
  opens: DEFAULT_SHOWCASE_SITE_INFO.opensAt,
  closes: DEFAULT_SHOWCASE_SITE_INFO.closesAt,
} as const;

/**
 * schema.org CafeOrCoffeeShop for the given site info (Google reads it for the local result: address, position,
 * hours, links). The phone and e-mail are only included once they differ from the mockup placeholders, so a
 * made-up number is never announced to search engines.
 */
export function buildBusinessJsonLd(siteUrl: string, info: ShowcaseSiteInfo): Record<string, unknown> {
  const home = `${siteUrl}/`;
  const coords = parsePlaceCoordinates(info.mapUrl) ?? defaultCoords;
  const sameAs = info.socials.filter((s) => s.href && SOCIAL_PLATFORMS.some((p) => p.id === s.platform)).map((s) => s.href);
  return {
    '@context': 'https://schema.org',
    '@type': 'CafeOrCoffeeShop',
    '@id': `${home}#cafe`,
    name: SEO_SITE.name,
    url: home,
    image: [`${siteUrl}${SEO_SITE.ogImage}`],
    description: SEO_PAGES['/'].description,
    hasMenu: `${siteUrl}/menu`,
    hasMap: info.mapUrl,
    ...(info.phone && info.phone !== DEFAULT_PHONE ? { telephone: info.phone } : {}),
    ...(info.email && info.email !== DEFAULT_EMAIL ? { email: info.email } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: info.address,
      addressLocality: info.city,
      ...(info.postalCode ? { postalCode: info.postalCode } : {}),
      addressCountry: BUSINESS.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: coords.latitude, longitude: coords.longitude },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: info.opensAt,
        closes: info.closesAt,
      },
    ],
    ...(sameAs.length > 0 ? { sameAs } : {}),
    servesCuisine: ['Café', 'Brunch', 'Pâtisserie'],
    currenciesAccepted: 'TND',
  };
}
