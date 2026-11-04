import { Menu as MenuIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NAV_ITEMS } from '../config/site';
import { Link, useRouter } from '../lib/router';
import { useActiveSection } from '../lib/useActiveSection';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const SECTION_IDS = NAV_ITEMS.map((n) => n.id);

type NavItem = (typeof NAV_ITEMS)[number];

export function Header({ logoHidden = false }: { logoHidden?: boolean }) {
  const { path } = useRouter();
  const onHome = path === '/';
  const spy = useActiveSection(SECTION_IDS, path);
  // On the home page the underline follows the scroll; on the menu page it stays on "Menu".
  const active = onHome ? spy : path === '/menu' ? 'menu' : '';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  // On the home page every entry (including "Menu") scrolls to its section. Elsewhere "Menu" is the menu
  // page itself and the others go back to their section of the home page (or the shared footer).
  // The "Voir le menu complet" buttons always open the /menu page.
  const hrefFor = (item: NavItem): string => {
    if (onHome) return `#${item.id}`;
    if (item.id === 'menu') return '/menu';
    if (item.id === 'contact') return '#contact';
    return item.id === 'accueil' ? '/' : `/#${item.id}`;
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-page/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-8 lg:h-[72px] lg:px-12">
        <Logo
          id="header-logo"
          iconId="header-logo-icon"
          style={{ opacity: logoHidden ? 0 : 1, transition: 'opacity 0.4s ease-out' }}
        />

        <nav className="hidden items-center gap-9 lg:flex" aria-label="Navigation principale">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.id}
              to={hrefFor(item)}
              aria-current={active === item.id ? 'page' : undefined}
              className={`relative py-1 text-[13px] font-medium transition-colors hover:text-ink ${
                active === item.id ? 'text-ink' : 'text-muted'
              }`}
            >
              {item.label}
              <span
                aria-hidden
                className={`absolute -bottom-0.5 left-1/2 h-0.5 -translate-x-1/2 rounded-full bg-brand transition-all ${
                  active === item.id ? 'w-4 opacity-100' : 'w-0 opacity-0'
                }`}
              />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          {path !== '/menu' && (
            <Link
              to="/menu"
              className="hidden rounded-full bg-brand px-5 py-2.5 text-xs font-semibold text-on-brand transition-[filter] hover:brightness-95 sm:inline-flex"
            >
              Voir le menu complet
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink lg:hidden"
          >
            {open ? <X size={18} /> : <MenuIcon size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="animate-fade-up border-t border-line bg-page px-5 pb-5 pt-2 sm:px-8 lg:hidden" aria-label="Navigation mobile">
          <ul className="divide-y divide-line">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <Link
                  to={hrefFor(item)}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between py-3.5 text-base font-medium ${active === item.id ? 'text-ink' : 'text-muted'}`}
                >
                  {item.label}
                  {active === item.id && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                </Link>
              </li>
            ))}
          </ul>
          {path !== '/menu' && (
            <Link
              to="/menu"
              onClick={() => setOpen(false)}
              className="mt-3 flex w-full items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-on-brand"
            >
              Voir le menu complet
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
