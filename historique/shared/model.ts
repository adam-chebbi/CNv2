// Historique & Comptage — the café's cash terminal. Shared by the server (historique/server) and
// the client (historique/src): pure data/types/functions only.
//
// One record per (date, service): the chiffre d'affaires, the dépenses paid from the till, and the
// physical count — TPE and tickets resto are entered, the espèces are what remains. Every amount is
// an INTEGER number of millimes (1 DT = 1000 millimes) so totals never drift.

// --- Permissions (catalog lives in the main app: src/data/rbacModel.ts) ------------------------

export const PERM_ACCESS = 'historique:access';
export const PERM_SUPERVISE = 'historique:supervise';

export interface SessionUser {
  id: string;
  fullName: string;
  roleName: string;
  isSuperAdmin: boolean;
  permissions: string[];
  mustChangePassword: boolean;
}

export const userCan = (user: Pick<SessionUser, 'isSuperAdmin' | 'permissions'> | null | undefined, key: string): boolean =>
  Boolean(user) && (user!.isSuperAdmin || user!.permissions.includes(key));

// --- Money ---------------------------------------------------------------------------------------

export const formatDT = (millimes: number, opts: { sign?: boolean } = {}): string => {
  const s = (millimes / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return `${opts.sign && millimes > 0 ? '+' : ''}${s} DT`;
};

// --- Dates ---------------------------------------------------------------------------------------

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');
export const toIsoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const addDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

export const daysBetween = (fromIso: string, toIso: string): number => {
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

// The café closes after midnight: until `cutoffHour` the evening service still belongs to the
// previous day.
export const currentBusinessDate = (now: Date = new Date(), cutoffHour = 5): string => {
  const d = new Date(now);
  if (d.getHours() < cutoffHour) d.setDate(d.getDate() - 1);
  return toIsoDate(d);
};

export const formatDateFr = (iso: string, withWeekday = true): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    ...(withWeekday ? { weekday: 'long' as const } : {}),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

// --- Services (shifts) -----------------------------------------------------------------------------

export const SHIFTS = [
  { id: 'matin', label: 'Matin' },
  { id: 'soir', label: 'Soir' },
] as const;
export type ShiftId = (typeof SHIFTS)[number]['id'];
export const SHIFT_LABELS: Record<ShiftId, string> = { matin: 'Matin', soir: 'Soir' };
export const isShiftId = (v: string): v is ShiftId => SHIFTS.some((s) => s.id === v);

// --- Records ---------------------------------------------------------------------------------------

export interface DepenseLigne {
  libelle: string;
  montant: number;
}

export interface CaisseInput {
  ca: number;
  depenses: DepenseLigne[];
  tpe: number;
  ticketsResto: number;
}

export interface CaisseRecord extends CaisseInput {
  id: string;
  date: string;
  shift: ShiftId;
  totalDepenses: number;
  attenduCaisse: number;
  especes: number;
  creeParNom: string;
  creeLe: string;
  majParNom: string | null;
  majLe: string | null;
}

export interface CaisseCalcul {
  totalDepenses: number;
  attenduCaisse: number; // what must be in the till: chiffre d'affaires − dépenses
  especes: number; // what remains once TPE and tickets resto are taken out
}

export const computeCaisse = (input: CaisseInput): CaisseCalcul => {
  const totalDepenses = input.depenses.reduce((s, d) => s + d.montant, 0);
  const attenduCaisse = input.ca - totalDepenses;
  return { totalDepenses, attenduCaisse, especes: attenduCaisse - input.tpe - input.ticketsResto };
};

// Checks a Gérant can understand, in their own words. Returns the first problem, or null.
export const validateCaisse = (input: CaisseInput): string | null => {
  if (input.ca <= 0) return "Saisissez le chiffre d'affaires.";
  if (input.depenses.some((d) => d.montant <= 0)) return 'Chaque dépense doit avoir un montant.';
  if (input.depenses.some((d) => !d.libelle.trim())) return 'Indiquez à quoi correspond chaque dépense.';
  const c = computeCaisse(input);
  if (c.attenduCaisse < 0) return "Les dépenses dépassent le chiffre d'affaires. Vérifiez les montants.";
  if (c.especes < 0) return 'Le TPE et les tickets resto dépassent le montant de la caisse. Vérifiez les montants.';
  return null;
};

export interface HistoriqueSettings {
  joursRattrapage: number; // how many past days a Gérant (without supervise) may still correct
  heureBascule: number;
}

export const DEFAULT_SETTINGS: HistoriqueSettings = { joursRattrapage: 2, heureBascule: 5 };

// --- Avances au personnel -----------------------------------------------------------------------------
// Completely independent from the caisse: an avance never changes the chiffre d'affaires, the
// dépenses, "doit être en caisse" or the espèces. It is only a dated record of money given to an
// employee. Once confirmed it cannot be edited; it can be deleted only within AVANCE_DELETE_WINDOW_MS
// of its creation, by its author (or a supervisor), after re-entering their password — and even
// then it is only hidden, never erased.

export const AVANCE_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const AVANCE_MOTIFS = ['Transport', 'Personnel', 'Santé', 'Urgence', 'Autre'] as const;

export interface Avance {
  id: string;
  employe: string;
  montant: number;
  motif: string | null;
  commentaire: string | null;
  date: string; // YYYY-MM-DD (Tunisia local time)
  heure: string; // HH:MM
  saisieManuelle: boolean; // date/heure typed by hand rather than taken from the clock
  creeParId: string;
  creeParNom: string;
  creeLe: string; // server timestamp of the entry, whatever date was typed
  supprimable: boolean; // computed for the current viewer
  supprimableJusqua: string; // creeLe + 24 h
}

export interface AvanceEmploye {
  nom: string;
  nb: number;
  total: number;
}

export const normalizeName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

export const cleanName = (name: string): string => name.trim().replace(/\s+/g, ' ');
