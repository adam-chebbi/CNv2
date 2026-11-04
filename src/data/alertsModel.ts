// Shared operational-alert engine for the Notifications / Alertes page. Every alert is DERIVED
// fresh from the app's real live state (Stock, Achats/Fournisseurs, Produits) — there is no
// separate mutable "alerts" table, so an alert can never go stale or contradict the module it
// comes from. The only thing that needs its own persisted state is which alerts a user has
// already marked as "Traité" — tracked by App.tsx via each alert's deterministic id.
//
// V1 scope: alerts are shown only inside the platform (no SMS/WhatsApp/email).

import { todayIso, addDaysIso } from './dateUtils';
import { StockProduct, StockLot, StockLedgerEntry, getTotalQty, getLotStatus, DEFAULT_EXPIRY_ALERT_DAYS } from './stockModel';
import { CatalogArticle } from './manualSalesCatalog';
import { SubRecipe, computeRecipeCost, DEFAULT_TARGET_MARGIN_RATE, computeArticleMargin } from './productsModel';
import { Supplier, SupplierInvoice, computeInvoiceStatus, isInvoiceDueSoon, isInvoiceOverdue } from './purchasesModel';

export type AlertType =
  | 'stock_low'
  | 'stock_out'
  | 'stock_negative'
  | 'expiry_soon'
  | 'expiry_passed'
  | 'invoice_due'
  | 'inventory_discrepancy'
  | 'margin_below_target';

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  stock_low: 'Stock faible',
  stock_out: 'Rupture de stock',
  stock_negative: 'Stock négatif',
  expiry_soon: 'Péremption proche',
  expiry_passed: 'Produit périmé',
  invoice_due: 'Facture fournisseur à échéance',
  inventory_discrepancy: 'Écart de stock important',
  margin_below_target: "Marge sous l'objectif",
};

export type AlertSeverity = 'Critique' | 'Important' | 'Attention' | 'Information';
export const ALERT_SEVERITIES: AlertSeverity[] = ['Critique', 'Important', 'Attention', 'Information'];

export type AlertStatus = 'Non traité' | 'Traité';

export type AlertEntityKind = 'product' | 'lot' | 'invoice' | 'article';

export interface AlertEntityRef {
  kind: AlertEntityKind;
  id: string;
  label: string;
}

export interface AlertNavigateTarget {
  tab: string;
  subItem?: string;
}

export interface OperationalAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  entity: AlertEntityRef;
  detectedAt: string; // ISO date/datetime — the most meaningful date available (échéance, péremption…)
  recommendedAction: string;
  actionLabel: string;
  navigateTo: AlertNavigateTarget;
  status: AlertStatus; // always 'Non traité' at generation time — App.tsx merges in persisted overrides
}

const daysBetween = (fromIso: string, toIso: string): number => {
  const from = new Date(`${fromIso}T00:00:00`).getTime();
  const to = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((to - from) / 86400000);
};


export interface AlertsContext {
  stockProducts: StockProduct[];
  stockLots: StockLot[];
  stockLedger: StockLedgerEntry[];
  articles: CatalogArticle[];
  subRecipes: SubRecipe[];
  suppliers: Supplier[];
  invoices: SupplierInvoice[];
  expiryAlertDays?: number;
  discrepancyThreshold?: number; // DT — below this, an inventory gap isn't worth an alert
  discrepancyLookbackDays?: number;
}

// Runtime-configurable defaults (see src/data/settingsModel.ts) — a live `let` binding rather than
// a frozen constant so the Paramètres screen can change them for every caller that relies on the
// `ctx.xxx ?? DEFAULT_XXX` fallback below, without having to thread the setting through every call
// site individually.
export let DEFAULT_DISCREPANCY_THRESHOLD = 30; // DT — below this, an inventory gap isn't worth an alert
export let DEFAULT_DISCREPANCY_LOOKBACK_DAYS = 60;
export const setDefaultDiscrepancyThreshold = (dt: number): void => { DEFAULT_DISCREPANCY_THRESHOLD = dt; };
export const setDefaultDiscrepancyLookbackDays = (days: number): void => { DEFAULT_DISCREPANCY_LOOKBACK_DAYS = days; };

const STOCK_NAV: AlertNavigateTarget = { tab: 'stock', subItem: 'stock_overview' };
const LOTS_NAV: AlertNavigateTarget = { tab: 'stock', subItem: 'stock_lots' };
const INVENTORY_NAV: AlertNavigateTarget = { tab: 'stock', subItem: 'stock_inventory' };
const INVOICES_NAV: AlertNavigateTarget = { tab: 'purchases_mgmt', subItem: 'purchases_invoices' };
const PRODUCTS_NAV: AlertNavigateTarget = { tab: 'products_recipes_mgmt', subItem: 'prm_products' };

export const computeOperationalAlerts = (ctx: AlertsContext): OperationalAlert[] => {
  const alerts: OperationalAlert[] = [];
  const expiryAlertDays = ctx.expiryAlertDays ?? DEFAULT_EXPIRY_ALERT_DAYS;
  const discrepancyThreshold = ctx.discrepancyThreshold ?? DEFAULT_DISCREPANCY_THRESHOLD;
  const discrepancyLookbackDays = ctx.discrepancyLookbackDays ?? DEFAULT_DISCREPANCY_LOOKBACK_DAYS;
  const today = todayIso();

  // --- Stock: faible / rupture / négatif (mutually exclusive per product, worst case wins) ---
  ctx.stockProducts.forEach((p) => {
    const qty = getTotalQty(p);
    if (qty < 0) {
      alerts.push({
        id: `stock-negative-${p.id}`,
        type: 'stock_negative',
        severity: 'Critique',
        title: `Stock négatif — ${p.name}`,
        message: `Le stock de « ${p.name} » est négatif (${qty} ${p.unit}), signe d'une erreur de saisie ou de mouvement non enregistré.`,
        entity: { kind: 'product', id: p.id, label: p.name },
        detectedAt: today,
        recommendedAction: 'Vérifier les derniers mouvements de stock et corriger via un ajustement.',
        actionLabel: 'Voir le stock',
        navigateTo: STOCK_NAV,
        status: 'Non traité',
      });
    } else if (qty === 0) {
      alerts.push({
        id: `stock-out-${p.id}`,
        type: 'stock_out',
        severity: 'Important',
        title: `Rupture de stock — ${p.name}`,
        message: `« ${p.name} » est totalement épuisé (0 ${p.unit} en stock).`,
        entity: { kind: 'product', id: p.id, label: p.name },
        detectedAt: today,
        recommendedAction: 'Passer une commande fournisseur en urgence.',
        actionLabel: 'Voir le stock',
        navigateTo: STOCK_NAV,
        status: 'Non traité',
      });
    } else if (qty < p.minThreshold) {
      alerts.push({
        id: `stock-low-${p.id}`,
        type: 'stock_low',
        severity: 'Attention',
        title: `Stock faible — ${p.name}`,
        message: `« ${p.name} » est sous son seuil minimum (${qty}/${p.minThreshold} ${p.unit}).`,
        entity: { kind: 'product', id: p.id, label: p.name },
        detectedAt: today,
        recommendedAction: 'Planifier un réapprovisionnement.',
        actionLabel: 'Voir le stock',
        navigateTo: STOCK_NAV,
        status: 'Non traité',
      });
    }
  });

  // --- Péremption proche / produit périmé (per lot with remaining quantity) ---
  ctx.stockLots
    .filter((l) => l.quantity > 0)
    .forEach((l) => {
      const status = getLotStatus(l, expiryAlertDays);
      const product = ctx.stockProducts.find((p) => p.id === l.productId);
      const productLabel = product?.name ?? l.productId;
      if (status === 'Expiré') {
        const daysAgo = Math.abs(daysBetween(l.expiryDate, today));
        alerts.push({
          id: `expiry-passed-${l.id}`,
          type: 'expiry_passed',
          severity: 'Critique',
          title: `Produit périmé — ${productLabel}`,
          message: `Le lot ${l.lotNumber} (${productLabel}) a dépassé sa date de péremption depuis ${daysAgo} jour${daysAgo > 1 ? 's' : ''} (${l.quantity} ${product?.unit ?? ''} concernés).`,
          entity: { kind: 'lot', id: l.id, label: `${productLabel} — Lot ${l.lotNumber}` },
          detectedAt: l.expiryDate,
          recommendedAction: 'Retirer le lot du stock et enregistrer une perte pour péremption.',
          actionLabel: 'Voir les lots',
          navigateTo: LOTS_NAV,
          status: 'Non traité',
        });
      } else if (status === 'Expiration proche') {
        const daysLeft = daysBetween(today, l.expiryDate);
        alerts.push({
          id: `expiry-soon-${l.id}`,
          type: 'expiry_soon',
          severity: 'Attention',
          title: `Péremption proche — ${productLabel}`,
          message: `Le lot ${l.lotNumber} (${productLabel}) expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''} (${l.quantity} ${product?.unit ?? ''} concernés).`,
          entity: { kind: 'lot', id: l.id, label: `${productLabel} — Lot ${l.lotNumber}` },
          detectedAt: l.expiryDate,
          recommendedAction: 'Prioriser l\'écoulement de ce lot ou organiser sa rotation.',
          actionLabel: 'Voir les lots',
          navigateTo: LOTS_NAV,
          status: 'Non traité',
        });
      }
    });

  // --- Factures fournisseurs à échéance ---
  ctx.invoices.forEach((inv) => {
    if (computeInvoiceStatus(inv) === 'Payée') return;
    const supplierLabel = ctx.suppliers.find((s) => s.id === inv.supplierId)?.name ?? inv.supplierId;
    if (isInvoiceOverdue(inv)) {
      alerts.push({
        id: `invoice-due-${inv.id}`,
        type: 'invoice_due',
        severity: 'Critique',
        title: `Facture en retard — ${inv.invoiceNumber}`,
        message: `La facture ${inv.invoiceNumber} de ${supplierLabel} a dépassé son échéance (${inv.dueDate}) — restant dû ${(inv.amountTTC - inv.amountPaid).toFixed(2)} DT.`,
        entity: { kind: 'invoice', id: inv.id, label: `${inv.invoiceNumber} — ${supplierLabel}` },
        detectedAt: inv.dueDate,
        recommendedAction: 'Régulariser le paiement ou contacter le fournisseur.',
        actionLabel: 'Voir la facture',
        navigateTo: INVOICES_NAV,
        status: 'Non traité',
      });
    } else if (isInvoiceDueSoon(inv)) {
      alerts.push({
        id: `invoice-due-${inv.id}`,
        type: 'invoice_due',
        severity: 'Attention',
        title: `Échéance proche — ${inv.invoiceNumber}`,
        message: `La facture ${inv.invoiceNumber} de ${supplierLabel} arrive à échéance le ${inv.dueDate} — restant dû ${(inv.amountTTC - inv.amountPaid).toFixed(2)} DT.`,
        entity: { kind: 'invoice', id: inv.id, label: `${inv.invoiceNumber} — ${supplierLabel}` },
        detectedAt: inv.dueDate,
        recommendedAction: 'Préparer le paiement avant l\'échéance.',
        actionLabel: 'Voir la facture',
        navigateTo: INVOICES_NAV,
        status: 'Non traité',
      });
    }
  });

  // --- Écarts de stock importants (inventaires récents) ---
  const lookbackIso = addDaysIso(todayIso(), -discrepancyLookbackDays);
  ctx.stockLedger
    .filter((e) => e.type === 'Inventaire' && e.status === 'Confirmé' && e.timestamp.slice(0, 10) >= lookbackIso && Math.abs(e.discrepancyValue ?? 0) >= discrepancyThreshold)
    .forEach((e) => {
      const productLabel = ctx.stockProducts.find((p) => p.id === e.productId)?.name ?? e.productId;
      alerts.push({
        id: `stock-discrepancy-${e.id}`,
        type: 'inventory_discrepancy',
        severity: 'Important',
        title: `Écart de stock important — ${productLabel}`,
        message: `Écart constaté lors de l'inventaire du ${e.timestamp.slice(0, 10)} sur « ${productLabel} » : ${e.discrepancyQty ?? 0} unité(s), soit ${Math.abs(e.discrepancyValue ?? 0).toFixed(2)} DT.`,
        entity: { kind: 'product', id: e.productId, label: productLabel },
        detectedAt: e.timestamp,
        recommendedAction: "Analyser la cause de l'écart (vol, erreur de saisie, casse non déclarée).",
        actionLabel: "Voir l'inventaire",
        navigateTo: INVENTORY_NAV,
        status: 'Non traité',
      });
    });

  // --- Marge sous l'objectif ---
  ctx.articles
    .filter((a) => a.recipe && a.recipe.length > 0 && a.isAvailable !== false)
    .forEach((a) => {
      const cost = computeRecipeCost(a.recipe!, ctx.stockProducts, ctx.subRecipes, ctx.articles).cost;
      const { marginRate } = computeArticleMargin(a, cost);
      const target = a.targetMarginRate ?? DEFAULT_TARGET_MARGIN_RATE;
      if (marginRate < target) {
        alerts.push({
          id: `margin-${a.id}`,
          type: 'margin_below_target',
          severity: marginRate < 0 ? 'Important' : 'Attention',
          title: `Marge sous l'objectif — ${a.name}`,
          message: `« ${a.name} » a une marge de ${(marginRate * 100).toFixed(1)}% contre une cible de ${(target * 100).toFixed(0)}%.`,
          entity: { kind: 'article', id: a.id, label: a.name },
          detectedAt: today,
          recommendedAction: 'Revoir le prix de vente ou la fiche technique du produit.',
          actionLabel: 'Voir le produit',
          navigateTo: PRODUCTS_NAV,
          status: 'Non traité',
        });
      }
    });

  const severityRank: Record<AlertSeverity, number> = { Critique: 0, Important: 1, Attention: 2, Information: 3 };
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.detectedAt < b.detectedAt ? 1 : -1));
};
