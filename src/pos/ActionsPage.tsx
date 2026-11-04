import React, { useState } from 'react';
import { Bell, CalendarClock, ClipboardList, MessageSquare, Receipt, ShoppingBag, Undo2, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { usePosEvents } from '../hooks/usePosEvents';
import { posApi, type ActionItem } from './api';
import { useCashSession } from './CashSessionControls';
import { VisitPanel } from './VisitPanel';
import { CancellationDecision } from './CancellationsPage';
import { Badge, Btn, Card, cx, elapsed, Empty, ErrorNote, Loading, PageHeader, useAction, useLoader, useNow } from './ui';

// Actions à traiter (cahier des charges §16.2): everything waiting for the team, oldest first,
// with its origin, table, state and waiting time.

const KIND: Record<ActionItem['kind'], { icon: React.ComponentType<{ size?: number }>; tone: string }> = {
  qr_order: { icon: ShoppingBag, tone: 'border-l-orange-500' },
  call_waiter: { icon: Bell, tone: 'border-l-red-500' },
  bill: { icon: Receipt, tone: 'border-l-yellow-500' },
  cancellation: { icon: Undo2, tone: 'border-l-rose-600' },
  reservation: { icon: CalendarClock, tone: 'border-l-violet-500' },
  feedback: { icon: MessageSquare, tone: 'border-l-sky-500' },
  missing_covers: { icon: Users, tone: 'border-l-gray-400' },
};

export const ActionsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const actions = useLoader(() => posApi.actions(), []);
  const floor = useLoader(() => posApi.floor(), []);
  const cash = useCashSession();
  const [visitId, setVisitId] = useState<string | null>(null);
  const [cancellationId, setCancellationId] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const now = useNow(15_000);
  usePosEvents(['actions.changed', 'orders.changed', 'floor.changed', 'reservations.changed'], () => {
    void actions.reload();
    void floor.reload();
  }, 15_000);

  if (actions.loading) return <Loading />;
  const visitOfTable = (tableId?: string | null) => floor.data?.tables.find((t) => t.id === tableId)?.visit?.id ?? null;

  const open = (a: ActionItem) => {
    if (a.kind === 'cancellation') setCancellationId(a.refId);
    else if (a.kind === 'missing_covers') setVisitId(a.refId);
    else {
      const v = visitOfTable(a.tableId);
      if (v) setVisitId(v);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader icon={ClipboardList} title="Actions à traiter" subtitle={`${actions.data?.length ?? 0} demande(s) en attente`} />
      <ErrorNote message={error ?? actions.error} />
      <Card>
        {(actions.data ?? []).length === 0 ? (
          <Empty>Tout est traité.</Empty>
        ) : (
          <ul className="space-y-2">
            {actions.data!.map((a) => {
              const { icon: Icon, tone } = KIND[a.kind];
              const isRequest = a.kind === 'call_waiter' || a.kind === 'bill';
              return (
                <li key={a.id} className={cx('rounded-xl border border-gray-100 border-l-4 p-3 flex flex-wrap items-center gap-3', tone)}>
                  <Icon size={18} />
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-semibold">
                      {a.tableName && <span className="mr-1">{a.tableName} —</span>}
                      {a.title}
                    </p>
                    {a.detail && <p className="text-xs text-gray-600">{a.detail}</p>}
                  </div>
                  <Badge tone={a.status === 'in_progress' ? 'blue' : 'amber'}>{a.status === 'in_progress' ? 'Pris en charge' : 'En attente'}</Badge>
                  <span className="text-xs text-gray-500 tabular-nums w-16 text-right">{elapsed(a.createdAt, now)}</span>
                  <div className="flex gap-2">
                    {isRequest && a.status === 'open' && (
                      <Btn size="sm" busy={busy} onClick={() => run(async () => { await posApi.takeRequest(a.refId); await actions.reload(); })}>
                        Je m'en occupe
                      </Btn>
                    )}
                    {isRequest && (
                      <Btn size="sm" variant="primary" busy={busy} onClick={() => run(async () => { await posApi.doneRequest(a.refId); await actions.reload(); })}>
                        Traité
                      </Btn>
                    )}
                    {(a.kind === 'qr_order' || a.kind === 'missing_covers' || a.kind === 'cancellation' || (isRequest && a.tableId)) && (
                      <Btn size="sm" onClick={() => open(a)} disabled={a.kind === 'cancellation' && !hasPermission('cancel:approve')}>
                        Ouvrir
                      </Btn>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="text-xs text-gray-500">Les réservations et les avis se traitent depuis leurs écrans respectifs.</p>
      {visitId && <VisitPanel visitId={visitId} sessionId={cash.session?.id ?? null} onClose={() => { setVisitId(null); void actions.reload(); }} />}
      {cancellationId && <CancellationDecision id={cancellationId} onClose={() => { setCancellationId(null); void actions.reload(); }} />}
    </div>
  );
};
