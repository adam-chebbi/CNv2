import React, { useEffect, useState } from 'react';
import { ChevronRight, Download, History, LoaderCircle, Moon, Sun, X } from 'lucide-react';
import { SHIFT_LABELS, addDays, formatDateFr, type CaisseRecord } from '../../shared/model';
import { api, errorText } from '../api/client';
import { Alert, Amount } from '../components/ui';

interface Totals {
  ca: number;
  depenses: number;
  caisse: number;
  tpe: number;
  ticketsResto: number;
  especes: number;
}

const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;
const dt = (m: number) => (m / 1000).toFixed(3).replace('.', ',');

const downloadCsv = (name: string, items: CaisseRecord[]) => {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    ['Date', 'Service', "Chiffre d'affaires", 'Dépenses', 'Détail des dépenses', 'Doit être en caisse', 'TPE', 'Ticket resto', 'Espèces', 'Saisi par', 'Modifié par'],
    ...items.map((i) => [
      i.date,
      SHIFT_LABELS[i.shift],
      dt(i.ca),
      dt(i.totalDepenses),
      i.depenses.map((d) => `${d.libelle} ${dt(d.montant)}`).join(' | '),
      dt(i.attenduCaisse),
      dt(i.tpe),
      dt(i.ticketsResto),
      dt(i.especes),
      i.creeParNom,
      i.majParNom ?? '',
    ]),
  ];
  const blob = new Blob([`﻿${rows.map((r) => r.map(esc).join(';')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// Fullscreen history of every saved service, opened from the terminal's "Historique" button.
export const HistoriqueModal: React.FC<{
  open: boolean;
  onClose: () => void;
  minDate: string;
  maxDate: string;
  onOpenRecord: (r: CaisseRecord) => void;
}> = ({ open, onClose, minDate, maxDate, onOpenRecord }) => {
  const clamp = (d: string) => (d < minDate ? minDate : d > maxDate ? maxDate : d);
  const [preset, setPreset] = useState('7');
  const [from, setFrom] = useState(() => clamp(addDays(maxDate, -6)));
  const [to, setTo] = useState(maxDate);
  const [data, setData] = useState<{ items: CaisseRecord[]; totals: Totals } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const applyPreset = (p: string) => {
    setPreset(p);
    if (p === '7') setFrom(clamp(addDays(maxDate, -6)));
    if (p === '30') setFrom(clamp(addDays(maxDate, -29)));
    if (p === 'mois') setFrom(clamp(firstOfMonth(maxDate)));
    if (p === 'tout') setFrom(minDate);
    setTo(maxDate);
  };

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError(null);
    api.get<{ items: CaisseRecord[]; totals: Totals }>(`/caisse?from=${from}&to=${to}`).then(setData, (e) => setError(errorText(e)));
  }, [open, from, to]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const TOTALS: { key: keyof Totals; label: string; tone: string }[] = [
    { key: 'ca', label: "Chiffre d'affaires", tone: 'text-gray-900' },
    { key: 'depenses', label: 'Dépenses', tone: 'text-rose-600' },
    { key: 'caisse', label: 'Caisse', tone: 'text-gray-900' },
    { key: 'tpe', label: 'TPE', tone: 'text-blue-700' },
    { key: 'ticketsResto', label: 'Ticket resto', tone: 'text-amber-700' },
    { key: 'especes', label: 'Espèces', tone: 'text-emerald-700' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col animate-fade-up" role="dialog" aria-modal="true" aria-label="Historique">
      <div className="shrink-0 bg-white border-b border-gray-100 px-3 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="max-w-5xl mx-auto flex items-center gap-2">
          <History size={20} className="text-emerald-600" />
          <h2 className="flex-1 text-lg font-bold text-gray-900">Historique</h2>
          {data && data.items.length > 0 && (
            <button onClick={() => downloadCsv(`caisse-${from}-au-${to}.csv`, data.items)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 cursor-pointer">
              <Download size={15} /> <span className="hidden sm:inline">Exporter</span>
            </button>
          )}
          <button onClick={onClose} className="p-2 rounded-xl bg-gray-100 text-gray-700 cursor-pointer" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        <div className="max-w-5xl mx-auto mt-3 flex flex-wrap items-center gap-2">
          {[
            ['7', '7 jours'],
            ['30', '30 jours'],
            ['mois', 'Ce mois'],
            ['tout', 'Tout'],
          ].map(([id, l]) => (
            <button
              key={id}
              onClick={() => applyPreset(id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${preset === id ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {l}
            </button>
          ))}
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <input type="date" value={from} min={minDate} max={to} onChange={(e) => e.target.value && (setFrom(e.target.value), setPreset(''))} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm" aria-label="Du" />
            →
            <input type="date" value={to} min={from} max={maxDate} onChange={(e) => e.target.value && (setTo(e.target.value), setPreset(''))} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm" aria-label="Au" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          {!data && !error && (
            <div className="flex justify-center py-16">
              <LoaderCircle size={24} className="animate-spin text-emerald-600" />
            </div>
          )}
          {data && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {TOTALS.map((t) => (
                  <div key={t.key} className="rounded-2xl bg-white border border-gray-100 px-3 py-2.5">
                    <p className="text-[11px] text-gray-500">{t.label}</p>
                    <Amount value={data.totals[t.key]} className={`text-base font-bold ${t.tone}`} />
                  </div>
                ))}
              </div>

              {data.items.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-12">Aucune caisse enregistrée sur cette période.</p>
              ) : (
                <ul className="space-y-2">
                  {data.items.map((r) => {
                    const Icon = r.shift === 'soir' ? Moon : Sun;
                    const isOpen = expanded === r.id;
                    return (
                      <li key={r.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                        <button onClick={() => setExpanded(isOpen ? null : r.id)} className="w-full text-left px-4 py-3 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <Icon size={16} className="text-gray-400 shrink-0" />
                            <span className="flex-1 text-sm font-bold text-gray-900 capitalize truncate">
                              {formatDateFr(r.date)} · {SHIFT_LABELS[r.shift]}
                            </span>
                            <ChevronRight size={16} className={`text-gray-300 transition ${isOpen ? 'rotate-90' : ''}`} />
                          </div>
                          <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-1.5 text-xs">
                            {[
                              ['CA', r.ca, 'text-gray-900'],
                              ['Dépenses', r.totalDepenses, 'text-rose-600'],
                              ['Caisse', r.attenduCaisse, 'text-gray-900'],
                              ['TPE', r.tpe, 'text-blue-700'],
                              ['Ticket resto', r.ticketsResto, 'text-amber-700'],
                              ['Espèces', r.especes, 'text-emerald-700'],
                            ].map(([l, v, tone]) => (
                              <div key={l as string}>
                                <p className="text-[10px] text-gray-400">{l}</p>
                                <Amount value={v as number} className={`font-bold ${tone}`} />
                              </div>
                            ))}
                          </div>
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 pt-1 border-t border-gray-50 text-xs text-gray-600 space-y-2">
                            {r.depenses.length > 0 ? (
                              <ul className="space-y-1">
                                {r.depenses.map((d, i) => (
                                  <li key={i} className="flex justify-between gap-3">
                                    <span>{d.libelle}</span>
                                    <Amount value={d.montant} className="font-semibold" />
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p>Aucune dépense.</p>
                            )}
                            <p className="text-gray-400">
                              Saisi par {r.creeParNom}
                              {r.majParNom ? ` · modifié par ${r.majParNom}` : ''}
                            </p>
                            <button onClick={() => onOpenRecord(r)} className="w-full py-2.5 rounded-xl bg-emerald-50 text-emerald-800 font-semibold cursor-pointer">
                              Ouvrir dans la caisse
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
