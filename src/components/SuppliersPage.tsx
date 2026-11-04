import React, { useMemo, useState } from 'react';
import {
  Truck,
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Building2,
  Phone,
  Mail,
  MapPin,
  User,
  Package,
  History,
  Receipt,
} from 'lucide-react';
import { useQueryParam } from '../hooks/useQueryParam';
import { StockProduct } from '../data/stockModel';
import {
  Supplier,
  PurchaseOrder,
  SupplierInvoice,
  DraftSupplier,
  createEmptyDraftSupplier,
  createDraftFromSupplier,
  validateDraftSupplier,
  buildSupplierFromDraft,
  getSupplierUsageCount,
  getSupplierPurchaseHistory,
} from '../data/purchasesModel';

interface SuppliersPageProps {
  suppliers: Supplier[];
  orders: PurchaseOrder[];
  invoices: SupplierInvoice[];
  products: StockProduct[];
  onNavigateToDashboard: () => void;
  onNavigateToPurchases: () => void;
  onNavigateToInvoices: () => void;
  onCreateSupplier: (supplier: Supplier) => void;
  onUpdateSupplier: (supplier: Supplier) => void;
  onDeleteSupplier: (supplierId: string) => void;
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

const formatAmount = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;
const formatDate = (iso: string) => {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso || '—';
};

export const SuppliersPage: React.FC<SuppliersPageProps> = ({
  suppliers,
  orders,
  invoices,
  products,
  onNavigateToDashboard,
  onNavigateToPurchases,
  onNavigateToInvoices,
  onCreateSupplier,
  onUpdateSupplier,
  onDeleteSupplier,
}) => {
  const [mode, setMode] = useState<Mode>('list');
  const [step, setStep] = useState<Step>('form');
  const [draft, setDraft] = useState<DraftSupplier>(createEmptyDraftSupplier());
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useQueryParam('q');
  // "Voir" opens ?supplier=<id> — a shareable deep link straight into that supplier's detail.
  const [supplierParam, setSupplierParam] = useQueryParam('supplier');
  const viewingSupplier = useMemo(() => suppliers.find((s) => s.id === supplierParam) ?? null, [suppliers, supplierParam]);
  const setViewingSupplier = (supplier: Supplier | null) => setSupplierParam(supplier ? supplier.id : '');
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const updateDraft = (patch: Partial<DraftSupplier>) => setDraft((prev) => ({ ...prev, ...patch }));

  const issues = useMemo(() => validateDraftSupplier(draft, suppliers), [draft, suppliers]);
  const issuesByField = new Map(issues.map((i) => [i.field, i.message]));
  const showErrors = hasAttemptedVerify;

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.taxId ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        (s.phone ?? '').toLowerCase().includes(q) ||
        (s.mainContact ?? '').toLowerCase().includes(q)
    );
  }, [suppliers, searchQuery]);

  const handleOpenCreate = () => {
    setMode('create');
    setDraft(createEmptyDraftSupplier());
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
  };

  const handleOpenEdit = (supplier: Supplier) => {
    setMode('edit');
    setDraft(createDraftFromSupplier(supplier));
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
      const supplier = buildSupplierFromDraft(draft);
      if (mode === 'create') onCreateSupplier(supplier);
      else onUpdateSupplier(supplier);
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartNew = () => {
    setDraft(createEmptyDraftSupplier());
    setHasAttemptedVerify(false);
    setSaveError(null);
    setStep('form');
    setMode('create');
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteSupplier(deleteTarget.id);
    setDeleteTarget(null);
  };

  const deleteBlockedReason = useMemo(() => {
    if (!deleteTarget) return null;
    const count = getSupplierUsageCount(deleteTarget, orders, invoices);
    return count > 0 ? `${count} achat${count > 1 ? 's ou factures utilisent' : ' ou facture utilise'} ce fournisseur.` : null;
  }, [deleteTarget, orders]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Listes des fournisseurs</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Achat et dépenses
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Coordonnées fournisseurs et historique des prix d'achat.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button onClick={onNavigateToInvoices} className={secondaryButtonClass}>
            <Receipt size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Factures</span>
          </button>
          <button onClick={onNavigateToPurchases} className={secondaryButtonClass}>
            <Truck size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Achats</span>
          </button>
          {mode === 'list' && (
            <button onClick={handleOpenCreate} className={primaryButtonClass}>
              <Plus size={14} />
              <span>Ajouter un fournisseur</span>
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
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{mode === 'create' ? 'Fournisseur créé' : 'Fournisseur modifié'}</h2>
              <div className="flex items-center gap-2 pt-2 flex-wrap justify-center">
                <button onClick={handleStartNew} className={secondaryButtonClass}>
                  <Plus size={14} />
                  <span>Ajouter un autre fournisseur</span>
                </button>
                <button onClick={handleClose} className={primaryButtonClass}>
                  <Truck size={14} />
                  <span>Voir la liste</span>
                </button>
              </div>
            </div>
          ) : step === 'preview' ? (
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4 max-w-lg">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">Vérifiez avant confirmation — rien n'est encore enregistré.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Nom :</span><span className="font-bold text-gray-900 dark:text-white">{draft.name.trim()}</span></div>
                {draft.taxId && <div className="flex justify-between"><span className="text-gray-500">Matricule fiscal :</span><span className="font-bold text-gray-900 dark:text-white">{draft.taxId}</span></div>}
                {draft.phone && <div className="flex justify-between"><span className="text-gray-500">Téléphone :</span><span className="font-bold text-gray-900 dark:text-white">{draft.phone}</span></div>}
                {draft.whatsapp && <div className="flex justify-between"><span className="text-gray-500">WhatsApp :</span><span className="font-bold text-gray-900 dark:text-white">{draft.whatsapp}</span></div>}
                {draft.email && <div className="flex justify-between"><span className="text-gray-500">Email :</span><span className="font-bold text-gray-900 dark:text-white">{draft.email}</span></div>}
                {draft.address && <div className="flex justify-between gap-3"><span className="text-gray-500 shrink-0">Adresse :</span><span className="font-bold text-gray-900 dark:text-white text-right">{draft.address}</span></div>}
                {draft.mainContact && <div className="flex justify-between"><span className="text-gray-500">Contact principal :</span><span className="font-bold text-gray-900 dark:text-white">{draft.mainContact}</span></div>}
                {draft.notes && <div className="flex justify-between gap-3"><span className="text-gray-500 shrink-0">Notes :</span><span className="text-gray-700 dark:text-gray-300 text-right">{draft.notes}</span></div>}
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
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">{mode === 'create' ? 'Nouveau fournisseur' : 'Modifier le fournisseur'}</h2>
                <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Nom / raison sociale *</label>
                  <input type="text" value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('name') ? inputErrorClass : inputValidClass}`} />
                  {showErrors && issuesByField.get('name') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('name')}</p>)}
                </div>
                <div>
                  <label className={labelClass}>Matricule fiscal</label>
                  <input type="text" value={draft.taxId} onChange={(e) => updateDraft({ taxId: e.target.value })} className={`${inputBaseClass} ${inputValidClass}`} />
                </div>
                <div>
                  <label className={labelClass}>Contact principal</label>
                  <input type="text" value={draft.mainContact} onChange={(e) => updateDraft({ mainContact: e.target.value })} className={`${inputBaseClass} ${inputValidClass}`} />
                </div>
                <div>
                  <label className={labelClass}>Téléphone</label>
                  <input type="text" value={draft.phone} onChange={(e) => updateDraft({ phone: e.target.value })} className={`${inputBaseClass} ${inputValidClass}`} />
                </div>
                <div>
                  <label className={labelClass}>WhatsApp</label>
                  <input type="text" value={draft.whatsapp} onChange={(e) => updateDraft({ whatsapp: e.target.value })} className={`${inputBaseClass} ${inputValidClass}`} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Email</label>
                  <input type="email" value={draft.email} onChange={(e) => updateDraft({ email: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('email') ? inputErrorClass : inputValidClass}`} />
                  {showErrors && issuesByField.get('email') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('email')}</p>)}
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Adresse</label>
                  <input type="text" value={draft.address} onChange={(e) => updateDraft({ address: e.target.value })} className={`${inputBaseClass} ${inputValidClass}`} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Notes</label>
                  <textarea value={draft.notes} onChange={(e) => updateDraft({ notes: e.target.value })} rows={2} placeholder="Optionnel" className={`${inputBaseClass} ${inputValidClass} resize-none`} />
                </div>
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
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nom, matricule, email, téléphone..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                    <th className="py-3.5 px-4">Nom / raison sociale</th>
                    <th className="py-3.5 px-4">Matricule fiscal</th>
                    <th className="py-3.5 px-4">Téléphone</th>
                    <th className="py-3.5 px-4">Email</th>
                    <th className="py-3.5 px-4">Contact principal</th>
                    <th className="py-3.5 px-4 text-center">Achats</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                  {filteredSuppliers.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-gray-400"><Truck className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />Aucun fournisseur pour cette recherche</td></tr>
                  ) : (
                    filteredSuppliers.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white">{s.name}</td>
                        <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{s.taxId ?? '—'}</td>
                        <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{s.phone ?? '—'}</td>
                        <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{s.email ?? '—'}</td>
                        <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{s.mainContact ?? '—'}</td>
                        <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-300">{getSupplierUsageCount(s, orders, invoices)}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setViewingSupplier(s)} title="Consulter" className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"><Eye size={14} /></button>
                            <button onClick={() => handleOpenEdit(s)} title="Modifier" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><Pencil size={14} /></button>
                            <button onClick={() => setDeleteTarget(s)} title="Supprimer" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"><Trash2 size={14} /></button>
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

      {/* View supplier modal — contact info + price history */}
      {viewingSupplier && (
        <SupplierDetailModal
          supplier={viewingSupplier}
          orders={orders}
          products={products}
          onClose={() => setViewingSupplier(null)}
        />
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

const SupplierDetailModal: React.FC<{
  supplier: Supplier;
  orders: PurchaseOrder[];
  products: StockProduct[];
  onClose: () => void;
}> = ({ supplier, orders, products, onClose }) => {
  const history = useMemo(() => getSupplierPurchaseHistory(supplier.id, orders), [supplier.id, orders]);

  // A product can have several suppliers — group this supplier's history by product so the last
  // price paid, and the full trail behind it, are both visible at a glance.
  const byProduct = useMemo(() => {
    const map = new Map<string, typeof history>();
    history.forEach((entry) => {
      const list = map.get(entry.productId) ?? [];
      list.push(entry);
      map.set(entry.productId, list);
    });
    return Array.from(map.entries()).map(([productId, entries]) => ({
      productId,
      productName: products.find((p) => p.id === productId)?.name ?? productId,
      entries,
      lastPrice: entries[0]?.unitPrice ?? 0,
    }));
  }, [history, products]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#151D2A] z-10">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2"><Building2 size={16} className="text-emerald-500" /> {supplier.name}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {supplier.taxId && <div><span className="text-gray-400 font-semibold block mb-0.5">Matricule fiscal</span><span className="font-bold text-gray-900 dark:text-white">{supplier.taxId}</span></div>}
            {supplier.mainContact && <div><span className="text-gray-400 font-semibold block mb-0.5">Contact principal</span><span className="font-bold text-gray-900 dark:text-white flex items-center gap-1"><User size={11} /> {supplier.mainContact}</span></div>}
            {supplier.phone && <div><span className="text-gray-400 font-semibold block mb-0.5">Téléphone</span><span className="font-bold text-gray-900 dark:text-white flex items-center gap-1"><Phone size={11} /> {supplier.phone}</span></div>}
            {supplier.whatsapp && <div><span className="text-gray-400 font-semibold block mb-0.5">WhatsApp</span><span className="font-bold text-gray-900 dark:text-white">{supplier.whatsapp}</span></div>}
            {supplier.email && <div><span className="text-gray-400 font-semibold block mb-0.5">Email</span><span className="font-bold text-gray-900 dark:text-white flex items-center gap-1"><Mail size={11} /> {supplier.email}</span></div>}
            {supplier.address && <div className="sm:col-span-2"><span className="text-gray-400 font-semibold block mb-0.5">Adresse</span><span className="font-bold text-gray-900 dark:text-white flex items-center gap-1"><MapPin size={11} /> {supplier.address}</span></div>}
          </div>
          {supplier.notes && (
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-300 italic">{supplier.notes}</div>
          )}

          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5"><History size={13} className="text-emerald-500" /> Historique des prix d'achat</p>
            {byProduct.length === 0 ? (
              <p className="text-gray-400 flex items-center gap-1.5"><Package size={13} /> Aucun achat enregistré auprès de ce fournisseur.</p>
            ) : (
              <div className="space-y-2.5">
                {byProduct.map(({ productId, productName, entries, lastPrice }) => (
                  <div key={productId} className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-gray-900 dark:text-white">{productName}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">Dernier prix : {formatAmount(lastPrice)}</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                      {entries.map((e, i) => (
                        <div key={i} className="flex justify-between">
                          <span>{formatDate(e.date)} — {e.orderNumber}</span>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">{formatAmount(e.unitPrice)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
