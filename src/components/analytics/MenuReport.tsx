import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AlertCircle, Loader2, Search, Store } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { type Branch } from '../partials/Header';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import {
  fetchDailySalesApi,
  fetchMenuReportApi,
  fetchTopSellingApi,
  type ApiDailySalesItem,
  type ApiMenuReportRow,
  type ApiTopSellingItem,
} from '../../services/analyticsService';

/** Measures container and renders chart with explicit width/height to avoid Recharts -1 warning */
function ChartContainer({
  className = '',
  render,
}: {
  className?: string;
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
    <div ref={ref} className={className} style={{ minHeight: 240 }}>
      {size.width > 0 && size.height > 0 ? render(size) : null}
    </div>
  );
}

type MenuReportProps = {
  selectedBranch: Branch | null;
  dateRange: {
    start: string;
    end: string;
  };
};

type MenuReportRow = {
  id: string;
  goods: string;
  category: string;
  salesQty: number;
  totalSales: number;
  refundQty: number;
  refundAmount: number;
  discounts: number;
  netSales: number;
  unitCost: number;
  totalRevenue: number;
};

const MOCK_MENU_REPORT_BASE: Omit<MenuReportRow, 'id'>[] = [];

const BRANCH_BAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

type TopProductRow = {
  key: string;
  name: string;
  color: string;
  netSales: number;
};

const parseDateSafe = (value: string) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

export const MenuReport: React.FC<MenuReportProps> = ({ selectedBranch, dateRange }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [rows, setRows] = useState<MenuReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(true);

  const [topSellingData, setTopSellingData] = useState<ApiTopSellingItem[]>([]);
  const [topSellingLoading, setTopSellingLoading] = useState(false);
  const [topSellingError, setTopSellingError] = useState<string | null>(null);

  const [dailySalesCurrent, setDailySalesCurrent] = useState<ApiDailySalesItem[]>([]);
  /** When set, chart shows only this product's bar; when null, shows stacked bars for all. */
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);

  const money = (value: number) =>
    `${t('common.currency_symbol')}${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  useEffect(() => {
    const load = async () => {
      setReportLoading(true);
      const params = new URLSearchParams();
      if (dateRange.start) params.set('start_date', dateRange.start);
      if (dateRange.end) params.set('end_date', dateRange.end);
      if (selectedBranch && String(selectedBranch.id) !== 'all') {
        params.set('branch_id', String(selectedBranch.id));
      }
      try {
        const apiRows: ApiMenuReportRow[] = await fetchMenuReportApi(params);
        setRows(
          apiRows.map((row) => ({
            id: String(row.id),
            goods: row.goods,
            category: row.category,
            salesQty: row.salesQty,
            totalSales: row.totalSales,
            refundQty: row.refundQty,
            refundAmount: row.refundAmount,
            discounts: row.discounts,
            netSales: row.netSales,
            unitCost: row.unitCost,
            totalRevenue: row.totalRevenue,
          }))
        );
      } catch (err) {
        console.error('Failed to load menu report', err);
        setRows([]);
      } finally {
        setReportLoading(false);
      }
    };

    void load();
  }, [dateRange.start, dateRange.end, selectedBranch?.id]);

  useEffect(() => {
    const loadTopSelling = async () => {
      setTopSellingLoading(true);
      setTopSellingError(null);
      try {
        const params = new URLSearchParams();
        if (dateRange.start) params.set('start_date', dateRange.start);
        if (dateRange.end) params.set('end_date', dateRange.end);
        if (selectedBranch && String(selectedBranch.id) !== 'all') {
          params.set('branch_id', String(selectedBranch.id));
        }
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
    };

    void loadTopSelling();
  }, [dateRange.start, dateRange.end, selectedBranch?.id, t]);

  useEffect(() => {
    const loadDailySales = async () => {
      try {
        if (!dateRange.start || !dateRange.end) {
          setDailySalesCurrent([]);
          return;
        }

        const paramsCurrent = new URLSearchParams();
        paramsCurrent.set('start_date', dateRange.start);
        paramsCurrent.set('end_date', dateRange.end);
        if (selectedBranch && String(selectedBranch.id) !== 'all') {
          paramsCurrent.set('branch_id', String(selectedBranch.id));
        }

        const currentData = await fetchDailySalesApi(paramsCurrent);
        setDailySalesCurrent(currentData);
      } catch (err) {
        console.error(err);
        setDailySalesCurrent([]);
      }
    };

    void loadDailySales();
  }, [dateRange.start, dateRange.end, selectedBranch?.id]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      row.goods.toLowerCase().includes(keyword) || row.category.toLowerCase().includes(keyword)
    );
  }, [rows, searchTerm]);

  const columns: ColumnDef<MenuReportRow>[] = [
    {
      header: t('menu_report.columns.goods'),
      accessorKey: 'goods',
      className: 'min-w-[180px] border-r border-gray-200',
    },
    {
      header: t('menu_report.columns.category'),
      accessorKey: 'category',
      className: 'min-w-[170px]',
    },
    {
      header: t('menu_report.columns.sales_quantity'),
      render: (item) => item.salesQty.toLocaleString(),
      className: 'min-w-[130px] text-right',
    },
    {
      header: t('menu_report.columns.total_sales'),
      render: (item) => money(item.totalSales),
      className: 'min-w-[130px] text-right',
    },
    {
      header: t('menu_report.columns.refund_quantity'),
      render: (item) => item.refundQty.toLocaleString(),
      className: 'min-w-[130px] text-right',
    },
    {
      header: t('menu_report.columns.refund_amount'),
      render: (item) => money(item.refundAmount),
      className: 'min-w-[130px] text-right',
    },
    {
      header: t('menu_report.columns.discounts'),
      render: (item) => money(item.discounts),
      className: 'min-w-[120px] text-right',
    },
    {
      header: t('menu_report.columns.net_sales'),
      render: (item) => money(item.netSales),
      className: 'min-w-[120px] text-right',
    },
    {
      header: t('menu_report.columns.unit_cost'),
      render: (item) => money(item.unitCost),
      className: 'min-w-[110px] text-right',
    },
    {
      header: t('menu_report.columns.total_revenue'),
      render: (item) => money(item.totalRevenue),
      className: 'min-w-[140px] text-right',
    },
  ];

  // --- Export Functions (CSV + PDF) ---
  const handleExportCsv = () => {
    const headers = [
      t('menu_report.columns.goods'),
      t('menu_report.columns.category'),
      t('menu_report.columns.sales_quantity'),
      t('menu_report.columns.total_sales'),
      t('menu_report.columns.refund_quantity'),
      t('menu_report.columns.refund_amount'),
      t('menu_report.columns.discounts'),
      t('menu_report.columns.net_sales'),
      t('menu_report.columns.unit_cost'),
      t('menu_report.columns.total_revenue'),
    ];

    const escapeCell = (value: string) => {
      const needsQuotes = /[",\n]/.test(value);
      const safe = value.replace(/"/g, '""');
      return needsQuotes ? `"${safe}"` : safe;
    };

    const rowsForCsv = filteredRows.map((row) => [
      row.goods,
      row.category,
      row.salesQty.toString(),
      row.totalSales.toString(),
      row.refundQty.toString(),
      row.refundAmount.toString(),
      row.discounts.toString(),
      row.netSales.toString(),
      row.unitCost.toString(),
      row.totalRevenue.toString(),
    ]);

    const csv = [
      headers.map(escapeCell).join(','),
      ...rowsForCsv.map((r) => r.map(escapeCell).join(',')),
    ].join('\n');

    const branchNameStr = selectedBranch ? selectedBranch.name : 'All_Branches';
    const cleanBranchName = branchNameStr.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `menu_report_${cleanBranchName}_${dateRange.start}_to_${dateRange.end}.csv`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF('l', 'pt', 'a4');

    const headers = [
      t('menu_report.columns.goods'),
      t('menu_report.columns.category'),
      t('menu_report.columns.sales_quantity'),
      t('menu_report.columns.total_sales'),
      t('menu_report.columns.refund_quantity'),
      t('menu_report.columns.refund_amount'),
      t('menu_report.columns.discounts'),
      t('menu_report.columns.net_sales'),
      t('menu_report.columns.unit_cost'),
      t('menu_report.columns.total_revenue'),
    ];

    const body = filteredRows.map((row) => [
      row.goods,
      row.category,
      row.salesQty.toLocaleString(),
      money(row.totalSales),
      row.refundQty.toLocaleString(),
      money(row.refundAmount),
      money(row.discounts),
      money(row.netSales),
      money(row.unitCost),
      money(row.totalRevenue),
    ]);

    autoTable(doc, {
      head: [headers],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [56, 189, 248] },
      margin: { top: 40 },
    });

    const branchNameStr = selectedBranch ? selectedBranch.name : 'All_Branches';
    const cleanBranchName = branchNameStr.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `menu_report_${cleanBranchName}_${dateRange.start}_to_${dateRange.end}.pdf`;

    doc.save(filename);
  };

  // Same net sales computation as SalesAnalytics: net_sales = total_sales - refund - discount
  const trendData = useMemo(
    () =>
      dailySalesCurrent.map((item) => {
        const parsed = parseDateSafe(item.sale_date);
        const label = parsed ? formatDateLabel(parsed) : item.sale_date;
        const totalSales = Number(item.total_sales || 0);
        const refund = Number((item as any).refund ?? 0);
        const discount = Number((item as any).discount ?? 0);
        const netSales =
          (item as any).net_sales != null
            ? Number((item as any).net_sales)
            : Math.max(0, totalSales - refund - discount);
        return { label, netSales };
      }),
    [dailySalesCurrent]
  );

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

  // Net sales from menu report rows (same source as SalesAnalytics logic); match by product name
  const baseTopProducts: TopProductRow[] = useMemo(
    () =>
      topSellingData.map((item, index) => {
        const menuRow = rows.find((r) => r.goods === item.MENU_NAME);
        const netSales = menuRow != null ? menuRow.netSales : item.total_revenue;
        return {
          key: String(item.IDNo ?? index),
          name: item.MENU_NAME,
          color: BRANCH_BAR_COLORS[index % BRANCH_BAR_COLORS.length],
          netSales,
        };
      }),
    [topSellingData, rows]
  );

  const productShares = useMemo(() => {
    if (!baseTopProducts.length) return {} as Record<string, number>;
    const totalRevenue = baseTopProducts.reduce((sum, p) => sum + (p.netSales || 0), 0);
    if (totalRevenue <= 0) {
      const equalShare = 1 / baseTopProducts.length;
      return Object.fromEntries(
        baseTopProducts.map((p) => [p.key, equalShare])
      ) as Record<string, number>;
    }
    return Object.fromEntries(
      baseTopProducts.map((p) => [p.key, (p.netSales || 0) / totalRevenue])
    ) as Record<string, number>;
  }, [baseTopProducts]);

  const productGraphData = useMemo(() => {
    if (!baseTopProducts.length || !trendData.length) return [];

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
        const share = normalizedShares[p.key] ?? 1 / baseTopProducts.length;
        entry[p.key] = Math.round(total * share);
      });

      return entry;
    });
  }, [trendData, baseTopProducts, productShares]);

  const topProductRows: TopProductRow[] = useMemo(() => {
    if (!baseTopProducts.length || !productGraphData.length) return baseTopProducts;

    const totals: Record<string, number> = {};
    productGraphData.forEach((day) => {
      baseTopProducts.forEach((p) => {
        const value = Number((day as any)[p.key] || 0);
        totals[p.key] = (totals[p.key] || 0) + value;
      });
    });

    return baseTopProducts.map((p) => ({
      ...p,
      netSales: totals[p.key] || 0,
    }));
  }, [baseTopProducts, productGraphData]);

  const tooltipProps = {
    formatter: (value: number) => money(Number(value)),
    cursor: false as const,
    contentStyle: {
      backgroundColor: '#ffffff',
      border: 'none',
      borderRadius: '10px',
      boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
    },
    labelStyle: { color: '#0f172a', fontWeight: 700, marginBottom: '4px' },
    itemStyle: { color: '#334155', fontWeight: 600 },
  };

  return (
    <div className="pt-6 space-y-4">
      <AnimatePresence mode="wait">
        {reportLoading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-10 w-80 rounded-xl" />
              <Skeleton className="h-9 w-24 rounded-lg" />
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden p-5">
              <div className="grid grid-cols-1 xl:grid-cols-[430px_minmax(0,1fr)] 2xl:grid-cols-[470px_minmax(0,1fr)] gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-32 rounded-lg" />
                    <Skeleton className="h-4 w-16 rounded-lg" />
                  </div>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-6 w-48 rounded-lg" />
                  <Skeleton className="h-60 w-full min-h-[240px] rounded-2xl" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden p-5">
              <Skeleton className="h-10 w-full rounded-lg mb-2" />
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg mb-1" />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="space-y-4"
          >
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t('menu_report.search_placeholder')}
            className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center justify-center h-9 w-9 rounded-lg bg-green-50 hover:bg-green-100 transition-colors cursor-pointer"
          >
            <img src="/csv.png" alt="CSV export" className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="flex items-center justify-center h-9 w-9 rounded-lg bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
          >
            <img src="/pdf.png" alt="PDF export" className="h-6 w-6" />
          </button>
        </div>
      </div>

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
                    onClick={() => {
                      // simple re-trigger by changing state dependency
                      setTopSellingError(null);
                    }}
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
                      const isSelected = selectedProductKey === item.key;
                      return (
                        <tr
                          key={item.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedProductKey((prev) => (prev === item.key ? null : item.key))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedProductKey((prev) => (prev === item.key ? null : item.key));
                            }
                          }}
                          className={`transition-colors cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-violet-50 ring-1 ring-violet-200 ring-inset rounded-lg' : ''}`}
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
                {t('sales_analytics.sales_graph_by_product')}
              </h4>
            </div>
            <ChartContainer
              className="w-full min-w-0 h-60 min-h-[240px]"
              render={({ width, height }) => (
                <BarChart
                  width={width}
                  height={height}
                  data={productGraphData}
                  barCategoryGap={responsiveBarCategoryGap}
                  barGap={0}
                >
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
                  {selectedProductKey ? (
                    (() => {
                      const series = topProductRows.find((s) => s.key === selectedProductKey);
                      if (!series) return null;
                      return (
                        <Bar
                          key={series.key}
                          dataKey={series.key}
                          fill={series.color}
                          barSize={responsiveBarSize}
                        />
                      );
                    })()
                  ) : (
                    topProductRows.map((series) => (
                      <Bar
                        key={series.key}
                        dataKey={series.key}
                        stackId="products"
                        fill={series.color}
                        barSize={responsiveBarSize}
                      />
                    ))
                  )}
                </BarChart>
              )}
            />
          </div>
        </div>
      </div>

      <DataTable data={filteredRows} columns={columns} keyExtractor={(item) => item.id} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
