import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, ArrowLeft, Store } from 'lucide-react';
import { SearchBar } from './SearchBar';
import { MAIN_APP_URL, SHOWCASE_URL } from '../config/site';
import { manifest } from '../data';

interface HeaderProps {
  onToggleSidebar: () => void;
  // Only an article page has a scoped article list to open on mobile (see Sidebar's
  // categoryFilter) — the hamburger is hidden on the homepage, which has nothing to toggle.
  showSidebarToggle: boolean;
  currentCategory?: string;
}

// Two-row header, the same shape docs.stripe.com uses: a slim top bar (brand, search, exits) over
// a row of top-level category tabs that stays constant across every page — so jumping from
// "Ventes" to "Stock" is always one click away, never a trip back through the homepage first.
export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, showSidebarToggle, currentCategory }) => (
  <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100">
    {/* Row 1 — brand, search, exits */}
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
      {showSidebarToggle && (
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer shrink-0"
          aria-label="Ouvrir le menu"
        >
          <Menu size={20} />
        </button>
      )}

      <Link to="/" className="flex items-center gap-2 shrink-0">
        <img src="/logo.png" alt="" className="h-7 w-auto" />
        <span className="hidden sm:flex items-center gap-1.5">
          <img src="/logo-text.png" alt="Café Noir" className="h-3.5 w-auto" />
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 tracking-wider">DOCS</span>
        </span>
      </Link>

      <div className="flex-1 flex justify-center px-2">
        <div className="w-full max-w-lg hidden md:block">
          <SearchBar />
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-auto md:ml-0">
        <a
          href={SHOWCASE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 transition"
        >
          <Store size={14} />
          <span>Voir la vitrine</span>
        </a>
        <a
          href={MAIN_APP_URL}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 transition"
        >
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">Retour au système</span>
        </a>
      </div>
    </div>
    <div className="md:hidden px-4 pb-3">
      <SearchBar />
    </div>

    {/* Row 2 — category tabs, constant on every page; horizontally scrollable on narrow screens
        rather than wrapping, so the header's height never jumps between pages. */}
    <div className="border-t border-gray-100 overflow-x-auto no-scrollbar">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex items-center gap-1 h-11 w-max min-w-full">
        {manifest.categories.map((cat) => {
          const firstSlug = cat.pages[0]?.slug;
          if (!firstSlug) return null;
          const isActive = cat.name === currentCategory;
          return (
            <NavLink
              key={cat.name}
              to={`/${firstSlug}`}
              className={`shrink-0 px-3 h-11 inline-flex items-center text-xs font-semibold border-b-2 transition whitespace-nowrap ${
                isActive
                  ? 'border-emerald-500 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'
              }`}
            >
              {cat.name}
            </NavLink>
          );
        })}
      </div>
    </div>
  </header>
);
