import { apiDelete, apiGet, apiPatch, apiPost, apiPostOnce, apiPut } from '../api/client';
import type { AppliedDiscount, CartLineInput, PricedArticle, PricedCart, PricedExtra, PricedVariant } from '../data/pricing';
import type { PaymentMethod, SessionSummary } from '../data/cashSession';
import type { PosSettings } from '../data/posSettings';
import type { LoyaltySettings, Reward } from '../data/loyalty';

// Typed client for the point-of-sale API (/api/pos/*). Every create action that must never be
// applied twice takes an idempotency key (see newIdempotencyKey in hooks/usePosEvents).

// --- Catalogue --------------------------------------------------------------------------------

export interface PosCatalog {
  categories: string[];
  articles: PricedArticle[];
  extras: PricedExtra[];
  incompatibleExtras: [string, string][];
}

export interface Discount {
  id: string;
  name: string;
  kind: 'percent' | 'fixed';
  value: number;
  scope: 'items' | 'ticket';
  articleIds: string[];
  categories: string[];
  startsOn?: string;
  endsOn?: string;
  weekdays: number[];
  startTime?: string;
  endTime?: string;
  minTicketMil: number;
  identifiedCustomersOnly: boolean;
  stackable: boolean;
  active: boolean;
  createdBy?: string;
  createdAt?: string;
  customerCount?: number;
}

export type DiscountInput = Omit<Discount, 'id' | 'createdAt' | 'createdBy' | 'customerCount'>;

export const posApi = {
  catalog: (all = false) => apiGet<PosCatalog>(`/pos/catalog${all ? '?all=1' : ''}`),
  setArticle: (id: string, patch: { availability?: PricedArticle['availability']; prepDestination?: PricedArticle['prepDestination'] }) =>
    apiPatch<PricedArticle>(`/pos/catalog/articles/${id}`, patch),
  setIncompatibilities: (pairs: [string, string][]) => apiPut<{ pairs: [string, string][] }>('/pos/catalog/incompatibilities', { pairs }),
  quote: (lines: CartLineInput[], customerId?: string | null) => apiPost<PricedCart>('/pos/quote', { lines, customerId }),
  discounts: () => apiGet<Discount[]>('/pos/discounts'),
  createDiscount: (d: DiscountInput) => apiPost<Discount>('/pos/discounts', d),
  updateDiscount: (id: string, d: DiscountInput) => apiPut<Discount>(`/pos/discounts/${id}`, d),
  settings: () => apiGet<PosSettings>('/pos/settings'),
  saveSettings: (s: PosSettings) => apiPut<PosSettings>('/pos/settings', s),

  // --- Cash sessions
  registers: () => apiGet<{ id: string; name: string; openSessionId: string | null }[]>('/pos/registers'),
  sessions: () => apiGet<CashSession[]>('/pos/cash-sessions'),
  session: (id: string) => apiGet<CashSessionDetail>(`/pos/cash-sessions/${id}`),
  openSession: (registerId: string, openingFloatMil: number, comment: string, key: string) =>
    apiPostOnce<CashSessionDetail>('/pos/cash-sessions', { registerId, openingFloatMil, comment: comment || undefined }, key),
  movement: (sessionId: string, m: { type: 'in' | 'out'; amountMil: number; reason: string; comment?: string }, key: string) =>
    apiPostOnce<CashSessionDetail>(`/pos/cash-sessions/${sessionId}/movements`, m, key),
  closeSession: (sessionId: string, body: { countedCashMil?: number; counts?: Record<string, number>; comment?: string }, key: string) =>
    apiPostOnce<CashSessionDetail>(`/pos/cash-sessions/${sessionId}/close`, body, key),
  correctSession: (sessionId: string, countedCashMil: number, reason: string) =>
    apiPost<CashSessionDetail>(`/pos/cash-sessions/${sessionId}/corrections`, { countedCashMil, reason }),

  // --- Sales
  counterSale: (body: { sessionId: string; serviceType: 'dine_in' | 'takeaway'; lines: CartLineInput[]; customerId?: string | null }, key: string) =>
    apiPostOnce<SaleDetail>('/pos/sales/counter', body, key),
  sale: (id: string) => apiGet<SaleDetail>(`/pos/sales/${id}`),
  pay: (saleId: string, body: { sessionId: string; method: PaymentMethod; amountMil: number }, key: string) =>
    apiPostOnce<{ sale: SaleDetail; payment: { id: string; amountMil: number; changeMil: number } }>(`/pos/sales/${saleId}/payments`, body, key),
  manualDiscount: (saleId: string, discount: { kind: 'percent' | 'fixed'; value: number; reason: string } | null) =>
    apiPost<SaleDetail>(`/pos/sales/${saleId}/manual-discount`, { discount }),
  searchSales: (q: { number?: string; date?: string; table?: string; status?: string }) => {
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
    return apiGet<SaleSummary[]>(`/pos/sales?${params}`);
  },
  print: (saleId: string) => apiPost<{ duplicate: boolean; duplicateNumber: number; sale: SaleDetail }>(`/pos/sales/${saleId}/print`),
  correctSale: (
    saleId: string,
    body: { lineIds: string[]; reason: string; stockTreatment: string; refund: { sessionId: string; method: PaymentMethod; amountMil: number } | null },
    key: string
  ) => apiPostOnce<{ amountMil: number; sale: SaleDetail; adjustments: Adjustment[] }>(`/pos/sales/${saleId}/corrections`, body, key),
  adjustments: (saleId: string) => apiGet<Adjustment[]>(`/pos/sales/${saleId}/adjustments`),
  setSaleCustomer: (saleId: string, customerId: string | null) =>
    apiPost<SaleDetail>(`/pos/sales/${saleId}/customer`, { customerId, confirmedByCustomer: true }),
  saleRewards: (saleId: string) => apiGet<{ available: number; balance?: number; rewards: (Reward & { applied: boolean })[] }>(`/pos/sales/${saleId}/rewards`),
  applyReward: (saleId: string, rewardId: string) => apiPost<SaleDetail>(`/pos/sales/${saleId}/rewards`, { rewardId }),
  removeReward: (saleId: string, rewardId: string) => apiDelete<SaleDetail>(`/pos/sales/${saleId}/rewards/${rewardId}`),

  // --- Floor
  floor: () => apiGet<FloorState>('/pos/floor'),
  createArea: (name: string) => apiPost<{ id: string }>('/pos/floor/areas', { name }),
  renameArea: (id: string, name: string) => apiPut(`/pos/floor/areas/${id}`, { name }),
  archiveArea: (id: string) => apiPost(`/pos/floor/areas/${id}/archive`),
  createTable: (t: TableInput) => apiPost<FloorTable>('/pos/floor/tables', t),
  updateTable: (id: string, t: TableInput) => apiPut<FloorTable>(`/pos/floor/tables/${id}`, t),
  saveLayout: (tables: { id: string; x: number; y: number; width: number; height: number; rotation: number }[]) => apiPut('/pos/floor/layout', { tables }),
  archiveTable: (id: string) => apiPost(`/pos/floor/tables/${id}/archive`),
  regenerateQr: (id: string) => apiPost<FloorTable>(`/pos/floor/tables/${id}/regenerate-qr`),
  qrChecked: (id: string) => apiPost<FloorTable>(`/pos/floor/tables/${id}/qr-checked`),
  createSection: (s: { name: string; color: string; tableIds: string[] }) => apiPost<{ id: string }>('/pos/floor/sections', s),
  updateSection: (id: string, s: { name: string; color: string; tableIds: string[] }) => apiPut(`/pos/floor/sections/${id}`, s),
  archiveSection: (id: string) => apiPost(`/pos/floor/sections/${id}/archive`),
  assignSection: (id: string, waiterId: string | null) => apiPost(`/pos/floor/sections/${id}/assign`, { waiterId }),
  sectionHistory: (id: string) => apiGet<{ waiter: string; startsAt: string; endsAt: string | null; assignedBy: string; previousWaiter: string | null }[]>(`/pos/floor/sections/${id}/history`),
  waiters: () => apiGet<{ id: string; name: string }[]>('/pos/floor/waiters'),

  // --- Visits & orders
  visit: (id: string) => apiGet<VisitDetail>(`/pos/visits/${id}`),
  openVisit: (tableId: string, covers: number | null) => apiPost<VisitDetail>('/pos/visits', { tableId, covers }),
  setCovers: (visitId: string, covers: number) => apiPatch<VisitDetail>(`/pos/visits/${visitId}`, { covers }),
  regenerateCode: (visitId: string) => apiPost<VisitDetail>(`/pos/visits/${visitId}/regenerate-code`),
  closeVisit: (visitId: string) => apiPost<VisitDetail>(`/pos/visits/${visitId}/close`),
  staffOrder: (visitId: string, lines: CartLineInput[], key: string) => apiPostOnce<VisitDetail>(`/pos/visits/${visitId}/orders`, { lines }, key),
  acceptOrder: (orderId: string) => apiPost<Order>(`/pos/orders/${orderId}/accept`),
  rejectOrder: (orderId: string, reason: string) => apiPost<Order>(`/pos/orders/${orderId}/reject`, { reason }),
  requestOrderChange: (orderId: string, message: string, lines: CartLineInput[]) => apiPost<Order>(`/pos/orders/${orderId}/request-change`, { message, lines }),

  // --- Preparation
  prepBoard: (destination: 'kitchen' | 'bar') => apiGet<PrepBoard>(`/pos/prep/${destination}`),
  prepLine: (lineId: string, status: PrepStatus) => apiPost(`/pos/prep/lines/${lineId}/status`, { status }),
  prepTicket: (ticketId: string, status: PrepStatus) => apiPost(`/pos/prep/tickets/${ticketId}/status`, { status }),
  readyToServe: () => apiGet<{ id: string; name: string; quantity: number; readyAt: string; tableName: string | null }[]>('/pos/prep-ready'),

  // --- Action queue & service requests
  actions: () => apiGet<ActionItem[]>('/pos/actions'),
  takeRequest: (id: string) => apiPost(`/pos/service-requests/${id}/take`),
  doneRequest: (id: string) => apiPost(`/pos/service-requests/${id}/done`),

  // --- Cancellations
  requestCancellation: (targetType: 'line' | 'order' | 'visit', targetId: string, reason: string, key: string) =>
    apiPostOnce<Cancellation>('/pos/cancellations', { targetType, targetId, reason }, key),
  cancellations: (status?: string) => apiGet<Cancellation[]>(`/pos/cancellations${status ? `?status=${status}` : ''}`),
  approveCancellation: (id: string, body: { note?: string; stockTreatment?: string; stockNote?: string }) => apiPost<Cancellation>(`/pos/cancellations/${id}/approve`, body),
  rejectCancellation: (id: string, note: string) => apiPost<Cancellation>(`/pos/cancellations/${id}/reject`, { note }),

  // --- FAQ, allergens, feedback
  faq: () => apiGet<FaqEntry[]>('/pos/faq'),
  createFaq: (f: Omit<FaqEntry, 'id' | 'updatedBy' | 'updatedAt'>) => apiPost('/pos/faq', f),
  updateFaq: (id: string, f: Omit<FaqEntry, 'id' | 'updatedBy' | 'updatedAt'>) => apiPut(`/pos/faq/${id}`, f),
  deleteFaq: (id: string) => apiDelete(`/pos/faq/${id}`),
  allergens: () => apiGet<{ articleId: string; allergen: string; state: 'contains' | 'free' }[]>('/pos/catalog/allergens'),
  setAllergens: (articleId: string, allergens: { name: string; state: 'contains' | 'free' }[]) => apiPut(`/pos/catalog/articles/${articleId}/allergens`, { allergens }),
  feedback: (status?: string) => apiGet<Feedback[]>(`/pos/feedback${status ? `?status=${status}` : ''}`),
  updateFeedback: (id: string, status: Feedback['status'], internalNotes?: string) => apiPatch<Feedback>(`/pos/feedback/${id}`, { status, internalNotes }),

  // --- Customers & loyalty
  searchCustomers: (q: string) => apiGet<CustomerSummary[]>(`/pos/customers?q=${encodeURIComponent(q)}`),
  customer: (id: string) => apiGet<CustomerFile>(`/pos/customers/${id}`),
  adjustPoints: (id: string, points: number, reason: string) => apiPost(`/pos/customers/${id}/points`, { points, reason }),
  loyalty: () => apiGet<{ settings: LoyaltySettings; rewards: Reward[] }>('/pos/loyalty/settings'),
  saveLoyalty: (s: LoyaltySettings) => apiPut<{ settings: LoyaltySettings; rewards: Reward[] }>('/pos/loyalty/settings', s),
  createReward: (r: Omit<Reward, 'id'>) => apiPost<Reward>('/pos/loyalty/rewards', r),
  updateReward: (id: string, r: Omit<Reward, 'id'>) => apiPut<Reward>(`/pos/loyalty/rewards/${id}`, r),
  targetedOffers: () => apiGet<Discount[]>('/pos/loyalty/offers'),
  previewSegment: (segment: Segment) => apiPost<{ customerCount: number }>('/pos/loyalty/offers/preview', { segment }),
  createTargetedOffer: (o: { name: string; kind: 'percent' | 'fixed'; value: number; scope: 'items' | 'ticket'; validDays: number; segment: Segment }) =>
    apiPost<{ id: string; customerCount: number; endsOn: string }>('/pos/loyalty/offers', o),
  deactivateTargetedOffer: (id: string) => apiPost(`/pos/loyalty/offers/${id}/deactivate`),

  // --- Reservations
  reservations: (from: string, to: string) => apiGet<Reservation[]>(`/pos/reservations?from=${from}&to=${to}`),
  availability: (date: string, time: string, people: number, exceptId?: string) =>
    apiGet<{ id: string; name: string; capacity: number; fits: boolean; conflict: { id: string; name: string; time: string } | null }[]>(
      `/pos/reservations/availability?date=${date}&time=${time}&people=${people}${exceptId ? `&exceptId=${exceptId}` : ''}`
    ),
  createReservation: (r: ReservationInput & { confirm: boolean; source: 'phone' | 'walk_in' }) => apiPost<Reservation>('/pos/reservations', r),
  updateReservation: (id: string, r: ReservationInput) => apiPut<Reservation>(`/pos/reservations/${id}`, r),
  reservationStatus: (id: string, status: string, note?: string, tableId?: string) => apiPost<Reservation>(`/pos/reservations/${id}/status`, { status, note, tableId }),
};

// --- Types ----------------------------------------------------------------------------------------

export interface CashSession {
  id: string;
  registerId: string;
  registerName: string;
  status: 'open' | 'closed';
  openedBy: string;
  openedAt: string;
  openingFloatMil: number;
  openingComment: string | null;
  closedBy: string | null;
  closedAt: string | null;
  expectedCashMil: number | null;
  countedCashMil: number | null;
  differenceMil: number | null;
  closingComment: string | null;
  counts: Record<string, number> | null;
  summary: SessionSummary;
}

export interface CashSessionDetail extends CashSession {
  ticketCount: number;
  movements: { id: string; type: 'in' | 'out'; amountMil: number; reason: string; comment: string | null; createdBy: string; createdAt: string }[];
  corrections: { id: string; countedBeforeMil: number; countedAfterMil: number; reason: string; createdBy: string; createdAt: string }[];
  openBills: { id: string; tableName: string | null; totalMil: number; paidMil: number }[];
}

export type PrepStatus = 'none' | 'to_prepare' | 'in_progress' | 'ready' | 'served';

export interface OrderLine {
  id: string;
  orderId: string;
  articleId: string;
  name: string;
  displayName: string;
  category: string;
  quantity: number;
  variant: PricedVariant | null;
  extras: PricedExtra[];
  instruction: string | null;
  unitPriceMil: number;
  optionsPriceMil: number;
  grossMil: number;
  itemDiscounts: AppliedDiscount[];
  totalMil: number;
  vatRate: number;
  prepDestination: 'kitchen' | 'bar' | 'none';
  prepStatus: PrepStatus;
  responsibleWaiter: string | null;
  status: 'active' | 'cancelled' | 'refused';
}

export interface Order {
  id: string;
  number: number;
  saleId: string | null;
  visitId: string | null;
  channel: 'counter' | 'staff' | 'qr';
  serviceType: 'dine_in' | 'takeaway';
  status: 'pending_validation' | 'awaiting_customer' | 'validated' | 'rejected' | 'cancelled';
  note: string | null;
  sentTotalMil: number;
  changeRequest: string | null;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: string;
  validatedBy: string | null;
  lines: OrderLine[];
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  kind: 'payment' | 'refund';
  amountMil: number;
  tenderedMil: number | null;
  changeMil: number;
  createdBy: string;
  createdAt: string;
}

export interface SaleDetail {
  id: string;
  ticketNumber: string | null;
  status: 'open' | 'completed' | 'cancelled';
  serviceType: 'dine_in' | 'takeaway';
  visitId: string | null;
  tableName: string | null;
  customerId: string | null;
  sessionId: string | null;
  manualDiscount: { kind: 'percent' | 'fixed'; value: number; reason?: string } | null;
  ticketDiscounts: AppliedDiscount[];
  grossMil: number;
  discountMil: number;
  totalMil: number;
  paidMil: number;
  dueMil: number;
  vat: { rate: number; baseMil: number; vatMil: number }[];
  waiters: string[];
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
  reprintCount: number;
  orders: Order[];
  payments: Payment[];
}

export interface SaleSummary {
  id: string;
  ticketNumber: string | null;
  status: SaleDetail['status'];
  serviceType: SaleDetail['serviceType'];
  tableName: string | null;
  totalMil: number;
  paidMil: number;
  createdAt: string;
  completedAt: string | null;
  createdBy: string;
  reprintCount: number;
}

export interface Adjustment {
  id: string;
  reason: string;
  amountMil: number;
  lineIds: string[];
  refunded: boolean;
  stockTreatment: string;
  createdBy: string;
  createdAt: string;
}

export interface FloorTable {
  id: string;
  areaId: string;
  name: string;
  shape: 'round' | 'square' | 'rect';
  capacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  qrToken?: string;
  qrCheckedAt: string | null;
}

export type TableInput = Omit<FloorTable, 'id' | 'qrToken' | 'qrCheckedAt'>;

export interface LiveTable extends FloorTable {
  sectionId: string | null;
  accessible: boolean;
  visit: { id: string; openedAt: string; covers?: number | null; joinCode?: string; primaryWaiter?: string | null; status: string } | null;
  pendingOrders: number;
  billTotalMil: number;
  billPaidMil: number;
  waiterCalled?: boolean;
  billRequested?: boolean;
  pendingCancellations?: number;
  upcomingReservation?: { id: string; name: string; time: string; people: number } | null;
}

export interface FloorState {
  areas: { id: string; name: string; sort: number }[];
  sections: { id: string; name: string; color: string; waiterId: string | null; waiterName: string | null; tableIds: string[] }[];
  tables: LiveTable[];
}

export interface VisitDetail {
  id: string;
  tableId: string;
  status: 'open' | 'closed';
  openedAt: string;
  openedBy: string;
  covers: number | null;
  joinCode?: string;
  primaryWaiter: string | null;
  table: { id: string; name: string; capacity: number };
  sales: SaleDetail[];
  pendingOrders: Order[];
  waiterCalled?: boolean;
  billRequested?: boolean;
  pendingCancellations?: number;
}

export interface PrepBoard {
  destination: 'kitchen' | 'bar';
  tickets: {
    id: string;
    label: string;
    orderNumber: number;
    sentAt: string;
    waiter: string | null;
    lines: { id: string; name: string; quantity: number; variant: string | null; extras: string[]; instruction: string | null; status: PrepStatus; cancellationRequested: boolean }[];
  }[];
}

export interface ActionItem {
  id: string;
  kind: 'qr_order' | 'call_waiter' | 'bill' | 'cancellation' | 'reservation' | 'feedback' | 'missing_covers';
  title: string;
  detail?: string;
  tableId?: string | null;
  tableName?: string | null;
  status: string;
  createdAt: string;
  refId: string;
}

export interface Cancellation {
  id: string;
  targetType: 'line' | 'order' | 'visit';
  targetId: string;
  visitId: string | null;
  tableName: string | null;
  description: string;
  amountMil: number;
  prepStatusAtRequest: PrepStatus | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requester: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  stockTreatment: string | null;
}

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  articleId: string | null;
  sort: number;
  published: boolean;
  updatedBy: string;
  updatedAt: string;
}

export interface Feedback {
  id: string;
  tableName: string | null;
  customerId: string | null;
  rating: number;
  comment: string | null;
  status: 'to_handle' | 'in_progress' | 'resolved';
  internalNotes: string | null;
  handledBy: string | null;
  createdAt: string;
}

export interface CustomerSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  points: number;
}

export interface CustomerFile extends Omit<CustomerSummary, 'points'> {
  preferences: string | null;
  birthday: string | null;
  createdAt: string;
  lastVisit: string | null;
  visitsCount: number;
  spentMil: number;
  topProducts: { name: string; qty: number }[];
  reservations: { id: string; date: string; time: string; people: number; status: string }[];
  feedback: { id: string; rating: number; comment: string | null; status: string; createdAt: string }[];
  advantagesUsed: number;
  loyalty: { balance: number; reserved: number; available: number; history: { id: string; type: string; points: number; ticketNumber: string | null; reason: string | null; createdBy: string; createdAt: string }[] };
}

export interface Segment {
  notSeenForDays?: number;
  minVisitsLast90Days?: number;
  boughtArticleId?: string;
  birthdayThisMonth?: boolean;
}

export interface Reservation {
  id: string;
  name: string;
  phone?: string;
  email?: string | null;
  date: string;
  time: string;
  durationMin: number;
  people: number;
  comment: string | null;
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'arrived' | 'no_show' | 'completed';
  tableId: string | null;
  tableName: string | null;
  source: 'online' | 'phone' | 'walk_in';
  changeRequest: string | null;
  decisionNote: string | null;
  visitId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ReservationInput {
  name: string;
  phone: string;
  email?: string;
  date: string;
  time: string;
  people: number;
  comment?: string;
  tableId?: string | null;
}

export type { PricedCart, PricedArticle, CartLineInput };
