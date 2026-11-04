import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, X } from 'lucide-react';
import { formatDT } from '../../shared/model';

// Class recipes copied from the main app's panels (e.g. CashVerificationPanel.tsx) so both apps
// read as one product.
export const cls = {
  primary:
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm sm:text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100',
  secondary:
    'inline-flex items-center justify-center gap-2 px-3.5 py-2.5 sm:py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm sm:text-xs font-semibold text-gray-700 shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed',
  danger:
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm sm:text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60',
  ghost: 'inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition cursor-pointer disabled:opacity-50',
  input:
    'w-full px-3 py-2.5 sm:py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition disabled:bg-gray-50 disabled:text-gray-500',
  card: 'bg-white border border-gray-100 rounded-2xl shadow-xs',
  label: 'block text-xs font-semibold text-gray-700 mb-1.5',
};

export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <LoaderCircle size={size} className={`animate-spin text-emerald-600 ${className}`} />
);

export const Field: React.FC<{ label: string; hint?: string; error?: string | null; required?: boolean; children: React.ReactNode; className?: string }> = ({
  label,
  hint,
  error,
  required,
  children,
  className = '',
}) => (
  <div className={className}>
    <label className={cls.label}>
      {label}
      {required && <span className="text-rose-500"> *</span>}
    </label>
    {children}
    {hint && !error && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
  </div>
);

// Amount field in DT that hands the app integer millimes. Comma and dot are the same key (as in the
// main app's DecimalInput) and three decimals are kept.
export const MoneyInput: React.FC<{
  value: number | null;
  onChange: (millimes: number | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  large?: boolean;
}> = ({ value, onChange, placeholder = '0,000', autoFocus, disabled, id, className = '', large }) => {
  const toText = (v: number | null) => (v === null ? '' : String(v / 1000).replace('.', ','));
  const [text, setText] = useState(() => toText(value));
  const lastEmitted = useRef<number | null>(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(toText(value));
      lastEmitted.current = value;
    }
  }, [value]);

  const handle = (raw: string) => {
    let cleaned = '';
    let seenSep = false;
    let decimals = 0;
    for (const c of raw) {
      if (c >= '0' && c <= '9') {
        if (seenSep) {
          if (decimals >= 3) continue;
          decimals += 1;
        }
        cleaned += c;
      } else if ((c === ',' || c === '.') && !seenSep) {
        seenSep = true;
        cleaned += ',';
      }
    }
    setText(cleaned);
    const num = cleaned === '' || cleaned === ',' ? null : Math.round(Number(cleaned.replace(',', '.')) * 1000);
    lastEmitted.current = num;
    onChange(num);
  };

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onChange={(e) => handle(e.target.value)}
        className={`${cls.input} pr-11 tabular-nums font-semibold py-3 sm:py-3 text-base ${large ? '!text-3xl !py-4 font-extrabold text-center' : ''}`}
      />
      <span className={`absolute right-3 top-1/2 -translate-y-1/2 font-semibold text-gray-400 pointer-events-none ${large ? 'text-base' : 'text-xs'}`}>DT</span>
    </div>
  );
};

export const Amount: React.FC<{ value: number; sign?: boolean; className?: string }> = ({ value, sign, className = '' }) => (
  <span className={`tabular-nums whitespace-nowrap ${className}`}>{formatDT(value, { sign })}</span>
);

export const EcartBadge: React.FC<{ ecart: number; tolerance: number }> = ({ ecart, tolerance }) => {
  const ok = Math.abs(ecart) <= tolerance;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
        ok ? 'bg-emerald-50 text-emerald-700' : ecart < 0 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      {ok ? 'Juste' : ecart < 0 ? 'Manque' : 'Excédent'} {ecart !== 0 && formatDT(ecart, { sign: true })}
    </span>
  );
};

type Tone = 'gray' | 'emerald' | 'amber' | 'rose' | 'blue' | 'violet';
const TONES: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-600',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-700',
};
export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string }> = ({ tone = 'gray', children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${TONES[tone]} ${className}`}>{children}</span>
);

export const EmptyState: React.FC<{ icon: React.ComponentType<{ size?: number; className?: string }>; title: string; text?: string; action?: React.ReactNode }> = ({
  icon: Icon,
  title,
  text,
  action,
}) => (
  <div className="flex flex-col items-center text-center py-10 px-4">
    <span className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
      <Icon size={20} className="text-gray-400" />
    </span>
    <p className="text-sm font-semibold text-gray-800">{title}</p>
    {text && <p className="text-xs text-gray-500 mt-1 max-w-xs">{text}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Alert: React.FC<{ tone?: 'info' | 'warning' | 'error' | 'success'; children: React.ReactNode; className?: string }> = ({ tone = 'info', children, className = '' }) => {
  const map = {
    info: { c: 'bg-blue-50 border-blue-100 text-blue-800', I: Info },
    warning: { c: 'bg-amber-50 border-amber-200 text-amber-800', I: AlertTriangle },
    error: { c: 'bg-rose-50 border-rose-200 text-rose-700', I: AlertTriangle },
    success: { c: 'bg-emerald-50 border-emerald-200 text-emerald-800', I: CheckCircle2 },
  }[tone];
  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs ${map.c} ${className}`}>
      <map.I size={15} className="shrink-0 mt-px" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};

// Bottom sheet on phones, centered dialog on larger screens.
export const Modal: React.FC<{ open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center no-print">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-2xl shadow-xl animate-sheet-up sm:animate-fade-up`}
      >
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 custom-scrollbar">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap justify-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
};

// Every cancellation / reopening asks "why" — it ends up in the journal.
export const ReasonModal: React.FC<{
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (motif: string) => Promise<void>;
}> = ({ open, title, description, confirmLabel, danger, onClose, onConfirm }) => {
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setMotif('');
      setError(null);
    }
  }, [open]);
  const submit = async () => {
    if (motif.trim().length < 3) {
      setError('Indiquez un motif (3 caractères minimum).');
      return;
    }
    setBusy(true);
    try {
      await onConfirm(motif.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={description}
      footer={
        <>
          <button className={cls.secondary} onClick={onClose}>
            Retour
          </button>
          <button className={danger ? cls.danger : cls.primary} onClick={submit} disabled={busy}>
            {busy && <LoaderCircle size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <Field label="Motif" required error={error}>
        <textarea className={cls.input} rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : saisie en double, erreur de montant…" autoFocus />
      </Field>
    </Modal>
  );
};

// --- Toasts -------------------------------------------------------------------------------------
interface ToastItem {
  id: number;
  text: string;
  tone: 'success' | 'error' | 'info';
}
const ToastContext = createContext<(text: string, tone?: ToastItem['tone']) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastItem['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed z-[80] left-1/2 -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6 flex flex-col items-center gap-2 pointer-events-none no-print w-[min(92vw,420px)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto w-full px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold animate-fade-up flex items-center gap-2 ${
              t.tone === 'success' ? 'bg-gray-900 text-white' : t.tone === 'error' ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white'
            }`}
          >
            {t.tone === 'success' ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" /> : <Info size={15} className="shrink-0" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const PageHeader: React.FC<{ title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
    <div className="min-w-0">
      <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">{title}</h1>
      {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
    </div>
    {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
  </div>
);

export const nowHHMM = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const formatTime = (iso: string): string => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
