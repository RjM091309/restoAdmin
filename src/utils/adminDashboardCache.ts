import type { ApiDailySalesItem } from '../services/analyticsService';
import type { BranchPerformanceData } from '../components/dashboard/BranchPerformanceCard';

export type AdminDashboardTrendPeriod = 'weekly' | 'monthly' | 'yearly';

export type AdminDashboardTrendPoint = {
  name: string;
  totalSales: number;
  totalExpenses: number;
  date?: string;
};

export type AdminDashboardCachePayload = {
  branchCardsData: BranchPerformanceData[];
  branchRevenueDistribution: { name: string; value: number }[];
  topProductsData: { name: string; sales: number }[];
  dailySalesForCards: ApiDailySalesItem[];
  expenseCategoryByBranch: Record<number, Record<string, number>>;
  comparePeriodReconAll: number;
  trendByPeriod: Partial<Record<AdminDashboardTrendPeriod, AdminDashboardTrendPoint[]>>;
};

const STORAGE_KEY = 'resto_admin_dashboard_cache_v1';
const MAX_ENTRIES = 10;

const EMPTY_PAYLOAD: AdminDashboardCachePayload = {
  branchCardsData: [],
  branchRevenueDistribution: [],
  topProductsData: [],
  dailySalesForCards: [],
  expenseCategoryByBranch: {},
  comparePeriodReconAll: 0,
  trendByPeriod: {},
};

type CacheStore = Record<string, { at: number; data: AdminDashboardCachePayload }>;

export function buildAdminDashboardCacheKey(params: {
  start: string;
  end: string;
  branchId: string | null;
}): string {
  return `ad:${params.start}|${params.end}|${params.branchId ?? 'all'}`;
}

export function hasAdminDashboardCacheData(
  cached: AdminDashboardCachePayload | null,
): cached is AdminDashboardCachePayload {
  if (!cached) return false;
  const hasTrend = Object.values(cached.trendByPeriod ?? {}).some((rows) => (rows?.length ?? 0) > 0);
  return (
    cached.branchCardsData.length > 0 ||
    cached.branchRevenueDistribution.length > 0 ||
    cached.topProductsData.length > 0 ||
    cached.dailySalesForCards.length > 0 ||
    hasTrend
  );
}

export function readAdminDashboardCache(key: string): AdminDashboardCachePayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as CacheStore;
    const entry = store[key]?.data;
    if (!entry) return null;
    return {
      ...EMPTY_PAYLOAD,
      ...entry,
      trendByPeriod: entry.trendByPeriod ?? {},
    };
  } catch {
    return null;
  }
}

export function writeAdminDashboardCache(key: string, data: AdminDashboardCachePayload): void {
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

/** Merge partial updates without dropping other cached sections (e.g. trend vs branch cards). */
export function patchAdminDashboardCache(
  key: string,
  patch: Partial<Omit<AdminDashboardCachePayload, 'trendByPeriod'>> & {
    trendByPeriod?: Partial<Record<AdminDashboardTrendPeriod, AdminDashboardTrendPoint[]>>;
  },
): void {
  const existing = readAdminDashboardCache(key);
  const base = existing ?? EMPTY_PAYLOAD;
  writeAdminDashboardCache(key, {
    ...base,
    ...patch,
    trendByPeriod: {
      ...base.trendByPeriod,
      ...(patch.trendByPeriod ?? {}),
    },
  });
}
