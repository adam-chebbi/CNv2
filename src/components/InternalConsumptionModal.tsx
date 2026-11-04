import React, { useMemo, useState } from 'react';
import { X, Plus, Trash2, AlertCircle, ShieldCheck, Loader2, CheckCircle2, Users } from 'lucide-react';
import { CatalogArticle, getArticleCategoriesInUse } from '../data/manualSalesCatalog';
import { EmployeePicker } from './ui/EmployeePicker';
import {
  InternalConsumptionFormState,
  createEmptyInternalConsumptionForm,
  createEmptyInternalConsumptionLine,
  validateInternalConsumptionForm,
  buildInternalConsumptionPayload,
} from '../data/internalConsumptionModel';

interface InternalConsumptionModalProps {
  articles: CatalogArticle[];
  employees: string[];
  onSave: (payload: ReturnType<typeof buildInternalConsumptionPayload>) => Promise<void>;
  onClose: () => void;
}

type Step = 'form' | 'preview' | 'success';

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

export const InternalConsumptionModal: React.FC<InternalConsumptionModalProps> = ({ articles, employees, onSave, onClose }) => {
  const [form, setForm] = useState<InternalConsumptionFormState>(createEmptyInternalConsumptionForm());
  const [step, setStep] = useState<Step>('form');
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const categories = useMemo(() => getArticleCategoriesInUse(articles), [articles]);
  const issues = useMemo(() => validateInternalConsumptionForm(form), [form]);
  const issuesByField = useMemo(() => new Map(issues.map((i) => [i.field, i.message])), [issues]);

  const updateLine = (id: string, patch: Partial<InternalConsumptionFormState['lines'][number]>) =>
    setForm((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const addLine = () => setForm((prev) => ({ ...prev, lines: [...prev.lines, createEmptyInternalConsumptionLine()] }));
  const removeLine = (id: string) =>
    setForm((prev) => ({ ...prev, lines: prev.lines.length > 1 ? prev.lines.filter((l) => l.id !== id) : prev.lines }));

  const handleVerify = () => {
    setHasAttemptedVerify(true);
    if (issues.length === 0) setStep('preview');
  };

  const handleConfirm = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(buildInternalConsumptionPayload(form, articles));
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartNew = () => {
    setForm(createEmptyInternalConsumptionForm());
    setHasAttemptedVerify(false);
    setSaveError(null);
    setStep('form');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[92vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'success' ? (
          <div className="p-8 sm:p-10 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
              <CheckCircle2 size={30} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Consommation interne enregistrée</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
              Le stock a été déduit selon la recette de chaque produit, exactement comme pour une vente — sans aucun impact sur le chiffre d'affaires.
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={handleStartNew} className={secondaryButtonClass}>
                <Plus size={14} />
                <span>Enregistrer une autre</span>
              </button>
              <button onClick={onClose} className={primaryButtonClass}>
                <span>Fermer</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Users size={16} className="text-emerald-600" /> Ventes internes
              </h3>
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            {step === 'form' ? (
              <div className="p-4 sm:p-5 space-y-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Un produit consommé par un employé (offert, dégusté sur place...) plutôt que vendu — le stock des ingrédients qui le composent est déduit, mais rien n'est compté comme chiffre d'affaires.
                </p>

                <div>
                  <label className={labelClass}>Employé *</label>
                  <EmployeePicker
                    value={form.employee}
                    onChange={(v) => setForm((prev) => ({ ...prev, employee: v }))}
                    employees={employees}
                    className={`${inputBaseClass} appearance-none cursor-pointer ${hasAttemptedVerify && issuesByField.has('employee') ? inputErrorClass : inputValidClass}`}
                  />
                  {hasAttemptedVerify && issuesByField.get('employee') && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('employee')}</p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className={labelClass}>Produits consommés *</label>
                    <button onClick={addLine} className={secondaryButtonClass}>
                      <Plus size={13} />
                      <span>Ajouter un produit</span>
                    </button>
                  </div>
                  {form.lines.map((line, idx) => (
                    <div key={line.id} className="flex items-start gap-2">
                      <div className="flex-1">
                        <select
                          value={line.productId}
                          onChange={(e) => updateLine(line.id, { productId: e.target.value })}
                          className={`${inputBaseClass} appearance-none cursor-pointer ${hasAttemptedVerify && issuesByField.has(`line-${line.id}`) ? inputErrorClass : inputValidClass}`}
                        >
                          <option value="">Choisir un produit</option>
                          {categories.map((cat) => (
                            <optgroup key={cat} label={cat}>
                              {articles.filter((a) => a.category === cat).map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={line.qty}
                          onChange={(e) => updateLine(line.id, { qty: e.target.value })}
                          className={`${inputBaseClass} text-center ${hasAttemptedVerify && issuesByField.has(`line-${line.id}`) ? inputErrorClass : inputValidClass}`}
                        />
                      </div>
                      <button
                        onClick={() => removeLine(line.id)}
                        disabled={form.lines.length === 1}
                        title="Retirer cette ligne"
                        className="mt-1.5 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {hasAttemptedVerify &&
                    form.lines.map((line) =>
                      issuesByField.get(`line-${line.id}`) ? (
                        <p key={`err-${line.id}`} className="text-[11px] text-red-500 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get(`line-${line.id}`)}</p>
                      ) : null
                    )}
                </div>

                <div>
                  <label className={labelClass}>Commentaire</label>
                  <textarea
                    value={form.comment}
                    onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
                    rows={2}
                    placeholder="Optionnel"
                    className={`${inputBaseClass} ${inputValidClass}`}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button onClick={onClose} className={secondaryButtonClass}>
                    <span>Annuler</span>
                  </button>
                  <button onClick={handleVerify} className={primaryButtonClass}>
                    <ShieldCheck size={14} />
                    <span>Vérifier</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-5 space-y-4">
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-700 dark:text-emerald-300">
                  Vérifiez avant confirmation — rien n'est encore enregistré.
                </div>
                <div className="text-xs space-y-1.5">
                  <p><span className="text-gray-400">Employé : </span><span className="font-semibold text-gray-900 dark:text-white">{form.employee}</span></p>
                  <div className="pt-1">
                    <span className="text-gray-400 block mb-1">Produits :</span>
                    <ul className="space-y-1">
                      {form.lines.map((line) => {
                        const article = articles.find((a) => a.id === line.productId);
                        return (
                          <li key={line.id} className="font-semibold text-gray-900 dark:text-white">
                            {line.qty}x {article?.name ?? '—'}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  {form.comment.trim() && (
                    <p className="pt-1"><span className="text-gray-400">Commentaire : </span>{form.comment}</p>
                  )}
                </div>

                {saveError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertCircle size={14} /> {saveError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button onClick={() => setStep('form')} disabled={isSaving} className={secondaryButtonClass}>
                    <span>Modifier</span>
                  </button>
                  <button onClick={handleConfirm} disabled={isSaving} className={primaryButtonClass}>
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    <span>{isSaving ? 'Enregistrement…' : 'Confirmer et enregistrer'}</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
