import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, ChefHat, Coffee, History, Layers, Maximize2, Moon, Printer, Sun, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react';
import { apiGet } from '../api/client';
import { usePosEvents } from '../hooks/usePosEvents';
import { posApi, type PrepStatus } from './api';
import { PrintStatusBanner } from './PrintersPage';
import { printDocument } from './ticket';
import { Badge, Btn, cx, elapsed, Empty, ErrorNote, Loading, Modal, PageHeader, time, useAction, useLoader, useNow } from './ui';

// Écrans cuisine et bar (cahier des charges §5, amélioration 06). No price is ever shown here.
// Keyboard / bump bar: ← → ↑ ↓ select a ticket · Entrée advance · Retour arrière undo one step
// · P print the ticket · C combined view.

interface BoardLine {
  id: string;
  name: string;
  quantity: number;
  variant: string | null;
  extras: string[];
  instruction: string | null;
  status: PrepStatus;
  cancellationRequested: boolean;
  targetMinutes: number | null;
  allergyNote: boolean;
  allergens: string[];
}
interface BoardTicket {
  id: string;
  label: string;
  orderNumber: number;
  pickupNumber: number | null;
  sentAt: string;
  waiter: string | null;
  urgent: boolean;
  lines: BoardLine[];
}

const COLUMNS: { status: PrepStatus; title: string; next: PrepStatus; previous: PrepStatus | null; action: string }[] = [
  { status: 'to_prepare', title: 'À préparer', next: 'in_progress', previous: null, action: 'Commencer' },
  { status: 'in_progress', title: 'En préparation', next: 'ready', previous: 'to_prepare', action: 'Prête' },
  { status: 'ready', title: 'Prête', next: 'served', previous: 'in_progress', action: 'Servie' },
];

// Without a target time for the product: orange after 10 min, red after 20.
const DEFAULT_WARN = 10;
const DEFAULT_LATE = 20;

const PREFS_KEY = 'cn_kds_prefs';
const readPrefs = (): { dark: boolean; scale: number; sound: boolean } => {
  try {
    return { dark: false, scale: 1, sound: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { dark: false, scale: 1, sound: true };
  }
};

const tone = (pattern: number[], frequency: number) => {
  try {
    const ctx = new AudioContext();
    let t = ctx.currentTime;
    pattern.forEach((duration) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = frequency;
      osc.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration);
      t += duration + 0.08;
    });
  } catch {
    // audio unavailable: the board still updates
  }
};
const SOUNDS = { added: () => tone([0.15], 880), urgent: () => tone([0.12, 0.12, 0.12], 1100), cancel: () => tone([0.25, 0.25], 440) };

const columnOf = (t: BoardTicket): PrepStatus => {
  const statuses = t.lines.map((l) => l.status);
  if (statuses.includes('to_prepare')) return 'to_prepare';
  if (statuses.includes('in_progress')) return 'in_progress';
  return 'ready';
};

// Lateness against each product's own target time (the slowest line decides).
const lateness = (t: BoardTicket, now: number): 'ok' | 'warn' | 'late' => {
  const minutes = (now - Date.parse(t.sentAt)) / 60_000;
  let level: 'ok' | 'warn' | 'late' = 'ok';
  t.lines.forEach((l) => {
    const late = l.targetMinutes ?? DEFAULT_LATE;
    const warn = l.targetMinutes ? l.targetMinutes * 0.75 : DEFAULT_WARN;
    if (minutes >= late) level = 'late';
    else if (minutes >= warn && level === 'ok') level = 'warn';
  });
  return level;
};

const PrepBoardScreen: React.FC<{ destination: 'kitchen' | 'bar' }> = ({ destination }) => {
  const board = useLoader(() => apiGet<{ tickets: BoardTicket[] }>(`/pos/prep/${destination}`), [destination]);
  const [prefs, setPrefsState] = useState(readPrefs);
  const [combined, setCombined] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<'recent' | 'metrics' | null>(null);
  const known = useRef<{ ids: Set<string>; cancels: Set<string> } | null>(null);
  const { error, run } = useAction();
  const now = useNow(15_000);
  usePosEvents(['prep.changed'], () => void board.reload(), 10_000);

  const setPrefs = (p: Partial<typeof prefs>) => {
    const next = { ...prefs, ...p };
    setPrefsState(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // per-device convenience only
    }
  };

  const tickets = board.data?.tickets ?? [];
  // Visual order: column by column, as the cook reads the screen.
  const ordered = useMemo(() => COLUMNS.flatMap((c) => tickets.filter((t) => columnOf(t) === c.status)), [tickets]);

  // Distinct sounds: new dispatch, urgent dispatch, new cancellation request.
  useEffect(() => {
    if (!board.data) return;
    const ids = new Set(tickets.map((t) => t.id));
    const cancels = new Set(tickets.flatMap((t) => t.lines.filter((l) => l.cancellationRequested).map((l) => l.id)));
    if (known.current && prefs.sound) {
      const added = tickets.filter((t) => !known.current!.ids.has(t.id));
      if (added.some((t) => t.urgent)) SOUNDS.urgent();
      else if (added.length) SOUNDS.added();
      if ([...cancels].some((id) => !known.current!.cancels.has(id))) SOUNDS.cancel();
    }
    known.current = { ids, cancels };
    if (selected && !ids.has(selected)) setSelected(null);
  }, [board.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = useCallback(
    (ticket: BoardTicket, direction: 'next' | 'previous') =>
      run(async () => {
        const col = COLUMNS.find((c) => c.status === columnOf(ticket))!;
        const to = direction === 'next' ? col.next : col.previous;
        if (!to) return;
        await posApi.prepTicket(ticket.id, to);
        await board.reload();
      }),
    [run, board]
  );

  const print = useCallback(
    (ticketId: string) =>
      run(async () => {
        const r = await posApi.reprintPrepTicket(ticketId);
        if (!r.queued) await printDocument(r.document);
      }),
    [run]
  );

  // Bump bar / keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const index = ordered.findIndex((t) => t.id === selected);
      if (['ArrowRight', 'ArrowDown'].includes(e.key)) setSelected(ordered[Math.min(ordered.length - 1, index + 1)]?.id ?? null);
      else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) setSelected(ordered[Math.max(0, index - 1)]?.id ?? ordered[0]?.id ?? null);
      else if (e.key === 'Enter' && index >= 0) void move(ordered[index], 'next');
      else if (e.key === 'Backspace' && index >= 0) void move(ordered[index], 'previous');
      else if (e.key.toLowerCase() === 'p' && index >= 0) void print(ordered[index].id);
      else if (e.key.toLowerCase() === 'c') setCombined((c) => !c);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ordered, selected, move, print]);

  const consolidated = useMemo(() => {
    const map = new Map<string, { name: string; toPrepare: number; inProgress: number }>();
    tickets.forEach((t) =>
      t.lines.forEach((l) => {
        if (l.status !== 'to_prepare' && l.status !== 'in_progress') return;
        const key = [l.name, l.variant, ...l.extras].filter(Boolean).join(' · ');
        const entry = map.get(key) ?? { name: key, toPrepare: 0, inProgress: 0 };
        if (l.status === 'to_prepare') entry.toPrepare += l.quantity;
        else entry.inProgress += l.quantity;
        map.set(key, entry);
      })
    );
    return [...map.values()].sort((a, b) => b.toPrepare + b.inProgress - (a.toPrepare + a.inProgress));
  }, [tickets]);

  if (board.loading) return <Loading />;
  const Icon = destination === 'kitchen' ? ChefHat : Coffee;
  const dark = prefs.dark;

  return (
    <div className={cx('space-y-4 rounded-2xl', dark && 'bg-gray-950 text-gray-100 p-3')} style={{ fontSize: `${prefs.scale}rem` }}>
      <PageHeader
        icon={Icon}
        title={destination === 'kitchen' ? 'Écran cuisine' : 'Écran bar'}
        subtitle="Touchez une carte (ou Entrée) pour avancer · Retour arrière pour annuler une étape · P pour imprimer · C vue consolidée"
        actions={
          <>
            <Btn size="sm" variant={combined ? 'primary' : 'secondary'} onClick={() => setCombined(!combined)}><Layers size={14} /> Consolidée</Btn>
            <Btn size="sm" onClick={() => setPanel('recent')}><History size={14} /> Rappel</Btn>
            <Btn size="sm" onClick={() => setPanel('metrics')}><BarChart3 size={14} /> Temps</Btn>
            <Btn size="sm" aria-label="Texte plus petit" onClick={() => setPrefs({ scale: Math.max(0.8, prefs.scale - 0.1) })}><ZoomOut size={14} /></Btn>
            <Btn size="sm" aria-label="Texte plus grand" onClick={() => setPrefs({ scale: Math.min(1.6, prefs.scale + 0.1) })}><ZoomIn size={14} /></Btn>
            <Btn size="sm" aria-label="Contraste" onClick={() => setPrefs({ dark: !dark })}>{dark ? <Sun size={14} /> : <Moon size={14} />}</Btn>
            <Btn size="sm" aria-label="Son" onClick={() => setPrefs({ sound: !prefs.sound })}>{prefs.sound ? <Volume2 size={14} /> : <VolumeX size={14} />}</Btn>
            <Btn size="sm" onClick={() => void document.documentElement.requestFullscreen?.()}><Maximize2 size={14} /></Btn>
          </>
        }
      />
      <PrintStatusBanner />
      <ErrorNote message={error ?? board.error} />

      {combined && (
        <div className={cx('rounded-2xl border p-3', dark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white')}>
          <p className="text-sm font-bold uppercase tracking-wide mb-2">À produire en tout</p>
          {consolidated.length === 0 ? <Empty>Rien en cours.</Empty> : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {consolidated.map((c) => (
                <div key={c.name} className={cx('rounded-xl p-2', dark ? 'bg-gray-800' : 'bg-gray-50')}>
                  <p className="text-2xl font-black">{c.toPrepare + c.inProgress}</p>
                  <p className="text-sm font-semibold leading-tight">{c.name}</p>
                  {c.inProgress > 0 && <p className="text-xs opacity-70">dont {c.inProgress} en cours</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const list = tickets.filter((t) => columnOf(t) === col.status);
          return (
            <div key={col.status} className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wide opacity-80">
                {col.title} <span className="opacity-60">({list.length})</span>
              </h2>
              {list.length === 0 && <Empty>—</Empty>}
              {list.map((t) => {
                const late = col.status === 'ready' ? 'ok' : lateness(t, now);
                const allergy = t.lines.some((l) => l.allergyNote || l.allergens.length > 0);
                return (
                  <article
                    key={t.id}
                    onClick={() => setSelected(t.id)}
                    className={cx(
                      'rounded-2xl border-2 p-3 space-y-2 shadow-sm',
                      dark ? 'bg-gray-900' : 'bg-white',
                      late === 'late' ? 'border-red-500' : late === 'warn' ? 'border-orange-400' : dark ? 'border-gray-700' : 'border-gray-200',
                      t.urgent && 'ring-4 ring-red-500/60 animate-pulse',
                      selected === t.id && 'outline outline-4 outline-sky-400'
                    )}
                  >
                    <header className="flex items-center justify-between gap-2">
                      <p className="text-lg font-black">{t.pickupNumber ? `Retrait n°${t.pickupNumber}` : t.label}</p>
                      <span className={cx('text-sm font-bold tabular-nums', late === 'late' ? 'text-red-500' : late === 'warn' ? 'text-orange-500' : 'opacity-70')}>{elapsed(t.sentAt, now)}</span>
                    </header>
                    <div className="flex flex-wrap gap-1">
                      {t.urgent && <Badge tone="red">URGENT</Badge>}
                      {allergy && <Badge tone="red"><AlertTriangle size={11} /> ALLERGIE</Badge>}
                      <span className="text-xs opacity-70">{time(t.sentAt)}{t.waiter && ` · ${t.waiter}`}</span>
                    </div>
                    <ul className="space-y-1">
                      {t.lines.map((l) => {
                        const step = COLUMNS.find((c) => c.status === l.status);
                        return (
                          <li key={l.id}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (step) void run(async () => { await posApi.prepLine(l.id, step.next); await board.reload(); });
                              }}
                              className={cx('w-full text-left rounded-lg px-2 py-1.5 text-base', l.status === 'ready' ? (dark ? 'bg-emerald-900/60' : 'bg-emerald-50') : l.status === 'in_progress' ? (dark ? 'bg-sky-900/60' : 'bg-sky-50') : dark ? 'bg-gray-800' : 'bg-gray-50')}
                            >
                              <strong className="text-lg">{l.quantity} ×</strong> {l.name}
                              {l.extras.length > 0 && <span className="block text-sm opacity-80">+ {l.extras.join(', ')}</span>}
                              {l.instruction && <span className={cx('block text-sm font-bold', l.allergyNote ? 'text-red-500' : 'text-orange-500')}>⚠ {l.instruction}</span>}
                              {l.allergens.length > 0 && <span className="block text-xs text-red-500">Contient : {l.allergens.join(', ')}</span>}
                              {l.cancellationRequested && <span className="block"><Badge tone="red">ANNULATION DEMANDÉE</Badge></span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex gap-2">
                      <Btn variant={col.status === 'in_progress' ? 'primary' : 'secondary'} className="flex-1" onClick={(e) => { e.stopPropagation(); void move(t, 'next'); }}>
                        {col.action}
                      </Btn>
                      <Btn aria-label="Imprimer le bon" onClick={(e) => { e.stopPropagation(); void print(t.id); }}><Printer size={16} /></Btn>
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>
      {panel === 'recent' && <RecentPanel destination={destination} onClose={() => setPanel(null)} onRecalled={() => void board.reload()} />}
      {panel === 'metrics' && <MetricsPanel destination={destination} onClose={() => setPanel(null)} />}
    </div>
  );
};

const RecentPanel: React.FC<{ destination: 'kitchen' | 'bar'; onClose: () => void; onRecalled: () => void }> = ({ destination, onClose, onRecalled }) => {
  const recent = useLoader(() => apiGet<{ id: string; label: string; sentAt: string; orderNumber: number; readyAt: string | null; summary: string }[]>(`/pos/prep/${destination}/recent`), [destination]);
  const { busy, error, run } = useAction();
  return (
    <Modal title="Bons terminés (3 dernières heures)" onClose={onClose} wide>
      <ErrorNote message={error ?? recent.error} />
      {(recent.data ?? []).length === 0 ? <Empty>Aucun bon terminé.</Empty> : (
        <ul className="divide-y divide-gray-100 text-sm">
          {recent.data!.map((r) => (
            <li key={r.id} className="py-2 flex flex-wrap items-center gap-2">
              <span className="flex-1"><strong>{r.label}</strong> n°{r.orderNumber} · envoyé {time(r.sentAt)}{r.readyAt && ` · prêt ${time(r.readyAt)}`}<span className="block text-xs text-gray-600">{r.summary}</span></span>
              <Btn size="sm" busy={busy} onClick={() => run(async () => { await posApi.prepTicket(r.id, 'in_progress'); onRecalled(); await recent.reload(); })}>Rappeler</Btn>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

const MetricsPanel: React.FC<{ destination: 'kitchen' | 'bar'; onClose: () => void }> = ({ destination, onClose }) => {
  const metrics = useLoader(() => apiGet<{ destination: string; name: string; count: number; avgMinutes: number; maxMinutes: number; targetMinutes: number | null; late: number }[]>('/pos/prep-metrics?days=7'), []);
  const rows = (metrics.data ?? []).filter((m) => m.destination === destination);
  return (
    <Modal title="Temps de préparation (7 derniers jours)" onClose={onClose} wide>
      <ErrorNote message={metrics.error} />
      {rows.length === 0 ? <Empty>Pas encore de données.</Empty> : (
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 text-left"><tr><th className="py-1">Produit</th><th>Préparés</th><th>Moyenne</th><th>Max</th><th>Objectif</th><th>En retard</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((m) => (
              <tr key={m.name}>
                <td className="py-1">{m.name}</td><td>{m.count}</td>
                <td className={cx(m.targetMinutes && m.avgMinutes > m.targetMinutes && 'text-red-600 font-semibold')}>{m.avgMinutes} min</td>
                <td>{m.maxMinutes} min</td><td>{m.targetMinutes ? `${m.targetMinutes} min` : '—'}</td><td>{m.late}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
};

export const KitchenBoardPage: React.FC = () => <PrepBoardScreen destination="kitchen" />;
export const BarBoardPage: React.FC = () => <PrepBoardScreen destination="bar" />;
