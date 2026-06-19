import type { ApiBranchSalesItem, ApiDailySalesItem, ApiMenuReportRow } from '../services/analyticsService';

export type SalesAnalyticsProfitDriver = {
  row: ApiMenuReportRow;
  profit: number;
  branchId: number | null;
  branchName: string;
};

export type SalesAnalyticsCachePayload = {
  dailySalesCurrent: ApiDailySalesItem[];
  dailySalesPrevious: ApiDailySalesItem[];
  branchSalesData: ApiBranchSalesItem[];
  profitDriversData: SalesAnalyticsProfitDriver[];
  reconAdjustCurrent: { byDate: Record<string, number>; total: number };
  reconAdjustPreviousTotal: number;
};

const STORAGE_KEY = 'resto_sales_analytics_cache_v1';
const MAX_ENTRIES = 10;

type CacheStore = Record<string, { at: number; data: SalesAnalyticsCachePayload }>;

export function buildSalesAnalyticsCacheKey(params: {
  start: string;
  end: string;
  branchId: string | null;
}): string {
  return `sa:${params.start}|${params.end}|${params.branchId ?? 'all'}`;
}

export function hasSalesAnalyticsCacheData(
  cached: SalesAnalyticsCachePayload | null,
): cached is SalesAnalyticsCachePayload {
  if (!cached) return false;
  const hasDaily = cached.dailySalesCurrent.some(
    (d) => Number(d.total_sales ?? d.net_sales ?? 0) > 0,
  );
  const hasBranch = cached.branchSalesData.some((b) => Number(b.total_sales ?? 0) > 0);
  return hasDaily || hasBranch;
}

export function readSalesAnalyticsCache(key: string): SalesAnalyticsCachePayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as CacheStore;
    return store[key]?.data ?? null;
  } catch {
    return null;
  }
}

export function writeSalesAnalyticsCache(key: string, data: SalesAnalyticsCachePayload): void {
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
