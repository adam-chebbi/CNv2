import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Download, HandCoins, KeyRound, ListChecks, LoaderCircle, Trash2, X } from 'lucide-react';
import { AVANCE_MOTIFS, addDays, formatDT, formatDateFr, normalizeName, type Avance, type AvanceEmploye } from '../../shared/model';
import { api, errorText, NetworkError } from '../api/client';
import { Alert, Amount, MoneyInput, formatDateTime, useToast } from '../components/ui';
import { useDirtyGuard } from '../lib/pwa';

// Avances au personnel — a separate record, never part of the caisse. Flow: form → confirmation
// (with the "cannot be undone" warning) → saved. Deleting is possible only within 24 h, by the
// author, after re-entering the password; the list shows how long that remains possible.

const pad = (n: number) => String(n).padStart(2, '0');
const nowParts = () => {
  const d = new Date();
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, heure: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};
const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;
const dt = (m: number) => (m / 1000).toFixed(3).replace('.', ',');
const remaining = (until: string) => {
  const ms = new Date(until).getTime() - Date.now();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} h ${pad(m)}` : `${m} min`;
};

type Step = 'form' | 'confirm' | 'done';

const NewAvance: React.FC<{ minDate: string; onSaved: () => void }> = ({ minDate, onSaved }) => {
  const [step, setStep] = useState<Step>('form');
  const [employe, setEmploye] = useState('');
  const [montant, setMontant] = useState<number | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [manual, setManual] = useState(false);
  const [date, setDate] = useState(() => nowParts().date);
  const [heure, setHeure] = useState(() => nowParts().heure);
  const [clock, setClock] = useState(nowParts);
  const [names, setNames] = useState<AvanceEmploye[]>([]);
  const [focused, setFocused] = useState(false);
  const [month, setMonth] = useState<{ nb: number; total: number } | null>(null);
  const [saved, setSaved] = useState<Avance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useDirtyGuard(step !== 'done' && (employe.trim().length > 0 || montant !== null));

  useEffect(() => {
    api.get<{ items: AvanceEmploye[] }>('/avances/employes').then((r) => setNames(r.items), () => undefined);
  }, [saved]);

  useEffect(() => {
    const id = setInterval(() => setClock(nowParts()), 15000);
    return () => clearInterval(id);
  }, []);

  const suggestions = useMemo(() => {
    const q = normalizeName(employe);
    return names.filter((n) => !q || normalizeName(n.nom).includes(q)).filter((n) => normalizeName(n.nom) !== q).slice(0, 6);
  }, [names, employe]);

  const when = manual ? { date, heure } : clock;
  const maxDate = nowParts().date;

  const toConfirm = async () => {
    setError(null);
    if (employe.trim().length < 2) return setError("Indiquez le nom de l'employé.");
    if (!montant || montant <= 0) return setError("Saisissez le montant de l'avance.");
    if (manual) {
      if (!date || !heure) return setError("Indiquez la date et l'heure.");
      if (new Date(`${date}T${heure}:00`).getTime() > Date.now() + 2 * 60 * 1000) return setError("La date et l'heure ne peuvent pas être dans le futur.");
      if (date < minDate) return setError(`Date trop ancienne : pas avant le ${formatDateFr(minDate, false)}.`);
    }
    setMonth(null);
    api.get<{ nb: number; total: number }>(`/avances/employe-mois?nom=${encodeURIComponent(employe.trim())}`).then(setMonth, () => undefined);
    setStep('confirm');
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ item: Avance }>('/avances', {
        id: crypto.randomUUID(),
        employe: employe.trim(),
        montant,
        motif,
        commentaire: commentaire.trim() || null,
        saisieManuelle: manual,
        ...(manual ? { date, heure } : {}),
      });
      setSaved(res.item);
      setStep('done');
      onSaved();
    } catch (e) {
      setError(e instanceof NetworkError ? "Pas de connexion : l'avance n'a pas été enregistrée. Réessayez dès que le réseau revient." : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep('form');
    setEmploye('');
    setMontant(null);
    setMotif(null);
    setCommentaire('');
    setManual(false);
    setSaved(null);
    setError(null);
  };

  if (step === 'done' && saved)
    return (
      <div className="text-center py-6 animate-fade-up">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
          <CheckCircle2 size={28} className="text-emerald-600" />
        </span>
        <p className="text-lg font-bold text-gray-900">Avance enregistrée</p>
        <p className="text-sm text-gray-600 mt-1">
          {saved.employe} · <b>{formatDT(saved.montant)}</b>
        </p>
        <p className="text-xs text-gray-400 mt-1 first-letter:uppercase">
          {formatDateFr(saved.date)} à {saved.heure}
        </p>
        <p className="text-[11px] text-gray-400 mt-3">Supprimable avec votre mot de passe jusqu’au {formatDateTime(saved.supprimableJusqua)}.</p>
        <button onClick={reset} className="mt-5 w-full py-3.5 rounded-2xl bg-violet-600 text-white font-bold cursor-pointer">
          Nouvelle avance
        </button>
      </div>
    );

  if (step === 'confirm')
    return (
      <div className="space-y-4 animate-fade-up">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">Employé</span>
            <b className="text-gray-900 text-right">{employe.trim()}</b>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">Montant</span>
            <b className="text-violet-700 text-lg">{formatDT(montant ?? 0)}</b>
          </div>
          {motif && (
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Motif</span>
              <span className="text-gray-900">{motif}</span>
            </div>
          )}
          {commentaire.trim() && <p className="text-gray-600 text-xs">« {commentaire.trim()} »</p>}
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">Date et heure</span>
            <span className="text-gray-900 text-right first-letter:uppercase">
              {formatDateFr(when.date)} à {when.heure}
              {manual && <span className="block text-[11px] text-amber-700 normal-case">saisies manuellement</span>}
            </span>
          </div>
          {month && month.nb > 0 && (
            <p className="text-xs text-violet-800 bg-violet-50 rounded-xl px-3 py-2">
              Déjà ce mois pour {employe.trim()} : {month.nb} avance(s) · {formatDT(month.total)}
            </p>
          )}
        </div>
        <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle size={18} className="shrink-0 text-amber-600" />
          <p>
            <b>Attention :</b> après confirmation, cette avance ne pourra plus être modifiée. Elle pourra être supprimée uniquement <b>dans les 24 heures</b>, et
            seulement en saisissant <b>votre mot de passe</b>. Passé ce délai, elle ne pourra plus jamais être supprimée.
          </p>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setStep('form')} disabled={busy} className="py-3.5 rounded-2xl border border-gray-200 bg-white font-semibold text-gray-700 cursor-pointer">
            Modifier
          </button>
          <button onClick={confirm} disabled={busy} className="py-3.5 rounded-2xl bg-violet-600 text-white font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
            {busy && <LoaderCircle size={16} className="animate-spin" />}
            Confirmer
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="relative">
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Employé</label>
        <input
          value={employe}
          onChange={(e) => setEmploye(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Nom de l'employé"
          autoComplete="off"
          className="w-full px-3 py-3 text-base rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
        />
        {focused && suggestions.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((n) => (
              <button
                key={n.nom}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => (setEmploye(n.nom), setFocused(false))}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-violet-50 cursor-pointer"
              >
                <span className="font-semibold text-gray-800">{n.nom}</span>
                <span className="text-[11px] text-gray-400">{n.nb} avance(s)</span>
              </button>
            ))}
          </div>
        )}
        {names.length === 0 && <p className="mt-1 text-[11px] text-gray-400">Le nom sera mémorisé et proposé la prochaine fois.</p>}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Montant</label>
        <MoneyInput value={montant} onChange={setMontant} large />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Motif (facultatif)</label>
        <div className="flex flex-wrap gap-1.5">
          {AVANCE_MOTIFS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMotif(motif === m ? null : m)}
              className={`px-3 py-2 rounded-xl border text-sm font-semibold cursor-pointer ${motif === m ? 'border-violet-500 bg-violet-50 text-violet-800' : 'border-gray-200 text-gray-600'}`}
            >
              {m}
            </button>
          ))}
        </div>
        {motif === 'Autre' && (
          <input
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Précisez…"
            className="mt-2 w-full px-3 py-2.5 text-base rounded-xl border border-gray-200 focus:outline-none focus:border-violet-500"
          />
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <CalendarClock size={16} className="text-violet-600 shrink-0" />
          {manual ? <span className="font-semibold">Date et heure saisies manuellement</span> : <span className="first-letter:uppercase">{formatDateFr(clock.date)} · {clock.heure}</span>}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={manual}
            onChange={(e) => {
              setManual(e.target.checked);
              if (e.target.checked) {
                setDate(nowParts().date);
                setHeure(nowParts().heure);
              }
            }}
            className="w-5 h-5 accent-violet-600"
          />
          Saisir la date et l'heure manuellement
        </label>
        {manual && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-base" aria-label="Date de l'avance" />
            <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-base" aria-label="Heure de l'avance" />
          </div>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      <button onClick={toConfirm} className="w-full py-4 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-base font-bold cursor-pointer">
        Continuer
      </button>
      <p className="text-[11px] text-gray-400 text-center">L’avance est enregistrée à part : elle ne change ni la caisse ni le chiffre d’affaires.</p>
    </div>
  );
};

const DeleteDialog: React.FC<{ avance: Avance; onClose: () => void; onDeleted: () => void }> = ({ avance, onClose, onDeleted }) => {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!password) return setError('Saisissez votre mot de passe.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/avances/${avance.id}/supprimer`, { password });
      onDeleted();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3 animate-sheet-up sm:animate-fade-up">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-rose-600" />
          <p className="font-bold text-gray-900">Supprimer cette avance ?</p>
        </div>
        <p className="text-sm text-gray-600">
          {avance.employe} · <b>{formatDT(avance.montant)}</b> · {formatDateFr(avance.date, false)} {avance.heure}
        </p>
        <p className="text-xs text-gray-500">Pour confirmer, saisissez votre mot de passe (le même que pour vous connecter).</p>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="Mot de passe"
          className="w-full px-3 py-3 text-base rounded-xl border border-gray-200 focus:outline-none focus:border-rose-500"
        />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="py-3 rounded-xl border border-gray-200 font-semibold text-gray-700 cursor-pointer">
            Annuler
          </button>
          <button onClick={submit} disabled={busy} className="py-3 rounded-xl bg-rose-600 text-white font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
            {busy && <LoaderCircle size={15} className="animate-spin" />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
};

const AvanceList: React.FC<{ minDate: string; refreshKey: number }> = ({ minDate, refreshKey }) => {
  const today = nowParts().date;
  const clamp = (d: string) => (d < minDate ? minDate : d);
  const [preset, setPreset] = useState('mois');
  const [from, setFrom] = useState(() => clamp(firstOfMonth(today)));
  const [to, setTo] = useState(today);
  const [employe, setEmploye] = useState('');
  const [names, setNames] = useState<AvanceEmploye[]>([]);
  const [data, setData] = useState<{ items: Avance[]; total: number; parEmploye: { employe: string; nb: number; total: number }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Avance | null>(null);
  const [reload, setReload] = useState(0);
  const toast = useToast();

  useEffect(() => {
    api.get<{ items: AvanceEmploye[] }>('/avances/employes').then((r) => setNames(r.items), () => undefined);
  }, [refreshKey, reload]);

  useEffect(() => {
    setData(null);
    setError(null);
    const p = new URLSearchParams({ from, to });
    if (employe) p.set('employe', employe);
    api.get<NonNullable<typeof data>>(`/avances?${p}`).then(setData, (e) => setError(errorText(e)));
  }, [from, to, employe, refreshKey, reload]);

  const applyPreset = (p: string) => {
    setPreset(p);
    if (p === '7') setFrom(clamp(addDays(today, -6)));
    if (p === 'mois') setFrom(clamp(firstOfMonth(today)));
    if (p === 'tout') setFrom(minDate);
    setTo(today);
  };

  const exportCsv = () => {
    if (!data) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      ['Date', 'Heure', 'Employé', 'Montant', 'Motif', 'Commentaire', 'Date saisie manuellement', 'Saisie par', 'Enregistrée le'],
      ...data.items.map((a) => [a.date, a.heure, a.employe, dt(a.montant), a.motif ?? '', a.commentaire ?? '', a.saisieManuelle ? 'oui' : 'non', a.creeParNom, formatDateTime(a.creeLe)]),
    ];
    const blob = new Blob([`﻿${rows.map((r) => r.map(esc).join(';')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `avances-${from}-au-${to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          ['7', '7 jours'],
          ['mois', 'Ce mois'],
          ['tout', 'Tout'],
        ].map(([id, l]) => (
          <button key={id} onClick={() => applyPreset(id)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${preset === id ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {l}
          </button>
        ))}
        <input type="date" value={from} min={minDate} max={to} onChange={(e) => e.target.value && (setFrom(e.target.value), setPreset(''))} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm" aria-label="Du" />
        <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && (setTo(e.target.value), setPreset(''))} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm" aria-label="Au" />
      </div>
      <div className="flex gap-2">
        <select value={employe} onChange={(e) => setEmploye(e.target.value)} className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm">
          <option value="">Tous les employés</option>
          {names.map((n) => (
            <option key={n.nom} value={n.nom}>
              {n.nom}
            </option>
          ))}
        </select>
        {data && data.items.length > 0 && (
          <button onClick={exportCsv} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 flex items-center gap-1.5 cursor-pointer">
            <Download size={15} /> CSV
          </button>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {!data && !error && (
        <div className="flex justify-center py-10">
          <LoaderCircle size={22} className="animate-spin text-violet-600" />
        </div>
      )}
      {data && (
        <>
          <div className="rounded-2xl bg-violet-50 border border-violet-100 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-violet-800">Total des avances</span>
              <Amount value={data.total} className="text-lg font-extrabold text-violet-800" />
            </div>
            {!employe && data.parEmploye.length > 1 && (
              <ul className="mt-2 space-y-1">
                {data.parEmploye.map((e) => (
                  <li key={e.employe}>
                    <button onClick={() => setEmploye(e.employe)} className="w-full flex justify-between text-xs text-violet-900 hover:underline cursor-pointer">
                      <span>
                        {e.employe} · {e.nb} avance(s)
                      </span>
                      <Amount value={e.total} className="font-bold" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {data.items.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Aucune avance sur cette période.</p>
          ) : (
            <ul className="space-y-2">
              {data.items.map((a) => (
                <li key={a.id} className="bg-white border border-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-9 h-9 rounded-full bg-violet-50 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0">
                      {a.employe
                        .split(' ')
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{a.employe}</p>
                      <p className="text-[11px] text-gray-500">
                        {formatDateFr(a.date, false)} · {a.heure}
                        {a.saisieManuelle && <span className="normal-case text-amber-700"> · saisie manuelle</span>}
                      </p>
                    </div>
                    <Amount value={a.montant} className="text-base font-extrabold text-violet-700" />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-400">
                    <span className="flex-1">
                      {a.motif ? `${a.motif}${a.commentaire ? ` (${a.commentaire})` : ''} · ` : ''}donnée par {a.creeParNom}
                    </span>
                    {a.supprimable && (
                      <button onClick={() => setDeleting(a)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer" title={`Supprimable encore ${remaining(a.supprimableJusqua)}`}>
                        <Trash2 size={12} /> Supprimer ({remaining(a.supprimableJusqua)})
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {deleting && (
        <DeleteDialog
          avance={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            toast('Avance supprimée.');
            setReload((r) => r + 1);
          }}
        />
      )}
    </div>
  );
};

export const AvanceModal: React.FC<{ open: boolean; onClose: () => void; minDate: string }> = ({ open, onClose, minDate }) => {
  const [tab, setTab] = useState<'new' | 'list'>('new');
  const [savedCount, setSavedCount] = useState(0);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Avances au personnel">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg h-[94dvh] sm:h-auto sm:max-h-[90dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-2xl shadow-xl animate-sheet-up sm:animate-fade-up">
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <HandCoins size={20} className="text-violet-600" />
            <h2 className="flex-1 text-lg font-bold text-gray-900">Avances au personnel</h2>
            <button onClick={onClose} className="p-2 rounded-xl bg-gray-100 text-gray-700 cursor-pointer" aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100">
            <button onClick={() => setTab('new')} className={`py-2 rounded-lg text-sm font-semibold cursor-pointer ${tab === 'new' ? 'bg-white shadow-xs text-violet-700' : 'text-gray-500'}`}>
              Nouvelle avance
            </button>
            <button onClick={() => setTab('list')} className={`py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${tab === 'list' ? 'bg-white shadow-xs text-violet-700' : 'text-gray-500'}`}>
              <ListChecks size={15} /> Liste des avances
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {tab === 'new' ? <NewAvance minDate={minDate} onSaved={() => setSavedCount((n) => n + 1)} /> : <AvanceList minDate={minDate} refreshKey={savedCount} />}
        </div>
      </div>
    </div>
  );
};
