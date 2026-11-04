// Content of the public site (cafenoir.tn) that the team manages from Paramètres → "Site vitrine":
// contact details, opening hours, social links and the Google map. One record, stored server-side
// (app_settings, key SHOWCASE_SETTINGS_KEY), read by the public site through /api/public/site-info.
//
// Deliberately NOT in here: the products and categories (they come from the catalogue itself) and the
// "Site réalisé par Creative Comet" credit, which is fixed in the site's code.
//
// Shared by the management app (form + validation), the server (validation + defaults) and mirrored
// by hand in showcase/src/config/site.ts (the showcase is a separate project).

export const SHOWCASE_SETTINGS_KEY = 'showcase.siteInfo';

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'whatsapp' | 'x' | 'linkedin';

export const SOCIAL_PLATFORMS: { id: SocialPlatform; label: string; placeholder: string }[] = [
  { id: 'instagram', label: 'Instagram', placeholder: 'https://www.instagram.com/votre-compte' },
  { id: 'facebook', label: 'Facebook', placeholder: 'https://www.facebook.com/votre-page' },
  { id: 'tiktok', label: 'TikTok', placeholder: 'https://www.tiktok.com/@votre-compte' },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://www.youtube.com/@votre-chaine' },
  { id: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/21671123456' },
  { id: 'x', label: 'X (Twitter)', placeholder: 'https://x.com/votre-compte' },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'https://www.linkedin.com/company/votre-page' },
];

export interface ShowcaseSocialLink {
  platform: SocialPlatform;
  href: string; // https URL; an entry with an empty href is kept in the settings but not published
}

export interface ShowcaseSiteInfo {
  tagline: string; // "Café · Brunch · Pâtisserie" — hero eyebrow and footer subtitle
  address: string;
  city: string; // for Google (structured data) only
  postalCode: string; // for Google (structured data) only
  phone: string;
  email: string;
  hours: string; // sentence shown in the footer
  opensAt: string; // HH:MM — for Google (structured data): every day from opensAt to closesAt
  closesAt: string;
  mapEmbedUrl: string; // src of the Google Maps "Share → Embed a map" iframe
  mapUrl: string; // the Google Maps place link ("Nous trouver")
  socials: ShowcaseSocialLink[];
}

export const DEFAULT_MAP_EMBED_URL =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3192.830271401741!2d10.151094574700542!3d36.84654076508782!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x12fd33ac03c1d4ab%3A0x29f717cb2de59ae7!2sCaf%C3%A9%20noir!5e0!3m2!1sfr!2stn!4v1789966696426!5m2!1sfr!2stn';

export const DEFAULT_MAP_URL =
  'https://www.google.com/maps/place/Caf%C3%A9+noir/@36.8465408,10.1510946,17z/data=!3m1!4b1!4m6!3m5!1s0x12fd33ac03c1d4ab:0x29f717cb2de59ae7!8m2!3d36.8465365!4d10.1536695!16s%2Fg%2F11k48pc0zc';

// The phone and e-mail below are the placeholders of the design mockup, not verified contact details.
export const DEFAULT_PHONE = '+216 71 123 456';
export const DEFAULT_EMAIL = 'contact@cafenoir.tn';

export const DEFAULT_SHOWCASE_SITE_INFO: ShowcaseSiteInfo = {
  tagline: 'Café · Brunch · Pâtisserie',
  address: 'Centre Makni, Rue Ahmed Ghanmi, Tunis 1013',
  city: 'Tunis',
  postalCode: '1013',
  phone: DEFAULT_PHONE,
  email: DEFAULT_EMAIL,
  hours: 'Nous vous accueillons tous les jours de 7h à 22h.',
  opensAt: '07:00',
  closesAt: '22:00',
  mapEmbedUrl: DEFAULT_MAP_EMBED_URL,
  mapUrl: DEFAULT_MAP_URL,
  // Slots the team can fill in; a link with no address is simply not shown on the site.
  socials: [
    { platform: 'instagram', href: '' },
    { platform: 'facebook', href: '' },
    { platform: 'tiktok', href: '' },
  ],
};

export const SHOWCASE_LIMITS = { short: 80, medium: 200, url: 1500 } as const;

const HTTPS_URL = /^https:\/\/[^\s"'<>]+$/i;
const GOOGLE_EMBED = /^https:\/\/www\.google\.com\/maps\/embed\?[^\s"'<>]+$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+\d][\d\s().-]{4,24}$/;

/**
 * Accepts either the bare address or the whole `<iframe …></iframe>` snippet Google gives under
 * "Share → Embed a map", and returns the address (the iframe's src).
 */
export const extractEmbedUrl = (input: string): string => {
  const text = input.trim();
  const fromIframe = text.match(/<iframe[^>]*\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return (fromIframe ? fromIframe[1] ?? fromIframe[2] : text).trim().replace(/&amp;/g, '&');
};

export const isGoogleEmbedUrl = (url: string): boolean => GOOGLE_EMBED.test(url);

/** Coordinates of the place, read from a Google Maps place link (pin first, then the map centre). */
export const parsePlaceCoordinates = (mapUrl: string): { latitude: number; longitude: number } | null => {
  const pin = mapUrl.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const centre = mapUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const m = pin ?? centre;
  return m ? { latitude: Number(m[1]), longitude: Number(m[2]) } : null;
};

/** French error messages; empty when the record can be saved. */
export const validateShowcaseSiteInfo = (info: ShowcaseSiteInfo): string[] => {
  const errors: string[] = [];
  const need = (value: string, label: string, max: number) => {
    if (!value.trim()) errors.push(`${label} est obligatoire.`);
    else if (value.length > max) errors.push(`${label} est trop long (${max} caractères maximum).`);
  };
  need(info.tagline, 'La phrase d’accroche', SHOWCASE_LIMITS.short);
  need(info.address, 'L’adresse', SHOWCASE_LIMITS.medium);
  need(info.city, 'La ville', SHOWCASE_LIMITS.short);
  if (info.postalCode.length > 12) errors.push('Le code postal est trop long.');
  if (info.phone && !PHONE.test(info.phone.trim())) errors.push('Le téléphone n’est pas valide (chiffres, espaces et « + » uniquement).');
  if (info.email && !EMAIL.test(info.email.trim())) errors.push('L’adresse e-mail n’est pas valide.');
  need(info.hours, 'Le texte des horaires', SHOWCASE_LIMITS.medium);
  if (!TIME.test(info.opensAt)) errors.push('L’heure d’ouverture doit être au format HH:MM.');
  if (!TIME.test(info.closesAt)) errors.push('L’heure de fermeture doit être au format HH:MM.');
  if (TIME.test(info.opensAt) && TIME.test(info.closesAt) && info.opensAt >= info.closesAt) {
    errors.push('L’heure de fermeture doit être après l’heure d’ouverture.');
  }
  if (!isGoogleEmbedUrl(info.mapEmbedUrl) || info.mapEmbedUrl.length > SHOWCASE_LIMITS.url) {
    errors.push('Le plan interactif doit être l’adresse d’intégration Google Maps (Partager → Intégrer une carte).');
  }
  if (!HTTPS_URL.test(info.mapUrl) || info.mapUrl.length > SHOWCASE_LIMITS.url) errors.push('Le lien Google Maps doit être une adresse https://…');

  const seen = new Set<string>();
  info.socials.forEach((s) => {
    const label = SOCIAL_PLATFORMS.find((p) => p.id === s.platform)?.label ?? s.platform;
    if (!SOCIAL_PLATFORMS.some((p) => p.id === s.platform)) errors.push(`Réseau inconnu : ${s.platform}.`);
    if (seen.has(s.platform)) errors.push(`${label} est présent plusieurs fois.`);
    seen.add(s.platform);
    if (s.href && (!HTTPS_URL.test(s.href) || s.href.length > SHOWCASE_LIMITS.url)) {
      errors.push(`Le lien ${label} doit être une adresse https://…`);
    }
  });
  return errors;
};

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

/**
 * Turns whatever is stored (possibly partial, older or hand-edited) into a complete, safe record:
 * missing fields take their default, and a value that would not pass validation is replaced by the
 * default rather than published.
 */
export const normalizeShowcaseSiteInfo = (raw: unknown): ShowcaseSiteInfo => {
  const d = DEFAULT_SHOWCASE_SITE_INFO;
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const merged: ShowcaseSiteInfo = {
    tagline: str(o.tagline, d.tagline).trim() || d.tagline,
    address: str(o.address, d.address).trim() || d.address,
    city: str(o.city, d.city).trim() || d.city,
    postalCode: str(o.postalCode, d.postalCode).trim(),
    phone: str(o.phone, d.phone).trim(),
    email: str(o.email, d.email).trim(),
    hours: str(o.hours, d.hours).trim() || d.hours,
    opensAt: TIME.test(str(o.opensAt, '')) ? str(o.opensAt, d.opensAt) : d.opensAt,
    closesAt: TIME.test(str(o.closesAt, '')) ? str(o.closesAt, d.closesAt) : d.closesAt,
    mapEmbedUrl: isGoogleEmbedUrl(str(o.mapEmbedUrl, '')) ? str(o.mapEmbedUrl, d.mapEmbedUrl) : d.mapEmbedUrl,
    mapUrl: HTTPS_URL.test(str(o.mapUrl, '')) ? str(o.mapUrl, d.mapUrl) : d.mapUrl,
    socials: Array.isArray(o.socials)
      ? (o.socials as unknown[])
          .map((s) => (s && typeof s === 'object' ? (s as Record<string, unknown>) : {}))
          .filter((s) => SOCIAL_PLATFORMS.some((p) => p.id === s.platform))
          .map((s) => ({ platform: s.platform as SocialPlatform, href: HTTPS_URL.test(str(s.href, '')) ? str(s.href, '') : '' }))
      : d.socials.map((s) => ({ ...s })),
  };
  // One entry per platform.
  const seen = new Set<string>();
  merged.socials = merged.socials.filter((s) => (seen.has(s.platform) ? false : (seen.add(s.platform), true)));
  return merged;
};

/** What the public site receives: the same record without the links that have no address. */
export const toPublicShowcaseSiteInfo = (info: ShowcaseSiteInfo): ShowcaseSiteInfo => ({
  ...info,
  socials: info.socials.filter((s) => s.href),
});
