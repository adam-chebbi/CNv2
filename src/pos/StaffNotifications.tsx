import React, { useEffect, useRef, useState } from 'react';
import { BellRing, ClipboardList, CheckCircle2, HandPlatter, Receipt, VolumeX, XCircle } from 'lucide-react';
import { apiGet } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { usePosEvents } from '../hooks/usePosEvents';
import { cx, time } from './ui';

// Top-bar badges of the service staff, on every screen ("Roles, flows and screens"): the count of
// actions to handle, and the person's notifications (ready to serve, waiter call, bill asked,
// cancellation decided). A short tone plays when something new arrives.

type Kind = 'ready' | 'call_waiter' | 'bill' | 'cancel_approved' | 'cancel_rejected';
interface Item {
  id: string;
  kind: Kind;
  tableName: string | null;
  text: string;
  at: string;
}

const ICON: Record<Kind, React.ComponentType<{ size?: number; className?: string }>> = {
  ready: HandPlatter,
  call_waiter: BellRing,
  bill: Receipt,
  cancel_approved: CheckCircle2,
  cancel_rejected: XCircle,
};

// One audio context for the page. Browsers keep it suspended until a user gesture: the
// "Activer le son" button resumes it, and stays visible while sound is blocked.
let audio: AudioContext | null = null;
const audioCtx = (): AudioContext | null => {
  try {
    audio ??= new AudioContext();
    return audio;
  } catch {
    return null;
  }
};
let lastBeep = 0;
const beep = () => {
  const ctx = audioCtx();
  // Several events within a few seconds play one sound, not a burst.
  if (!ctx || ctx.state !== 'running' || Date.now() - lastBeep < 3000) return;
  lastBeep = Date.now();
  const o = ctx.createOscillator();
  o.frequency.value = 880;
  o.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.15);
};

export const StaffNotifications: React.FC<{ onOpen: (subId: string) => void }> = ({ onOpen }) => {
  const { hasPermission } = useAuth();
  const isStaff = ['floor:view', 'orders:take', 'actions:view', 'cancel:request'].some((k) => hasPermission(k));
  const [items, setItems] = useState<Item[]>([]);
  const [actionsCount, setActionsCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(() => audioCtx()?.state !== 'running');
  const known = useRef<Set<string> | null>(null);

  // Tab title shows the count while the tab is in the background.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = items.length > 0 ? `(${items.length}) ${base}` : base;
  }, [items.length]);

  const load = async () => {
    if (!isStaff) return;
    try {
      const r = await apiGet<{ items: Item[]; actionsCount: number | null }>('/pos/my-notifications');
      if (known.current && r.items.some((i) => !known.current!.has(i.id))) beep();
      known.current = new Set(r.items.map((i) => i.id));
      setItems(r.items);
      setActionsCount(r.actionsCount);
    } catch {
      /* offline: keep the last state */
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);
  usePosEvents(['prep.changed', 'actions.changed', 'floor.changed', 'orders.changed'], () => void load(), 30_000);

  if (!isStaff) return null;
  return (
    <div className="relative flex items-center gap-1.5">
      {soundBlocked && (
        <button
          onClick={() => void audioCtx()?.resume().then(() => setSoundBlocked(audioCtx()?.state !== 'running'))}
          title="Le navigateur bloque le son des alertes"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-100"
        >
          <VolumeX size={15} /> <span className="hidden sm:inline">Activer le son</span>
        </button>
      )}
      {actionsCount !== null && (
        <button
          onClick={() => onOpen('pos_actions')}
          title="Actions à traiter"
          className="relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <ClipboardList size={15} />
          <span className="hidden sm:inline">Actions</span>
          <span className={cx('min-w-[20px] px-1 rounded-full text-[11px] font-bold text-center', actionsCount > 0 ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500')}>{actionsCount}</span>
        </button>
      )}
      <button
        onClick={() => setOpen(!open)}
        title="Mes notifications"
        aria-label={`Mes notifications (${items.length})`}
        className="relative p-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <BellRing size={16} />
        {items.length > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">{items.length}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-xl p-2">
            <p className="px-2 py-1.5 text-xs font-semibold text-gray-500">Mes notifications</p>
            {items.length === 0 ? (
              <p className="px-2 py-6 text-sm text-center text-gray-400">Rien à signaler.</p>
            ) : (
              <ul>
                {items.map((i) => {
                  const Icon = ICON[i.kind];
                  return (
                    <li key={i.id}>
                      <button
                        onClick={() => {
                          setOpen(false);
                          onOpen(i.kind === 'cancel_approved' || i.kind === 'cancel_rejected' ? 'pos_cancellations' : 'pos_floor');
                        }}
                        className="w-full flex items-start gap-2.5 p-2 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <Icon size={18} className={cx('shrink-0 mt-0.5', i.kind === 'cancel_rejected' || i.kind === 'call_waiter' ? 'text-red-500' : i.kind === 'bill' ? 'text-amber-500' : 'text-emerald-600')} />
                        <span className="text-sm text-gray-800 dark:text-gray-200">
                          {i.tableName && <strong>{i.tableName} · </strong>}
                          {i.text}
                          <span className="block text-[11px] text-gray-400">{time(i.at)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};
