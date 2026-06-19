type CacheStore = Record<string, { at: number; data: unknown }>;

const STORAGE_KEYS: Record<string, string> = {
  menu: 'resto_menu_report_cache_v1',
  category: 'resto_category_report_cache_v1',
  payment: 'resto_payment_report_cache_v1',
  receipt: 'resto_receipt_report_cache_v1',
};

const MAX_ENTRIES = 10;

export function buildAnalyticsReportCacheKey(
  prefix: string,
  params: {
    start: string;
    end: string;
    branchId: string | null;
    extra?: string;
  },
): string {
  const branch = params.branchId ?? 'all';
  const extra = params.extra ? `|${params.extra}` : '';
  return `${prefix}:${params.start}|${params.end}|${branch}${extra}`;
}

export function readAnalyticsReportCache<T>(report: keyof typeof STORAGE_KEYS, key: string): T | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS[report]);
    if (!raw) return null;
    const store = JSON.parse(raw) as CacheStore;
    const entry = store[key]?.data;
    return entry != null ? (entry as T) : null;
  } catch {
    return null;
  }
}

export function writeAnalyticsReportCache<T>(
  report: keyof typeof STORAGE_KEYS,
  key: string,
  data: T,
): void {
  try {
    const storageKey = STORAGE_KEYS[report];
    const raw = sessionStorage.getItem(storageKey);
    const store: CacheStore = raw ? (JSON.parse(raw) as CacheStore) : {};
    store[key] = { at: Date.now(), data };
    const keys = Object.entries(store)
      .sort(([, a], [, b]) => b.at - a.at)
      .map(([k]) => k);
    for (const k of keys.slice(MAX_ENTRIES)) {
      delete store[k];
    }
    sessionStorage.setItem(storageKey, JSON.stringify(store));
  } catch {
    // sessionStorage full or unavailable — ignore
  }
}

export function hasNonEmptyRows<T extends { totalSales?: number; netAmount?: number; total?: number }>(
  rows: T[] | null | undefined,
  valueKey: 'totalSales' | 'netAmount' | 'total' = 'totalSales',
): boolean {
  if (!rows?.length) return false;
  return rows.some((r) => Number(r[valueKey] ?? 0) !== 0 || rows.length > 1);
}
