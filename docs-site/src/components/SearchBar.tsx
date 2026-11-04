import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, FileText } from 'lucide-react';
import { searchIndex } from '../data';
import { search } from '../search';

interface SearchBarProps {
  className?: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
}

// One search bar component, used both inline in the header (desktop) and full-width in the
// mobile menu — results are a simple, always-visible dropdown rather than a separate route, so
// it never loses the page underneath.
export const SearchBar: React.FC<SearchBarProps> = ({ className = '', autoFocus, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => search(searchIndex, query), [query]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => setActiveIndex(0), [query]);

  const goTo = (slug: string) => {
    navigate(`/${slug}`);
    setQuery('');
    setIsOpen(false);
    onNavigate?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); goTo(results[activeIndex].entry.slug); }
    else if (e.key === 'Escape') setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher par mot-clé… (ex : avance, calcul du quotidien)"
          className="w-full pl-9 pr-8 py-2.5 text-sm rounded-xl border border-gray-200 bg-gray-50/70 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 focus:bg-white transition"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setIsOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer"
            aria-label="Effacer la recherche"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && query.trim().length >= 2 && (
        <div className="absolute z-40 mt-2 w-full sm:w-[26rem] max-w-[90vw] rounded-2xl bg-white border border-gray-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {results.length === 0 ? (
            <p className="p-4 text-xs text-gray-400">Aucun résultat pour « {query} ». Essayez un autre mot-clé.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1.5">
              {results.map((r, i) => (
                <li key={r.entry.slug}>
                  <button
                    onClick={() => goTo(r.entry.slug)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left px-4 py-2.5 flex items-start gap-3 cursor-pointer transition ${
                      i === activeIndex ? 'bg-emerald-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <FileText size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-gray-900 truncate">{r.entry.title}</span>
                      <span className="block text-[11px] text-emerald-600 font-semibold">{r.entry.category}</span>
                      <span className="block text-[11px] text-gray-400 line-clamp-2 mt-0.5">{r.snippet}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
