import { todayIso } from '../data/dateUtils';
import React, { useMemo, useState } from 'react';
import {
  Tag,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Receipt,
  RotateCcw,
} from 'lucide-react';
import {
  ExpenseCategory,
  Expense,
  generateExpenseId,
  resolveExpenseCategoryByName,
  getExpenseCategoryUsageCount,
  DEFAULT_EXPENSE_CATEGORY_NAMES,
} from '../data/expensesModel';

interface ExpenseCategoriesPageProps {
  categories: ExpenseCategory[];
  expenses: Expense[];
  onNavigateToDashboard: () => void;
  onNavigateToExpenses: () => void;
  onCreateCategory: (category: ExpenseCategory) => void;
  onRenameCategory: (categoryId: string, newName: string) => void;
  onDeleteCategory: (categoryId: string) => void;
  isDarkMode?: boolean;
}

type Mode = 'list' | 'create' | 'edit';
type Step = 'form' | 'preview' | 'success';

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

export const ExpenseCategoriesPage: React.FC<ExpenseCategoriesPageProps> = ({
  categories,
  expenses,
  onNavigateToDashboard,
  onNavigateToExpenses,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
}) => {
  const [mode, setMode] = useState<Mode>('list');
  const [step, setStep] = useState<Step>('form');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ExpenseCategory | null>(null);

  const editingCategory = useMemo(() => categories.find((c) => c.id === editingId) ?? null, [categories, editingId]);

  // After a full data wipe (or on an install that never seeded them), some/all of the 12 default
  // categories can be missing with no quick way back short of typing each one in by hand.
  const missingDefaultNames = useMemo(
    () => DEFAULT_EXPENSE_CATEGORY_NAMES.filter((n) => !resolveExpenseCategoryByName(n, categories)),
    [categories]
  );
  const [isRecreatingDefaults, setIsRecreatingDefaults] = useState(false);
  const handleRecreateDefaults = async () => {
    setIsRecreatingDefaults(true);
    try {
      for (const catName of missingDefaultNames) {
        await onCreateCategory({ id: generateExpenseId('ecat'), name: catName, createdAt: todayIso() });
      }
    } finally {
      setIsRecreatingDefaults(false);
    }
  };

  const issues = useMemo(() => {
    const list: string[] = [];
    const trimmed = name.trim();
    if (!trimmed) {
      list.push('Le nom de la catégorie est obligatoire.');
    } else {
      const existing = resolveExpenseCategoryByName(trimmed, categories);
      if (existing && existing.id !== editingId) list.push(`Cette catégorie existe déjà : « ${existing.name} ».`);
    }
    return list;
  }, [name, categories, editingId]);

  const showErrors = hasAttemptedVerify;

  const filteredCategories = useMemo(
    () => categories.filter((c) => !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())),
    [categories, searchQuery]
  );

  const handleOpenCreate = () => {
    setMode('create');
    setEditingId(null);
    setName('');
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
  };

  const handleOpenEdit = (cat: ExpenseCategory) => {
    setMode('edit');
    setEditingId(cat.id);
    setName(cat.name);
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
  };

  const handleClose = () => {
    setMode('list');
    setStep('form');
  };

  const handleVerify = () => {
    setHasAttemptedVerify(true);
    if (issues.length === 0) setStep('preview');
  };

  const handleConfirm = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const trimmed = name.trim();
      if (mode === 'create') {
        onCreateCategory({ id: generateExpenseId('ecat'), name: trimmed, createdAt: todayIso() });
      } else if (editingId) {
        onRenameCategory(editingId, trimmed);
      }
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestDelete = (cat: ExpenseCategory) => setDeleteTarget(cat);

  const deleteBlockedReason = useMemo(() => {
    if (!deleteTarget) return null;
    const count = getExpenseCategoryUsageCount(deleteTarget, expenses);
    return count > 0 ? `${count} dépense${count > 1 ? 's utilisent' : ' utilise'} cette catégorie.` : null;
  }, [deleteTarget, expenses]);

  const handleConfirmDelete = () => {
    if (!deleteTarget || deleteBlockedReason) return;
    onDeleteCategory(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Catégories de dépenses</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Achat et dépenses
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Gestion des catégories utilisées pour classer les dépenses.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={onNavigateToExpenses} className={secondaryButtonClass}>
            <Receipt size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Voir les dépenses</span>
          </button>
          {mode === 'list' && missingDefaultNames.length > 0 && (
            <button
              onClick={handleRecreateDefaults}
              disabled={isRecreatingDefaults}
              title={`Recrée les catégories par défaut manquantes : ${missingDefaultNames.join(', ')}`}
              className={secondaryButtonClass}
            >
              {isRecreatingDefaults ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              <span>Recréer les catégories par défaut ({missingDefaultNames.length})</span>
            </button>
          )}
          {mode === 'list' && (
            <button onClick={handleOpenCreate} className={primaryButtonClass}>
              <Plus size={14} />
              <span>Ajouter une catégorie</span>
            </button>
          )}
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {mode !== 'list' ? (
        <div className="space-y-4">
          {step === 'success' ? (
            <div className="p-8 sm:p-12 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
                <CheckCircle2 size={30} />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{mode === 'create' ? 'Catégorie créée' : 'Catégorie modifiée'}</h2>
              <button onClick={handleClose} className={primaryButtonClass}>
                <Tag size={14} />
                <span>Retour aux catégories</span>
              </button>
            </div>
          ) : step === 'preview' ? (
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4 max-w-lg">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">Vérifiez avant confirmation — rien n'est encore enregistré.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Nom :</span><span className="font-bold text-gray-900 dark:text-white">{name.trim()}</span></div>
              </div>
              {saveError && <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2"><AlertCircle size={14} /> {saveError}</div>}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setStep('form')} disabled={isSaving} className={secondaryButtonClass}><span>Modifier</span></button>
                <button onClick={handleConfirm} disabled={isSaving} className={primaryButtonClass}>
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  <span>{isSaving ? 'Enregistrement…' : 'Confirmer et enregistrer'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4 max-w-lg">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                  {mode === 'create' ? 'Nouvelle catégorie' : `Modifier « ${editingCategory?.name} »`}
                </h2>
                <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
              </div>

              <div>
                <label className={labelClass}>Nom de la catégorie *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`${inputBaseClass} ${showErrors && issues.length > 0 ? inputErrorClass : inputValidClass}`} />
                {showErrors && issues.map((msg, i) => (<p key={i} className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {msg}</p>))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button onClick={handleClose} className={secondaryButtonClass}><span>Annuler</span></button>
                <button onClick={handleVerify} className={primaryButtonClass}><ShieldCheck size={14} /><span>Vérifier</span></button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
            <div className="relative max-w-sm">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher une catégorie..." className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                    <th className="py-3.5 px-4">Nom</th>
                    <th className="py-3.5 px-4 text-center">Dépenses</th>
                    <th className="py-3.5 px-4">Créée le</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                  {filteredCategories.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-12 text-gray-400"><Tag className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />Aucune catégorie pour cette recherche</td></tr>
                  ) : (
                    filteredCategories.map((cat) => (
                      <tr key={cat.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white">{cat.name}</td>
                        <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-300">{getExpenseCategoryUsageCount(cat, expenses)}</td>
                        <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{cat.createdAt}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleOpenEdit(cat)} title="Modifier" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><Pencil size={14} /></button>
                            <button onClick={() => handleRequestDelete(cat)} title="Supprimer" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2"><AlertCircle size={16} className="text-red-500" /> Supprimer</h3>
              <button onClick={() => setDeleteTarget(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-5 text-xs text-gray-600 dark:text-gray-300 space-y-2">
              {deleteBlockedReason ? (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400">
                  Suppression impossible : {deleteBlockedReason}
                </div>
              ) : (
                <p>Voulez-vous vraiment supprimer <strong className="text-gray-900 dark:text-white">{deleteTarget.name}</strong> ? Cette action est irréversible.</p>
              )}
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className={secondaryButtonClass}><span>{deleteBlockedReason ? 'Fermer' : 'Annuler'}</span></button>
              {!deleteBlockedReason && (
                <button onClick={handleConfirmDelete} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer">
                  <Trash2 size={14} /><span>Confirmer la suppression</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
