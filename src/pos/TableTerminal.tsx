import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRightLeft, ClipboardList, Send, Zap } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { CartLineInput } from '../data/pricing';
import { computeCart } from '../data/pricing';
import { newIdempotencyKey, usePosEvents } from '../hooks/usePosEvents';
import { posApi, type FloorState, type VisitDetail } from './api';
import { addLine, CartLines, ProductGrid, toPricingCatalog } from './CartComposer';
import { withCache } from './offline';
import { PaymentPanel } from './PaymentPanel';
import { TableTransferModal } from './TableTransfer';
import { VisitPanel } from './VisitPanel';
import { Btn, cx, ErrorNote, Loading, Money, useAction, useLoader } from './ui';

// Click a table on the floor plan → the register terminal for that table (amélioration 02).
// Tabs switch between open tables; each tab keeps its own draft order until it is sent.

export const TableTerminal: React.FC<{ visitId: string; floor: FloorState | null; sessionId: string | null; registerId: string | null; onSwitch: (visitId: string) => void; onClose: () => void }> = ({
  visitId,
  floor,
  sessionId,
  registerId,
  onSwitch,
  onClose,
}) => {
  const { hasPermission } = useAuth();
  const catalog = useLoader(() => withCache('catalog', () => posApi.catalog()), []);
  const discounts = useLoader(() => withCache('discounts', () => posApi.discounts()), []);
  const visit = useLoader(() => posApi.visit(visitId), [visitId]);
  const [drafts, setDrafts] = useState<Record<string, CartLineInput[]>>({});
  const [urgent, setUrgent] = useState(false);
  const [orderKey, setOrderKey] = useState(newIdempotencyKey);
  const [panel, setPanel] = useState<'pay' | 'details' | 'transfer' | null>(null);
  const { busy, error, setError, run } = useAction();
  usePosEvents(['orders.changed', 'prep.changed', 'floor.changed'], () => void visit.reload(), 20_000);
  usePosEvents(['catalog.changed'], () => void catalog.reload());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !panel && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, onClose]);

  const lines = drafts[visitId] ?? [];
  const setLines = (next: CartLineInput[] | ((p: CartLineInput[]) => CartLineInput[])) =>
    setDrafts((d) => ({ ...d, [visitId]: typeof next === 'function' ? next(d[visitId] ?? []) : next }));

  const draftTotal = useMemo(() => {
    if (!catalog.data || lines.length === 0) return 0;
    try {
      return computeCart(lines, toPricingCatalog(catalog.data), discounts.data ?? [], { now: new Date() }).totalMil;
    } catch {
      return 0;
    }
  }, [catalog.data, discounts.data, lines]);

  const v: VisitDetail | null = visit.data;
  const openSale = v?.sales.find((s) => s.status === 'open') ?? null;
  const billLines = (openSale?.orders ?? []).filter((o) => o.status === 'validated').flatMap((o) => o.lines.filter((l) => l.status === 'active'));
  const tabs = (floor?.tables ?? []).filter((t) => t.accessible && t.visit?.status === 'open');

  const send = () =>
    run(async () => {
      if (!v || lines.length === 0) return;
      visit.setData(await posApi.staffOrder(v.id, lines, orderKey, urgent));
      setLines([]);
      setUrgent(false);
      setOrderKey(newIdempotencyKey());
    });

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
        <Btn variant="ghost" onClick={onClose} aria-label="Retour au plan de salle">
          <ArrowLeft size={16} /> Plan
        </Btn>
        <div className="flex gap-1.5 overflow-x-auto flex-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onSwitch(t.visit!.id)}
              className={cx('px-3 min-h-[40px] rounded-xl border text-sm font-semibold shrink-0 flex items-center gap-1.5', t.visit!.id === visitId ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-gray-200')}
            >
              {t.name}
              {(drafts[t.visit!.id]?.length ?? 0) > 0 && <span className="w-2 h-2 rounded-full bg-amber-400" title="Commande en cours de saisie" />}
              {t.billTotalMil > 0 && (
                <span className="text-[11px] font-normal opacity-80">
                  <Money mil={t.billTotalMil - t.billPaidMil} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <ErrorNote message={error ?? visit.error ?? catalog.error} onClose={() => setError(null)} />
      {!v || !catalog.data ? (
        <Loading />
      ) : (
        <div className="flex-1 min-h-0 grid lg:grid-cols-[1fr_400px]">
          <div className="overflow-y-auto p-3">
            <ProductGrid catalog={catalog.data} onAdd={(l) => setLines((p) => addLine(p, l))} />
          </div>
          <div className="bg-white border-l border-gray-200 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-lg font-bold">Table {v.table.name}</p>
              <p className="text-xs text-gray-500">
                {v.covers ? `${v.covers} couverts` : 'Couverts non renseignés'}
                {v.primaryWaiter ? ` · ${v.primaryWaiter}` : ''}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
              {billLines.length > 0 && (
                <div className="text-sm">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Déjà commandé</p>
                  {billLines.map((l) => (
                    <p key={l.id} className="flex justify-between text-gray-600">
                      <span>
                        {l.quantity} × {l.displayName}
                        {l.fireStatus === 'hold' ? ' (suite)' : ''}
                      </span>
                      <Money mil={l.totalMil} />
                    </p>
                  ))}
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Nouvelle commande</p>
                {lines.length === 0 ? <p className="text-sm text-gray-400 py-2">Touchez un produit pour l’ajouter.</p> : <CartLines catalog={catalog.data} lines={lines} onChange={setLines} />}
              </div>
            </div>
            <div className="border-t border-gray-100 p-3 space-y-2">
              {lines.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className={cx('flex items-center gap-1.5 text-sm font-semibold', urgent ? 'text-red-700' : 'text-gray-600')}>
                    <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> <Zap size={14} /> Urgent
                  </label>
                  <Btn variant="primary" className="flex-1" busy={busy} disabled={!hasPermission('orders:take')} onClick={send}>
                    <Send size={15} /> Envoyer · <Money mil={draftTotal} />
                  </Btn>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>Addition</span>
                <span>
                  <Money mil={openSale?.dueMil ?? 0} />
                  {openSale && openSale.paidMil > 0 && (
                    <span className="text-xs font-normal text-gray-500">
                      {' '}(réglé <Money mil={openSale.paidMil} />)
                    </span>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Btn onClick={() => setPanel('details')}>
                  <ClipboardList size={15} /> Détails
                </Btn>
                <Btn disabled={!hasPermission('tables:transfer')} onClick={() => setPanel('transfer')}>
                  <ArrowRightLeft size={15} /> Déplacer
                </Btn>
                <Btn variant="primary" disabled={!openSale || openSale.totalMil === 0 || !hasPermission('pos:collect') || lines.length > 0} onClick={() => setPanel('pay')}>
                  Encaisser
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
      {panel === 'pay' && openSale && (
        <PaymentPanel
          sale={openSale}
          sessionId={sessionId}
          registerId={registerId}
          onClose={() => {
            setPanel(null);
            void visit.reload();
          }}
        />
      )}
      {panel === 'details' && v && (
        <VisitPanel
          visitId={v.id}
          sessionId={sessionId}
          onClose={() => {
            setPanel(null);
            void visit.reload();
          }}
        />
      )}
      {panel === 'transfer' && v && (
        <TableTransferModal
          visit={v}
          onClose={() => setPanel(null)}
          onDone={(next) => {
            setPanel(null);
            setDrafts((d) => ({ ...d, [next.id]: [...(d[next.id] ?? []), ...(next.id !== v.id ? (d[v.id] ?? []) : [])] }));
            if (next.id !== v.id) onSwitch(next.id);
            else visit.setData(next);
          }}
        />
      )}
    </div>
  );
};
