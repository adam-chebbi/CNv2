import { ArrowRight, MapPin, RefreshCw, Search, SearchX, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Catalog, Product } from '../api/products';
import { MenuProductCard } from '../components/MenuProductCard';
import { IMAGES } from '../config/site';
import { useSiteInfo } from '../lib/siteInfo';
import { buildGroups, categoryImage } from '../lib/catalogView';
import { normalize } from '../lib/format';
import { Link, useRouter } from '../lib/router';
import { useCatalog } from '../lib/useCatalog';
import { Reveal } from '../components/ui/Reveal';

const ALL = '__all__';

const COLLAGE = [IMAGES.cafes, IMAGES.boissons, IMAGES.patisseries, IMAGES.sales];

function ProductSkeleton() {
  return (
    <div className="rounded-2xl bg-card/70 p-1.5 dark:bg-card" aria-hidden>
      <div className="space-y-3 px-4 py-4">
        <div className="flex justify-between gap-6">
          <div className="skeleton h-6 w-1/2 rounded" />
          <div className="skeleton h-6 w-20 rounded-full" />
        </div>
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}

function Catalogue({ catalog, initialCategory }: { catalog: Catalog; initialCategory: string }) {
  const [active, setActive] = useState(initialCategory);
  const [query, setQuery] = useState('');

  const groups = useMemo(() => buildGroups(catalog), [catalog]);
  // The chosen category may vanish while the page is open (live refresh) — fall back to everything.
  const current = active === ALL || groups.some((g) => g.name === active) ? active : ALL;

  const visible = useMemo(() => {
    const q = normalize(query);
    const matches = (p: Product) =>
      !q || normalize(`${p.name} ${p.description ?? ''} ${p.subCategory ?? ''} ${p.category}`).includes(q);
    return groups
      .filter((g) => current === ALL || g.name === current)
      .map((g) => ({ group: g, products: g.products.filter(matches) }))
      .filter((g) => g.products.length > 0);
  }, [groups, current, query]);

  const chip = (isActive: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
      isActive ? 'bg-brand text-on-brand shadow-sm' : 'border border-line bg-card/60 text-muted hover:border-brand hover:text-ink dark:bg-card'
    }`;

  return (
    <>
      <div className="sticky top-16 z-30 border-b border-line bg-page/90 backdrop-blur-md lg:top-[72px]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-5 py-3.5 sm:px-8 md:flex-row md:items-center lg:px-12">
          <div className="relative md:w-72">
            <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un produit…"
              aria-label="Rechercher un produit"
              className="w-full rounded-full border border-line bg-card py-2.5 pl-10 pr-4 text-[13px] text-ink outline-none placeholder:text-subtle focus:border-brand"
            />
          </div>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 sm:-mx-8 sm:px-8 md:mx-0 md:px-0" role="tablist" aria-label="Catégories">
            <button type="button" role="tab" aria-selected={current === ALL} onClick={() => setActive(ALL)} className={chip(current === ALL)}>
              Tout
            </button>
            {groups.map((g) => (
              <button key={g.name} type="button" role="tab" aria-selected={current === g.name} onClick={() => setActive(g.name)} className={chip(current === g.name)}>
                {g.name}
                <span className={`ml-1.5 text-[11px] ${current === g.name ? 'opacity-70' : 'text-subtle'}`}>{g.products.length}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-5 pb-16 pt-10 sm:px-8 lg:px-12 lg:pb-24 lg:pt-14">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <SearchX size={40} strokeWidth={1.3} className="text-subtle" />
            <p className="mt-4 font-serif text-3xl text-ink">Aucun produit trouvé</p>
            <p className="mt-1.5 text-sm text-muted">Essayez un autre mot-clé ou une autre catégorie.</p>
          </div>
        ) : (
          <div className="space-y-14 lg:space-y-16">
            {visible.map(({ group, products }) => (
              <Reveal key={group.name} as="div">
                <section aria-labelledby={`cat-${group.name}`}>
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-section sm:h-16 sm:w-16">
                      <img src={categoryImage(group).src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <h2 id={`cat-${group.name}`} className="font-serif text-[1.9rem] leading-none tracking-[-0.01em] text-ink sm:text-4xl">
                        {group.name}
                      </h2>
                      <p className="mt-1.5 text-xs text-subtle">
                        {products.length} produit{products.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <span aria-hidden className="ml-2 hidden h-px flex-1 bg-brand/40 sm:block" />
                  </div>
                  <div className="mt-6 columns-1 gap-4 sm:columns-2 lg:columns-3">
                    {products.map((p) => (
                      <MenuProductCard key={p.id} product={p} extras={catalog.extras} />
                    ))}
                  </div>
                </section>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function MenuPage() {
  const info = useSiteInfo();
  const { state, retry } = useCatalog();
  const { search } = useRouter();
  const initialCategory = useMemo(() => new URLSearchParams(search).get('categorie') ?? ALL, [search]);

  const stats = useMemo(() => {
    if (state.status !== 'ready') return null;
    const groups = buildGroups(state.catalog);
    return { products: groups.reduce((n, g) => n + g.products.length, 0), categories: groups.length };
  }, [state]);

  return (
    <>
      <section className="border-b border-line bg-section">
        <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:px-12 lg:py-20">
          <div className="animate-fade-up">
            <nav aria-label="Fil d’Ariane" className="text-xs text-subtle">
              <Link to="/" className="transition-colors hover:text-ink">
                Accueil
              </Link>
              <span className="mx-2">/</span>
              <span className="text-muted">Menu</span>
            </nav>
            <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.32em] text-subtle">Notre menu</p>
            <h1 className="mt-4 font-serif text-[2.6rem] leading-[1.06] tracking-[-0.02em] text-ink sm:text-[3.4rem] lg:text-[3.9rem]">
              Des saveurs pour toutes les <em className="text-accent">envies</em>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
              Du café classique aux boissons signatures, en passant par nos pâtisseries et nos options salées, notre carte est
              pensée pour satisfaire tous les goûts.
            </p>
            {stats && (
              <ul className="mt-7 flex flex-wrap gap-2.5 text-[13px] text-muted">
                <li className="rounded-full border border-line bg-card/60 px-4 py-1.5 dark:bg-card">
                  <strong className="font-semibold text-ink">{stats.products}</strong> produit{stats.products > 1 ? 's' : ''}
                </li>
                <li className="rounded-full border border-line bg-card/60 px-4 py-1.5 dark:bg-card">
                  <strong className="font-semibold text-ink">{stats.categories}</strong> catégorie{stats.categories > 1 ? 's' : ''}
                </li>
                <li className="rounded-full border border-line bg-card/60 px-4 py-1.5 dark:bg-card">Prix en TND</li>
              </ul>
            )}
          </div>

          <div className="grid grid-cols-4 gap-3 sm:gap-4">
            <div className="col-span-4 overflow-hidden rounded-2xl shadow-[0_24px_60px_-30px] shadow-black/40">
              <img src={IMAGES.hero} alt="Un cappuccino sur une table en marbre" decoding="async" className="aspect-[16/8] w-full object-cover" />
            </div>
            {COLLAGE.map((src, i) => (
              <div key={src} className={`overflow-hidden rounded-xl ${i % 2 === 1 ? 'translate-y-2' : ''}`}>
                <img src={src} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {state.status === 'loading' && (
        <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-8 lg:px-12" aria-busy="true" aria-label="Chargement du menu">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="mx-auto flex max-w-[1240px] flex-col items-center px-5 py-20 text-center sm:px-8 lg:px-12">
          <WifiOff size={40} strokeWidth={1.3} className="text-subtle" />
          <p className="mt-4 font-serif text-3xl text-ink">Le menu ne peut pas s’afficher</p>
          <p className="mt-1.5 text-sm text-muted">Vérifiez votre connexion puis réessayez.</p>
          <button
            type="button"
            onClick={retry}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-[13px] font-semibold text-on-brand hover:brightness-95"
          >
            <RefreshCw size={14} /> Réessayer
          </button>
        </div>
      )}

      {state.status === 'ready' &&
        (state.catalog.products.length === 0 ? (
          <div className="mx-auto max-w-[1240px] px-5 py-20 text-center sm:px-8 lg:px-12">
            <p className="font-serif text-3xl text-ink">Notre carte arrive bientôt</p>
            <p className="mt-1.5 text-sm text-muted">Revenez nous voir très vite.</p>
          </div>
        ) : (
          <Catalogue catalog={state.catalog} initialCategory={initialCategory} />
        ))}

      <section className="border-t border-line bg-section">
        <Reveal
          as="div"
          className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-6 px-5 py-12 sm:px-8 md:flex-row md:items-center lg:px-12"
        >
          <div>
            <h2 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">
              Une envie de café ? <em className="text-accent">Passez nous voir.</em>
            </h2>
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <MapPin size={15} className="shrink-0 text-ink" /> {info.address}
            </p>
            <p className="mt-1 text-sm text-muted">{info.hours}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={info.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-full bg-brand px-6 py-3 text-[13px] font-semibold text-on-brand transition-[filter] hover:brightness-95"
            >
              Nous trouver <ArrowRight size={15} />
            </a>
            <Link
              to="/"
              className="inline-flex items-center gap-2.5 rounded-full border border-brand px-6 py-3 text-[13px] font-semibold text-ink transition-colors hover:bg-brand hover:text-on-brand"
            >
              Retour à l’accueil
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
