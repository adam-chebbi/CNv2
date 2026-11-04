import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  CreditCard,
  Download,
  HandCoins,
  KeyRound,
  History,
  LoaderCircle,
  Lock,
  LogOut,
  Moon,
  Plus,
  Sun,
  Ticket,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  SHIFTS,
  addDays,
  computeCaisse,
  formatDateFr,
  validateCaisse,
  type CaisseRecord,
  type DepenseLigne,
  type ShiftId,
} from '../../shared/model';
import { api, errorText, NetworkError } from '../api/client';
import { flushOutbox, saveOrQueue, useOutbox } from '../api/outbox';
import { useAuth } from '../auth/AuthContext';
import { Alert, Amount, MoneyInput, formatDateTime, useToast } from '../components/ui';
import { applyUpdate, useDirtyGuard, useInstallPrompt, useUpdateAvailable } from '../lib/pwa';
import { AvanceModal } from './AvanceModal';
import { HistoriqueModal } from './HistoriqueModal';
import { CalendarPicker } from '../components/CalendarPicker';
import { ChangePasswordModal } from '../components/ChangePasswordModal';

interface DayResponse {
  date: string;
  items: CaisseRecord[];
  canWrite: boolean;
  reason: string | null;
}

interface FormState {
  ca: number | null;
  depenses: { libelle: string; montant: number | null }[];
  tpe: number | null;
  ticketsResto: number | null;
}

const EMPTY: FormState = { ca: null, depenses: [], tpe: null, ticketsResto: null };

const fromRecord = (r: CaisseRecord | undefined): FormState =>
  r ? { ca: r.ca, depenses: r.depenses.map((d) => ({ ...d })), tpe: r.tpe, ticketsResto: r.ticketsResto } : { ...EMPTY, depenses: [] };

const SHIFT_ICONS: Record<ShiftId, React.ComponentType<{ size?: number; className?: string }>> = { matin: Sun, soir: Moon };

const readUrl = () => {
  const p = new URLSearchParams(window.location.search);
  return { date: p.get('date'), shift: p.get('service') };
};

// Default service from the clock: evening after 15h, or after midnight until the day switches.
const defaultShift = (): ShiftId => {
  const h = new Date().getHours();
  return h >= 15 || h < 5 ? 'soir' : 'matin';
};

const Step: React.FC<{ n: number; title: string; children: React.ReactNode; tone?: 'default' | 'dark' }> = ({ n, title, children, tone = 'default' }) => (
  <section className={`rounded-3xl p-4 sm:p-5 ${tone === 'dark' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-100 shadow-xs'}`}>
    <h2 className={`flex items-center gap-2.5 text-sm font-bold mb-3 ${tone === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
      <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center ${tone === 'dark' ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>{n}</span>
      {title}
    </h2>
    {children}
  </section>
);

export const Terminal: React.FC = () => {
  const { user, businessDate, dateDebut, logout } = useAuth();
  const toast = useToast();
  const pending = useOutbox();
  const updateAvailable = useUpdateAvailable();
  const { canInstall, promptInstall } = useInstallPrompt();
  const minDate = dateDebut && dateDebut <= businessDate ? dateDebut : businessDate;

  const initial = readUrl();
  const clampDate = (d: string | null) => (d && d >= minDate && d <= businessDate ? d : businessDate);
  const [date, setDate] = useState(() => clampDate(initial.date));
  const [shift, setShift] = useState<ShiftId>(() => (initial.shift === 'matin' || initial.shift === 'soir' ? initial.shift : defaultShift()));
  const [day, setDay] = useState<DayResponse | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [avanceOpen, setAvanceOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const requested = useRef('');

  useDirtyGuard(dirty);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Keep date/service in the URL so a reload (or the PWA reopening) lands on the same screen.
  useEffect(() => {
    const p = new URLSearchParams();
    if (date !== businessDate) p.set('date', date);
    p.set('service', shift);
    window.history.replaceState(null, '', `/?${p}`);
  }, [date, shift, businessDate]);

  const load = useCallback(async () => {
    const key = date;
    requested.current = key;
    setLoading(true);
    setError(null);
    try {
      const d = await api.get<DayResponse>(`/caisse/${date}`);
      if (requested.current !== key) return;
      setDay(d);
      try {
        localStorage.setItem(`historique:caisse:${date}`, JSON.stringify(d));
      } catch {
        // ignore
      }
    } catch (e) {
      if (requested.current !== key) return;
      const cached = localStorage.getItem(`historique:caisse:${date}`);
      if (e instanceof NetworkError && cached) setDay(JSON.parse(cached));
      else if (e instanceof NetworkError) setDay({ date, items: [], canWrite: true, reason: null });
      else setError(errorText(e));
    } finally {
      if (requested.current === key) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setDay(null);
    void load();
  }, [load]);

  const record = day?.items.find((i) => i.shift === shift);

  // Refill the form whenever the day/service changes or fresh data arrives.
  useEffect(() => {
    if (!day) return;
    setForm(fromRecord(record));
    setDirty(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, shift]);

  const confirmLeave = () => !dirty || window.confirm('Les montants saisis ne sont pas enregistrés. Continuer sans enregistrer ?');
  const goDate = (d: string) => {
    if (d < minDate || d > businessDate || d === date || !confirmLeave()) return;
    setDate(d);
  };
  const goShift = (s: ShiftId) => {
    if (s === shift || !confirmLeave()) return;
    setShift(s);
  };

  const update = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    setError(null);
  };
  const updateDepense = (i: number, patch: Partial<FormState['depenses'][number]>) =>
    update({ depenses: form.depenses.map((d, j) => (j === i ? { ...d, ...patch } : d)) });

  const input = useMemo(
    () => ({
      ca: form.ca ?? 0,
      depenses: form.depenses.filter((d) => d.libelle.trim() || d.montant).map<DepenseLigne>((d) => ({ libelle: d.libelle.trim(), montant: d.montant ?? 0 })),
      tpe: form.tpe ?? 0,
      ticketsResto: form.ticketsResto ?? 0,
    }),
    [form]
  );
  const calc = computeCaisse(input);
  const readOnly = day ? !day.canWrite : false;

  const save = async () => {
    const problem = validateCaisse(input);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await saveOrQueue<{ item: CaisseRecord }>(`/caisse/${date}/${shift}`, input, `caisse:${date}:${shift}`, `Caisse ${shift} du ${date}`);
      setDirty(false);
      if (res.queued) {
        toast('Pas de connexion : enregistré sur cet appareil, envoi automatique dès le retour du réseau.', 'info');
      } else {
        toast('Caisse enregistrée.');
        await load();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const especesNegative = calc.especes < 0;
  const isToday = date === businessDate;

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-50">
      {/* Header: identity, date filter, history */}
      <header className="shrink-0 bg-white/95 backdrop-blur-md border-b border-gray-100 px-3 sm:px-6 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 z-20">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <img src="/logo.png" alt="Café Noir" className="hidden min-[440px]:block h-8 w-auto shrink-0" />
          <div className="flex-1 min-w-0 flex items-center justify-center gap-1">
            <button onClick={() => goDate(addDays(date, -1))} disabled={date <= minDate} className="hidden min-[420px]:block p-2 rounded-xl border border-gray-200 text-gray-500 disabled:opacity-30 cursor-pointer" aria-label="Jour précédent">
              <ChevronLeft size={18} />
            </button>
            <CalendarPicker value={date} minDate={minDate} maxDate={businessDate} onChange={goDate} refreshKey={day} />
            <button onClick={() => goDate(addDays(date, 1))} disabled={date >= businessDate} className="hidden min-[420px]:block p-2 rounded-xl border border-gray-200 text-gray-500 disabled:opacity-30 cursor-pointer" aria-label="Jour suivant">
              <ChevronRight size={18} />
            </button>
          </div>
          <button onClick={() => setHistoryOpen(true)} className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold cursor-pointer active:scale-95 transition shrink-0">
            <History size={16} />
            Historique
          </button>
          <button onClick={() => setAvanceOpen(true)} className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold cursor-pointer active:scale-95 transition shrink-0">
            <HandCoins size={16} />
            Avance
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 text-sm font-bold flex items-center justify-center cursor-pointer"
              aria-label="Mon compte"
            >
              {(user?.fullName ?? '?').trim().slice(0, 1).toUpperCase()}
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 z-40 bg-white border border-gray-100 rounded-2xl shadow-lg p-2">
                  <p className="px-2 py-1.5 text-xs font-semibold text-gray-800 truncate">{user?.fullName}</p>
                  {canInstall && (
                    <button onClick={() => (setMenuOpen(false), void promptInstall())} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-emerald-700 hover:bg-emerald-50 cursor-pointer">
                      <Download size={15} /> Installer l’application
                    </button>
                  )}
                  <button onClick={() => (setMenuOpen(false), setPasswordOpen(true))} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                    <KeyRound size={15} /> Changer mon mot de passe
                  </button>
                  <button onClick={() => (setMenuOpen(false), void logout())} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 cursor-pointer">
                    <LogOut size={15} /> Déconnexion
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {(offline || pending.length > 0 || updateAvailable) && (
        <div className="shrink-0">
          {offline && (
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-xs">
              <CloudOff size={14} /> Pas de connexion — vous pouvez quand même enregistrer, l’envoi se fera automatiquement.
            </div>
          )}
          {pending.length > 0 && (
            <div className={`flex items-center gap-2 px-4 py-2 text-xs ${pending.some((p) => p.error) ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'}`}>
              <span className="flex-1">
                {pending.length} enregistrement(s) en attente d’envoi.{pending.find((p) => p.error) ? ` Refusé : ${pending.find((p) => p.error)!.error}` : ''}
              </span>
              <button onClick={() => void flushOutbox()} className="font-semibold underline cursor-pointer">
                Réessayer
              </button>
            </div>
          )}
          {updateAvailable && (
            <button onClick={applyUpdate} className="w-full flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-800 text-xs cursor-pointer">
              <Download size={14} /> Nouvelle version disponible — toucher pour mettre à jour.
            </button>
          )}
        </div>
      )}

      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-4 pb-32 space-y-3">
          {/* Service */}
          <div className="grid grid-cols-2 gap-2">
            {SHIFTS.map((s) => {
              const Icon = SHIFT_ICONS[s.id];
              const done = day?.items.some((i) => i.shift === s.id);
              const active = shift === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => goShift(s.id)}
                  className={`relative flex items-center justify-center gap-2 py-4 rounded-2xl border-2 text-base font-bold transition cursor-pointer ${
                    active ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-white text-gray-500'
                  }`}
                >
                  <Icon size={20} />
                  {s.label}
                  {done && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center" title="Déjà enregistré">
                      <Check size={12} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loading && !day ? (
            <div className="flex justify-center py-16">
              <LoaderCircle size={24} className="animate-spin text-emerald-600" />
            </div>
          ) : (
            <>
              {readOnly && day?.reason && (
                <Alert tone="info">
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Lock size={12} /> Consultation seulement.
                  </span>{' '}
                  {day.reason}
                </Alert>
              )}
              {record && (
                <p className="text-xs text-gray-500 text-center">
                  Enregistré par {record.creeParNom} le {formatDateTime(record.creeLe)}
                  {record.majLe && ` · modifié par ${record.majParNom} le ${formatDateTime(record.majLe)}`}
                </p>
              )}

              <Step n={1} title="Chiffre d'affaires">
                <MoneyInput value={form.ca} onChange={(v) => update({ ca: v })} disabled={readOnly} large />
              </Step>

              <Step n={2} title="Dépenses du jour (payées avec l’argent de la caisse)">
                <div className="space-y-2">
                  {form.depenses.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        className="flex-1 min-w-0 px-3 py-3 text-base rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 disabled:bg-gray-50"
                        placeholder="Ex. : lait, pain, gaz…"
                        value={d.libelle}
                        disabled={readOnly}
                        onChange={(e) => updateDepense(i, { libelle: e.target.value })}
                      />
                      <MoneyInput value={d.montant} onChange={(v) => updateDepense(i, { montant: v })} disabled={readOnly} className="w-36 sm:w-44 shrink-0" />
                      {!readOnly && (
                        <button onClick={() => update({ depenses: form.depenses.filter((_, j) => j !== i) })} className="p-2.5 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" aria-label="Supprimer cette dépense">
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                  {!readOnly && (
                    <button
                      onClick={() => update({ depenses: [...form.depenses, { libelle: '', montant: null }] })}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-600 hover:border-emerald-400 hover:text-emerald-700 cursor-pointer"
                    >
                      <Plus size={16} /> Ajouter une dépense
                    </button>
                  )}
                  {form.depenses.length === 0 && readOnly && <p className="text-sm text-gray-400">Aucune dépense.</p>}
                  <div className="flex items-center justify-between pt-1 text-sm">
                    <span className="text-gray-500">Total des dépenses</span>
                    <Amount value={calc.totalDepenses} className="font-bold text-rose-600" />
                  </div>
                </div>
              </Step>

              <Step n={3} title="Doit être en caisse" tone="dark">
                <div className="flex items-end justify-between gap-3">
                  <p className="text-xs text-gray-400">Chiffre d'affaires − dépenses</p>
                  <Amount value={calc.attenduCaisse} className={`text-3xl sm:text-4xl font-extrabold ${calc.attenduCaisse < 0 ? 'text-rose-400' : 'text-emerald-400'}`} />
                </div>
              </Step>

              <Step n={4} title="Comptage de la caisse">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <CreditCard size={18} />
                    </span>
                    <label className="flex-1 text-sm font-semibold text-gray-800">TPE (carte)</label>
                    <MoneyInput value={form.tpe} onChange={(v) => update({ tpe: v })} disabled={readOnly} className="w-40 sm:w-52" />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                      <Ticket size={18} />
                    </span>
                    <label className="flex-1 text-sm font-semibold text-gray-800">Ticket resto</label>
                    <MoneyInput value={form.ticketsResto} onChange={(v) => update({ ticketsResto: v })} disabled={readOnly} className="w-40 sm:w-52" />
                  </div>
                  <div className={`flex items-center gap-3 rounded-2xl p-3 ${especesNegative ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${especesNegative ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-700'}`}>
                      <Wallet size={18} />
                    </span>
                    <div className="flex-1">
                      <p className={`text-sm font-bold ${especesNegative ? 'text-rose-800' : 'text-emerald-900'}`}>Espèces</p>
                      <p className="text-[11px] text-gray-500">Le reste (calculé)</p>
                    </div>
                    <Amount value={calc.especes} className={`text-2xl font-extrabold ${especesNegative ? 'text-rose-600' : 'text-emerald-700'}`} />
                  </div>
                </div>
              </Step>

              {error && <Alert tone="error">{error}</Alert>}
            </>
          )}
        </div>
      </main>

      {!readOnly && day && (
        <div className="shrink-0 fixed inset-x-0 bottom-0 z-20 bg-white/95 backdrop-blur-md border-t border-gray-100 px-3 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={save}
              disabled={saving || (!dirty && Boolean(record))}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold shadow-lg shadow-emerald-600/20 active:scale-[0.99] transition disabled:opacity-50 cursor-pointer"
            >
              {saving ? <LoaderCircle size={20} className="animate-spin" /> : <Check size={20} />}
              {record && !dirty ? 'Enregistré' : record ? 'Enregistrer la correction' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <AvanceModal open={avanceOpen} onClose={() => setAvanceOpen(false)} minDate={minDate} />

      <HistoriqueModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        minDate={minDate}
        maxDate={businessDate}
        onOpenRecord={(r) => {
          if (!confirmLeave()) return;
          setHistoryOpen(false);
          setDirty(false);
          setShift(r.shift);
          setDate(r.date);
        }}
      />
    </div>
  );
};
