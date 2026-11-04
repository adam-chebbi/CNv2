import { todayIso, addDaysIso, mondayOfWeekIso } from './dateUtils';
// Shared domain model for "Gestion du personnel" — Employés / Planning & Présence / Suivi financier.
// Follows the same conventions as the rest of the app: canonical id generation, draft/validation
// helpers for the Saisie → Validation → Confirmation workflow, and relational references (IDs)
// between employees, shifts, day records and financial records rather than duplicated data.
//
// V1 scope: attendance is entered manually — there is no biometric/hardware attendance device —
// and this module only MONITORS employee-related finances; it is not payroll or social-declaration
// software.

let idCounter = 0;
export const generateHrId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now().toString(36)}`;
};


// --- Weekday / date helpers (Monday-first week, matching French UI convention) ----------------

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const WEEKDAY_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: 'Lundi', tue: 'Mardi', wed: 'Mercredi', thu: 'Jeudi', fri: 'Vendredi', sat: 'Samedi', sun: 'Dimanche',
};
export const WEEKDAY_LABELS_SHORT: Record<WeekdayKey, string> = {
  mon: 'Lun', tue: 'Mar', wed: 'Mer', thu: 'Jeu', fri: 'Ven', sat: 'Sam', sun: 'Dim',
};

const JS_DAY_TO_KEY: WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const getWeekdayKeyForDate = (iso: string): WeekdayKey => JS_DAY_TO_KEY[new Date(`${iso}T00:00:00`).getDay()];

// Re-exported so existing importers keep working; the arithmetic itself is UTC-safe (dateUtils).
export { addDaysIso };

export const getMondayOfWeek = (iso: string): string => mondayOfWeekIso(iso);

export const getWeekDates = (mondayIso: string): string[] => Array.from({ length: 7 }, (_, i) => addDaysIso(mondayIso, i));

export const formatDisplayDate = (iso: string): string => {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso || '—';
};

// --- Employees ----------------------------------------------------------------------------------

export type EmployeeStatus = 'Actif' | 'Inactif';
export const EMPLOYEE_STATUSES: EmployeeStatus[] = ['Actif', 'Inactif'];

export interface EmployeeDocument {
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  photoUrl?: string;
  poste: string;
  entryDate: string; // ISO date
  status: EmployeeStatus;
  // Set automatically when archived (POST /hr/employees/:id/archive), cleared on reactivation —
  // never set directly through the create/edit form.
  departureDate?: string;
  salary: number;
  cinNumber: string;
  cinIssueDate: string;
  cinDocument?: EmployeeDocument;
  createdAt: string;
}

export const getEmployeeFullName = (e: Pick<Employee, 'firstName' | 'lastName'>): string => `${e.firstName} ${e.lastName}`.trim();

// Suggested postes — a free-text field with suggestions, not a managed catalog (no dedicated
// "postes" CRUD was requested), so this is only used to populate a <datalist>.
export const SUGGESTED_POSTES = ['Barista', 'Serveur(se)', 'Cuisinier(ère)', 'Pâtissier(ère)', 'Caissier(ère)', 'Manager', 'Plongeur(se)'];

export interface DraftEmployee {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  photoUrl: string;
  poste: string;
  entryDate: string;
  status: EmployeeStatus;
  salary: string;
  cinNumber: string;
  cinIssueDate: string;
  cinDocument: EmployeeDocument | null;
  createdAt: string | null;
}

export const createEmptyDraftEmployee = (): DraftEmployee => ({
  id: generateHrId('emp'),
  firstName: '',
  lastName: '',
  phone: '',
  photoUrl: '',
  poste: '',
  entryDate: todayIso(),
  status: 'Actif',
  salary: '',
  cinNumber: '',
  cinIssueDate: '',
  cinDocument: null,
  createdAt: null,
});

export const createDraftFromEmployee = (e: Employee): DraftEmployee => ({
  id: e.id,
  firstName: e.firstName,
  lastName: e.lastName,
  phone: e.phone,
  photoUrl: e.photoUrl ?? '',
  poste: e.poste,
  entryDate: e.entryDate,
  status: e.status,
  salary: String(e.salary),
  cinNumber: e.cinNumber,
  cinIssueDate: e.cinIssueDate,
  cinDocument: e.cinDocument ?? null,
  createdAt: e.createdAt,
});

export interface HrValidationIssue {
  field: string;
  message: string;
}

const PHONE_PATTERN = /^[+\d][\d\s.-]{6,}$/;
const CIN_PATTERN = /^\d{8}$/;

export const validateDraftEmployee = (draft: DraftEmployee, employees: Employee[]): HrValidationIssue[] => {
  const issues: HrValidationIssue[] = [];

  if (!draft.firstName.trim()) issues.push({ field: 'firstName', message: 'Le prénom est obligatoire.' });
  if (!draft.lastName.trim()) issues.push({ field: 'lastName', message: 'Le nom est obligatoire.' });

  if (!draft.phone.trim()) issues.push({ field: 'phone', message: 'Le téléphone est obligatoire.' });
  else if (!PHONE_PATTERN.test(draft.phone.trim())) issues.push({ field: 'phone', message: 'Numéro de téléphone invalide.' });

  if (!draft.poste.trim()) issues.push({ field: 'poste', message: 'Le poste est obligatoire.' });
  if (!draft.entryDate) issues.push({ field: 'entryDate', message: "La date d'entrée est obligatoire." });

  const salaryNum = Number(draft.salary);
  if (!draft.salary.trim()) issues.push({ field: 'salary', message: 'Le salaire est obligatoire.' });
  else if (Number.isNaN(salaryNum) || salaryNum < 0) issues.push({ field: 'salary', message: 'Le salaire doit être un nombre positif.' });

  if (!draft.cinNumber.trim()) issues.push({ field: 'cinNumber', message: 'Le numéro CIN est obligatoire.' });
  else if (!CIN_PATTERN.test(draft.cinNumber.trim())) issues.push({ field: 'cinNumber', message: 'Le numéro CIN doit comporter 8 chiffres.' });
  else {
    const duplicate = employees.find((e) => e.cinNumber === draft.cinNumber.trim() && e.id !== draft.id);
    if (duplicate) issues.push({ field: 'cinNumber', message: `Ce numéro CIN est déjà utilisé par ${getEmployeeFullName(duplicate)}.` });
  }

  if (!draft.cinIssueDate) issues.push({ field: 'cinIssueDate', message: 'La date de délivrance de la CIN est obligatoire.' });

  return issues;
};

export const buildEmployeeFromDraft = (draft: DraftEmployee): Employee => ({
  id: draft.id,
  firstName: draft.firstName.trim(),
  lastName: draft.lastName.trim(),
  phone: draft.phone.trim(),
  photoUrl: draft.photoUrl || undefined,
  poste: draft.poste.trim(),
  entryDate: draft.entryDate,
  status: draft.status,
  salary: Number(draft.salary),
  cinNumber: draft.cinNumber.trim(),
  cinIssueDate: draft.cinIssueDate,
  cinDocument: draft.cinDocument ?? undefined,
  createdAt: draft.createdAt ?? todayIso(),
});

export const getEmployeeReferenceCount = (employeeId: string, dayRecords: DayRecord[], financialRecords: FinancialRecord[]): number =>
  dayRecords.filter((r) => r.employeeId === employeeId).length + financialRecords.filter((r) => r.employeeId === employeeId).length;

// --- Shifts (capped at a configurable count, enforced) ------------------------------------------

// Runtime-configurable via Paramètres (see src/data/settingsModel.ts) — a live `let` so every
// caller that reads this constant directly (client validation, and the server's own copy of this
// same module) picks up a changed limit without a restart. Defaults to 2 (the original hard cap).
export let MAX_SHIFTS = 2;
export const setMaxShifts = (n: number): void => { MAX_SHIFTS = n; };

export interface Shift {
  id: string;
  name: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  description?: string;
  createdAt: string;
}

export interface DraftShift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  description: string;
  createdAt: string | null;
}

export const createEmptyDraftShift = (): DraftShift => ({
  id: generateHrId('shift'), name: '', startTime: '', endTime: '', description: '', createdAt: null,
});

export const createDraftFromShift = (s: Shift): DraftShift => ({
  id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime, description: s.description ?? '', createdAt: s.createdAt,
});

export const validateDraftShift = (draft: DraftShift, shifts: Shift[]): HrValidationIssue[] => {
  const issues: HrValidationIssue[] = [];
  if (!draft.name.trim()) issues.push({ field: 'name', message: 'Le nom du shift est obligatoire.' });
  else {
    const duplicate = shifts.find((s) => s.name.trim().toLowerCase() === draft.name.trim().toLowerCase() && s.id !== draft.id);
    if (duplicate) issues.push({ field: 'name', message: 'Ce nom de shift est déjà utilisé.' });
  }
  if (!draft.startTime) issues.push({ field: 'startTime', message: 'Heure de début obligatoire.' });
  if (!draft.endTime) issues.push({ field: 'endTime', message: 'Heure de fin obligatoire.' });
  if (draft.startTime && draft.endTime && draft.startTime >= draft.endTime) {
    issues.push({ field: 'endTime', message: "L'heure de fin doit être après l'heure de début." });
  }
  const isNew = !shifts.some((s) => s.id === draft.id);
  if (isNew && shifts.length >= MAX_SHIFTS) {
    issues.push({ field: 'name', message: `La plateforme ne supporte que ${MAX_SHIFTS} shifts. Modifiez un shift existant au lieu d'en créer un nouveau.` });
  }
  return issues;
};

export const buildShiftFromDraft = (draft: DraftShift): Shift => ({
  id: draft.id, name: draft.name.trim(), startTime: draft.startTime, endTime: draft.endTime,
  description: draft.description.trim() || undefined, createdAt: draft.createdAt ?? todayIso(),
});

export const getShiftUsageCount = (shiftId: string, dayRecords: DayRecord[]): number =>
  dayRecords.filter((r) => r.shiftIds.includes(shiftId)).length;

// --- Day records (planning + manually recorded attendance, unified per employee/day) -----------

export type AttendanceStatus = 'Planifié' | 'Présent' | 'Absent' | 'Congé' | 'Repos' | 'Retard' | 'Doublage';
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['Planifié', 'Présent', 'Absent', 'Congé', 'Repos', 'Retard', 'Doublage'];

// Statuses that carry a shift assignment (Doublage always carries both shifts).
export const STATUSES_WITH_SHIFT: AttendanceStatus[] = ['Planifié', 'Présent', 'Retard', 'Doublage'];

export interface DayRecord {
  id: string;
  employeeId: string;
  date: string; // ISO
  status: AttendanceStatus;
  shiftIds: string[];
  recurringPlanId?: string;
  note?: string;
  updatedAt: string;
  updatedBy: string;
}

export const findDayRecord = (employeeId: string, date: string, records: DayRecord[]): DayRecord | undefined =>
  records.find((r) => r.employeeId === employeeId && r.date === date);

// A day planned as "Repos" being overridden into a working status is the one conflict worth an
// explicit heads-up in the fast manual-edit popover (the rest are prevented structurally: shift
// ids always come from real Shift entities, and records are always upserted by employee+date so
// duplicates can't occur).
export const isRestDayOverrideConflict = (existing: DayRecord | undefined, newStatus: AttendanceStatus): boolean =>
  !!existing && existing.status === 'Repos' && !['Repos', 'Absent', 'Congé'].includes(newStatus);

export const buildManualDayRecord = (
  existing: DayRecord | undefined,
  employeeId: string,
  date: string,
  status: AttendanceStatus,
  shiftIds: string[],
  performedBy: string,
  note?: string
): DayRecord => ({
  id: existing?.id ?? generateHrId('day'),
  employeeId,
  date,
  status,
  shiftIds: STATUSES_WITH_SHIFT.includes(status) ? shiftIds : [],
  recurringPlanId: existing?.recurringPlanId,
  note: note?.trim() || undefined,
  updatedAt: new Date().toISOString(),
  updatedBy: performedBy,
});

// --- Weekly pattern (used by both one-time and recurring planning) ------------------------------

export interface WeeklyDayConfig {
  dayType: 'Travail' | 'Repos';
  shiftIds: string[]; // empty for Repos; 1 entry = single shift; 2 entries = doublage
}

export type WeeklyPattern = Record<WeekdayKey, WeeklyDayConfig>;

export const createEmptyWeeklyPattern = (): WeeklyPattern =>
  WEEKDAY_KEYS.reduce((acc, key) => {
    acc[key] = { dayType: 'Travail', shiftIds: [] };
    return acc;
  }, {} as WeeklyPattern);

export interface RecurringPlan {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  weeklyPattern: WeeklyPattern;
  createdAt: string;
  createdBy: string;
}

export const expandWeeklyPattern = (
  pattern: WeeklyPattern,
  startDate: string,
  endDate: string
): { date: string; dayType: 'Travail' | 'Repos'; shiftIds: string[] }[] => {
  const dates: { date: string; dayType: 'Travail' | 'Repos'; shiftIds: string[] }[] = [];
  let cursor = startDate;
  let guard = 0;
  while (cursor <= endDate && guard < 730) {
    const key = getWeekdayKeyForDate(cursor);
    const cfg = pattern[key];
    dates.push({ date: cursor, dayType: cfg.dayType, shiftIds: cfg.shiftIds });
    cursor = addDaysIso(cursor, 1);
    guard += 1;
  }
  return dates;
};

export const buildDayRecordsFromPattern = (
  employeeId: string,
  pattern: WeeklyPattern,
  startDate: string,
  endDate: string,
  performedBy: string,
  recurringPlanId: string | undefined,
  existing: DayRecord[]
): DayRecord[] =>
  expandWeeklyPattern(pattern, startDate, endDate).map(({ date, dayType, shiftIds }) => {
    const status: AttendanceStatus = dayType === 'Repos' ? 'Repos' : 'Planifié';
    const finalShiftIds = dayType === 'Repos' ? [] : shiftIds;
    const priorRecord = findDayRecord(employeeId, date, existing);
    return {
      id: priorRecord?.id ?? generateHrId('day'),
      employeeId,
      date,
      status,
      shiftIds: finalShiftIds,
      recurringPlanId,
      updatedAt: new Date().toISOString(),
      updatedBy: performedBy,
    };
  });

// Any date in the target range that already has a record is a potential overwrite — surfaced to
// the manager in the planning preview rather than silently applied.
export const findPlanningConflicts = (employeeId: string, dates: string[], existing: DayRecord[]): DayRecord[] =>
  existing.filter((r) => r.employeeId === employeeId && dates.includes(r.date));

// --- Financial records (monitoring only — not payroll / social-declaration software) -----------

export type PaymentStatus = 'Non payé' | 'Partiellement payé' | 'Payé';
export const PAYMENT_STATUSES: PaymentStatus[] = ['Non payé', 'Partiellement payé', 'Payé'];

export interface FinancialRecord {
  id: string;
  employeeId: string;
  periodMonthIndex: number; // 0-11, matches salesTransactions.MONTHS_LIST
  periodYear: number;
  baseSalary: number;
  advances: number;
  bonuses: number;
  deductions: number;
  amountPaid: number;
  paymentDate?: string;
  createdAt: string;
}

// The amount still owed for the period. An avance is cash already handed to the employee ahead of
// the normal payment — money the employee already received for this same period — so it reduces
// what's left to pay just like a deduction does; it is not extra cost (see computeGrossCost below
// for the total cost of employing them, which an avance does NOT reduce). Concretely: baseSalary
// 1000, une avance de 200 en cours de mois → il reste 800 DT à payer, pas 1000.
export const computeNetDue = (r: Pick<FinancialRecord, 'baseSalary' | 'bonuses' | 'deductions' | 'advances'>): number =>
  r.baseSalary + r.bonuses - r.deductions - r.advances;

// The full cost of employing them for the period, regardless of when each part was paid (advance
// mid-month vs. the rest at month-end) — unlike computeNetDue, an avance does NOT reduce this: it's
// the same money, paid early, not an additional charge.
export const computeGrossCost = (r: Pick<FinancialRecord, 'baseSalary' | 'bonuses' | 'deductions'>): number =>
  r.baseSalary + r.bonuses - r.deductions;

export const computeFinancialStatus = (r: FinancialRecord): PaymentStatus => {
  const due = computeNetDue(r);
  if (r.amountPaid <= 0) return 'Non payé';
  if (r.amountPaid >= due) return 'Payé';
  return 'Partiellement payé';
};

export interface DraftFinancialRecord {
  id: string;
  employeeId: string;
  periodMonthIndex: number;
  periodYear: number;
  baseSalary: string;
  advances: string;
  bonuses: string;
  deductions: string;
  amountPaid: string;
  paymentDate: string;
  createdAt: string | null;
}

export const createEmptyDraftFinancialRecord = (employeeId?: string): DraftFinancialRecord => {
  const now = new Date();
  return {
    id: generateHrId('fin'),
    employeeId: employeeId ?? '',
    periodMonthIndex: now.getMonth(),
    periodYear: now.getFullYear(),
    baseSalary: '',
    advances: '',
    bonuses: '',
    deductions: '',
    amountPaid: '',
    paymentDate: '',
    createdAt: null,
  };
};

export const createDraftFromFinancialRecord = (r: FinancialRecord): DraftFinancialRecord => ({
  id: r.id,
  employeeId: r.employeeId,
  periodMonthIndex: r.periodMonthIndex,
  periodYear: r.periodYear,
  baseSalary: String(r.baseSalary),
  advances: String(r.advances),
  bonuses: String(r.bonuses),
  deductions: String(r.deductions),
  amountPaid: String(r.amountPaid),
  paymentDate: r.paymentDate ?? '',
  createdAt: r.createdAt,
});

export const validateDraftFinancialRecord = (
  draft: DraftFinancialRecord,
  employees: Employee[],
  existingRecords: FinancialRecord[]
): HrValidationIssue[] => {
  const issues: HrValidationIssue[] = [];

  if (!draft.employeeId) issues.push({ field: 'employeeId', message: "L'employé est obligatoire." });
  else if (!employees.some((e) => e.id === draft.employeeId)) issues.push({ field: 'employeeId', message: 'Employé invalide.' });
  else {
    const duplicate = existingRecords.find(
      (r) => r.employeeId === draft.employeeId && r.periodMonthIndex === draft.periodMonthIndex && r.periodYear === draft.periodYear && r.id !== draft.id
    );
    if (duplicate) issues.push({ field: 'employeeId', message: 'Un suivi financier existe déjà pour cet employé sur cette période.' });
  }

  const numericFields: { field: keyof DraftFinancialRecord; label: string; allowEmpty: boolean }[] = [
    { field: 'baseSalary', label: 'Le salaire de base', allowEmpty: false },
    { field: 'advances', label: 'Les avances', allowEmpty: true },
    { field: 'bonuses', label: 'Les primes', allowEmpty: true },
    { field: 'deductions', label: 'Les retenues', allowEmpty: true },
    { field: 'amountPaid', label: 'Le montant payé', allowEmpty: true },
  ];
  numericFields.forEach(({ field, label, allowEmpty }) => {
    const raw = draft[field] as string;
    if (!raw.trim()) {
      if (!allowEmpty) issues.push({ field, message: `${label} est obligatoire.` });
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num) || num < 0) issues.push({ field, message: `${label} doit être un nombre positif.` });
  });

  if (draft.amountPaid.trim() && Number(draft.amountPaid) > 0 && !draft.paymentDate) {
    issues.push({ field: 'paymentDate', message: 'La date de paiement est obligatoire lorsqu’un montant est payé.' });
  }

  // Montant payé = Salaire de base + Primes − Avances − Retenues (computeNetDue) is what's actually
  // owed for the period — only checked once every field involved already parses to a valid number,
  // so this never masks the more basic "doit être un nombre positif" errors above with a confusing
  // comparison against garbage input.
  const hasValidMoneyFields = ['baseSalary', 'advances', 'bonuses', 'deductions', 'amountPaid'].every((field) => {
    const raw = draft[field as keyof DraftFinancialRecord] as string;
    return raw.trim() === '' || (!Number.isNaN(Number(raw)) && Number(raw) >= 0);
  });
  if (hasValidMoneyFields) {
    const netDue = computeNetDue({
      baseSalary: Number(draft.baseSalary || 0),
      bonuses: Number(draft.bonuses || 0),
      deductions: Number(draft.deductions || 0),
      advances: Number(draft.advances || 0),
    });
    const amountPaid = Number(draft.amountPaid || 0);
    if (amountPaid > netDue) {
      issues.push({
        field: 'amountPaid',
        message: `Le montant payé (${amountPaid.toFixed(2)} DT) dépasse le montant dû (${netDue.toFixed(2)} DT).`,
      });
    }
  }

  return issues;
};

export const buildFinancialRecordFromDraft = (draft: DraftFinancialRecord): FinancialRecord => ({
  id: draft.id,
  employeeId: draft.employeeId,
  periodMonthIndex: draft.periodMonthIndex,
  periodYear: draft.periodYear,
  baseSalary: Number(draft.baseSalary || 0),
  advances: Number(draft.advances || 0),
  bonuses: Number(draft.bonuses || 0),
  deductions: Number(draft.deductions || 0),
  amountPaid: Number(draft.amountPaid || 0),
  paymentDate: draft.paymentDate || undefined,
  createdAt: draft.createdAt ?? new Date().toISOString(),
});
