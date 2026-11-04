import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCatalog, type Catalog } from '../api/products';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; catalog: Catalog };

const REFRESH_MS = 30_000;

/**
 * Loads the live catalog from the management system's public API and keeps it fresh: it refetches
 * quietly every 30 seconds and whenever the visitor comes back to the tab, so a product added, edited
 * or hidden in the system shows up (or disappears) without a page reload.
 */
export function useCatalog() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const alive = useRef(true);

  const load = useCallback((force: boolean, silent: boolean) => {
    if (!silent) setState({ status: 'loading' });
    fetchCatalog(force)
      .then((catalog) => alive.current && setState({ status: 'ready', catalog }))
      .catch(() => {
        // A failed background refresh keeps whatever is already on screen.
        if (alive.current && !silent) setState({ status: 'error' });
      });
  }, []);

  useEffect(() => {
    alive.current = true;
    load(false, false);

    const refresh = () => load(true, true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(false, true);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const retry = useCallback(() => load(true, false), [load]);

  return { state, retry };
}
