import type { ShowcaseSiteInfo } from '../../../src/data/showcaseSettingsModel';
import { NOT_FOUND_TITLE, SEO_PAGES, buildBusinessJsonLd, type SeoPath } from '../config/seo';
import { SITE_URL } from '../config/site';

// The static <head> of each page is generated at build time (seo/seoPlugin.ts). This keeps it accurate
// while the visitor navigates inside the single-page app, for crawlers that run JavaScript and for the
// browser tab title.

function setMeta(selector: string, attr: 'name' | 'property', key: string, value: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

export function applySeo(path: string): void {
  const page = SEO_PAGES[path as SeoPath];
  if (!page) {
    // Unknown address: keep it out of search results.
    document.title = NOT_FOUND_TITLE;
    setMeta('meta[name="robots"]', 'name', 'robots', 'noindex, follow');
    return;
  }
  const url = path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
  document.title = page.title;
  setMeta('meta[name="description"]', 'name', 'description', page.description);
  setMeta('meta[name="robots"]', 'name', 'robots', 'index, follow, max-image-preview:large, max-snippet:-1');
  setCanonical(url);
  setMeta('meta[property="og:url"]', 'property', 'og:url', url);
  setMeta('meta[property="og:title"]', 'property', 'og:title', page.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', page.description);
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', page.title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', page.description);
}

/** Rewrites the CafeOrCoffeeShop JSON-LD block of the page (id="ld-business") from the live site info. */
export function applyBusinessJsonLd(info: ShowcaseSiteInfo): void {
  const el = document.getElementById('ld-business');
  if (!el) return;
  // textContent, not innerHTML: the text is never parsed as HTML, so no escaping is needed here.
  el.textContent = JSON.stringify(buildBusinessJsonLd(SITE_URL, info));
}
