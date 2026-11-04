import { db } from '../db/connection.js';

// Extension points of the floor plan: other modules (service requests, reservations, cancellation
// requests…) contribute fields to each table's live state and reasons that prevent releasing a
// table, without the floor routes knowing about them.

type TableStateProvider = (tableId: string, visitId: string | null) => Record<string, unknown>;
type CloseBlocker = (visitId: string) => string | null;

const stateProviders: TableStateProvider[] = [];
const closeBlockers: CloseBlocker[] = [];

export const registerTableStateProvider = (provider: TableStateProvider): void => {
  stateProviders.push(provider);
};

export const registerVisitCloseBlocker = (blocker: CloseBlocker): void => {
  closeBlockers.push(blocker);
};

export const floorExtensions = (tableId: string, visitId: string | null): Record<string, unknown> =>
  Object.assign({}, ...stateProviders.map((p) => p(tableId, visitId)));

// A table is released only when nothing is waiting: no order to validate, nothing left to pay.
registerVisitCloseBlocker((visitId) => {
  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM pos_orders WHERE visit_id = ? AND status IN ('pending_validation', 'awaiting_customer')")
    .get(visitId) as { n: number };
  return pending.n > 0 ? 'Des commandes de cette table attendent encore une validation.' : null;
});

registerVisitCloseBlocker((visitId) => {
  const due = db
    .prepare("SELECT COALESCE(SUM(total_mil - paid_mil), 0) AS due FROM pos_sales WHERE visit_id = ? AND status = 'open'")
    .get(visitId) as { due: number };
  return due.due > 0 ? "L'addition de cette table n'est pas entièrement réglée." : null;
});

export const visitCloseBlockers = (visitId: string): string[] => closeBlockers.map((b) => b(visitId)).filter((m): m is string => Boolean(m));
