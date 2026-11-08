import React, { useEffect, useState } from 'react';
import { Bell, CalendarClock, LayoutGrid, Receipt, ShoppingBag } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { usePosEvents } from '../hooks/usePosEvents';
import { posApi, type LiveTable } from './api';
import { useCashSession } from './CashSessionControls';
import { TableTerminal } from './TableTerminal';
import { VisitPanel } from './VisitPanel';
import { Btn, Card, cx, elapsed, Empty, ErrorNote, Field, inputCls, Loading, Modal, Money, PageHeader, time, useAction, useLoader, useNow } from './ui';

// Plan de salle en service (cahier des charges §6.2): each table shows its state at a glance.

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
  const width = Math.max(600, ...tables.map((t) => t.x + t.width + 20));
  const height = Math.max(360, ...tables.map((t) => t.y + t.height + 20));

  const onTable = (t: LiveTable) => {
    if (!t.accessible) return;
    if (t.visit) openVisitView(t.visit.id);
    else if (hasPermission('visits:manage')) setOpenTable(t);
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
            <div className="overflow-auto rounded-xl bg-[repeating-linear-gradient(0deg,#f9fafb,#f9fafb_19px,#f3f4f6_20px)] border border-gray-100">
              <div className="relative" style={{ width, height }}>
                {tables.map((t) => {
                  const state = tableState(t);
                  return (
                    <button
                      key={t.id}
                      onClick={() => onTable(t)}
                      aria-label={`Table ${t.name} — ${STYLE[state].label}`}
                      className={cx('absolute border-2 flex flex-col items-center justify-center text-center p-1 shadow-sm transition', STYLE[state].cls, t.shape === 'round' ? 'rounded-full' : 'rounded-xl')}
                      style={{ left: t.x, top: t.y, width: t.width, height: t.height, transform: t.rotation ? `rotate(${t.rotation}deg)` : undefined }}
                    >
                      <span className="text-sm font-bold">{t.name}</span>
                      {t.visit && t.accessible && <span className="text-[10px]">{elapsed(t.visit.openedAt, now)}{t.visit.covers ? ` · ${t.visit.covers} p.` : ''}</span>}
                      {t.visit && t.billTotalMil > 0 && t.accessible && <span className="text-[10px] font-semibold"><Money mil={t.billTotalMil - t.billPaidMil} /></span>}
                      {!t.visit && t.upcomingReservation && <span className="text-[10px]">{t.upcomingReservation.time}</span>}
                      <span className="flex gap-0.5">
                        {t.waiterCalled && <Bell size={11} />}
                        {t.billRequested && <Receipt size={11} />}
                        {t.pendingOrders > 0 && <ShoppingBag size={11} />}
                        {t.upcomingReservation && <CalendarClock size={11} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
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
