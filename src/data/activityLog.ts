// Shared audit trail for "Journal d'activité" — every mutating action across the app (Ventes,
// Stock, Produits, Catalogue) appends one entry here through logActivity, so the page has a
// single, real source of truth instead of reconstructing history from scattered module state.

export interface ActivityLogEntry {
  id: string;
  timestamp: string; // ISO datetime
  user: string;
  module: string;
  action: string;
  description: string;
}

export const ACTIVITY_MODULES: string[] = ['Ventes', 'Stock', 'Produits', 'Catalogue'];

let idCounter = 0;
export const generateActivityId = (): string => {
  idCounter += 1;
  return `act-${idCounter}-${Date.now().toString(36)}`;
};

// dd/mm/yyyy hh:mm, as requested — always 2-digit day/month/hour/minute.
export const formatActivityDateTime = (iso: string): string => {
  const d = new Date(iso);
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
};

