import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRightLeft, Banknote, Bell, ChevronUp, ClipboardList, Hand, KeyRound, Merge, MoreHorizontal, Printer, Receipt, RotateCcw, Send, ShoppingBag, Split, Trash2, Users, Utensils, X, Zap,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import type { PosSettings } from '../../data/posSettings';
import type { CartLineInput, DiscountRule } from '../../data/pricing';
import { computeCart } from '../../data/pricing';
import { newIdempotencyKey, usePosEvents } from '../../hooks/usePosEvents';
import { posApi, type CashSessionDetail, type OrderLine, type PosCatalog, type SaleDetail } from '../api';
import { addLine, CartLines, ProductGrid, toPricingCatalog } from '../CartComposer';
import { PREP_LABELS, PREP_TONES } from '../labels';
import { isNetworkError } from '../offline';
import { OfflineSaleModal } from '../OfflineRegister';
import { PaymentPanel } from '../PaymentPanel';
import { TableTransferModal } from '../TableTransfer';
import { printBill } from '../ticket';
import { PendingOrder, VisitPanel } from '../VisitPanel';
import { Badge, Btn, cx, elapsed, ErrorNote, Loading, Modal, Money, time, useAction, useLoader, useNow } from '../ui';

// Caisse — screen B: products on the left (the only part that scrolls), the ticket on the right,
// main buttons fixed at the bottom. Same screen for a table and for the comptoir (takeaway).

export type OrderTarget = { kind: 'counter' } | { kind: 'table'; visitId: string; justOpened?: boolean; menu?: boolean };

interface Props {
  target: OrderTarget;
  catalog: PosCatalog;
  discounts: DiscountRule[];
  favorites: string[];
  session: CashSessionDetail | null;
  settings: PosSettings | null;
  onBack: (toast?: string) => void;
  onSessionChanged: () => void;
}

// --- Drafts kept on the device (comptoir and each table) ---------------------------------------

type Draft = { lines: CartLineInput[]; serviceType: 'dine_in' | 'takeaway' };
const draftKey = (t: OrderTarget) => (t.kind === 'counter' ? 'cn_register_draft' : `cn_table_draft:${t.visitId}`);
const readDraft = (t: OrderTarget): Draft => {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(t)) ?? 'null') as Draft | null;
    if (d && Array.isArray(d.lines)) return { lines: d.lines, serviceType: d.serviceType === 'dine_in' ? 'dine_in' : 'takeaway' };
  } catch {
    /* unreadable: start empty */
  }
  return { lines: [], serviceType: 'takeaway' };
};
const writeDraft = (t: OrderTarget, d: Draft): void => {
  try {
    if (d.lines.length === 0) localStorage.removeItem(draftKey(t));
    else localStorage.setItem(draftKey(t), JSON.stringify(d));
  } catch {
    /* private mode */
  }
};
const LAST_KEY = 'cn_register_last';
const toInput = (l: OrderLine): CartLineInput => ({ articleId: l.articleId, quantity: l.quantity, variantId: l.variant?.id, extraIds: l.extras.map((e) => e.id), instruction: l.instruction ?? undefined });

export const OrderScreen: React.FC<Props> = ({ target, catalog, discounts, favorites, session, settings, onBack, onSessionChanged }) => {
  const { hasPermission } = useAuth();
  const isTable = target.kind === 'table';
  const [lines, setLinesState] = useState<CartLineInput[]>(() => readDraft(target).lines);
  const [serviceType, setServiceType] = useState<'dine_in' | 'takeaway'>(() => readDraft(target).serviceType);
  useEffect(() => writeDraft(target, { lines, serviceType }), [lines, serviceType]); // eslint-disable-line react-hooks/exhaustive-deps
  const setLines = (next: CartLineInput[] | ((p: CartLineInput[]) => CartLineInput[])) => setLinesState(next);
  const [pendingQty, setPendingQty] = useState(0);
  const add = (l: CartLineInput) => {
    setLines((p) => addLine(p, l));
    setPendingQty(0);
  };
  const [saleKey, setSaleKey] = useState(newIdempotencyKey);
  const [paying, setPaying] = useState<SaleDetail | null>(null);
  const [offline, setOffline] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [panel, setPanel] = useState<null | 'details' | 'transfer' | 'merge' | 'fork' | 'menu'>(isTable && target.menu ? 'menu' : null);
  const [codeBanner, setCodeBanner] = useState(isTable && Boolean(target.justOpened));
  const [urgent, setUrgent] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = useNow();
  const { busy, error, setError, run } = useAction();

  // Table: the visit, its sends and requests, live.
  const visit = useLoader(() => (isTable ? posApi.visit(target.visitId) : Promise.resolve(null)), [isTable ? target.visitId : 'counter']);
  usePosEvents(['orders.changed', 'prep.changed', 'floor.changed', 'actions.changed'], () => isTable && void visit.reload(), 20_000);
  const actions = useLoader(() => (isTable && hasPermission('actions:view') ? posApi.actions() : Promise.resolve([])), [isTable ? target.visitId : 'counter']);
  usePosEvents(['actions.changed'], () => isTable && void actions.reload());
  const v = visit.data;
  useEffect(() => {
    if (v && v.status === 'closed') onBack(`Table ${v.table.name} libérée.`);
  }, [v?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const openSale = v?.sales.find((s) => s.status === 'open') ?? null;
  const sends = (openSale?.orders ?? []).filter((o) => o.status === 'validated');
  const requests = (actions.data ?? []).filter((a) => v && a.tableId === v.table.id && (a.kind === 'call_waiter' || a.kind === 'bill'));

  const pricing = useMemo(() => toPricingCatalog(catalog), [catalog]);
  const preview = useMemo(() => {
    if (lines.length === 0) return null;
    try {
      return computeCart(lines, pricing, discounts, { now: new Date() });
    } catch {
      return null;
    }
  }, [lines, pricing, discounts]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    lines.forEach((l) => m.set(l.articleId, (m.get(l.articleId) ?? 0) + l.quantity));
    return m;
  }, [lines]);

  // Customer display next to the register mirrors the comptoir cart (amélioration 07).
  const registerId = session?.registerId ?? null;
  useEffect(() => {
    if (isTable || !registerId || paying) return;
    const t = window.setTimeout(() => {
      const state = preview
        ? { mode: 'cart', lines: preview.lines.map((l) => ({ name: l.displayName, quantity: l.quantity, totalMil: l.totalMil })), discountMil: preview.discountMil, totalMil: preview.totalMil }
        : { mode: 'idle' };
      void posApi.publishDisplay(registerId, state).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(t);
  }, [preview, registerId, paying, isTable]);

  // --- Actions ------------------------------------------------------------------------------------

  const payCounter = () =>
    run(async () => {
      if (!session) throw new Error('Ouvrez la caisse avant d’encaisser.');
      if (lines.length === 0) return;
      if (!navigator.onLine) return setOffline(true);
      try {
        const sale = await posApi.counterSale({ sessionId: session.id, serviceType, lines }, saleKey);
        try {
          localStorage.setItem(LAST_KEY, JSON.stringify(lines));
        } catch {
          /* not kept */
        }
        setLines([]);
        setSaleKey(newIdempotencyKey());
        setPaying(sale);
      } catch (err) {
        if (isNetworkError(err)) setOffline(true);
        else throw err;
      }
    });

  const send = () =>
    run(async () => {
      if (!v || lines.length === 0) return;
      const n = lines.reduce((s, l) => s + l.quantity, 0);
      visit.setData(await posApi.staffOrder(v.id, lines, saleKey, urgent));
      setLines([]);
      setUrgent(false);
      setSaleKey(newIdempotencyKey());
      if (settings?.returnToPlanAfterSend ?? true) onBack(`Envoyé en préparation — ${n} article${n > 1 ? 's' : ''} pour ${v.table.name}.`);
    });

  const payTable = () => {
    if (!openSale) return;
    if (!session) return setError('Ouvrez la caisse avant d’encaisser.');
    setPaying(openSale);
  };

  const encaisser = () => (isTable ? payTable() : void payCounter());
  const canPayTable = Boolean(openSale && openSale.dueMil > 0 && lines.length === 0 && hasPermission('pos:collect'));

  const lastOrder = (() => {
    try {
      return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as CartLineInput[] | null;
    } catch {
      return null;
    }
  })();
  const lastRound = [...sends].reverse().find((o) => o.channel !== 'qr' && o.lines.some((l) => l.status === 'active'));

  const toggleAvailability = (articleId: string, current: string) =>
    run(async () => {
      if (!window.confirm(current === 'available' ? 'Marquer ce produit comme épuisé ?' : 'Remettre ce produit en vente ?')) return;
      await posApi.setArticle(articleId, { availability: current === 'available' ? 'unavailable' : 'available' });
    });

  // Keyboard: F1/Échap plan, F2 search, F8 encaisser, a digit before a product = quantity.
  const keys = useRef({ encaisser, back: () => onBack() });
  keys.current = { encaisser, back: () => onBack() };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paying || document.querySelector('[role="dialog"]')) return;
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName);
      if (e.key === 'F1' || (e.key === 'Escape' && !inField)) {
        e.preventDefault();
        keys.current.back();
      } else if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'F8' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        keys.current.encaisser();
      } else if (!inField && /^[1-9]$/.test(e.key)) {
        setPendingQty((q) => Math.min(99, q * 10 + Number(e.key)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paying]);

  if (isTable && !v) return <div className="flex-1 flex items-center justify-center">{visit.error ? <ErrorNote message={visit.error} /> : <Loading />}</div>;

  const title = isTable && v ? `Table ${v.table.name}` : 'Comptoir';
  const subtitle = isTable && v ? [v.covers ? `${v.covers} couvert${v.covers > 1 ? 's' : ''}` : 'Couverts à saisir', elapsed(v.openedAt, now), v.primaryWaiter].filter(Boolean).join(' · ') : serviceType === 'takeaway' ? 'À emporter' : 'Sur place';
  const total = (openSale?.dueMil ?? 0) + (preview?.totalMil ?? 0);

  // --- Ticket pane -----------------------------------------------------------------------------------

  const ticket = (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold truncate">{title}</p>
          <p className="text-xs text-gray-500 truncate">{subtitle}</p>
        </div>
        {isTable && (
          <Btn variant="ghost" onClick={() => setPanel('menu')} aria-label="Menu de la table">
            <MoreHorizontal size={18} />
          </Btn>
        )}
        <button onClick={() => setSheet(false)} className="lg:hidden w-11 h-11 rounded-lg flex items-center justify-center text-gray-500" aria-label="Fermer le ticket">
          <X size={18} />
        </button>
      </div>

      {!isTable && (
        <div className="grid grid-cols-2 gap-2 px-4 pt-3 shrink-0">
          {(['takeaway', 'dine_in'] as const).map((t) => (
            <button key={t} onClick={() => setServiceType(t)} className={cx('min-h-[44px] rounded-xl border text-sm font-semibold flex items-center justify-center gap-2', serviceType === t ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200')}>
              {t === 'takeaway' ? <ShoppingBag size={16} /> : <Utensils size={16} />} {t === 'takeaway' ? 'À emporter' : 'Sur place'}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-3">
        {codeBanner && v?.joinCode && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-3">
            <KeyRound size={18} className="text-emerald-700 shrink-0" />
            <p className="flex-1 text-sm text-emerald-900">
              Code pour commander au téléphone : <strong className="text-xl tracking-[0.25em]">{v.joinCode}</strong>
            </p>
            <button onClick={() => setCodeBanner(false)} aria-label="Masquer" className="w-9 h-9 flex items-center justify-center text-emerald-700"><X size={16} /></button>
          </div>
        )}
        {requests.map((r) => (
          <div key={r.id} className={cx('rounded-xl border p-3 flex flex-wrap items-center gap-2', r.kind === 'call_waiter' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200')}>
            {r.kind === 'call_waiter' ? <Bell size={18} className="text-red-600" /> : <Receipt size={18} className="text-yellow-700" />}
            <p className="flex-1 text-sm font-semibold">
              {r.kind === 'call_waiter' ? 'Appel serveur' : 'Addition demandée'} · il y a {elapsed(r.createdAt, now)}
            </p>
            {r.status === 'open' && <Btn size="sm" busy={busy} onClick={() => run(async () => { await posApi.takeRequest(r.refId); await actions.reload(); })}><Hand size={14} /> J’y vais</Btn>}
            <Btn size="sm" variant="primary" busy={busy} onClick={() => run(async () => { await posApi.doneRequest(r.refId); await actions.reload(); })}>Fait</Btn>
          </div>
        ))}
        {v?.pendingOrders.map((o) => <PendingOrder key={o.id} order={o} onChanged={() => void visit.reload()} />)}

        {sends.map((o, i) => (
          <div key={o.id}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
              Envoi {i + 1} · {time(o.createdAt)} {o.channel === 'qr' ? '· téléphone' : ''}
            </p>
            <ul className="space-y-1">
              {o.lines.map((l) => (
                <li key={l.id} className={cx('flex items-center gap-2 text-sm', l.status !== 'active' && 'line-through text-gray-400')}>
                  <span className="w-6 text-right font-semibold">{l.quantity}</span>
                  <span className="flex-1 min-w-0 truncate">{l.displayName}</span>
                  {l.status === 'active' && (l.fireStatus === 'hold' ? <Badge tone="violet">Suite</Badge> : l.prepStatus !== 'none' && <Badge tone={PREP_TONES[l.prepStatus]}>{PREP_LABELS[l.prepStatus]}</Badge>)}
                  <Money mil={l.totalMil} className="w-16 text-right tabular-nums" />
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          {isTable && (sends.length > 0 || lines.length > 0) && <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">Nouveau</p>}
          <CartLines catalog={catalog} lines={lines} onChange={setLines} />
          {lines.length === 0 && !isTable && lastOrder && lastOrder.length > 0 && (
            <Btn size="sm" variant="ghost" className="w-full" onClick={() => setLines(lastOrder)}>
              <RotateCcw size={14} /> Refaire la dernière commande
            </Btn>
          )}
          {lines.length === 0 && isTable && lastRound && hasPermission('orders:take') && (
            <Btn size="sm" variant="ghost" className="w-full" onClick={() => setLines(lastRound.lines.filter((l) => l.status === 'active').map(toInput))}>
              <RotateCcw size={14} /> Encore une tournée (comme l’envoi {sends.indexOf(lastRound) + 1})
            </Btn>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 p-3 space-y-2 shrink-0">
        {preview && preview.discountMil > 0 && (
          <p className="flex justify-between text-sm text-emerald-700"><span>Réductions</span><span>−<Money mil={preview.discountMil} /></span></p>
        )}
        {isTable && openSale && openSale.paidMil > 0 && (
          <p className="flex justify-between text-sm text-gray-600"><span>Déjà réglé</span><Money mil={openSale.paidMil} /></p>
        )}
        <p className="flex justify-between items-baseline">
          <span className="text-sm font-semibold text-gray-600">{isTable ? 'À régler' : 'Total'}</span>
          <span className="text-3xl font-extrabold tabular-nums"><Money mil={total} /></span>
        </p>
        {isTable ? (
          <>
            {lines.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => setUrgent(!urgent)} className={cx('min-h-[52px] px-3 rounded-xl border text-sm font-semibold flex items-center gap-1.5', urgent ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600')} aria-pressed={urgent}>
                  <Zap size={15} /> Urgent
                </button>
                <Btn variant="primary" size="lg" className="flex-1" busy={busy} disabled={!hasPermission('orders:take')} onClick={send}>
                  <Send size={18} /> Envoyer en préparation
                </Btn>
              </div>
            )}
            {lines.length === 0 && (
              <Btn variant="primary" size="lg" className="w-full" disabled={!canPayTable} onClick={payTable}>
                <Banknote size={20} /> Encaisser <Money mil={openSale?.dueMil ?? 0} />
                <kbd className="hidden lg:inline ml-1 px-1.5 rounded bg-white/20 text-[11px] font-mono">F8</kbd>
              </Btn>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Btn size="sm" disabled={!openSale || openSale.totalMil === 0} busy={busy} onClick={() => run(async () => { const r = await posApi.printBill(openSale!.id, registerId, session?.id ?? null); if (!r.queued) await printBill(openSale!, r.document); })}>
                <Printer size={14} /> Addition
              </Btn>
              <Btn size="sm" disabled={!openSale || openSale.totalMil === 0 || !hasPermission('pos:collect')} onClick={payTable}>
                <Split size={14} /> Partager
              </Btn>
              <Btn size="sm" onClick={() => setPanel('details')}>
                <ClipboardList size={14} /> Détails
              </Btn>
            </div>
          </>
        ) : (
          <>
            <Btn variant="primary" size="lg" className="w-full" busy={busy} disabled={lines.length === 0 || !hasPermission('pos:sell')} onClick={() => void payCounter()}>
              <Banknote size={20} /> Encaisser {preview && <Money mil={preview.totalMil} />}
              <kbd className="hidden lg:inline ml-1 px-1.5 rounded bg-white/20 text-[11px] font-mono">F8</kbd>
            </Btn>
            {lines.length > 0 && (
              <Btn size="sm" variant="ghost" className="w-full" onClick={() => setLines([])}>
                <Trash2 size={14} /> Vider le ticket
              </Btn>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Products */}
      <div className="flex-1 min-w-0 flex flex-col p-3 gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <Btn onClick={() => onBack()} aria-label="Retour au plan de salle" title="Plan (F1 / Échap)">
            <ArrowLeft size={18} /> Plan
          </Btn>
          <button onClick={() => (isTable ? setPanel('menu') : undefined)} className="flex-1 min-w-0 text-left px-2">
            <p className="text-base font-bold truncate">{title}</p>
            <p className="text-xs text-gray-500 truncate">{subtitle}</p>
          </button>
          {pendingQty > 0 && (
            <button onClick={() => setPendingQty(0)} className="min-h-[44px] px-3 rounded-xl bg-gray-900 text-white text-sm font-bold" title="Quantité du prochain produit (touchez pour annuler)">
              × {pendingQty}
            </button>
          )}
        </div>
        <ErrorNote message={error ?? visit.error} onClose={() => setError(null)} />
        <div className="flex-1 min-h-0">
          <ProductGrid
            fill
            catalog={catalog}
            favorites={favorites}
            counts={counts}
            searchRef={searchRef}
            pendingQty={pendingQty}
            onAdd={add}
            onLongPress={hasPermission('pos:sell') ? (a) => void toggleAvailability(a.id, a.availability) : undefined}
          />
        </div>
        {/* Phones and portrait tablets: the ticket is a bottom sheet */}
        <button onClick={() => setSheet(true)} className="lg:hidden shrink-0 min-h-[56px] rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center gap-2">
          <ChevronUp size={18} /> Ticket · {lines.reduce((s, l) => s + l.quantity, 0)} article(s) · <Money mil={total} />
        </button>
      </div>

      <aside className="hidden lg:flex w-[380px] xl:w-[420px] shrink-0 border-l border-gray-200 min-h-0">{ticket}</aside>
      {sheet && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/30 flex items-end" onClick={() => setSheet(false)}>
          <div className="w-full h-[85dvh] rounded-t-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {ticket}
          </div>
        </div>
      )}

      {paying && (
        <PaymentPanel
          sale={paying}
          sessionId={session?.id ?? null}
          registerId={registerId}
          autoPrint={settings?.autoPrintReceipt}
          autoCloseSeconds={isTable ? 0 : (settings?.counterNextSaleSeconds ?? 4)}
          closeLabel={isTable ? 'Retour au plan' : 'Nouvelle vente'}
          onBackToPlan={isTable ? undefined : () => { setPaying(null); onSessionChanged(); onBack(); }}
          onSettled={() => {
            onSessionChanged();
            if (isTable && v && settings?.releaseTableAfterPayment) void posApi.closeVisit(v.id).catch(() => undefined);
          }}
          onClose={() => {
            const settled = paying.status === 'completed';
            setPaying(null);
            onSessionChanged();
            if (isTable) {
              void visit.reload().then(() => undefined);
              // Fully paid table: back to the plan.
              void posApi.visit(v!.id).then((fresh) => {
                const open = fresh.sales.find((s) => s.status === 'open');
                if (fresh.status === 'closed' || !open || open.dueMil === 0) onBack(fresh.status === 'closed' ? `Table ${fresh.table.name} réglée et libérée.` : `Table ${fresh.table.name} réglée.`);
              }).catch(() => undefined);
            } else if (settled) searchRef.current?.focus();
          }}
        />
      )}
      {offline && session && preview && (
        <OfflineSaleModal
          cart={preview}
          lines={lines}
          serviceType={serviceType}
          sessionId={session.id}
          registerId={session.registerId}
          onClose={() => setOffline(false)}
          onRecorded={() => {
            setOffline(false);
            setLines([]);
            setSaleKey(newIdempotencyKey());
          }}
        />
      )}
      {panel === 'menu' && v && (
        <Modal title={`Table ${v.table.name}`} onClose={() => setPanel(null)}>
          <div className="grid grid-cols-2 gap-2">
            <MenuTile icon={ClipboardList} label="Détails" hint="Envois, code client, annulations" onClick={() => setPanel('details')} />
            <MenuTile icon={Users} label="Couverts" hint={v.covers ? `${v.covers} personnes` : 'À saisir'} onClick={() => setPanel('details')} />
            <MenuTile icon={ArrowRightLeft} label="Déplacer" hint="Vers une table libre" disabled={!hasPermission('tables:transfer')} onClick={() => setPanel('transfer')} />
            <MenuTile icon={Merge} label="Fusionner" hint="Avec une table occupée" disabled={!hasPermission('tables:transfer')} onClick={() => setPanel('merge')} />
            <MenuTile icon={Split} label="Séparer" hint="Des articles vers une autre table" disabled={!hasPermission('tables:transfer') || sends.length === 0} onClick={() => setPanel('fork')} />
            <MenuTile
              icon={X}
              label="Libérer la table"
              hint={openSale && openSale.dueMil > 0 ? 'Après règlement' : 'Table réglée'}
              disabled={!hasPermission('visits:manage') || Boolean(openSale && openSale.dueMil > 0)}
              onClick={() => run(async () => { await posApi.closeVisit(v.id); setPanel(null); onBack(`Table ${v.table.name} libérée.`); })}
            />
          </div>
        </Modal>
      )}
      {panel === 'details' && v && (
        <VisitPanel
          visitId={v.id}
          sessionId={session?.id ?? null}
          onClose={() => {
            setPanel(null);
            void visit.reload();
          }}
        />
      )}
      {(panel === 'transfer' || panel === 'merge' || panel === 'fork') && v && (
        <TableTransferModal
          visit={v}
          initialMode={panel}
          onClose={() => setPanel(null)}
          onDone={(next) => {
            setPanel(null);
            if (panel === 'fork') {
              void visit.reload();
              onBack(`Articles séparés vers la table ${next.table.name}.`);
            } else onBack(panel === 'transfer' ? `Table déplacée vers ${next.table.name}.` : `Tables fusionnées dans ${next.table.name}.`);
          }}
        />
      )}
    </div>
  );
};

const MenuTile: React.FC<{ icon: React.ComponentType<{ size?: number; className?: string }>; label: string; hint: string; disabled?: boolean; onClick: () => void }> = ({ icon: Icon, label, hint, disabled, onClick }) => (
  <button disabled={disabled} onClick={onClick} className="min-h-[88px] rounded-xl border border-gray-200 bg-white p-3 text-left flex flex-col gap-1 hover:border-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed">
    <Icon size={20} className="text-gray-700" />
    <span className="text-sm font-bold">{label}</span>
    <span className="text-xs text-gray-500">{hint}</span>
  </button>
);
