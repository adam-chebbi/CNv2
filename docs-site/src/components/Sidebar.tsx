import React from 'react';
import { NavLink } from 'react-router-dom';
import { manifest } from '../data';
import { resolveIcon } from '../iconMap';

interface SidebarProps {
  onNavigate?: () => void;
  // When set, only that one category's articles render — scoped to whichever category tab is
  // active in the header (Stripe-docs style: the left rail follows the current product area
  // instead of listing all of them at once). Omitted entirely renders every category, kept as
  // a fallback for any future reuse outside an article page's category context.
  categoryFilter?: string;
}

// Entirely generated from src/generated/manifest.json (built from content/**/*.md frontmatter) —
// no page or category is ever named here. A new category appears as a new section automatically;
// a new page appears under its category automatically.
export const Sidebar: React.FC<SidebarProps> = ({ onNavigate, categoryFilter }) => {
  const categories = categoryFilter ? manifest.categories.filter((c) => c.name === categoryFilter) : manifest.categories;

  return (
    <nav className="space-y-5">
      {categories.map((cat) => {
        const Icon = resolveIcon(cat.icon);
        return (
          <div key={cat.name}>
            <div className="flex items-center gap-2 px-2 mb-1.5">
              <Icon size={14} className="text-emerald-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{cat.name}</span>
            </div>
            <ul className="space-y-0.5">
              {cat.pages.map((p) => (
                <li key={p.slug}>
                  <NavLink
                    to={`/${p.slug}`}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `block px-3 py-1.5 rounded-lg text-[13px] font-medium transition truncate ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 font-semibold'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`
                    }
                  >
                    {p.title}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
};
