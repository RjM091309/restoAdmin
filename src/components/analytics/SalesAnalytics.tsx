import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, Store, TrendingDown, Loader2, AlertCircle } from 'lucide-react';
import { type Branch } from '../partials/Header';
import {
  fetchBranchSalesApi,
  fetchLeastSellingApi,
  fetchTopSellingApi,
  fetchDailySalesApi,
  type ApiBranchSalesItem,
  type ApiLeastSellingItem,
  type ApiTopSellingItem,
  type ApiDailySalesItem,
} from '../../services/analyticsService';
import {
  ResponsiveContainer,
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
  `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CHART_THEME_COLOR = 'rgb(139, 92, 246)';

const BRANCH_BAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];



export const SalesAnalytics: React.FC<SalesAnalyticsProps> = ({ selectedBranch, dateRange }) => {
  const { t } = useTranslation();
  const isAllBranch = !selectedBranch || String(selectedBranch.id) === 'all';
  const [activeMetric, setActiveMetric] = useState<MetricKey>('totalSales');
  const [chartType, setChartType] = useState<ChartType>('bar chart');
  const [viewMode, setViewMode] = useState<ViewMode>('glance');
  const [productChartType, setProductChartType] = useState<'bar chart'>('bar chart');
  const [productViewMode, setProductViewMode] = useState<ViewMode>('glance');
  const [activeProductKey, setActiveProductKey] = useState<string | 'all'>('all');
  const [tablePage, setTablePage] = useState(0);

  // API data state for the two new cards
  const [branchSalesData, setBranchSalesData] = useState<ApiBranchSalesItem[]>([]);
  const [branchSalesLoading, setBranchSalesLoading] = useState(false);
  const [branchSalesError, setBranchSalesError] = useState<string | null>(null);

  const [leastSellingData, setLeastSellingData] = useState<ApiLeastSellingItem[]>([]);
  const [leastSellingLoading, setLeastSellingLoading] = useState(false);
  const [leastSellingError, setLeastSellingError] = useState<string | null>(null);

  const [topSellingData, setTopSellingData] = useState<ApiTopSellingItem[]>([]);
  const [topSellingLoading, setTopSellingLoading] = useState(false);
  const [topSellingError, setTopSellingError] = useState<string | null>(null);

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

    const withMetrics = baseData.map((row, idx) => {
      const totalSales = row.sales;
      const refund = Number(row.refund || 0);
      const discount = Number(row.discount || 0);
      const netSalesRaw = (row.netSales ?? totalSales) as number;
      const grossProfitRaw = (row.grossProfit ?? netSalesRaw) as number;
      const netSales = Math.max(0, netSalesRaw);
      const grossProfit = Math.max(0, grossProfitRaw);
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
  useEffect(() => { setActiveProductKey('all'); }, [dateRange.start, dateRange.end, selectedBranch?.id]);

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

  // Fetch top-selling items (Top 5 Products card)
  const fetchTopSelling = useCallback(async () => {
    setTopSellingLoading(true);
    setTopSellingError(null);
    try {
      const params = new URLSearchParams();
      if (dateRange.start) params.set('start_date', dateRange.start);
      if (dateRange.end) params.set('end_date', dateRange.end);
      if (!isAllBranch && selectedBranch?.id) params.set('branch_id', String(selectedBranch.id));
      params.set('limit', '5');

      const apiData = await fetchTopSellingApi(params);
      setTopSellingData(apiData);
    } catch (err) {
      console.error(err);
      setTopSellingError(t('sales_analytics.network_error'));
      setTopSellingData([]);
    } finally {
      setTopSellingLoading(false);
    }
  }, [dateRange.start, dateRange.end, isAllBranch, selectedBranch?.id, t]);

  useEffect(() => { fetchBranchSales(); }, [fetchBranchSales]);
  useEffect(() => { fetchLeastSelling(); }, [fetchLeastSelling]);
  useEffect(() => { fetchDailySales(); }, [fetchDailySales]);
  useEffect(() => { fetchTopSelling(); }, [fetchTopSelling]);

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

  // Dynamic Top 5 products (base from API)
  const baseTopProducts = useMemo(
    () =>
      topSellingData.map((item, index) => ({
        key: String(item.IDNo ?? index),
        name: item.MENU_NAME,
        color: BRANCH_BAR_COLORS[index % BRANCH_BAR_COLORS.length],
        // Use API net sales as initial total; this will be
        // recomputed from the chart data so the list matches the graph.
        netSales: item.total_revenue,
      })),
    [topSellingData]
  );

  // Compute per-product share based on overall revenue, then
  // distribute each day's netSales using those shares (stacked per date).
  const productShares = useMemo(() => {
    if (!baseTopProducts.length) return {} as Record<string, number>;
    const totalRevenue = baseTopProducts.reduce((sum, p) => sum + (p.netSales || 0), 0);
    if (totalRevenue <= 0) {
      const equalShare = 1 / baseTopProducts.length;
      return Object.fromEntries(baseTopProducts.map((p) => [p.key, equalShare])) as Record<string, number>;
    }
    return Object.fromEntries(
      baseTopProducts.map((p) => [p.key, (p.netSales || 0) / totalRevenue])
    ) as Record<string, number>;
  }, [baseTopProducts]);

  const productGraphData = useMemo(() => {
    if (!baseTopProducts.length || !trendData.length) return [];

    // Normalize shares so total = 1
    const totalShare = Object.values(productShares).reduce((sum, v) => sum + v, 0) || 1;
    const normalizedShares: Record<string, number> = {};
    baseTopProducts.forEach((p) => {
      const raw = productShares[p.key] ?? 0;
      normalizedShares[p.key] = raw / totalShare;
    });

    return trendData.map((row) => {
      const total = row.netSales || 0;
      const entry: Record<string, number | string> = { label: row.label };

      baseTopProducts.forEach((p) => {
        const share = normalizedShares[p.key] ?? (1 / topProductRows.length);
        entry[p.key] = Math.round(total * share);
      });

      return entry;
    });
  }, [trendData, baseTopProducts, productShares]);

  // Final Top 5 rows for the list, with totals computed
  // from the stacked chart so they always match visually.
  const topProductRows = useMemo(() => {
    if (!baseTopProducts.length || !productGraphData.length) return baseTopProducts;

    const totals: Record<string, number> = {};
    productGraphData.forEach((day) => {
      baseTopProducts.forEach((p) => {
        const value = Number((day as any)[p.key] || 0);
        totals[p.key] = (totals[p.key] || 0) + value;
      });
    });

    // Keep original order (which already reflects Top 5 ranking from API)
    // so colors, list, chart stacks, and tooltip stay aligned.
    return baseTopProducts.map((p) => ({
      ...p,
      netSales: totals[p.key] || 0,
    }));
  }, [baseTopProducts, productGraphData]);

  const activeProduct = useMemo(
    () => (activeProductKey === 'all' ? null : topProductRows.find((row) => row.key === activeProductKey) || null),
    [activeProductKey, topProductRows]
  );

  const visibleProductSeries = useMemo(
    () => (activeProduct ? [activeProduct] : topProductRows),
    [activeProduct, topProductRows]
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
  const tooltipProps = {
    formatter: (value: number) => money(Number(value)),
    cursor: false as const,
    contentStyle: { backgroundColor: '#ffffff', border: 'none', borderRadius: '10px', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)' },
    labelStyle: { color: '#0f172a', fontWeight: 700, marginBottom: '4px' },
    itemStyle: { color: '#334155', fontWeight: 600 },
  };

  // Branch chart data for horizontal bar
  const branchChartData = useMemo(() => {
    return branchSalesData.map(b => ({
      name: b.branch_name,
      sales: b.total_sales,
    }));
  }, [branchSalesData]);

  // --- Export Function ---
  const handleExport = useCallback(() => {
    // 1. Create data rows for Excel
    const data = salesTableRows.map(row => ({
      [t('sales_analytics.date')]: row.date,
      [t('sales_analytics.total_sales')]: money(row.totalSales),
      [t('sales_analytics.refund')]: money(row.refund),
      [t('sales_analytics.discount')]: money(row.discount),
      [t('sales_analytics.net_sales')]: money(row.netSales),
      [t('sales_analytics.product_unit_price')]: money(row.productUnitPrice),
      [t('sales_analytics.gross_profit')]: money(row.grossProfit),
    }));

    // 2. Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);

    // 3. Set column widths
    worksheet['!cols'] = [
      { wch: 18 }, // Date
      { wch: 18 }, // Total Sales
      { wch: 15 }, // Refund
      { wch: 15 }, // Discount
      { wch: 18 }, // Net Sales
      { wch: 18 }, // Product Unit Price
      { wch: 18 }, // Gross Profit
    ];

    // 4. Create workbook and append worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Analytics');

    // 5. Generate descriptive filename with .xlsx extension
    const branchNameStr = selectedBranch ? selectedBranch.name : 'All_Branches';
    const cleanBranchName = branchNameStr.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `sales_report_${cleanBranchName}_${dateRange.start}_to_${dateRange.end}.xlsx`;

    // 6. Download the file
    XLSX.writeFile(workbook, filename);
  }, [salesTableRows, selectedBranch, dateRange, t]);

  return (
    <div className="pt-6 space-y-8">
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
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar chart' ? (
                <BarChart data={trendData} barCategoryGap={responsiveBarCategoryGap} barGap={0}>
                  <CartesianGrid stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} interval={responsiveXAxisInterval} angle={responsiveXAxisAngle} textAnchor={responsiveXAxisTextAnchor} height={responsiveXAxisHeight} tickMargin={responsiveXAxisTickMargin} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v) => `₱${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipProps} />
                  <Bar dataKey={activeMetric} fill={CHART_THEME_COLOR} barSize={responsiveBarSize} />
                </BarChart>
              ) : (
                <AreaChart data={trendData}>
                  <CartesianGrid stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} interval={responsiveXAxisInterval} angle={responsiveXAxisAngle} textAnchor={responsiveXAxisTextAnchor} height={responsiveXAxisHeight} tickMargin={responsiveXAxisTickMargin} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v) => `₱${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipProps} />
                  <Area type="linear" dataKey={activeMetric} stroke={CHART_THEME_COLOR} strokeWidth={2} fill={CHART_THEME_COLOR} fillOpacity={0.2} dot={true} activeDot={true} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Top 5 Products + Chart ─────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden pt-4">
        <div className="grid grid-cols-1 items-stretch xl:grid-cols-[430px_minmax(0,1fr)] 2xl:grid-cols-[470px_minmax(0,1fr)]">
          <div className="px-5 py-4 border-b xl:border-b-0 xl:border-r border-gray-100">
            <div className="flex items-center justify-between text-sm font-normal text-brand-text mb-3.5">
              <span>{t('sales_analytics.top_5_products')}</span>
              <span className="text-brand-muted">{t('sales_analytics.net_sales')}</span>
            </div>
            <div className="overflow-hidden rounded-xl min-h-[120px] flex items-stretch justify-center">
              {topSellingLoading ? (
                <div className="flex items-center justify-center py-10 w-full">
                  <Loader2 size={20} className="animate-spin text-violet-500" />
                </div>
              ) : topSellingError ? (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center w-full">
                  <AlertCircle size={24} className="text-red-400 mb-1.5" />
                  <p className="text-xs text-red-500 font-medium mb-1">{topSellingError}</p>
                  <button
                    onClick={fetchTopSelling}
                    className="mt-1 text-[11px] text-violet-600 font-bold hover:underline cursor-pointer"
                  >
                    {t('sales_analytics.retry')}
                  </button>
                </div>
              ) : topProductRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center w-full">
                  <Store size={26} className="text-gray-300 mb-1.5" />
                  <p className="text-xs text-brand-muted font-medium">
                    {t('sales_analytics.no_data_available')}
                  </p>
                </div>
              ) : (
                <table className="w-full table-auto">
                  <tbody>
                    {topProductRows.map((item) => {
                      const isSelected = activeProductKey === item.key;
                      return (
                        <tr
                          key={item.key}
                          onClick={() =>
                            setActiveProductKey((prev) => (prev === item.key ? 'all' : item.key))
                          }
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-violet-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-3 py-3 align-top">
                            <div className="flex items-start gap-3">
                              <span
                                className="w-5 h-5 rounded-full shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <p className="text-sm text-brand-text whitespace-normal break-words leading-5">
                                {item.name}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right text-sm font-medium text-brand-text whitespace-nowrap">
                            {money(item.netSales)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-normal text-brand-text">
                {activeProduct ? `${activeProduct.name} ${t('sales_analytics.sales_trend')}` : t('sales_analytics.sales_graph_by_product')}
              </h4>
              <div className="flex items-center gap-3">
                <InlineDropdown value={productChartType} options={['bar chart'] as const} formatOption={(v) => t(`sales_analytics.${v.replace(' ', '_')}`)} onChange={(v) => setProductChartType(v)} />
                <InlineDropdown value={productViewMode} options={['glance', 'week'] as const} formatOption={(v) => t(`sales_analytics.${v}`)} onChange={(v) => setProductViewMode(v)} />
              </div>
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productGraphData} barCategoryGap={responsiveBarCategoryGap} barGap={0}>
                  <CartesianGrid stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    interval={responsiveXAxisInterval}
                    angle={responsiveXAxisAngle}
                    textAnchor={responsiveXAxisTextAnchor}
                    height={responsiveXAxisHeight}
                    tickMargin={responsiveXAxisTickMargin}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickFormatter={(v) => `₱${Math.round(Number(v) / 1000)}k`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...tooltipProps} />
                  {[...visibleProductSeries].reverse().map((series) => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      stackId={activeProduct ? undefined : 'products'}
                      fill={series.color}
                      barSize={activeProduct ? Math.max(18, responsiveBarSize) : responsiveBarSize}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
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
                <div className="h-48 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={branchChartData} layout="vertical" barCategoryGap="20%">
                      <CartesianGrid stroke="#e5e7eb" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => `₱${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#334155', fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value: number) => money(Number(value))} cursor={false} contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '10px', boxShadow: '0 6px 18px rgba(15,23,42,0.08)' }} labelStyle={{ color: '#0f172a', fontWeight: 700 }} />
                      <Bar dataKey="sales" barSize={22} radius={[0, 6, 6, 0]}>
                        {branchChartData.map((_entry, index) => (
                          <Cell key={index} fill={BRANCH_BAR_COLORS[index % BRANCH_BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
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
          <button type="button" onClick={handleExport} className="text-sm font-semibold text-green-700 hover:text-green-800 transition-colors flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            {t('sales_analytics.export')}
          </button>
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

    </div>
  );
};
