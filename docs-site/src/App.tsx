import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { HomePage } from './pages/HomePage';
import { ArticlePage } from './pages/ArticlePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { getPage } from './data';

// Closes the mobile drawer on every navigation — otherwise clicking a link inside it would leave
// it open over the new page.
const RouteChangeCloser: React.FC<{ onChange: () => void }> = ({ onChange }) => {
  const location = useLocation();
  useEffect(() => { onChange(); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

const Shell: React.FC = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  // The current article's category — drives both the active tab in the header's category row
  // and which single category the left sidebar is scoped to (Stripe-docs style: the rail follows
  // whichever product area you're in, rather than listing all ten at once). undefined on the
  // homepage (nothing is "current" there) and on an unknown slug.
  const slug = location.pathname.replace(/^\//, '');
  const currentCategory = slug ? getPage(slug)?.category : undefined;
  const isArticlePage = Boolean(slug && currentCategory);

  return (
    <div className="min-h-screen bg-[#fcfcfc]">
      <RouteChangeCloser onChange={() => setMobileSidebarOpen(false)} />
      <Header
        onToggleSidebar={() => setMobileSidebarOpen(true)}
        showSidebarToggle={isArticlePage}
        currentCategory={currentCategory}
      />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex gap-8">
        {/* Desktop sidebar — only on an article page, scoped to its category. The homepage is a
            full-width landing page (hero, category grid) with no rail at all, same as
            docs.stripe.com's own homepage vs. its per-product pages. */}
        {isArticlePage && (
          <aside className="hidden lg:block w-60 shrink-0 py-8">
            <div className="sticky top-28">
              <Sidebar categoryFilter={currentCategory} />
            </div>
          </aside>
        )}

        {/* Mobile sidebar drawer — same category scoping */}
        {mobileSidebarOpen && isArticlePage && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setMobileSidebarOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-white shadow-2xl p-5 overflow-y-auto animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between mb-5">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{currentCategory}</span>
                <button onClick={() => setMobileSidebarOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 cursor-pointer">
                  <X size={18} />
                </button>
              </div>
              <Sidebar categoryFilter={currentCategory} onNavigate={() => setMobileSidebarOpen(false)} />
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0 py-8 sm:py-10">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/:slug" element={<ArticlePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>

      <footer className="border-t border-gray-100 mt-10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 text-center text-[11px] text-gray-400">
          Café Noir — Centre d'aide interne, réservé à l'équipe.
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => (
  <BrowserRouter>
    <Shell />
  </BrowserRouter>
);
