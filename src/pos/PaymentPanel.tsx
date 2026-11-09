import React, { useEffect, useMemo, useState } from 'react';
import { BadgePercent, Banknote, CreditCard, Gift, Printer, Split, Ticket, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { changeDue } from '../data/pricing';
import { CASH_STEP_MILLIMES, formatDt, parseDtInput } from '../data/money';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../data/cashSession';
import { newIdempotencyKey } from '../hooks/usePosEvents';
import { posApi, type CustomerSummary, type SaleDetail, type SalePart } from './api';
import { SplitPayView, SplitSetupModal } from './SplitBill';
import { printBill, printTicket } from './ticket';
import { Badge, Btn, cx, ErrorNote, Field, inputCls, Modal, Money, useAction } from './ui';

// Encaissement d'une vente ou d'une addition (cahier des charges §2.5): one or several payments,
// change for cash, manual discount within the ceiling, customer identification and rewards. The
// sale is declared settled only when the payments cover the total.

const METHOD_ICON: Record<PaymentMethod, React.ComponentType<{ size?: number }>> = { cash: Banknote, card: CreditCard, voucher: Ticket };

const CustomerBox: React.FC<{ sale: SaleDetail; onChange: (s: SaleDetail) => void }> = ({ sale, onChange }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [confirming, setConfirming] = useState<CustomerSummary | null>(null);
  const [rewards, setRewards] = useState<Awaited<ReturnType<typeof posApi.saleRewards>> | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (sale.customerId) void posApi.saleRewards(sale.id).then(setRewards).catch(() => setRewards(null));
    else setRewards(null);
  }, [sale.id, sale.customerId, sale.totalMil]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => void posApi.searchCustomers(q).then(setResults).catch(() => setResults([])), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  if (sale.status !== 'open') return null;
  return (
    <div className="rounded-xl border border-gray-100 p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
        <UserRound size={14} /> Client fidèle
      </p>
      <ErrorNote message={error} />
      {sale.customerId ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Badge tone="green">Client identifié · {rewards?.available ?? '…'} points</Badge>
            {sale.paidMil === 0 && (
              <Btn size="sm" variant="ghost" busy={busy} onClick={() => run(async () => onChange(await posApi.setSaleCustomer(sale.id, null)))}>
                Retirer
              </Btn>
            )}
          </div>
          {rewards && rewards.rewards.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {rewards.rewards.map((r) => (
                <Btn
                  key={r.id}
                  size="sm"
                  variant={r.applied ? 'primary' : 'secondary'}
                  disabled={sale.paidMil > 0 || (!r.applied && rewards.available < r.pointsCost)}
                  busy={busy}
                  onClick={() => run(async () => onChange(r.applied ? await posApi.removeReward(sale.id, r.id) : await posApi.applyReward(sale.id, r.id)))}
                >
                  <Gift size={13} /> {r.name} ({r.pointsCost} pts)
                </Btn>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <input className={inputCls} placeholder="Téléphone, email ou nom…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {results.map((c) => (
            <button key={c.id} onClick={() => setConfirming(c)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">
              {c.firstName} {c.lastName} <span className="text-gray-500">· {c.phone ?? c.email}</span>
            </button>
          ))}
        </>
      )}
      {confirming && (
        <Modal
          title="Confirmation du client"
          onClose={() => setConfirming(null)}
          footer={
            <>
              <Btn onClick={() => setConfirming(null)}>Annuler</Btn>
              <Btn
                variant="primary"
                busy={busy}
                onClick={() =>
                  run(async () => {
                    onChange(await posApi.setSaleCustomer(sale.id, confirming.id));
                    setConfirming(null);
                    setQuery('');
                  })
                }
              >
                Le client confirme
              </Btn>
            </>
          }
        >
          <p className="text-sm">
            Demandez au client de confirmer qu'il s'agit bien de son compte : <strong>{confirming.firstName} {confirming.lastName}</strong> ({confirming.phone ?? confirming.email}).
          </p>
        </Modal>
      )}
    </div>
  );
};

const DiscountBox: React.FC<{ sale: SaleDetail; onChange: (s: SaleDetail) => void }> = ({ sale, onChange }) => {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  if (sale.status !== 'open' || sale.paidMil > 0) return null;
  const parsed = kind === 'percent' ? Math.round(Number(value.replace(',', '.')) * 100) : parseDtInput(value) ?? 0;
  return (
    <>
      <Btn size="sm" onClick={() => setOpen(true)}>
        <BadgePercent size={14} /> {sale.manualDiscount ? 'Modifier la remise' : 'Remise'}
      </Btn>
      {open && (
        <Modal
          title="Remise manuelle"
          onClose={() => setOpen(false)}
          footer={
            <>
              {sale.manualDiscount && (
                <Btn variant="ghost" busy={busy} onClick={() => run(async () => { onChange(await posApi.manualDiscount(sale.id, null)); setOpen(false); })}>
                  Retirer la remise
                </Btn>
              )}
              <Btn
                variant="primary"
                busy={busy}
                disabled={!parsed || parsed <= 0 || !reason.trim()}
                onClick={() => run(async () => { onChange(await posApi.manualDiscount(sale.id, { kind, value: parsed, reason: reason.trim() })); setOpen(false); })}
              >
                Appliquer
              </Btn>
            </>
          }
        >
          <ErrorNote message={error} />
          <div className="grid grid-cols-2 gap-2">
            {(['percent', 'fixed'] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={cx('min-h-[44px] rounded-xl border text-sm font-semibold', kind === k ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200')}>
                {k === 'percent' ? 'Pourcentage' : 'Montant'}
              </button>
            ))}
          </div>
          <Field label={kind === 'percent' ? 'Pourcentage (%)' : 'Montant (DT)'}>
            <input className={inputCls} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Motif (obligatoire)">
            <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. client habitué, attente" />
          </Field>
        </Modal>
      )}
    </>
  );
};

export const PaymentPanel: React.FC<{ sale: SaleDetail; sessionId: string | null; registerId?: string | null; onClose: () => void; onUpdated?: (s: SaleDetail) => void }> = ({ sale: initial, sessionId, registerId, onClose, onUpdated }) => {
  const { hasPermission } = useAuth();
  const [sale, setSale] = useState(initial);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState('');
  const [lastChange, setLastChange] = useState<number | null>(null);
  const [payKey, setPayKey] = useState(newIdempotencyKey);
  const [printed, setPrinted] = useState(initial.printCount > 0);
  const [parts, setParts] = useState<SalePart[]>([]);
  const [splitting, setSplitting] = useState(false);
  const { busy, error, run } = useAction();
  useEffect(() => {
    void posApi.saleSplits(initial.id).then(setParts).catch(() => setParts([]));
  }, [initial.id]);

  const update = (s: SaleDetail) => {
    setSale(s);
    onUpdated?.(s);
  };

  // Customer display (amélioration 07): what is due, what was paid, the change.
  useEffect(() => {
    if (!registerId) return;
    const lines = sale.orders.filter((o) => o.status === 'validated').flatMap((o) => o.lines.filter((l) => l.status === 'active')).map((l) => ({ name: l.displayName, quantity: l.quantity, totalMil: l.totalMil }));
    void posApi
      .publishDisplay(registerId, {
        mode: sale.status === 'completed' ? 'thanks' : 'payment',
        lines,
        discountMil: sale.discountMil,
        totalMil: sale.totalMil,
        paidMil: sale.paidMil,
        dueMil: sale.dueMil,
        changeMil: lastChange ?? 0,
        pickupNumber: sale.pickupNumber ?? null,
      })
      .catch(() => undefined);
  }, [sale, lastChange, registerId]);
  const entered = parseDtInput(amount);
  const due = sale.dueMil;
  const effective = entered ?? due;
  const previewChange = method === 'cash' && entered !== null ? changeDue(due, entered) : 0;
  const quick = useMemo(() => {
    const roundUp = (step: number) => Math.ceil(due / step) * step;
    return [...new Set([due, roundUp(CASH_STEP_MILLIMES * 20), roundUp(5000), roundUp(10_000), roundUp(20_000), 50_000].filter((v) => v >= due && v > 0))].slice(0, 5);
  }, [due]);

  const pay = () =>
    run(async () => {
      if (!sessionId) throw new Error("Aucune session de caisse ouverte : ouvrez la caisse avant d'encaisser.");
      const res = await posApi.pay(sale.id, { sessionId, method, amountMil: effective }, payKey);
      setPayKey(newIdempotencyKey());
      setLastChange(res.payment.changeMil);
      setAmount('');
      update(res.sale);
    });

  const print = () =>
    run(async () => {
      const res = await posApi.print(sale.id);
      update(res.sale);
      setPrinted(true);
      // Printed by the register printer through the print agent, or here through the browser.
      if (!res.queued) await printTicket(res.sale, res.duplicateNumber);
    });

  const lines = sale.orders.filter((o) => o.status === 'validated').flatMap((o) => o.lines.filter((l) => l.status === 'active'));

  return (
    <Modal title={sale.status === 'completed' ? `Ticket ${sale.ticketNumber}` : sale.tableName ? `Addition — ${sale.tableName}` : 'Encaissement'} onClose={onClose} wide>
      <ErrorNote message={error} />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <ul className="text-sm divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {lines.map((l) => (
              <li key={l.id} className="py-1.5 flex justify-between gap-2">
                <span>
                  {l.quantity} × {l.displayName}
                  {l.itemDiscounts.map((d) => (
                    <span key={d.label} className="block text-xs text-emerald-700">{d.label} −<Money mil={d.amountMil} /></span>
                  ))}
                </span>
                <Money mil={l.grossMil} className="font-medium" />
              </li>
            ))}
          </ul>
          {sale.ticketDiscounts.map((d) => (
            <p key={d.label} className="text-sm text-emerald-700 flex justify-between">
              <span>{d.label}</span> <span>−<Money mil={d.amountMil} /></span>
            </p>
          ))}
          <div className="border-t border-gray-200 pt-2 space-y-1 text-sm">
            <p className="flex justify-between text-base font-bold"><span>Total</span> <Money mil={sale.totalMil} /></p>
            <p className="flex justify-between text-gray-600"><span>Déjà réglé</span> <Money mil={sale.paidMil} /></p>
            <p className={cx('flex justify-between font-semibold', due > 0 ? 'text-amber-700' : 'text-emerald-700')}>
              <span>Reste à régler</span> <Money mil={due} />
            </p>
          </div>
          {sale.payments.length > 0 && (
            <ul className="text-xs text-gray-500 space-y-0.5">
              {sale.payments.map((p) => (
                <li key={p.id}>
                  {PAYMENT_METHOD_LABELS[p.method]} {formatDt(p.amountMil)}
                  {p.changeMil > 0 && ` (rendu ${formatDt(p.changeMil)})`}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          {sale.status === 'completed' ? (
            <div className="space-y-3 text-center py-4">
              <p className="text-emerald-700 font-bold text-lg">Vente réglée</p>
              {lastChange !== null && lastChange > 0 && (
                <p className="text-2xl font-bold">
                  Monnaie à rendre : <Money mil={lastChange} />
                </p>
              )}
              <Btn variant="primary" size="lg" onClick={print} busy={busy} disabled={printed && !hasPermission('pos:reprint')}>
                <Printer size={18} /> {printed ? 'Réimprimer (duplicata)' : 'Imprimer le ticket'}
              </Btn>
              <Btn onClick={onClose}>Terminé</Btn>
            </div>
          ) : parts.length > 0 ? (
            <SplitPayView sale={sale} parts={parts} sessionId={sessionId} onParts={setParts} onSale={update} />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => {
                  const Icon = METHOD_ICON[m];
                  return (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={cx('min-h-[64px] rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-semibold', method === m ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200')}
                    >
                      <Icon size={20} /> {PAYMENT_METHOD_LABELS[m]}
                    </button>
                  );
                })}
              </div>
              <Field label={method === 'cash' ? 'Montant reçu (DT)' : 'Montant (DT)'} hint={method === 'card' ? 'Saisie manuelle : le TPE n’est pas relié au logiciel.' : undefined}>
                <input className={cx(inputCls, 'text-lg font-semibold')} inputMode="decimal" placeholder={formatDt(due, false)} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              {method === 'cash' && (
                <div className="flex flex-wrap gap-2">
                  {quick.map((v) => (
                    <Btn key={v} size="sm" onClick={() => setAmount(formatDt(v, false))}>
                      <Money mil={v} />
                    </Btn>
                  ))}
                </div>
              )}
              {method === 'cash' && previewChange > 0 && (
                <p className="text-lg font-bold text-emerald-700">
                  Monnaie à rendre : <Money mil={previewChange} />
                </p>
              )}
              <Btn variant="primary" size="lg" className="w-full" busy={busy} disabled={!hasPermission('pos:collect') || effective <= 0} onClick={pay}>
                Encaisser <Money mil={method === 'cash' ? Math.min(effective, due) : effective} />
              </Btn>
              <div className="flex flex-wrap gap-2">
                {hasPermission('pos:discount') && <DiscountBox sale={sale} onChange={update} />}
                <Btn size="sm" busy={busy} onClick={() => run(async () => { const r = await posApi.printBill(sale.id, registerId ?? null, sessionId); if (!r.queued) await printBill(sale); })}>
                  <Printer size={14} /> Imprimer l'addition
                </Btn>
                {sale.paidMil === 0 && sale.totalMil > 0 && hasPermission('pos:collect') && (
                  <Btn size="sm" onClick={() => setSplitting(true)}>
                    <Split size={14} /> Partager l'addition
                  </Btn>
                )}
              </div>
              <CustomerBox sale={sale} onChange={update} />
            </>
          )}
        </div>
      </div>
      {splitting && (
        <SplitSetupModal
          sale={sale}
          onClose={() => setSplitting(false)}
          onDone={(p) => {
            setParts(p);
            setSplitting(false);
          }}
        />
      )}
    </Modal>
  );
};
