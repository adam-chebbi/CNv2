import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, Printer, Ticket, UserRound, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { formatDt, parseDtInput } from '../data/money';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../data/cashSession';
import { newIdempotencyKey } from '../hooks/usePosEvents';
import { posApi, type CustomerSummary, type SaleDetail, type SalePart } from './api';
import { printDocument } from './ticket';
import { Badge, Btn, cx, ErrorNote, Field, inputCls, Modal, Money, useAction } from './ui';

// Addition partagée (amélioration 08): set up the parts (by item, equal shares, free amounts), then
// settle them one by one — each payer has their own receipt and, if identified, their own points.

const METHOD_ICON: Record<PaymentMethod, React.ComponentType<{ size?: number }>> = { cash: Banknote, card: CreditCard, voucher: Ticket };
const PAYER_COLORS = ['bg-sky-500', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-orange-500', 'bg-teal-500'];

export const SplitSetupModal: React.FC<{ sale: SaleDetail; onClose: () => void; onDone: (parts: SalePart[]) => void }> = ({ sale, onClose, onDone }) => {
  const [mode, setMode] = useState<'items' | 'equal' | 'amount'>('items');
  const [payers, setPayers] = useState(2);
  const [owner, setOwner] = useState<Record<string, number>>({});
  const [amounts, setAmounts] = useState<string[]>(['', '']);
  const { busy, error, run } = useAction();
  const lines = sale.orders.filter((o) => o.status === 'validated').flatMap((o) => o.lines.filter((l) => l.status === 'active'));
  const perPayer = Array.from({ length: payers }, (_, i) => lines.filter((l) => owner[l.id] === i).reduce((s, l) => s + l.totalMil, 0));
  const amountSum = amounts.reduce((s, a) => s + (parseDtInput(a) ?? 0), 0);

  const submit = () =>
    run(async () => {
      if (mode === 'equal') return onDone(await posApi.splitSale(sale.id, { mode, count: payers }));
      if (mode === 'amount') return onDone(await posApi.splitSale(sale.id, { mode, parts: amounts.map((a) => ({ amountMil: parseDtInput(a) ?? 0 })) }));
      const parts = Array.from({ length: payers }, (_, i) => ({ label: `Payeur ${i + 1}`, lineIds: lines.filter((l) => owner[l.id] === i).map((l) => l.id) })).filter((p) => p.lineIds.length > 0);
      onDone(await posApi.splitSale(sale.id, { mode, parts }));
    });

  const setPayerCount = (n: number) => {
    const count = Math.min(8, Math.max(2, n));
    setPayers(count);
    setAmounts((a) => Array.from({ length: count }, (_, i) => a[i] ?? ''));
    setOwner((o) => Object.fromEntries((Object.entries(o) as [string, number][]).filter(([, p]) => p < count)));
  };

  return (
    <Modal
      title={`Partager l’addition — ${formatDt(sale.totalMil)}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" busy={busy} disabled={(mode === 'amount' && amountSum !== sale.totalMil) || (mode === 'items' && Object.keys(owner).length === 0)} onClick={submit}>
            Partager
          </Btn>
        </>
      }
    >
      <ErrorNote message={error} />
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ['items', 'Par article'],
            ['equal', 'Parts égales'],
            ['amount', 'Montants libres'],
          ] as const
        ).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} className={cx('min-h-[44px] rounded-xl border text-sm font-semibold', mode === m ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200')}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Users size={16} /> Payeurs :
        <Btn size="sm" onClick={() => setPayerCount(payers - 1)}>−</Btn>
        <strong className="w-6 text-center">{payers}</strong>
        <Btn size="sm" onClick={() => setPayerCount(payers + 1)}>+</Btn>
      </div>
      {mode === 'items' && (
        <>
          <p className="text-xs text-gray-500">Touchez le payeur de chaque article. Les articles non attribués forment une dernière part « Reste ». Les remises de l’addition sont réparties au prorata.</p>
          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {lines.map((l) => (
              <li key={l.id} className="py-2 flex items-center gap-2 text-sm">
                <span className="flex-1">
                  {l.quantity} × {l.displayName} · <Money mil={l.totalMil} />
                </span>
                {Array.from({ length: payers }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setOwner((o) => (o[l.id] === i ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== l.id)) : { ...o, [l.id]: i }))}
                    className={cx('w-9 h-9 rounded-full text-xs font-bold border', owner[l.id] === i ? `${PAYER_COLORS[i]} text-white border-transparent` : 'border-gray-200 text-gray-600')}
                    aria-label={`Payeur ${i + 1}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 text-xs">
            {perPayer.map((v, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className={cx('w-2.5 h-2.5 rounded-full', PAYER_COLORS[i])} /> Payeur {i + 1} : <Money mil={v} />
              </span>
            ))}
          </div>
        </>
      )}
      {mode === 'equal' && <p className="text-sm">{payers} parts d’environ <Money mil={Math.floor(sale.totalMil / payers)} /> (arrondi au millime, l’écart sur les premières parts).</p>}
      {mode === 'amount' && (
        <div className="space-y-2">
          {amounts.map((a, i) => (
            <Field key={i} label={`Payeur ${i + 1} (DT)`}>
              <input className={inputCls} inputMode="decimal" value={a} onChange={(e) => setAmounts((x) => x.map((v, j) => (j === i ? e.target.value : v)))} />
            </Field>
          ))}
          <p className={cx('text-sm font-semibold', amountSum === sale.totalMil ? 'text-emerald-700' : 'text-amber-700')}>
            Total saisi <Money mil={amountSum} /> / <Money mil={sale.totalMil} />
          </p>
        </div>
      )}
    </Modal>
  );
};

const PayerSearch: React.FC<{ onPick: (c: CustomerSummary) => void }> = ({ onPick }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = window.setTimeout(() => void posApi.searchCustomers(q).then(setResults).catch(() => setResults([])), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  return (
    <div className="space-y-1">
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client fidélité : nom, e-mail, téléphone" />
      {results.slice(0, 5).map((c) => (
        <button key={c.id} onClick={() => { onPick(c); setQ(''); }} className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-gray-50">
          {c.firstName} {c.lastName} <span className="text-xs text-gray-500">{c.email}</span>
        </button>
      ))}
    </div>
  );
};

export const SplitPayView: React.FC<{ sale: SaleDetail; parts: SalePart[]; sessionId: string | null; onParts: (p: SalePart[]) => void; onSale: (s: SaleDetail) => void }> = ({ sale, parts, sessionId, onParts, onSale }) => {
  const { hasPermission } = useAuth();
  const [current, setCurrent] = useState(() => parts.find((p) => p.dueMil > 0)?.id ?? parts[0]?.id);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState('');
  const [payKey, setPayKey] = useState(newIdempotencyKey);
  const [change, setChange] = useState<number | null>(null);
  const { busy, error, run } = useAction();
  const part = parts.find((p) => p.id === current) ?? parts[0];
  const entered = parseDtInput(amount);
  const effective = entered ?? part?.dueMil ?? 0;
  const anyPaid = useMemo(() => parts.some((p) => p.paidMil > 0), [parts]);
  if (!part) return null;

  const pay = () =>
    run(async () => {
      if (!sessionId) throw new Error("Aucune session de caisse ouverte : ouvrez la caisse avant d'encaisser.");
      const res = await posApi.paySplit(sale.id, part.id, { sessionId, method, amountMil: effective }, payKey);
      setPayKey(newIdempotencyKey());
      setChange(res.payment.changeMil);
      setAmount('');
      onParts(res.splits);
      onSale(res.sale);
      const next = res.splits.find((p) => p.dueMil > 0);
      if (next && res.splits.find((p) => p.id === part.id)?.dueMil === 0) setCurrent(next.id);
    });

  return (
    <div className="space-y-3">
      <ErrorNote message={error} />
      <ul className="space-y-1.5">
        {parts.map((p) => (
          <li key={p.id}>
            <button onClick={() => { setCurrent(p.id); setChange(null); }} className={cx('w-full rounded-xl border px-3 py-2 flex items-center gap-2 text-sm text-left', p.id === part.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200')}>
              <span className="flex-1">
                <strong>Part {p.part}/{p.parts}</strong> {p.label && <span className="text-gray-600">· {p.label}</span>}
                {p.customerName && <span className="block text-xs text-violet-700">{p.customerName}</span>}
              </span>
              <Money mil={p.amountMil} className="font-semibold" />
              {p.dueMil === 0 ? <Badge tone="green">Réglée</Badge> : p.paidMil > 0 ? <Badge tone="amber">Reste {formatDt(p.dueMil)}</Badge> : null}
            </button>
          </li>
        ))}
      </ul>
      {change !== null && change > 0 && (
        <p className="text-xl font-bold text-emerald-700">
          Monnaie à rendre : <Money mil={change} />
        </p>
      )}
      {part.dueMil > 0 && sale.status === 'open' && (
        <>
          {!part.customerId && hasPermission('pos:collect') && <PayerSearch onPick={(c) => void run(async () => onParts(await posApi.setSplitCustomer(sale.id, part.id, c.id)))} />}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => {
              const Icon = METHOD_ICON[m];
              return (
                <button key={m} onClick={() => setMethod(m)} className={cx('min-h-[56px] rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-semibold', method === m ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200')}>
                  <Icon size={18} /> {PAYMENT_METHOD_LABELS[m]}
                </button>
              );
            })}
          </div>
          <Field label={method === 'cash' ? 'Montant reçu (DT)' : 'Montant (DT)'}>
            <input className={cx(inputCls, 'text-lg font-semibold')} inputMode="decimal" placeholder={formatDt(part.dueMil, false)} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Btn variant="primary" size="lg" className="w-full" busy={busy} disabled={!hasPermission('pos:collect') || effective <= 0} onClick={pay}>
            Encaisser la part {part.part} · <Money mil={method === 'cash' ? Math.min(effective, part.dueMil) : effective} />
          </Btn>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Btn size="sm" busy={busy} onClick={() => run(async () => printDocument(await posApi.splitReceipt(sale.id, part.id)))}>
          <Printer size={14} /> Ticket de la part {part.part}
        </Btn>
        {part.customerId && <Badge tone="violet"><UserRound size={12} /> Points sur cette part</Badge>}
        {!anyPaid && sale.status === 'open' && (
          <Btn size="sm" variant="ghost" busy={busy} onClick={() => run(async () => onParts(await posApi.unsplitSale(sale.id)))}>
            Annuler le partage
          </Btn>
        )}
      </div>
    </div>
  );
};
