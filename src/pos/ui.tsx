import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { formatDt } from '../data/money';
import { ApiError } from '../api/client';

// Small building blocks shared by the point-of-sale screens: large touch targets (≥ 44 px),
// the app's emerald accent, French labels.

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

export const Money: React.FC<{ mil: number; className?: string }> = ({ mil, className }) => <span className={cx('tabular-nums', className)}>{formatDt(mil)}</span>;

export const PageHeader: React.FC<{ icon: React.ComponentType<{ size?: number; className?: string }>; title: string; subtitle?: string; actions?: React.ReactNode }> = ({
  icon: Icon,
  title,
  subtitle,
  actions,
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
    <div>
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
        <Icon size={20} className="text-emerald-500" />
        <span>{title}</span>
      </h1>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const Card: React.FC<{ title?: React.ReactNode; actions?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, actions, className, children }) => (
  <section className={cx('p-4 sm:p-5 rounded-2xl bg-white border border-gray-100 shadow-2xs space-y-3', className)}>
    {(title || actions) && (
      <div className="flex items-center justify-between gap-2">
        {title && <h2 className="text-sm font-semibold text-gray-800">{title}</h2>}
        {actions}
      </div>
    )}
    {children}
  </section>
);

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600',
  secondary: 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200',
  danger: 'bg-red-600 hover:bg-red-700 text-white border-red-600',
  warning: 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500',
  ghost: 'bg-transparent hover:bg-gray-100 text-gray-600 border-transparent',
};

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; busy?: boolean }> = ({
  variant = 'secondary',
  size = 'md',
  busy,
  className,
  children,
  disabled,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || busy}
    className={cx(
      'inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
      size === 'sm' && 'px-2.5 py-1.5 text-xs min-h-[34px]',
      size === 'md' && 'px-3.5 py-2 text-sm min-h-[44px]',
      size === 'lg' && 'px-5 py-3 text-base min-h-[56px]',
      BTN[variant],
      className
    )}
  >
    {busy && <Loader2 size={14} className="animate-spin" />}
    {children}
  </button>
);

export const Badge: React.FC<{ tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'violet'; children: React.ReactNode }> = ({ tone = 'gray', children }) => {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-sky-100 text-sky-800',
    violet: 'bg-violet-100 text-violet-800',
  };
  return <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', tones[tone])}>{children}</span>;
};

export const ErrorNote: React.FC<{ message: string | null; onClose?: () => void }> = ({ message, onClose }) =>
  message ? (
    <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Fermer" className="text-red-500 hover:text-red-700">
          <X size={14} />
        </button>
      )}
    </div>
  ) : null;

export const Loading: React.FC<{ label?: string }> = ({ label = 'Chargement…' }) => (
  <div className="flex items-center justify-center py-16 text-gray-400 gap-2 text-sm">
    <Loader2 size={16} className="animate-spin" /> {label}
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-sm text-gray-400 text-center py-8">{children}</p>;

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }> = ({ title, onClose, children, wide, footer }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('bg-white w-full rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col', wide ? 'sm:max-w-3xl' : 'sm:max-w-md')}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-3">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <span className="text-xs font-semibold text-gray-600">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
  </label>
);

export const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 bg-white';

// Loads data, exposes a reload and the last error. Keeps the previous data while reloading so
// live screens don't flicker on every event.
// Browser/network errors ("Failed to fetch", JSON parse…) mean nothing to the staff: say what to do.
export const friendlyError = (err: unknown): string => {
  if (err instanceof ApiError) return err.message;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Pas de connexion internet. Vérifiez le wifi puis réessayez.';
  return 'Le serveur ne répond pas. Patientez quelques secondes puis réessayez.';
};

export const useLoader = <T,>(load: () => Promise<T>, deps: unknown[] = []) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(async () => {
    try {
      const result = await loadRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, setData, error, setError, loading, reload };
};

// Runs an action, reports its error, prevents double submission.
export const useAction = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(friendlyError(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
};

export const time = (iso: string): string => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tunis' });
export const dateTime = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tunis' });

// "il y a 12 min" — refreshed by the caller's own re-renders.
export const elapsed = (iso: string, now = Date.now()): string => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
};

export const useNow = (intervalMs = 30_000): number => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
};
