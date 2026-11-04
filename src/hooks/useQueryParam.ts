// Syncs a single query-string parameter with component state — the reusable building block every
// page uses to make its search box, filters, or "currently open entity" bookmarkable/shareable.
//
// Uses history.replaceState (never pushState): typing in a search box or flipping a filter should
// never spam the browser's back button with one entry per keystroke — only top-level page
// navigation (handled by useUrlNavigation) creates history entries. All OTHER query params already
// in the URL (tab, sub, other pages' filters) are preserved untouched.

import { useCallback, useState } from 'react';

const readParam = (key: string, defaultValue: string): string => {
  if (typeof window === 'undefined') return defaultValue;
  return new URLSearchParams(window.location.search).get(key) ?? defaultValue;
};

export const useQueryParam = (key: string, defaultValue: string = ''): [string, (value: string) => void] => {
  const [value, setValue] = useState<string>(() => readParam(key, defaultValue));

  const setParam = useCallback(
    (next: string) => {
      setValue(next);
      const url = new URL(window.location.href);
      if (next && next !== defaultValue) url.searchParams.set(key, next);
      else url.searchParams.delete(key);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    },
    [key, defaultValue]
  );

  return [value, setParam];
};
