export interface MetricCardData {
  id: string;
  title: string;
  amount: string;
  subtitle: string;
  accentColor: 'emerald' | 'blue' | 'rose' | 'purple' | 'sky';
  iconType: 'receipt' | 'cart' | 'wallet' | 'trending' | 'dollar' | 'coins';
}

export interface ReturnItem {
  id: string;
  initials: string;
  name: string;
  reference: string;
  date: string;
  amount: string;
  status: 'Pending' | 'Approved' | 'Completed';
  avatarColor: string;
}

export interface TopProduct {
  id: string;
  name: string;
  sku: string;
  price: string;
  soldCount: number;
  soldLabel: string;
  category?: string;
  imageUrl?: string;
  revenue?: string;
  marginPercent?: number;
  costPrice?: string;
  trend?: string;
}

export interface LowStockProduct {
  id: string;
  name: string;
  sku: string;
  stock: number;
  minThreshold: number;
  unit: string;
  urgency: 'Critique' | 'Faible' | 'Modéré';
  imageUrl?: string;
}

export interface CoffeeAlert {
  id: string;
  title: string;
  description: string;
  level: 'danger' | 'warning' | 'info';
  category: 'Stock' | 'Machine' | 'Hygiène' | 'Fournisseur' | 'Personnel';
  timeAgo: string;
  actionLabel?: string;
}

export interface ClientItem {
  id: string;
  initials: string;
  name: string;
  email: string;
  status: 'Activité' | 'Pas actif';
  timeAgo: string;
  avatarBg: string;
}

export interface VendorItem {
  id: string;
  initials: string;
  name: string;
  email: string;
  status: 'Activité' | 'Pas actif';
  timeAgo: string;
  avatarBg: string;
}

export interface HourlySalesPoint {
  time: string;
  sales: number;
  previousSales?: number;
  label?: string;
}

export interface HourlyPurchasePoint {
  time: string;
  amount: number;
  previousAmount?: number;
  formattedAmount: string;
}

export interface HeatmapCell {
  day: string; // 'Mon', 'Tue', ...
  dayIndex: number;
  hour: number; // 0..23
  intensity: number; // 0, 1, 2, 3, 4
  amount?: number;
}

export type TimeFilterPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
