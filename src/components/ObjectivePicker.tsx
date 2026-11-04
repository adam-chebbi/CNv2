import { DecimalInput } from './ui/DecimalInput';
import React, { useMemo, useState } from 'react';
import { Target, Sparkles, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ObjectivePickerProps {
  currentTarget: number;
  achievedToDate: number;
  isCustomTarget: boolean;
  monthLabel: string;
  onSave: (amount: number) => Promise<void>;
  onClose: () => void;
}

const formatDT = (v: number): string => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;
const roundToTen = (v: number): number => Math.max(10, Math.round(v / 10) * 10);

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const ObjectivePicker: React.FC<ObjectivePickerProps> = ({
  currentTarget,
  achievedToDate,
  isCustomTarget,
  monthLabel,
  onSave,
  onClose,
}) => {
  const reduceMotion = useMemo(prefersReducedMotion, []);
  const base = currentTarget > 0 ? currentTarget : Math.max(1000, roundToTen(achievedToDate * 1.2));

  const presets = useMemo(
    () => [
      { label: 'Identique au mois dernier', value: roundToTen(base) },
      { label: '+10%', value: roundToTen(base * 1.1) },
      { label: '+20%', value: roundToTen(base * 1.2) },
      { label: '+30%', value: roundToTen(base * 1.3) },
    ],
    [base]
  );

  const [amount, setAmount] = useState<number>(roundToTen(base));
  const [customInput, setCustomInput] = useState<string>(String(roundToTen(base)));
  const [selectedPreset, setSelectedPreset] = useState<number | null>(presets[0]?.value ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  const previewPercent = amount > 0 ? Math.min(999, Math.round((achievedToDate / amount) * 1000) / 10) : 0;
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference - (Math.min(previewPercent, 100) / 100) * circumference;

  const applyPreset = (value: number) => {
    setSelectedPreset(value);
    setAmount(value);
    setCustomInput(String(value));
    setError(null);
  };

  const applyCustom = (raw: string) => {
    setCustomInput(raw);
    setSelectedPreset(null);
    const n = Number(raw.replace(',', '.'));
    if (raw.trim() !== '' && Number.isFinite(n)) setAmount(n);
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Indiquez un montant valide supérieur à 0.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave(amount);
      setIsSaved(true);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue. Réessayez.");
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div
        className={`relative w-full max-w-sm bg-white dark:bg-[#151D2A] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden ${
          reduceMotion ? '' : 'animate-in zoom-in-95 slide-in-from-bottom-2 duration-300'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative gradient header */}
        <div className="relative bg-gradient-to-br from-primary to-emerald-700 px-5 pt-5 pb-8 overflow-hidden">
          <div className="pointer-events-none absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-6 w-28 h-28 rounded-full bg-white/10 blur-2xl" />

          <button
            onClick={onClose}
            className="absolute right-3 top-3 p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X size={16} />
          </button>

          <div className="relative flex items-center gap-3">
            <div className="relative shrink-0">
              {!reduceMotion && <span className="absolute inset-0 rounded-full bg-white/30 animate-ping" />}
              <div className="relative w-11 h-11 rounded-full bg-white/15 border border-white/30 flex items-center justify-center">
                <Target size={20} className="text-white" />
              </div>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                Définir l'objectif
                <Sparkles size={13} className="text-white/80" />
              </h2>
              <p className="text-xs text-white/80 capitalize truncate">{monthLabel}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 -mt-4">
          <div className="bg-white dark:bg-[#151D2A] rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 flex items-center gap-4">
            <div className="relative w-20 h-20 shrink-0">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" className="stroke-gray-100 dark:stroke-gray-800" strokeWidth="9" fill="transparent" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  className="stroke-primary transition-[stroke-dashoffset] duration-500 ease-out"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  fill="transparent"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-extrabold text-gray-900 dark:text-white">{previewPercent}%</span>
              </div>
            </div>
            <div className="min-w-0 text-xs">
              <p className="text-gray-400">Réalisé à ce jour</p>
              <p className="font-bold text-gray-900 dark:text-white font-mono">{formatDT(achievedToDate)}</p>
              <p className="text-gray-400 mt-1.5">Nouvel objectif</p>
              <p className="font-bold text-primary font-mono">{formatDT(amount || 0)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.value)}
                className={`px-3 py-2 rounded-xl border text-xs font-semibold text-left transition cursor-pointer ${
                  selectedPreset === p.value
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-gray-50 dark:bg-gray-800/60 border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary/40'
                }`}
              >
                <span className="block truncate">{p.label}</span>
                <span className="block font-mono text-[11px] opacity-80 truncate">{formatDT(p.value)}</span>
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block">Montant personnalisé</label>
            <div className="relative">
              <DecimalInput
                min={0}
                step="10"
                value={customInput}
                onChange={(e) => applyCustom(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                placeholder="0"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">DT</span>
            </div>
          </div>

          {isCustomTarget && (
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <Sparkles size={11} className="text-primary" /> Un objectif personnalisé est déjà actif pour ce mois.
            </p>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertCircle size={13} /> {error}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving || isSaved}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary hover:opacity-90 text-white text-sm font-semibold shadow-xs transition active:scale-98 cursor-pointer disabled:opacity-80"
          >
            {isSaved ? (
              <>
                <CheckCircle2 size={16} className="animate-in zoom-in duration-300" />
                Objectif enregistré
              </>
            ) : isSaving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Enregistrement…
              </>
            ) : (
              "Confirmer l'objectif"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
