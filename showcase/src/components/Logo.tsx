import { SITE } from '../config/site';
import { Link } from '../lib/router';

/** Brand mark + wordmark, side by side on one line. Swaps to a light-ink variant in dark mode. */
export function Logo({
  className = '',
  id,
  iconId,
  style,
}: {
  className?: string;
  id?: string;
  /** Optional id on just the icon (not the wordmark) — lets the intro animation target the icon
      alone on mobile, where it lands on/shrinks from just the mark, not the full lockup. */
  iconId?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Link to="/" id={id} style={style} aria-label={`${SITE.name} — accueil`} className={`flex items-center gap-2 ${className}`}>
      <span id={iconId} className="inline-flex shrink-0">
        <img src="/logo-icon.png" alt="" className="h-8 w-auto dark:hidden sm:h-9" />
        <img src="/logo-icon-dark.png" alt="" className="hidden h-8 w-auto dark:block sm:h-9" />
      </span>
      <img src="/logo-text.png" alt={SITE.name} className="h-4 w-auto dark:hidden sm:h-[1.15rem]" />
      <img src="/logo-text-dark.png" alt={SITE.name} className="hidden h-4 w-auto dark:block sm:h-[1.15rem]" />
    </Link>
  );
}
