import React, { useMemo, useState } from 'react';
import { Minus, Plus, Search, Trash2 } from 'lucide-react';
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

const OptionPicker: React.FC<{ article: PricedArticle; catalog: PricingCatalog; onCancel: () => void; onAdd: (line: CartLineInput) => void; allowInstruction: boolean }> = ({
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

export const ProductGrid: React.FC<{
  catalog: PosCatalog;
  onAdd: (line: CartLineInput) => void;
  allowInstruction?: boolean;
  onLongPress?: (article: PricedArticle) => void;
}> = ({ catalog, onAdd, allowInstruction = true, onLongPress }) => {
  const pricing = useMemo(() => toPricingCatalog(catalog), [catalog]);
  const [category, setCategory] = useState<string>('');
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<PricedArticle | null>(null);
  const categories = catalog.categories.filter((c) => catalog.articles.some((a) => a.category === c));
  const q = query.trim().toLowerCase();
  const visible = catalog.articles.filter((a) => (q ? a.name.toLowerCase().includes(q) : !category || a.category === category));

  const choose = (a: PricedArticle) => {
    if (a.availability !== 'available') return;
    // Products without options go straight to the cart; the others open the option picker.
    if (a.variants.length === 0 && a.extraIds.length === 0) onAdd({ articleId: a.id, quantity: 1 });
    else setPicking(a);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className={cx(inputCls, 'pl-9')} placeholder="Rechercher un produit…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {!q && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setCategory('')} className={cx('shrink-0 px-3 min-h-[40px] rounded-full text-sm font-semibold border', !category ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200')}>
            Tout
          </button>
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={cx('shrink-0 px-3 min-h-[40px] rounded-full text-sm font-semibold border', category === c ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200')}>
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
        {visible.map((a) => (
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
              'min-h-[76px] rounded-xl border p-3 text-left transition active:scale-[0.98]',
              a.availability === 'available' ? 'border-gray-200 bg-white hover:border-emerald-400' : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
            )}
          >
            <span className="block text-sm font-semibold leading-tight">{a.name}</span>
            <span className="block text-xs mt-1">{a.availability === 'available' ? <Money mil={a.unitPriceMil} /> : 'Épuisé'}</span>
          </button>
        ))}
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
  if (lines.length === 0) return <p className="text-sm text-gray-400 py-6 text-center">Aucun article.</p>;
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
              <button aria-label="Moins" onClick={() => setQty(l.quantity - 1)} className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center">
                <Minus size={14} />
              </button>
              <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
              <button aria-label="Plus" onClick={() => setQty(l.quantity + 1)} className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center">
                <Plus size={14} />
              </button>
            </div>
            <span className="w-24 text-right text-sm font-semibold">{amount !== null ? <Money mil={amount} /> : '—'}</span>
            <button aria-label="Retirer" onClick={() => setQty(0)} className="p-2 text-gray-400 hover:text-red-600">
              <Trash2 size={15} />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
