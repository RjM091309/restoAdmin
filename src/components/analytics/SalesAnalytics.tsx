import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Flame, ChevronDown } from 'lucide-react';
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
  { label: '28 Jan', sales: 82000 },
  { label: '29 Jan', sales: 128000 },
  { label: '30 Jan', sales: 167000 },
  { label: '31 Jan', sales: 189000 },
  { label: '01 Feb', sales: 228000 },
  { label: '02 Feb', sales: 136000 },
  { label: '03 Feb', sales: 149000 },
  { label: '04 Feb', sales: 142000 },
  { label: '05 Feb', sales: 178000 },
  { label: '06 Feb', sales: 236000 },
  { label: '07 Feb', sales: 258000 },
  { label: '08 Feb', sales: 231000 },
  { label: '09 Feb', sales: 121000 },
  { label: '10 Feb', sales: 124000 },
  { label: '11 Feb', sales: 160000 },
  { label: '12 Feb', sales: 137000 },
  { label: '13 Feb', sales: 166000 },
  { label: '14 Feb', sales: 341000 },
  { label: '15 Feb', sales: 315000 },
  { label: '16 Feb', sales: 239000 },
  { label: '17 Feb', sales: 221000 },
  { label: '18 Feb', sales: 229000 },
  { label: '19 Feb', sales: 181000 },
  { label: '20 Feb', sales: 227000 },
  { label: '21 Feb', sales: 273000 },
  { label: '22 Feb', sales: 205000 },
  { label: '23 Feb', sales: 161000 },
  { label: '24 Feb', sales: 152000 },
  { label: '25 Feb', sales: 131000 },
  { label: '26 Feb', sales: 61000 },
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

  const rows: { label: string; sales: number }[] = [];
  const cursor = new Date(startDate);
  let index = 0;

  while (cursor <= endDate && rows.length < 180) {
    const seasonal = Math.round(Math.sin(index / 2.8) * 18000);
    const trend = (index % 7) * 6500;
    const sales = Math.max(50000, 120000 + seasonal + trend);
    rows.push({
      label: formatDateLabel(cursor),
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

const money = (value: number) =>
  `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CHART_THEME_COLOR = 'rgb(139, 92, 246)';

export const SalesAnalytics: React.FC<SalesAnalyticsProps> = ({ selectedBranch, dateRange }) => {
  const isAllBranch = !selectedBranch || String(selectedBranch.id) === 'all';
  const [activeMetric, setActiveMetric] = useState<MetricKey>('totalSales');
  const [chartType, setChartType] = useState<ChartType>('bar chart');
  const [viewMode, setViewMode] = useState<ViewMode>('glance');

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
              <h4 className="text-lg font-bold text-brand-text">{activeMetricLabel}</h4>
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {isAllBranch ? (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={18} className="text-brand-muted" />
              <h4 className="text-lg font-bold text-brand-text">Branch Sales Overview</h4>
            </div>
            <div className="space-y-3">
              {MOCK_BRANCH_SALES.map((branch) => (
                <div key={branch.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                  <div>
                    <p className="font-bold text-brand-text">{branch.name}</p>
                    <p className="text-xs text-brand-muted">{branch.orders.toLocaleString()} orders</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-brand-text">{money(branch.totalSales)}</p>
                    <p className="text-xs text-green-600">+{branch.growth}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={18} className="text-brand-muted" />
              <h4 className="text-lg font-bold text-brand-text">{selectedData?.name} Sales Analytics</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs text-brand-muted mb-1">Growth</p>
                <p className="text-xl font-bold text-green-600">+{selectedData?.growth || 0}%</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs text-brand-muted mb-1">Branch</p>
                <p className="text-xl font-bold text-brand-text">{selectedData?.name}</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={18} className="text-orange-500" />
            <h4 className="text-lg font-bold text-brand-text">Top Menu</h4>
          </div>
          <div className="space-y-3">
            {topMenuItems.map((item, idx) => (
              <div key={`${item.name}-${idx}`} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="font-bold text-brand-text">{item.name}</p>
                  <p className="text-xs text-brand-muted">{item.category}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-brand-text">{money(item.sales)}</p>
                  <p className="text-xs text-brand-muted">{item.orders.toLocaleString()} sold</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
