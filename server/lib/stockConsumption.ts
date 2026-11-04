import { accumulateRecipeConsumption } from '../../src/data/productsModel.js';
import type { RecipeLine } from '../../src/data/manualSalesCatalog.js';
import { getAllArticlesRaw, getAllExtrasRaw, getAllSubRecipesRaw } from '../routes/productCatalog.js';
import { cancelLedgerEntryById, getAllProducts, getLedgerEntryIdsBySource, postEntries, type LedgerEntryInput } from '../routes/stock.js';
import { loadVariantRecipe } from './posCatalog.js';
import { readPosSettings } from '../routes/posCatalog.js';

// Theoretical consumption of validated order lines (cahier des charges §14.2).
//
// Each line is consumed exactly once: its stock movements are tagged source_type='pos_line',
// source_id=<line id>, and a line that already has movements is skipped — so a re-validation, a
// reprint, a payment or any retry can never consume the same ingredients twice. Payment never
// touches stock. Uses the V1 recipe expansion (sub-recipes, unit conversions) and ledger.

export const POS_LINE_SOURCE = 'pos_line';

export interface ConsumableLine {
  id: string;
  articleId: string;
  quantity: number;
  variantId?: string;
  extraIds: string[];
  label: string; // for the movement comment, e.g. "Ticket table T4"
}

export const consumeStockForLines = (lines: ConsumableLine[], performedBy: string): void => {
  if (lines.length === 0) return;
  const articles = getAllArticlesRaw();
  const subRecipes = getAllSubRecipesRaw();
  const extras = getAllExtrasRaw();
  const products = getAllProducts();
  const zone = readPosSettings().consumptionZone;

  const inputs: LedgerEntryInput[] = [];
  lines.forEach((line) => {
    if (getLedgerEntryIdsBySource(POS_LINE_SOURCE, line.id).length > 0) return;
    const consumption = new Map<string, number>();
    const expand = (recipe: RecipeLine[] | undefined) => {
      if (recipe && recipe.length > 0) accumulateRecipeConsumption(recipe, line.quantity, products, subRecipes, articles, consumption, new Set());
    };
    expand(articles.find((a) => a.id === line.articleId)?.recipe);
    expand(loadVariantRecipe(line.articleId, line.variantId));
    line.extraIds.forEach((id) => expand(extras.find((e) => e.id === id)?.recipe));

    consumption.forEach((qty, productId) => {
      if (qty <= 0 || !products.some((p) => p.id === productId)) return;
      inputs.push({
        type: 'Sortie',
        productId,
        zone,
        quantityDelta: -qty,
        reason: 'Vente',
        comment: line.label,
        performedBy,
        sourceType: POS_LINE_SOURCE,
        sourceId: line.id,
      });
    });
  });
  // A product without a recipe, or an ingredient since deleted, simply consumes nothing: a sale
  // must never fail because of a recipe data gap (V1 rule). Negative stock is allowed with an alert.
  if (inputs.length > 0) postEntries(inputs);
};

// Puts back what a line consumed — only for a cancellation approved before preparation started
// (cahier des charges §7.3 / §14.3).
export const restoreStockForLine = (lineId: string, performedBy: string, reason: string): number => {
  const ids = getLedgerEntryIdsBySource(POS_LINE_SOURCE, lineId);
  ids.forEach((id) => cancelLedgerEntryById(id, performedBy, reason));
  return ids.length;
};
