import { useLayoutEffect, useRef, useState } from 'react';

const SEEN_KEY = 'cafenoir-intro-seen';
const HOLD_MS = 800;
const SHRINK_MS = 1300;
const CROSSFADE_MS = 450;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Same cutover point as every other mobile/desktop split in this app (Header's nav, the floating
// contact bar): below it, the intro shows the icon alone and lands on just the icon in the header;
// at/above it, it shows the full icon + wordmark lockup, unchanged.
const isMobileViewport = (): boolean => typeof window !== 'undefined' && window.innerWidth < 1024;

type Phase = 'skip' | 'holding' | 'shrinking' | 'crossfading' | 'done';

/**
 * Plays once per browser session, on first load of the site (any route — the header is mounted
 * everywhere): the logo (+ wordmark on desktop) appears large and centered, holds briefly, then
 * shrinks and glides into its real spot in the header (measured live via getBoundingClientRect —
 * a small FLIP, so it lands pixel-perfect at any viewport size). On mobile only the icon is shown
 * and it lands on just the icon inside the header — the header itself is never altered, wordmark
 * included; it simply fades in beside the icon during the cross-fade. The real header logo stays
 * invisible (opacity: 0, set by the parent via `onLogoRevealChange`) until the overlay is exactly
 * on top of it, then the two cross-fade — no pop, no flash of doubled logo.
 */
export function IntroAnimation({ onLogoRevealChange }: { onLogoRevealChange: (revealed: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>(() => {
    if (typeof window === 'undefined') return 'skip';
    if (sessionStorage.getItem(SEEN_KEY)) return 'skip';
    if (prefersReducedMotion()) return 'skip';
    return 'holding';
  });
  const groupRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState('translate(-50%, -50%)');

  const measureAndSetTransform = () => {
    const group = groupRef.current;
    const target = document.getElementById(isMobileViewport() ? 'header-logo-icon' : 'header-logo');
    if (!group || !target) return false;
    const groupRect = group.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const scale = targetRect.width / groupRect.width;
    const dx = targetRect.left + targetRect.width / 2 - (groupRect.left + groupRect.width / 2);
    const dy = targetRect.top + targetRect.height / 2 - (groupRect.top + groupRect.height / 2);
    setTransform(`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`);
    return true;
  };

  useLayoutEffect(() => {
    if (phase === 'skip') {
      onLogoRevealChange(true);
      return;
    }
    sessionStorage.setItem(SEEN_KEY, '1');

    const holdTimer = window.setTimeout(() => {
      if (!measureAndSetTransform()) {
        setPhase('done');
        onLogoRevealChange(true);
        return;
      }
      setPhase('shrinking');
    }, HOLD_MS);

    return () => window.clearTimeout(holdTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (phase !== 'shrinking') return;
    const timer = window.setTimeout(() => {
      onLogoRevealChange(true);
      setPhase('crossfading');
    }, SHRINK_MS);

    // A viewport resize/rotation mid-flight (orientation change, or a devtools resize while
    // testing) would otherwise leave the logo gliding toward a now-stale header position — or
    // toward the wrong target entirely if the resize crosses the mobile/desktop cutover —
    // re-measure and retarget the transition live so it always lands exactly on the real logo.
    window.addEventListener('resize', measureAndSetTransform);
    window.addEventListener('orientationchange', measureAndSetTransform);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', measureAndSetTransform);
      window.removeEventListener('orientationchange', measureAndSetTransform);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useLayoutEffect(() => {
    if (phase !== 'crossfading') return;
    const timer = window.setTimeout(() => setPhase('done'), CROSSFADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'skip' || phase === 'done') return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[70] bg-page transition-opacity ${phase === 'crossfading' ? 'opacity-0' : 'opacity-100'}`}
      style={{ transitionDuration: `${CROSSFADE_MS}ms` }}
    >
      <div
        ref={groupRef}
        className="absolute left-1/2 top-1/2 flex items-center gap-4 transition-transform ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform, transitionDuration: `${SHRINK_MS}ms` }}
      >
        <img src="/logo-icon.png" alt="" className="h-24 w-auto dark:hidden sm:h-28" />
        <img src="/logo-icon-dark.png" alt="" className="hidden h-24 w-auto dark:block sm:h-28" />
        {/* Wordmark: desktop only (matches the lg cutover the FLIP target picks) — on mobile the
            intro shows the icon alone and lands on just the icon in the header. */}
        <span className="hidden items-center lg:flex">
          <img src="/logo-text.png" alt="Café Noir" className="h-12 w-auto dark:hidden sm:h-14" />
          <img src="/logo-text-dark.png" alt="Café Noir" className="hidden h-12 w-auto dark:block sm:h-14" />
        </span>
      </div>
    </div>
  );
}
