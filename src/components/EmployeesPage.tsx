import { DecimalInput } from './ui/DecimalInput';
import { todayIso, addDaysIso } from '../data/dateUtils';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getRoles } from '../api/roles';
import type { Role } from '../data/rbacModel';
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FilterX,
  UserCheck,
  UserX,
  UserPlus,
  Plus,
  Eye,
  Pencil,
  Archive,
  ArchiveRestore,
  X,
  AlertCircle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Phone,
  Briefcase,
  IdCard,
  FileText,
  ImagePlus,
  CalendarDays,
  LineChart,
  Mail,
  KeyRound,
  Lock,
} from 'lucide-react';
import { useQueryParam } from '../hooks/useQueryParam';
import {
  Employee,
  EmployeeStatus,
  EmployeeDocument,
  EMPLOYEE_STATUSES,
  SUGGESTED_POSTES,
  DraftEmployee,
  createEmptyDraftEmployee,
  createDraftFromEmployee,
  validateDraftEmployee,
  buildEmployeeFromDraft,
  getEmployeeFullName,
  getEmployeeReferenceCount,
  formatDisplayDate,
  DayRecord,
  FinancialRecord,
} from '../data/hrModel';

export interface NewEmployeeAccount {
  email?: string;
  roleId: string;
  password: string;
}

interface EmployeesPageProps {
  employees: Employee[];
  dayRecords: DayRecord[];
  financialRecords: FinancialRecord[];
  onNavigateToDashboard: () => void;
  onNavigateToPlanning: () => void;
  onNavigateToFinancials: () => void;
  onCreateEmployee: (employee: Employee, account?: NewEmployeeAccount) => void;
  onUpdateEmployee: (employee: Employee) => void;
  onArchiveEmployee: (employeeId: string) => void;
  onReactivateEmployee: (employeeId: string) => void;
  isDarkMode?: boolean;
}

type FormMode = 'create' | 'edit';
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

const STATUS_STYLES: Record<EmployeeStatus, string> = {
  Actif: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70',
  Inactif: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700',
};

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_DOC_BYTES = 5 * 1024 * 1024;

const formatAmount = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;
const getInitials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '—';

const EmployeeAvatar: React.FC<{ employee: Pick<Employee, 'firstName' | 'lastName' | 'photoUrl'>; size?: number }> = ({ employee, size = 36 }) => {
  const full = getEmployeeFullName(employee);
  if (employee.photoUrl) {
    return (
      <img
        src={employee.photoUrl}
        alt={full}
        className="rounded-full object-cover border border-gray-200 dark:border-gray-700 shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {getInitials(full)}
    </span>
  );
};

const MIN_ACCOUNT_PASSWORD_LENGTH = 8;

export const EmployeesPage: React.FC<EmployeesPageProps> = ({
  employees,
  dayRecords,
  financialRecords,
  onNavigateToDashboard,
  onNavigateToPlanning,
  onNavigateToFinancials,
  onCreateEmployee,
  onUpdateEmployee,
  onArchiveEmployee,
  onReactivateEmployee,
}) => {
  const [formOpen, setFormOpen] = useState<FormMode | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [draft, setDraft] = useState<DraftEmployee>(createEmptyDraftEmployee());
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cinInputRef = useRef<HTMLInputElement>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // "Compte de connexion" — only offered when creating a new employee (create=='create'); editing
  // an existing account's access happens from Rôles & permissions instead (see that page's Users
  // tab), never re-duplicated here.
  const [createAccount, setCreateAccount] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountRoleId, setAccountRoleId] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState('');
  // Fetched on demand rather than passed down — mirrors RolesPermissionsPage's own self-sufficient
  // role loading; only needed here for the account section's role picker.
  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => {
    getRoles().then(setRoles).catch(() => undefined);
  }, []);

  const accountIssues = useMemo(() => {
    if (!createAccount) return new Map<string, string>();
    const map = new Map<string, string>();
    if (!accountRoleId) map.set('accountRoleId', 'Le rôle est obligatoire.');
    if (accountEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail.trim())) map.set('accountEmail', 'Adresse email invalide.');
    if (accountPassword.length < MIN_ACCOUNT_PASSWORD_LENGTH) map.set('accountPassword', `Le mot de passe doit contenir au moins ${MIN_ACCOUNT_PASSWORD_LENGTH} caractères.`);
    if (accountPasswordConfirm !== accountPassword) map.set('accountPasswordConfirm', 'Les mots de passe ne correspondent pas.');
    return map;
  }, [createAccount, accountRoleId, accountEmail, accountPassword, accountPasswordConfirm]);

  // "Voir" opens ?employee=<id> — a shareable/bookmarkable deep link straight into that
  // employee's detail modal. An id that doesn't match any employee (stale link, typo) just
  // resolves to no modal open, rather than crashing.
  const [employeeParam, setEmployeeParam] = useQueryParam('employee');
  const viewingEmployee = useMemo(() => employees.find((e) => e.id === employeeParam) ?? null, [employees, employeeParam]);
  const setViewingEmployee = (emp: Employee | null) => setEmployeeParam(emp ? emp.id : '');
  const [archiveTarget, setArchiveTarget] = useState<Employee | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Filters — search and status are synced to the URL (?q=&status=) so a filtered view can be
  // bookmarked or shared; validated against known statuses so a stray/invalid value never breaks
  // the filter or the <select>.
  const [searchQuery, setSearchQuery] = useQueryParam('q');
  const [filterStatusRaw, setFilterStatus] = useQueryParam('status', 'all');
  const filterStatus = useMemo<'all' | EmployeeStatus>(
    () => (EMPLOYEE_STATUSES.includes(filterStatusRaw as EmployeeStatus) ? (filterStatusRaw as EmployeeStatus) : 'all'),
    [filterStatusRaw]
  );
  const [filterPoste, setFilterPoste] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 8;

  const updateDraft = (patch: Partial<DraftEmployee>) => setDraft((prev) => ({ ...prev, ...patch }));

  const issues = useMemo(() => validateDraftEmployee(draft, employees), [draft, employees]);
  const issuesByField = new Map(issues.map((i) => [i.field, i.message]));
  const showErrors = hasAttemptedVerify;

  const postes = useMemo(() => Array.from(new Set(employees.map((e) => e.poste))).sort(), [employees]);

  // --- Photo / CIN document upload (same FileReader → data URL pattern used across the app) ---
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAttachmentError(null);
    if (!file.type.startsWith('image/')) { setAttachmentError('La photo doit être une image.'); return; }
    if (file.size > MAX_PHOTO_BYTES) { setAttachmentError('Photo trop volumineuse (3 Mo maximum).'); return; }
    const reader = new FileReader();
    reader.onload = () => updateDraft({ photoUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const handleCinSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAttachmentError(null);
    const isAllowed = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!isAllowed) { setAttachmentError('Format non pris en charge — image ou PDF uniquement.'); return; }
    if (file.size > MAX_DOC_BYTES) { setAttachmentError('Fichier trop volumineux (5 Mo maximum).'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const doc: EmployeeDocument = { name: file.name, mimeType: file.type, dataUrl: String(reader.result) };
      updateDraft({ cinDocument: doc });
    };
    reader.readAsDataURL(file);
  };

  // --- Create / edit workflow ---
  const handleOpenCreate = () => {
    setFormOpen('create');
    setDraft(createEmptyDraftEmployee());
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
    setAttachmentError(null);
    setCreateAccount(false);
    setAccountEmail('');
    setAccountRoleId('');
    setAccountPassword('');
    setAccountPasswordConfirm('');
  };

  const handleOpenEdit = (employee: Employee) => {
    setFormOpen('edit');
    setDraft(createDraftFromEmployee(employee));
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
    setAttachmentError(null);
  };

  const handleCloseForm = () => {
    setFormOpen(null);
    setStep('form');
  };

  const handleVerify = () => {
    setHasAttemptedVerify(true);
    if (issues.length === 0 && accountIssues.size === 0) setStep('preview');
  };

  const handleConfirm = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const employee = buildEmployeeFromDraft(draft);
      if (formOpen === 'create') {
        onCreateEmployee(
          employee,
          createAccount ? { email: accountEmail.trim() || undefined, roleId: accountRoleId, password: accountPassword } : undefined
        );
      } else {
        onUpdateEmployee(employee);
      }
      setStep('success');
      if (viewingEmployee && viewingEmployee.id === employee.id) setViewingEmployee(employee);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartNew = () => {
    setDraft(createEmptyDraftEmployee());
    setHasAttemptedVerify(false);
    setSaveError(null);
    setStep('form');
    setFormOpen('create');
    setCreateAccount(false);
    setAccountEmail('');
    setAccountRoleId('');
    setAccountPassword('');
    setAccountPasswordConfirm('');
  };

  const handleConfirmArchive = () => {
    if (!archiveTarget) return;
    onArchiveEmployee(archiveTarget.id);
    setArchiveTarget(null);
    if (viewingEmployee?.id === archiveTarget.id) setViewingEmployee(null);
  };

  // --- Filters / list ---
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (filterStatus !== 'all' && emp.status !== filterStatus) return false;
      if (filterPoste !== 'all' && emp.poste !== filterPoste) return false;
      if (dateFrom && emp.entryDate < dateFrom) return false;
      if (dateTo && emp.entryDate > dateTo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const fullName = getEmployeeFullName(emp).toLowerCase();
        if (!fullName.includes(q) && !emp.cinNumber.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [employees, filterStatus, filterPoste, dateFrom, dateTo, searchQuery]);

  const sortedEmployees = useMemo(() => [...filteredEmployees].sort((a, b) => (a.entryDate < b.entryDate ? 1 : -1)), [filteredEmployees]);
  const totalPages = Math.max(1, Math.ceil(sortedEmployees.length / rowsPerPage));
  const paginatedEmployees = useMemo(() => sortedEmployees.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [sortedEmployees, currentPage]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setFilterPoste('all');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(searchQuery.trim() || filterStatus !== 'all' || filterPoste !== 'all' || dateFrom || dateTo);

  // --- KPIs ---
  const totalEmployees = employees.length;
  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'Actif').length, [employees]);
  const inactiveEmployees = totalEmployees - activeEmployees;
  const recentEmployees = useMemo(() => {
    const cutoffIso = addDaysIso(todayIso(), -30);
    return employees.filter((e) => e.entryDate >= cutoffIso).length;
  }, [employees]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Employés</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Gestion du personnel
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Fiches employés, statut et informations d'identité.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button onClick={onNavigateToPlanning} className={secondaryButtonClass}>
            <CalendarDays size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Planning</span>
          </button>
          <button onClick={onNavigateToFinancials} className={secondaryButtonClass}>
            <LineChart size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Suivi financier</span>
          </button>
          <button onClick={handleOpenCreate} className={primaryButtonClass}>
            <Plus size={14} />
            <span>Ajouter un employé</span>
          </button>
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Total employés</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{totalEmployees}</span>
            <p className="text-[11px] text-gray-400">Toutes fiches confondues</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 flex items-center justify-center text-blue-500 shrink-0">
            <Users size={22} />
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Employés actifs</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{activeEmployees}</span>
            <p className="text-[11px] text-gray-400">En poste actuellement</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-500 shrink-0">
            <UserCheck size={22} />
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Employés inactifs</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{inactiveEmployees}</span>
            <p className="text-[11px] text-gray-400">Contrats terminés / suspendus</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 shrink-0">
            <UserX size={22} />
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Nouveaux employés</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{recentEmployees}</span>
            <p className="text-[11px] text-gray-400">Entrées des 30 derniers jours</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-center text-amber-500 shrink-0">
            <UserPlus size={22} />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5 flex-1">
            <div className="relative xl:col-span-2">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Nom, prénom ou CIN..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value as 'all' | EmployeeStatus); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
              <option value="all">Tous les statuts</option>
              {EMPLOYEE_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <select value={filterPoste} onChange={(e) => { setFilterPoste(e.target.value); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
              <option value="all">Tous les postes</option>
              {postes.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="Entrée du" className="w-full px-2.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} title="Entrée au" className="w-full px-2.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </div>
          </div>
          <button onClick={handleResetFilters} className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-2xs transition active:scale-98 shrink-0 cursor-pointer">
            <FilterX size={14} className="text-gray-500" />
            <span>Réinitialiser</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                <th className="py-3.5 px-4">Photo</th>
                <th className="py-3.5 px-4">Nom &amp; prénom</th>
                <th className="py-3.5 px-4">Téléphone</th>
                <th className="py-3.5 px-4">Poste</th>
                <th className="py-3.5 px-4">Date d'entrée</th>
                <th className="py-3.5 px-4 text-center">Statut</th>
                <th className="py-3.5 px-4 text-right">Salaire</th>
                <th className="py-3.5 px-4">CIN</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-14 text-gray-400">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Users className="w-9 h-9 mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Aucun employé pour le moment</p>
                      <p className="text-xs text-gray-400">Ajoutez votre première fiche employé pour démarrer la gestion du personnel.</p>
                      <button onClick={handleOpenCreate} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer">
                        <Plus size={13} /> Ajouter un employé
                      </button>
                    </div>
                  </td>
                </tr>
              ) : paginatedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-14 text-gray-400">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Search className="w-9 h-9 mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Aucun employé ne correspond à ces filtres</p>
                      <button onClick={handleResetFilters} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer">
                        <FilterX size={13} /> Réinitialiser les filtres
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="py-2.5 px-4"><EmployeeAvatar employee={emp} /></td>
                    <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-white whitespace-nowrap">{getEmployeeFullName(emp)}</td>
                    <td className="py-2.5 px-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">{emp.phone}</td>
                    <td className="py-2.5 px-4 text-gray-600 dark:text-gray-300">{emp.poste}</td>
                    <td className="py-2.5 px-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDisplayDate(emp.entryDate)}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap ${STATUS_STYLES[emp.status]}`}>{emp.status}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatAmount(emp.salary)}</td>
                    <td className="py-2.5 px-4 text-gray-500 dark:text-gray-400 font-mono">{emp.cinNumber}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setViewingEmployee(emp)} title="Voir" className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"><Eye size={14} /></button>
                        <button onClick={() => handleOpenEdit(emp)} title="Modifier" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><Pencil size={14} /></button>
                        {emp.status === 'Actif' ? (
                          <button onClick={() => setArchiveTarget(emp)} title="Archiver" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"><Archive size={14} /></button>
                        ) : (
                          <button onClick={() => onReactivateEmployee(emp.id)} title="Réactiver" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><ArchiveRestore size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {employees.length > 0 && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>sur un total de {sortedEmployees.length} employé{sortedEmployees.length > 1 ? 's' : ''}{hasActiveFilters ? ' (filtrés)' : ''}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer">
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 py-1 font-semibold text-gray-700 dark:text-gray-300">Page {currentPage} sur {totalPages}</span>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / edit — responsive modal dialog */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200" onClick={handleCloseForm}>
          <div
            className="w-full max-w-2xl max-h-[92vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {step === 'success' ? (
              <div className="p-8 sm:p-12 flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
                  <CheckCircle2 size={30} />
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{formOpen === 'create' ? 'Employé ajouté avec succès' : 'Employé modifié avec succès'}</h2>
                {formOpen === 'create' && createAccount && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">Son compte de connexion a été créé et lié à cette fiche.</p>
                )}
                <div className="flex items-center gap-2 pt-2 flex-wrap justify-center">
                  <button onClick={handleStartNew} className={secondaryButtonClass}>
                    <Plus size={14} />
                    <span>Ajouter un autre employé</span>
                  </button>
                  <button onClick={handleCloseForm} className={primaryButtonClass}>
                    <Users size={14} />
                    <span>Voir la liste</span>
                  </button>
                </div>
              </div>
            ) : step === 'preview' ? (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Vérification avant enregistrement</h2>
                  <button onClick={handleCloseForm} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                  <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">Vérifiez avant confirmation — rien n'est encore enregistré.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 flex items-center gap-3">
                  <EmployeeAvatar employee={{ firstName: draft.firstName, lastName: draft.lastName, photoUrl: draft.photoUrl || undefined }} size={44} />
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">{draft.firstName.trim()} {draft.lastName.trim()}</p>
                    <p className="text-gray-500">{draft.poste.trim()}</p>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Téléphone :</span><span className="font-bold text-gray-900 dark:text-white">{draft.phone.trim()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Date d'entrée :</span><span className="font-bold text-gray-900 dark:text-white">{formatDisplayDate(draft.entryDate)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Statut :</span><span className="font-bold text-gray-900 dark:text-white">{draft.status}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Salaire :</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(Number(draft.salary || 0))}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">CIN :</span><span className="font-bold text-gray-900 dark:text-white">{draft.cinNumber.trim()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Délivrance CIN :</span><span className="font-bold text-gray-900 dark:text-white">{formatDisplayDate(draft.cinIssueDate)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Copie CIN :</span><span className="font-bold text-gray-900 dark:text-white">{draft.cinDocument ? draft.cinDocument.name : 'Aucune'}</span></div>
                </div>
                {formOpen === 'create' && createAccount && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 space-y-1.5 text-xs">
                    <p className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5"><KeyRound size={13} /> Compte de connexion</p>
                    <div className="flex justify-between"><span className="text-emerald-700/80 dark:text-emerald-400/80">Email :</span><span className="font-bold text-emerald-900 dark:text-emerald-200">{accountEmail.trim() || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-emerald-700/80 dark:text-emerald-400/80">Rôle :</span><span className="font-bold text-emerald-900 dark:text-emerald-200">{roles.find((r) => r.id === accountRoleId)?.name ?? '—'}</span></div>
                  </div>
                )}
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
              <div className="p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">{formOpen === 'create' ? 'Nouvel employé' : "Modifier l'employé"}</h2>
                  <button onClick={handleCloseForm} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
                </div>

                {/* Informations personnelles */}
                <div className="space-y-3">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><Users size={13} className="text-emerald-500" /> Informations personnelles</p>
                  <div className="flex items-center gap-4">
                    <EmployeeAvatar employee={{ firstName: draft.firstName || '?', lastName: draft.lastName, photoUrl: draft.photoUrl || undefined }} size={64} />
                    <div className="flex items-center gap-2">
                      <button onClick={() => photoInputRef.current?.click()} className={secondaryButtonClass}><ImagePlus size={13} /><span>{draft.photoUrl ? 'Remplacer la photo' : 'Ajouter une photo'}</span></button>
                      {draft.photoUrl && <button onClick={() => updateDraft({ photoUrl: '' })} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"><X size={14} /></button>}
                      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className={labelClass}>Prénom *</label>
                      <input type="text" value={draft.firstName} onChange={(e) => updateDraft({ firstName: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('firstName') ? inputErrorClass : inputValidClass}`} />
                      {showErrors && issuesByField.get('firstName') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('firstName')}</p>)}
                    </div>
                    <div>
                      <label className={labelClass}>Nom *</label>
                      <input type="text" value={draft.lastName} onChange={(e) => updateDraft({ lastName: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('lastName') ? inputErrorClass : inputValidClass}`} />
                      {showErrors && issuesByField.get('lastName') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('lastName')}</p>)}
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Téléphone *</label>
                      <input type="text" value={draft.phone} onChange={(e) => updateDraft({ phone: e.target.value })} placeholder="+216 XX XXX XXX" className={`${inputBaseClass} ${showErrors && issuesByField.has('phone') ? inputErrorClass : inputValidClass}`} />
                      {showErrors && issuesByField.get('phone') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('phone')}</p>)}
                    </div>
                  </div>
                </div>

                {/* Informations professionnelles */}
                <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><Briefcase size={13} className="text-emerald-500" /> Informations professionnelles</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className={labelClass}>Poste *</label>
                      <input type="text" list="poste-suggestions" value={draft.poste} onChange={(e) => updateDraft({ poste: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('poste') ? inputErrorClass : inputValidClass}`} />
                      <datalist id="poste-suggestions">{SUGGESTED_POSTES.map((p) => (<option key={p} value={p} />))}</datalist>
                      {showErrors && issuesByField.get('poste') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('poste')}</p>)}
                    </div>
                    <div>
                      <label className={labelClass}>Date d'entrée *</label>
                      <input type="date" value={draft.entryDate} onChange={(e) => updateDraft({ entryDate: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('entryDate') ? inputErrorClass : inputValidClass}`} />
                      {showErrors && issuesByField.get('entryDate') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('entryDate')}</p>)}
                    </div>
                    <div>
                      <label className={labelClass}>Statut</label>
                      <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50/50 dark:bg-gray-800/50 w-fit">
                        {EMPLOYEE_STATUSES.map((s) => (
                          <button key={s} onClick={() => updateDraft({ status: s })} className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${draft.status === s ? 'bg-[#00A86B] text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Salaire (DT) *</label>
                      <DecimalInput min={0} step="any" value={draft.salary} onChange={(e) => updateDraft({ salary: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('salary') ? inputErrorClass : inputValidClass}`} />
                      {showErrors && issuesByField.get('salary') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('salary')}</p>)}
                    </div>
                  </div>
                </div>

                {/* Informations d'identité */}
                <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><IdCard size={13} className="text-emerald-500" /> Informations d'identité</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className={labelClass}>Numéro CIN *</label>
                      <input type="text" value={draft.cinNumber} onChange={(e) => updateDraft({ cinNumber: e.target.value })} placeholder="8 chiffres" className={`${inputBaseClass} ${showErrors && issuesByField.has('cinNumber') ? inputErrorClass : inputValidClass}`} />
                      {showErrors && issuesByField.get('cinNumber') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('cinNumber')}</p>)}
                    </div>
                    <div>
                      <label className={labelClass}>Date de délivrance *</label>
                      <input type="date" value={draft.cinIssueDate} onChange={(e) => updateDraft({ cinIssueDate: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('cinIssueDate') ? inputErrorClass : inputValidClass}`} />
                      {showErrors && issuesByField.get('cinIssueDate') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('cinIssueDate')}</p>)}
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Copie / photo de la CIN</label>
                      {draft.cinDocument ? (
                        <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                          {draft.cinDocument.mimeType.startsWith('image/') ? (
                            <img src={draft.cinDocument.dataUrl} alt="CIN" className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center text-red-500 shrink-0"><FileText size={20} /></div>
                          )}
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">{draft.cinDocument.name}</span>
                          <button onClick={() => updateDraft({ cinDocument: null })} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"><X size={14} /></button>
                        </div>
                      ) : (
                        <button onClick={() => cinInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 hover:border-emerald-400 hover:text-emerald-500 transition cursor-pointer text-xs font-semibold">
                          <IdCard size={15} /><span>Ajouter la copie de la CIN (image ou PDF)</span>
                        </button>
                      )}
                      <input ref={cinInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleCinSelect} />
                      {attachmentError && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {attachmentError}</p>)}
                    </div>
                  </div>
                </div>

                {/* Compte de connexion — create only; editing an existing account happens from Rôles & permissions */}
                {formOpen === 'create' && (
                  <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><KeyRound size={13} className="text-emerald-500" /> Compte de connexion (optionnel)</span>
                    </label>
                    {createAccount && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pl-6">
                        <div className="sm:col-span-2">
                          <label className={labelClass}>Email (optionnel)</label>
                          <div className="relative">
                            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="text" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} placeholder="nom@cafenoir.tn" className={`${inputBaseClass} pl-8 ${showErrors && accountIssues.has('accountEmail') ? inputErrorClass : inputValidClass}`} />
                          </div>
                          {showErrors && accountIssues.get('accountEmail') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {accountIssues.get('accountEmail')}</p>)}
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass}>Rôle *</label>
                          <select value={accountRoleId} onChange={(e) => setAccountRoleId(e.target.value)} className={`${inputBaseClass} appearance-none cursor-pointer ${showErrors && accountIssues.has('accountRoleId') ? inputErrorClass : inputValidClass}`}>
                            <option value="">Sélectionner un rôle</option>
                            {roles.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                          </select>
                          {showErrors && accountIssues.get('accountRoleId') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {accountIssues.get('accountRoleId')}</p>)}
                        </div>
                        <div>
                          <label className={labelClass}>Mot de passe *</label>
                          <div className="relative">
                            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} className={`${inputBaseClass} pl-8 ${showErrors && accountIssues.has('accountPassword') ? inputErrorClass : inputValidClass}`} />
                          </div>
                          {showErrors && accountIssues.get('accountPassword') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {accountIssues.get('accountPassword')}</p>)}
                        </div>
                        <div>
                          <label className={labelClass}>Confirmation du mot de passe *</label>
                          <div className="relative">
                            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="password" value={accountPasswordConfirm} onChange={(e) => setAccountPasswordConfirm(e.target.value)} className={`${inputBaseClass} pl-8 ${showErrors && accountIssues.has('accountPasswordConfirm') ? inputErrorClass : inputValidClass}`} />
                          </div>
                          {showErrors && accountIssues.get('accountPasswordConfirm') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {accountIssues.get('accountPasswordConfirm')}</p>)}
                        </div>
                        <p className="sm:col-span-2 text-[11px] text-gray-400">Ce compte sera définitivement lié à cet employé — pour gérer les comptes existants (réinitialiser un mot de passe, activer/désactiver), utilisez Rôles &amp; permissions.</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <button onClick={handleCloseForm} className={secondaryButtonClass}><span>Annuler la saisie</span></button>
                  <button onClick={handleVerify} className={primaryButtonClass}><ShieldCheck size={14} /><span>Vérifier</span></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View employee modal */}
      {viewingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setViewingEmployee(null)}>
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#151D2A] z-10">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">{getEmployeeFullName(viewingEmployee)}</h3>
              <button onClick={() => setViewingEmployee(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div>
                <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Identité</p>
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 flex items-center gap-3">
                  <EmployeeAvatar employee={viewingEmployee} size={56} />
                  <div className="grid grid-cols-1 gap-1">
                    <p className="font-bold text-gray-900 dark:text-white">{getEmployeeFullName(viewingEmployee)}</p>
                    <p className="text-gray-500 flex items-center gap-1"><Phone size={11} /> {viewingEmployee.phone}</p>
                    <p className="text-gray-500 flex items-center gap-1"><IdCard size={11} /> CIN {viewingEmployee.cinNumber} — délivrée le {formatDisplayDate(viewingEmployee.cinIssueDate)}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Informations professionnelles</p>
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-3">
                  <div><span className="text-gray-400 font-semibold block mb-0.5">Poste</span><span className="font-bold text-gray-900 dark:text-white">{viewingEmployee.poste}</span></div>
                  <div><span className="text-gray-400 font-semibold block mb-0.5">Date d'entrée</span><span className="font-bold text-gray-900 dark:text-white">{formatDisplayDate(viewingEmployee.entryDate)}</span></div>
                  <div><span className="text-gray-400 font-semibold block mb-0.5">Statut</span><span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${STATUS_STYLES[viewingEmployee.status]}`}>{viewingEmployee.status}</span></div>
                  <div><span className="text-gray-400 font-semibold block mb-0.5">Salaire</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(viewingEmployee.salary)}</span></div>
                </div>
              </div>

              <div>
                <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Document</p>
                {viewingEmployee.cinDocument ? (
                  viewingEmployee.cinDocument.mimeType.startsWith('image/') ? (
                    <button onClick={() => setLightboxSrc(viewingEmployee.cinDocument!.dataUrl)} className="block w-full cursor-zoom-in">
                      <img src={viewingEmployee.cinDocument.dataUrl} alt="Copie CIN" className="w-full max-h-56 object-contain rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50" />
                    </button>
                  ) : (
                    <a href={viewingEmployee.cinDocument.dataUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                      <FileText size={16} /><span>{viewingEmployee.cinDocument.name}</span>
                    </a>
                  )
                ) : (
                  <p className="text-gray-400 flex items-center gap-1.5"><ImagePlus size={14} /> Aucun document joint.</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button onClick={() => setViewingEmployee(null)} className={secondaryButtonClass}><span>Fermer</span></button>
                <button onClick={() => handleOpenEdit(viewingEmployee)} className={primaryButtonClass}><Pencil size={14} /><span>Modifier</span></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document lightbox */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/85 animate-in fade-in duration-150" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="Copie CIN" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightboxSrc(null)} className="absolute top-5 right-5 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition cursor-pointer"><X size={20} /></button>
        </div>
      )}

      {/* Archive confirmation modal */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setArchiveTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2"><Archive size={16} className="text-red-500" /> Archiver cet employé</h3>
              <button onClick={() => setArchiveTarget(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-5 text-xs text-gray-600 dark:text-gray-300 space-y-2">
              <p>
                Voulez-vous archiver <strong className="text-gray-900 dark:text-white">{getEmployeeFullName(archiveTarget)}</strong> ? Son statut passera à
                Inactif — rien n'est supprimé : son planning, son suivi financier et tout son historique restent intacts et consultables.
              </p>
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300">
                Si un compte de connexion est lié à cet employé, il sera désactivé immédiatement (déconnexion et blocage de l'accès).
              </div>
              {getEmployeeReferenceCount(archiveTarget.id, dayRecords, financialRecords) > 0 && (
                <p className="text-gray-500">Vous pourrez réactiver cet employé à tout moment depuis cette page ou depuis la page Archive.</p>
              )}
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button onClick={() => setArchiveTarget(null)} className={secondaryButtonClass}><span>Annuler</span></button>
              <button onClick={handleConfirmArchive} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer">
                <Archive size={14} /><span>Archiver</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
