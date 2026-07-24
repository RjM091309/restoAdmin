import { fetchAdminDashboardBundleApi } from '../services/analyticsService';
import {
  buildAdminDashboardCacheKey,
  hasAdminDashboardCacheData,
  readAdminDashboardCacheIncludingStale,
  writeAdminDashboardCache,
} from './adminDashboardCache';

const getCurrentMonthRange = (): { start: string; end: string } => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`,
    end: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
  };
};

const hasNonZeroTrendRows = (
  rows: { totalSales?: number; totalExpenses?: number }[],
): boolean =>
  rows.some(
    (d) => (Number(d.totalSales) || 0) > 0 || (Number(d.totalExpenses) || 0) > 0,
  );

let inFlightKey: string | null = null;
let inFlightPromise: Promise<void> | null = null;

export function getDefaultAdminDashboardCacheKey(): string {
  const range = getCurrentMonthRange();
  return buildAdminDashboardCacheKey({ start: range.start, end: range.end, branchId: null });
}

/** Await in-flight prefetch so AdminDashboard does not duplicate the bundle request. */
export function waitForAdminDashboardPrefetch(cacheKey?: string): Promise<void> {
  const key = cacheKey ?? getDefaultAdminDashboardCacheKey();
  if (hasAdminDashboardCacheData(readAdminDashboardCacheIncludingStale(key))) {
    return Promise.resolve();
  }
  if (inFlightKey === key && inFlightPromise) {
    return inFlightPromise;
  }
  return Promise.resolve();
}

/** Admin users only — warms dashboard cache before AdminDashboard mounts. */
export function prefetchAdminDashboardBundle(params?: {
  start?: string;
  end?: string;
}): void {
  const current = getCurrentMonthRange();
  const start = params?.start || current.start;
  const end = params?.end || current.end;
  const key = buildAdminDashboardCacheKey({ start, end, branchId: null });

  if (hasAdminDashboardCacheData(readAdminDashboardCacheIncludingStale(key))) return;
  if (inFlightKey === key && inFlightPromise) return;

  inFlightKey = key;
  inFlightPromise = (async () => {
    try {
      const bundle = await fetchAdminDashboardBundleApi({
        start,
        end,
        branchId: 'all',
        period: 'monthly',
      });

      if (hasAdminDashboardCacheData(readAdminDashboardCacheIncludingStale(key))) return;

      const trendByPeriod =
        bundle.trendData?.length && hasNonZeroTrendRows(bundle.trendData)
          ? { monthly: bundle.trendData }
          : {};

      writeAdminDashboardCache(key, {
        summary: bundle.summary,
        branchCardsData: bundle.branchCardsData,
        branchRevenueDistribution: bundle.branchRevenueDistribution,
        topProductsData: bundle.topProductsData,
        dailySalesForCards: bundle.dailySalesForCards,
        expenseCategoryByBranch: bundle.expenseCategoryByBranch,
        expenseRentByBranch: bundle.expenseRentByBranch,
        expenseSalaryByBranch: bundle.expenseSalaryByBranch,
        comparePeriodReconAll: bundle.comparePeriodReconAll,
        trendByPeriod,
        branchChartsById: bundle.branchChartsById,
      });
    } catch (error) {
      console.warn('[prefetchAdminDashboardBundle] failed:', error);
    } finally {
      if (inFlightKey === key) {
        inFlightKey = null;
        inFlightPromise = null;
      }
    }
  })();
}

export function isAdminDashboardUser(permissions: number | undefined | null): boolean {
  return Number(permissions) === 1;
}
