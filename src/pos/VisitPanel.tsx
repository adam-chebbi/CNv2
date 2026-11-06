import React, { useState } from 'react';
import { Bell, Check, KeyRound, Plus, Receipt, RefreshCw, Users, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { CartLineInput } from '../data/pricing';
import { newIdempotencyKey, usePosEvents } from '../hooks/usePosEvents';
import { posApi, type Order, type OrderLine, type VisitDetail } from './api';
import { addLine, CartLines, lineKey, ProductGrid } from './CartComposer';
import { PaymentPanel } from './PaymentPanel';
import { ORDER_STATUS_LABELS, PREP_LABELS, PREP_TONES } from './labels';
import { Badge, Btn, elapsed, ErrorNote, Field, inputCls, Loading, Modal, Money, time, useAction, useLoader, useNow } from './ui';

// Everything about one occupied table: customer code, covers, orders and their preparation,
// QR orders to validate, cancellation requests, bill and release (cahier des charges §2.3, §4, §6, §7).

const lineFromOrderLine = (l: OrderLine): CartLineInput => ({
  articleId: l.articleId,
  quantity: l.quantity,
  variantId: l.variant?.id,
  extraIds: l.extras.map((e) => e.id),
  instruction: l.instruction ?? undefined,
});

const OrderComposer: React.FC<{ title: string; initial?: CartLineInput[]; withMessage?: boolean; withTiming?: boolean; onCancel: () => void; onSubmit: (lines: (CartLineInput & { hold?: boolean })[], message: string, urgent: boolean) => Promise<void> }> = ({
  title,
  initial = [],
  withMessage,
  withTiming,
  onCancel,
  onSubmit,
}) => {
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [urgent, setUrgent] = useState(false);
  const catalog = useLoader(() => posApi.catalog(), []);
  const [lines, setLines] = useState<CartLineInput[]>(initial);
  const [message, setMessage] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal
      title={title}
      wide
      onClose={onCancel}
      footer={
        <>
          <Btn onClick={onCancel}>Annuler</Btn>
          <Btn variant="primary" busy={busy} disabled={lines.length === 0 || (withMessage && message.trim().length < 2)} onClick={() => run(() => onSubmit(lines.map((l) => ({ ...l, hold: held.has(lineKey(l)) })), message.trim(), urgent))}>
            {withMessage ? 'Envoyer au client' : 'Envoyer en préparation'}
          </Btn>
        </>
      }
    >
      <ErrorNote message={error ?? catalog.error} />
      {!catalog.data ? (
        <Loading />
      ) : (
        <div className="grid md:grid-cols-[1fr_300px] gap-4">
          <ProductGrid catalog={catalog.data} onAdd={(l) => setLines((p) => addLine(p, l))} />
          <div className="space-y-2">
            <CartLines catalog={catalog.data} lines={lines} onChange={setLines} />
            {withTiming && lines.length > 0 && (
              <div className="rounded-xl border border-gray-100 p-2 space-y-1 text-sm">
                <p className="text-xs font-semibold text-gray-600">Envoi en préparation</p>
                {lines.map((l) => {
                  const k = lineKey(l);
                  const name = catalog.data?.articles.find((a) => a.id === l.articleId)?.name ?? '';
                  return (
                    <label key={k} className="flex items-center gap-2">
                      <input type="checkbox" checked={held.has(k)} onChange={(e) => { const next = new Set(held); if (e.target.checked) next.add(k); else next.delete(k); setHeld(next); }} />
                      <span>{l.quantity} × {name} — plus tard (suite)</span>
                    </label>
                  );
                })}
                <label className="flex items-center gap-2 font-semibold text-red-700"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Commande urgente</label>
              </div>
            )}
            {withMessage && (
              <Field label="Message au client (obligatoire)">
                <input className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="ex. Plus de croissants, remplacé par…" />
              </Field>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

const CancelRequestModal: React.FC<{ target: { type: 'line' | 'order' | 'visit'; id: string; label: string }; onClose: () => void; onDone: () => void }> = ({ target, onClose, onDone }) => {
  const REASONS = ['Le client a changé d’avis', 'Erreur de saisie', 'Produit non conforme', 'Attente trop longue'];
  const [reason, setReason] = useState('');
  const [key] = useState(newIdempotencyKey);
  const { busy, error, run } = useAction();
  return (
    <Modal
      title="Demande d'annulation"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Fermer</Btn>
          <Btn variant="danger" busy={busy} disabled={reason.trim().length < 3} onClick={() => run(async () => { await posApi.requestCancellation(target.type, target.id, reason.trim(), key); onDone(); })}>
            Envoyer la demande
          </Btn>
        </>
      }
    >
      <ErrorNote message={error} />
      <p className="text-sm">
        <strong>{target.label}</strong> — la demande sera décidée par le gérant ou la direction. Rien n'est retiré avant sa décision.
      </p>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <Btn key={r} size="sm" variant={reason === r ? 'primary' : 'secondary'} onClick={() => setReason(r)}>
            {r}
          </Btn>
        ))}
      </div>
      <Field label="Motif">
        <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
};

const PendingOrder: React.FC<{ order: Order; onChanged: () => void }> = ({ order, onChanged }) => {
  const [mode, setMode] = useState<'reject' | 'change' | null>(null);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const waitingCustomer = order.status === 'awaiting_customer';
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Commande QR n°{order.number} · {time(order.createdAt)}
        </p>
        <Badge tone={order.status === 'rejected' ? 'red' : 'amber'}>{ORDER_STATUS_LABELS[order.status]}</Badge>
      </div>
      <ErrorNote message={error} />
      <ul className="text-sm">
        {order.lines.map((l) => (
          <li key={l.id} className="flex justify-between">
            <span>
              {l.quantity} × {l.displayName}
              {l.instruction && <em className="text-gray-500"> — {l.instruction}</em>}
            </span>
            <Money mil={l.totalMil} />
          </li>
        ))}
      </ul>
      {order.changeRequest && <p className="text-xs text-gray-600">Message envoyé : « {order.changeRequest} »</p>}
      {order.rejectionReason && <p className="text-xs text-red-600">Motif du refus : {order.rejectionReason}</p>}
      {order.status === 'pending_validation' && (
        <div className="flex flex-wrap gap-2">
          <Btn variant="primary" size="sm" busy={busy} onClick={() => run(async () => { await posApi.acceptOrder(order.id); onChanged(); })}>
            <Check size={14} /> Accepter
          </Btn>
          <Btn size="sm" onClick={() => setMode('change')}>Demander une modification</Btn>
          <Btn size="sm" variant="danger" onClick={() => setMode('reject')}>
            <X size={14} /> Refuser
          </Btn>
        </div>
      )}
      {waitingCustomer && <p className="text-xs text-gray-600">Le client doit confirmer la modification sur son téléphone.</p>}
      {mode === 'reject' && (
        <Modal
          title={`Refuser la commande n°${order.number}`}
          onClose={() => setMode(null)}
          footer={
            <Btn variant="danger" busy={busy} disabled={reason.trim().length < 2} onClick={() => run(async () => { await posApi.rejectOrder(order.id, reason.trim()); setMode(null); onChanged(); })}>
              Refuser
            </Btn>
          }
        >
          <Field label="Motif communiqué au client">
            <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. Cuisine fermée" />
          </Field>
        </Modal>
      )}
      {mode === 'change' && (
        <OrderComposer
          title={`Modifier la commande n°${order.number}`}
          initial={order.lines.map(lineFromOrderLine)}
          withMessage
          onCancel={() => setMode(null)}
          onSubmit={async (lines, message) => {
            await posApi.requestOrderChange(order.id, message, lines);
            setMode(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
};

export const VisitPanel: React.FC<{ visitId: string; sessionId: string | null; onClose: () => void }> = ({ visitId, sessionId, onClose }) => {
  const { hasPermission } = useAuth();
  const visit = useLoader(() => posApi.visit(visitId), [visitId]);
  const [composing, setComposing] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ type: 'line' | 'order' | 'visit'; id: string; label: string } | null>(null);
  const [orderKey, setOrderKey] = useState(newIdempotencyKey);
  const [covers, setCovers] = useState('');
  const { busy, error, setError, run } = useAction();
  const now = useNow();
  usePosEvents(['orders.changed', 'prep.changed', 'floor.changed', 'actions.changed'], () => void visit.reload(), 15_000);

  const v: VisitDetail | null = visit.data;
  if (!v) return <Modal title="Table" onClose={onClose}>{visit.error ? <ErrorNote message={visit.error} /> : <Loading />}</Modal>;

  const openSale = v.sales.find((s) => s.status === 'open');
  const validated = v.sales.flatMap((s) => s.orders.filter((o) => o.status === 'validated'));
  const closed = v.status === 'closed';

  return (
    <Modal title={`Table ${v.table.name}`} onClose={onClose} wide>
      <ErrorNote message={error ?? visit.error} onClose={() => setError(null)} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="blue">Ouverte à {time(v.openedAt)} · {elapsed(v.openedAt, now)}</Badge>
        {v.primaryWaiter && <Badge>Serveur : {v.primaryWaiter}</Badge>}
        {v.waiterCalled && <Badge tone="red"><Bell size={12} /> Appel serveur</Badge>}
        {v.billRequested && <Badge tone="amber"><Receipt size={12} /> Addition demandée</Badge>}
        {closed && <Badge>Visite clôturée</Badge>}
      </div>

      {!closed && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><KeyRound size={14} /> Code client (QR)</p>
            <p className="text-3xl font-bold tracking-[0.3em] text-gray-900">{v.joinCode}</p>
            <Btn size="sm" variant="ghost" busy={busy} onClick={() => run(async () => visit.setData(await posApi.regenerateCode(v.id)))}>
              <RefreshCw size={13} /> Nouveau code
            </Btn>
          </div>
          <div className="rounded-xl border border-gray-100 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Users size={14} /> Couverts : {v.covers ?? <span className="text-red-600">non renseignés</span>}</p>
            <div className="flex gap-2">
              <input className={inputCls} inputMode="numeric" placeholder="Nombre" value={covers} onChange={(e) => setCovers(e.target.value.replace(/\D/g, ''))} />
              <Btn busy={busy} disabled={!covers} onClick={() => run(async () => { visit.setData(await posApi.setCovers(v.id, Number(covers))); setCovers(''); })}>
                OK
              </Btn>
            </div>
          </div>
        </div>
      )}

      {v.pendingOrders.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Commandes du client à traiter</p>
          {v.pendingOrders.map((o) => (
            <PendingOrder key={o.id} order={o} onChanged={() => void visit.reload()} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Commandes validées</p>
          {!closed && hasPermission('orders:take') && (
            <Btn size="sm" variant="primary" onClick={() => setComposing(true)}>
              <Plus size={14} /> Commande
            </Btn>
          )}
        </div>
        {validated.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune commande.</p>
        ) : (
          validated.map((o) => (
            <div key={o.id} className="rounded-xl border border-gray-100 p-3">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="text-xs text-gray-500 flex-1">
                  N°{o.number} · {time(o.createdAt)} · {o.channel === 'qr' ? 'QR' : o.createdBy}
                  {o.urgent && <span className="ml-1"><Badge tone="red">Urgent</Badge></span>}
                </p>
                {!closed && hasPermission('orders:take') && o.lines.some((l) => l.status === 'active' && l.fireStatus === 'hold') && (
                  <Btn size="sm" variant="primary" busy={busy} onClick={() => run(async () => { await posApi.fireOrder(o.id); await visit.reload(); })}>Envoyer la suite</Btn>
                )}
                {!closed && hasPermission('orders:take') && o.lines.some((l) => l.status === 'active' && ['to_prepare', 'in_progress'].includes(l.prepStatus)) && (
                  <Btn size="sm" variant="ghost" busy={busy} onClick={() => run(async () => { await posApi.setOrderPriority(o.id, !o.urgent); await visit.reload(); })}>{o.urgent ? 'Retirer « urgent »' : 'Urgent'}</Btn>
                )}
              </div>
              <ul className="text-sm space-y-1">
                {o.lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-2">
                    <span className={l.status !== 'active' ? 'line-through text-gray-400 flex-1' : 'flex-1'}>
                      {l.quantity} × {l.displayName}
                      {l.instruction && <em className="text-gray-500"> — {l.instruction}</em>}
                    </span>
                    {l.status === 'active' && (l.fireStatus === 'hold' ? <Badge tone="violet">Suite — pas encore envoyé</Badge> : <Badge tone={PREP_TONES[l.prepStatus]}>{PREP_LABELS[l.prepStatus]}</Badge>)}
                    <Money mil={l.totalMil} className="w-20 text-right" />
                    {l.status === 'active' && l.prepStatus === 'ready' && hasPermission('prep:update') && (
                      <Btn size="sm" busy={busy} onClick={() => run(async () => { await posApi.prepLine(l.id, 'served'); await visit.reload(); })}>Servie</Btn>
                    )}
                    {l.status === 'active' && openSale && hasPermission('cancel:request') && (
                      <Btn size="sm" variant="ghost" onClick={() => setCancelTarget({ type: 'line', id: l.id, label: `${l.quantity} × ${l.displayName}` })}>
                        Annuler
                      </Btn>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {openSale && (
        <div className="rounded-xl bg-gray-50 p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            <p className="font-bold text-base">Addition : <Money mil={openSale.totalMil} /></p>
            {openSale.paidMil > 0 && <p>Réglé : <Money mil={openSale.paidMil} /> · reste <Money mil={openSale.dueMil} /></p>}
          </div>
          {hasPermission('pos:collect') && openSale.totalMil > 0 && (
            <Btn variant="primary" onClick={() => setPaying(openSale.id)}>
              Encaisser
            </Btn>
          )}
        </div>
      )}

      {!closed && (
        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-100">
          {openSale && hasPermission('cancel:request') && validated.length > 0 && (
            <Btn variant="ghost" onClick={() => setCancelTarget({ type: 'visit', id: v.id, label: `Toute la table ${v.table.name}` })}>
              Annuler la visite
            </Btn>
          )}
          {hasPermission('visits:manage') && (
            <Btn variant="warning" busy={busy} onClick={() => run(async () => { await posApi.closeVisit(v.id); onClose(); })}>
              Libérer la table
            </Btn>
          )}
        </div>
      )}

      {composing && (
        <OrderComposer
          title={`Commande — ${v.table.name}`}
          withTiming
          onCancel={() => setComposing(false)}
          onSubmit={async (lines, _message, urgent) => {
            visit.setData(await posApi.staffOrder(v.id, lines, orderKey, urgent));
            setOrderKey(newIdempotencyKey());
            setComposing(false);
          }}
        />
      )}
      {cancelTarget && (
        <CancelRequestModal
          target={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onDone={() => {
            setCancelTarget(null);
            void visit.reload();
          }}
        />
      )}
      {paying && openSale && (
        <PaymentPanel
          sale={openSale}
          sessionId={sessionId}
          onClose={() => {
            setPaying(null);
            void visit.reload();
          }}
        />
      )}
    </Modal>
  );
};
