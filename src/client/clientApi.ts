import { apiDelete, apiGet, apiPost, apiPostOnce, apiPut } from '../api/client';
import type { AppliedDiscount, CartLineInput, DiscountRule, PricedArticle, PricedExtra } from '../data/pricing';
import type { Reward } from '../data/loyalty';

// Customer pages API (/api/client/*): no staff session involved.

export interface ClientMenu {
  categories: string[];
  articles: (PricedArticle & { allergens: { name: string; state: 'contains' | 'free' }[] })[];
  extras: PricedExtra[];
  incompatibleExtras: [string, string][];
  offers: DiscountRule[];
}

export interface ClientOrder {
  id: string;
  number: number;
  status: 'pending_validation' | 'awaiting_customer' | 'validated' | 'rejected' | 'cancelled';
  createdAt: string;
  changeRequest: string | null;
  rejectionReason: string | null;
  totalMil: number;
  lines: { id: string; displayName: string; quantity: number; instruction: string | null; totalMil: number; prepStatus: string; status: string }[];
}

export interface VisitView {
  tableName: string;
  myOrders: ClientOrder[];
  bill: {
    lines: { displayName: string; quantity: number; grossMil: number; totalMil: number; discounts: AppliedDiscount[] }[];
    pendingLines: { displayName: string; quantity: number; totalMil: number }[];
    ticketDiscounts: AppliedDiscount[];
    totalMil: number;
    paidMil: number;
  };
  activeRequests: { type: 'call_waiter' | 'bill'; status: string }[];
}

export interface Me {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  preferences: string | null;
  birthday: string | null;
  marketingConsent: boolean;
  loyalty: { balance: number; reserved: number; available: number };
}

export const clientApi = {
  menu: () => apiGet<ClientMenu>('/client/menu'),
  faq: () => apiGet<{ id: string; question: string; answer: string; articleId: string | null }[]>('/client/faq'),
  table: (token: string) => apiGet<{ table: { name: string }; visitOpen: boolean; joined: boolean; googleReviewUrl: string | null }>(`/client/tables/${token}`),
  join: (token: string, code: string) => apiPost<{ joined: boolean }>(`/client/tables/${token}/join`, { code }),
  visit: (token: string) => apiGet<VisitView>(`/client/tables/${token}/visit`),
  order: (token: string, lines: CartLineInput[], key: string) => apiPostOnce<ClientOrder>(`/client/tables/${token}/orders`, { lines }, key),
  confirm: (token: string, orderId: string, accept: boolean) => apiPost<ClientOrder>(`/client/tables/${token}/orders/${orderId}/confirm`, { accept }),
  request: (token: string, type: 'call_waiter' | 'bill') => apiPost(`/client/tables/${token}/requests`, { type }),
  feedback: (rating: number, comment: string, qrToken?: string) => apiPost<{ id: string; googleReviewUrl: string | null }>('/client/feedback', { rating, comment: comment || undefined, qrToken }),
  reserve: (r: { name: string; phone: string; email?: string; date: string; time: string; people: number; comment?: string; website?: string }) =>
    apiPost<{ id: string; status: string; message: string }>('/client/reservations', r),

  // Account
  me: () => apiGet<Me | null>('/client/account/me'),
  register: (body: { firstName: string; lastName: string; email: string; password: string; phone?: string | null; birthday?: string | null; marketingConsent: boolean }) =>
    apiPost<Me>('/client/account/register', body),
  login: (email: string, password: string) => apiPost<Me>('/client/account/login', { email, password }),
  logout: () => apiPost('/client/account/logout'),
  forgot: (email: string) => apiPost('/client/account/forgot', { email }),
  reset: (token: string, password: string) => apiPost('/client/account/reset', { token, password }),
  updateMe: (body: { firstName: string; lastName: string; phone: string | null; preferences: string | null; birthday: string | null; marketingConsent: boolean }) => apiPut<Me>('/client/account/me', body),
  changePassword: (currentPassword: string, newPassword: string) => apiPost('/client/account/password', { currentPassword, newPassword }),
  close: (password: string) => apiPost('/client/account/close', { password }),
  orders: () => apiGet<(ClientOrder & { tableName: string | null; lines: (ClientOrder['lines'][number] & { articleId: string; variantId: string | null; extraIds: string[] })[] })[]>('/client/account/orders'),
  receipts: () => apiGet<{ id: string; ticketNumber: string; completedAt: string; totalMil: number; tableName: string | null; advantages: AppliedDiscount[] }[]>('/client/account/receipts'),
  favorites: () => apiGet<(CartLineInput & { id: string; displayName: string; unitPriceMil: number | null; available: boolean; reason?: string })[]>('/client/account/favorites'),
  addFavorite: (articleId: string, variantId?: string, extraIds: string[] = []) => apiPost('/client/account/favorites', { articleId, variantId, extraIds }),
  removeFavorite: (id: string) => apiDelete(`/client/account/favorites/${id}`),
  reorder: (orderId: string) => apiPost<{ lines: (CartLineInput & { displayName: string; unitPriceMil: number })[]; dropped: { name: string; reason: string }[] }>(`/client/account/reorder/${orderId}`),
  loyalty: () =>
    apiGet<{ enabled: boolean; pointsPerDt: number; validityDays: number; balance: number; reserved: number; available: number; history: { id: string; type: string; points: number; ticketNumber: string | null; createdAt: string }[]; rewards: Reward[] }>(
      '/client/account/loyalty'
    ),
  offers: () => apiGet<{ id: string; name: string; kind: 'percent' | 'fixed'; value: number; scope: string; endsOn: string | null }[]>('/client/account/offers'),
  reservations: () => apiGet<{ id: string; date: string; time: string; people: number; status: string; changeRequest: string | null; comment: string | null }[]>('/client/account/reservations'),
  reservationRequest: (id: string, type: 'cancel' | 'change', message?: string) => apiPost(`/client/account/reservations/${id}/request`, { type, message }),
};

// The cart prepared from "Recommander" or a favourite, picked up by the table page.
const PENDING_CART_KEY = 'cn_pending_cart';
const LAST_TABLE_KEY = 'cn_last_table';

export const savePendingCart = (lines: CartLineInput[]): void => {
  try {
    localStorage.setItem(PENDING_CART_KEY, JSON.stringify(lines));
  } catch {
    // storage unavailable: the customer simply rebuilds the cart
  }
};
export const takePendingCart = (): CartLineInput[] => {
  try {
    const raw = localStorage.getItem(PENDING_CART_KEY);
    localStorage.removeItem(PENDING_CART_KEY);
    return raw ? (JSON.parse(raw) as CartLineInput[]) : [];
  } catch {
    return [];
  }
};
export const rememberTable = (token: string): void => {
  try {
    localStorage.setItem(LAST_TABLE_KEY, token);
  } catch {
    // ignore
  }
};
export const lastTable = (): string | null => {
  try {
    return localStorage.getItem(LAST_TABLE_KEY);
  } catch {
    return null;
  }
};
