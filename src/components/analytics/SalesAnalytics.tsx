import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, Store, TrendingDown, Loader2, AlertCircle } from 'lucide-react';
import { type Branch } from '../partials/Header';
import { Skeleton } from '../ui/Skeleton';
import {
  fetchBranchSalesApi,
  fetchLeastSellingApi,
  fetchDailySalesApi,
  type ApiBranchSalesItem,
  type ApiLeastSellingItem,
  type ApiDailySalesItem,
} from '../../services/analyticsService';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

/** Measures container and renders chart with explicit width/height to avoid Recharts -1 warning */
function ChartContainer({
  className = '',
  minHeight = 200,
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

type SalesAnalyticsProps = {
  selectedBranch: Branch | null;
  dateRange: {
    start: string;
    end: string;
  };
};

type MetricKey = 'totalSales' | 'refund' | 'discount' | 'netSales' | 'grossProfit';
type ChartType = 'bar chart' | 'line graph';
type ViewMode = 'glance' | 'week';

type InlineDropdownProps<T extends string> = {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  formatOption?: (value: T) => string;
};

// API data types
// API types now imported from analyticsService

function getToken() {
  return localStorage.getItem('token') || '';
}

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

function InlineDropdown<T extends string>({ value, options, onChange, formatOption }: InlineDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 border-b border-gray-200 px-2 py-1 text-sm text-brand-muted hover:text-brand-text transition-colors"
      >
        <span>{formatOption ? formatOption(value) : value}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-[130px] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg z-20">
          {options.map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${option === value ? 'bg-brand-primary text-white' : 'text-brand-text hover:bg-gray-50'
                }`}
            >
              {formatOption ? formatOption(option) : option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const parseDateSafe = (value: string) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

const money = (value: number) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
const moneyTooltip = (value: number) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const CHART_THEME_COLOR = 'rgb(139, 92, 246)';

const BRANCH_BAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];



export const SalesAnalytics: React.FC<SalesAnalyticsProps> = ({ selectedBranch, dateRange }) => {
  const { t } = useTranslation();
  const isAllBranch = !selectedBranch || String(selectedBranch.id) === 'all';
  const [activeMetric, setActiveMetric] = useState<MetricKey>('totalSales');
  const [chartType, setChartType] = useState<ChartType>('bar chart');
  const [viewMode, setViewMode] = useState<ViewMode>('glance');
  const [tablePage, setTablePage] = useState(0);

  // API data state for the two new cards
  const [branchSalesData, setBranchSalesData] = useState<ApiBranchSalesItem[]>([]);
  const [branchSalesLoading, setBranchSalesLoading] = useState(false);
  const [branchSalesError, setBranchSalesError] = useState<string | null>(null);

  const [leastSellingData, setLeastSellingData] = useState<ApiLeastSellingItem[]>([]);
  const [leastSellingLoading, setLeastSellingLoading] = useState(false);
  const [leastSellingError, setLeastSellingError] = useState<string | null>(null);

  const [dailySalesCurrent, setDailySalesCurrent] = useState<ApiDailySalesItem[]>([]);
  const [dailySalesPrevious, setDailySalesPrevious] = useState<ApiDailySalesItem[]>([]);
  const [dailySalesLoading, setDailySalesLoading] = useState(false);
  const [dailySalesError, setDailySalesError] = useState<string | null>(null);

  const trendData = useMemo(() => {
    const baseData =
      dailySalesCurrent.length > 0
        ? dailySalesCurrent.map((item) => {
            const parsed = parseDateSafe(item.sale_date);
            const label = parsed ? formatDateLabel(parsed) : item.sale_date;
            const tableDate = parsed
              ? parsed.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
              : item.sale_date;
            return {
              label,
              tableDate,
              sales: item.total_sales,
              refund: (item as any).refund ?? 0,
              discount: (item as any).discount ?? 0,
              netSales: (item as any).net_sales ?? item.total_sales,
              grossProfit: (item as any).gross_profit ?? (item as any).net_sales ?? item.total_sales,
            };
          })
        : [];

    // Loyverse-style computation: Net sales = Total sales - Refund - Discount; Gross profit = Net sales
    const withMetrics = baseData.map((row) => {
      const totalSales = Number(row.sales || 0);
      const refund = Number(row.refund || 0);
      const discount = Number(row.discount || 0);
      const netSales = Math.max(0, totalSales - refund - discount);
      const grossProfit = netSales;
      return {
        label: row.label,
        tableDate: row.tableDate,
        totalSales,
        refund,
        discount,
        netSales,
        grossProfit,
      };
    });

    return withMetrics;
  }, [dailySalesCurrent]);

  useEffect(() => { setTablePage(0); }, [dateRange.start, dateRange.end, selectedBranch?.id, activeMetric]);

  // Fetch sales per branch data (real data from backend)
  const fetchBranchSales = useCallback(async () => {
    setBranchSalesLoading(true);
    setBranchSalesError(null);
    try {
      const params = new URLSearchParams();
      if (dateRange.start) params.set('start_date', dateRange.start);
      if (dateRange.end) params.set('end_date', dateRange.end);
      if (!isAllBranch && selectedBranch?.id) params.set('branch_id', String(selectedBranch.id));

      const rawData = await fetchBranchSalesApi(params);
      setBranchSalesData(rawData);
    } catch (err) {
      console.error(err);
      setBranchSalesError(t('sales_analytics.network_error'));
    } finally {
      setBranchSalesLoading(false);
    }
  }, [dateRange.start, dateRange.end, isAllBranch, selectedBranch?.id]);

  // Compute previous-period date range for comparison (same length immediately before current range)
  const previousRange = useMemo(() => {
    const start = parseDateSafe(dateRange.start);
    const end = parseDateSafe(dateRange.end);
    if (!start || !end || start > end) {
      return { previousStart: null as string | null, previousEnd: null as string | null };
    }
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (days - 1));

    const toIso = (d: Date) => d.toISOString().slice(0, 10);
    return { previousStart: toIso(prevStart), previousEnd: toIso(prevEnd) };
  }, [dateRange.start, dateRange.end]);

  // Fetch daily sales data for main chart/stat cards (current + previous period)
  const fetchDailySales = useCallback(async () => {
    setDailySalesLoading(true);
    setDailySalesError(null);
    try {
      const hasRange = dateRange.start && dateRange.end;
      if (!hasRange) {
        setDailySalesCurrent([]);
        setDailySalesPrevious([]);
        return;
      }

      const paramsCurrent = new URLSearchParams();
      paramsCurrent.set('start_date', dateRange.start);
      paramsCurrent.set('end_date', dateRange.end);
      if (!isAllBranch && selectedBranch?.id) paramsCurrent.set('branch_id', String(selectedBranch.id));

      const { previousStart, previousEnd } = previousRange;
      let paramsPrevious: URLSearchParams | null = null;
      if (previousStart && previousEnd) {
        paramsPrevious = new URLSearchParams();
        paramsPrevious.set('start_date', previousStart);
        paramsPrevious.set('end_date', previousEnd);
        if (!isAllBranch && selectedBranch?.id) paramsPrevious.set('branch_id', String(selectedBranch.id));
      }

      const [currentData, prevData] = await Promise.all([
        fetchDailySalesApi(paramsCurrent),
        paramsPrevious ? fetchDailySalesApi(paramsPrevious) : Promise.resolve([]),
      ]);

      setDailySalesCurrent(currentData);
      setDailySalesPrevious(prevData);
    } catch (err) {
      console.error(err);
      setDailySalesError(t('sales_analytics.network_error'));
      setDailySalesCurrent([]);
      setDailySalesPrevious([]);
    } finally {
      setDailySalesLoading(false);
    }
  }, [dateRange.start, dateRange.end, isAllBranch, selectedBranch?.id, previousRange, t]);

  // Fetch least selling items (uses real data; shows empty state when none)
  const fetchLeastSelling = useCallback(async () => {
    setLeastSellingLoading(true);
    setLeastSellingError(null);
    try {
      const params = new URLSearchParams();
      if (dateRange.start) params.set('start_date', dateRange.start);
      if (dateRange.end) params.set('end_date', dateRange.end);
      if (!isAllBranch && selectedBranch?.id) params.set('branch_id', String(selectedBranch.id));
      params.set('limit', '5');

      const apiData = await fetchLeastSellingApi(params);
      setLeastSellingData(apiData);
    } catch (err) {
      console.error(err);
      setLeastSellingError(t('sales_analytics.network_error'));
      setLeastSellingData([]);
    } finally {
      setLeastSellingLoading(false);
    }
  }, [dateRange.start, dateRange.end, isAllBranch, selectedBranch?.id, t]);

  useEffect(() => { fetchBranchSales(); }, [fetchBranchSales]);
  useEffect(() => { fetchLeastSelling(); }, [fetchLeastSelling]);
  useEffect(() => { fetchDailySales(); }, [fetchDailySales]);

  const chartPointCount = trendData.length;
  const responsiveBarSize = useMemo(() => {
    if (chartPointCount <= 2) return 180;
    if (chartPointCount <= 4) return 120;
    if (chartPointCount <= 7) return 72;
    if (chartPointCount <= 14) return 42;
    if (chartPointCount <= 31) return 24;
    if (chartPointCount <= 62) return 16;
    return 10;
  }, [chartPointCount]);
  const responsiveBarCategoryGap = useMemo(() => {
    if (chartPointCount <= 2) return '0%';
    if (chartPointCount <= 4) return '4%';
    if (chartPointCount <= 7) return '8%';
    if (chartPointCount <= 14) return '12%';
    return '18%';
  }, [chartPointCount]);
  const responsiveXAxisInterval = useMemo(() => {
    if (chartPointCount <= 14) return 0;
    if (chartPointCount <= 31) return 1;
    if (chartPointCount <= 62) return 3;
    return 6;
  }, [chartPointCount]);
  const useSlantedXAxisLabels = chartPointCount > 31;
  const responsiveXAxisAngle: 0 | -35 = useSlantedXAxisLabels ? -35 : 0;
  const responsiveXAxisTextAnchor: 'middle' | 'end' = useSlantedXAxisLabels ? 'end' : 'middle';
  const responsiveXAxisHeight = useSlantedXAxisLabels ? 72 : 48;
  const responsiveXAxisTickMargin = useSlantedXAxisLabels ? 12 : 8;

  const salesTableRows = useMemo(
    () =>
      [...trendData]
        .slice()
        .reverse()
        .map((row) => ({
          date: row.tableDate,
          totalSales: row.totalSales,
          refund: row.refund,
          discount: row.discount,
          netSales: row.netSales,
          productUnitPrice: 0,
          grossProfit: row.grossProfit,
        })),
    [trendData]
  );
  const TABLE_PAGE_SIZE = 10;
  const totalTablePages = Math.max(1, Math.ceil(salesTableRows.length / TABLE_PAGE_SIZE));
  const safeTablePage = Math.min(tablePage, totalTablePages - 1);
  const pagedTableRows = salesTableRows.slice(
    safeTablePage * TABLE_PAGE_SIZE,
    safeTablePage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE
  );

  const baseSales = useMemo(
    () => trendData.reduce((sum, row) => sum + row.totalSales, 0),
    [trendData]
  );

  const baseSalesPrevious = useMemo(
    () =>
      dailySalesPrevious.reduce((sum, item) => {
        return sum + (Number(item.total_sales) || 0);
      }, 0),
    [dailySalesPrevious]
  );

const metricConfig = {
  totalSales: { positiveIsGood: true },
  refund: { positiveIsGood: false },
  discount: { positiveIsGood: true },
  netSales: { positiveIsGood: true },
  grossProfit: { positiveIsGood: true },
} as const;
  const topStatItems = useMemo(() => {
    const makeItem = (key: MetricKey, label: string) => {
      const cfg = metricConfig[key];
      // Aggregate totals from daily series (current vs previous period)
      const aggregateMetric = (items: ApiDailySalesItem[], metricKey: MetricKey) => {
        return items.reduce((sum, item) => {
          switch (metricKey) {
            case 'totalSales':
              return sum + (Number(item.total_sales) || 0);
            case 'refund':
              return sum + (Number((item as any).refund ?? 0) || 0);
            case 'discount':
              return sum + (Number((item as any).discount ?? 0) || 0);
            case 'netSales':
              return sum + (Number((item as any).net_sales ?? 0) || 0);
            case 'grossProfit':
              return sum + (Number((item as any).gross_profit ?? 0) || 0);
            default:
              return sum;
          }
        }, 0);
      };

      const current = aggregateMetric(dailySalesCurrent, key);
      const previous = aggregateMetric(dailySalesPrevious, key);
      const diff = current - previous;
      const hasPrev = previous > 0;
      const percent = hasPrev ? (diff / previous) * 100 : 0;
      const isIncrease = diff >= 0;
      const positive = cfg.positiveIsGood ? isIncrease : !isIncrease;
      const sign = diff >= 0 ? '+' : '-';
      const absDiff = Math.abs(diff);
      const absPercent = Math.abs(percent);
      const delta = `${sign}${money(absDiff)} (${absPercent.toFixed(2)}%)`;

      return {
        key,
        label,
        value: money(current),
        delta,
        positive,
      } as const;
    };

    return [
      makeItem('totalSales', t('sales_analytics.total_sales')),
      makeItem('refund', t('sales_analytics.refund')),
      makeItem('discount', t('sales_analytics.discount')),
      makeItem('netSales', t('sales_analytics.net_sales')),
      makeItem('grossProfit', t('sales_analytics.gross_profit')),
    ];
  }, [baseSales, baseSalesPrevious, metricConfig, t]);
  const activeMetricLabel = topStatItems.find((item) => item.key === activeMetric)?.label || t('sales_analytics.total_sales');
  const LoyverseTooltip: React.FC<{
    active?: boolean;
    payload?: { value: number }[];
    label?: string;
  }> = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const rawValue = Number(payload[0]?.value ?? 0);
    return (
      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-[0_4px_14px_rgba(15,23,42,0.16)]">
        {label && (
          <div className="mb-0.5 text-[11px] font-medium text-slate-500">
            {label}
          </div>
        )}
        <div className="text-sm font-semibold text-slate-900">
          {moneyTooltip(rawValue)}
        </div>
      </div>
    );
  };
  const tooltipProps = {
    cursor: false as const,
    content: <LoyverseTooltip />,
  };

  // Branch chart data for horizontal bar
  const branchChartData = useMemo(() => {
    return branchSalesData.map(b => ({
      name: b.branch_name,
      sales: b.total_sales,
    }));
  }, [branchSalesData]);

  // --- Export Functions (CSV + PDF) ---
  const handleExportCsv = useCallback(() => {
    const headers = [
      t('sales_analytics.date'),
      t('sales_analytics.total_sales'),
      t('sales_analytics.refund'),
      t('sales_analytics.discount'),
      t('sales_analytics.net_sales'),
      t('sales_analytics.product_unit_price'),
      t('sales_analytics.gross_profit'),
    ];

    const escapeCell = (value: string) => {
      const needsQuotes = /[",\n]/.test(value);
      const safe = value.replace(/"/g, '""');
      return needsQuotes ? `"${safe}"` : safe;
    };

    const rows = salesTableRows.map((row) => [
      row.date,
      row.totalSales.toString(),
      row.refund.toString(),
      row.discount.toString(),
      row.netSales.toString(),
      row.productUnitPrice.toString(),
      row.grossProfit.toString(),
    ]);

    const csv = [
      headers.map(escapeCell).join(','),
      ...rows.map((r) => r.map(escapeCell).join(',')),
    ].join('\n');

    const branchNameStr = selectedBranch ? selectedBranch.name : 'All_Branches';
    const cleanBranchName = branchNameStr.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `sales_report_${cleanBranchName}_${dateRange.start}_to_${dateRange.end}.csv`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [salesTableRows, selectedBranch, dateRange, t]);

  const handleExportPdf = useCallback(() => {
    const doc = new jsPDF('l', 'pt', 'a4');

    const headers = [
      t('sales_analytics.date'),
      t('sales_analytics.total_sales'),
      t('sales_analytics.refund'),
      t('sales_analytics.discount'),
      t('sales_analytics.net_sales'),
      t('sales_analytics.product_unit_price'),
      t('sales_analytics.gross_profit'),
    ];

    const body = salesTableRows.map((row) => [
      row.date,
      money(row.totalSales),
      money(row.refund),
      money(row.discount),
      money(row.netSales),
      money(row.productUnitPrice),
      money(row.grossProfit),
    ]);

    autoTable(doc, {
      head: [headers],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [139, 92, 246] },
      margin: { top: 40 },
    });

    const branchNameStr = selectedBranch ? selectedBranch.name : 'All_Branches';
    const cleanBranchName = branchNameStr.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `sales_report_${cleanBranchName}_${dateRange.start}_to_${dateRange.end}.pdf`;

    doc.save(filename);
  }, [salesTableRows, selectedBranch, dateRange, t]);

  const isPageLoading = dailySalesLoading;

  return (
    <div className="pt-6 space-y-8">
      <AnimatePresence mode="wait">
        {isPageLoading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            {/* Stat cards skeleton */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-5">
                    <Skeleton className="h-4 w-20 mb-2 rounded-lg" />
                    <Skeleton className="h-10 w-28 mb-2 rounded-lg" />
                    <Skeleton className="h-3 w-24 rounded-lg" />
                  </div>
                ))}
              </div>
              <div className="p-6 border-t border-gray-200">
                <div className="flex items-center justify-between mb-5">
                  <Skeleton className="h-5 w-40 rounded-lg" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-24 rounded-lg" />
                    <Skeleton className="h-8 w-20 rounded-lg" />
                  </div>
                </div>
                <Skeleton className="h-72 w-full rounded-2xl" />
              </div>
            </div>
            {/* Two col cards skeleton */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden p-5">
                <Skeleton className="h-5 w-48 mb-4 rounded-lg" />
                <Skeleton className="h-48 w-full rounded-xl mb-4" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden p-5">
                <Skeleton className="h-8 w-56 mb-4 rounded-lg" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl mb-3" />
                ))}
              </div>
            </div>
            {/* Table skeleton */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden p-5">
              <div className="flex justify-between mb-4">
                <Skeleton className="h-9 w-28 rounded-lg" />
                <Skeleton className="h-9 w-9 rounded-lg" />
              </div>
              <Skeleton className="h-10 w-full rounded-lg mb-2" />
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg mb-1" />
              ))}
              <div className="flex justify-between mt-4 pt-4">
                <Skeleton className="h-9 w-20 rounded-lg" />
                <Skeleton className="h-5 w-24 rounded-lg" />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="space-y-8"
          >
      {/* ── Stat Cards ─────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-5">
          {topStatItems.map((item) => (
            <button
              type="button"
              key={item.label}
              onClick={() => setActiveMetric(item.key)}
              className="p-5 text-left transition-colors hover:bg-gray-50 border-b-2 border-b-transparent"
              style={activeMetric === item.key ? { borderBottomColor: CHART_THEME_COLOR } : undefined}
            >
              <p className="text-brand-muted text-sm font-medium mb-1">{item.label}</p>
              <h3 className="text-4xl/none md:text-[2rem] font-bold text-brand-text mb-2">{item.value}</h3>
              <p className={`text-xs font-medium ${item.positive ? 'text-green-600' : 'text-red-600'}`}>{item.delta}</p>
            </button>
          ))}
        </div>
        <div className="p-6 border-t border-gray-200">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-brand-muted" />
              <h4 className="text-lg font-normal text-brand-text">{activeMetricLabel}</h4>
            </div>
            <div className="flex items-center gap-3">
              <InlineDropdown value={chartType} options={['line graph', 'bar chart'] as const} formatOption={(v) => t(`sales_analytics.${v.replace(' ', '_')}`)} onChange={(v) => setChartType(v)} />
              <InlineDropdown value={viewMode} options={['glance', 'week'] as const} formatOption={(v) => t(`sales_analytics.${v}`)} onChange={(v) => setViewMode(v)} />
            </div>
          </div>
          <ChartContainer
            className="w-full min-w-0 h-72 min-h-[288px]"
            minHeight={288}
            render={({ width, height }) =>
              chartType === 'bar chart' ? (
                <BarChart width={width} height={height} data={trendData} barCategoryGap={responsiveBarCategoryGap} barGap={0}>
                  <CartesianGrid stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} interval={responsiveXAxisInterval} angle={responsiveXAxisAngle} textAnchor={responsiveXAxisTextAnchor} height={responsiveXAxisHeight} tickMargin={responsiveXAxisTickMargin} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v) => `₱${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipProps} />
                  <Bar dataKey={activeMetric} fill={CHART_THEME_COLOR} barSize={responsiveBarSize} />
                </BarChart>
              ) : (
                <AreaChart width={width} height={height} data={trendData}>
                  <CartesianGrid stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} interval={responsiveXAxisInterval} angle={responsiveXAxisAngle} textAnchor={responsiveXAxisTextAnchor} height={responsiveXAxisHeight} tickMargin={responsiveXAxisTickMargin} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v) => `₱${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipProps} />
                  <Area type="linear" dataKey={activeMetric} stroke={CHART_THEME_COLOR} strokeWidth={2} fill={CHART_THEME_COLOR} fillOpacity={0.2} dot={true} activeDot={true} />
                </AreaChart>
              )
            }
          />
        </div>
      </div>

      {/* ══ NEW: Two col-6 cards ══════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Card 1: Total Sales per Branch */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Store size={18} className="text-brand-muted" />
              <h4 className="text-base font-semibold text-brand-text">{t('sales_analytics.total_sales_per_branch')}</h4>
            </div>
          </div>
          <div className="flex-1 px-5 py-4">
            {branchSalesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-violet-500" />
              </div>
            ) : branchSalesError ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle size={32} className="text-red-400 mb-2" />
                <p className="text-sm text-red-500 font-medium">{branchSalesError}</p>
                <button onClick={fetchBranchSales} className="mt-2 text-xs text-violet-600 font-bold hover:underline cursor-pointer">{t('sales_analytics.retry')}</button>
              </div>
            ) : branchSalesData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Store size={36} className="text-gray-300 mb-2" />
                <p className="text-sm text-brand-muted font-medium">{t('sales_analytics.no_branch_sales_data')}</p>
              </div>
            ) : (
              <>
                {/* Horizontal bar chart */}
                <ChartContainer
                  className="w-full min-w-0 h-48 min-h-[192px] mb-4"
                  minHeight={192}
                  render={({ width, height }) => (
                    <BarChart width={width} height={height} data={branchChartData} layout="vertical" barCategoryGap="20%">
                      <CartesianGrid stroke="#e5e7eb" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => `₱${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#334155', fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={false} content={<LoyverseTooltip />} />
                      <Bar dataKey="sales" barSize={22} radius={[0, 6, 6, 0]}>
                        {branchChartData.map((_entry, index) => (
                          <Cell key={index} fill={BRANCH_BAR_COLORS[index % BRANCH_BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                />
                {/* Data table */}
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium text-brand-muted border-b border-gray-100 bg-gray-50">
                        <th className="px-3 py-2">{t('sales_analytics.branch')}</th>
                        <th className="px-3 py-2 text-right">{t('sales_analytics.total_sales')}</th>
                        <th className="px-3 py-2 text-right">{t('sales_analytics.orders')}</th>
                        <th className="px-3 py-2 text-right">{t('sales_analytics.avg_order')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchSalesData.map((b, i) => (
                        <tr key={b.branch_id} className={`border-b border-gray-50 last:border-b-0 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: BRANCH_BAR_COLORS[i % BRANCH_BAR_COLORS.length] }} />
                              <span className="font-medium text-brand-text truncate max-w-[120px]">{b.branch_name}</span>
                              <span className="text-[10px] text-brand-muted font-medium">{b.branch_code}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-brand-text">{money(b.total_sales)}</td>
                          <td className="px-3 py-2.5 text-right text-brand-muted">{b.order_count.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right text-brand-muted">{money(b.avg_order_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Card 2: Top 5 Least Selling Products */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-50/70 via-white to-pink-50/60">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                <TrendingDown size={18} />
              </span>
              <div className="flex flex-col">
                <h4 className="text-base font-semibold text-slate-900">{t('sales_analytics.top_least_selling_products')}</h4>
                <p className="text-[11px] font-medium text-slate-500">
                  {t('sales_analytics.low_sales')}
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.12em] bg-violet-50 text-violet-700 border border-violet-100">
              {t('sales_analytics.insight')}
            </span>
          </div>
          <div className="flex-1 px-5 py-4">
            {leastSellingLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-violet-500" />
              </div>
            ) : leastSellingError ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle size={32} className="text-red-400 mb-2" />
                <p className="text-sm text-red-500 font-medium">{leastSellingError}</p>
                <button onClick={fetchLeastSelling} className="mt-2 text-xs text-violet-600 font-bold hover:underline cursor-pointer">{t('sales_analytics.retry')}</button>
              </div>
            ) : leastSellingData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingDown size={36} className="text-gray-300 mb-2" />
                <p className="text-sm text-brand-muted font-medium">{t('sales_analytics.no_data_available')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {leastSellingData.map((item, idx) => (
                  <div
                    key={item.IDNo}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-violet-50 bg-gradient-to-r from-slate-50 via-white to-violet-50/40 hover:shadow-sm hover:border-violet-100 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 bg-violet-100 text-violet-700">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{item.MENU_NAME}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                            {item.category}
                          </span>
                          <span className="text-[11px] text-slate-400">·</span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {money(item.MENU_PRICE)}/{t('sales_analytics.unit')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className="text-sm font-semibold text-slate-900">
                        {item.total_quantity} {t('sales_analytics.sold')}
                      </span>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {money(item.total_revenue)} {t('sales_analytics.revenue')}
                      </p>
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-slate-500 text-center pt-1 font-medium">
                  {t('sales_analytics.least_selling_hint')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Sales Table ────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="text-sm font-semibold text-green-700 hover:text-green-800 transition-colors flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              CSV
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="text-sm font-semibold text-red-700 hover:text-red-800 transition-colors flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><path d="M14 2v6h6"></path><path d="M9 12h1.5a1.5 1.5 0 0 1 0 3H9v-3z"></path><path d="M15 12h2"></path><path d="M15 15h2"></path></svg>
              PDF
            </button>
          </div>
          <button type="button" className="text-brand-muted hover:text-brand-text transition-colors">
            <LayoutGrid size={18} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="text-left text-xs font-medium text-brand-muted border-b border-gray-100">
                <th className="px-5 py-3">{t('sales_analytics.date')}</th>
                <th className="px-5 py-3">{t('sales_analytics.total_sales')}</th>
                <th className="px-5 py-3">{t('sales_analytics.refund')}</th>
                <th className="px-5 py-3">{t('sales_analytics.discount')}</th>
                <th className="px-5 py-3">{t('sales_analytics.net_sales')}</th>
                <th className="px-5 py-3">{t('sales_analytics.product_unit_price')}</th>
                <th className="px-5 py-3">{t('sales_analytics.gross_profit')}</th>
              </tr>
            </thead>
            <tbody>
              {pagedTableRows.map((row, idx) => (
                <tr key={`${row.date}-${idx}`} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-5 py-3.5 text-sm text-brand-text">{row.date}</td>
                  <td className="px-5 py-3.5 text-sm text-brand-text">{money(row.totalSales)}</td>
                  <td className="px-5 py-3.5 text-sm text-brand-text">{money(row.refund)}</td>
                  <td className="px-5 py-3.5 text-sm text-brand-text">{money(row.discount)}</td>
                  <td className="px-5 py-3.5 text-sm text-brand-text">{money(row.netSales)}</td>
                  <td className="px-5 py-3.5 text-sm text-brand-text">{money(row.productUnitPrice)}</td>
                  <td className="px-5 py-3.5 text-sm text-brand-text">{money(row.grossProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTablePage((prev) => Math.max(0, prev - 1))} disabled={safeTablePage === 0} className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-brand-muted disabled:opacity-40">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => setTablePage((prev) => Math.min(totalTablePages - 1, prev + 1))} disabled={safeTablePage >= totalTablePages - 1} className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-brand-muted disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="text-sm text-brand-muted">
            {t('sales_analytics.page')} <span className="font-semibold text-brand-text">{safeTablePage + 1}</span> / {totalTablePages}
          </div>
          <div className="text-sm text-brand-muted">
            {t('sales_analytics.page_line_count')} <span className="font-semibold text-brand-text">{TABLE_PAGE_SIZE}</span>
          </div>
        </div>
      </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
