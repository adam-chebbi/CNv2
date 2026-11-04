import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  ArrowRight,
  Search as SearchIcon,
  Camera,
  RefreshCw,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { manifest } from '../data';
import { resolveIcon } from '../iconMap';
import { SearchBar } from '../components/SearchBar';

const FEATURES: { icon: typeof ShieldCheck; title: string; description: string }[] = [
  {
    icon: ShieldCheck,
    title: 'Réservé à l\'équipe',
    description: "Accessible uniquement aux comptes déjà connectés sur system.cafenoir.tn — rien n'est public ni indexé.",
  },
  {
    icon: SearchIcon,
    title: 'Recherche par mot-clé',
    description: 'Trouvez une réponse en tapant un mot simple ("avance", "lot", "inventaire") plutôt que de parcourir des menus.',
  },
  {
    icon: Camera,
    title: 'Pas à pas, avec captures',
    description: "Chaque guide suit les boutons et menus exactement tels qu'ils apparaissent dans l'application.",
  },
  {
    icon: RefreshCw,
    title: 'Toujours à jour',
    description: "Mis à jour en même temps que l'application — les guides évoluent avec les nouvelles fonctionnalités.",
  },
  {
    icon: Smartphone,
    title: 'Sur tous les écrans',
    description: 'Aussi confortable à consulter sur le téléphone derrière la caisse que sur un ordinateur au bureau.',
  },
  {
    icon: Sparkles,
    title: 'Sans jargon technique',
    description: "Rédigé en français simple, pour toute l'équipe — pas seulement pour les personnes à l'aise avec l'informatique.",
  },
];

export const HomePage: React.FC = () => (
  <div className="space-y-14 sm:space-y-20">
    {/* Hero */}
    <section className="text-center max-w-2xl mx-auto pt-4 sm:pt-8">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-[11px] font-bold uppercase tracking-wide mb-5">
        <Sparkles size={12} /> Centre d'aide Café Noir
      </span>
      <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
        Toute l'aide dont vous avez besoin,<br className="hidden sm:block" /> en un seul endroit
      </h1>
      <p className="mt-4 text-sm sm:text-base text-gray-500 max-w-xl mx-auto">
        Des guides simples et illustrés pour utiliser le système de gestion Café Noir au quotidien —
        des ventes au personnel, en passant par le stock et les rapports.
      </p>
      <div className="mt-7 max-w-lg mx-auto">
        <SearchBar autoFocus={false} />
      </div>
    </section>

    {/* Private access notice */}
    <section className="max-w-3xl mx-auto">
      <div className="flex items-start gap-3.5 p-4 sm:p-5 rounded-2xl bg-emerald-50/70 border border-emerald-100">
        <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-emerald-600 shrink-0 shadow-2xs">
          <ShieldCheck size={18} />
        </span>
        <div>
          <p className="text-sm font-bold text-emerald-900">Ce site est privé</p>
          <p className="text-xs text-emerald-800/80 mt-0.5">
            Vous le consultez parce que vous êtes déjà connecté(e) sur <strong>system.cafenoir.tn</strong>. Il n'est
            ni public, ni référencé par les moteurs de recherche — inutile de partager ce lien en dehors de l'équipe.
          </p>
        </div>
      </div>
    </section>

    {/* Par où commencer */}
    {manifest.featured.length > 0 && (
      <section>
        <div className="text-center mb-8">
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900">Par où commencer ?</h2>
          <p className="text-sm text-gray-500 mt-1">Les 5 actions les plus utilisées au quotidien.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {manifest.featured.map((f, i) => (
            <Link
              key={f.slug}
              to={`/${f.slug}`}
              className="group relative p-4 rounded-2xl bg-white border border-gray-100 hover:border-emerald-200 hover:shadow-md shadow-2xs transition"
            >
              <span className="text-3xl font-black text-gray-100 group-hover:text-emerald-100 transition leading-none">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="mt-2 text-[13px] font-bold text-gray-900 leading-snug">{f.title}</p>
              <p className="mt-1 text-[11px] text-gray-400 line-clamp-2">{f.description}</p>
              <ArrowRight size={14} className="absolute bottom-4 right-4 text-gray-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition" />
            </Link>
          ))}
        </div>
      </section>
    )}

    {/* Category card grid */}
    <section>
      <div className="text-center mb-8">
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900">Parcourir par thème</h2>
        <p className="text-sm text-gray-500 mt-1">Tous les guides, classés comme les modules de l'application.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {manifest.categories.map((cat) => {
          const Icon = resolveIcon(cat.icon);
          const firstSlug = cat.pages[0]?.slug;
          return (
            <div key={cat.name} className="p-5 rounded-2xl bg-white border border-gray-100 shadow-2xs">
              {firstSlug ? (
                <Link to={`/${firstSlug}`} className="flex items-center gap-2.5 mb-3 group w-fit">
                  <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition">
                    <Icon size={17} />
                  </span>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-emerald-600 transition">{cat.name}</h3>
                </Link>
              ) : (
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Icon size={17} />
                  </span>
                  <h3 className="text-sm font-bold text-gray-900">{cat.name}</h3>
                </div>
              )}
              <ul className="space-y-1.5">
                {cat.pages.map((p) => (
                  <li key={p.slug}>
                    <Link
                      to={`/${p.slug}`}
                      className="text-[13px] text-gray-500 hover:text-emerald-600 transition flex items-center gap-1.5 group"
                    >
                      <span className="w-1 h-1 rounded-full bg-gray-300 group-hover:bg-emerald-500 shrink-0" />
                      <span className="truncate">{p.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>

    {/* Feature block */}
    <section className="rounded-3xl bg-gray-900 px-6 sm:px-10 py-10 sm:py-14 text-white overflow-hidden relative">
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="relative max-w-4xl mx-auto text-center mb-10">
        <h2 className="text-xl sm:text-2xl font-extrabold">Pensé pour toute l'équipe, pas pour les informaticiens</h2>
        <p className="text-sm text-gray-300 mt-2 max-w-xl mx-auto">
          Ce centre d'aide est construit pour que n'importe quel membre de l'équipe trouve sa réponse seul, en
          quelques secondes.
        </p>
      </div>
      <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
                <Icon size={16} />
              </span>
              <p className="text-[13px] font-bold text-white mb-1">{f.title}</p>
              <p className="text-[12px] text-gray-400 leading-relaxed">{f.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  </div>
);
