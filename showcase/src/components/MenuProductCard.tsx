import type { Extra, Product } from '../api/products';
import { formatTND, startingPrice } from '../lib/format';

/** One product of the menu page: photo (when the system has one), name, price, sizes and extras. */
export function MenuProductCard({ product, extras }: { product: Product; extras: Extra[] }) {
  const productExtras = product.extraIds.map((id) => extras.find((e) => e.id === id)).filter((e): e is Extra => Boolean(e));
  const prices = product.variants.map((v) => product.price + (v.priceDelta ?? 0));
  const varies = prices.length > 0 && Math.max(...prices) > Math.min(...prices);

  return (
    <article className="group mb-4 flex break-inside-avoid flex-col rounded-2xl bg-card/70 p-1.5 shadow-[0_1px_0_0] shadow-line/60 transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5 dark:bg-card">
      {product.imageUrl && (
        <div className="aspect-[16/10] overflow-hidden rounded-xl bg-section">
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      )}

      <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif text-[1.35rem] leading-tight text-ink">{product.name}</h3>
            {product.subCategory && <p className="mt-1.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-subtle">{product.subCategory}</p>}
          </div>
          <span className="shrink-0 rounded-full bg-brand/15 px-3 py-1 text-[13px] font-semibold tabular-nums text-ink">
            {varies && <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-muted">dès</span>}
            {formatTND(startingPrice(product))}
          </span>
        </div>

        {product.description && <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{product.description}</p>}

        {product.variants.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tailles et options">
            {product.variants.map((v) => (
              <li key={v.id} className="rounded-full border border-line px-3 py-1 text-[11.5px] text-muted">
                {v.label}
                {varies && <span className="ml-1.5 tabular-nums text-ink/80">{formatTND(product.price + (v.priceDelta ?? 0))}</span>}
              </li>
            ))}
          </ul>
        )}

        {productExtras.length > 0 && (
          <p className="mt-4 border-t border-line/80 pt-3 text-xs leading-relaxed text-subtle">
            <span className="font-semibold text-muted">Suppléments · </span>
            {productExtras.map((e) => `${e.name} +${formatTND(e.price)}`).join(' · ')}
          </p>
        )}
      </div>
    </article>
  );
}
