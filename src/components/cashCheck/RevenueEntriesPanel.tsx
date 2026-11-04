import { DecimalInput } from '../ui/DecimalInput';
import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Check,
  CreditCard,
  Landmark,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Ticket,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  REVENUE_NOTE_MAX_LENGTH,
  REVENUE_PAYMENT_METHODS,
  RevenueEntry,
  RevenueEntryInput,
  RevenuePaymentMethod,
  sortRevenueEntries,
  summarizeDayRevenue,
  validateRevenueDraft,
} from '../../data/revenueEntriesModel';

interface RevenueEntriesPanelProps {
  selectedDate: string;
  entries: RevenueEntry[]; // every entry — the panel shows the selected day's
  onCreate: (input: RevenueEntryInput) => Promise<void>;
  onUpdate: (id: string, input: RevenueEntryInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const formatDT = (v: number): string => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} DT`;

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const METHOD_STYLE: Record<RevenuePaymentMethod | 'general', { icon: React.ReactNode; badge: string; label: string }> = {
  Espèces: {
    icon: <Banknote size={12} />,
    badge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
    label: 'Espèces',
  },
  'Carte bancaire': {
    icon: <CreditCard size={12} />,
    badge: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    label: 'Carte bancaire',
  },
  'Ticket resto': {
    icon: <Ticket size={12} />,
    badge: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
    label: 'Ticket resto',
  },
  Autre: {
    icon: <Landmark size={12} />,
    badge: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
    label: 'Autre',
  },
  general: {
    icon: <Layers size={12} />,
    badge: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300',
    label: 'Général',
  },
};

const MethodBadge: React.FC<{ method: RevenuePaymentMethod | null }> = ({ method }) => {
  const style = METHOD_STYLE[method ?? 'general'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${style.badge}`}>
      {style.icon}
      {style.label}
    </span>
  );
};

const inputClass =
  'w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:border-emerald-500 focus:ring-emerald-500 transition';

export const RevenueEntriesPanel: React.FC<RevenueEntriesPanelProps> = ({ selectedDate, entries, onCreate, onUpdate, onDelete }) => {
  const [amountInput, setAmountInput] = useState('');
  const [specifyPayment, setSpecifyPayment] = useState(false);
  const [method, setMethod] = useState<RevenuePaymentMethod>('Espèces');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const dayEntries = useMemo(() => sortRevenueEntries(entries.filter((e) => e.date === selectedDate)), [entries, selectedDate]);
  const summary = useMemo(() => summarizeDayRevenue(entries, selectedDate), [entries, selectedDate]);

  const resetForm = () => {
    setAmountInput('');
    setSpecifyPayment(false);
    setMethod('Espèces');
    setNote('');
    setEditingId(null);
    setError(null);
  };

  const startEdit = (entry: RevenueEntry) => {
    setEditingId(entry.id);
    setAmountInput(String(entry.amount));
    setSpecifyPayment(entry.paymentMethod !== null);
    setMethod(entry.paymentMethod ?? 'Espèces');
    setNote(entry.note ?? '');
    setConfirmDeleteId(null);
    setError(null);
  };

  const errorMessage = (err: unknown): string =>
    err instanceof Error && err.message ? err.message : "Une erreur est survenue lors de l'enregistrement.";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(amountInput);
    const problem = validateRevenueDraft(amount, note);
    if (problem) {
      setError(problem);
      return;
    }
    const input: RevenueEntryInput = {
      date: selectedDate,
      amount,
      paymentMethod: specifyPayment ? method : null,
      note: note.trim() || undefined,
    };
    setIsSaving(true);
    setError(null);
    try {
      if (editingId) await onUpdate(editingId, input);
      else await onCreate(input);
      resetForm();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      await onDelete(id);
      setConfirmDeleteId(null);
      if (editingId === id) resetForm();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const breakdown = [
    ...REVENUE_PAYMENT_METHODS.map((m) => ({ key: m, method: m as RevenuePaymentMethod | null, amount: summary.byMethod[m] })),
    { key: 'general', method: null, amount: summary.unspecified },
  ].filter((b) => b.amount > 0);

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
            <Wallet size={15} className="text-emerald-500" /> Chiffres d'affaires
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5 max-w-xl">
            Saisie manuelle du chiffre d'affaires de la journée affichée. Sans règlement précisé, il est ajouté en général ;
            avec un règlement, il alimente aussi le montant système Espèces / Carte bancaire / Tickets restaurant.
          </p>
        </div>
        <div className="sm:text-right shrink-0">
          <span className="text-[11px] text-gray-400 block">CA saisi ce jour</span>
          <span className="text-lg font-bold text-gray-900 dark:text-white">{formatDT(summary.total)}</span>
        </div>
      </div>

      {breakdown.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {breakdown.map((b) => (
            <span key={b.key} className="inline-flex items-center gap-2 text-xs">
              <MethodBadge method={b.method} />
              <span className="font-semibold text-gray-700 dark:text-gray-200">{formatDT(b.amount)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Add / edit form */}
      <form
        onSubmit={handleSubmit}
        className={`p-3.5 rounded-xl border space-y-3 ${
          editingId
            ? 'border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/10'
            : 'border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/30'
        }`}
      >
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          {editingId ? 'Modifier ce chiffre d\'affaires' : 'Ajouter un chiffre d\'affaires'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-3">
          <div>
            <label htmlFor="ca-amount" className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
              Montant (DT) *
            </label>
            <DecimalInput
              id="ca-amount"
              min={0}
              step={0.001}
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0.000"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ca-note" className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
              Note (optionnel)
            </label>
            <input
              id="ca-note"
              type="text"
              maxLength={REVENUE_NOTE_MAX_LENGTH}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex. : Z de caisse, événement, correction…"
              className={inputClass}
            />
          </div>
        </div>

        {/* Optional règlement: off = CA général */}
        <div className="space-y-2">
          <button
            type="button"
            role="switch"
            aria-checked={specifyPayment}
            onClick={() => setSpecifyPayment((v) => !v)}
            className="inline-flex items-center gap-2.5 cursor-pointer group"
          >
            <span
              className={`relative w-9 h-5 rounded-full transition-colors ${
                specifyPayment ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  specifyPayment ? 'translate-x-4' : ''
                }`}
              />
            </span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Préciser le règlement</span>
          </button>

          {specifyPayment ? (
            <div role="radiogroup" aria-label="Règlement" className="flex flex-wrap gap-1.5">
              {REVENUE_PAYMENT_METHODS.map((m) => {
                const active = method === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMethod(m)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      active
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-300'
                    }`}
                  >
                    {METHOD_STYLE[m].icon}
                    {m}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400">Sans règlement : le montant est ajouté au chiffre d'affaires général de la journée.</p>
          )}
        </div>

        {error && (
          <p className="text-[11px] text-red-500 flex items-center gap-1" role="alert">
            <AlertCircle size={11} /> {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : editingId ? <Check size={14} /> : <Plus size={14} />}
            <span>{editingId ? 'Enregistrer' : 'Ajouter'}</span>
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 transition cursor-pointer"
            >
              <X size={14} />
              <span>Annuler</span>
            </button>
          )}
        </div>
      </form>

      {/* Entries of the day */}
      {dayEntries.length === 0 ? (
        <p className="text-xs text-gray-400 flex items-center gap-2">
          <AlertCircle size={13} /> Aucun chiffre d'affaires saisi pour ce jour.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {dayEntries.map((entry) => {
            const isEditing = editingId === entry.id;
            const isConfirming = confirmDeleteId === entry.id;
            return (
              <li key={entry.id} className={`py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${isEditing ? 'opacity-60' : ''}`}>
                <div className="flex-1 min-w-[180px] space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{formatDT(entry.amount)}</span>
                    <MethodBadge method={entry.paymentMethod} />
                  </div>
                  {entry.note && <p className="text-[11px] text-gray-500 dark:text-gray-400 break-words">{entry.note}</p>}
                  <p className="text-[10px] text-gray-400">
                    Saisi par {entry.createdBy} · {formatTime(entry.createdAt)}
                    {entry.updatedAt && ` · modifié par ${entry.updatedBy ?? '—'} le ${formatTime(entry.updatedAt)}`}
                  </p>
                </div>

                {isConfirming ? (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-red-600 dark:text-red-400 font-semibold">Supprimer ?</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {deletingId === entry.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Oui
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deletingId === entry.id}
                      className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold cursor-pointer"
                    >
                      Non
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      title="Modifier"
                      aria-label="Modifier ce chiffre d'affaires"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(entry.id)}
                      title="Supprimer"
                      aria-label="Supprimer ce chiffre d'affaires"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
