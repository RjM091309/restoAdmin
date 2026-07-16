import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { type Branch } from '../partials/Header';
import { Skeleton } from '../ui/Skeleton';
import { BranchPerformanceCard, type BranchPerformanceData } from './BranchPerformanceCard';
import { DollarSign, TrendingUp, TrendingDown, Calendar, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import DatePicker from 'react-datepicker';
import {
  fetchAdminDashboardBundleApi,
  fetchTopSellingApi,
  fetchExpenseCategoryBreakdownApi,
  fetchPerformanceTrendApi,
  type ApiDailySalesItem,
  type ApiPerformanceTrendRow,
  type ApiExpenseCategoryRow,
} from '../../services/analyticsService';
import { fetchCashReconciliationAggregates } from '../../services/cashReconciliationService';
import { CashReconciliationModal } from '../analytics/CashReconciliationModal';
import { isExcludedFromAllBranchesView, sortBranchesBySidebarOrder } from '../../utils/branchLogo';
import {
  buildAdminDashboardCacheKey,
  hasAdminDashboardCacheData,
  patchAdminDashboardCache,
  readAdminDashboardCacheIncludingStale,
  type AdminDashboardCachePayload,
  type AdminDashboardTrendPoint,
} from '../../utils/adminDashboardCache';
import { waitForAdminDashboardPrefetch } from '../../utils/prefetchAdminDashboard';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
const REVENUE_DISTRIBUTION_COLORS = [
  '#3b82f6',
  '#f97316',
  '#22c55e',
  '#ef4444',
  '#8b5cf6',
  '#a16207',
  '#ec4899',
  '#6b7280',
  '#84cc16',
  '#0f766e',
  '#14b8a6',
  '#f59e0b',
  '#4f46e5',
  '#be123c',
  '#64748b',
];
const TOP_PRODUCTS_BAR_PALETTES = [
  ['#4338ca', '#4f46e5', '#6366f1', '#7c83ff', '#5b6df6'], // default
  ['#1d4ed8', '#2563eb', '#3b82f6', '#2f6df0', '#1e56db'],
  ['#047857', '#059669', '#10b981', '#0f9f74', '#0b8a64'],
  ['#b45309', '#d97706', '#f59e0b', '#e78a12', '#c46e0a'],
  ['#b91c1c', '#dc2626', '#ef4444', '#d63d3d', '#c62828'],
  ['#6d28d9', '#7c3aed', '#8b5cf6', '#7a4de8', '#6f33de'],
];
import { motion, AnimatePresence } from 'framer-motion';

type AdminDashboardProps = {
  selectedBranch: Branch | null;
  dateRange: {
    start: string;
    end: string;
  };
  onDateRangeChange: (range: DateRange) => void;
};

type SummaryData = {
  totalRevenue: number;
  totalSales: number;
  totalExpenses: number;
};

const SUMMARY_CACHE_PREFIX = 'admin_dashboard_summary_v2';
const LEGACY_SUMMARY_CACHE_PREFIX = 'admin_dashboard_summary_v1';

const SummaryCard = ({ title, value, icon: Icon, color }: { title: string, value: string, icon: React.ElementType, color: string }) => (
  <div className="relative w-full group cursor-default">
    <div className="relative flex items-center py-2">
      
      {/* Floating Icon Box */}
      <div 
        className={`z-10 w-20 h-20 absolute left-0 shadow-lg shadow-slate-200/50 rounded-2xl flex items-center justify-center ${color} text-white border-4 border-white transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}
      >
        <Icon size={28} strokeWidth={2.5} />
      </div>

      {/* Content Card */}
      <div 
        className="bg-white w-full ml-10 rounded-2xl shadow-sm border border-slate-100 py-6 pr-6 pl-14 relative min-h-[100px] flex flex-col justify-center transition-all duration-300 group-hover:shadow-lg group-hover:-translate-y-1"
      >
        <p className="text-xs text-slate-400 font-bold tracking-wider uppercase mb-1">{title}</p>
        <p className="text-2xl font-extrabold text-slate-800 tracking-tight">{value}</p>
      </div>
    </div>
  </div>
);

type MonthlyData = {
  name: string;
  totalSales: number;
  totalExpenses: number;
  date?: string; // ISO yyyy-mm-dd when available (used for weekly tooltip correctness)
};

type TrendPeriod = 'weekly' | 'monthly' | 'yearly';

type DateRange = {
  start: string;
  end: string;
};

type ComparisonRow = {
  id: string;
  label: string;
  values: number[];
  bestMode: 'max' | 'min';
};

type ComparisonSectionRow = {
  id: string;
  rowType: 'section';
  label: string;
};

type UnifiedComparisonRow = ComparisonRow | ComparisonSectionRow;

const isSectionRow = (row: UnifiedComparisonRow): row is ComparisonSectionRow =>
  (row as ComparisonSectionRow).rowType === 'section';

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const toDate = (s: string): Date | null => (s ? new Date(s) : null);

const toYYYYMMDD = (d: Date): string =>
  d.getFullYear() +
  '-' +
  String(d.getMonth() + 1).padStart(2, '0') +
  '-' +
  String(d.getDate()).padStart(2, '0');

/** Diverging bar chart: sales (positive) vs expenses (negative). */
const clampFiniteNonNegative = (n: unknown): number => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v;
};

const hasNonZeroTrendRows = (rows: MonthlyData[]): boolean =>
  rows.some(
    (d) => clampFiniteNonNegative(d.totalSales) > 0 || clampFiniteNonNegative(d.totalExpenses) > 0,
  );

/** Skip branch trend fetch only when the header range has no activity (weekly/monthly). */
const shouldSkipBranchTrendFetch = (
  period: TrendPeriod,
  branch: BranchPerformanceData | undefined,
  branchExpenses: number,
): boolean => {
  if (period === 'yearly') return false;
  if (!branch) return true;
  return (Number(branch.totalSales) || 0) === 0 && branchExpenses === 0;
};

/** Explicit chart dimensions — avoids Recharts 3 ResponsiveContainer sizing glitches. */
function TrendChartContainer({
  className = '',
  minHeight = 384,
  render,
}: {
  className?: string;
  minHeight?: number;
  render: (size: { width: number; height: number }) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize({ width: w, height: h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{ minHeight }}>
      {size.width > 0 && size.height > 0 ? render(size) : null}
    </div>
  );
}

const niceStep = (max: number, targetSteps: number): number => {
  const m = Number(max);
  if (!(m > 0) || !Number.isFinite(m)) return 1;
  const rough = m / Math.max(1, targetSteps);
  const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
  const r = rough / pow10;
  const mult = r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10;
  return mult * pow10;
};

const buildNiceMax = (maxAbs: number) => {
  // Keep a minimum scale so the axis doesn't collapse at tiny ranges.
  const minMax = 10_000;
  const effectiveMax = Math.max(Number.isFinite(maxAbs) ? maxAbs : 0, minMax);
  const step = niceStep(effectiveMax, 4);
  return Math.ceil(effectiveMax / step) * step;
};

/** Equal top/bottom panes — domain [-1, 1]. When expenses are significant,
 *  peak expense maps to middle tick (-⅔); axis max = peak × 1.5. */
type TrendYScale = {
  salesMax: number;
  expenseMax: number;
  /** Actual max expense — anchored at chart -⅔ (middle expense tick). */
  peakExpense: number;
  domain: [number, number];
};

const EXPENSE_PEAK_CHART = -2 / 3;

const buildTrendYScale = (salesValues: number[], expenseValues: number[]): TrendYScale => {
  const maxSales = Math.max(0, ...salesValues);
  const maxExpense = Math.max(0, ...expenseValues);
  const salesMax = buildNiceMax(maxSales);
  const expenseFloor = salesMax * 3;

  if (!(maxExpense > 0)) {
    return { salesMax, expenseMax: expenseFloor, peakExpense: 0, domain: [-1, 1] };
  }

  const useMiddlePeak = maxExpense > expenseFloor * (2 / 3);
  if (useMiddlePeak) {
    const peakExpense = maxExpense;
    const expenseMax = Math.max(expenseFloor, buildNiceMax(peakExpense * 1.5));
    return { salesMax, expenseMax, peakExpense, domain: [-1, 1] };
  }

  return { salesMax, expenseMax: expenseFloor, peakExpense: 0, domain: [-1, 1] };
};

const toTrendChartSales = (value: number, salesMax: number): number | null => {
  if (!(value > 0) || !(salesMax > 0)) return null;
  return Math.min(value / salesMax, 1);
};

const toTrendChartExpense = (value: number, scale: TrendYScale): number | null => {
  if (!(value > 0) || !(scale.expenseMax > 0)) return null;
  if (scale.peakExpense > 0) {
    const chartMag = Math.min((value / scale.peakExpense) * Math.abs(EXPENSE_PEAK_CHART), 1);
    return -chartMag;
  }
  return -Math.min(value / scale.expenseMax, 1);
};

/** Sales: 2 ticks (½ & max). Expenses: 3 ticks (⅓, ⅔ & max of expense pane). */
const buildTrendYTicks = (): number[] => [1, 0.5, 0, -1 / 3, -2 / 3, -1];

const formatTrendYAxisTick = (chartValue: number, scale: TrendYScale): string => {
  const v = Number(chartValue);
  if (!Number.isFinite(v) || v === 0) return '₱0k';

  let raw: number;
  if (v > 0) {
    raw = v * scale.salesMax;
  } else if (scale.peakExpense > 0 && Math.abs(v - EXPENSE_PEAK_CHART) < 0.001) {
    raw = scale.peakExpense;
  } else {
    raw = Math.abs(v) * scale.expenseMax;
  }

  if (raw >= 1_000_000) {
    const m = raw / 1_000_000;
    return Number.isInteger(m) ? `₱${m}M` : `₱${m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (raw >= 1_000) return `₱${Math.round(raw / 1_000)}k`;
  return `₱${raw}`;
};

const WEEKDAY_ABBR_TO_JS_DAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const normalizeTickLabel = (value: unknown): string => String(value ?? '').trim();

const parseDateFromTickLabel = (label: string, fallbackYear: number): Date | null => {
  // Common case: ISO date
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const d = new Date(`${label}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Day-of-month only (e.g. "1", "01", "31") will be handled by caller
  // because we need a reference month (from selected date range).

  // If label already includes a year (e.g. "Mar 1, 2026"), rely on Date.parse
  const direct = new Date(label);
  if (!Number.isNaN(direct.getTime())) return direct;

  // If label looks like "Mar 1" (no year), attach a fallback year.
  const withYear = new Date(`${label} ${fallbackYear}`);
  if (!Number.isNaN(withYear.getTime())) return withYear;

  return null;
};

const weekendStyleForDay = (jsDay: number): { fill: string; marker: string } | null => {
  if (jsDay === 6) return { fill: '#ef4444', marker: '●' }; // Sat (red)
  if (jsDay === 0) return { fill: '#22c55e', marker: '●' }; // Sun (green)
  return null;
};

const weekdayAbbrFromJsDay = (jsDay: number): string => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][jsDay] ?? '';

const formatTopProductName = (value: string): string => {
  const normalized = String(value ?? '')
    .replace(/[\u3131-\uD79D]+/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= 22) return normalized;
  return `${normalized.slice(0, 22).trimEnd()}...`;
};

const getTopProductsPalette = (branchId: number | null): string[] => {
  if (!branchId || !Number.isFinite(branchId)) return TOP_PRODUCTS_BAR_PALETTES[0];
  const paletteIndex = (Math.abs(branchId) % (TOP_PRODUCTS_BAR_PALETTES.length - 1)) + 1;
  return TOP_PRODUCTS_BAR_PALETTES[paletteIndex];
};

const getCurrentMonthRange = (): DateRange => {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    start: toYYYYMMDD(firstDayOfMonth),
    end: toYYYYMMDD(today),
  };
};

const WEEKDAY_LABELS_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type BranchTopProduct = { name: string; sales: number };

type BranchDashboardPrefetchEntry = {
  trendByPeriod: Partial<Record<TrendPeriod, AdminDashboardTrendPoint[]>>;
  topProducts: BranchTopProduct[];
};

const buildBranchPrefetchKey = (branchId: number, start: string, end: string) =>
  `${branchId}:${start}:${end}`;

const mapTopSellingRows = (rows: unknown): BranchTopProduct[] =>
  Array.isArray(rows)
    ? rows.map((item: { MENU_NAME: string; total_quantity: number }) => ({
        name: item.MENU_NAME,
        sales: item.total_quantity,
      }))
    : [];

async function fetchBranchDashboardSnapshot({
  branchId,
  start,
  end,
  period,
}: {
  branchId: number;
  start: string;
  end: string;
  period: TrendPeriod;
}): Promise<{ trend: AdminDashboardTrendPoint[]; topProducts: BranchTopProduct[] }> {
  const [trend, topSelling] = await Promise.all([
    fetchBranchPerformanceTrend(branchId, start, end, period),
    fetchTopSellingApi(
      new URLSearchParams({
        start_date: start,
        end_date: end,
        branch_id: String(branchId),
        limit: '5',
      }),
    ),
  ]);

  return {
    trend,
    topProducts: mapTopSellingRows(topSelling),
  };
}

/** Add cash-recon adjustments onto performance-trend rows (all-branches path). */
const applyReconToPerformanceTrend = (
  rows: AdminDashboardTrendPoint[],
  period: TrendPeriod,
  byDate: Record<string, number>,
  start: string,
  end: string,
): AdminDashboardTrendPoint[] => {
  if (period === 'weekly') {
    return rows.map((row) => {
      if (!row.date) return row;
      const extra = Number(byDate[row.date] ?? 0);
      return extra
        ? { ...row, totalSales: Number(row.totalSales || 0) + extra }
        : row;
    });
  }

  if (period === 'monthly') {
    const reconByDom = new Map<number, number>();
    for (const [date, amt] of Object.entries(byDate)) {
      if (date < start || date > end) continue;
      const dom = new Date(`${date}T12:00:00`).getDate();
      reconByDom.set(dom, (reconByDom.get(dom) ?? 0) + (Number(amt) || 0));
    }
    return rows.map((row) => {
      const dom = Number(row.name);
      const extra = Number.isFinite(dom) ? (reconByDom.get(dom) ?? 0) : 0;
      return extra
        ? { ...row, totalSales: Number(row.totalSales || 0) + extra }
        : row;
    });
  }

  if (period === 'yearly') {
    const reconByMonth = Array(12).fill(0);
    for (const [date, amt] of Object.entries(byDate)) {
      if (date < start || date > end) continue;
      const monthIdx = new Date(`${date}T12:00:00`).getMonth();
      reconByMonth[monthIdx] += Number(amt) || 0;
    }
    return rows.map((row, idx) => {
      const extra = reconByMonth[idx] ?? 0;
      return extra
        ? { ...row, totalSales: Number(row.totalSales || 0) + extra }
        : row;
    });
  }

  return rows;
};

/** Recon fetch window — mirrors pyserver performance-trend date expansion. */
const getPerformanceTrendReconRange = (
  period: TrendPeriod,
  start: string,
  end: string,
): { start: string; end: string } => {
  if (period === 'yearly') {
    const ref = end || start;
    const y = new Date(`${ref}T12:00:00`).getFullYear();
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  if (period === 'weekly') {
    const windowEnd = new Date(`${end}T12:00:00`);
    const rangeStart = new Date(`${start}T12:00:00`);
    const windowStart = new Date(windowEnd);
    windowStart.setDate(windowStart.getDate() - 6);
    if (windowStart < rangeStart) windowStart.setTime(rangeStart.getTime());
    return { start: toYYYYMMDD(windowStart), end: toYYYYMMDD(windowEnd) };
  }
  return { start, end };
};

/** Yearly trend uses the full calendar year — not the header date filter. */
const getTrendApiDateRange = (
  period: TrendPeriod,
  start: string,
  end: string,
): { start: string; end: string } => getPerformanceTrendReconRange(period, start, end);

const applyWeeklyTodayLabel = (chartData: AdminDashboardTrendPoint[]): AdminDashboardTrendPoint[] => {
  if (chartData.length === 0 || !chartData.every((d) => d.date)) return chartData;
  const lastKey = chartData[chartData.length - 1].date!;
  const anchor = new Date(`${lastKey}T12:00:00`);
  const now = new Date();
  const isAnchorToday =
    anchor.getFullYear() === now.getFullYear() &&
    anchor.getMonth() === now.getMonth() &&
    anchor.getDate() === now.getDate();
  if (!isAnchorToday) return chartData;
  const copy = [...chartData];
  copy[copy.length - 1] = { ...copy[copy.length - 1], name: 'Today' };
  return copy;
};

/** Branch trend via performance-trend API (full-year yearly, same as all-branches). */
async function fetchBranchPerformanceTrend(
  branchId: number,
  start: string,
  end: string,
  period: TrendPeriod,
): Promise<AdminDashboardTrendPoint[]> {
  const apiRange = getTrendApiDateRange(period, start, end);
  const params = new URLSearchParams({
    period,
    start_date: apiRange.start,
    end_date: apiRange.end,
    branch_id: String(branchId),
  });

  const rows = await fetchPerformanceTrendApi(params);
  let chartData: AdminDashboardTrendPoint[] = rows.map((r) => ({
    name: r.name,
    totalSales: Number(r.totalSales || 0),
    totalExpenses: Number(r.totalExpenses || 0),
    ...(r.sale_date ? { date: String(r.sale_date).slice(0, 10) } : {}),
  }));

  const reconRange = getPerformanceTrendReconRange(period, start, end);
  try {
    const recon = await fetchCashReconciliationAggregates({
      start: reconRange.start,
      end: reconRange.end,
      branchId: String(branchId),
    });
    chartData = applyReconToPerformanceTrend(
      chartData,
      period,
      recon.byDate ?? {},
      reconRange.start,
      reconRange.end,
    );
  } catch {
    // keep API rows
  }

  if (period === 'weekly') {
    chartData = applyWeeklyTodayLabel(chartData);
  }

  return chartData;
}

const INITIAL_ADMIN_CACHE = (() => {
  const range = getCurrentMonthRange();
  const key = buildAdminDashboardCacheKey({ start: range.start, end: range.end, branchId: null });
  const cached = readAdminDashboardCacheIncludingStale(key);
  return { key, cached: hasAdminDashboardCacheData(cached) ? cached : null };
})();

const buildSummaryCacheKey = (branchScope: string, start: string, end: string): string =>
  `${SUMMARY_CACHE_PREFIX}:${branchScope}:${start}:${end}`;

const readSummaryCache = (key: string): SummaryData | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SummaryData> | null;
    if (!parsed) return null;
    const totalSales = Number(parsed.totalSales);
    const totalExpenses = Number(parsed.totalExpenses);
    const totalRevenue = Number(parsed.totalRevenue);
    if (![totalSales, totalExpenses, totalRevenue].every(Number.isFinite)) return null;
    return { totalSales, totalExpenses, totalRevenue };
  } catch {
    return null;
  }
};

/** Gross POS total per day — same basis as Sales Analytics “Total sales” KPI (sum of `total_sales`). */

const formatModalMoney = (n: number) =>
  `₱${Math.trunc(Number.isFinite(n) ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const buildExpenseMaps = (rows: ApiExpenseCategoryRow[]) => {
  const expenseMap: Record<number, Record<string, number>> = {};
  const expenseByBranch: Record<number, number> = {};
  const makeKey = (cat: string, name: string) =>
    `${cat.trim().toLowerCase()}|${name.trim().toLowerCase()}`;

  for (const row of rows || []) {
    const bid = Number(row.branch_id);
    if (!Number.isFinite(bid)) continue;
    if (!expenseMap[bid]) expenseMap[bid] = {};
    const key = makeKey(row.exp_cat, row.exp_name);
    const amt = Number(row.total_amount || 0);
    expenseMap[bid][key] = (expenseMap[bid][key] || 0) + amt;
    expenseByBranch[bid] = (expenseByBranch[bid] || 0) + amt;
  }

  return { expenseMap, expenseByBranch };
};

const preferNonEmptyArray = <T,>(next: T[], prev: T[]): T[] =>
  next.length > 0 ? next : prev;

const preferNonEmptyRecord = <T,>(
  next: Record<number, T>,
  prev: Record<number, T>,
): Record<number, T> => (Object.keys(next).length > 0 ? next : prev);

const expenseByBranchFromMap = (expenseMap: Record<number, Record<string, number>>) => {
  const expenseByBranch: Record<number, number> = {};
  for (const [bid, cats] of Object.entries(expenseMap)) {
    const id = Number(bid);
    if (!Number.isFinite(id)) continue;
    expenseByBranch[id] = Object.values(cats).reduce((s, v) => s + (Number(v) || 0), 0);
  }
  return expenseByBranch;
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ selectedBranch, dateRange, onDateRangeChange }) => {
  const { t } = useTranslation();
  const analyticsReqIdRef = useRef(0);
  const trendReqIdRef = useRef(0);
  const isFirstTrendEffectRef = useRef(true);
  const prevTrendPeriodEffectBranchRef = useRef<number | null>(null);
  const prevTrendPeriodRef = useRef<TrendPeriod>('monthly');
  const prevFocusedBranchIdRef = useRef<number | null>(null);
  const activeBranchIdRef = useRef<number | null>(null);
  const topProductsReqIdRef = useRef(0);
  const branchPrefetchCacheRef = useRef<Map<string, BranchDashboardPrefetchEntry>>(new Map());
  const branchPrefetchInFlightRef = useRef<Set<string>>(new Set());
  const branchPrefetchStartedKeyRef = useRef<string | null>(null);
  const prefetchAllBranchDashboardsRef = useRef<(() => Promise<void>) | null>(null);
  const refreshBranchDashboardChartsRef = useRef<
    ((branchId: number, period: TrendPeriod) => Promise<void>) | null
  >(null);
  const allBranchesTopProductsRef = useRef<{ name: string; sales: number }[]>([]);
  const initialMonthRange = getCurrentMonthRange();
  const [performanceData] = useState<BranchPerformanceData[]>([]);
  const [branchCardsData, setBranchCardsData] = useState<BranchPerformanceData[]>(
    () => INITIAL_ADMIN_CACHE.cached?.branchCardsData ?? [],
  );
  const [summaryData, setSummaryData] = useState<SummaryData | null>(() => {
    if (INITIAL_ADMIN_CACHE.cached?.summary) return INITIAL_ADMIN_CACHE.cached.summary;
    return readSummaryCache(buildSummaryCacheKey('all', initialMonthRange.start, initialMonthRange.end));
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>(() => {
    const trend = INITIAL_ADMIN_CACHE.cached?.trendByPeriod?.monthly;
    return trend?.length && hasNonZeroTrendRows(trend) ? trend : [];
  });
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('monthly');
  const trendPeriodRef = useRef<TrendPeriod>('monthly');

  useEffect(() => {
    trendPeriodRef.current = trendPeriod;
  }, [trendPeriod]);

  const [trendLoading, setTrendLoading] = useState(false);
  const [branchChartsLoading, setBranchChartsLoading] = useState(false);
  const [activeBranchId, setActiveBranchId] = useState<number | null>(null);

  useEffect(() => {
    activeBranchIdRef.current = activeBranchId;
  }, [activeBranchId]);
  const [compareBranchIds, setCompareBranchIds] = useState<number[]>([]);
  const [isComparePanelOpen, setIsComparePanelOpen] = useState(false);
  const [isComparePanelLoading, setIsComparePanelLoading] = useState(false);
  const [isCompareDateOpen, setIsCompareDateOpen] = useState(false);
  const [compareDateRange, setCompareDateRange] = useState<DateRange>(getCurrentMonthRange);

  // Analytics-based data for pie chart (revenue distribution) and top products
  const [branchRevenueDistribution, setBranchRevenueDistribution] = useState<{ name: string; value: number }[]>(
    () => INITIAL_ADMIN_CACHE.cached?.branchRevenueDistribution ?? [],
  );
  const [topProductsData, setTopProductsData] = useState<{ name: string; sales: number }[]>(
    () => INITIAL_ADMIN_CACHE.cached?.topProductsData ?? [],
  );
  const [topProductsLoading, setTopProductsLoading] = useState(false);
  const [dailySalesForCards, setDailySalesForCards] = useState<ApiDailySalesItem[]>(
    () => INITIAL_ADMIN_CACHE.cached?.dailySalesForCards ?? [],
  );
  const [expenseSummaryTotal, setExpenseSummaryTotal] = useState<number | null>(() =>
    INITIAL_ADMIN_CACHE.cached?.summary ? INITIAL_ADMIN_CACHE.cached.summary.totalExpenses : null,
  );
  const [analyticsLoading, setAnalyticsLoading] = useState(() => !INITIAL_ADMIN_CACHE.cached);
  const [expenseCategoryByBranch, setExpenseCategoryByBranch] = useState<
    Record<number, Record<string, number>>
  >(() => INITIAL_ADMIN_CACHE.cached?.expenseCategoryByBranch ?? {});

  const [cashReconModalOpen, setCashReconModalOpen] = useState(false);
  const [cashReconModalBranch, setCashReconModalBranch] = useState<BranchPerformanceData | null>(null);
  const [analyticsReloadKey, setAnalyticsReloadKey] = useState(0);
  /** Recon sum for all branches in compare range (used when daily-sales is unscoped) */
  const [comparePeriodReconAll, setComparePeriodReconAll] = useState(
    () => INITIAL_ADMIN_CACHE.cached?.comparePeriodReconAll ?? 0,
  );
  const visibleBranchRevenueDistribution = useMemo(
    () => branchRevenueDistribution.filter((entry) => !isExcludedFromAllBranchesView(entry.name)),
    [branchRevenueDistribution],
  );
  const totalRevenueDistribution = useMemo(
    () => visibleBranchRevenueDistribution.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [visibleBranchRevenueDistribution],
  );
  const topProductsPalette = useMemo(() => getTopProductsPalette(activeBranchId), [activeBranchId]);
  const topProductsChartData = useMemo(
    () =>
      topProductsData.map((item, index) => ({
        ...item,
        rank: index + 1,
        cleanName: formatTopProductName(item.name),
        barColor: topProductsPalette[index % topProductsPalette.length],
      })),
    [topProductsData, topProductsPalette],
  );
  const topProductMaxSales = useMemo(
    () => Math.max(...topProductsChartData.map((item) => Number(item.sales) || 0), 1),
    [topProductsChartData],
  );
  const focusedBranchName = useMemo(() => {
    if (!activeBranchId) return null;
    return branchCardsData.find((b) => b.id === activeBranchId)?.name ?? null;
  }, [activeBranchId, branchCardsData]);
  const summaryCacheKey = useMemo(() => {
    const currentRange = getCurrentMonthRange();
    const start = compareDateRange.start || currentRange.start;
    const end = compareDateRange.end || currentRange.end;
    const branchScope = activeBranchId ? String(activeBranchId) : 'all';
    return buildSummaryCacheKey(branchScope, start, end);
  }, [activeBranchId, compareDateRange.start, compareDateRange.end]);

  const analyticsCacheKey = useMemo(() => {
    const currentRange = getCurrentMonthRange();
    const start = compareDateRange.start || currentRange.start;
    const end = compareDateRange.end || currentRange.end;
    return buildAdminDashboardCacheKey({
      start,
      end,
      branchId: null,
    });
  }, [compareDateRange.start, compareDateRange.end]);

  // Cleanup legacy cache keys from older summary logic versions.
  useEffect(() => {
    try {
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LEGACY_SUMMARY_CACHE_PREFIX)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => localStorage.removeItem(key));
    } catch {
      // Ignore storage access errors.
    }
  }, []);

  // Sync selectedBranch prop to internal state
  useEffect(() => {
    const next =
      selectedBranch && selectedBranch.id !== 'all' ? Number(selectedBranch.id) : null;
    setActiveBranchId((prev) => (prev === next ? prev : next));
  }, [selectedBranch?.id]);

  // Keep internal compareDateRange in sync with global dateRange from Header
  useEffect(() => {
    if (dateRange.start || dateRange.end) {
      setCompareDateRange({
        start: dateRange.start,
        end: dateRange.end,
      });
    }
  }, [dateRange.start, dateRange.end]);

  const getDateRangeForAnalytics = useCallback(() => {
    const currentRange = getCurrentMonthRange();
    return {
      start: compareDateRange.start || currentRange.start,
      end: compareDateRange.end || currentRange.end,
    };
  }, [compareDateRange.end, compareDateRange.start]);

  const seedBranchPrefetchFromChartsById = useCallback(
    (
      chartsById: Record<
        string,
        { trendMonthly: AdminDashboardTrendPoint[]; topProducts: BranchTopProduct[] }
      >,
      start: string,
      end: string,
    ) => {
      for (const [branchIdStr, charts] of Object.entries(chartsById ?? {})) {
        const branchId = Number(branchIdStr);
        if (!Number.isFinite(branchId) || !charts) continue;
        const key = buildBranchPrefetchKey(branchId, start, end);
        branchPrefetchCacheRef.current.set(key, {
          trendByPeriod: { monthly: charts.trendMonthly ?? [] },
          topProducts: charts.topProducts ?? [],
        });
      }
    },
    [],
  );

  useEffect(() => {
    const { start, end } = getDateRangeForAnalytics();
    const cached = readAdminDashboardCacheIncludingStale(analyticsCacheKey);
    if (cached?.branchChartsById) {
      seedBranchPrefetchFromChartsById(cached.branchChartsById, start, end);
    }
  }, [analyticsCacheKey, getDateRangeForAnalytics, seedBranchPrefetchFromChartsById]);

  const getBranchPrefetchEntry = useCallback(
    (branchId: number) => {
      const { start, end } = getDateRangeForAnalytics();
      const key = buildBranchPrefetchKey(branchId, start, end);
      return { key, entry: branchPrefetchCacheRef.current.get(key) };
    },
    [getDateRangeForAnalytics],
  );

  const writeBranchPrefetchEntry = useCallback(
    (
      branchId: number,
      patch: {
        trendPeriod?: TrendPeriod;
        trend?: AdminDashboardTrendPoint[];
        topProducts?: BranchTopProduct[];
      },
    ) => {
      const { start, end } = getDateRangeForAnalytics();
      const key = buildBranchPrefetchKey(branchId, start, end);
      const existing = branchPrefetchCacheRef.current.get(key) ?? {
        trendByPeriod: {},
        topProducts: [],
      };
      const next: BranchDashboardPrefetchEntry = {
        trendByPeriod: { ...existing.trendByPeriod },
        topProducts: patch.topProducts ?? existing.topProducts,
      };
      if (patch.trendPeriod !== undefined && patch.trend !== undefined) {
        next.trendByPeriod[patch.trendPeriod] = patch.trend;
      }
      branchPrefetchCacheRef.current.set(key, next);
    },
    [getDateRangeForAnalytics],
  );

  const applyBranchPrefetchToCharts = useCallback(
    (branchId: number, period: TrendPeriod): boolean => {
      const { entry } = getBranchPrefetchEntry(branchId);
      if (!entry) return false;

      const cachedTrend = entry.trendByPeriod[period];
      if (cachedTrend === undefined) return false;

      setMonthlyData((prev) => (prev === cachedTrend ? prev : cachedTrend));
      setTopProductsData((prev) => (prev === entry.topProducts ? prev : entry.topProducts));
      return true;
    },
    [getBranchPrefetchEntry],
  );

  const refreshBranchDashboardCharts = useCallback(
    async (branchId: number, period: TrendPeriod, options: { background?: boolean } = {}) => {
      const { background = false } = options;
      const reqId = ++trendReqIdRef.current;
      const topProductsReqId = ++topProductsReqIdRef.current;
      const { start, end } = getDateRangeForAnalytics();

      if (!background && activeBranchIdRef.current === branchId) {
        setBranchChartsLoading(true);
      }

      try {
        const snapshot = await fetchBranchDashboardSnapshot({
          branchId,
          start,
          end,
          period,
        });
        if (
          reqId !== trendReqIdRef.current ||
          topProductsReqId !== topProductsReqIdRef.current ||
          activeBranchIdRef.current !== branchId
        ) {
          return;
        }

        setMonthlyData(snapshot.trend);
        setTopProductsData(snapshot.topProducts);
        writeBranchPrefetchEntry(branchId, {
          trendPeriod: period,
          trend: snapshot.trend,
          topProducts: snapshot.topProducts,
        });
        if (period === 'monthly') {
          patchAdminDashboardCache(analyticsCacheKey, {
            branchChartsById: {
              [String(branchId)]: {
                trendMonthly: snapshot.trend,
                topProducts: snapshot.topProducts,
              },
            },
          });
        }
      } catch (error) {
        if (activeBranchIdRef.current !== branchId) return;
        console.warn('[AdminDashboard] Branch dashboard refresh failed:', error);
      } finally {
        if (activeBranchIdRef.current === branchId) {
          setBranchChartsLoading(false);
          setTrendLoading(false);
          setTopProductsLoading(false);
        }
      }
    },
    [analyticsCacheKey, getDateRangeForAnalytics, writeBranchPrefetchEntry],
  );

  refreshBranchDashboardChartsRef.current = refreshBranchDashboardCharts;

  const invalidateBranchPrefetch = useCallback(
    (branchId?: number | null) => {
      const { start, end } = getDateRangeForAnalytics();
      if (branchId != null) {
        branchPrefetchCacheRef.current.delete(buildBranchPrefetchKey(branchId, start, end));
        return;
      }
      branchPrefetchCacheRef.current.clear();
      branchPrefetchInFlightRef.current.clear();
      branchPrefetchStartedKeyRef.current = null;
    },
    [getDateRangeForAnalytics],
  );

  const prefetchBranchDashboardData = useCallback(
    async (branchId: number, period: TrendPeriod = trendPeriod) => {
      const { start, end } = getDateRangeForAnalytics();
      const cacheKey = buildBranchPrefetchKey(branchId, start, end);
      const inflightKey = `${cacheKey}:${period}`;
      if (branchPrefetchInFlightRef.current.has(inflightKey)) return;

      const existing = branchPrefetchCacheRef.current.get(cacheKey);
      if (existing?.trendByPeriod[period] !== undefined) return;

      const branch = branchCardsData.find((b) => b.id === branchId);
      const branchExpenses = branch
        ? (expenseCategoryByBranch[branch.id]
            ? Object.values(expenseCategoryByBranch[branch.id]).reduce(
                (s, v) => s + (Number(v) || 0),
                0,
              )
            : Number(branch.totalExpenses) || 0)
        : 0;
      if (shouldSkipBranchTrendFetch(period, branch, branchExpenses)) {
        writeBranchPrefetchEntry(branchId, {
          trendPeriod: period,
          trend: [],
          topProducts: [],
        });
        return;
      }

      branchPrefetchInFlightRef.current.add(inflightKey);
      try {
        const snapshot = await fetchBranchDashboardSnapshot({
          branchId,
          start,
          end,
          period,
        });
        writeBranchPrefetchEntry(branchId, {
          trendPeriod: period,
          trend: snapshot.trend,
          topProducts: snapshot.topProducts,
        });

        if (activeBranchIdRef.current === branchId && trendPeriod === period) {
          setMonthlyData(snapshot.trend);
          setTopProductsData(snapshot.topProducts);
        }
      } catch (error) {
        console.warn('[AdminDashboard] Branch prefetch failed:', error);
      } finally {
        branchPrefetchInFlightRef.current.delete(inflightKey);
      }
    },
    [branchCardsData, expenseCategoryByBranch, getDateRangeForAnalytics, trendPeriod, writeBranchPrefetchEntry],
  );

  const prefetchAllBranchDashboards = useCallback(async () => {
    const branches = branchCardsData.filter((b) => !isExcludedFromAllBranchesView(b.name));
    if (branches.length === 0) return;

    const queue = [...branches];
    const workerCount = Math.min(3, branches.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (queue.length > 0) {
          const branch = queue.shift();
          if (!branch) break;
          // Prefetch monthly only — weekly/yearly load on demand via tab switch.
          await prefetchBranchDashboardData(branch.id, 'monthly');
        }
      }),
    );
  }, [branchCardsData, prefetchBranchDashboardData]);

  prefetchAllBranchDashboardsRef.current = prefetchAllBranchDashboards;

  useEffect(() => {
    branchPrefetchCacheRef.current.clear();
    branchPrefetchInFlightRef.current.clear();
    branchPrefetchStartedKeyRef.current = null;
  }, [analyticsCacheKey]);

  useEffect(() => {
    if (branchCardsData.length === 0) return;
    if (branchPrefetchStartedKeyRef.current === analyticsCacheKey) return;

    const { start, end } = getDateRangeForAnalytics();
    const allBranches = branchCardsData.filter((b) => !isExcludedFromAllBranchesView(b.name));
    const allCached =
      allBranches.length > 0 &&
      allBranches.every((b) => {
        const key = buildBranchPrefetchKey(b.id, start, end);
        return branchPrefetchCacheRef.current.get(key)?.trendByPeriod.monthly !== undefined;
      });

    branchPrefetchStartedKeyRef.current = analyticsCacheKey;
    if (allCached) return;

    void prefetchAllBranchDashboardsRef.current?.();
  }, [analyticsCacheKey, branchCardsData, getDateRangeForAnalytics]);

  const applyAdminBundlePayload = useCallback(
    (
      payload: {
        summary: SummaryData;
        branchCardsData: BranchPerformanceData[];
        branchRevenueDistribution: { name: string; value: number }[];
        topProductsData: { name: string; sales: number }[];
        dailySalesForCards: ApiDailySalesItem[];
        expenseCategoryByBranch: Record<number, Record<string, number>>;
        comparePeriodReconAll: number;
      },
      options: { background?: boolean } = {},
    ) => {
      const { background = false } = options;
      const summary = payload.summary;

      if (background) {
        setBranchCardsData((prev) =>
          payload.branchCardsData.length > 0 ? payload.branchCardsData : prev,
        );
        setBranchRevenueDistribution((prev) =>
          preferNonEmptyArray(payload.branchRevenueDistribution, prev),
        );
        if (!activeBranchIdRef.current) {
          setTopProductsData((prev) => preferNonEmptyArray(payload.topProductsData, prev));
        }
        setDailySalesForCards((prev) => preferNonEmptyArray(payload.dailySalesForCards, prev));
        setExpenseCategoryByBranch((prev) =>
          preferNonEmptyRecord(payload.expenseCategoryByBranch, prev),
        );
        setSummaryData((prev) =>
          summary.totalSales > 0 || summary.totalExpenses > 0 ? summary : (prev ?? summary),
        );
      } else {
        setBranchCardsData((prev) =>
          payload.branchCardsData.length > 0 ? payload.branchCardsData : prev,
        );
        setBranchRevenueDistribution((prev) =>
          preferNonEmptyArray(payload.branchRevenueDistribution, prev),
        );
        if (!activeBranchIdRef.current) {
          setTopProductsData(payload.topProductsData);
        }
        setDailySalesForCards(payload.dailySalesForCards);
        setExpenseCategoryByBranch(payload.expenseCategoryByBranch);
        setSummaryData(summary);
      }

      setComparePeriodReconAll(payload.comparePeriodReconAll);
      setExpenseSummaryTotal(summary.totalExpenses);

      patchAdminDashboardCache(analyticsCacheKey, {
        summary,
        branchCardsData: payload.branchCardsData,
        branchRevenueDistribution: payload.branchRevenueDistribution,
        topProductsData: payload.topProductsData,
        dailySalesForCards: payload.dailySalesForCards,
        expenseCategoryByBranch: payload.expenseCategoryByBranch,
        comparePeriodReconAll: payload.comparePeriodReconAll,
      });
    },
    [analyticsCacheKey],
  );

  const hydrateFromCache = useCallback((cached: AdminDashboardCachePayload) => {
    const branchFocused = activeBranchIdRef.current != null;

    if (cached.summary && !branchFocused) {
      setSummaryData(cached.summary);
      setExpenseSummaryTotal(cached.summary.totalExpenses);
    }
    const cachedTrend = cached.trendByPeriod?.[trendPeriod];
    if (!branchFocused && cachedTrend?.length && hasNonZeroTrendRows(cachedTrend)) {
      setMonthlyData(cachedTrend);
    }
    applyAdminBundlePayload(
      {
        summary: cached.summary ?? { totalSales: 0, totalExpenses: 0, totalRevenue: 0 },
        branchCardsData: cached.branchCardsData,
        branchRevenueDistribution: cached.branchRevenueDistribution,
        topProductsData: cached.topProductsData,
        dailySalesForCards: cached.dailySalesForCards,
        expenseCategoryByBranch: cached.expenseCategoryByBranch,
        comparePeriodReconAll: cached.comparePeriodReconAll,
      },
      { background: true },
    );
    setAnalyticsLoading(false);
  }, [applyAdminBundlePayload, trendPeriod]);

  const loadTrend = useCallback(
    async (background: boolean) => {
      const reqId = ++trendReqIdRef.current;
      if (!background) setTrendLoading(true);
      try {
        const currentRange = getCurrentMonthRange();
        const start = compareDateRange.start || currentRange.start;
        const end = compareDateRange.end || currentRange.end;
        const apiRange = getTrendApiDateRange(trendPeriod, start, end);

        let chartData: AdminDashboardTrendPoint[];

        if (activeBranchId) {
          chartData = await fetchBranchPerformanceTrend(activeBranchId, start, end, trendPeriod);
          if (reqId !== trendReqIdRef.current) return;
        } else {
          const params = new URLSearchParams();
          params.set('period', trendPeriod);
          params.set('start_date', apiRange.start);
          params.set('end_date', apiRange.end);

          const rows: ApiPerformanceTrendRow[] = await fetchPerformanceTrendApi(params);
          if (reqId !== trendReqIdRef.current) return;

          let rowsForChart = rows.map((r) => ({
            name: r.name,
            totalSales: Number(r.totalSales || 0),
            totalExpenses: Number(r.totalExpenses || 0),
            ...(r.sale_date ? { date: String(r.sale_date).slice(0, 10) } : {}),
          }));

          const weeklyHasCalendarDates =
            trendPeriod === 'weekly' && rowsForChart.length > 0 && rowsForChart.every((r) => r.date);

          if (weeklyHasCalendarDates) {
            const wStart = String(rowsForChart[0].date).slice(0, 10);
            const wEnd = String(rowsForChart[rowsForChart.length - 1].date).slice(0, 10);
            try {
              const recon = await fetchCashReconciliationAggregates({ start: wStart, end: wEnd });
              if (reqId !== trendReqIdRef.current) return;
              const byDate = recon.byDate && typeof recon.byDate === 'object' ? recon.byDate : {};
              rowsForChart = applyReconToPerformanceTrend(rowsForChart, 'weekly', byDate, wStart, wEnd);
            } catch {
              // keep API rows
            }
          } else {
            try {
              const reconRange = getTrendApiDateRange(trendPeriod, start, end);
              const recon = await fetchCashReconciliationAggregates({
                start: reconRange.start,
                end: reconRange.end,
              });
              if (reqId !== trendReqIdRef.current) return;
              const byDate = recon.byDate && typeof recon.byDate === 'object' ? recon.byDate : {};
              rowsForChart = applyReconToPerformanceTrend(
                rowsForChart,
                trendPeriod,
                byDate,
                reconRange.start,
                reconRange.end,
              );
            } catch {
              // keep API rows
            }
          }

          chartData = rowsForChart;

          if (trendPeriod === 'weekly' && chartData.length > 0 && chartData.every((d) => d.date)) {
            const lastKey = chartData[chartData.length - 1].date!;
            const anchor = new Date(`${lastKey}T12:00:00`);
            const now = new Date();
            const isAnchorToday =
              anchor.getFullYear() === now.getFullYear() &&
              anchor.getMonth() === now.getMonth() &&
              anchor.getDate() === now.getDate();
            if (isAnchorToday) {
              const copy = [...chartData];
              copy[copy.length - 1] = { ...copy[copy.length - 1], name: 'Today' };
              chartData = copy;
            }
          } else if (trendPeriod === 'weekly' && chartData.length === 7) {
            const anchor =
              (compareDateRange.end ? new Date(compareDateRange.end) : null) ??
              (compareDateRange.start ? new Date(compareDateRange.start) : null) ??
              new Date();

            const jsDay = anchor.getDay();
            const todayIdxMon0 = (jsDay + 6) % 7;
            const startIdx = (todayIdxMon0 + 1) % 7;
            const rotated = [...chartData.slice(startIdx), ...chartData.slice(0, startIdx)];

            const now = new Date();
            const isAnchorToday =
              anchor.getFullYear() === now.getFullYear() &&
              anchor.getMonth() === now.getMonth() &&
              anchor.getDate() === now.getDate();

            const anchorName = isAnchorToday
              ? 'Today'
              : WEEKDAY_LABELS_MON_FIRST[todayIdxMon0] ?? rotated[rotated.length - 1].name;

            const anchorMidday = new Date(anchor);
            anchorMidday.setHours(12, 0, 0, 0);
            const withDates = rotated.map((row, idx) => {
              const offsetDays = idx - (rotated.length - 1);
              const d = new Date(
                anchorMidday.getFullYear(),
                anchorMidday.getMonth(),
                anchorMidday.getDate() + offsetDays,
                12,
                0,
                0,
              );
              return { ...row, date: toYYYYMMDD(d) };
            });

            withDates[withDates.length - 1] = { ...withDates[withDates.length - 1], name: anchorName };
            chartData = withDates;
          }
        }

        if (reqId !== trendReqIdRef.current) return;

        if (!hasNonZeroTrendRows(chartData)) {
          setMonthlyData([]);
          if (!activeBranchId) {
            patchAdminDashboardCache(analyticsCacheKey, {
              trendByPeriod: { [trendPeriod]: [] },
            });
          }
          return;
        }

        setMonthlyData(chartData);
        if (!activeBranchId) {
          patchAdminDashboardCache(analyticsCacheKey, {
            trendByPeriod: { [trendPeriod]: chartData },
          });
        }
      } catch (error) {
        if (reqId !== trendReqIdRef.current) return;
        console.error('[AdminDashboard] Failed to load performance trend:', error);
      } finally {
        if (reqId === trendReqIdRef.current) setTrendLoading(false);
      }
    },
    [
      activeBranchId,
      analyticsCacheKey,
      compareDateRange.end,
      compareDateRange.start,
      trendPeriod,
    ],
  );

  const loadAdminBundle = useCallback(
    async (background: boolean) => {
      const reqId = ++analyticsReqIdRef.current;
      if (!background) {
        setAnalyticsLoading(true);
      }
      try {
        const currentRange = getCurrentMonthRange();
        const start = compareDateRange.start || currentRange.start;
        const end = compareDateRange.end || currentRange.end;

        const bundle = await fetchAdminDashboardBundleApi({
          start,
          end,
          branchId: 'all',
          period: 'monthly',
        });
        if (reqId !== analyticsReqIdRef.current) return;

        applyAdminBundlePayload(
          {
            summary: bundle.summary,
            branchCardsData: bundle.branchCardsData,
            branchRevenueDistribution: bundle.branchRevenueDistribution,
            topProductsData: bundle.topProductsData,
            dailySalesForCards: bundle.dailySalesForCards,
            expenseCategoryByBranch: bundle.expenseCategoryByBranch,
            comparePeriodReconAll: bundle.comparePeriodReconAll,
          },
          { background },
        );

        if (
          !activeBranchIdRef.current &&
          trendPeriodRef.current === 'monthly' &&
          hasNonZeroTrendRows(bundle.trendData)
        ) {
          setMonthlyData(bundle.trendData);
          patchAdminDashboardCache(analyticsCacheKey, {
            trendByPeriod: { monthly: bundle.trendData },
          });
        }

        if (bundle.branchChartsById && Object.keys(bundle.branchChartsById).length > 0) {
          seedBranchPrefetchFromChartsById(bundle.branchChartsById, start, end);
          patchAdminDashboardCache(analyticsCacheKey, {
            branchChartsById: bundle.branchChartsById,
          });
        }

        let topProducts = bundle.topProductsData;
        allBranchesTopProductsRef.current = topProducts;
        let expenseMap = bundle.expenseCategoryByBranch;
        let branchCards = bundle.branchCardsData;
        let summary = bundle.summary;

        const needsTopProducts = topProducts.length === 0;
        const needsExpenseBreakdown = Object.keys(expenseMap).length === 0;
        if (needsTopProducts || needsExpenseBreakdown) {
          try {
            const analyticsParams = new URLSearchParams();
            analyticsParams.set('start_date', start);
            analyticsParams.set('end_date', end);

            const [topSelling, expenseBreakdown] = await Promise.all([
              needsTopProducts
                ? fetchTopSellingApi(
                    new URLSearchParams({
                      start_date: start,
                      end_date: end,
                      limit: '5',
                    } as any),
                  )
                : Promise.resolve(null),
              needsExpenseBreakdown
                ? fetchExpenseCategoryBreakdownApi(new URLSearchParams(analyticsParams))
                : Promise.resolve(null),
            ]);
            if (reqId !== analyticsReqIdRef.current) return;

            if (Array.isArray(topSelling) && topSelling.length > 0) {
              topProducts = topSelling.map((item) => ({
                name: item.MENU_NAME,
                sales: item.total_quantity,
              }));
            }
            if (Array.isArray(expenseBreakdown) && expenseBreakdown.length > 0) {
              const maps = buildExpenseMaps(expenseBreakdown);
              expenseMap = maps.expenseMap;
              const expenseByBranch = maps.expenseByBranch;
              if (branchCards.length > 0) {
                branchCards = branchCards.map((card) => ({
                  ...card,
                  totalExpenses: expenseByBranch[card.id] ?? card.totalExpenses,
                }));
              }
              const totalExpenses = Object.values(expenseByBranch).reduce(
                (sum, v) => sum + (Number(v) || 0),
                0,
              );
              if (totalExpenses > 0) {
                summary = {
                  ...summary,
                  totalExpenses,
                  totalRevenue: summary.totalSales - totalExpenses,
                };
              }
            }

            applyAdminBundlePayload(
              {
                summary,
                branchCardsData: branchCards,
                branchRevenueDistribution: bundle.branchRevenueDistribution,
                topProductsData: topProducts,
                dailySalesForCards: bundle.dailySalesForCards,
                expenseCategoryByBranch: expenseMap,
                comparePeriodReconAll: bundle.comparePeriodReconAll,
              },
              { background },
            );
          } catch (error) {
            console.warn('[AdminDashboard] Supplemental bundle fetch failed:', error);
          }
        }

        const focusedId = activeBranchIdRef.current;
        if (focusedId != null) {
          void refreshBranchDashboardChartsRef.current?.(focusedId, trendPeriodRef.current);
        }

      } catch (error) {
        if (reqId !== analyticsReqIdRef.current) return;
        console.error('Failed to load admin dashboard bundle:', error);
      } finally {
        if (reqId === analyticsReqIdRef.current) {
          setAnalyticsLoading(false);
        }
      }
    },
    [
      analyticsCacheKey,
      applyAdminBundlePayload,
      compareDateRange.end,
      compareDateRange.start,
      seedBranchPrefetchFromChartsById,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const cached = readAdminDashboardCacheIncludingStale(analyticsCacheKey);
      if (hasAdminDashboardCacheData(cached)) {
        hydrateFromCache(cached);
        void loadAdminBundle(true);
        return;
      }

      await waitForAdminDashboardPrefetch(analyticsCacheKey);
      if (cancelled) return;

      const afterPrefetch = readAdminDashboardCacheIncludingStale(analyticsCacheKey);
      if (hasAdminDashboardCacheData(afterPrefetch)) {
        hydrateFromCache(afterPrefetch);
        void loadAdminBundle(true);
        return;
      }

      void loadAdminBundle(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [analyticsCacheKey, hydrateFromCache, loadAdminBundle, analyticsReloadKey]);

  // Bundle covers trend on mount / date change; refetch only when user switches Weekly/Monthly/Yearly.
  useEffect(() => {
    if (isFirstTrendEffectRef.current) {
      isFirstTrendEffectRef.current = false;
      prevTrendPeriodEffectBranchRef.current = activeBranchId;
      prevTrendPeriodRef.current = trendPeriod;
      return;
    }

    const branchChanged = prevTrendPeriodEffectBranchRef.current !== activeBranchId;
    const periodChanged = prevTrendPeriodRef.current !== trendPeriod;
    prevTrendPeriodEffectBranchRef.current = activeBranchId;
    prevTrendPeriodRef.current = trendPeriod;

    if (activeBranchId) {
      // Initial branch focus is handled by the branch-focus effect below.
      if (branchChanged || !periodChanged) return;

      const focusedBranch = branchCardsData.find((b) => b.id === activeBranchId);
      const focusedBranchExpenses = focusedBranch
        ? Number(focusedBranch.totalExpenses) || 0
        : 0;

      setTrendLoading(false);
      if (shouldSkipBranchTrendFetch(trendPeriod, focusedBranch, focusedBranchExpenses)) {
        setMonthlyData([]);
        setTopProductsData([]);
        return;
      }

      const hasCachedBranchCharts = applyBranchPrefetchToCharts(activeBranchId, trendPeriod);
      setBranchChartsLoading(!hasCachedBranchCharts);
      void refreshBranchDashboardCharts(activeBranchId, trendPeriod, {
        background: hasCachedBranchCharts,
      });
      return;
    }

    const cached = readAdminDashboardCacheIncludingStale(analyticsCacheKey);
    const cachedTrend = cached?.trendByPeriod?.[trendPeriod];
    if (cachedTrend?.length && hasNonZeroTrendRows(cachedTrend)) {
      setMonthlyData(cachedTrend);
      setTrendLoading(false);
      void loadTrend(true);
      return;
    }
    void loadTrend(true);
  }, [
    activeBranchId,
    analyticsCacheKey,
    applyBranchPrefetchToCharts,
    branchCardsData,
    loadTrend,
    refreshBranchDashboardCharts,
    trendPeriod,
  ]);

  // Branch focus filters charts only — keep all-branch card expenses intact.
  useEffect(() => {
    const prev = prevFocusedBranchIdRef.current;
    if (prev === activeBranchId) return;
    prevFocusedBranchIdRef.current = activeBranchId;

    if (!activeBranchId) {
      topProductsReqIdRef.current += 1;
      setBranchChartsLoading(false);
      if (allBranchesTopProductsRef.current.length > 0) {
        setTopProductsData(allBranchesTopProductsRef.current);
      }
      setTopProductsLoading(false);
      void loadTrend(prev != null);
      return;
    }

    const focusedBranch = branchCardsData.find((b) => b.id === activeBranchId);
    const focusedBranchExpenses = focusedBranch ? getEffectiveBranchTotalExpenses(focusedBranch) : 0;

    setTrendLoading(false);
    setTopProductsLoading(false);
    topProductsReqIdRef.current += 1;

    if (shouldSkipBranchTrendFetch(trendPeriod, focusedBranch, focusedBranchExpenses)) {
      setBranchChartsLoading(false);
      setMonthlyData([]);
      setTopProductsData([]);
      return;
    }

    const hasCachedBranchCharts = applyBranchPrefetchToCharts(activeBranchId, trendPeriod);
    setBranchChartsLoading(!hasCachedBranchCharts);
    void refreshBranchDashboardCharts(activeBranchId, trendPeriod, {
      background: hasCachedBranchCharts,
    });
  }, [
    activeBranchId,
    applyBranchPrefetchToCharts,
    branchCardsData,
    loadTrend,
    refreshBranchDashboardCharts,
    trendPeriod,
  ]);

  useEffect(() => {
    if (!isComparePanelOpen) {
      setIsCompareDateOpen(false);
      return;
    }

    setIsComparePanelLoading(true);
    const timer = window.setTimeout(() => {
      setIsComparePanelLoading(false);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [isComparePanelOpen]);

  const handleBranchCompareToggle = (branchId: number) => {
    const branch = sourceForCompare.find((b) => b.id === branchId);
    if (branch && isExcludedFromAllBranchesView(branch.name)) return;
    setCompareBranchIds((prev) => {
      if (prev.includes(branchId)) {
        return prev.filter((id) => id !== branchId);
      }

      return [...prev, branchId];
    });
  };

  const handleBranchFocus = (branch: BranchPerformanceData) => {
    const isCurrentlyActive = activeBranchId === branch.id;
    if (isCurrentlyActive) {
      setActiveBranchId(null);
      return;
    }
    setActiveBranchId(branch.id);
  };

  const sourceForCompare = branchCardsData.length > 0 ? branchCardsData : performanceData;
  const branchesForCompareList = useMemo(
    () => sortBranchesBySidebarOrder(sourceForCompare, { exclude3core: true }),
    [sourceForCompare],
  );

  useEffect(() => {
    setCompareBranchIds((prev) =>
      prev.filter((id) => {
        const b = sourceForCompare.find((x) => x.id === id);
        return b && !isExcludedFromAllBranchesView(b.name);
      }),
    );
  }, [sourceForCompare]);

  const selectedCompareBranches = compareBranchIds
    .map((id) => branchesForCompareList.find((branch) => branch.id === id))
    .filter((branch): branch is BranchPerformanceData => Boolean(branch));
  const canCompare = selectedCompareBranches.length >= 2;

  // When user focuses a branch card, mirror that branch's totals in the summary row.
  useEffect(() => {
    if (branchCardsData.length === 0) return;

    if (!activeBranchId) {
      const totalSales = branchCardsData.reduce((s, b) => s + (Number(b.totalSales) || 0), 0);
      const totalExpenses = branchCardsData.reduce(
        (s, b) => s + getEffectiveBranchTotalExpenses(b),
        0,
      );
      setSummaryData({
        totalSales,
        totalExpenses,
        totalRevenue: totalSales - totalExpenses,
      });
      return;
    }

    const branch = branchCardsData.find((b) => b.id === activeBranchId);
    if (!branch) return;
    const totalExpenses = getEffectiveBranchTotalExpenses(branch);
    const totalSales = branch.totalSales;
    setSummaryData({
      totalRevenue: totalSales - totalExpenses,
      totalSales,
      totalExpenses,
    });
  }, [activeBranchId, branchCardsData, expenseCategoryByBranch]);

  // Persist latest computed summary for fast subsequent loads.
  useEffect(() => {
    if (!summaryData) return;
    const hasAuthoritativeSource = branchCardsData.length > 0 || dailySalesForCards.length > 0;
    if (!hasAuthoritativeSource) return;
    try {
      localStorage.setItem(summaryCacheKey, JSON.stringify(summaryData));
    } catch {
      // Ignore storage quota / privacy mode errors.
    }
  }, [
    activeBranchId,
    branchCardsData.length,
    dailySalesForCards.length,
    performanceData.length,
    summaryCacheKey,
    summaryData,
  ]);

  const formatCurrency = (value: number) => {
    const safe = Number.isFinite(value) ? Math.trunc(value) : 0;
    return `₱${safe.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const selectedCount = selectedCompareBranches.length;
  const compareStartDate = toDate(compareDateRange.start);
  const compareEndDate = toDate(compareDateRange.end);
  const comparePickerValue: [Date | null, Date | null] = [compareStartDate, compareEndDate];
  const comparePanelWidthClass =
    selectedCount <= 2 ? 'w-[75vw] max-w-5xl' : selectedCount <= 4 ? 'w-[85vw] max-w-6xl' : 'w-[95vw] max-w-[1800px]';
  const compareTitle =
    selectedCount <= 2
      ? selectedCompareBranches.map((branch) => branch.name).join(' vs ')
      : `${selectedCompareBranches.slice(0, 2).map((branch) => branch.name).join(' vs ')} +${selectedCount - 2} more`;
  const benchmarkRows: ComparisonRow[] = [
    {
      id: 'totalSales',
      label: t('admin_dashboard.total_sales'),
      values: selectedCompareBranches.map((branch) => branch.totalSales),
      bestMode: 'max' as const,
    },
    {
      id: 'totalExpenses',
      label: t('admin_dashboard.total_expenses'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const expensesFromBreakdown = branchMap
          ? Object.values(branchMap).reduce((sum, v) => sum + (Number(v) || 0), 0)
          : 0;
        return expensesFromBreakdown || branch.totalExpenses || 0;
      }),
      bestMode: 'min' as const,
    },
    {
      id: 'totalRevenue',
      label: 'Total Profit',
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const expensesFromBreakdown = branchMap
          ? Object.values(branchMap).reduce((sum, v) => sum + (Number(v) || 0), 0)
          : 0;
        const totalExpenses = expensesFromBreakdown || branch.totalExpenses || 0;
        return branch.totalSales - totalExpenses;
      }),
      bestMode: 'max' as const,
    },
  ];

  const unifiedComparisonRows: UnifiedComparisonRow[] = [
    ...benchmarkRows,
    { id: 'section-inventory', rowType: 'section', label: t('admin_dashboard.sections.inventory') },
    {
      id: 'fresh Produce',
      label: t('admin_dashboard.sections.fresh_produce'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'inventory|fresh produce';
        const value = branchMap?.[key];
        return value ?? 0;
      }),
      bestMode: 'min',
    },
    {
      id: 'inv-beverages',
      label: t('admin_dashboard.sections.beverages'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'inventory|beverages';
        const value = branchMap?.[key];
        return value ?? 0;
      }),
      bestMode: 'min',
    },
    {
      id: 'inv-meat',
      label: t('admin_dashboard.sections.meat'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'inventory|meat';
        const value = branchMap?.[key];
        return value ?? 0;
      }),
      bestMode: 'min',
    },
    {
      id: 'inv-seafood',
      label: t('admin_dashboard.sections.seafood'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'inventory|seafood';
        const value = branchMap?.[key];
        return value ?? 0;
      }),
      bestMode: 'min',
    },
    {
      id: 'inv-dreammart',
      label: t('admin_dashboard.sections.dreammart'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'inventory|dreammart';
        const value = branchMap?.[key];
        return value ?? 0;
      }),
      bestMode: 'min',
    },
    {
      id: 'inv-rice',
      label: t('admin_dashboard.sections.rice'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'inventory|rice';
        const value = branchMap?.[key];
        return value ?? 0;
      }),
      bestMode: 'min',
    },
    { id: 'section-maintenance', rowType: 'section', label: t('admin_dashboard.sections.maintenance') },
    {
      id: 'maint-kitchen-equipment',
      label: t('admin_dashboard.sections.kitchen_equipment'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'maintenance|kitchen equipment';
        const value = branchMap?.[key];
        return value ?? branch.totalExpenses * 0.06;
      }),
      bestMode: 'min',
    },
    {
      id: 'maint-supplies',
      label: t('admin_dashboard.sections.supplies'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'maintenance|supplies';
        const value = branchMap?.[key];
        return value ?? branch.totalExpenses * 0.035;
      }),
      bestMode: 'min',
    },
    {
      id: 'maint-repair',
      label: t('admin_dashboard.sections.repair'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'maintenance|repair';
        const value = branchMap?.[key];
        return value ?? branch.totalExpenses * 0.025;
      }),
      bestMode: 'min',
    },
    { id: 'section-utilities-bills', rowType: 'section', label: t('admin_dashboard.sections.utilities_bills') },
    {
      id: 'util-electricty',
      label: t('admin_dashboard.sections.electricity'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'utilities / bills|electricity';
        const value = branchMap?.[key];
        return value ?? branch.totalExpenses * 0.17;
      }),
      bestMode: 'min',
    },
    {
      id: 'util-water',
      label: t('admin_dashboard.sections.water'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'utilities / bills|water';
        const value = branchMap?.[key];
        return value ?? branch.totalExpenses * 0.06;
      }),
      bestMode: 'min',
    },
    {
      id: 'util-internet',
      label: t('admin_dashboard.sections.internet'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'utilities / bills|internet';
        const value = branchMap?.[key];
        return value ?? branch.totalExpenses * 0.05;
      }),
      bestMode: 'min',
    },
    {
      id: 'util-gas',
      label: t('admin_dashboard.sections.gas'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'utilities / bills|gas';
        const value = branchMap?.[key];
        return value ?? branch.totalExpenses * 0.04;
      }),
      bestMode: 'min',
    },
    {
      id: 'util-logistic-air-sea',
      label: t('admin_dashboard.sections.logistic_air_sea'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'utilities / bills|logistic air & sea';
        const value = branchMap?.[key];
        return value ?? branch.totalExpenses * 0.03;
      }),
      bestMode: 'min',
    },
    { id: 'section-salary-rent', rowType: 'section', label: t('admin_dashboard.sections.salary_rent') },
    {
      id: 'salary-rent-salary',
      label: t('admin_dashboard.sections.salary'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'salary & rent|salary';
        const value = branchMap?.[key];
        return value ?? branch.totalExpenses * 0.42;
      }),
      bestMode: 'min',
    },
    {
      id: 'salary-rent-rent',
      label: t('admin_dashboard.sections.rent'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'salary & rent|rent';
        const value = branchMap?.[key];
        return value ?? branch.totalExpenses * 0.2;
      }),
      bestMode: 'min',
    },
    { id: 'section-others', rowType: 'section', label: t('admin_dashboard.sections.others') },
    {
      id: 'others',
      label: t('admin_dashboard.sections.others'),
      values: selectedCompareBranches.map((branch) => {
        const branchMap = expenseCategoryByBranch[branch.id];
        const key = 'others|others';
        const value = branchMap?.[key];
        return value ?? branch.totalExpenses * 0.03;
      }),
      bestMode: 'min',
    },
  ];

  const getEffectiveBranchTotalExpenses = (branch: BranchPerformanceData): number => {
    const branchMap = expenseCategoryByBranch[branch.id];
    if (!branchMap) return branch.totalExpenses;
    const fromBreakdown = Object.values(branchMap).reduce((sum, v) => sum + (Number(v) || 0), 0);
    return fromBreakdown > 0 ? fromBreakdown : branch.totalExpenses;
  };

  const handleCompareDateRangeChange = (update: [Date | null, Date | null] | null) => {
    const [s, e] = update ?? [null, null];
    const nextRange = {
      start: s ? toYYYYMMDD(s) : '',
      end: e ? toYYYYMMDD(e) : '',
    };
    setCompareDateRange(nextRange);
    onDateRangeChange(nextRange);
    if (s && e) setIsCompareDateOpen(false);
  };

  const trendAnchorDate = useMemo(() => {
    // For weekly, the chart is rotated so that the "anchor" day is rightmost.
    // Use same fallback order as the rotation logic.
    return (
      (compareDateRange.end ? new Date(compareDateRange.end) : null) ??
      (compareDateRange.start ? new Date(compareDateRange.start) : null) ??
      new Date()
    );
  }, [compareDateRange.end, compareDateRange.start]);

  const trendFallbackYear = useMemo(() => {
    const base = (compareDateRange.start ? new Date(compareDateRange.start) : null) ?? trendAnchorDate;
    return base.getFullYear();
  }, [compareDateRange.start, trendAnchorDate]);

  const trendRangeStart = useMemo(() => (compareDateRange.start ? new Date(`${compareDateRange.start}T00:00:00`) : null), [
    compareDateRange.start,
  ]);
  const trendRangeEnd = useMemo(() => (compareDateRange.end ? new Date(`${compareDateRange.end}T23:59:59`) : null), [
    compareDateRange.end,
  ]);

  const TrendXAxisTick = useMemo(() => {
    // Recharts tick renderer. Returns SVG nodes.
    const Tick = (props: any) => {
      const { x, y, payload } = props ?? {};
      const label = normalizeTickLabel(payload?.value);

      let jsDay: number | null = null;
      let showMarker = false;

      // Weekly labels: "Mon".."Sun" (or "Today").
      const abbr = label.slice(0, 3);
      if (label === 'Today') {
        jsDay = trendAnchorDate.getDay();
        showMarker = true;
      } else if (WEEKDAY_ABBR_TO_JS_DAY[abbr] != null) {
        jsDay = WEEKDAY_ABBR_TO_JS_DAY[abbr]!;
        showMarker = true;
      } else {
        // Monthly/yearly labels vary by backend. Only color when we can confidently
        // interpret the label as an actual day on the calendar.
        let parsed: Date | null = null;

        // Day-of-month only (e.g. "1", "12", "31") → use anchor month/year.
        if (/^\d{1,2}$/.test(label)) {
          const dayOfMonth = Number(label);
          if (dayOfMonth >= 1 && dayOfMonth <= 31) {
            parsed = new Date(
              trendAnchorDate.getFullYear(),
              trendAnchorDate.getMonth(),
              dayOfMonth,
              12,
              0,
              0,
            );
          }
        } else if (
          // Likely date strings: ISO, has comma year, or "MonName day" formats
          /^\d{4}-\d{2}-\d{2}$/.test(label) ||
          /,\s*\d{4}\s*$/.test(label) ||
          /[A-Za-z]{3,}\s+\d{1,2}/.test(label)
        ) {
          parsed = parseDateFromTickLabel(label, trendFallbackYear);
        }

        // If we have a selected range, require parsed date to fall inside it to avoid
        // accidentally coloring month labels like "Jan", "Feb", etc.
        if (parsed) {
          if (trendRangeStart && parsed < trendRangeStart) parsed = null;
          if (trendRangeEnd && parsed > trendRangeEnd) parsed = null;
        }

        if (parsed) jsDay = parsed.getDay();
      }

      const weekend = jsDay == null ? null : weekendStyleForDay(jsDay);
      const fill = weekend?.fill ?? '#94a3b8';
      // Weekly: always show a dot marker. Color follows the same fill.
      const marker = showMarker ? '●' : '';

      return (
        <g transform={`translate(${x},${y})`}>
          <text x={0} y={0} dy={16} textAnchor="middle" fill={fill} fontSize={12} fontWeight={weekend ? 800 : 500}>
            {marker ? `${marker} ${label}` : label}
          </text>
        </g>
      );
    };

    return Tick;
  }, [trendAnchorDate, trendFallbackYear, trendRangeEnd, trendRangeStart]);

  const TrendTooltipContent = useMemo(() => {
    const Content = (props: any) => {
      const { active, payload, label } = props ?? {};
      if (!active || !payload || payload.length === 0) return null;

      const labelRaw = normalizeTickLabel(label);
      const dataPoint = payload?.[0]?.payload as (MonthlyData & {
        rawTotalSales?: number;
        rawTotalExpenses?: number;
      }) | undefined;

      const parseIso = (iso: string): Date | null => {
        if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
        const d = new Date(`${iso}T12:00:00`);
        return Number.isNaN(d.getTime()) ? null : d;
      };

      let labelText = labelRaw;
      let labelJsDay: number | null = null;

      if (trendPeriod === 'yearly') {
        labelText = labelRaw;
        labelJsDay = null;
      } else if (trendPeriod === 'weekly') {
        const iso = dataPoint?.date;
        const d = iso ? parseIso(iso) : null;
        if (d) {
          labelJsDay = d.getDay();
          labelText = `${d.getDate()} - ${weekdayAbbrFromJsDay(labelJsDay)}`;
        } else {
          // Fallback: if no date, keep label.
          labelText = labelRaw;
        }
      } else {
        // Monthly
        let parsed: Date | null = null;
        if (/^\d{1,2}$/.test(labelRaw)) {
          const dayOfMonth = Number(labelRaw);
          if (dayOfMonth >= 1 && dayOfMonth <= 31) {
            parsed = new Date(trendAnchorDate.getFullYear(), trendAnchorDate.getMonth(), dayOfMonth, 12, 0, 0);
          }
        } else {
          parsed = parseDateFromTickLabel(labelRaw, trendFallbackYear);
        }

        if (parsed && !Number.isNaN(parsed.getTime())) {
          if (trendRangeStart && parsed < trendRangeStart) parsed = null;
          if (trendRangeEnd && parsed > trendRangeEnd) parsed = null;
        }

        if (parsed) {
          labelJsDay = parsed.getDay();
          labelText = `${parsed.getDate()} - ${weekdayAbbrFromJsDay(labelJsDay)}`;
        } else {
          labelText = labelRaw;
        }
      }

      const weekend = labelJsDay == null ? null : weekendStyleForDay(labelJsDay);
      const labelStyle: { color?: string; fontWeight?: number } =
        weekend && trendPeriod !== 'yearly' ? { color: weekend.fill, fontWeight: 800 } : {};

      const getName = (dataKey: string) => {
        if (dataKey === 'totalSales') return t('admin_dashboard.total_sales');
        if (dataKey === 'negativeExpenses') return t('admin_dashboard.total_expenses');
        return dataKey;
      };

      const formatMoney = (v: any) =>
        `₱${Math.trunc(Math.abs(Number(v) || 0)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

      // Always show both series — Recharts omits zero/null bars from payload.
      const tooltipItems = [
        { dataKey: 'totalSales', color: 'rgb(139, 92, 246)', raw: Number(dataPoint?.rawTotalSales ?? 0) },
        { dataKey: 'negativeExpenses', color: 'rgb(245, 158, 11)', raw: Number(dataPoint?.rawTotalExpenses ?? 0) },
      ];

      return (
        <div
          style={{
            background: '#fff',
            borderRadius: '12px',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            padding: '10px 12px',
          }}
        >
          <div style={{ marginBottom: 8, ...labelStyle, fontSize: 12 }}>
            {labelText}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {tooltipItems.map((item, idx) => (
              <div key={`${item.dataKey}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 9999, background: item.color, display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: '#475569', minWidth: 86 }}>{getName(item.dataKey)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{formatMoney(item.raw)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    };

    return Content;
  }, [t, trendAnchorDate, trendFallbackYear, trendPeriod, trendRangeEnd, trendRangeStart]);

  const hasNonZeroTrendData = useMemo(() => hasNonZeroTrendRows(monthlyData), [monthlyData]);

  const trendYScale = useMemo(() => {
    const sales = monthlyData.map((d) => clampFiniteNonNegative(d.totalSales));
    const expenses = monthlyData.map((d) => clampFiniteNonNegative(d.totalExpenses));
    return buildTrendYScale(sales, expenses);
  }, [monthlyData]);

  const trendYTicks = useMemo(() => buildTrendYTicks(), []);

  const TrendYAxisTick = useMemo(() => {
    const SALES_COLOR = 'rgb(139, 92, 246)';
    const EXPENSE_COLOR = 'rgb(245, 158, 11)';
    const Tick = (props: any) => {
      const { x = 0, y = 0, payload } = props ?? {};
      const chartValue = Number(payload?.value);
      if (!Number.isFinite(chartValue)) return null;

      const text = formatTrendYAxisTick(chartValue, trendYScale);
      const fill =
        chartValue > 0 ? SALES_COLOR : chartValue < 0 ? EXPENSE_COLOR : '#94a3b8';

      return (
        <g transform={`translate(${Number(x)},${Number(y)})`}>
          <text
            x={0}
            y={0}
            dy={4}
            textAnchor="end"
            fill={fill}
            fontSize={12}
            fontWeight={chartValue !== 0 ? 600 : 500}
          >
            {text}
          </text>
        </g>
      );
    };
    return Tick;
  }, [trendYScale]);

  const trendChartData = useMemo(() => {
    const { salesMax } = trendYScale;
    return monthlyData.map((d) => {
      const rawSales = clampFiniteNonNegative(d.totalSales);
      const rawExpenses = clampFiniteNonNegative(d.totalExpenses);
      return {
        ...d,
        totalSales: toTrendChartSales(rawSales, salesMax),
        negativeExpenses: toTrendChartExpense(rawExpenses, trendYScale),
        rawTotalSales: rawSales,
        rawTotalExpenses: rawExpenses,
      };
    });
  }, [monthlyData, trendYScale]);

  const renderComparisonTable = (rows: UnifiedComparisonRow[]) => (
    <div className="min-w-[760px] rounded-2xl border border-brand-primary/15 bg-white shadow-sm">
      <div
        className="grid sticky top-0 z-40 bg-white border-b border-brand-primary/20"
        style={{ gridTemplateColumns: `220px repeat(${selectedCount}, minmax(180px, 1fr))` }}
      >
        <div className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-brand-primary border-r border-brand-primary/20">
          {t('admin_dashboard.comparison_metric')}
        </div>
        {selectedCompareBranches.map((branch) => (
          <div key={`head-${branch.id}`} className="px-5 py-4 border-l border-brand-primary/15">
            <p className="text-sm font-semibold text-slate-700">{branch.name}</p>
          </div>
        ))}
      </div>

      <div className="bg-white">
          {rows.map((row) => {
            if (isSectionRow(row)) {
              return (
                <div
                  key={row.id}
                  className="grid border-y border-indigo-200 bg-indigo-500/12"
                  style={{ gridTemplateColumns: `220px repeat(${selectedCount}, minmax(180px, 1fr))` }}
                >
                  <div
                    className="px-5 py-2.5 text-center text-base leading-none font-black uppercase tracking-[0.12em] text-indigo-900"
                    style={{
                      gridColumn: `1 / ${selectedCount + 2}`,
                      fontFamily: '"Arial Black", "Inter", "Segoe UI", sans-serif',
                    }}
                  >
                    {row.label}
                  </div>
                </div>
              );
            }

            const benchmarkValue = row.bestMode === 'max' ? Math.max(...row.values) : Math.min(...row.values);

            return (
              <div
                key={row.id}
                className="grid border-b border-brand-primary/10 last:border-b-0 hover:bg-brand-primary/5 transition-colors duration-200"
                style={{ gridTemplateColumns: `220px repeat(${selectedCount}, minmax(180px, 1fr))` }}
              >
                <div className="px-5 py-4 flex items-center text-sm font-semibold text-slate-700 bg-brand-primary/5 border-r border-brand-primary/10">
                  {row.label}
                </div>
                {row.values.map((value, index) => {
                  const isTop = value === benchmarkValue;
                  return (
                    <div key={`${row.id}-${selectedCompareBranches[index].id}`} className="px-5 py-4 border-l border-brand-primary/10">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`text-sm font-semibold ${isTop ? 'text-brand-primary' : 'text-slate-700'}`}>
                          {formatCurrency(value)}
                        </span>
                        {isTop && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-brand-primary/15 text-brand-primary">
                            {t('admin_dashboard.top')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
      </div>
    </div>
  );

  const hasDashboardContent = branchCardsData.length > 0;
  const isPageLoading = !hasDashboardContent && analyticsLoading;

  return (
    <>
      <AnimatePresence mode="wait">
        {isPageLoading ? (
        <motion.div 
          key="skeleton"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-4 gap-8 pt-6"
        >
          <div className="lg:col-span-3 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
            </div>
            <Skeleton className="h-[500px] rounded-2xl" />
          </div>
          <div className="lg:col-span-1 space-y-3">
            <Skeleton className="h-8 w-48 mb-2 rounded-lg" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        </motion.div>
        ) : (
        <motion.div 
          key="content"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="grid grid-cols-1 lg:grid-cols-4 gap-8 pt-6"
        >
          <div className="lg:col-span-3 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pt-4">
              <SummaryCard
                title={t('admin_dashboard.total_sales')}
                value={
                  summaryData
                    ? `₱${Math.trunc(summaryData.totalSales).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                    : '...'
                }
                icon={TrendingUp}
                color="bg-[rgb(139,92,246)]"
              />
              <SummaryCard
                title={t('admin_dashboard.total_expenses')}
                value={
                  summaryData
                    ? `₱${Math.trunc(summaryData.totalExpenses).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                    : '...'
                }
                icon={TrendingDown}
                color="bg-[rgb(245,158,11)]"
              />
              <SummaryCard
                title="Total Profit"
                value={
                  summaryData
                    ? `₱${Math.trunc(summaryData.totalRevenue).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                    : '...'
                }
                icon={DollarSign}
                color="bg-green-500"
              />
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="text-lg font-bold text-slate-800">
                  {t('admin_dashboard.performance_trend')}
                </h3>

                <div className="inline-flex items-center rounded-2xl bg-slate-50 p-1 border border-slate-200 shadow-sm">
                  <button
                    type="button"
                    aria-pressed={trendPeriod === 'weekly'}
                    onClick={() => setTrendPeriod('weekly')}
                    className={`cursor-pointer px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                      trendPeriod === 'weekly'
                        ? 'bg-white text-brand-primary shadow-sm border-slate-200'
                        : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900 hover:bg-white/70'
                    }`}
                  >
                    Weekly
                  </button>
                  <button
                    type="button"
                    aria-pressed={trendPeriod === 'monthly'}
                    onClick={() => setTrendPeriod('monthly')}
                    className={`cursor-pointer px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                      trendPeriod === 'monthly'
                        ? 'bg-white text-brand-primary shadow-sm border-slate-200'
                        : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900 hover:bg-white/70'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    aria-pressed={trendPeriod === 'yearly'}
                    onClick={() => setTrendPeriod('yearly')}
                    className={`cursor-pointer px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                      trendPeriod === 'yearly'
                        ? 'bg-white text-brand-primary shadow-sm border-slate-200'
                        : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900 hover:bg-white/70'
                    }`}
                  >
                    Yearly
                  </button>
                </div>
              </div>
              <div className="relative w-full min-w-0 h-96 min-h-[384px]">
                {trendLoading && monthlyData.length === 0 ? (
                  <Skeleton className="h-full w-full rounded-xl" />
                ) : trendChartData.length === 0 || !hasNonZeroTrendData ? (
                  activeBranchId && branchChartsLoading ? (
                    <Skeleton className="h-full w-full rounded-xl" />
                  ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-sm text-slate-500">
                    <p>
                      {activeBranchId && focusedBranchName
                        ? t('admin_dashboard.no_branch_revenue_data', { branch: focusedBranchName })
                        : t('admin_dashboard.no_revenue_data')}
                    </p>
                  </div>
                  )
                ) : (
                <>
                <TrendChartContainer className="h-full w-full" minHeight={384} render={({ width, height }) => (
                  <BarChart
                    key={`${activeBranchId || 'all'}-${trendPeriod}`}
                    width={width}
                    height={height}
                    data={trendChartData}
                    margin={{ top: 28, right: 20, left: 8, bottom: 8 }}
                    stackOffset="sign"
                  >
                    <XAxis 
                      dataKey="name" 
                      tick={TrendXAxisTick}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      minTickGap={0}
                    />
                    <YAxis 
                      tick={TrendYAxisTick}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                      domain={trendYScale.domain}
                      ticks={trendYTicks}
                    />
                    <Tooltip 
                      content={TrendTooltipContent}
                      cursor={{ fill: 'transparent' }}
                    />
                    <Legend 
                      iconType="circle" 
                      wrapperStyle={{ paddingTop: '20px' }} 
                      formatter={(value) => <span className="ml-2 mr-8 text-sm font-medium text-slate-600">
                        {value === 'totalSales' ? t('admin_dashboard.total_sales') : 
                         value === 'negativeExpenses' ? t('admin_dashboard.total_expenses') : value}
                      </span>}
                    />
                    <Bar 
                      dataKey="totalSales" 
                      name="totalSales" 
                      fill="rgb(139, 92, 246)" 
                      radius={[6, 6, 0, 0]}
                      barSize={trendPeriod === 'monthly' ? 16 : 32}
                      stackId="stack"
                      isAnimationActive={!trendLoading}
                    />
                    <Bar 
                      dataKey="negativeExpenses" 
                      name="negativeExpenses" 
                      fill="rgb(245, 158, 11)" 
                      radius={[6, 6, 0, 0]}
                      barSize={trendPeriod === 'monthly' ? 16 : 32}
                      stackId="stack"
                      isAnimationActive={!trendLoading}
                    />
                  </BarChart>
                )} />
                {trendLoading && monthlyData.length > 0 && !activeBranchId && (
                  <div
                    className="absolute inset-0 rounded-xl bg-white/50 pointer-events-none"
                    aria-hidden
                  />
                )}
                </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pie Chart: Revenue Distribution (real data) */}
              <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 mb-4">{t('admin_dashboard.revenue_distribution')}</h3>
                <div className="w-full min-w-0 h-72 min-h-[288px]">
                  {analyticsLoading && visibleBranchRevenueDistribution.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <Skeleton className="h-40 w-40 rounded-full" />
                    </div>
                  ) : visibleBranchRevenueDistribution.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-slate-500">
                      {t('admin_dashboard.no_revenue_data')}
                    </div>
                  ) : (
                    <div className="h-full flex items-center gap-4">
                      <div className="w-1/2 space-y-3 max-h-full overflow-y-auto pr-2">
                        {visibleBranchRevenueDistribution.map((entry, index) => {
                          const percentage = totalRevenueDistribution > 0
                            ? (Number(entry.value || 0) / totalRevenueDistribution) * 100
                            : 0;

                          return (
                            <div key={`${entry.name}-${index}`} className="flex items-center gap-2 text-sm text-slate-700">
                              <span
                                className="inline-block h-3 w-3 rounded-full shrink-0"
                                style={{ backgroundColor: REVENUE_DISTRIBUTION_COLORS[index % REVENUE_DISTRIBUTION_COLORS.length] }}
                              />
                              <span className="font-medium text-slate-600 shrink-0">{percentage.toFixed(1)}%</span>
                              <span className="truncate" title={entry.name}>{entry.name}</span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="w-1/2 h-full min-h-[240px]">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                          <PieChart>
                            <Pie
                              data={visibleBranchRevenueDistribution}
                              cx="50%"
                              cy="50%"
                              innerRadius={62}
                              outerRadius={90}
                              fill="#8884d8"
                              paddingAngle={3}
                              dataKey="value"
                              stroke="none"
                            >
                              {visibleBranchRevenueDistribution.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={REVENUE_DISTRIBUTION_COLORS[index % REVENUE_DISTRIBUTION_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value) => `₱${Number(value).toLocaleString()}`}
                              contentStyle={{
                                borderRadius: '12px',
                                border: 'none',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Horizontal Bar Chart: Top Selling Products (real data) */}
              <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 mb-4">{t('admin_dashboard.top_selling_products')}</h3>
                <div className="w-full min-w-0 h-72 min-h-[288px]">
                  {topProductsLoading && topProductsData.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <Skeleton className="h-40 w-full rounded-2xl" />
                    </div>
                  ) : topProductsData.length === 0 ? (
                    activeBranchId && branchChartsLoading ? (
                      <div className="flex items-center justify-center h-full">
                        <Skeleton className="h-40 w-full rounded-2xl" />
                      </div>
                    ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-sm text-slate-500">
                      <p>
                        {activeBranchId && focusedBranchName
                          ? t('admin_dashboard.no_branch_products_data', { branch: focusedBranchName })
                          : t('admin_dashboard.no_products_data')}
                      </p>
                    </div>
                    )
                  ) : (
                    <div className="h-full flex flex-col">
                      <div className="grid grid-cols-[41%_47%_12%] items-center gap-2 px-1 pb-2">
                        <div />
                        <div />
                        <div className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500">qty sold</div>
                      </div>
                      <div className="flex-1 flex flex-col justify-evenly">
                        {topProductsChartData.map((entry) => (
                          <div key={`product-row-${entry.rank}`} className="grid grid-cols-[41%_47%_12%] items-center gap-2">
                            <div className="flex items-center gap-2 text-[15px] text-slate-700 min-w-0">
                              <span className="w-5 shrink-0 text-right text-slate-500 font-medium">{entry.rank}.</span>
                              <span className="truncate" title={entry.name}>{entry.cleanName}</span>
                            </div>
                            <div className="w-full h-6 flex items-center">
                              <div
                                className="h-6 rounded-[8px] transition-all duration-300"
                                style={{
                                  width: `${(Math.max(Number(entry.sales) || 0, 0) / topProductMaxSales) * 100}%`,
                                  backgroundColor: entry.barColor,
                                }}
                              />
                            </div>
                            <div className="text-right text-sm font-semibold text-slate-700 tabular-nums">
                              {Number(entry.sales).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="lg:col-span-1 space-y-4">
            {selectedCompareBranches.length > 0 && (
              <div className="sticky top-4 z-10 bg-slate-50 rounded-xl p-2">
                <button
                  type="button"
                  disabled={!canCompare}
                  onClick={() => {
                    setIsComparePanelOpen(true);
                  }}
                  className="w-full rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-4 transition-all duration-200 hover:bg-brand-primary/90 disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer"
                >
                  {t('admin_dashboard.compare')} ({selectedCompareBranches.length})
                </button>
                <p className="mt-2 text-[11px] text-slate-500 text-center">
                  {t('admin_dashboard.select_branches_to_compare')}
                </p>
              </div>
            )}
            {(() => {
              const hasAnalytics = branchCardsData.length > 0;
              const canUseLegacy = !analyticsLoading && !hasAnalytics && performanceData.length > 0;
              const list = hasAnalytics ? branchCardsData : canUseLegacy ? performanceData : [];
              const orderedList = sortBranchesBySidebarOrder(list, { exclude3core: true });

              if (orderedList.length === 0 && isPageLoading) {
                return (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-56 rounded-2xl" />
                    ))}
                  </div>
                );
              }

              return orderedList.map((branch) => {
                const branchForCard: BranchPerformanceData = {
                  ...branch,
                  totalExpenses: getEffectiveBranchTotalExpenses(branch),
                };

                return (
                  <BranchPerformanceCard
                    key={branch.id}
                    branch={branchForCard}
                    onClick={() => handleBranchFocus(branchForCard)}
                    onMouseEnter={() => void prefetchBranchDashboardData(branch.id, trendPeriodRef.current)}
                      onCompareToggle={() => handleBranchCompareToggle(branch.id)}
                      onTotalSalesClick={() => {
                        setCashReconModalBranch(branchForCard);
                        setCashReconModalOpen(true);
                      }}
                      isSelected={compareBranchIds.includes(branch.id)}
                      isActive={activeBranchId === branch.id}
                  />
                );
              });
            })()}
          </div>
        </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isComparePanelOpen && canCompare && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setIsComparePanelOpen(false)}
            />

            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className={`fixed right-0 top-0 h-screen ${comparePanelWidthClass} bg-white shadow-2xl z-50 border-l border-brand-primary/15`}
            >
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-6 py-5 border-b border-brand-primary/15 bg-white">
                  <div>
                    <h2 className="text-xl font-bold text-brand-primary">{t('admin_dashboard.branch_comparison')}</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      {compareTitle}
                    </p>
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsCompareDateOpen((open) => !open)}
                      className="flex items-center gap-3 bg-brand-primary/[0.04] px-5 py-2.5 rounded-xl shadow-sm border border-brand-primary/20 hover:bg-brand-primary/10 hover:border-brand-primary/40 transition-all cursor-pointer"
                    >
                      <Calendar size={18} className="text-brand-primary" />
                      <span className="text-sm text-slate-700 whitespace-nowrap">
                        {compareDateRange.start && compareDateRange.end
                          ? `${formatDate(compareDateRange.start)} - ${formatDate(compareDateRange.end)}`
                          : t('admin_dashboard.date_range')}
                      </span>
                      <ChevronDown size={16} className="text-brand-primary transition-colors" />
                    </button>

                    {isCompareDateOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-[55]"
                          onClick={() => setIsCompareDateOpen(false)}
                          aria-hidden
                        />
                        <div className="absolute top-full right-0 mt-2 z-[60]">
                          <DatePicker
                            inline
                            selectsRange
                            startDate={comparePickerValue[0]}
                            endDate={comparePickerValue[1]}
                            onChange={handleCompareDateRangeChange}
                            dateFormat="MMM d, yyyy"
                            calendarClassName="react-datepicker-material"
                            isClearable
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="px-6 pb-6 overflow-auto custom-scrollbar space-y-4">
                  {isComparePanelLoading ? (
                    <div className="mt-6 space-y-4">
                      <Skeleton className="h-12 rounded-2xl" />
                      <div className="rounded-2xl border border-brand-primary/15 bg-white p-4 space-y-3">
                        <Skeleton className="h-12 rounded-xl" />
                        {Array.from({ length: 8 }).map((_, i) => (
                          <Skeleton key={i} className="h-12 rounded-lg" />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-6 rounded-2xl border border-brand-primary/20 bg-gradient-to-r from-brand-primary/10 to-indigo-100/70 px-4 py-3 flex items-center justify-between shadow-sm">
                        <p className="text-sm font-semibold text-brand-primary">{t('admin_dashboard.comparison_board')}</p>
                        <p className="text-xs text-slate-600">{t('admin_dashboard.comparison_note')}</p>
                      </div>

                      {renderComparisonTable(unifiedComparisonRows)}
                    </>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <CashReconciliationModal
        open={cashReconModalOpen}
        onClose={() => {
          setCashReconModalOpen(false);
          setCashReconModalBranch(null);
        }}
        onDataChanged={() => {
          const branchId = cashReconModalBranch?.id ?? activeBranchIdRef.current;
          invalidateBranchPrefetch(branchId);
          setAnalyticsReloadKey((k) => k + 1);
        }}
        branchId={cashReconModalBranch != null ? Number(cashReconModalBranch.id) : null}
        branchName={cashReconModalBranch?.name ?? '—'}
        dateRange={{
          start: compareDateRange.start || getCurrentMonthRange().start,
          end: compareDateRange.end || getCurrentMonthRange().end,
        }}
        reportBasis="total"
        reportNetSalesDisplay={formatModalMoney(
          cashReconModalBranch?.reportSalesPos ??
            Math.max(
              0,
              (cashReconModalBranch?.totalSales ?? 0) - (cashReconModalBranch?.reconTotal ?? 0),
            ),
        )}
        cashReconPeriodDisplay={formatModalMoney(cashReconModalBranch?.reconTotal ?? 0)}
        totalNetSalesDisplay={formatModalMoney(cashReconModalBranch?.totalSales ?? 0)}
      />
    </>
  );
};
