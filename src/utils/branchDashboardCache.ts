import type { OrderRecord } from '../services/orderService';

export type BranchDashboardStats = {
  totalOrders: number;
  totalSales: number;
  totalExpenses: number;
  totalProfit: number;
};

export type BranchDashboardRevenuePoint = {
  name: string;
  date?: string;
  income: number;
  expense: number;
};

export type BranchDashboardTrendingMenu = {
  key: string;
  name: string;
  category: string;
  totalQty: number;
  netSales: number;
  image: string;
};

export type BranchDashboardCachePayload = {
  dashboardData: {
    stats: BranchDashboardStats;
    revenueData: BranchDashboardRevenuePoint[];
    ordersOverview: { name: string; orders: number; date?: string }[];
  } | null;
  topCategories: { name: string; value: number; color: string }[];
  trendingMenusData: BranchDashboardTrendingMenu[];
  recentOrders: OrderRecord[];
  recentOrderItemsMeta: Record<string, { lineCount: number; totalQty: number }>;
};

const STORAGE_KEY = 'resto_branch_dashboard_cache_v1';
const EMPTY_MARKER_KEY = 'resto_branch_dashboard_empty_v1';
const MAX_ENTRIES = 12;

const EMPTY_PAYLOAD: BranchDashboardCachePayload = {
  dashboardData: null,
  topCategories: [],
  trendingMenusData: [],
  recentOrders: [],
  recentOrderItemsMeta: {},
};

type CacheStore = Record<string, { at: number; data: BranchDashboardCachePayload }>;

export function buildBranchDashboardCacheKey(params: {
  branchId: string;
  start: string;
  end: string;
}): string {
  return `bd:${params.branchId}|${params.start}|${params.end}`;
}

export function hasBranchDashboardCacheData(
  cached: BranchDashboardCachePayload | null,
): cached is BranchDashboardCachePayload {
  if (!cached) return false;
  const stats = cached.dashboardData?.stats;
  const hasStats =
    !!stats &&
    (stats.totalOrders > 0 ||
      stats.totalSales > 0 ||
      stats.totalExpenses > 0 ||
      (cached.dashboardData?.revenueData?.length ?? 0) > 0);
  return (
    hasStats ||
    cached.topCategories.length > 0 ||
    cached.trendingMenusData.length > 0 ||
    cached.recentOrders.length > 0
  );
}

export function isBranchDashboardPayloadEmpty(payload: BranchDashboardCachePayload): boolean {
  const stats = payload.dashboardData?.stats;
  const statsEmpty =
    !stats ||
    (stats.totalOrders === 0 &&
      stats.totalSales === 0 &&
      stats.totalExpenses === 0 &&
      stats.totalProfit === 0);
  return (
    statsEmpty &&
    (payload.dashboardData?.revenueData?.length ?? 0) === 0 &&
    payload.topCategories.length === 0 &&
    payload.trendingMenusData.length === 0 &&
    payload.recentOrders.length === 0
  );
}

type EmptyMarkerStore = Record<string, number>;

export function isKnownEmptyBranch(key: string): boolean {
  try {
    const raw = sessionStorage.getItem(EMPTY_MARKER_KEY);
    if (!raw) return false;
    const store = JSON.parse(raw) as EmptyMarkerStore;
    return store[key] != null;
  } catch {
    return false;
  }
}

export function markKnownEmptyBranch(key: string): void {
  try {
    const raw = sessionStorage.getItem(EMPTY_MARKER_KEY);
    const store: EmptyMarkerStore = raw ? (JSON.parse(raw) as EmptyMarkerStore) : {};
    store[key] = Date.now();
    sessionStorage.setItem(EMPTY_MARKER_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function clearKnownEmptyBranch(key: string): void {
  try {
    const raw = sessionStorage.getItem(EMPTY_MARKER_KEY);
    if (!raw) return;
    const store = JSON.parse(raw) as EmptyMarkerStore;
    delete store[key];
    sessionStorage.setItem(EMPTY_MARKER_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function readBranchDashboardCache(key: string): BranchDashboardCachePayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as CacheStore;
    const entry = store[key]?.data;
    if (!entry) return null;
    return {
      ...EMPTY_PAYLOAD,
      ...entry,
      recentOrderItemsMeta: entry.recentOrderItemsMeta ?? {},
    };
  } catch {
    return null;
  }
}

export function writeBranchDashboardCache(key: string, data: BranchDashboardCachePayload): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const store: CacheStore = raw ? (JSON.parse(raw) as CacheStore) : {};
    store[key] = { at: Date.now(), data };
    const keys = Object.entries(store)
      .sort(([, a], [, b]) => b.at - a.at)
      .map(([k]) => k);
    for (const k of keys.slice(MAX_ENTRIES)) {
      delete store[k];
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // sessionStorage full or unavailable — ignore
  }
}

export function patchBranchDashboardCache(
  key: string,
  patch: Partial<BranchDashboardCachePayload>,
): void {
  const existing = readBranchDashboardCache(key);
  const base = existing ?? EMPTY_PAYLOAD;
  writeBranchDashboardCache(key, {
    ...base,
    ...patch,
    recentOrderItemsMeta: patch.recentOrderItemsMeta ?? base.recentOrderItemsMeta,
  });
}
