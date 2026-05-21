import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type Branch } from '../partials/Header';
import { Skeleton } from '../ui/Skeleton';
import { BranchPerformanceCard, type BranchPerformanceData } from './BranchPerformanceCard';
import { DollarSign, TrendingUp, TrendingDown, Calendar, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  fetchBranchSalesApi,
  fetchTopSellingApi,
  fetchDailySalesApi,
  fetchExpenseSummaryApi,
  type ApiBranchSalesItem,
  type ApiTopSellingItem,
  type ApiDailySalesItem,
  type ApiExpenseSummary,
  fetchExpenseCategoryBreakdownApi,
  type ApiExpenseCategoryRow,
  fetchPerformanceTrendApi,
  type ApiPerformanceTrendRow,
} from '../../services/analyticsService';
import { fetchCashReconciliationAggregates } from '../../services/cashReconciliationService';
import { CashReconciliationModal } from '../analytics/CashReconciliationModal';
import { useUser } from '../../context/UserContext';

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

/**
 * Diverging bars: sales (up) and expenses (down) share tick layout but may use
 * different axis max values. The first expense grid line is 2× the minimum sales
 * at the start of the chart (days 1–7 for monthly).
 */

const TREND_AXIS_TICK_FRACS = [0.4, 0.8, 1] as const;
const TREND_FIRST_TICK_FRAC = TREND_AXIS_TICK_FRACS[0];

const parseTrendDayNumber = (name: unknown): number | null => {
  const n = Number(String(name ?? '').trim());
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
};

/** Minimum positive sales at the left/start of the trend chart. */
const getMinSalesAtGraphStart = (data: MonthlyData[], period: TrendPeriod): number => {
  const positives: number[] = [];

  if (period === 'monthly') {
    for (const row of data) {
      const day = parseTrendDayNumber(row.name);
      if (day != null && day <= 7) {
        const v = clampFiniteNonNegative(row.totalSales);
        if (v > 0) positives.push(v);
      }
    }
  } else {
    const take = period === 'weekly' ? Math.max(1, Math.ceil(data.length / 2)) : Math.min(3, data.length);
    for (const row of data.slice(0, take)) {
      const v = clampFiniteNonNegative(row.totalSales);
      if (v > 0) positives.push(v);
    }
  }

  if (positives.length > 0) return Math.min(...positives);

  const all = data.map((d) => clampFiniteNonNegative(d.totalSales)).filter((v) => v > 0);
  if (all.length > 0) return Math.min(...all);
  return 10_000;
};

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

const formatTrendYAxisTick = (value: number): string => {
  const v = Math.abs(value);
  if (v === 0) return '₱0k';
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return Number.isInteger(m) ? `₱${m}M` : `₱${m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (v >= 1_000) return `₱${Math.round(v / 1_000)}k`;
  return `₱${v}`;
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

/** Gross POS total per day — same basis as Sales Analytics “Total sales” KPI (sum of `total_sales`). */
const sumDailyTotalSales = (items: ApiDailySalesItem[]): number =>
  items.reduce((sum, item) => sum + Number(item.total_sales || 0), 0);

const formatModalMoney = (n: number) =>
  `₱${Math.trunc(Number.isFinite(n) ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ selectedBranch, dateRange, onDateRangeChange }) => {
  const { t } = useTranslation();
  const { user } = useUser();
  const isAdmin = user?.permissions === 1;
  const hasLoggedBranchBreakdownPyRef = useRef(false);
  const analyticsReqIdRef = useRef(0);
  const trendReqIdRef = useRef(0);
  const expenseReqIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [performanceData, setPerformanceData] = useState<BranchPerformanceData[]>([]);
  const [branchCardsData, setBranchCardsData] = useState<BranchPerformanceData[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('monthly');

  const [trendLoading, setTrendLoading] = useState(false);
  const [activeBranchId, setActiveBranchId] = useState<number | null>(null);
  const [compareBranchIds, setCompareBranchIds] = useState<number[]>([]);
  const [isComparePanelOpen, setIsComparePanelOpen] = useState(false);
  const [isComparePanelLoading, setIsComparePanelLoading] = useState(false);
  const [isCompareDateOpen, setIsCompareDateOpen] = useState(false);
  const [compareDateRange, setCompareDateRange] = useState<DateRange>(getCurrentMonthRange);

  // Analytics-based data for pie chart (revenue distribution) and top products
  const [branchRevenueDistribution, setBranchRevenueDistribution] = useState<{ name: string; value: number }[]>([]);
  const [topProductsData, setTopProductsData] = useState<{ name: string; sales: number }[]>([]);
  const [dailySalesForCards, setDailySalesForCards] = useState<ApiDailySalesItem[]>([]);
  const [expenseSummaryTotal, setExpenseSummaryTotal] = useState<number | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [expenseCategoryByBranch, setExpenseCategoryByBranch] = useState<Record<number, Record<string, number>>>({});

  const [cashReconModalOpen, setCashReconModalOpen] = useState(false);
  const [cashReconModalBranch, setCashReconModalBranch] = useState<BranchPerformanceData | null>(null);
  const [analyticsReloadKey, setAnalyticsReloadKey] = useState(0);
  /** Recon sum for all branches in compare range (used when daily-sales is unscoped) */
  const [comparePeriodReconAll, setComparePeriodReconAll] = useState(0);
  const totalRevenueDistribution = useMemo(
    () => branchRevenueDistribution.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [branchRevenueDistribution],
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
  const summaryCacheKey = useMemo(() => {
    const currentRange = getCurrentMonthRange();
    const start = compareDateRange.start || currentRange.start;
    const end = compareDateRange.end || currentRange.end;
    const branchScope = activeBranchId ? String(activeBranchId) : 'all';
    return `${SUMMARY_CACHE_PREFIX}:${branchScope}:${start}:${end}`;
  }, [activeBranchId, compareDateRange.start, compareDateRange.end]);

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        // Fetch in parallel (legacy Node dashboard endpoints)
        const [perfRes] = await Promise.all([
          fetch('/api/admin/branch-performance', {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          }),
        ]);

        const perfJson = await perfRes.json();
        if (perfJson.success) {
          setPerformanceData(perfJson.data.branches);
        }

      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Load performance trend chart from Python analytics (weekly/monthly/yearly)
  useEffect(() => {
    const loadTrend = async () => {
      const reqId = ++trendReqIdRef.current;
      setTrendLoading(true);
      try {
        const currentRange = getCurrentMonthRange();
        const start = compareDateRange.start || currentRange.start;
        const end = compareDateRange.end || currentRange.end;

        const params = new URLSearchParams();
        params.set('period', trendPeriod);
        params.set('start_date', start);
        params.set('end_date', end);
        if (activeBranchId) {
          params.set('branch_id', String(activeBranchId));
        }

        const rows: ApiPerformanceTrendRow[] = await fetchPerformanceTrendApi(params);
        if (reqId !== trendReqIdRef.current) return;

        const weeklyHasCalendarDates =
          trendPeriod === 'weekly' && rows.length > 0 && rows.every((r) => r.sale_date);

        let rowsForChart = rows;
        if (weeklyHasCalendarDates) {
          const wStart = String(rows[0].sale_date).slice(0, 10);
          const wEnd = String(rows[rows.length - 1].sale_date).slice(0, 10);
          try {
            const recon = await fetchCashReconciliationAggregates({
              start: wStart,
              end: wEnd,
              ...(activeBranchId ? { branchId: String(activeBranchId) } : {}),
            });
            if (reqId !== trendReqIdRef.current) return;
            const byDate = recon.byDate && typeof recon.byDate === 'object' ? recon.byDate : {};
            rowsForChart = rows.map((r) => {
              const key = String(r.sale_date).slice(0, 10);
              const extra = Number(byDate[key] ?? 0) || 0;
              return {
                ...r,
                totalSales: Number(r.totalSales || 0) + extra,
              };
            });
          } catch {
            rowsForChart = rows;
          }
        }

        const normalized: MonthlyData[] = rowsForChart.map((r) => ({
          name: r.name,
          totalSales: Number(r.totalSales || 0),
          totalExpenses: Number(r.totalExpenses || 0),
          ...(r.sale_date ? { date: String(r.sale_date).slice(0, 10) } : {}),
        }));

        // Weekly (calendar mode): one bar per real day — already ordered; label last day "Today" when applicable.
        if (trendPeriod === 'weekly' && normalized.length > 0 && normalized.every((d) => d.date)) {
          const lastKey = normalized[normalized.length - 1].date!;
          const anchor = new Date(`${lastKey}T12:00:00`);
          const now = new Date();
          const isAnchorToday =
            anchor.getFullYear() === now.getFullYear() &&
            anchor.getMonth() === now.getMonth() &&
            anchor.getDate() === now.getDate();
          if (isAnchorToday) {
            const copy = [...normalized];
            copy[copy.length - 1] = { ...copy[copy.length - 1], name: 'Today' };
            if (reqId === trendReqIdRef.current) setMonthlyData(copy);
            return;
          }
          if (reqId === trendReqIdRef.current) setMonthlyData(normalized);
          return;
        }

        // Legacy weekly (weekday buckets from older API): rotate so anchor day is last.
        if (trendPeriod === 'weekly' && normalized.length === 7) {
          const anchor =
            (compareDateRange.end ? new Date(compareDateRange.end) : null) ??
            (compareDateRange.start ? new Date(compareDateRange.start) : null) ??
            new Date();

          const jsDay = anchor.getDay(); // 0=Sun..6=Sat
          const todayIdxMon0 = (jsDay + 6) % 7; // 0=Mon..6=Sun
          const startIdx = (todayIdxMon0 + 1) % 7; // start from "tomorrow"
          const rotated = [...normalized.slice(startIdx), ...normalized.slice(0, startIdx)];

          const now = new Date();
          const isAnchorToday =
            anchor.getFullYear() === now.getFullYear() &&
            anchor.getMonth() === now.getMonth() &&
            anchor.getDate() === now.getDate();

          const anchorName = isAnchorToday
            ? 'Today'
            : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][todayIdxMon0] ?? rotated[rotated.length - 1].name;

          // Attach real dates so tooltip & weekend logic match the actual calendar.
          const anchorMidday = new Date(anchor);
          anchorMidday.setHours(12, 0, 0, 0);
          const withDates = rotated.map((row, idx) => {
            const offsetDays = idx - (rotated.length - 1); // last index = anchor day
            const d = new Date(anchorMidday.getFullYear(), anchorMidday.getMonth(), anchorMidday.getDate() + offsetDays, 12, 0, 0);
            return { ...row, date: toYYYYMMDD(d) };
          });

          withDates[withDates.length - 1] = { ...withDates[withDates.length - 1], name: anchorName };
          if (reqId === trendReqIdRef.current) setMonthlyData(withDates);
          return;
        }

        if (reqId === trendReqIdRef.current) setMonthlyData(normalized);
      } catch (error) {
        console.error('[AdminDashboard] Failed to load performance trend:', error);
        if (trendReqIdRef.current) setMonthlyData([]);
      } finally {
        if (trendReqIdRef.current) setTrendLoading(false);
      }
    };

    void loadTrend();
  }, [activeBranchId, compareDateRange.start, compareDateRange.end, trendPeriod]);

  // Keep internal compareDateRange in sync with global dateRange from Header
  useEffect(() => {
    if (dateRange.start || dateRange.end) {
      setCompareDateRange({
        start: dateRange.start,
        end: dateRange.end,
      });
    }
  }, [dateRange.start, dateRange.end]);

  // Load analytics data (branch revenue distribution + top-selling products + daily sales for cards)
  useEffect(() => {
    const loadAnalytics = async () => {
      const reqId = ++analyticsReqIdRef.current;
      setAnalyticsLoading(true);
      try {
        const currentRange = getCurrentMonthRange();
        const start = compareDateRange.start || currentRange.start;
        const end = compareDateRange.end || currentRange.end;

        const analyticsParams = new URLSearchParams();
        analyticsParams.set('start_date', start);
        analyticsParams.set('end_date', end);
        if (activeBranchId) {
          analyticsParams.set('branch_id', String(activeBranchId));
        }

        const branchSalesParams = new URLSearchParams();
        branchSalesParams.set('start_date', start);
        branchSalesParams.set('end_date', end);

        const [branchSales, topSelling, dailySales, expenseBreakdown]: [
          ApiBranchSalesItem[],
          ApiTopSellingItem[],
          ApiDailySalesItem[],
          ApiExpenseCategoryRow[],
        ] = await Promise.all([
          fetchBranchSalesApi(branchSalesParams),
          fetchTopSellingApi(
            new URLSearchParams({
              start_date: start,
              end_date: end,
              ...(activeBranchId ? { branch_id: String(activeBranchId) } : {}),
              limit: '5',
            } as any),
          ),
          fetchDailySalesApi(analyticsParams),
          (() => {
            const breakdownParams = new URLSearchParams();
            breakdownParams.set('start_date', start);
            breakdownParams.set('end_date', end);
            if (activeBranchId) {
              breakdownParams.set('branch_id', String(activeBranchId));
            }
            return fetchExpenseCategoryBreakdownApi(breakdownParams);
          })(),
        ]);
        if (reqId !== analyticsReqIdRef.current) return;

        if (expenseBreakdown && expenseBreakdown.length > 0) {
          const map: Record<number, Record<string, number>> = {};
          const makeKey = (cat: string, name: string) =>
            `${cat.trim().toLowerCase()}|${name.trim().toLowerCase()}`;

          for (const row of expenseBreakdown) {
            const bid = Number(row.branch_id);
            if (!Number.isFinite(bid)) continue;
            if (!map[bid]) map[bid] = {};
            const key = makeKey(row.exp_cat, row.exp_name);
            map[bid][key] = (map[bid][key] || 0) + Number(row.total_amount || 0);
          }
          setExpenseCategoryByBranch(map);
        } else {
          setExpenseCategoryByBranch({});
        }

        // Build real per-branch cards data from Python analytics (sales + expenses)
        if (branchSales.length > 0) {
          const cards = await Promise.all(
            branchSales.map(async (b) => {
              const baseParams = {
                branch_id: String(b.branch_id),
                start_date: start,
                end_date: end,
              };
              const expenseParams = new URLSearchParams(baseParams);
              const dailyParams = new URLSearchParams(baseParams);
              try {
                const [expenseSummary, branchDailySales, reconAgg] = await Promise.all([
                  fetchExpenseSummaryApi(expenseParams),
                  fetchDailySalesApi(dailyParams),
                  fetchCashReconciliationAggregates({
                    start,
                    end,
                    branchId: String(b.branch_id),
                  }).catch(() => ({ total: 0, byDate: {} as Record<string, number> })),
                ]);

                const reportGross = sumDailyTotalSales(branchDailySales);
                const reconTotal = Number(reconAgg.total) || 0;
                const posBase = reportGross > 0 ? reportGross : Number(b.total_sales || 0);
                const totalSales = posBase + reconTotal;

                return {
                  id: b.branch_id,
                  name: b.branch_name,
                  totalSales,
                  reportSalesPos: posBase,
                  reconTotal,
                  totalExpenses: expenseSummary.total_expense,
                  totalOrders: b.order_count,
                } as BranchPerformanceData;
              } catch (err: any) {
                let reconFallback = 0;
                try {
                  const r = await fetchCashReconciliationAggregates({
                    start,
                    end,
                    branchId: String(b.branch_id),
                  }).catch(() => ({ total: 0 }));
                  reconFallback = Number(r.total) || 0;
                } catch {
                  reconFallback = 0;
                }
                const ts = Number(b.total_sales || 0) + reconFallback;
                return {
                  id: b.branch_id,
                  name: b.branch_name,
                  totalSales: ts,
                  reportSalesPos: Number(b.total_sales || 0),
                  reconTotal: reconFallback,
                  totalExpenses: 0,
                  totalOrders: b.order_count,
                } as BranchPerformanceData;
              }
            }),
          );
          if (reqId !== analyticsReqIdRef.current) return;

          setBranchCardsData(cards);

          if (!hasLoggedBranchBreakdownPyRef.current) {
            hasLoggedBranchBreakdownPyRef.current = true;
            // eslint-disable-next-line no-console
            console.log(
              '[AdminDashboard] branch breakdown (py)',
              cards.map((c) => ({
                id: c.id,
                name: c.name,
                total_sales_py: c.totalSales,
                total_expense_py: c.totalExpenses,
              })),
            );
          }
        }

        setBranchRevenueDistribution(
          branchSales.map((b) => ({
            name: b.branch_name,
            value: b.total_sales,
          })),
        );

        setTopProductsData(
          topSelling.map((item) => ({
            name: item.MENU_NAME,
            sales: item.total_quantity,
          })),
        );

        setDailySalesForCards(dailySales);

        try {
          const allRecon = await fetchCashReconciliationAggregates({ start, end });
          if (reqId === analyticsReqIdRef.current) setComparePeriodReconAll(Number(allRecon.total) || 0);
        } catch {
          if (reqId === analyticsReqIdRef.current) setComparePeriodReconAll(0);
        }
      } catch (error) {
        if (reqId !== analyticsReqIdRef.current) return;
        console.error('Failed to load dashboard analytics data:', error);
        setBranchRevenueDistribution([]);
        setTopProductsData([]);
        setDailySalesForCards([]);
        setComparePeriodReconAll(0);
      } finally {
        if (reqId === analyticsReqIdRef.current) setAnalyticsLoading(false);
      }
    };

    void loadAnalytics();
  }, [activeBranchId, compareDateRange.start, compareDateRange.end, analyticsReloadKey]);

  // Load expense summary from Python analytics (expense-summary)
  useEffect(() => {
    const loadExpensesFromPython = async () => {
      const reqId = ++expenseReqIdRef.current;
      try {
        const params = new URLSearchParams();
        if (activeBranchId && Number.isFinite(activeBranchId)) {
          params.set('branch_id', String(activeBranchId));
        }
        // Respect global/compare date range like SalesAnalytics
        if (compareDateRange.start) params.set('start_date', compareDateRange.start);
        if (compareDateRange.end) params.set('end_date', compareDateRange.end);

        const summary: ApiExpenseSummary = await fetchExpenseSummaryApi(params);
        if (reqId === expenseReqIdRef.current) setExpenseSummaryTotal(summary.total_expense);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading expense summary from Python analytics:', error);
        if (reqId === expenseReqIdRef.current) setExpenseSummaryTotal(null);
      }
    };

    void loadExpensesFromPython();
  }, [activeBranchId, isAdmin, compareDateRange.start, compareDateRange.end]);

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

  const selectedCompareBranches = compareBranchIds
    .map((id) => sourceForCompare.find((branch) => branch.id === id))
    .filter((branch): branch is BranchPerformanceData => Boolean(branch));
  const canCompare = selectedCompareBranches.length >= 2;

  // Recompute summary cards (total revenue, sales, expenses)
  useEffect(() => {
    // If a specific branch is focused, mirror that branch card exactly (per-branch view).
    if (activeBranchId && branchCardsData.length > 0) {
      const source = branchCardsData;
      const branch = source.find((b) => b.id === activeBranchId);
      if (!branch) {
        return;
      }
      const totalExpenses = getEffectiveBranchTotalExpenses(branch);
      const totalSales = branch.totalSales;
      const totalRevenue = totalSales - totalExpenses;
      setSummaryData({
        totalRevenue,
        totalSales,
        totalExpenses,
      });
      return;
    }

    // While analytics calls are in-flight, keep the previous summary (or cache) to avoid flashing mismatched values.
    if (analyticsLoading) {
      return;
    }

    // Aggregated (no focused branch): match branch cards when available (net + recon per branch).
    if (!activeBranchId && branchCardsData.length > 0) {
      const totalSales = branchCardsData.reduce((s, b) => s + b.totalSales, 0);
      const totalExpenses = expenseSummaryTotal ?? 0;
      setSummaryData({
        totalRevenue: totalSales - totalExpenses,
        totalSales,
        totalExpenses,
      });
      return;
    }

    // Fallback: daily gross + period recon (all branches)
    if (dailySalesForCards && dailySalesForCards.length > 0) {
      const grossFromDaily = sumDailyTotalSales(dailySalesForCards || []);
      const totalSales = grossFromDaily + (comparePeriodReconAll || 0);
      const totalExpenses = expenseSummaryTotal ?? 0;
      const totalRevenue = totalSales - totalExpenses;

      setSummaryData({
        totalRevenue,
        totalSales,
        totalExpenses,
      });
      return;
    }

    // Last-resort fallback (only when analytics is not loading and returned nothing): use legacy performance totals.
    if (performanceData.length > 0) {
      const totalSales = performanceData.reduce((s, b) => s + Number(b.totalSales || 0), 0);
      const totalExpensesFromPerf = performanceData.reduce((s, b) => s + Number(b.totalExpenses || 0), 0);
      const totalExpenses = expenseSummaryTotal ?? totalExpensesFromPerf;
      setSummaryData({
        totalRevenue: totalSales - totalExpenses,
        totalSales,
        totalExpenses,
      });
      return;
    }

    if (expenseSummaryTotal == null) setSummaryData(null);
  }, [
    activeBranchId,
    analyticsLoading,
    branchCardsData,
    performanceData,
    dailySalesForCards,
    expenseSummaryTotal,
    comparePeriodReconAll,
  ]);

  // Instant first paint: use last known-good summary for same branch/date scope.
  useEffect(() => {
    if (summaryData) return;
    try {
      const raw = localStorage.getItem(summaryCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SummaryData> | null;
      if (!parsed) return;
      const totalSales = Number(parsed.totalSales);
      const totalExpenses = Number(parsed.totalExpenses);
      const totalRevenue = Number(parsed.totalRevenue);
      if (![totalSales, totalExpenses, totalRevenue].every(Number.isFinite)) return;
      setSummaryData({ totalSales, totalExpenses, totalRevenue });
    } catch {
      // Ignore cache parse issues.
    }
  }, [summaryCacheKey, summaryData]);

  // Persist latest computed summary for fast subsequent loads.
  useEffect(() => {
    if (!summaryData) return;
    // Persist only when summary comes from authoritative sources.
    // Do not cache temporary fallback values from legacy/perf-only snapshots.
    const hasAuthoritativeSource = Boolean(
      (activeBranchId && (branchCardsData.length > 0 || performanceData.length > 0)) ||
      (!activeBranchId && (branchCardsData.length > 0 || dailySalesForCards.length > 0))
    );
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
    return fromBreakdown || branch.totalExpenses;
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

      const sorted = [...payload].sort((a, b) => (a?.dataKey === 'totalSales' ? -1 : b?.dataKey === 'totalSales' ? 1 : 0));

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
            {sorted.map((item: any, idx: number) => {
              const color = item?.color || '#64748b';
              const name = getName(String(item?.dataKey ?? item?.name ?? ''));
              // Show the real amount (axis ticks are also rendered as real amounts).
              const dataKey = String(item?.dataKey ?? item?.name ?? '');
              const raw =
                dataKey === 'totalSales'
                  ? Number(dataPoint?.rawTotalSales ?? 0)
                  : dataKey === 'negativeExpenses'
                    ? Number(dataPoint?.rawTotalExpenses ?? 0)
                    : Number(item?.value ?? 0);
              const valueText = formatMoney(raw);
              return (
                <div key={`${item?.dataKey ?? item?.name}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 9999, background: color, display: 'inline-block' }} />
                  <span style={{ fontSize: 12, color: '#475569', minWidth: 86 }}>{name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{valueText}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return Content;
  }, [t, trendAnchorDate, trendFallbackYear, trendPeriod, trendRangeEnd, trendRangeStart]);

  const trendChartScale = useMemo(() => {
    const salesValues = monthlyData.map((d) => clampFiniteNonNegative(d.totalSales));
    const expenseValues = monthlyData.map((d) => clampFiniteNonNegative(d.totalExpenses));
    const salesMax = salesValues.reduce((m, v) => Math.max(m, v), 0);
    const expensesMax = expenseValues.reduce((m, v) => Math.max(m, v), 0);

    const minSalesAtStart = getMinSalesAtGraphStart(monthlyData, trendPeriod);
    // First expense tick (e.g. ₱240k) = 2 × minimum sales at graph start (e.g. ₱120k min).
    const expenseStartAmount = 2 * minSalesAtStart;
    const expenseAxisFromStart = expenseStartAmount / TREND_FIRST_TICK_FRAC;

    const salesAxisMax = buildNiceMax(salesMax);
    const expensesAxisMax = buildNiceMax(Math.max(expensesMax, expenseAxisFromStart));

    const posTicksScaled = [...TREND_AXIS_TICK_FRACS];
    const negTicksScaled = TREND_AXIS_TICK_FRACS.slice().reverse().map((f) => -f);
    const ticksScaled = [...negTicksScaled, 0, ...posTicksScaled];
    return {
      salesAxisMax,
      expensesAxisMax,
      ticksScaled,
      domainScaled: [-1.08, 1.08] as [number, number],
    };
  }, [monthlyData, trendPeriod]);

  const trendChartData = useMemo(() => {
    const salesDen = trendChartScale.salesAxisMax || 1;
    const expensesDen = trendChartScale.expensesAxisMax || 1;
    return monthlyData.map((d) => {
      const rawSales = clampFiniteNonNegative(d.totalSales);
      const rawExpenses = clampFiniteNonNegative(d.totalExpenses);
      return {
        ...d,
        totalSales: rawSales / salesDen,
        negativeExpenses: -(rawExpenses / expensesDen),
        rawTotalSales: rawSales,
        rawTotalExpenses: rawExpenses,
      };
    });
  }, [monthlyData, trendChartScale.expensesAxisMax, trendChartScale.salesAxisMax]);

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

  return (
    <>
      <AnimatePresence mode="wait">
        {loading ? (
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
              <div className="w-full min-w-0 h-96 min-h-[384px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={384}>
                  <BarChart
                    key={`${activeBranchId || 'all'}-${trendPeriod}`}
                    data={trendChartData}
                    margin={{ top: 30, right: 20, left: 10, bottom: 5 }}
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
                      tick={{ fontSize: 12, fill: '#94a3b8' }} 
                      tickFormatter={(scaled) => {
                        const s = Number(scaled);
                        if (!Number.isFinite(s) || s === 0) return formatTrendYAxisTick(0);
                        const axisMax = s > 0 ? trendChartScale.salesAxisMax : trendChartScale.expensesAxisMax;
                        return formatTrendYAxisTick(s * axisMax);
                      }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      domain={trendChartScale.domainScaled}
                      ticks={trendChartScale.ticksScaled}
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
                    />
                    <Bar 
                      dataKey="negativeExpenses" 
                      name="negativeExpenses" 
                      fill="rgb(245, 158, 11)" 
                      radius={[6, 6, 0, 0]}
                      barSize={trendPeriod === 'monthly' ? 16 : 32}
                      stackId="stack"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pie Chart: Revenue Distribution (real data) */}
              <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 mb-4">{t('admin_dashboard.revenue_distribution')}</h3>
                <div className="w-full min-w-0 h-72 min-h-[288px]">
                  {analyticsLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Skeleton className="h-40 w-40 rounded-full" />
                    </div>
                  ) : branchRevenueDistribution.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-slate-500">
                      {t('admin_dashboard.no_revenue_data')}
                    </div>
                  ) : (
                    <div className="h-full flex items-center gap-4">
                      <div className="w-1/2 space-y-3 max-h-full overflow-y-auto pr-2">
                        {branchRevenueDistribution.map((entry, index) => {
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
                              data={branchRevenueDistribution}
                              cx="50%"
                              cy="50%"
                              innerRadius={62}
                              outerRadius={90}
                              fill="#8884d8"
                              paddingAngle={3}
                              dataKey="value"
                              stroke="none"
                            >
                              {branchRevenueDistribution.map((entry, index) => (
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
                  {analyticsLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Skeleton className="h-40 w-full rounded-2xl" />
                    </div>
                  ) : topProductsData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-slate-500">
                      {t('admin_dashboard.no_products_data')}
                    </div>
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

              if (list.length === 0 && (analyticsLoading || loading)) {
                return (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-56 rounded-2xl" />
                    ))}
                  </div>
                );
              }

              return list
              .slice()
              .sort((a, b) => {
                const aExpenses = getEffectiveBranchTotalExpenses(a);
                const bExpenses = getEffectiveBranchTotalExpenses(b);
                return (b.totalSales - bExpenses) - (a.totalSales - aExpenses);
              })
              .map((branch) => (
                (() => {
                  const effectiveExpenses = getEffectiveBranchTotalExpenses(branch);
                  let branchForCard: BranchPerformanceData = {
                    ...branch,
                    totalExpenses: effectiveExpenses,
                  };

                  // If this branch is currently focused, mirror the top summary cards (total sales & revenue).
                  if (activeBranchId === branch.id && summaryData) {
                    branchForCard = {
                      ...branchForCard,
                      totalSales: summaryData.totalSales,
                      totalExpenses: summaryData.totalExpenses,
                    };
                  }

                  return (
                    <BranchPerformanceCard
                      key={branch.id}
                      branch={branchForCard}
                      onClick={() => handleBranchFocus(branchForCard)}
                      onCompareToggle={() => handleBranchCompareToggle(branch.id)}
                      onTotalSalesClick={() => {
                        setCashReconModalBranch(branchForCard);
                        setCashReconModalOpen(true);
                      }}
                      isSelected={compareBranchIds.includes(branch.id)}
                      isActive={activeBranchId === branch.id}
                    />
                  );
                })()
              ));
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
          setAnalyticsReloadKey((k) => k + 1);
        }}
        onDataChanged={() => setAnalyticsReloadKey((k) => k + 1)}
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
