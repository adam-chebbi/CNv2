// Syncs the app's top-level navigation (activeTab / activeSubItem) with the URL's ?tab=&sub=
// query parameters — a drop-in replacement for the two plain useState calls App.tsx used to have,
// with the exact same external shape (setActiveTab/setActiveSubItem take a plain string), so none
// of the ~150 existing call sites throughout App.tsx needed to change.
//
// Query-string based (not path segments) on purpose: this is a single-page static app with no
// server-side route configuration, so encoding navigation in the query string works on any static
// host without needing an SPA-fallback rewrite rule for arbitrary paths.
//
// Behavior:
// - On mount, the URL (if it has ?tab=/?sub=) seeds the initial state — deep links and page
//   refreshes land on the right page.
// - Navigating (setActiveTab/setActiveSubItem) pushes a new history entry, but only ONCE per
//   logical navigation: React 19 batches the common "setActiveTab(x); setActiveSubItem('')"
//   pattern into a single render, and the effect below only fires after that settles.
// - Browser back/forward (popstate) re-syncs state from the URL without pushing again.

import { useEffect, useRef, useState } from 'react';

const TAB_PARAM = 'tab';
const SUB_PARAM = 'sub';

export interface NavigationDefaults {
  tab: string;
  sub: string;
}

const readFromLocation = (defaults: NavigationDefaults): NavigationDefaults => {
  if (typeof window === 'undefined') return defaults;
  const params = new URLSearchParams(window.location.search);
  return {
    tab: params.get(TAB_PARAM) || defaults.tab,
    sub: params.get(SUB_PARAM) || defaults.sub,
  };
};

// Only tab/sub are touched — every other query param already present (per-page filters, entity
// deep-links) is preserved untouched.
const buildUrl = (tab: string, sub: string, defaults: NavigationDefaults): string => {
  const url = new URL(window.location.href);
  if (tab && tab !== defaults.tab) url.searchParams.set(TAB_PARAM, tab);
  else url.searchParams.delete(TAB_PARAM);
  if (sub) url.searchParams.set(SUB_PARAM, sub);
  else url.searchParams.delete(SUB_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
};

export interface UrlNavigation {
  activeTab: string;
  activeSubItem: string;
  setActiveTab: (tab: string) => void;
  setActiveSubItem: (sub: string) => void;
}

export const useUrlNavigation = (defaults: NavigationDefaults): UrlNavigation => {
  const [activeTab, setActiveTab] = useState<string>(() => readFromLocation(defaults).tab);
  const [activeSubItem, setActiveSubItem] = useState<string>(() => readFromLocation(defaults).sub);

  const lastUrl = useRef<string | null>(null);
  const skipNextPush = useRef(true); // first effect run only normalizes the URL, never pushes

  useEffect(() => {
    const url = buildUrl(activeTab, activeSubItem, defaults);
    if (skipNextPush.current) {
      window.history.replaceState(window.history.state, '', url);
      lastUrl.current = url;
      skipNextPush.current = false;
      return;
    }
    if (url !== lastUrl.current) {
      window.history.pushState(window.history.state, '', url);
      lastUrl.current = url;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeSubItem]);

  useEffect(() => {
    const handlePopState = () => {
      const next = readFromLocation(defaults);
      skipNextPush.current = true; // this change came FROM the URL — don't push it again
      lastUrl.current = buildUrl(next.tab, next.sub, defaults);
      setActiveTab(next.tab);
      setActiveSubItem(next.sub);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { activeTab, activeSubItem, setActiveTab, setActiveSubItem };
};
