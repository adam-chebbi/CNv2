import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  DEFAULT_SHOWCASE_SITE_INFO,
  normalizeShowcaseSiteInfo,
  toPublicShowcaseSiteInfo,
  type ShowcaseSiteInfo,
} from '../../../src/data/showcaseSettingsModel';
import { API_BASE_URL } from '../config/site';
import { applyBusinessJsonLd } from './seoClient';

// The site's editable content (contact details, hours, social links, Google map) lives in the management
// app (Paramètres → Site vitrine) and is read from its public endpoint. Same model file as the management
// app, so defaults and validation can never drift. The site never waits for it: it paints instantly from
// the last answer it saw (or the built-in defaults) and updates when the fresh answer arrives.

const CACHE_KEY = 'cafenoir-showcase-siteinfo';
const REFRESH_MS = 60_000;
const TIMEOUT_MS = 10_000;

const DEFAULTS: ShowcaseSiteInfo = toPublicShowcaseSiteInfo(DEFAULT_SHOWCASE_SITE_INFO);

// Whatever comes in — the network, a cache written by an older version — is normalized again here, so an
// unexpected value (a non-https link, a foreign map host) can never reach the page.
const clean = (raw: unknown): ShowcaseSiteInfo => toPublicShowcaseSiteInfo(normalizeShowcaseSiteInfo(raw));

function readCache(): ShowcaseSiteInfo {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? clean(JSON.parse(raw)) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

async function fetchSiteInfo(): Promise<ShowcaseSiteInfo> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/site-info`, {
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return clean(await res.json());
  } finally {
    window.clearTimeout(timer);
  }
}

const SiteInfoContext = createContext<ShowcaseSiteInfo>(DEFAULTS);

export function SiteInfoProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<ShowcaseSiteInfo>(readCache);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      fetchSiteInfo()
        .then((fresh) => {
          if (!alive) return;
          setInfo((current) => (JSON.stringify(current) === JSON.stringify(fresh) ? current : fresh));
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
          } catch {
            /* private mode / quota: the site just re-fetches next time */
          }
        })
        // A failed refresh keeps what is on screen (last answer or defaults).
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(() => document.visibilityState === 'visible' && refresh(), REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Keep the structured data read by Google in step with what the page shows.
  useEffect(() => {
    applyBusinessJsonLd(info);
  }, [info]);

  return <SiteInfoContext.Provider value={info}>{children}</SiteInfoContext.Provider>;
}

export const useSiteInfo = (): ShowcaseSiteInfo => useContext(SiteInfoContext);

/** `tel:` link for a phone number written for humans ("+216 71 123 456"). */
export const phoneHref = (phone: string): string => `tel:${phone.replace(/[^+\d]/g, '')}`;
