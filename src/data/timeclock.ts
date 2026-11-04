// Pointage (cahier des charges §13.2 – §13.3): pure rules shared by the server and the screens.
//
//   arrivée → (départ en pause → retour de pause)* → départ
//
// Worked time = (départ − arrivée) − pauses. A shift without its departure (or with an unfinished
// break) has NO computed duration: it is shown as incomplete until someone corrects it — the
// software never invents an end time.

export type ClockAction = 'in' | 'break_start' | 'break_end' | 'out';

export const CLOCK_LABELS: Record<ClockAction, string> = {
  in: 'Arrivée',
  break_start: 'Départ en pause',
  break_end: 'Retour de pause',
  out: 'Départ',
};

export type ClockState = 'off' | 'working' | 'on_break';

export const stateAfter = (action: ClockAction | null): ClockState =>
  action === 'in' || action === 'break_end' ? 'working' : action === 'break_start' ? 'on_break' : 'off';

export const allowedActions = (state: ClockState): ClockAction[] =>
  state === 'off' ? ['in'] : state === 'working' ? ['break_start', 'out'] : ['break_end'];

export interface ClockEvent {
  id: string;
  action: ClockAction;
  at: string; // ISO
}

export interface Shift {
  date: string; // Tunis date of the arrival (or of the first event of an orphan sequence)
  start: string | null;
  end: string | null;
  breaks: { start: string; end: string | null }[];
  workedMinutes: number | null; // null = incomplete
  anomalies: string[];
  eventIds: string[];
}

const TUNIS_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' });
export const tunisDate = (iso: string): string => TUNIS_DATE.format(new Date(iso));

const minutesBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 60_000);

// Groups chronologically sorted events into shifts and flags anything out of sequence.
export const buildShifts = (events: ClockEvent[]): Shift[] => {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const shifts: Shift[] = [];
  let current: Shift | null = null;

  const open = (e: ClockEvent): Shift => ({ date: tunisDate(e.at), start: null, end: null, breaks: [], workedMinutes: null, anomalies: [], eventIds: [] });
  const finish = (s: Shift) => {
    const unfinishedBreak = s.breaks.some((b) => !b.end);
    if (!s.start) s.anomalies.push('Arrivée manquante');
    if (!s.end) s.anomalies.push('Départ manquant');
    if (unfinishedBreak) s.anomalies.push('Pause non terminée');
    if (s.start && s.end && !unfinishedBreak) {
      const pauses = s.breaks.reduce((sum, b) => sum + minutesBetween(b.start, b.end!), 0);
      s.workedMinutes = Math.max(0, minutesBetween(s.start, s.end) - pauses);
    }
    shifts.push(s);
  };

  for (const e of sorted) {
    if (e.action === 'in') {
      if (current) {
        current.anomalies.push('Nouvelle arrivée sans départ');
        finish(current);
      }
      current = open(e);
      current.start = e.at;
    } else {
      if (!current) current = open(e);
      if (e.action === 'break_start') {
        if (current.breaks.some((b) => !b.end)) current.anomalies.push('Pause déjà commencée');
        else current.breaks.push({ start: e.at, end: null });
      } else if (e.action === 'break_end') {
        const b = current.breaks.find((x) => !x.end);
        if (b) b.end = e.at;
        else current.anomalies.push('Retour de pause sans départ en pause');
      } else {
        current.end = e.at;
      }
    }
    current.eventIds.push(e.id);
    if (e.action === 'out') {
      finish(current);
      current = null;
    }
  }
  if (current) finish(current);
  return shifts;
};

export const formatMinutes = (m: number | null): string => (m === null ? '—' : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);
