import { todayIso } from '../data/dateUtils';
import React, { useMemo, useState } from 'react';
import { useQueryParam } from '../hooks/useQueryParam';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Users2,
  CheckCircle2,
  XCircle,
  Plane,
  Moon,
  Clock,
  Layers,
  CalendarClock,
  Settings2,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  ChevronDown,
  LineChart,
  Users,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import {
  Employee,
  Shift,
  DayRecord,
  RecurringPlan,
  AttendanceStatus,
  ATTENDANCE_STATUSES,
  STATUSES_WITH_SHIFT,
  MAX_SHIFTS,
  DraftShift,
  createEmptyDraftShift,
  createDraftFromShift,
  validateDraftShift,
  buildShiftFromDraft,
  getShiftUsageCount,
  WeeklyPattern,
  createEmptyWeeklyPattern,
  WEEKDAY_KEYS,
  WeekdayKey,
  WEEKDAY_LABELS,
  WEEKDAY_LABELS_SHORT,
  getMondayOfWeek,
  getWeekDates,
  getWeekdayKeyForDate,
  addDaysIso,
  findDayRecord,
  findPlanningConflicts,
  isRestDayOverrideConflict,
  formatDisplayDate,
  getEmployeeFullName,
} from '../data/hrModel';

interface PlanningPageProps {
  employees: Employee[];
  shifts: Shift[];
  dayRecords: DayRecord[];
  recurringPlans: RecurringPlan[];
  onNavigateToDashboard: () => void;
  onNavigateToEmployees: () => void;
  onNavigateToFinancials: () => void;
  onCreateShift: (shift: Shift) => void;
  onUpdateShift: (shift: Shift) => void;
  onDeleteShift: (shiftId: string) => void;
  onSavePlanning: (params: { employeeId: string; startDate: string; endDate: string; weeklyPattern: WeeklyPattern; isRecurring: boolean }) => void;
  onSetAttendance: (params: { employeeId: string; date: string; status: AttendanceStatus; shiftIds: string[] }) => void;
  onDeleteDayRecord: (record: DayRecord, scope: 'day' | 'recurrence') => void;
  isDarkMode?: boolean;
}

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  Planifié: 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/70',
  Présent: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70',
  Absent: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70',
  Congé: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/70',
  Repos: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  Retard: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/70',
  Doublage: 'bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800/70',
};

const STATUS_ICONS: Record<AttendanceStatus, React.ComponentType<{ size?: number; className?: string }>> = {
  Planifié: CalendarClock, Présent: CheckCircle2, Absent: XCircle, Congé: Plane, Repos: Moon, Retard: Clock, Doublage: Layers,
};


const shiftLabel = (shiftId: string, shifts: Shift[]): string => shifts.find((s) => s.id === shiftId)?.name ?? 'Shift';

export const PlanningPage: React.FC<PlanningPageProps> = ({
  employees,
  shifts,
  dayRecords,
  recurringPlans,
  onNavigateToDashboard,
  onNavigateToEmployees,
  onNavigateToFinancials,
  onCreateShift,
  onUpdateShift,
  onDeleteShift,
  onSavePlanning,
  onSetAttendance,
  onDeleteDayRecord,
}) => {
  // The selected week is synced to ?week= so a specific week's planning is a shareable link and
  // survives a refresh; an invalid/garbage date value falls back to the current week instead of
  // crashing the calendar.
  const [weekAnchorRaw, setWeekAnchor] = useQueryParam('week', todayIso());
  const weekAnchor = useMemo(() => {
    const isValidIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(weekAnchorRaw) && !Number.isNaN(new Date(weekAnchorRaw).getTime());
    return isValidIsoDate ? weekAnchorRaw : todayIso();
  }, [weekAnchorRaw]);
  const monday = useMemo(() => getMondayOfWeek(weekAnchor), [weekAnchor]);
  const weekDates = useMemo(() => getWeekDates(monday), [monday]);

  const [shiftsModalOpen, setShiftsModalOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [attendanceTarget, setAttendanceTarget] = useState<{ employeeId: string; date: string } | null>(null);

  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'Actif'), [employees]);

  // --- KPIs (today) ---
  const today = todayIso();
  const todayRecords = useMemo(
    () => activeEmployees.map((e) => findDayRecord(e.id, today, dayRecords)).filter((r): r is DayRecord => Boolean(r)),
    [activeEmployees, dayRecords, today]
  );
  const kpiCount = (status: AttendanceStatus) => todayRecords.filter((r) => r.status === status).length;
  const kpis = [
    { label: 'Employés planifiés', value: todayRecords.length, icon: Users2, color: 'blue' },
    { label: 'Présents', value: kpiCount('Présent') + kpiCount('Doublage'), icon: CheckCircle2, color: 'emerald' },
    { label: 'Absents', value: kpiCount('Absent'), icon: XCircle, color: 'red' },
    { label: 'En congé', value: kpiCount('Congé'), icon: Plane, color: 'indigo' },
    { label: 'En repos', value: kpiCount('Repos'), icon: Moon, color: 'gray' },
    { label: 'En retard', value: kpiCount('Retard'), icon: Clock, color: 'amber' },
  ];
  const KPI_ICON_BG: Record<string, string> = {
    blue: 'bg-blue-50/80 dark:bg-blue-950/40 text-blue-500',
    emerald: 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-500',
    red: 'bg-red-50/80 dark:bg-red-950/40 text-red-500',
    indigo: 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-500',
    gray: 'bg-gray-100 dark:bg-gray-800 text-gray-500',
    amber: 'bg-amber-50/80 dark:bg-amber-950/40 text-amber-500',
  };

  const periodLabel = `${formatDisplayDate(weekDates[0])} — ${formatDisplayDate(weekDates[6])}`;

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Planning &amp; Présence</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Gestion du personnel
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Planifiez les horaires et enregistrez la présence manuellement — aucun dispositif biométrique n'est utilisé.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button onClick={onNavigateToEmployees} className={secondaryButtonClass}>
            <Users size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Employés</span>
          </button>
          <button onClick={onNavigateToFinancials} className={secondaryButtonClass}>
            <LineChart size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Suivi financier</span>
          </button>
          <button onClick={() => setShiftsModalOpen(true)} className={secondaryButtonClass}>
            <Settings2 size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Gérer les shifts</span>
          </button>
          <button onClick={() => setWizardOpen(true)} className={primaryButtonClass}>
            <Plus size={14} />
            <span>Créer un planning</span>
          </button>
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {/* KPI Cards (today) */}
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Aujourd'hui — {formatDisplayDate(today)}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {kpis.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
              <div className="space-y-0.5 min-w-0">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 block truncate">{label}</span>
                <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">{value}</span>
              </div>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${KPI_ICON_BG[color]}`}>
                <Icon size={18} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Period navigation */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Semaine :</span>
          <span className="text-sm font-bold text-gray-900 dark:text-white">{periodLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50/50 dark:bg-gray-800/50">
            <button onClick={() => setWeekAnchor(addDaysIso(weekAnchor, -7))} title="Semaine précédente" className="w-7 h-7 rounded-md flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition cursor-pointer">
              <ChevronLeft size={15} />
            </button>
            <button onClick={() => setWeekAnchor(todayIso())} className="px-3 h-7 text-xs font-semibold rounded-md text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition cursor-pointer">
              Aujourd'hui
            </button>
            <button onClick={() => setWeekAnchor(addDaysIso(weekAnchor, 7))} title="Semaine suivante" className="w-7 h-7 rounded-md flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition cursor-pointer">
              <ChevronRight size={15} />
            </button>
          </div>
          <input type="date" value={weekAnchor} onChange={(e) => setWeekAnchor(e.target.value || todayIso())} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
        </div>
      </div>

      {/* Planning calendar */}
      <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[880px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                <th className="py-3 px-4 sticky left-0 bg-gray-50/95 dark:bg-gray-800/95 z-10 w-48">Employé</th>
                {weekDates.map((date) => {
                  const key = getWeekdayKeyForDate(date);
                  const isToday = date === today;
                  return (
                    <th key={date} className={`py-3 px-2 text-center ${isToday ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                      <div>{WEEKDAY_LABELS_SHORT[key]}</div>
                      <div className="text-[10px] font-medium opacity-70">{formatDisplayDate(date).slice(0, 5)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
              {activeEmployees.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-14 text-gray-400"><Users2 className="w-9 h-9 mx-auto text-gray-300 dark:text-gray-600 mb-2" />Aucun employé actif à planifier.</td></tr>
              ) : (
                activeEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="py-2 px-4 sticky left-0 bg-white dark:bg-[#151D2A] z-10 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                      {getEmployeeFullName(emp)}
                      <p className="text-[10px] font-normal text-gray-400">{emp.poste}</p>
                    </td>
                    {weekDates.map((date) => {
                      const record = findDayRecord(emp.id, date, dayRecords);
                      const StatusIcon = record ? STATUS_ICONS[record.status] : null;
                      return (
                        <td key={date} className="py-2 px-2 text-center align-middle">
                          <button
                            onClick={() => setAttendanceTarget({ employeeId: emp.id, date })}
                            className={`w-full min-w-[92px] px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition cursor-pointer flex flex-col items-center gap-0.5 ${
                              record ? STATUS_STYLES[record.status] : 'border-dashed border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 hover:border-emerald-300 hover:text-emerald-500'
                            }`}
                            title="Modifier la présence de ce jour"
                          >
                            {StatusIcon ? <StatusIcon size={12} /> : <Plus size={12} />}
                            <span>{record ? (record.status === 'Doublage' ? 'Doublage' : record.status) : 'Planifier'}</span>
                            {record && record.shiftIds.length > 0 && (
                              <span className="opacity-80 leading-tight">
                                {record.shiftIds.length === 2 ? 'Shift 1 + 2' : shiftLabel(record.shiftIds[0], shifts).split(' — ')[0]}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-3.5 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          {ATTENDANCE_STATUSES.map((s) => {
            const Icon = STATUS_ICONS[s];
            return (
              <span key={s} className="inline-flex items-center gap-1"><Icon size={11} className={STATUS_STYLES[s].split(' ').find((c) => c.startsWith('text-')) ?? ''} /> {s}</span>
            );
          })}
        </div>
      </div>

      {/* Shift management modal */}
      {shiftsModalOpen && (
        <ShiftsModal shifts={shifts} dayRecords={dayRecords} onClose={() => setShiftsModalOpen(false)} onCreate={onCreateShift} onUpdate={onUpdateShift} onDelete={onDeleteShift} />
      )}

      {/* Planning creation wizard */}
      {wizardOpen && (
        <PlanningWizardModal
          employees={activeEmployees}
          shifts={shifts}
          dayRecords={dayRecords}
          onClose={() => setWizardOpen(false)}
          onSave={(params) => { onSavePlanning(params); }}
        />
      )}

      {/* Manual attendance edit modal */}
      {attendanceTarget && (
        <AttendanceEditModal
          employee={employees.find((e) => e.id === attendanceTarget.employeeId)!}
          date={attendanceTarget.date}
          shifts={shifts}
          existing={findDayRecord(attendanceTarget.employeeId, attendanceTarget.date, dayRecords)}
          onClose={() => setAttendanceTarget(null)}
          onSave={(status, shiftIds) => {
            onSetAttendance({ employeeId: attendanceTarget.employeeId, date: attendanceTarget.date, status, shiftIds });
            setAttendanceTarget(null);
          }}
          onDelete={(record, scope) => {
            onDeleteDayRecord(record, scope);
            setAttendanceTarget(null);
          }}
        />
      )}
    </div>
  );
};

// --- Shift management modal --------------------------------------------------------------------

const ShiftsModal: React.FC<{
  shifts: Shift[];
  dayRecords: DayRecord[];
  onClose: () => void;
  onCreate: (s: Shift) => void;
  onUpdate: (s: Shift) => void;
  onDelete: (id: string) => void;
}> = ({ shifts, dayRecords, onClose, onCreate, onUpdate, onDelete }) => {
  const [formOpen, setFormOpen] = useState<'create' | 'edit' | null>(null);
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [draft, setDraft] = useState<DraftShift>(createEmptyDraftShift());
  const [showErrors, setShowErrors] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null);

  const issues = useMemo(() => validateDraftShift(draft, shifts), [draft, shifts]);
  const issuesByField = new Map(issues.map((i) => [i.field, i.message]));

  const handleOpenCreate = () => {
    if (shifts.length >= MAX_SHIFTS) return;
    setFormOpen('create');
    setDraft(createEmptyDraftShift());
    setStep('form');
    setShowErrors(false);
  };
  const handleOpenEdit = (s: Shift) => {
    setFormOpen('edit');
    setDraft(createDraftFromShift(s));
    setStep('form');
    setShowErrors(false);
  };
  const handleVerify = () => {
    setShowErrors(true);
    if (issues.length === 0) setStep('preview');
  };
  const handleConfirm = () => {
    const shift = buildShiftFromDraft(draft);
    if (formOpen === 'create') onCreate(shift);
    else onUpdate(shift);
    setFormOpen(null);
    setStep('form');
  };
  const deleteBlockedReason = useMemo(() => {
    if (!deleteTarget) return null;
    const count = getShiftUsageCount(deleteTarget.id, dayRecords);
    return count > 0 ? `${count} jour${count > 1 ? 's' : ''} de planning utilisent ce shift.` : null;
  }, [deleteTarget, dayRecords]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[88vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#151D2A] z-10">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2"><Settings2 size={16} className="text-emerald-500" /> Gérer les shifts</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {formOpen ? (
            step === 'preview' ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                  <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">Vérifiez avant confirmation.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-1.5">
                  <div className="flex justify-between"><span className="text-gray-500">Nom :</span><span className="font-bold text-gray-900 dark:text-white">{draft.name.trim()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Horaires :</span><span className="font-bold text-gray-900 dark:text-white">{draft.startTime} — {draft.endTime}</span></div>
                  {draft.description && <div className="flex justify-between gap-3"><span className="text-gray-500 shrink-0">Description :</span><span className="text-gray-700 dark:text-gray-300 text-right">{draft.description}</span></div>}
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button onClick={() => setStep('form')} className={secondaryButtonClass}><span>Modifier</span></button>
                  <button onClick={handleConfirm} className={primaryButtonClass}><ShieldCheck size={14} /><span>Confirmer</span></button>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">{formOpen === 'create' ? 'Nouveau shift' : 'Modifier le shift'}</h4>
                  <button onClick={() => setFormOpen(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={14} /></button>
                </div>
                <div>
                  <label className={labelClass}>Nom du shift *</label>
                  <input type="text" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} className={`${inputBaseClass} ${showErrors && issuesByField.has('name') ? inputErrorClass : inputValidClass}`} />
                  {showErrors && issuesByField.get('name') && <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('name')}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Heure de début *</label>
                    <input type="time" value={draft.startTime} onChange={(e) => setDraft((p) => ({ ...p, startTime: e.target.value }))} className={`${inputBaseClass} ${showErrors && issuesByField.has('startTime') ? inputErrorClass : inputValidClass}`} />
                  </div>
                  <div>
                    <label className={labelClass}>Heure de fin *</label>
                    <input type="time" value={draft.endTime} onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))} className={`${inputBaseClass} ${showErrors && issuesByField.has('endTime') ? inputErrorClass : inputValidClass}`} />
                    {showErrors && issuesByField.get('endTime') && <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('endTime')}</p>}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <textarea value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} rows={2} placeholder="Optionnel" className={`${inputBaseClass} ${inputValidClass} resize-none`} />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <button onClick={() => setFormOpen(null)} className={secondaryButtonClass}><span>Annuler</span></button>
                  <button onClick={handleVerify} className={primaryButtonClass}><ShieldCheck size={14} /><span>Vérifier</span></button>
                </div>
              </div>
            )
          ) : (
            <>
              <div className="space-y-2">
                {shifts.map((s) => (
                  <div key={s.id} className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{s.name}</p>
                      <p className="text-gray-500">{s.startTime} — {s.endTime}</p>
                      {s.description && <p className="text-gray-400 text-[11px] mt-0.5">{s.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleOpenEdit(s)} title="Modifier" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteTarget(s)} title="Supprimer" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
              {shifts.length >= MAX_SHIFTS ? (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>Le maximum de {MAX_SHIFTS} shifts est atteint. Modifiez un shift existant si besoin.</span>
                </div>
              ) : (
                <button onClick={handleOpenCreate} className={primaryButtonClass}><Plus size={14} /><span>Ajouter un shift</span></button>
              )}
            </>
          )}
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2"><AlertCircle size={16} className="text-red-500" /> Supprimer le shift</h3>
              <button onClick={() => setDeleteTarget(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-5 text-xs text-gray-600 dark:text-gray-300 space-y-2">
              {deleteBlockedReason ? (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400">Suppression impossible : {deleteBlockedReason}</div>
              ) : (
                <p>Voulez-vous vraiment supprimer <strong className="text-gray-900 dark:text-white">{deleteTarget.name}</strong> ?</p>
              )}
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className={secondaryButtonClass}><span>{deleteBlockedReason ? 'Fermer' : 'Annuler'}</span></button>
              {!deleteBlockedReason && (
                <button onClick={() => { onDelete(deleteTarget.id); setDeleteTarget(null); }} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer">
                  <Trash2 size={14} /><span>Supprimer</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Planning creation wizard -------------------------------------------------------------------

type WizardStep = 'employee' | 'period' | 'schedule' | 'recurrence' | 'preview' | 'success';
const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
  { key: 'employee', label: 'Employé' },
  { key: 'period', label: 'Période' },
  { key: 'schedule', label: 'Horaire' },
  { key: 'recurrence', label: 'Récurrence' },
  { key: 'preview', label: 'Aperçu' },
];

const PlanningWizardModal: React.FC<{
  employees: Employee[];
  shifts: Shift[];
  dayRecords: DayRecord[];
  onClose: () => void;
  onSave: (params: { employeeId: string; startDate: string; endDate: string; weeklyPattern: WeeklyPattern; isRecurring: boolean }) => void;
}> = ({ employees, shifts, dayRecords, onClose, onSave }) => {
  const [wizardStep, setWizardStep] = useState<WizardStep>('employee');
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(addDaysIso(todayIso(), 27));
  const [pattern, setPattern] = useState<WeeklyPattern>(createEmptyWeeklyPattern());
  const [isRecurring, setIsRecurring] = useState(false);
  const [ackConflicts, setAckConflicts] = useState(false);

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.key === wizardStep);
  const employee = employees.find((e) => e.id === employeeId);

  const targetDates = useMemo(() => {
    const dates: string[] = [];
    let cursor = startDate;
    let guard = 0;
    while (cursor <= endDate && guard < 400) {
      dates.push(cursor);
      cursor = addDaysIso(cursor, 1);
      guard += 1;
    }
    return dates;
  }, [startDate, endDate]);

  const conflicts = useMemo(() => (employeeId ? findPlanningConflicts(employeeId, targetDates, dayRecords) : []), [employeeId, targetDates, dayRecords]);

  const setDayConfig = (key: WeekdayKey, patch: Partial<WeeklyPattern[WeekdayKey]>) =>
    setPattern((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const toggleShiftForDay = (key: WeekdayKey, shiftId: string) => {
    setPattern((prev) => {
      const current = prev[key].shiftIds;
      const has = current.includes(shiftId);
      const next = has ? current.filter((id) => id !== shiftId) : [...current, shiftId];
      return { ...prev, [key]: { ...prev[key], shiftIds: next } };
    });
  };

  const setDoublage = (key: WeekdayKey) => setDayConfig(key, { shiftIds: shifts.map((s) => s.id) });

  const periodValid = Boolean(startDate && endDate && startDate <= endDate);
  const scheduleValid = WEEKDAY_KEYS.every((key) => pattern[key].dayType === 'Repos' || pattern[key].shiftIds.length > 0);

  const handleNext = () => {
    if (wizardStep === 'employee' && employeeId) setWizardStep('period');
    else if (wizardStep === 'period' && periodValid) setWizardStep('schedule');
    else if (wizardStep === 'schedule' && scheduleValid) setWizardStep('recurrence');
    else if (wizardStep === 'recurrence') setWizardStep('preview');
  };
  const handleBack = () => {
    const idx = WIZARD_STEPS.findIndex((s) => s.key === wizardStep);
    if (idx > 0) setWizardStep(WIZARD_STEPS[idx - 1].key);
  };

  const handleConfirm = () => {
    onSave({ employeeId, startDate, endDate, weeklyPattern: pattern, isRecurring });
    setWizardStep('success');
  };

  const handleStartAnother = () => {
    setWizardStep('employee');
    setEmployeeId('');
    setStartDate(todayIso());
    setEndDate(addDaysIso(todayIso(), 27));
    setPattern(createEmptyWeeklyPattern());
    setIsRecurring(false);
    setAckConflicts(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#151D2A] z-10">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2"><CalendarDays size={16} className="text-emerald-500" /> Créer un planning</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
        </div>

        {wizardStep !== 'success' && (
          <div className="px-5 pt-4 flex items-center gap-1.5">
            {WIZARD_STEPS.map((s, i) => (
              <React.Fragment key={s.key}>
                <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${i <= stepIndex ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-300 dark:text-gray-600'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border ${i <= stepIndex ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 dark:border-gray-700'}`}>{i + 1}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < WIZARD_STEPS.length - 1 && <div className={`flex-1 h-px ${i < stepIndex ? 'bg-emerald-400' : 'bg-gray-200 dark:bg-gray-700'}`} />}
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="p-5 space-y-4 text-xs">
          {wizardStep === 'success' ? (
            <div className="py-6 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500"><CheckCircle2 size={30} /></div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Planning enregistré avec succès</h2>
              <div className="flex items-center gap-2 pt-2 flex-wrap justify-center">
                <button onClick={handleStartAnother} className={secondaryButtonClass}><Plus size={14} /><span>Planifier un autre employé</span></button>
                <button onClick={onClose} className={primaryButtonClass}><CalendarDays size={14} /><span>Voir le planning</span></button>
              </div>
            </div>
          ) : wizardStep === 'employee' ? (
            <div className="space-y-3">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Sélectionnez l'employé à planifier.</p>
              <div className="relative">
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${inputValidClass}`}>
                  <option value="">Sélectionner un employé</option>
                  {employees.map((e) => (<option key={e.id} value={e.id}>{getEmployeeFullName(e)} — {e.poste}</option>))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          ) : wizardStep === 'period' ? (
            <div className="space-y-3">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Choisissez la période à planifier pour {employee ? getEmployeeFullName(employee) : ''}.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Date de début *</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${inputBaseClass} ${inputValidClass}`} />
                </div>
                <div>
                  <label className={labelClass}>Date de fin *</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputBaseClass} ${!periodValid ? inputErrorClass : inputValidClass}`} />
                  {!periodValid && <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> La date de fin doit être après la date de début.</p>}
                </div>
              </div>
            </div>
          ) : wizardStep === 'schedule' ? (
            <div className="space-y-3">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Définissez les jours de repos et de travail, et le shift assigné.</p>
              <div className="space-y-2">
                {WEEKDAY_KEYS.map((key) => {
                  const cfg = pattern[key];
                  const isDoublage = cfg.shiftIds.length === 2;
                  return (
                    <div key={key} className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800 dark:text-gray-200 w-24 shrink-0">{WEEKDAY_LABELS[key]}</span>
                        <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-white dark:bg-gray-800">
                          {(['Repos', 'Travail'] as const).map((dt) => (
                            <button key={dt} onClick={() => setDayConfig(key, { dayType: dt, shiftIds: dt === 'Repos' ? [] : cfg.shiftIds })} className={`px-3 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer ${cfg.dayType === dt ? 'bg-[#00A86B] text-white shadow-xs' : 'text-gray-600 dark:text-gray-300'}`}>
                              {dt}
                            </button>
                          ))}
                        </div>
                        {cfg.dayType === 'Travail' && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {shifts.map((s) => (
                              <button
                                key={s.id}
                                onClick={() => toggleShiftForDay(key, s.id)}
                                disabled={isDoublage && !cfg.shiftIds.includes(s.id)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${cfg.shiftIds.includes(s.id) ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/70' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}
                              >
                                {s.name.split(' — ')[0]}
                              </button>
                            ))}
                            <button onClick={() => setDoublage(key)} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${isDoublage ? 'bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800/70' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                              Doublage
                            </button>
                          </div>
                        )}
                      </div>
                      {cfg.dayType === 'Travail' && cfg.shiftIds.length === 0 && (
                        <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1"><AlertCircle size={11} /> Sélectionnez au moins un shift pour ce jour de travail.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : wizardStep === 'recurrence' ? (
            <div className="space-y-3">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Ce planning doit-il se répéter chaque semaine ?</p>
              <button
                onClick={() => setIsRecurring((v) => !v)}
                className={`w-full flex items-center justify-between gap-3 p-4 rounded-xl border transition cursor-pointer text-left ${isRecurring ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
              >
                <span>
                  <span className="font-semibold text-gray-900 dark:text-white block">Rendre ce planning récurrent</span>
                  <span className="text-gray-500 text-[11px]">Le modèle hebdomadaire ci-dessus sera réappliqué automatiquement chaque semaine jusqu'au {formatDisplayDate(endDate)}.</span>
                </span>
                <span className={`w-10 h-5 rounded-full relative shrink-0 transition ${isRecurring ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${isRecurring ? 'left-5' : 'left-0.5'}`} />
                </span>
              </button>
              {!isRecurring && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300">
                  Planning ponctuel — appliqué uniquement du {formatDisplayDate(startDate)} au {formatDisplayDate(endDate)}.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Vérifiez le planning avant de le confirmer — rien n'est encore enregistré.</p>
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-1.5">
                <div className="flex justify-between"><span className="text-gray-500">Employé :</span><span className="font-bold text-gray-900 dark:text-white">{employee ? getEmployeeFullName(employee) : ''}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Période :</span><span className="font-bold text-gray-900 dark:text-white">{formatDisplayDate(startDate)} → {formatDisplayDate(endDate)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Type :</span><span className="font-bold text-gray-900 dark:text-white">{isRecurring ? 'Récurrent (hebdomadaire)' : 'Ponctuel'}</span></div>
              </div>
              <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                    {WEEKDAY_KEYS.map((key) => {
                      const cfg = pattern[key];
                      return (
                        <tr key={key}>
                          <td className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-300 w-28">{WEEKDAY_LABELS[key]}</td>
                          <td className="py-2 px-3">
                            {cfg.dayType === 'Repos' ? (
                              <span className="text-gray-500">Repos</span>
                            ) : cfg.shiftIds.length === 2 ? (
                              <span className="font-semibold text-fuchsia-600 dark:text-fuchsia-400">Doublage — Shift 1 + Shift 2</span>
                            ) : (
                              <span className="font-semibold text-blue-600 dark:text-blue-400">{cfg.shiftIds.map((id) => shiftLabel(id, shifts)).join(', ')}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {conflicts.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2">
                  <p className="text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1.5"><AlertTriangle size={14} /> {conflicts.length} jour{conflicts.length > 1 ? 's ont' : ' a'} déjà un planning enregistré</p>
                  <p className="text-amber-700/80 dark:text-amber-400/80">{conflicts.slice(0, 6).map((c) => formatDisplayDate(c.date)).join(', ')}{conflicts.length > 6 ? `, +${conflicts.length - 6} autre(s)` : ''}</p>
                  <label className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold cursor-pointer">
                    <input type="checkbox" checked={ackConflicts} onChange={(e) => setAckConflicts(e.target.checked)} className="rounded" />
                    Je confirme le remplacement des jours existants
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {wizardStep !== 'success' && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between sticky bottom-0 bg-white dark:bg-[#151D2A]">
            <button onClick={wizardStep === 'employee' ? onClose : handleBack} className={secondaryButtonClass}>
              <ArrowLeft size={14} /><span>{wizardStep === 'employee' ? 'Annuler' : 'Précédent'}</span>
            </button>
            {wizardStep === 'preview' ? (
              <button onClick={handleConfirm} disabled={conflicts.length > 0 && !ackConflicts} className={primaryButtonClass}>
                <ShieldCheck size={14} /><span>Confirmer le planning</span>
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={(wizardStep === 'employee' && !employeeId) || (wizardStep === 'period' && !periodValid) || (wizardStep === 'schedule' && !scheduleValid)}
                className={primaryButtonClass}
              >
                <span>Suivant</span><ArrowRight size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Manual attendance edit modal ----------------------------------------------------------------

const AttendanceEditModal: React.FC<{
  employee: Employee;
  date: string;
  shifts: Shift[];
  existing: DayRecord | undefined;
  onClose: () => void;
  onSave: (status: AttendanceStatus, shiftIds: string[]) => void;
  onDelete: (record: DayRecord, scope: 'day' | 'recurrence') => void;
}> = ({ employee, date, shifts, existing, onClose, onSave, onDelete }) => {
  const [status, setStatus] = useState<AttendanceStatus>(existing?.status ?? 'Planifié');
  const [shiftIds, setShiftIds] = useState<string[]>(existing?.shiftIds ?? []);
  const [ackRestConflict, setAckRestConflict] = useState(false);
  const [deleteScopeOpen, setDeleteScopeOpen] = useState(false);

  const needsShift = STATUSES_WITH_SHIFT.includes(status);
  const isDoublage = status === 'Doublage';
  const conflict = isRestDayOverrideConflict(existing, status);
  const shiftValid = !needsShift || isDoublage || shiftIds.length === 1;

  const handleSelectStatus = (s: AttendanceStatus) => {
    setStatus(s);
    setAckRestConflict(false);
    if (s === 'Doublage') setShiftIds(shifts.map((sh) => sh.id));
    else if (!STATUSES_WITH_SHIFT.includes(s)) setShiftIds([]);
  };

  const canSave = shiftValid && (!conflict || ackRestConflict);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">{getEmployeeFullName(employee)}</h3>
            <p className="text-[11px] text-gray-400">{formatDisplayDate(date)}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className={labelClass}>Statut</label>
            <div className="grid grid-cols-2 gap-1.5">
              {ATTENDANCE_STATUSES.map((s) => {
                const Icon = STATUS_ICONS[s];
                return (
                  <button key={s} onClick={() => handleSelectStatus(s)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${status === s ? STATUS_STYLES[s] + ' ring-1 ring-inset ring-current' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <Icon size={12} /> {s}
                  </button>
                );
              })}
            </div>
          </div>

          {needsShift && (
            <div>
              <label className={labelClass}>Shift {isDoublage && '(Doublage = les deux shifts)'}</label>
              {isDoublage ? (
                <p className="text-fuchsia-600 dark:text-fuchsia-400 font-semibold">Doublage — {shifts.map((s) => s.name.split(' — ')[0]).join(' + ')}</p>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {shifts.map((s) => (
                    <button key={s.id} onClick={() => setShiftIds([s.id])} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${shiftIds.includes(s.id) ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/70' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              {!shiftValid && <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> Sélectionnez un shift.</p>}
            </div>
          )}

          {conflict && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-1.5">
              <p className="text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1.5"><AlertTriangle size={13} /> Ce jour est un repos planifié.</p>
              <label className="flex items-center gap-2 text-amber-800 dark:text-amber-300 cursor-pointer">
                <input type="checkbox" checked={ackRestConflict} onChange={(e) => setAckRestConflict(e.target.checked)} className="rounded" />
                Confirmer le changement malgré le repos planifié
              </label>
            </div>
          )}
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
          {existing ? (
            <button onClick={() => setDeleteScopeOpen(true)} className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 text-[11px] font-semibold hover:underline cursor-pointer"><Trash2 size={13} /> Supprimer</button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className={secondaryButtonClass}><span>Annuler</span></button>
            <button onClick={() => canSave && onSave(status, isDoublage ? shifts.map((s) => s.id) : shiftIds)} disabled={!canSave} className={primaryButtonClass}>
              <ShieldCheck size={14} /><span>Enregistrer</span>
            </button>
          </div>
        </div>
      </div>

      {deleteScopeOpen && existing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setDeleteScopeOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2"><AlertCircle size={16} className="text-red-500" /> Supprimer ce planning</h3>
              <button onClick={() => setDeleteScopeOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-5 text-xs text-gray-600 dark:text-gray-300 space-y-3">
              <p>Que souhaitez-vous supprimer ?</p>
              <button onClick={() => onDelete(existing, 'day')} className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition cursor-pointer">
                <span className="font-semibold text-gray-900 dark:text-white block">Supprimer ce jour</span>
                <span className="text-gray-400">Seul le {formatDisplayDate(date)} sera retiré.</span>
              </button>
              {existing.recurringPlanId && (
                <button onClick={() => onDelete(existing, 'recurrence')} className="w-full text-left p-3 rounded-xl border border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer">
                  <span className="font-semibold text-red-700 dark:text-red-400 block">Supprimer toute la récurrence</span>
                  <span className="text-gray-400">Tous les jours générés par ce planning récurrent seront retirés.</span>
                </button>
              )}
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end">
              <button onClick={() => setDeleteScopeOpen(false)} className={secondaryButtonClass}><span>Annuler</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
