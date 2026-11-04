import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, formatDateFr, type CaisseRecord } from '../../shared/model';
import { api } from '../api/client';

// Header date button + month calendar. Only days between minDate and maxDate can be picked; each
// day shows whether its services are already saved (green: both, amber: one).

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const shiftMonth = (firstOfMonth: string, delta: number) => {
  const [y, m] = firstOfMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const monthEnd = (firstOfMonth: string) => addDays(shiftMonth(firstOfMonth, 1), -1);
const monthLabel = (firstOfMonth: string) => {
  const [y, m] = firstOfMonth.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};

export const CalendarPicker: React.FC<{
  value: string;
  minDate: string;
  maxDate: string;
  onChange: (date: string) => void;
  refreshKey?: unknown; // changes when a save happened, to refresh the day markers
}> = ({ value, minDate, maxDate, onChange, refreshKey }) => {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(value));
  const [saved, setSaved] = useState<Record<string, number>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  // Opening always shows the month of the selected day.
  useEffect(() => {
    if (open) setMonth(monthStart(value));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const from = month < minDate ? minDate : month;
    const to = monthEnd(month) > maxDate ? maxDate : monthEnd(month);
    if (from > to) {
      setSaved({});
      return;
    }
    let cancelled = false;
    api
      .get<{ items: CaisseRecord[] }>(`/caisse?from=${from}&to=${to}`)
      .then((r) => {
        if (cancelled) return;
        const counts: Record<string, number> = {};
        r.items.forEach((i) => (counts[i.date] = (counts[i.date] ?? 0) + 1));
        setSaved(counts);
      })
      .catch(() => !cancelled && setSaved({}));
    return () => {
      cancelled = true;
    };
  }, [open, month, minDate, maxDate, refreshKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 6 rows × 7 days grid, Monday first, with blanks before the 1st.
  const cells = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const out: (string | null)[] = Array(offset).fill(null);
    for (let d = month; d <= monthEnd(month); d = addDays(d, 1)) out.push(d);
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const canPrev = monthStart(minDate) < month;
  const canNext = month < monthStart(maxDate);
  const isToday = value === maxDate;

  const pick = (d: string) => {
    if (d < minDate || d > maxDate) return;
    setOpen(false);
    onChange(d);
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-white min-w-0 cursor-pointer transition ${open ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-gray-200'}`}
      >
        <CalendarDays size={16} className="text-emerald-600 shrink-0" />
        <span className="text-sm font-semibold text-gray-800 truncate capitalize">{isToday ? "Aujourd'hui" : formatDateFr(value, false)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choisir une date"
          className="fixed sm:absolute left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 top-[calc(env(safe-area-inset-top)+4rem)] sm:top-full sm:mt-2 z-50 sm:w-80 bg-white rounded-2xl border border-gray-100 shadow-xl p-3 animate-fade-up"
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} disabled={!canPrev} className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer" aria-label="Mois précédent">
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-bold text-gray-900 capitalize">{monthLabel(month)}</span>
            <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={!canNext} className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer" aria-label="Mois suivant">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="text-[11px] font-semibold text-gray-400 py-1">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const disabled = d < minDate || d > maxDate;
              const selected = d === value;
              const count = saved[d] ?? 0;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(d)}
                  aria-label={formatDateFr(d)}
                  aria-current={selected ? 'date' : undefined}
                  className={`relative h-10 rounded-xl text-sm font-semibold transition cursor-pointer disabled:cursor-not-allowed ${
                    selected
                      ? 'bg-emerald-600 text-white'
                      : disabled
                        ? 'text-gray-300'
                        : d === maxDate
                          ? 'text-emerald-700 ring-1 ring-emerald-500 hover:bg-emerald-50'
                          : 'text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  {Number(d.slice(8))}
                  {count > 0 && !disabled && (
                    <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : count >= 2 ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Matin + soir
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> 1 service
            </span>
            <button type="button" onClick={() => pick(maxDate)} disabled={isToday} className="ml-auto px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-semibold disabled:opacity-40 cursor-pointer">
              Aujourd'hui
            </button>
          </div>
          <p className="mt-2 text-[10px] text-gray-400 text-center">
            Du {formatDateFr(minDate, false)} au {formatDateFr(maxDate, false)}
          </p>
        </div>
      )}
    </div>
  );
};
