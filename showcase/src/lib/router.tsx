import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

// Tiny History-API router (two pages don't justify a dependency). The host must serve index.html
// for unknown paths — see deploy/nginx.conf.example (`try_files … /index.html`).

interface Location {
  path: string;
  search: string;
  hash: string;
}

interface RouterValue extends Location {
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

function readLocation(): Location {
  const path = window.location.pathname.replace(/\/+$/, '');
  return { path: path === '' ? '/' : path, search: window.location.search, hash: window.location.hash };
}

const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

/**
 * Scrolls to #id and keeps it in place while the page is still settling. The sections above a target
 * (the menu cards, coming from the API) grow after the first scroll, which used to leave the target
 * hundreds of pixels off and never corrected. So for a short while, whenever the page height changes,
 * the target is scrolled back into place — until the visitor scrolls on their own.
 * Returns a cleanup function.
 */
function scrollToAnchor(id: string, smooth: boolean): () => void {
  const target = document.getElementById(id);
  if (!target) return () => undefined;
  target.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });

  let userTookOver = false;
  const onUser = () => {
    userTookOver = true;
  };
  USER_SCROLL_EVENTS.forEach((ev) => window.addEventListener(ev, onUser, { passive: true, once: true }));

  const reanchor = () => {
    if (!userTookOver) document.getElementById(id)?.scrollIntoView({ behavior: 'instant' });
  };
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reanchor) : null;
  observer?.observe(document.body);

  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    observer?.disconnect();
    window.clearTimeout(timer);
    USER_SCROLL_EVENTS.forEach((ev) => window.removeEventListener(ev, onUser));
  };
  const timer = window.setTimeout(stop, 3000);
  return stop;
}

export function Router({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<Location>(readLocation);
  // Bumped on every navigation so the scroll effect also fires when only the hash/page changed.
  const [navCount, setNavCount] = useState(0);

  useEffect(() => {
    const onPop = () => {
      setLoc(readLocation());
      setNavCount((n) => n + 1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    const url = new URL(to, window.location.origin);
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.pushState({}, '', next);
    }
    setLoc(readLocation());
    setNavCount((n) => n + 1);
  }, []);

  // After the new page has rendered: jump to its #anchor, or back to the top. On the very first
  // load only an explicit #anchor is honoured so the browser keeps its own scroll restoration.
  useLayoutEffect(() => {
    if (loc.hash) return scrollToAnchor(loc.hash.slice(1), navCount !== 0);
    if (navCount > 0) window.scrollTo({ top: 0, behavior: 'instant' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navCount]);

  const value = useMemo<RouterValue>(() => ({ ...loc, navigate }), [loc, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside <Router>');
  return ctx;
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
}

/** In-app link for paths ("/menu", "/#histoire"). Same-page anchors ("#menu") stay plain browser links. */
export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (!to.startsWith('/') || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
