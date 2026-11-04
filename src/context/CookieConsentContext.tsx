import React, { createContext, useCallback, useContext, useState } from 'react';
import { getCookie, setCookie, deleteCookie } from '../lib/cookies';

// Only two categories exist in this app: cookies strictly necessary for the service to function
// (session, CSRF, this consent choice itself — always set, never gated by consent since they're
// exempt), and optional preference cookies (e.g. remembering the sidebar's collapsed state).
// There is no analytics/tracking category — none is ever set, by design.
export type CookieConsentChoice = 'all' | 'necessary';

const CONSENT_COOKIE = 'cn_cookie_consent';
const CONSENT_DAYS = 180;

// Every optional preference cookie the app sets, so declining preferences cleans them all up
// immediately instead of leaving a stale one behind. Extend this list if a new one is added.
const PREFERENCE_COOKIE_NAMES = ['cn_sidebar_collapsed'];

interface CookieConsentValue {
  hasDecided: boolean;
  preferencesEnabled: boolean;
  acceptAll: () => void;
  acceptNecessaryOnly: () => void;
  setPreferencesEnabled: (enabled: boolean) => void;
}

const CookieConsentContext = createContext<CookieConsentValue | undefined>(undefined);

export const CookieConsentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [choice, setChoice] = useState<CookieConsentChoice | null>(() => {
    const stored = getCookie(CONSENT_COOKIE);
    return stored === 'all' || stored === 'necessary' ? stored : null;
  });

  const applyChoice = useCallback((next: CookieConsentChoice) => {
    setCookie(CONSENT_COOKIE, next, CONSENT_DAYS);
    if (next === 'necessary') PREFERENCE_COOKIE_NAMES.forEach(deleteCookie);
    setChoice(next);
  }, []);

  const value: CookieConsentValue = {
    hasDecided: choice !== null,
    preferencesEnabled: choice === 'all',
    acceptAll: () => applyChoice('all'),
    acceptNecessaryOnly: () => applyChoice('necessary'),
    setPreferencesEnabled: (enabled) => applyChoice(enabled ? 'all' : 'necessary'),
  };

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
};

export const useCookieConsent = (): CookieConsentValue => {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) throw new Error('useCookieConsent must be used within a CookieConsentProvider');
  return ctx;
};
