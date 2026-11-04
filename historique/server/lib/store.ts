import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { DEFAULT_SETTINGS, currentBusinessDate, type CaisseRecord, type HistoriqueSettings, type ShiftId } from '../../shared/model.js';
import type { Db } from '../db/connection.js';

type Row = Record<string, unknown>;

export const nowIso = (): string => new Date().toISOString();

export const mapCaisse = (r: Row): CaisseRecord => ({
  id: String(r.id),
  date: String(r.date),
  shift: r.shift as ShiftId,
  ca: Number(r.ca),
  depenses: JSON.parse(String(r.depenses || '[]')),
  totalDepenses: Number(r.total_depenses),
  attenduCaisse: Number(r.attendu_caisse),
  tpe: Number(r.tpe),
  ticketsResto: Number(r.tickets_resto),
  especes: Number(r.especes),
  creeParNom: String(r.cree_par_nom),
  creeLe: String(r.cree_le),
  majParNom: (r.maj_par_nom as string) ?? null,
  majLe: (r.maj_le as string) ?? null,
});

export const createStore = (db: Db) => {
  const setting = <T,>(key: string, fallback: T): T => {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return r ? (JSON.parse(r.value) as T) : fallback;
  };

  const getSettings = (): HistoriqueSettings => ({
    joursRattrapage: setting('joursRattrapage', DEFAULT_SETTINGS.joursRattrapage),
    heureBascule: setting('heureBascule', DEFAULT_SETTINGS.heureBascule),
  });

  // First selectable day: when the app went live, or earlier if older records were imported.
  const dateDebut = (): string => {
    const configured = setting('dateDebut', currentBusinessDate());
    const oldest = (db.prepare('SELECT MIN(date) AS d FROM caisses').get() as { d: string | null }).d;
    return oldest && oldest < configured ? oldest : configured;
  };
  const businessToday = (): string => currentBusinessDate(new Date(), getSettings().heureBascule);

  const log = (
    req: Request | null,
    entry: { module: string; action: string; description: string; journeeDate?: string | null; entityId?: string | null; details?: unknown; userName?: string; userId?: string | null }
  ): void => {
    db.prepare(
      `INSERT INTO activity_log (id, timestamp, user_id, user_name, module, action, description, journee_date, entity_id, details, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      nowIso(),
      entry.userId !== undefined ? entry.userId : req?.user?.id ?? null,
      entry.userName ?? req?.user?.fullName ?? 'Système',
      entry.module,
      entry.action,
      entry.description,
      entry.journeeDate ?? null,
      entry.entityId ?? null,
      entry.details === undefined ? null : JSON.stringify(entry.details),
      req?.ip ?? null,
      req?.get('user-agent') ?? null
    );
  };

  return { db, getSettings, dateDebut, businessToday, log };
};

export type Store = ReturnType<typeof createStore>;
