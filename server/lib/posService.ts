import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import { fromJson } from '../db/json.js';
import { ApiError, notFound } from '../middleware/errors.js';
import type { AuthedUser } from '../middleware/auth.js';
import {
  applyTicketDiscounts,
  computeCart,
  PricingError,
  tunisClock,
  type AppliedDiscount,
  type CartLineInput,
  type DiscountKind,
  type PricedCart,
  type PricedExtra,
  type PricedLine,
  type PricedVariant,
} from '../../src/data/pricing.js';
import type { PaymentMethod } from '../../src/data/cashSession.js';
import { loadActiveDiscountRules, loadPricingCatalog } from './posCatalog.js';
import { consumeStockForLines } from './stockConsumption.js';
import { currentWaiterOfTable } from './posAccess.js';

// Orders, bills (sales) and payments of the point of sale. Every function here is synchronous and
// meant to run inside a db.transaction() opened by the route, so an order, its stock movements, its
// preparation tickets and its journal line are committed together or not at all.

export type OrderChannel = 'counter' | 'staff' | 'qr';
export type ServiceType = 'dine_in' | 'takeaway';
export type OrderStatus = 'pending_validation' | 'awaiting_customer' | 'validated' | 'rejected' | 'cancelled';
export type PrepStatus = 'none' | 'to_prepare' | 'in_progress' | 'ready' | 'served';

export interface Actor {
  id: string | null;
  name: string;
}

export const actorOf = (user: AuthedUser): Actor => ({ id: user.id, name: user.fullName });

const nowIso = () => new Date().toISOString();

// --- Rows -----------------------------------------------------------------------------------

export interface SaleRow {
  id: string;
  ticket_number: string | null;
  status: 'open' | 'completed' | 'cancelled';
  service_type: ServiceType;
  visit_id: string | null;
  table_name: string | null;
  customer_id: string | null;
  session_id: string | null;
  manual_discount_json: string | null;
  ticket_discounts_json: string;
  gross_mil: number;
  discount_mil: number;
  total_mil: number;
  paid_mil: number;
  vat_json: string;
  created_by_id: string;
  created_by: string;
  created_at: string;
  completed_by: string | null;
  completed_at: string | null;
  reprint_count: number;
  offline_ref: string | null;
  occurred_at: string | null;
  client_total_mil: number | null;
}

export interface OrderRow {
  id: string;
  order_number: number;
  sale_id: string | null;
  visit_id: string | null;
  channel: OrderChannel;
  service_type: ServiceType;
  status: OrderStatus;
  customer_id: string | null;
  device_id: string | null;
  note: string | null;
  sent_total_mil: number;
  change_request: string | null;
  rejection_reason: string | null;
  created_by_id: string | null;
  created_by: string;
  created_at: string;
  validated_by_id: string | null;
  validated_by: string | null;
  validated_at: string | null;
  updated_at: string;
  pickup_number: number | null;
  priority: number;
}

export interface LineRow {
  id: string;
  order_id: string;
  position: number;
  article_id: string;
  name: string;
  display_name: string;
  category: string;
  quantity: number;
  variant_json: string | null;
  extras_json: string;
  instruction: string | null;
  unit_price_mil: number;
  options_price_mil: number;
  gross_mil: number;
  item_discounts_json: string;
  item_discount_mil: number;
  vat_rate: number;
  prep_destination: 'kitchen' | 'bar' | 'none';
  prep_status: PrepStatus;
  prep_ticket_id: string | null;
  responsible_waiter_id: string | null;
  responsible_waiter_name: string | null;
  status: 'active' | 'cancelled' | 'refused';
  created_at: string;
  sent_to_prep_at: string | null;
  prep_started_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  fire_status: 'now' | 'hold' | 'fired';
}

export interface PaymentRow {
  id: string;
  sale_id: string;
  session_id: string;
  method: PaymentMethod;
  kind: 'payment' | 'refund';
  amount_mil: number;
  tendered_mil: number | null;
  change_mil: number;
  note: string | null;
  created_by_id: string;
  created_by: string;
  created_at: string;
}

export const getSaleRow = (id: string): SaleRow => {
  const row = db.prepare('SELECT * FROM pos_sales WHERE id = ?').get(id) as SaleRow | undefined;
  if (!row) throw notFound('Vente');
  return row;
};

export const getOrderRow = (id: string): OrderRow => {
  const row = db.prepare('SELECT * FROM pos_orders WHERE id = ?').get(id) as OrderRow | undefined;
  if (!row) throw notFound('Commande');
  return row;
};

export const linesOfOrder = (orderId: string): LineRow[] =>
  db.prepare('SELECT * FROM pos_order_lines WHERE order_id = ? ORDER BY position').all(orderId) as LineRow[];

// --- Pricing a new cart ---------------------------------------------------------------------

export const priceCart = (
  lines: CartLineInput[],
  options: { customerId?: string | null; manualDiscount?: { kind: DiscountKind; value: number; reason?: string } | null } = {}
): PricedCart => {
  if (lines.length === 0) throw new ApiError(400, 'La commande est vide.');
  try {
    return computeCart(lines, loadPricingCatalog(), loadActiveDiscountRules(), {
      now: new Date(),
      customerId: options.customerId ?? null,
      manualDiscount: options.manualDiscount ?? null,
    });
  } catch (err) {
    if (err instanceof PricingError) throw new ApiError(400, err.message);
    throw err;
  }
};

// --- Orders ---------------------------------------------------------------------------------

const nextOrderNumber = (): number => {
  const row = db.prepare('SELECT MAX(order_number) AS n FROM pos_orders').get() as { n: number | null };
  return (row.n ?? 0) + 1;
};

export interface CreateOrderInput {
  channel: OrderChannel;
  serviceType: ServiceType;
  visitId: string | null;
  saleId: string | null;
  status: OrderStatus;
  customerId?: string | null;
  deviceId?: string | null;
  note?: string | null;
  cart: PricedCart;
  createdBy: Actor;
}

export const createOrder = (input: CreateOrderInput): OrderRow => {
  const id = randomUUID();
  const now = nowIso();
  db.prepare(
    `INSERT INTO pos_orders (id, order_number, sale_id, visit_id, channel, service_type, status, customer_id, device_id, note, sent_total_mil,
     created_by_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    nextOrderNumber(),
    input.saleId,
    input.visitId,
    input.channel,
    input.serviceType,
    input.status,
    input.customerId ?? null,
    input.deviceId ?? null,
    input.note ?? null,
    input.cart.lines.reduce((s, l) => s + l.grossMil - l.discounts.reduce((t, d) => t + d.amountMil, 0), 0),
    input.createdBy.id,
    input.createdBy.name,
    now,
    now
  );
  insertLines(id, input.cart.lines);
  // Counter / takeaway orders get a daily pickup number (ticket, prep ticket, "ready" board).
  if (input.channel === 'counter') {
    const dayStart = new Date(`${tunisClock(new Date()).date}T00:00:00+01:00`).toISOString();
    const last = (db.prepare('SELECT MAX(pickup_number) AS n FROM pos_orders WHERE pickup_number IS NOT NULL AND created_at >= ?').get(dayStart) as { n: number | null }).n ?? 0;
    db.prepare('UPDATE pos_orders SET pickup_number = ? WHERE id = ?').run(last + 1, id);
  }
  return getOrderRow(id);
};

const insertLines = (orderId: string, lines: PricedLine[]): void => {
  const insert = db.prepare(
    `INSERT INTO pos_order_lines (id, order_id, position, article_id, name, display_name, category, quantity, variant_json, extras_json,
     instruction, unit_price_mil, options_price_mil, gross_mil, item_discounts_json, item_discount_mil, vat_rate, prep_destination, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const now = nowIso();
  lines.forEach((l, i) =>
    insert.run(
      randomUUID(),
      orderId,
      i,
      l.articleId,
      l.name,
      l.displayName,
      l.category,
      l.quantity,
      l.variant ? JSON.stringify(l.variant) : null,
      JSON.stringify(l.extras),
      l.instruction ?? null,
      l.unitPriceMil,
      l.optionsPriceMil,
      l.grossMil,
      JSON.stringify(l.discounts),
      l.discounts.reduce((s, d) => s + d.amountMil, 0),
      l.vatRate,
      l.prepDestination,
      now
    )
  );
};

// Replaces the content of an order that is not validated yet (QR order adjusted by the team).
export const replaceOrderLines = (orderId: string, cart: PricedCart): void => {
  db.prepare('DELETE FROM pos_order_lines WHERE order_id = ?').run(orderId);
  insertLines(orderId, cart.lines);
};

export const lineToCartInput = (l: LineRow): CartLineInput => ({
  articleId: l.article_id,
  quantity: l.quantity,
  variantId: l.variant_json ? fromJson<PricedVariant>(l.variant_json, { id: '', label: '', deltaMil: 0 }).id : undefined,
  extraIds: fromJson<PricedExtra[]>(l.extras_json, []).map((e) => e.id),
  instruction: l.instruction ?? undefined,
});

const tableLabel = (visitId: string | null): string | null => {
  if (!visitId) return null;
  const row = db.prepare('SELECT t.name FROM visits v JOIN dining_tables t ON t.id = v.table_id WHERE v.id = ?').get(visitId) as { name: string } | undefined;
  return row?.name ?? null;
};

// Validation is the moment an order becomes real (cahier des charges §2.4, §5, §14.2): prices are
// frozen, the waiter in charge is recorded on every line, the order joins its bill, the lines go
// to the kitchen/bar and the ingredients leave the stock — once.
export const validateOrder = (orderId: string, by: Actor): OrderRow => {
  const order = getOrderRow(orderId);
  if (order.status === 'validated') return order;
  if (order.status !== 'pending_validation') throw new ApiError(409, 'Cette commande ne peut plus être validée.');
  const now = nowIso();

  let saleId = order.sale_id;
  let waiter: { id: string | null; name: string } = { id: by.id, name: by.name };
  if (order.visit_id) {
    const visit = db.prepare('SELECT table_id, primary_waiter_id, primary_waiter_name FROM visits WHERE id = ?').get(order.visit_id) as
      | { table_id: string; primary_waiter_id: string | null; primary_waiter_name: string | null }
      | undefined;
    if (!visit) throw notFound('Visite');
    const current = currentWaiterOfTable(visit.table_id);
    waiter = current ?? (visit.primary_waiter_name ? { id: visit.primary_waiter_id, name: visit.primary_waiter_name } : waiter);
    if (!saleId) saleId = openSaleForVisit(order.visit_id, by).id;
  }
  if (!saleId) throw new ApiError(500, 'Commande sans addition.');

  db.prepare(
    `UPDATE pos_orders SET status = 'validated', sale_id = ?, validated_by_id = ?, validated_by = ?, validated_at = ?, updated_at = ? WHERE id = ?`
  ).run(saleId, by.id, by.name, now, now, orderId);
  // Lines held back by the waiter ("à envoyer plus tard") are validated — price frozen, stock
  // consumed — but reach the kitchen/bar only when they are sent (fireHeldLines).
  db.prepare(
    `UPDATE pos_order_lines SET responsible_waiter_id = ?, responsible_waiter_name = ?,
     prep_status = CASE WHEN prep_destination = 'none' THEN 'none' ELSE 'to_prepare' END,
     sent_to_prep_at = CASE WHEN prep_destination = 'none' OR fire_status = 'hold' THEN NULL ELSE ? END
     WHERE order_id = ? AND status = 'active'`
  ).run(waiter.id, waiter.name, now, orderId);

  const label = tableLabel(order.visit_id) ?? (order.service_type === 'takeaway' ? 'À emporter' : 'Comptoir');
  const lines = linesOfOrder(orderId).filter((l) => l.status === 'active');
  dispatchToStations(order, lines.filter((l) => l.fire_status !== 'hold'), label, now);

  consumeStockForLines(
    lines.map((l) => {
      const input = lineToCartInput(l);
      return { id: l.id, articleId: l.article_id, quantity: l.quantity, variantId: input.variantId, extraIds: input.extraIds ?? [], label: `Commande n°${order.order_number} — ${label}` };
    }),
    by.name
  );

  if (order.customer_id) db.prepare('UPDATE pos_sales SET customer_id = COALESCE(customer_id, ?) WHERE id = ?').run(order.customer_id, saleId);
  recomputeSale(saleId);
  return getOrderRow(orderId);
};

// One prep ticket per station for the given lines; returns the created ticket ids.
type DispatchHook = (prepTicketIds: string[]) => void;
const dispatchHooks: DispatchHook[] = [];
// Printing registers here to print the kitchen/bar tickets of each dispatch (amélioration 03).
export const onPrepDispatched = (hook: DispatchHook): void => {
  dispatchHooks.push(hook);
};

const dispatchToStations = (order: OrderRow, lines: LineRow[], label: string, now: string): string[] => {
  const ids: string[] = [];
  (['kitchen', 'bar'] as const).forEach((destination) => {
    const forStation = lines.filter((l) => l.prep_destination === destination);
    if (forStation.length === 0) return;
    const ticketId = randomUUID();
    db.prepare('INSERT INTO prep_tickets (id, order_id, destination, label, sent_at) VALUES (?, ?, ?, ?, ?)').run(
      ticketId,
      order.id,
      destination,
      `${label} · n°${order.order_number}`,
      now
    );
    const update = db.prepare('UPDATE pos_order_lines SET prep_ticket_id = ? WHERE id = ?');
    forStation.forEach((l) => update.run(ticketId, l.id));
    ids.push(ticketId);
  });
  if (ids.length > 0) dispatchHooks.forEach((hook) => hook(ids));
  return ids;
};

// Sends the held lines of a validated order to preparation (the "suite").
export const fireHeldLines = (orderId: string): string[] => {
  const order = getOrderRow(orderId);
  if (order.status !== 'validated') throw new ApiError(409, "Cette commande n'est pas validée.");
  const held = linesOfOrder(orderId).filter((l) => l.status === 'active' && l.fire_status === 'hold');
  if (held.length === 0) throw new ApiError(409, 'Aucun article en attente pour cette commande.');
  const now = nowIso();
  const update = db.prepare("UPDATE pos_order_lines SET fire_status = 'fired', sent_to_prep_at = CASE WHEN prep_destination = 'none' THEN NULL ELSE ? END WHERE id = ?");
  held.forEach((l) => update.run(now, l.id));
  const label = tableLabel(order.visit_id) ?? (order.service_type === 'takeaway' ? 'À emporter' : 'Comptoir');
  return dispatchToStations(order, linesOfOrder(orderId).filter((l) => held.some((h) => h.id === l.id)), label, now);
};

// --- Bills ----------------------------------------------------------------------------------

export const createSale = (params: { serviceType: ServiceType; visitId: string | null; customerId?: string | null; by: Actor; sessionId?: string | null }): SaleRow => {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO pos_sales (id, status, service_type, visit_id, table_name, customer_id, session_id, created_by_id, created_by, created_at)
     VALUES (?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, params.serviceType, params.visitId, tableLabel(params.visitId), params.customerId ?? null, params.sessionId ?? null, params.by.id ?? '', params.by.name, nowIso());
  return getSaleRow(id);
};

// The bill of a visit: the open one, or a new one when the previous bill was settled.
export const openSaleForVisit = (visitId: string, by: Actor): SaleRow => {
  const open = db.prepare("SELECT * FROM pos_sales WHERE visit_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1").get(visitId) as SaleRow | undefined;
  return open ?? createSale({ serviceType: 'dine_in', visitId, by });
};

export const activeLinesOfSale = (saleId: string): LineRow[] =>
  db
    .prepare(
      `SELECT l.* FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id
       WHERE o.sale_id = ? AND o.status = 'validated' AND l.status = 'active'
       ORDER BY o.order_number, l.position`
    )
    .all(saleId) as LineRow[];

export const storedLineToPriced = (l: LineRow): PricedLine => ({
  articleId: l.article_id,
  name: l.name,
  displayName: l.display_name,
  category: l.category,
  quantity: l.quantity,
  variant: l.variant_json ? fromJson<PricedVariant>(l.variant_json, { id: '', label: '', deltaMil: 0 }) : undefined,
  extras: fromJson<PricedExtra[]>(l.extras_json, []),
  instruction: l.instruction ?? undefined,
  unitPriceMil: l.unit_price_mil,
  optionsPriceMil: l.options_price_mil,
  grossMil: l.gross_mil,
  discounts: fromJson<AppliedDiscount[]>(l.item_discounts_json, []),
  ticketDiscountMil: 0,
  totalMil: l.gross_mil - l.item_discount_mil,
  vatRate: l.vat_rate,
  prepDestination: l.prep_destination,
});

// Extra ticket-level discounts contributed by other modules (loyalty rewards) for a given bill.
type ExtraDiscountProvider = (sale: SaleRow) => AppliedDiscount[];
const extraDiscountProviders: ExtraDiscountProvider[] = [];
export const registerExtraDiscountProvider = (provider: ExtraDiscountProvider): void => {
  extraDiscountProviders.push(provider);
};

// Recomputes an open bill from its frozen lines: ticket offers, manual discount, rewards, VAT.
export const recomputeSale = (saleId: string): SaleRow => {
  const sale = getSaleRow(saleId);
  if (sale.status !== 'open') return sale;
  const lines = activeLinesOfSale(saleId).map(storedLineToPriced);
  const manual = sale.manual_discount_json ? fromJson<{ kind: DiscountKind; value: number; reason?: string }>(sale.manual_discount_json, { kind: 'fixed', value: 0 }) : null;
  const cart = applyTicketDiscounts(lines, loadActiveDiscountRules(), {
    now: new Date(),
    customerId: sale.customer_id,
    manualDiscount: manual,
    extraTicketDiscounts: extraDiscountProviders.flatMap((p) => p(sale)),
  });
  db.prepare('UPDATE pos_sales SET gross_mil = ?, discount_mil = ?, total_mil = ?, ticket_discounts_json = ?, vat_json = ? WHERE id = ?').run(
    cart.grossMil,
    cart.discountMil,
    cart.totalMil,
    JSON.stringify(cart.ticketDiscounts),
    JSON.stringify(cart.vat),
    saleId
  );
  return getSaleRow(saleId);
};

export const pendingOrdersOfVisit = (visitId: string): number =>
  (db.prepare("SELECT COUNT(*) AS n FROM pos_orders WHERE visit_id = ? AND status IN ('pending_validation', 'awaiting_customer')").get(visitId) as { n: number }).n;

// Ticket numbers are sequential per year and have no gaps: CN-2026-000123.
const nextTicketNumber = (): string => {
  const year = tunisClock(new Date()).date.slice(0, 4);
  const prefix = `CN-${year}-`;
  const row = db.prepare('SELECT ticket_number FROM pos_sales WHERE ticket_number LIKE ? ORDER BY ticket_number DESC LIMIT 1').get(`${prefix}%`) as
    | { ticket_number: string }
    | undefined;
  const last = row ? Number(row.ticket_number.slice(prefix.length)) : 0;
  return `${prefix}${String(last + 1).padStart(6, '0')}`;
};

// Hooks run when a bill becomes a completed sale (loyalty points, etc.), inside the same transaction.
type CompletionHook = (sale: SaleRow, by: Actor) => void;
const completionHooks: CompletionHook[] = [];
export const onSaleCompleted = (hook: CompletionHook): void => {
  completionHooks.push(hook);
};

// A bill is complete only when what was paid covers the total (cahier des charges §2.5).
export const completeIfSettled = (saleId: string, by: Actor): SaleRow => {
  const sale = getSaleRow(saleId);
  if (sale.status !== 'open' || sale.total_mil <= 0 || sale.paid_mil < sale.total_mil) return sale;
  db.prepare(`UPDATE pos_sales SET status = 'completed', ticket_number = ?, completed_by = ?, completed_at = ? WHERE id = ?`).run(
    nextTicketNumber(),
    by.name,
    nowIso(),
    saleId
  );
  const completed = getSaleRow(saleId);
  completionHooks.forEach((hook) => hook(completed, by));
  return completed;
};

// --- Payments ---------------------------------------------------------------------------------

export interface PaymentInput {
  method: PaymentMethod;
  amountMil: number; // card / voucher: amount charged — cash: amount handed over
  note?: string;
}

export const recordPayment = (saleId: string, sessionId: string, input: PaymentInput, by: Actor): { sale: SaleRow; payment: PaymentRow } => {
  const sale = recomputeSale(saleId);
  if (sale.status !== 'open') throw new ApiError(409, 'Cette vente est déjà réglée ou annulée.');
  const due = sale.total_mil - sale.paid_mil;
  if (due <= 0) throw new ApiError(409, 'Il ne reste rien à régler.');
  if (!Number.isInteger(input.amountMil) || input.amountMil <= 0) throw new ApiError(400, 'Montant invalide.');

  let applied = input.amountMil;
  let change = 0;
  if (input.method === 'cash') {
    applied = Math.min(input.amountMil, due);
    change = input.amountMil - applied;
  } else if (input.amountMil > due) {
    throw new ApiError(400, `Le montant dépasse le reste à régler.`);
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO pos_payments (id, sale_id, session_id, method, kind, amount_mil, tendered_mil, change_mil, note, created_by_id, created_by, created_at)
     VALUES (?, ?, ?, ?, 'payment', ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, saleId, sessionId, input.method, applied, input.method === 'cash' ? input.amountMil : null, change, input.note ?? null, by.id ?? '', by.name, nowIso());
  db.prepare('UPDATE pos_sales SET paid_mil = paid_mil + ?, session_id = COALESCE(session_id, ?) WHERE id = ?').run(applied, sessionId, saleId);
  const after = completeIfSettled(saleId, by);
  return { sale: after, payment: db.prepare('SELECT * FROM pos_payments WHERE id = ?').get(id) as PaymentRow };
};

// --- Read models ------------------------------------------------------------------------------

export const serializeLine = (l: LineRow) => ({
  id: l.id,
  orderId: l.order_id,
  articleId: l.article_id,
  name: l.name,
  displayName: l.display_name,
  category: l.category,
  quantity: l.quantity,
  variant: l.variant_json ? fromJson<PricedVariant>(l.variant_json, { id: '', label: '', deltaMil: 0 }) : null,
  extras: fromJson<PricedExtra[]>(l.extras_json, []),
  instruction: l.instruction,
  unitPriceMil: l.unit_price_mil,
  optionsPriceMil: l.options_price_mil,
  grossMil: l.gross_mil,
  itemDiscounts: fromJson<AppliedDiscount[]>(l.item_discounts_json, []),
  totalMil: l.gross_mil - l.item_discount_mil,
  vatRate: l.vat_rate,
  prepDestination: l.prep_destination,
  prepStatus: l.prep_status,
  responsibleWaiter: l.responsible_waiter_name,
  status: l.status,
  sentToPrepAt: l.sent_to_prep_at,
  readyAt: l.ready_at,
  servedAt: l.served_at,
  fireStatus: l.fire_status,
});

export const serializeOrder = (o: OrderRow) => ({
  id: o.id,
  number: o.order_number,
  saleId: o.sale_id,
  visitId: o.visit_id,
  channel: o.channel,
  serviceType: o.service_type,
  status: o.status,
  customerId: o.customer_id,
  note: o.note,
  sentTotalMil: o.sent_total_mil,
  changeRequest: o.change_request,
  rejectionReason: o.rejection_reason,
  createdBy: o.created_by,
  createdAt: o.created_at,
  validatedBy: o.validated_by,
  validatedAt: o.validated_at,
  pickupNumber: o.pickup_number,
  urgent: o.priority > 0,
  lines: linesOfOrder(o.id).map(serializeLine),
});

export const serializePayment = (p: PaymentRow) => ({
  id: p.id,
  method: p.method,
  kind: p.kind,
  amountMil: p.amount_mil,
  tenderedMil: p.tendered_mil,
  changeMil: p.change_mil,
  note: p.note,
  createdBy: p.created_by,
  createdAt: p.created_at,
});

export const saleDetail = (saleId: string) => {
  const sale = getSaleRow(saleId);
  const orders = db.prepare('SELECT * FROM pos_orders WHERE sale_id = ? ORDER BY order_number').all(saleId) as OrderRow[];
  const payments = db.prepare('SELECT * FROM pos_payments WHERE sale_id = ? ORDER BY created_at').all(saleId) as PaymentRow[];
  const waiters = [...new Set(activeLinesOfSale(saleId).map((l) => l.responsible_waiter_name).filter(Boolean))];
  return {
    id: sale.id,
    ticketNumber: sale.ticket_number,
    status: sale.status,
    serviceType: sale.service_type,
    visitId: sale.visit_id,
    tableName: sale.table_name,
    customerId: sale.customer_id,
    sessionId: sale.session_id,
    manualDiscount: sale.manual_discount_json ? JSON.parse(sale.manual_discount_json) : null,
    ticketDiscounts: fromJson<AppliedDiscount[]>(sale.ticket_discounts_json, []),
    grossMil: sale.gross_mil,
    discountMil: sale.discount_mil,
    totalMil: sale.total_mil,
    paidMil: sale.paid_mil,
    dueMil: Math.max(0, sale.total_mil - sale.paid_mil),
    vat: fromJson<{ rate: number; baseMil: number; vatMil: number }[]>(sale.vat_json, []),
    waiters,
    createdBy: sale.created_by,
    createdAt: sale.created_at,
    completedAt: sale.completed_at,
    completedBy: sale.completed_by,
    reprintCount: sale.reprint_count,
    printCount: (db.prepare('SELECT COUNT(*) AS n FROM pos_ticket_prints WHERE sale_id = ?').get(sale.id) as { n: number }).n,
    pickupNumber: orders.find((o) => o.pickup_number)?.pickup_number ?? null,
    offlineRef: sale.offline_ref,
    occurredAt: sale.occurred_at,
    orders: orders.map(serializeOrder),
    payments: payments.map(serializePayment),
  };
};

export type SaleDetail = ReturnType<typeof saleDetail>;
