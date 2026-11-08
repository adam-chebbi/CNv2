import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Bell, CalendarClock, LayoutGrid, Receipt, ShoppingBag } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { usePosEvents } from '../hooks/usePosEvents';
import { posApi, type LiveTable } from './api';
import { useCashSession } from './CashSessionControls';
import { FloorCanvas2D, type TableLook } from './floor/FloorCanvas2D';
import { TableTerminal } from './TableTerminal';
import { VisitPanel } from './VisitPanel';
import { Btn, Card, cx, elapsed, Empty, ErrorNote, Field, inputCls, Loading, Modal, Money, PageHeader, time, useAction, useLoader, useNow } from './ui';

// Plan de salle en service (cahier des charges §6.2): each table shows its state at a glance, in 2D
// (to scale, drawn by the floor designer) or 3D (loaded on demand).

const FloorScene3D = lazy(() => import('./floor/FloorScene3D'));

const VIEW_KEY = 'cn_floor_view';
const readView = (): '2d' | '3d' => {
  try {
    return localStorage.getItem(VIEW_KEY) === '3d' ? '3d' : '2d';
  } catch {
    return '2d';
  }
};

type TableState = 'free' | 'busy' | 'reserved' | 'pending' | 'call' | 'bill' | 'locked';

export const tableState = (t: LiveTable): TableState => {
  if (!t.accessible) return 'locked';
  if (t.waiterCalled) return 'call';
  if (t.pendingOrders > 0) return 'pending';
  if (t.billRequested) return 'bill';
  if (t.visit) return 'busy';
  if (t.upcomingReservation) return 'reserved';
  return 'free';
};

const COLORS: Record<TableState, { fill: string; stroke: string; halo: string | null }> = {
  free: { fill: '#ecfdf5', stroke: '#34d399', halo: null },
  busy: { fill: '#e0f2fe', stroke: '#0ea5e9', halo: '#0ea5e9' },
  reserved: { fill: '#ede9fe', stroke: '#8b5cf6', halo: '#8b5cf6' },
  pending: { fill: '#ffedd5', stroke: '#f97316', halo: '#f97316' },
  call: { fill: '#fee2e2', stroke: '#ef4444', halo: '#ef4444' },
  bill: { fill: '#fef9c3', stroke: '#eab308', halo: '#eab308' },
  locked: { fill: '#f3f4f6', stroke: '#d1d5db', halo: null },
};

const STYLE: Record<TableState, { cls: string; label: string }> = {
  free: { cls: 'bg-emerald-50 border-emerald-400 text-emerald-900', label: 'Libre' },
  busy: { cls: 'bg-sky-100 border-sky-500 text-sky-900', label: 'Occupée' },
  reserved: { cls: 'bg-violet-100 border-violet-500 text-violet-900', label: 'Réservée bientôt' },
  pending: { cls: 'bg-orange-100 border-orange-500 text-orange-900', label: 'Commande à valider' },
  call: { cls: 'bg-red-100 border-red-500 text-red-900 animate-pulse', label: 'Appel serveur' },
  bill: { cls: 'bg-yellow-100 border-yellow-500 text-yellow-900', label: 'Addition demandée' },
  locked: { cls: 'bg-gray-100 border-gray-300 text-gray-400', label: 'Hors de vos carrés' },
};

const OpenTableModal: React.FC<{ table: LiveTable; onClose: () => void; onOpened: (visitId: string) => void }> = ({ table, onClose, onOpened }) => {
  const [covers, setCovers] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal
      title={`Ouvrir la table ${table.name}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" busy={busy} onClick={() => run(async () => onOpened((await posApi.openVisit(table.id, covers ? Number(covers) : null)).id))}>
            Ouvrir
          </Btn>
        </>
      }
    >
      <ErrorNote message={error} />
      {table.upcomingReservation && (
        <p className="text-sm p-2 rounded-lg bg-violet-50 text-violet-800">
          Réservée à {table.upcomingReservation.time} pour {table.upcomingReservation.name} ({table.upcomingReservation.people} pers.). Pour installer ces clients, utilisez l'écran Réservations.
        </p>
      )}
      <Field label="Nombre de couverts" hint={`Capacité : ${table.capacity}. Peut être saisi plus tard, mais avant de libérer la table.`}>
        <input className={inputCls} inputMode="numeric" value={covers} onChange={(e) => setCovers(e.target.value.replace(/\D/g, ''))} autoFocus />
      </Field>
    </Modal>
  );
};

export const FloorPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const floor = useLoader(() => posApi.floor(), []);
  const ready = useLoader(() => posApi.readyToServe(), []);
  const cash = useCashSession();
  const [areaId, setAreaId] = useState<string>('');
  const [openTable, setOpenTable] = useState<LiveTable | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  // Staff who take orders land on the table terminal; others get the detail panel.
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const openVisitView = (id: string) => (hasPermission('orders:take') ? setTerminalId(id) : setVisitId(id));
  const { busy, error, run } = useAction();
  const now = useNow();
  const assets = useLoader(() => posApi.floorAssets().catch(() => []), []);
  const [view, setViewState] = useState<'2d' | '3d'>(readView);
  const setView = (v: '2d' | '3d') => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // per-device preference only
    }
  };
  const look = useCallback(
    (t: { id: string }): TableLook => {
      const live = floor.data?.tables.find((x) => x.id === t.id);
      if (!live) return { fill: '#fff', stroke: '#999' };
      const state = tableState(live);
      const c = COLORS[state];
      const lines: string[] = [];
      if (live.visit && live.accessible) {
        lines.push(`${elapsed(live.visit.openedAt, now)}${live.visit.covers ? ` · ${live.visit.covers} p.` : ''}`);
        if (live.billTotalMil > 0) lines.push(`${((live.billTotalMil - live.billPaidMil) / 1000).toFixed(3)} DT`);
      } else if (!live.visit && live.upcomingReservation) lines.push(`Résa ${live.upcomingReservation.time}`);
      return { fill: c.fill, stroke: c.stroke, halo: c.halo, pulse: state === 'call', lines, dim: state === 'locked' };
    },
    [floor.data, now]
  );

  usePosEvents(['floor.changed', 'orders.changed', 'actions.changed', 'prep.changed', 'reservations.changed'], () => {
    void floor.reload();
    void ready.reload();
  }, 15_000);
  useEffect(() => {
    if (!areaId && floor.data?.areas[0]) setAreaId(floor.data.areas[0].id);
  }, [floor.data, areaId]);

  if (floor.loading) return <Loading />;
  const data = floor.data;
  const tables = data?.tables.filter((t) => t.areaId === areaId) ?? [];
  const elements = data?.elements.filter((e) => e.areaId === areaId) ?? [];
  const area = data?.areas.find((a) => a.id === areaId) ?? null;

  const onTable = (t: LiveTable) => {
    if (!t.accessible) return;
    if (t.visit) openVisitView(t.visit.id);
    else if (hasPermission('visits:manage')) setOpenTable(t);
  };
  const onTableId = (id: string) => {
    const t = data?.tables.find((x) => x.id === id);
    if (t) onTable(t);
  };

  return (
    <div className="space-y-4">
      <PageHeader icon={LayoutGrid} title="Plan de salle" subtitle={cash.session ? `Caisse ouverte (${cash.session.registerName})` : "Caisse non ouverte : l'encaissement se fait après ouverture"} />
      <ErrorNote message={error ?? floor.error} />
      {!data || data.areas.length === 0 ? (
        <Card>
          <Empty>Aucun espace n'est encore dessiné. La direction crée le plan dans « Paramétrage caisse → Plan de salle ».</Empty>
        </Card>
      ) : (
        <div className="grid xl:grid-cols-[1fr_280px] gap-4 items-start">
          <Card>
            <div className="flex gap-2 overflow-x-auto">
              {data.areas.map((a) => (
                <button key={a.id} onClick={() => setAreaId(a.id)} className={cx('px-4 min-h-[40px] rounded-full text-sm font-semibold border shrink-0', a.id === areaId ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200')}>
                  {a.name}
                </button>
              ))}
            </div>
            {area && (
              <div className="relative">
                {view === '3d' ? (
                  <Suspense fallback={<Loading />}>
                    <FloorScene3D className="h-[62vh] min-h-[360px]" geometry={area.geometry} tables={tables} elements={elements} assets={assets.data ?? []} look={look} onTable={onTableId} />
                  </Suspense>
                ) : (
                  <FloorCanvas2D className="h-[62vh] min-h-[360px]" geometry={area.geometry} tables={tables} elements={elements} assets={assets.data ?? []} look={look} onTable={onTableId} />
                )}
                <div className="absolute left-2 top-2 flex rounded-lg bg-white/90 shadow border border-gray-200 overflow-hidden text-xs font-semibold">
                  {(['2d', '3d'] as const).map((v) => (
                    <button key={v} onClick={() => setView(v)} className={cx('px-3 py-2', view === v ? 'bg-emerald-600 text-white' : 'text-gray-700')}>
                      {v.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-[11px] text-gray-600">
              {(Object.keys(STYLE) as TableState[]).map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span className={cx('w-3 h-3 rounded border-2', STYLE[s].cls)} /> {STYLE[s].label}
                </span>
              ))}
            </div>
          </Card>
          <Card title="Prêt à servir">
            {(ready.data ?? []).length === 0 ? (
              <Empty>Rien en attente.</Empty>
            ) : (
              <ul className="space-y-2">
                {ready.data!.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">
                      <strong>{l.tableName ?? 'Comptoir'}</strong> — {l.quantity} × {l.name}
                      <span className="block text-xs text-gray-500">prêt à {time(l.readyAt)}</span>
                    </span>
                    {hasPermission('prep:update') && (
                      <Btn size="sm" busy={busy} onClick={() => run(async () => { await posApi.prepLine(l.id, 'served'); await ready.reload(); })}>
                        Servi
                      </Btn>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      {openTable && (
        <OpenTableModal
          table={openTable}
          onClose={() => setOpenTable(null)}
          onOpened={(id) => {
            setOpenTable(null);
            openVisitView(id);
            void floor.reload();
          }}
        />
      )}
      {terminalId && (
        <TableTerminal
          visitId={terminalId}
          floor={data}
          sessionId={cash.session?.id ?? null}
          registerId={cash.session?.registerId ?? null}
          onSwitch={setTerminalId}
          onClose={() => {
            setTerminalId(null);
            void floor.reload();
          }}
        />
      )}
      {visitId && (
        <VisitPanel
          visitId={visitId}
          sessionId={cash.session?.id ?? null}
          onClose={() => {
            setVisitId(null);
            void floor.reload();
          }}
        />
      )}
    </div>
  );
};
