import { DecimalInput } from './ui/DecimalInput';
import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, Loader2, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { AppSettings, APP_SETTING_FIELDS, DEFAULT_APP_SETTINGS } from '../data/settingsModel';
import { ShowcaseSettingsSection } from './ShowcaseSettingsSection';

interface SettingsPageProps {
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  onNavigateToDashboard: () => void;
  isDarkMode?: boolean;
}

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

// Percent fields are stored as 0..1 but edited as a 0..100 text field for readability.
const toEditValue = (field: (typeof APP_SETTING_FIELDS)[number], value: number): string =>
  String(field.isPercent ? Math.round(value * 1000) / 10 : value);
const fromEditValue = (field: (typeof APP_SETTING_FIELDS)[number], raw: string): number => {
  const n = Number(raw);
  if (Number.isNaN(n)) return 0;
  return field.isPercent ? n / 100 : n;
};

export const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onSaveSettings, onNavigateToDashboard }) => {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(APP_SETTING_FIELDS.map((f) => [f.key, toEditValue(f, settings[f.key])]))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setDraft(Object.fromEntries(APP_SETTING_FIELDS.map((f) => [f.key, toEditValue(f, settings[f.key])])));
  }, [settings]);

  const updateField = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSavedAt(null);
  };

  const handleReset = () => {
    setDraft(Object.fromEntries(APP_SETTING_FIELDS.map((f) => [f.key, toEditValue(f, DEFAULT_APP_SETTINGS[f.key])])));
    setSavedAt(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const next = { ...settings } as unknown as Record<string, number>;
      APP_SETTING_FIELDS.forEach((f) => {
        next[f.key] = fromEditValue(f, draft[f.key] ?? '');
      });
      await onSaveSettings(next);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <SettingsIcon size={20} className="text-emerald-500" />
            <span>Paramètres généraux</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Réglages métier utilisés par les alertes, le calcul du quotidien et les fiches produits — modifiables
            ici sans intervention technique.
          </p>
        </div>
        <button
          onClick={onNavigateToDashboard}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
        >
          <span>Tableau de bord</span>
        </button>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-5">
        {APP_SETTING_FIELDS.map((field) => (
          <div key={field.key} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start pb-4 border-b border-gray-100 dark:border-gray-800 last:border-0 last:pb-0">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-800 dark:text-gray-200 block mb-0.5">{field.label}</label>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{field.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <DecimalInput
                min={field.min}
                max={field.max}
                step={field.step}
                value={draft[field.key] ?? ''}
                onChange={(e) => updateField(field.key, e.target.value)}
                className={`${inputBaseClass} ${inputValidClass}`}
              />
              <span className="text-xs text-gray-400 shrink-0 w-12">{field.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {saveError && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700 dark:text-red-300">Échec de l'enregistrement</p>
            <p className="text-xs text-red-600/90 dark:text-red-400/90">{saveError}</p>
          </div>
        </div>
      )}

      <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          {savedAt && (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
              <CheckCircle2 size={13} /> Réglages enregistrés.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button onClick={handleReset} className={`${secondaryButtonClass} flex-1 sm:flex-none`}>
            <RotateCcw size={13} />
            <span>Valeurs par défaut</span>
          </button>
          <button onClick={handleSave} disabled={isSaving} className={`${primaryButtonClass} flex-1 sm:flex-none`}>
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span>{isSaving ? 'Enregistrement…' : 'Enregistrer'}</span>
          </button>
        </div>
      </div>

      {/* Contenu du site public (cafenoir.tn) : coordonnées, horaires, réseaux sociaux, plan. */}
      <ShowcaseSettingsSection />
    </div>
  );
};
