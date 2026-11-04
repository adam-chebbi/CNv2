import React, { useEffect, useRef, useState } from 'react';
import { ChefHat, Coffee, Maximize2, Volume2, VolumeX } from 'lucide-react';
import { usePosEvents } from '../hooks/usePosEvents';
import { posApi, type PrepBoard, type PrepStatus } from './api';
import { Badge, Btn, cx, elapsed, Empty, ErrorNote, Loading, PageHeader, useAction, useLoader, useNow } from './ui';

// Écrans cuisine et bar (cahier des charges §5): three columns, one card per dispatch, a timer
// since validation (orange after 10 min, red after 20). No prices are ever shown here.

const COLUMNS: { status: PrepStatus; title: string; next: PrepStatus; action: string }[] = [
  { status: 'to_prepare', title: 'À préparer', next: 'in_progress', action: 'Commencer' },
  { status: 'in_progress', title: 'En préparation', next: 'ready', action: 'Prête' },
  { status: 'ready', title: 'Prête', next: 'served', action: 'Servie' },
];

const WARN_MIN = 10;
const LATE_MIN = 20;

const beep = () => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // audio unavailable: the board still updates
  }
};

const PrepBoardScreen: React.FC<{ destination: 'kitchen' | 'bar' }> = ({ destination }) => {
  const board = useLoader(() => posApi.prepBoard(destination), [destination]);
  const [sound, setSound] = useState(true);
  const known = useRef<Set<string> | null>(null);
  const { error, run } = useAction();
  const now = useNow(15_000);
  usePosEvents(['prep.changed'], () => void board.reload(), 10_000);

  // A discreet beep for every new dispatch.
  useEffect(() => {
    if (!board.data) return;
    const ids = new Set(board.data.tickets.map((t) => t.id));
    if (known.current && sound && [...ids].some((id) => !known.current!.has(id))) beep();
    known.current = ids;
  }, [board.data, sound]);

  if (board.loading) return <Loading />;
  const tickets = board.data?.tickets ?? [];
  const columnOf = (t: PrepBoard['tickets'][number]): PrepStatus => {
    const statuses = t.lines.map((l) => l.status);
    if (statuses.includes('to_prepare')) return 'to_prepare';
    if (statuses.includes('in_progress')) return 'in_progress';
    return 'ready';
  };

  const Icon = destination === 'kitchen' ? ChefHat : Coffee;
  return (
    <div className="space-y-4">
      <PageHeader
        icon={Icon}
        title={destination === 'kitchen' ? 'Écran cuisine' : 'Écran bar'}
        subtitle="Touchez une carte pour la faire avancer, ou une ligne pour avancer seulement cet article."
        actions={
          <>
            <Btn size="sm" onClick={() => setSound(!sound)} aria-label="Son">
              {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </Btn>
            <Btn size="sm" onClick={() => void document.documentElement.requestFullscreen?.()}>
              <Maximize2 size={14} /> Plein écran
            </Btn>
          </>
        }
      />
      <ErrorNote message={error ?? board.error} />
      <div className="grid md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const list = tickets.filter((t) => columnOf(t) === col.status);
          return (
            <div key={col.status} className="space-y-3">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                {col.title} <span className="text-gray-400">({list.length})</span>
              </h2>
              {list.length === 0 && <Empty>—</Empty>}
              {list.map((t) => {
                const minutes = (now - Date.parse(t.sentAt)) / 60_000;
                return (
                  <article
                    key={t.id}
                    className={cx(
                      'rounded-2xl border-2 bg-white p-3 space-y-2 shadow-sm',
                      col.status !== 'ready' && minutes >= LATE_MIN ? 'border-red-500' : col.status !== 'ready' && minutes >= WARN_MIN ? 'border-orange-400' : 'border-gray-200'
                    )}
                  >
                    <header className="flex items-center justify-between">
                      <p className="text-lg font-bold">{t.label}</p>
                      <span className={cx('text-sm font-semibold tabular-nums', minutes >= LATE_MIN ? 'text-red-600' : minutes >= WARN_MIN ? 'text-orange-600' : 'text-gray-500')}>
                        {elapsed(t.sentAt, now)}
                      </span>
                    </header>
                    {t.waiter && <p className="text-xs text-gray-500">Serveur : {t.waiter}</p>}
                    <ul className="space-y-1">
                      {t.lines.map((l) => {
                        const step = COLUMNS.find((c) => c.status === l.status);
                        return (
                          <li key={l.id}>
                            <button
                              onClick={() => step && run(async () => { await posApi.prepLine(l.id, step.next); await board.reload(); })}
                              className={cx('w-full text-left rounded-lg px-2 py-1.5 text-base', l.status === 'ready' ? 'bg-emerald-50' : l.status === 'in_progress' ? 'bg-sky-50' : 'bg-gray-50')}
                            >
                              <strong>{l.quantity} ×</strong> {l.name}
                              {l.instruction && <span className="block text-sm text-orange-700 font-semibold">⚠ {l.instruction}</span>}
                              {l.cancellationRequested && (
                                <span className="block">
                                  <Badge tone="red">ANNULATION DEMANDÉE</Badge>
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <Btn variant={col.status === 'in_progress' ? 'primary' : 'secondary'} className="w-full" onClick={() => run(async () => { await posApi.prepTicket(t.id, col.next); await board.reload(); })}>
                      {col.action}
                    </Btn>
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const KitchenBoardPage: React.FC = () => <PrepBoardScreen destination="kitchen" />;
export const BarBoardPage: React.FC = () => <PrepBoardScreen destination="bar" />;
