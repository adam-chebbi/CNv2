import React, { useMemo, useState, type RefObject } from 'react';
import { Minus, Plus, Search, ShoppingCart, Star, Trash2 } from 'lucide-react';
import type { CartLineInput, PricedArticle, PricingCatalog } from '../data/pricing';
import { priceLine } from '../data/pricing';
import type { PosCatalog } from './api';
import { Btn, cx, inputCls, Modal, Money } from './ui';

// Product grid + option picker + cart lines. Prices shown here are a preview computed with the
// shared engine; the server re-prices everything it records.

export const toPricingCatalog = (c: PosCatalog): PricingCatalog => ({
  articles: new Map(c.articles.map((a) => [a.id, a])),
  extras: new Map(c.extras.map((e) => [e.id, e])),
  incompatibleExtras: c.incompatibleExtras,
});

export const lineKey = (l: CartLineInput): string => `${l.articleId}|${l.variantId ?? ''}|${[...(l.extraIds ?? [])].sort().join(',')}|${l.instruction ?? ''}`;

// Adds a line, merging it with an identical one.
export const addLine = (lines: CartLineInput[], line: CartLineInput): CartLineInput[] => {
  const k = lineKey(line);
  const existing = lines.find((l) => lineKey(l) === k);
  return existing ? lines.map((l) => (l === existing ? { ...l, quantity: Math.min(99, l.quantity + line.quantity) } : l)) : [...lines, line];
};

export const OptionPicker: React.FC<{ article: PricedArticle; catalog: PricingCatalog; onCancel: () => void; onAdd: (line: CartLineInput) => void; allowInstruction: boolean }> = ({
  article,
  catalog,
  onCancel,
  onAdd,
  allowInstruction,
}) => {
  const [variantId, setVariantId] = useState<string | undefined>(article.variants[0]?.id);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [instruction, setInstruction] = useState('');
  const [quantity, setQuantity] = useState(1);
  const blocked = new Set(
    catalog.incompatibleExtras.flatMap(([a, b]) => (extraIds.includes(a) ? [b] : extraIds.includes(b) ? [a] : []))
  );
  const preview = (() => {
    try {
      return priceLine({ articleId: article.id, quantity, variantId, extraIds }, catalog);
    } catch {
      return null;
    }
  })();
  return (
    <Modal
      title={article.name}
      onClose={onCancel}
      footer={
        <>
          <Btn onClick={onCancel}>Annuler</Btn>
          <Btn variant="primary" disabled={!preview} onClick={() => onAdd({ articleId: article.id, quantity, variantId, extraIds, instruction: instruction.trim() || undefined })}>
            Ajouter {preview && <Money mil={preview.grossMil} />}
          </Btn>
        </>
      }
    >
      {article.variants.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600">{article.variantLabel ?? 'Variante'} (obligatoire)</p>
          <div className="grid grid-cols-2 gap-2">
            {article.variants.map((v) => (
              <button
                key={v.id}
                onClick={() => setVariantId(v.id)}
                className={cx('min-h-[48px] rounded-xl border px-3 text-sm font-semibold', variantId === v.id ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200')}
              >
                {v.label}
                {v.deltaMil > 0 && <span className="block text-xs font-normal">+<Money mil={v.deltaMil} /></span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {article.extraIds.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600">Suppléments</p>
          <div className="grid grid-cols-2 gap-2">
            {article.extraIds.map((id) => {
              const extra = catalog.extras.get(id);
              if (!extra) return null;
              const on = extraIds.includes(id);
              const disabled = !on && blocked.has(id);
              return (
                <button
                  key={id}
                  disabled={disabled}
                  onClick={() => setExtraIds(on ? extraIds.filter((e) => e !== id) : [...extraIds, id])}
                  className={cx('min-h-[48px] rounded-xl border px-3 text-sm text-left', on ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200', disabled && 'opacity-40')}
                  title={disabled ? 'Incompatible avec un supplément choisi' : undefined}
                >
                  {extra.name} <span className="text-xs text-gray-500">+<Money mil={extra.priceMil} /></span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {allowInstruction && (
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-gray-600">Instruction (facultatif)</span>
          <input className={inputCls} maxLength={200} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="ex. sans sucre" />
        </label>
      )}
      <div className="flex items-center justify-center gap-4 pt-1">
        <Btn aria-label="Moins" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
          <Minus size={16} />
        </Btn>
        <span className="text-xl font-bold w-8 text-center">{quantity}</span>
        <Btn aria-label="Plus" onClick={() => setQuantity(Math.min(99, quantity + 1))}>
          <Plus size={16} />
        </Btn>
      </div>
    </Modal>
  );
};

// Accent-free match, so "cafe creme" finds "Café crème".
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// A product without photo shows its initials on its family's colour.
const FAMILY_TONES = ['#f5e6d3', '#e3f1e8', '#e6eefb', '#fbe7e7', '#efe7fb', '#fdf1d8', '#e2f3f5', '#f1ece4'];
const toneOf = (key: string) => FAMILY_TONES[[...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % FAMILY_TONES.length];
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-Z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || name.slice(0, 2).toUpperCase();

export const ProductGrid: React.FC<{
  catalog: PosCatalog;
  onAdd: (line: CartLineInput) => void;
  allowInstruction?: boolean;
  onLongPress?: (article: PricedArticle) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  // Quantity of each product already in the ticket, shown on its tile.
  counts?: Map<string, number>;
  // Caisse: fills its box, only the product list scrolls; photo cards; "Favoris" tab.
  fill?: boolean;
  favorites?: string[];
  // Quantity typed on the keyboard before tapping a product ("3" then Croissant).
  pendingQty?: number;
}> = ({ catalog, onAdd, allowInstruction = true, onLongPress, searchRef, counts, fill, favorites, pendingQty }) => {
  const pricing = useMemo(() => toPricingCatalog(catalog), [catalog]);
  const favs = useMemo(() => (favorites ?? []).filter((id) => catalog.articles.some((a) => a.id === id && a.availability !== 'hidden')), [favorites, catalog]);
  const [category, setCategory] = useState<string>(() => (fill && favs.length > 0 ? '__fav' : ''));
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<PricedArticle | null>(null);
  const categories = catalog.categories.filter((c) => catalog.articles.some((a) => a.category === c));
  const q = fold(query.trim());
  const visible = q
    ? catalog.articles.filter((a) => fold(a.name).includes(q))
    : category === '__fav'
      ? favs.map((id) => catalog.articles.find((a) => a.id === id)!).filter(Boolean)
      : catalog.articles.filter((a) => !category || a.category === category);

  const choose = (a: PricedArticle) => {
    if (a.availability !== 'available') return;
    const quantity = Math.max(1, pendingQty ?? 1);
    // Products without options go straight to the cart; the others open the option picker.
    if (a.variants.length === 0 && a.extraIds.length === 0) onAdd({ articleId: a.id, quantity });
    else setPicking(a);
  };

  const chip = (id: string, label: React.ReactNode) => (
    <button
      key={id}
      onClick={() => {
        setCategory(id);
        setQuery('');
      }}
      className={cx('shrink-0 px-4 min-h-[44px] rounded-full text-sm font-semibold border', category === id && !q ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 bg-white')}
    >
      {label}
    </button>
  );

  return (
    <div className={cx(fill ? 'flex flex-col h-full min-h-0 gap-2' : 'space-y-3')}>
      <div className={cx(fill && 'flex flex-col gap-2 shrink-0')}>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            className={cx(inputCls, 'pl-9')}
            placeholder={searchRef ? 'Rechercher un produit…  (F2)' : 'Rechercher un produit…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds the only match, Escape clears the search.
              if (e.key === 'Enter' && visible.length === 1) {
                choose(visible[0]);
                setQuery('');
              }
              if (e.key === 'Escape') setQuery('');
            }}
          />
        </div>
        <div className={cx('flex gap-2 overflow-x-auto pb-1', q && 'opacity-40')}>
          {fill && favs.length > 0 && chip('__fav', <span className="inline-flex items-center gap-1.5"><Star size={14} /> Favoris</span>)}
          {chip('', 'Tout')}
          {categories.map((c) => chip(c, c))}
        </div>
      </div>
      <div className={cx(fill && 'flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1 pb-2')}>
        {visible.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Aucun produit ne correspond.</p>}
        <div className={cx('grid gap-2', fill ? 'grid-cols-[repeat(auto-fill,minmax(132px,1fr))]' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4')}>
          {visible.map((a) => {
            const inTicket = counts?.get(a.id) ?? 0;
            const off = a.availability !== 'available';
            return (
              <button
                key={a.id}
                onClick={() => choose(a)}
                onContextMenu={(e) => {
                  if (onLongPress) {
                    e.preventDefault();
                    onLongPress(a);
                  }
                }}
                className={cx(
                  'relative rounded-xl border text-left transition active:scale-[0.97] overflow-hidden flex flex-col',
                  fill ? 'min-h-[150px]' : 'min-h-[84px] p-3',
                  off ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed' : inTicket ? 'border-emerald-500 ring-1 ring-emerald-500 bg-white' : 'border-gray-200 bg-white hover:border-emerald-400'
                )}
              >
                {fill && (
                  <span className="block aspect-[4/3] w-full shrink-0 overflow-hidden" style={a.imageUrl ? undefined : { background: toneOf(a.category) }}>
                    {a.imageUrl ? (
                      <img src={a.imageUrl} alt="" loading="lazy" decoding="async" className={cx('w-full h-full object-cover', off && 'grayscale opacity-60')} />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-2xl font-bold text-gray-700/70">{initials(a.name)}</span>
                    )}
                  </span>
                )}
                <span className={cx('flex flex-col flex-1', fill && 'px-2.5 py-2')}>
                  <span className="block text-sm font-semibold leading-tight line-clamp-2 pr-6">{a.name}</span>
                  <span className={cx('block mt-auto pt-1', off ? 'text-xs font-semibold' : 'text-sm font-bold text-emerald-700')}>{off ? 'Épuisé' : <Money mil={a.unitPriceMil} />}</span>
                </span>
                {inTicket > 0 && (
                  <span className="absolute top-2 right-2 min-w-[26px] h-[26px] px-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shadow" aria-label={`${inTicket} dans le ticket`}>
                    {inTicket}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {picking && (
        <OptionPicker
          article={picking}
          catalog={pricing}
          allowInstruction={allowInstruction}
          onCancel={() => setPicking(null)}
          onAdd={(line) => {
            onAdd(line);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
};

export const CartLines: React.FC<{ catalog: PosCatalog; lines: CartLineInput[]; onChange: (lines: CartLineInput[]) => void }> = ({ catalog, lines, onChange }) => {
  const pricing = useMemo(() => toPricingCatalog(catalog), [catalog]);
  if (lines.length === 0)
    return (
      <div className="py-8 text-center text-gray-400">
        <ShoppingCart size={28} className="mx-auto mb-2" />
        <p className="text-sm">Touchez un produit pour l’ajouter au ticket.</p>
      </div>
    );
  return (
    <ul className="divide-y divide-gray-100">
      {lines.map((l, i) => {
        let label = catalog.articles.find((a) => a.id === l.articleId)?.name ?? '?';
        let amount: number | null = null;
        let problem: string | null = null;
        try {
          const p = priceLine(l, pricing);
          label = p.displayName;
          amount = p.grossMil;
        } catch (err) {
          problem = (err as Error).message;
        }
        const setQty = (qty: number) => onChange(qty <= 0 ? lines.filter((_, j) => j !== i) : lines.map((x, j) => (j === i ? { ...x, quantity: Math.min(99, qty) } : x)));
        return (
          <li key={i} className="py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{label}</p>
              {l.instruction && <p className="text-xs text-gray-500 truncate">« {l.instruction} »</p>}
              {problem && <p className="text-xs text-red-600">{problem}</p>}
            </div>
            <div className="flex items-center gap-1">
              <button aria-label="Moins" onClick={() => setQty(l.quantity - 1)} className="w-11 h-11 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                <Minus size={14} />
              </button>
              <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
              <button aria-label="Plus" onClick={() => setQty(l.quantity + 1)} className="w-11 h-11 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                <Plus size={14} />
              </button>
            </div>
            <span className="w-24 text-right text-sm font-semibold">{amount !== null ? <Money mil={amount} /> : '—'}</span>
            <button aria-label="Retirer" onClick={() => setQty(0)} className="w-11 h-11 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50">
              <Trash2 size={15} />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
