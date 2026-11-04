import { setDefaultExpiryAlertDays } from './stockModel';
import { setDefaultDiscrepancyThreshold, setDefaultDiscrepancyLookbackDays } from './alertsModel';
import { setRestoDeductionRate } from './cashCheckModel';
import { setDefaultTargetMarginRate } from './productsModel';
import { setMaxShifts } from './hrModel';

// Business-tunable settings that used to be scattered hardcoded constants across the codebase
// (alert thresholds, the ticket-resto commission rate, the default target margin). Persisted
// server-side as simple key/value rows (see server/routes/settings.ts) — a missing key on the
// server just means "use the default below", so this never needs a migration/backfill.
export interface AppSettings {
  expiryAlertDays: number;
  discrepancyThreshold: number;
  discrepancyLookbackDays: number;
  restoCommissionRate: number; // 0..1
  defaultTargetMarginRate: number; // 0..1
  maxShifts: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  expiryAlertDays: 7,
  discrepancyThreshold: 30,
  discrepancyLookbackDays: 60,
  restoCommissionRate: 0.1,
  defaultTargetMarginRate: 0.65,
  maxShifts: 2,
};

export interface AppSettingFieldDoc {
  key: keyof AppSettings;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit: string; // shown after the input, e.g. "jours", "DT", "%"
  isPercent?: boolean; // stored as 0..1, displayed/edited as 0..100
}

export const APP_SETTING_FIELDS: AppSettingFieldDoc[] = [
  {
    key: 'expiryAlertDays',
    label: 'Délai d’alerte de péremption',
    description: 'Nombre de jours avant la date de péremption d’un lot à partir duquel il apparaît comme "Expire bientôt" (Stock, Lots, Notifications, Tableau de bord).',
    min: 1,
    max: 60,
    step: 1,
    unit: 'jours',
  },
  {
    key: 'discrepancyThreshold',
    label: 'Seuil d’écart d’inventaire',
    description: 'Valeur (en DT) à partir de laquelle un écart d’inventaire constaté déclenche une alerte.',
    min: 0,
    max: 1000,
    step: 5,
    unit: 'DT',
  },
  {
    key: 'discrepancyLookbackDays',
    label: 'Fenêtre de recherche des écarts d’inventaire',
    description: 'Nombre de jours en arrière pris en compte pour repérer un écart d’inventaire récent.',
    min: 1,
    max: 365,
    step: 1,
    unit: 'jours',
  },
  {
    key: 'restoCommissionRate',
    label: 'Commission Ticket resto',
    description: 'Pourcentage retenu par l’émetteur de tickets restaurant, déduit du montant collecté dans Calcul du quotidien.',
    min: 0,
    max: 30,
    step: 0.5,
    unit: '%',
    isPercent: true,
  },
  {
    key: 'defaultTargetMarginRate',
    label: 'Marge cible par défaut',
    description: 'Marge cible utilisée pour tout produit qui ne définit pas sa propre marge cible (alertes marge basse, rapports).',
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    isPercent: true,
  },
  {
    key: 'maxShifts',
    label: 'Nombre maximum de shifts',
    description: "Nombre de shifts (Matin, Soir...) pouvant être créés dans Gestion du personnel → Planning & Présence. Réduire cette valeur n'affecte jamais les shifts déjà créés.",
    min: 1,
    max: 6,
    step: 1,
    unit: 'shifts',
  },
];

// Applies a loaded/edited settings object to every module that reads its own runtime-configurable
// default (stockModel/alertsModel/cashCheckModel/productsModel) — call once after fetching
// settings on startup, and again immediately after a successful save, so a change takes effect
// everywhere without a page reload.
export const applySettingsToRuntime = (settings: AppSettings): void => {
  setDefaultExpiryAlertDays(settings.expiryAlertDays);
  setDefaultDiscrepancyThreshold(settings.discrepancyThreshold);
  setDefaultDiscrepancyLookbackDays(settings.discrepancyLookbackDays);
  setRestoDeductionRate(settings.restoCommissionRate);
  setDefaultTargetMarginRate(settings.defaultTargetMarginRate);
  setMaxShifts(settings.maxShifts);
};
