import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarClock, Hash, Lock, Receipt, ShoppingBag, Users } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { posApi, type FloorAsset, type FloorState, type LiveTable } from '../api';
import { FloorCanvas2D, type TableLook } from '../floor/FloorCanvas2D';
import { COLORS, STYLE, tableState } from '../FloorPage';
import { Btn, cx, elapsed, ErrorNote, Modal, useAction, useNow } from '../ui';

// Caisse — screen A, the default screen: the café's plan fitted to the screen (no zoom, no pan), one
// button per area, and the big "Comptoir" button. One tap on a table opens its order; a free table
// first asks for the number of guests. Long press on an occupied table opens its menu.

const AREA_KEY = 'cn_caisse_area';
const readArea = (): string => {
  try {
    return localStorage.getItem(AREA_KEY) ?? '';
  } catch {
    return '';
  }
};

export const PlanScreen: React.FC<{
  floor: FloorState | null;
  assets: FloorAsset[];
  error: string | null;
  onOpen: (visitId: string, opts?: { justOpened?: boolean; menu?: boolean }) => void;
  onCounter: () => void;
}> = ({ floor, assets, error, onOpen, onCounter }) => {
  const { hasPermission } = useAuth();
  const now = useNow();
  const areas = floor?.areas ?? [];
  const [areaId, setAreaIdState] = useState(readArea);
  const setAreaId = (id: string) => {
    setAreaIdState(id);
    try {
      localStorage.setItem(AREA_KEY, id);
    } catch {
      /* per device only */
    }
  };
  useEffect(() => {
    if (areas.length && !areas.some((a) => a.id === areaId)) setAreaIdState(areas[0].id);
  }, [areas, areaId]);
  const area = areas.find((a) => a.id === areaId) ?? null;
  const tables = (floor?.tables ?? []).filter((t) => t.areaId === area?.id);
  const elements = (floor?.elements ?? []).filter((e) => e.areaId === area?.id);
  const [opening, setOpening] = useState<LiveTable | null>(null);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const attention = (t: LiveTable) => t.accessible && (t.pendingOrders > 0 || t.billRequested || t.waiterCalled);
  const look = useCallback(
    (t: { id: string }): TableLook => {
      const live = floor?.tables.find((x) => x.id === t.id);
      if (!live) return { fill: '#fff', stroke: '#999' };
      const state = tableState(live);
      const c = COLORS[state];
      const lines: string[] = [];
      if (live.visit && live.accessible) {
        lines.push(`${elapsed(live.visit.openedAt, now)}${live.visit.covers ? ` · ${live.visit.covers} p.` : ''}`);
        if (live.visit.primaryWaiter) lines.push(live.visit.primaryWaiter.split(' ')[0]);
      } else if (!live.visit && live.upcomingReservation) lines.push(`Résa ${live.upcomingReservation.time}`);
      return { fill: c.fill, stroke: c.stroke, halo: c.halo, pulse: state === 'call', lines, dim: state === 'locked' };
    },
    [floor, now]
  );

  const tap = (t: LiveTable) => {
    if (!t.accessible) {
      setNotice(`La table ${t.name} est servie par ${t.visit?.primaryWaiter ?? 'un autre carré'}.`);
      return;
    }
    if (t.visit) onOpen(t.visit.id);
    else if (hasPermission('visits:manage')) setOpening(t);
    else setNotice('Votre profil ne permet pas d’ouvrir une table.');
  };
  const byId = (id: string) => floor?.tables.find((x) => x.id === id);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const counts = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, (floor?.tables ?? []).filter((t) => t.areaId === a.id && attention(t)).length])), [areas, floor]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 p-3">
      <ErrorNote message={error} />
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex gap-2 overflow-x-auto flex-1 min-w-0">
          {areas.length > 1 &&
            areas.map((a) => (
              <button
                key={a.id}
                onClick={() => setAreaId(a.id)}
                className={cx('relative shrink-0 px-5 min-h-[48px] rounded-xl text-sm font-semibold border', a.id === area?.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-700')}
              >
                {a.name}
                {counts[a.id] > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center">{counts[a.id]}</span>}
              </button>
            ))}
          {areas.length === 1 && <p className="text-base font-bold text-gray-800 px-1 self-center">{areas[0].name}</p>}
        </div>
        {areas.length > 0 && (
          <Btn onClick={() => setSearching(true)} aria-label="Aller à une table" title="Aller à une table par son numéro">
            <Hash size={18} />
          </Btn>
        )}
        <Btn variant="primary" size="lg" onClick={onCounter} className="shrink-0">
          <ShoppingBag size={20} /> Comptoir
        </Btn>
      </div>

      {notice && <p className="shrink-0 rounded-xl bg-gray-900 text-white text-sm px-4 py-2 flex items-center gap-2"><Lock size={15} /> {notice}</p>}

      {areas.length === 0 ? (
        <div className="flex-1 min-h-0 rounded-2xl border-2 border-dashed border-gray-200 bg-white flex flex-col items-center justify-center gap-3 text-center p-6">
          <ShoppingBag size={40} className="text-emerald-600" />
          <p className="text-lg font-bold">Aucun plan de salle pour l’instant</p>
          <p className="text-sm text-gray-500 max-w-sm">Les ventes se font au comptoir. La direction dessine la salle dans « Paramétrage caisse → Plan de salle ».</p>
          <Btn variant="primary" size="lg" onClick={onCounter}>
            <ShoppingBag size={20} /> Ouvrir le comptoir
          </Btn>
        </div>
      ) : (
        area && (
          <FloorCanvas2D
            className="flex-1 min-h-0"
            fixed
            geometry={area.geometry}
            tables={tables}
            elements={elements}
            assets={assets}
            look={look}
            onTable={(id) => {
              const t = byId(id);
              if (t) tap(t);
            }}
            onTableLongPress={(id) => {
              const t = byId(id);
              if (t?.visit && t.accessible) onOpen(t.visit.id, { menu: true });
            }}
          />
        )
      )}

      {areas.length > 0 && (
        <div className="shrink-0 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          {(['free', 'busy', 'reserved', 'pending', 'bill', 'call'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={cx('w-3.5 h-3.5 rounded border-2', STYLE[s].cls)} />
              {s === 'call' ? <Bell size={12} /> : s === 'bill' ? <Receipt size={12} /> : s === 'reserved' ? <CalendarClock size={12} /> : null}
              {STYLE[s].label}
            </span>
          ))}
          <span className="text-gray-400">Appui long sur une table occupée : déplacer, fusionner, séparer…</span>
        </div>
      )}

      {opening && <CoversModal table={opening} onClose={() => setOpening(null)} onOpened={(id) => { setOpening(null); onOpen(id, { justOpened: true }); }} />}
      {searching && (
        <TableSearch
          tables={(floor?.tables ?? []).filter((t) => t.accessible)}
          onClose={() => setSearching(false)}
          onPick={(t) => {
            setSearching(false);
            setAreaId(t.areaId);
            tap(t);
          }}
        />
      )}
    </div>
  );
};

// Number of guests on a keypad: one tap opens the table and its order screen.
const CoversModal: React.FC<{ table: LiveTable; onClose: () => void; onOpened: (visitId: string) => void }> = ({ table, onClose, onOpened }) => {
  const [other, setOther] = useState('');
  const { busy, error, run } = useAction();
  const open = (covers: number | null) => run(async () => onOpened((await posApi.openVisit(table.id, covers)).id));
  const max = Math.max(table.capacity, 8);
  return (
    <Modal title={`Table ${table.name} — combien de personnes ?`} onClose={onClose}>
      <ErrorNote message={error} />
      {table.upcomingReservation && (
        <p className="text-sm p-3 rounded-xl bg-violet-50 text-violet-900 flex items-center gap-2">
          <CalendarClock size={16} /> Réservée à {table.upcomingReservation.time} pour {table.upcomingReservation.name} ({table.upcomingReservation.people} pers.)
        </p>
      )}
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: Math.min(max, 12) }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            disabled={busy}
            onClick={() => void open(n)}
            className={cx('min-h-[64px] rounded-xl border-2 text-2xl font-bold', n === table.upcomingReservation?.people ? 'border-violet-400 bg-violet-50' : 'border-gray-200 bg-white hover:border-emerald-500 active:bg-emerald-50')}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="flex-1 rounded-xl border border-gray-200 px-3 min-h-[48px] text-lg" inputMode="numeric" placeholder="Plus de 12…" value={other} onChange={(e) => setOther(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        <Btn variant="primary" busy={busy} disabled={!other || Number(other) < 1} onClick={() => void open(Number(other))}>
          <Users size={16} /> Ouvrir
        </Btn>
      </div>
      <p className="text-xs text-gray-500">Capacité : {table.capacity} places.</p>
    </Modal>
  );
};

// Go to a table by its number (large plans).
const TableSearch: React.FC<{ tables: LiveTable[]; onClose: () => void; onPick: (t: LiveTable) => void }> = ({ tables, onClose, onPick }) => {
  const [q, setQ] = useState('');
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const hits = q ? tables.filter((t) => norm(t.name) === norm(q) || norm(t.name).replace(/^t/, '') === norm(q) || norm(t.name).includes(norm(q))).slice(0, 8) : [];
  const key = (k: string) => setQ((v) => (k === '⌫' ? v.slice(0, -1) : (v + k).slice(0, 6)));
  return (
    <Modal title="Aller à la table…" onClose={onClose}>
      <p className="text-3xl font-bold text-center min-h-[44px] tracking-widest">{q || <span className="text-gray-300">N°</span>}</p>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'T', '0', '⌫'].map((k) => (
          <button key={k} onClick={() => key(k)} className="min-h-[56px] rounded-xl border border-gray-200 bg-white text-xl font-bold active:bg-gray-100">
            {k}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {hits.map((t) => (
          <Btn key={t.id} variant="primary" onClick={() => onPick(t)}>
            {t.name}
          </Btn>
        ))}
        {q && hits.length === 0 && <p className="text-sm text-gray-500">Aucune table « {q} ».</p>}
      </div>
    </Modal>
  );
};
