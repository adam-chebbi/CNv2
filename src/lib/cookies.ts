// Minimal first-party cookie helpers. Never used for anything sensitive — session credentials
// are httpOnly cookies the server sets directly (see src/api/client.ts); this module is only for
// the client-readable, non-essential preference cookies (see useCookieConsent.ts).

export const getCookie = (name: string): string | null => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export const setCookie = (name: string, value: string, days: number): void => {
  const maxAge = days * 24 * 60 * 60;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
};

export const deleteCookie = (name: string): void => {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
};
