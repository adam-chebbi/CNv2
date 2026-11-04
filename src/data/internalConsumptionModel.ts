// "Ventes internes" — recording a finished product (coffee, pastry...) consumed by staff rather
// than sold. Deducts stock through the product's recipe exactly like a real sale (see
// server/routes/internalConsumption.ts), but carries no price and is never counted as revenue.
import { CatalogArticle } from './manualSalesCatalog';

export interface InternalConsumptionItem {
  name: string;
  qty: number;
}

export interface InternalConsumption {
  id: string;
  employee: string;
  items: InternalConsumptionItem[];
  itemsSummary: string;
  date: string;
  time: string;
  comment?: string;
  performedBy: string;
  createdAt: string;
}

export interface InternalConsumptionLineDraft {
  id: string;
  productId: string;
  qty: string;
}

export interface InternalConsumptionFormState {
  employee: string;
  lines: InternalConsumptionLineDraft[];
  comment: string;
}

let counter = 0;
export const generateInternalConsumptionLineId = (): string => {
  counter += 1;
  return `intcons-${counter}-${Date.now().toString(36)}`;
};

export const createEmptyInternalConsumptionLine = (): InternalConsumptionLineDraft => ({
  id: generateInternalConsumptionLineId(),
  productId: '',
  qty: '1',
});

export const createEmptyInternalConsumptionForm = (): InternalConsumptionFormState => ({
  employee: '',
  lines: [createEmptyInternalConsumptionLine()],
  comment: '',
});

export interface InternalConsumptionIssue {
  field: string;
  message: string;
}

export const validateInternalConsumptionForm = (form: InternalConsumptionFormState): InternalConsumptionIssue[] => {
  const issues: InternalConsumptionIssue[] = [];
  if (!form.employee) issues.push({ field: 'employee', message: "L'employé est obligatoire." });
  if (form.lines.length === 0) issues.push({ field: 'lines', message: 'Ajoutez au moins un produit.' });
  form.lines.forEach((line, idx) => {
    const label = `Ligne ${idx + 1}`;
    if (!line.productId) issues.push({ field: `line-${line.id}`, message: `${label} : sélectionnez un produit.` });
    const qty = Number(line.qty);
    if (!line.qty.trim() || Number.isNaN(qty) || qty <= 0) {
      issues.push({ field: `line-${line.id}`, message: `${label} : la quantité doit être supérieure à 0.` });
    }
  });
  return issues;
};

export const buildInternalConsumptionPayload = (
  form: InternalConsumptionFormState,
  articles: CatalogArticle[]
): { employee: string; items: { productId: string; name: string; qty: number }[]; comment?: string } => ({
  employee: form.employee,
  items: form.lines.map((line) => {
    const article = articles.find((a) => a.id === line.productId);
    return { productId: line.productId, name: article?.name ?? '', qty: Number(line.qty) };
  }),
  comment: form.comment.trim() || undefined,
});
