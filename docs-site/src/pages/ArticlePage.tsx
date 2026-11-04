import React, { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home, ChevronRight as Chevron } from 'lucide-react';
import { getPage, getAdjacentPages } from '../data';
import { TableOfContents } from '../components/TableOfContents';

export const ArticlePage: React.FC = () => {
  const { slug = '' } = useParams();
  const page = getPage(slug);

  // Every article navigation starts at the top, and honors a deep #heading link (from the TOC,
  // search, or a shared URL) once the content is in the DOM.
  useEffect(() => {
    if (!page) return;
    if (window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    }
    window.scrollTo({ top: 0 });
  }, [page]);

  if (!page) return <Navigate to="/404" replace />;

  const { prev, next } = getAdjacentPages(slug);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_14rem] gap-8">
      <article className="min-w-0">
        <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
          <Link to="/" className="hover:text-emerald-600 flex items-center gap-1"><Home size={12} /> Accueil</Link>
          <Chevron size={12} />
          <span className="text-gray-500">{page.category}</span>
          <Chevron size={12} />
          <span className="text-gray-700 font-semibold truncate">{page.title}</span>
        </nav>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-2">{page.title}</h1>
        {page.description && <p className="text-sm text-gray-500 mb-6">{page.description}</p>}

        <div className="docs-article" dangerouslySetInnerHTML={{ __html: page.html }} />

        {(prev || next) && (
          <div className="mt-10 pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {prev ? (
              <Link
                to={`/${prev.slug}`}
                className="group p-3.5 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition flex items-center gap-2"
              >
                <ChevronLeft size={16} className="text-gray-400 group-hover:text-emerald-600 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Précédent</span>
                  <span className="block text-xs font-semibold text-gray-800 truncate">{prev.title}</span>
                </span>
              </Link>
            ) : <div />}
            {next && (
              <Link
                to={`/${next.slug}`}
                className="group p-3.5 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition flex items-center justify-end gap-2 text-right sm:col-start-2"
              >
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">Suivant</span>
                  <span className="block text-xs font-semibold text-gray-800 truncate">{next.title}</span>
                </span>
                <ChevronRight size={16} className="text-gray-400 group-hover:text-emerald-600 shrink-0" />
              </Link>
            )}
          </div>
        )}
      </article>

      <aside className="hidden xl:block">
        <TableOfContents toc={page.toc} />
      </aside>
    </div>
  );
};
