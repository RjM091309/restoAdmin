import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Flame, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { type Branch } from '../partials/Header';
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
} from 'recharts';

type SalesAnalyticsProps = {
  selectedBranch: Branch | null;
  dateRange: {
    start: string;
    end: string;
  };
};

type BranchSales = {
  id: string;
  name: string;
  totalSales: number;
  orders: number;
  avgSales: number;
  growth: number;
};

type TopMenuItem = {
  name: string;
  category: string;
  orders: number;
  sales: number;
};

type MetricKey = 'totalSales' | 'refund' | 'discount' | 'netSales' | 'grossProfit';
type ChartType = 'bar chart' | 'line graph';
type ViewMode = 'glance' | 'week';

type InlineDropdownProps<T extends string> = {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
};

function InlineDropdown<T extends string>({ value, options, onChange }: InlineDropdownProps<T>) {
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
        <span>{value}</span>
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
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                option === value ? 'bg-brand-primary text-white' : 'text-brand-text hover:bg-gray-50'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const MOCK_BRANCH_SALES: BranchSales[] = [
  { id: '1', name: 'Daraejung', totalSales: 286450, orders: 1240, avgSales: 9548.33, growth: 8.4 },
  { id: '2', name: "Kim's Brothers", totalSales: 241900, orders: 1088, avgSales: 8063.33, growth: 6.1 },
  { id: '3', name: 'Main Branch', totalSales: 198730, orders: 903, avgSales: 6624.33, growth: 4.7 },
];

const FALLBACK_DAILY_SALES = [
  { label: '28 Jan', tableDate: '28 Jan 2026', sales: 82000 },
  { label: '29 Jan', tableDate: '29 Jan 2026', sales: 128000 },
  { label: '30 Jan', tableDate: '30 Jan 2026', sales: 167000 },
  { label: '31 Jan', tableDate: '31 Jan 2026', sales: 189000 },
  { label: '01 Feb', tableDate: '01 Feb 2026', sales: 228000 },
  { label: '02 Feb', tableDate: '02 Feb 2026', sales: 136000 },
  { label: '03 Feb', tableDate: '03 Feb 2026', sales: 149000 },
  { label: '04 Feb', tableDate: '04 Feb 2026', sales: 142000 },
  { label: '05 Feb', tableDate: '05 Feb 2026', sales: 178000 },
  { label: '06 Feb', tableDate: '06 Feb 2026', sales: 236000 },
  { label: '07 Feb', tableDate: '07 Feb 2026', sales: 258000 },
  { label: '08 Feb', tableDate: '08 Feb 2026', sales: 231000 },
  { label: '09 Feb', tableDate: '09 Feb 2026', sales: 121000 },
  { label: '10 Feb', tableDate: '10 Feb 2026', sales: 124000 },
  { label: '11 Feb', tableDate: '11 Feb 2026', sales: 160000 },
  { label: '12 Feb', tableDate: '12 Feb 2026', sales: 137000 },
  { label: '13 Feb', tableDate: '13 Feb 2026', sales: 166000 },
  { label: '14 Feb', tableDate: '14 Feb 2026', sales: 341000 },
  { label: '15 Feb', tableDate: '15 Feb 2026', sales: 315000 },
  { label: '16 Feb', tableDate: '16 Feb 2026', sales: 239000 },
  { label: '17 Feb', tableDate: '17 Feb 2026', sales: 221000 },
  { label: '18 Feb', tableDate: '18 Feb 2026', sales: 229000 },
  { label: '19 Feb', tableDate: '19 Feb 2026', sales: 181000 },
  { label: '20 Feb', tableDate: '20 Feb 2026', sales: 227000 },
  { label: '21 Feb', tableDate: '21 Feb 2026', sales: 273000 },
  { label: '22 Feb', tableDate: '22 Feb 2026', sales: 205000 },
  { label: '23 Feb', tableDate: '23 Feb 2026', sales: 161000 },
  { label: '24 Feb', tableDate: '24 Feb 2026', sales: 152000 },
  { label: '25 Feb', tableDate: '25 Feb 2026', sales: 131000 },
  { label: '26 Feb', tableDate: '26 Feb 2026', sales: 61000 },
];

const parseDateSafe = (value: string) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

const createRangeSales = (start: string, end: string) => {
  const startDate = parseDateSafe(start);
  const endDate = parseDateSafe(end);
  if (!startDate || !endDate || startDate > endDate) return FALLBACK_DAILY_SALES;

  const rows: { label: string; tableDate: string; sales: number }[] = [];
  const cursor = new Date(startDate);
  let index = 0;

  while (cursor <= endDate && rows.length < 180) {
    const seasonal = Math.round(Math.sin(index / 2.8) * 18000);
    const trend = (index % 7) * 6500;
    const sales = Math.max(50000, 120000 + seasonal + trend);
    rows.push({
      label: formatDateLabel(cursor),
      tableDate: cursor.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      sales,
    });
    cursor.setDate(cursor.getDate() + 1);
    index += 1;
  }

  return rows.length ? rows : FALLBACK_DAILY_SALES;
};

const MOCK_BRANCH_DAILY_TREND: Record<string, { day: string; sales: number; orders: number }[]> = {
  '1': [
    { day: 'Mon', sales: 8200, orders: 36 },
    { day: 'Tue', sales: 7900, orders: 34 },
    { day: 'Wed', sales: 9100, orders: 39 },
    { day: 'Thu', sales: 8600, orders: 37 },
    { day: 'Fri', sales: 9800, orders: 42 },
    { day: 'Sat', sales: 10500, orders: 46 },
    { day: 'Sun', sales: 8900, orders: 38 },
  ],
  '2': [
    { day: 'Mon', sales: 7100, orders: 31 },
    { day: 'Tue', sales: 7350, orders: 32 },
    { day: 'Wed', sales: 7600, orders: 33 },
    { day: 'Thu', sales: 8050, orders: 35 },
    { day: 'Fri', sales: 8420, orders: 37 },
    { day: 'Sat', sales: 9100, orders: 40 },
    { day: 'Sun', sales: 7900, orders: 34 },
  ],
  '3': [
    { day: 'Mon', sales: 5900, orders: 26 },
    { day: 'Tue', sales: 6100, orders: 27 },
    { day: 'Wed', sales: 6420, orders: 28 },
    { day: 'Thu', sales: 6650, orders: 29 },
    { day: 'Fri', sales: 7020, orders: 31 },
    { day: 'Sat', sales: 7480, orders: 33 },
    { day: 'Sun', sales: 6250, orders: 27 },
  ],
};

const MOCK_TOP_MENU_ALL: TopMenuItem[] = [
  { name: 'Bulgogi Set', category: 'Korean', orders: 328, sales: 114800 },
  { name: 'Kimchi Fried Rice', category: 'Rice Meals', orders: 295, sales: 88500 },
  { name: 'Spicy Ramen', category: 'Noodles', orders: 264, sales: 76560 },
  { name: 'Seafood Pancake', category: 'Appetizer', orders: 188, sales: 62040 },
];

const MOCK_TOP_MENU_BRANCH: Record<string, TopMenuItem[]> = {
  '1': [
    { name: 'Bulgogi Set', category: 'Korean', orders: 126, sales: 44100 },
    { name: 'Seafood Soup', category: 'Soup', orders: 108, sales: 36720 },
    { name: 'Kimchi Fried Rice', category: 'Rice Meals', orders: 95, sales: 28500 },
  ],
  '2': [
    { name: 'Spicy Ramen', category: 'Noodles', orders: 116, sales: 33640 },
    { name: 'Katsu Set', category: 'Japanese', orders: 102, sales: 35700 },
    { name: 'Kimchi Fried Rice', category: 'Rice Meals', orders: 88, sales: 26400 },
  ],
  '3': [
    { name: 'Chicken Teriyaki', category: 'Japanese', orders: 93, sales: 31620 },
    { name: 'Spicy Ramen', category: 'Noodles', orders: 86, sales: 24940 },
    { name: 'Seafood Pancake', category: 'Appetizer', orders: 74, sales: 24420 },
  ],
};

const MOCK_LOW_MENU_ALL: TopMenuItem[] = [
  { name: 'Miso Soup', category: 'Soup', orders: 9, sales: 1710 },
  { name: 'Tofu Salad', category: 'Salad', orders: 7, sales: 1540 },
  { name: 'Cucumber Roll', category: 'Sushi', orders: 5, sales: 975 },
];

const MOCK_LOW_MENU_BRANCH: Record<string, TopMenuItem[]> = {
  '1': [
    { name: 'Miso Soup', category: 'Soup', orders: 4, sales: 760 },
    { name: 'Tofu Salad', category: 'Salad', orders: 3, sales: 660 },
  ],
  '2': [
    { name: 'Cucumber Roll', category: 'Sushi', orders: 3, sales: 585 },
    { name: 'Veggie Tempura', category: 'Appetizer', orders: 2, sales: 390 },
  ],
  '3': [
    { name: 'Cold Soba', category: 'Noodles', orders: 2, sales: 430 },
    { name: 'Miso Soup', category: 'Soup', orders: 1, sales: 190 },
  ],
};

const money = (value: number) =>
  `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CHART_THEME_COLOR = 'rgb(139, 92, 246)';
const PRODUCT_SERIES = [
  { key: 'p1', name: 'S2 Premium Set B (4Pax)', color: '#6366f1' },
  { key: 'p2', name: 'I1 Iberico Kkot Moksal', color: '#10b981' },
  { key: 'p3', name: 'S1 Premium Set A (2Pax)', color: '#f59e0b' },
  { key: 'p4', name: 'K1 Handon KKotsamgyeopsal', color: '#ef4444' },
  { key: 'p5', name: 'Chamisul', color: '#8b5cf6' },
] as const;
type ProductKey = (typeof PRODUCT_SERIES)[number]['key'];

export const SalesAnalytics: React.FC<SalesAnalyticsProps> = ({ selectedBranch, dateRange }) => {
  const isAllBranch = !selectedBranch || String(selectedBranch.id) === 'all';
  const [activeMetric, setActiveMetric] = useState<MetricKey>('totalSales');
  const [chartType, setChartType] = useState<ChartType>('bar chart');
  const [viewMode, setViewMode] = useState<ViewMode>('glance');
  const [productChartType, setProductChartType] = useState<'bar chart'>('bar chart');
  const [productViewMode, setProductViewMode] = useState<ViewMode>('glance');
  const [activeProductKey, setActiveProductKey] = useState<ProductKey | 'all'>('all');
  const [tablePage, setTablePage] = useState(0);

  const selectedData = useMemo(() => {
    if (isAllBranch) return null;
    const byId = MOCK_BRANCH_SALES.find((row) => row.id === String(selectedBranch?.id));
    if (byId) return byId;
    return {
      id: String(selectedBranch?.id || '0'),
      name: selectedBranch?.name || 'Selected Branch',
      totalSales: 172350,
      orders: 780,
      avgSales: 5745,
      growth: 5.2,
    };
  }, [isAllBranch, selectedBranch]);

  const allSummary = useMemo(() => {
    const totalSales = MOCK_BRANCH_SALES.reduce((sum, row) => sum + row.totalSales, 0);
    const totalOrders = MOCK_BRANCH_SALES.reduce((sum, row) => sum + row.orders, 0);
    const avgSales =
      MOCK_BRANCH_SALES.length > 0
        ? MOCK_BRANCH_SALES.reduce((sum, row) => sum + row.avgSales, 0) / MOCK_BRANCH_SALES.length
        : 0;
    return { totalSales, totalOrders, avgSales };
  }, []);

  const topMenuItems = useMemo(() => {
    if (isAllBranch) return MOCK_TOP_MENU_ALL;
    return MOCK_TOP_MENU_BRANCH[String(selectedBranch?.id)] || MOCK_TOP_MENU_ALL.slice(0, 3);
  }, [isAllBranch, selectedBranch]);
  const lowMenuItems = useMemo(() => {
    if (isAllBranch) return MOCK_LOW_MENU_ALL;
    return MOCK_LOW_MENU_BRANCH[String(selectedBranch?.id)] || MOCK_LOW_MENU_ALL.slice(0, 2);
  }, [isAllBranch, selectedBranch]);

  const trendData = useMemo(() => {
    const baseData = createRangeSales(dateRange.start, dateRange.end);
    const withMetrics = baseData.map((row, idx) => {
      const totalSales = row.sales;
      const refund = Math.round(totalSales * 0.00024 * (1 + Math.sin(idx / 3) * 0.1));
      const discount = Math.round(totalSales * 0.00269 * (1 + Math.cos(idx / 4) * 0.08));
      const netSales = Math.max(0, totalSales - refund - discount);
      const grossProfit = Math.round(netSales * 0.995);
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

    if (isAllBranch) return withMetrics;
    const branchMultiplierById: Record<string, number> = {
      '1': 1,
      '2': 0.84,
      '3': 0.72,
    };
    const multiplier = branchMultiplierById[String(selectedBranch?.id)] || 0.78;
    return withMetrics.map((row) => ({
      ...row,
      totalSales: Math.round(row.totalSales * multiplier),
      refund: Math.round(row.refund * multiplier),
      discount: Math.round(row.discount * multiplier),
      netSales: Math.round(row.netSales * multiplier),
      grossProfit: Math.round(row.grossProfit * multiplier),
    }));
  }, [dateRange.end, dateRange.start, isAllBranch, selectedBranch]);
  useEffect(() => {
    setTablePage(0);
  }, [dateRange.start, dateRange.end, selectedBranch?.id, activeMetric]);
  useEffect(() => {
    setActiveProductKey('all');
  }, [dateRange.start, dateRange.end, selectedBranch?.id]);
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
  const productGraphData = useMemo(() => {
    const baseShares: Record<ProductKey, number> = {
      p1: 0.34,
      p2: 0.24,
      p3: 0.18,
      p4: 0.14,
      p5: 0.1,
    };
    return trendData.map((row, idx) => {
      const total = row.netSales;
      const dynamic = {
        p1: baseShares.p1 + Math.sin(idx / 4) * 0.02,
        p2: baseShares.p2 + Math.cos(idx / 5) * 0.015,
        p3: baseShares.p3 + Math.sin(idx / 6) * 0.012,
        p4: baseShares.p4 + Math.cos(idx / 3) * 0.01,
        p5: baseShares.p5 + Math.sin(idx / 2.5) * 0.008,
      } as Record<ProductKey, number>;
      const totalShare = Object.values(dynamic).reduce((sum, value) => sum + value, 0);
      const normalized = Object.fromEntries(
        Object.entries(dynamic).map(([key, value]) => [key, value / totalShare])
      ) as Record<ProductKey, number>;
      return {
        label: row.label,
        p1: Math.round(total * normalized.p1),
        p2: Math.round(total * normalized.p2),
        p3: Math.round(total * normalized.p3),
        p4: Math.round(total * normalized.p4),
        p5: Math.round(total * normalized.p5),
      };
    });
  }, [trendData]);
  const topProductRows = useMemo(
    () =>
      PRODUCT_SERIES.map((series) => ({
        ...series,
        netSales: productGraphData.reduce((sum, row) => sum + Number(row[series.key] || 0), 0),
      })).sort((a, b) => b.netSales - a.netSales),
    [productGraphData]
  );
  const activeProduct = useMemo(
    () => PRODUCT_SERIES.find((series) => series.key === activeProductKey) || null,
    [activeProductKey]
  );
  const visibleProductSeries = useMemo(
    () => (activeProduct ? [activeProduct] : PRODUCT_SERIES),
    [activeProduct]
  );
  const TABLE_PAGE_SIZE = 10;
  const totalTablePages = Math.max(1, Math.ceil(salesTableRows.length / TABLE_PAGE_SIZE));
  const safeTablePage = Math.min(tablePage, totalTablePages - 1);
  const pagedTableRows = salesTableRows.slice(
    safeTablePage * TABLE_PAGE_SIZE,
    safeTablePage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE
  );

  const baseSales = isAllBranch ? allSummary.totalSales : selectedData?.totalSales || 0;
  const topStatItems = useMemo(
    () => [
      {
        key: 'totalSales' as const,
        label: 'Total sales',
        value: money(baseSales),
        delta: `+${money(baseSales * 0.0615)} (+6.57%)`,
        positive: true,
      },
      {
        key: 'refund' as const,
        label: 'Refund',
        value: money(baseSales * 0.00024),
        delta: `+${money(baseSales * 0.00019)} (+367.86%)`,
        positive: false,
      },
      {
        key: 'discount' as const,
        label: 'Discount',
        value: money(baseSales * 0.00269),
        delta: `-${money(baseSales * 0.0005)} (-15.76%)`,
        positive: true,
      },
      {
        key: 'netSales' as const,
        label: 'Net sales',
        value: money(baseSales * 0.9971),
        delta: `+${money(baseSales * 0.0619)} (+6.62%)`,
        positive: true,
      },
      {
        key: 'grossProfit' as const,
        label: 'Gross profit',
        value: money(baseSales * 0.9971),
        delta: `+${money(baseSales * 0.0619)} (+6.62%)`,
        positive: true,
      },
    ],
    [baseSales]
  );
  const activeMetricLabel = topStatItems.find((item) => item.key === activeMetric)?.label || 'Total sales';
  const tooltipProps = {
    formatter: (value: number) => money(Number(value)),
    cursor: false as const,
    contentStyle: {
      backgroundColor: '#ffffff',
      border: 'none',
      borderRadius: '10px',
      boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
    },
    labelStyle: {
      color: '#0f172a',
      fontWeight: 700,
      marginBottom: '4px',
    },
    itemStyle: {
      color: '#334155',
      fontWeight: 600,
    },
  };

  return (
    <div className="pt-6 space-y-8">
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
              <InlineDropdown
                value={chartType}
                options={['line graph', 'bar chart'] as const}
                onChange={(value) => setChartType(value)}
              />
              <InlineDropdown
                value={viewMode}
                options={['glance', 'week'] as const}
                onChange={(value) => setViewMode(value)}
              />
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar chart' ? (
                <BarChart data={trendData} barCategoryGap={responsiveBarCategoryGap} barGap={0}>
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
                    tickFormatter={(v) => `₱${Math.round(v / 1000)}k`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...tooltipProps} />
                  <Bar dataKey={activeMetric} fill={CHART_THEME_COLOR} barSize={responsiveBarSize} />
                </BarChart>
              ) : (
                <AreaChart data={trendData}>
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
                    tickFormatter={(v) => `₱${Math.round(v / 1000)}k`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...tooltipProps} />
                  <Area
                    type="linear"
                    dataKey={activeMetric}
                    stroke={CHART_THEME_COLOR}
                    strokeWidth={2}
                    fill={CHART_THEME_COLOR}
                    fillOpacity={0.2}
                    dot={true}
                    activeDot={true}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-1 items-stretch xl:grid-cols-[430px_minmax(0,1fr)] 2xl:grid-cols-[470px_minmax(0,1fr)]">
          <div className="px-5 py-4 border-b xl:border-b-0 xl:border-r border-gray-100">
            <div className="flex items-center justify-between text-sm font-normal text-brand-text mb-3.5">
              <span>Top 5 Products</span>
              <span className="text-brand-muted">Net sales</span>
            </div>
            <div className="overflow-hidden rounded-xl">
              <table className="w-full table-auto">
                <tbody>
                  {topProductRows.map((item) => {
                    const isSelected = activeProductKey === item.key;
                    return (
                      <tr
                        key={item.key}
                        onClick={() => setActiveProductKey((prev) => (prev === item.key ? 'all' : item.key))}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-violet-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-3 py-3 align-top">
                          <div className="flex items-start gap-3">
                            <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <p className="text-sm text-brand-text whitespace-normal break-words leading-5">{item.name}</p>
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
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-normal text-brand-text">
                {activeProduct ? `${activeProduct.name} sales trend` : 'Sales graph by product'}
              </h4>
              <div className="flex items-center gap-3">
                <InlineDropdown
                  value={productChartType}
                  options={['bar chart'] as const}
                  onChange={(value) => setProductChartType(value)}
                />
                <InlineDropdown
                  value={productViewMode}
                  options={['glance', 'week'] as const}
                  onChange={(value) => setProductViewMode(value)}
                />
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
                  {visibleProductSeries.map((series) => (
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

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <button type="button" className="text-sm font-semibold text-green-700 hover:text-green-800 transition-colors">
            EXPORT
          </button>
          <button type="button" className="text-brand-muted hover:text-brand-text transition-colors">
            <LayoutGrid size={18} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="text-left text-xs font-medium text-brand-muted border-b border-gray-100">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Total sales</th>
                <th className="px-5 py-3">Refund</th>
                <th className="px-5 py-3">Discount</th>
                <th className="px-5 py-3">Net sales</th>
                <th className="px-5 py-3">Product unit price</th>
                <th className="px-5 py-3">Gross profit</th>
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
            <button
              type="button"
              onClick={() => setTablePage((prev) => Math.max(0, prev - 1))}
              disabled={safeTablePage === 0}
              className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-brand-muted disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setTablePage((prev) => Math.min(totalTablePages - 1, prev + 1))}
              disabled={safeTablePage >= totalTablePages - 1}
              className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-brand-muted disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="text-sm text-brand-muted">
            Page: <span className="font-semibold text-brand-text">{safeTablePage + 1}</span> / {totalTablePages}
          </div>
          <div className="text-sm text-brand-muted">
            Page Line Count: <span className="font-semibold text-brand-text">{TABLE_PAGE_SIZE}</span>
          </div>
        </div>
      </div>

    </div>
  );
};
