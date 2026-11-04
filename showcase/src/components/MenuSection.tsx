import { ArrowRight, RefreshCw, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { formatTND, startingPrice } from '../lib/format';
import { buildGroups, categoryImage, type CategoryGroup } from '../lib/catalogView';
import { Link } from '../lib/router';
import { useCatalog } from '../lib/useCatalog';
import { Reveal } from './ui/Reveal';

const MAX_CARDS = 4;
const MAX_ITEMS = 5;
// A lone category gets one wide card (photo beside a two-column list) instead of an orphan narrow one.
const MAX_ITEMS_WIDE = 8;

// Literal class names so Tailwind can see them: the desktop column count follows how many cards there are.
const XL_COLUMNS: Record<number, string> = { 1: '', 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4' };

function CardSkeleton() {
  return (
    <div className="rounded-2xl bg-card/70 p-1.5" aria-hidden>
      <div className="skeleton aspect-[16/9] rounded-xl" />
      <div className="space-y-3.5 px-2.5 pb-4 pt-4">
        <div className="skeleton h-4 w-1/3 rounded" />
        {Array.from({ length: MAX_ITEMS }, (_, i) => (
          <div key={i} className="skeleton h-3 w-full rounded" />
        ))}
      </div>
    </div>
  );
}

function MenuCard({ group, wide }: { group: CategoryGroup; wide: boolean }) {
  const image = categoryImage(group);
  const shown = group.products.slice(0, wide ? MAX_ITEMS_WIDE : MAX_ITEMS);
  const hidden = group.products.length - shown.length;

  return (
    <article
      className={`group flex flex-col rounded-2xl bg-card/70 p-1.5 shadow-[0_1px_0_0] shadow-line/60 transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5 dark:bg-card ${wide ? 'md:flex-row' : ''}`}
    >
      <div className={`aspect-[16/9] overflow-hidden rounded-xl bg-section ${wide ? 'md:aspect-auto md:min-h-64 md:w-[42%] md:shrink-0' : ''}`}>
        <img src={image.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      </div>
      <div className={`flex flex-1 flex-col px-3 pb-3.5 pt-3.5 ${wide ? 'md:px-6 md:py-5' : ''}`}>
        <div className="flex items-center gap-3">
          <h3 className="font-serif text-xl leading-none text-ink">{group.name}</h3>
          <span aria-hidden className="h-px flex-1 bg-brand/40" />
        </div>
        <ul className={`mt-2.5 ${wide ? 'md:columns-2 md:gap-10' : ''}`}>
          {shown.map((p) => (
            <li key={p.id} className="flex break-inside-avoid items-baseline justify-between gap-3 border-b border-line/70 py-2.5 text-[13px] last:border-b-0">
              <span className="min-w-0 leading-snug text-ink/90">{p.name}</span>
              <span className="shrink-0 tabular-nums text-muted">{formatTND(startingPrice(p))}</span>
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <Link
            to={`/menu?categorie=${encodeURIComponent(group.name)}`}
            className="mt-2 self-start text-xs font-semibold text-accent underline-offset-4 hover:underline"
          >
            + {hidden} autre{hidden > 1 ? 's' : ''}
          </Link>
        )}
      </div>
    </article>
  );
}

export function MenuSection() {
  const { state, retry } = useCatalog();
  const groups = useMemo(() => (state.status === 'ready' ? buildGroups(state.catalog) : []), [state]);

  return (
    <section id="menu" className="scroll-mt-16 bg-section lg:scroll-mt-[72px]">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-12 lg:px-12 lg:py-20">
        <Reveal className="lg:pt-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-subtle">Notre menu</p>
          <h2 className="mt-4 font-serif text-[2.1rem] leading-[1.12] tracking-[-0.015em] text-ink sm:text-[2.5rem]">
            Des saveurs pour toutes les <em className="text-accent">envies</em>
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
            Du café classique aux boissons signatures, en passant par nos pâtisseries et nos options salées, notre carte est
            pensée pour satisfaire tous les goûts.
          </p>
          <Link
            to="/menu"
            className="group mt-7 inline-flex items-center gap-2.5 rounded-full bg-brand px-6 py-3 text-[13px] font-semibold text-on-brand transition-[filter] hover:brightness-95"
          >
            Voir le menu complet <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Reveal>

        <div className="min-w-0">
          {state.status === 'loading' && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Chargement du menu">
              {Array.from({ length: MAX_CARDS }, (_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          )}

          {state.status === 'error' && (
            <div className="flex flex-col items-center rounded-2xl bg-card/70 px-6 py-14 text-center dark:bg-card">
              <WifiOff size={36} strokeWidth={1.4} className="text-subtle" />
              <p className="mt-4 font-serif text-2xl text-ink">Le menu ne peut pas s’afficher</p>
              <p className="mt-1.5 text-sm text-muted">Vérifiez votre connexion puis réessayez.</p>
              <button
                type="button"
                onClick={retry}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-[13px] font-semibold text-on-brand hover:brightness-95"
              >
                <RefreshCw size={14} /> Réessayer
              </button>
            </div>
          )}

          {state.status === 'ready' && groups.length === 0 && (
            <div className="rounded-2xl bg-card/70 px-6 py-14 text-center dark:bg-card">
              <p className="font-serif text-2xl text-ink">Notre carte arrive bientôt</p>
              <p className="mt-1.5 text-sm text-muted">Revenez nous voir très vite.</p>
            </div>
          )}

          {state.status === 'ready' && groups.length > 0 && (
            <div className={`grid gap-4 ${groups.length > 1 ? 'sm:grid-cols-2' : ''} ${XL_COLUMNS[Math.min(groups.length, MAX_CARDS)]}`}>
              {groups.slice(0, MAX_CARDS).map((g, i) => (
                <Reveal key={g.name} delay={i * 80}>
                  <MenuCard group={g} wide={groups.length === 1} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
