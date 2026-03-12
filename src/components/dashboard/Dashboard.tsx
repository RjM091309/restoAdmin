import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { type Branch } from '../partials/Header';
import { SkeletonPageHeader, SkeletonStatCards, SkeletonChart, SkeletonTable } from '../ui/Skeleton';
import {
  ClipboardList,
  Package,
  TrendingUp,
  UtensilsCrossed,
  MessageSquare,
  Star,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import {
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Sector,
  BarChart,
  Bar,
  Rectangle,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getOrders, getOrderItems, ORDER_STATUS, type OrderItemRecord, type OrderRecord } from '../../services/orderService';
import { getMenus, resolveImageUrl, type MenuRecord } from '../../services/menuService';
import {
  fetchDailySalesApi,
  fetchDailyOrdersApi,
  fetchDailyExpensesApi,
  fetchExpenseSummaryApi,
  fetchBranchSalesApi,
  fetchCategoryReportApi,
  fetchTopSellingApi,
  type ApiDailySalesItem,
  type ApiDailyOrdersItem,
  type ApiDailyExpenseItem,
  type ApiExpenseSummary,
  type ApiBranchSalesItem,
  type ApiCategoryReportRow,
  type ApiTopSellingItem,
} from '../../services/analyticsService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const toYYYYMMDD = (d: Date): string =>
  d.getFullYear() +
  '-' +
  String(d.getMonth() + 1).padStart(2, '0') +
  '-' +
  String(d.getDate()).padStart(2, '0');

const getCurrentMonthRange = () => {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    start: toYYYYMMDD(firstDayOfMonth),
    end: toYYYYMMDD(today),
  };
};

const formatCurrency = (value: number) =>
  `₱${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatDateLabel = (dateStr: string) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const TOP_CATEGORY_COLORS = ['#0f172a', '#4f46e5', '#e2e8f0', '#c7d2fe', '#6366f1'];

const DEFAULT_TRENDING_IMAGE =
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?q=80&w=800&auto=format&fit=crop';

type TrendingMenuRow = {
  key: string;
  name: string;
  category: string;
  totalQty: number;
  netSales: number;
  image: string;
};

type DashboardStats = {
  totalOrders: number;
  totalSales: number;
  totalExpenses: number;
  totalProfit: number;
};

type RevenuePoint = {
  name: string;
  income: number;
  expense: number;
};

type DashboardProps = {
  selectedBranch: Branch | null;
  dateRange: {
    start: string;
    end: string;
  };
};

const PieTooltip = ({ active, payload, total }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const name = p?.name ?? p?.payload?.name ?? '';
  const value = Number(p?.value ?? 0);
  const safeTotal = Number(total ?? 0);
  const percent = safeTotal > 0 ? value / safeTotal : 0;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-md">
      <div className="text-sm font-bold text-slate-900 mb-0.5">{name}</div>
      <div className="text-xs text-slate-600">
        {formatCurrency(value)} • {(percent * 100).toFixed(1)}%
      </div>
    </div>
  );
};

const renderActiveCategorySlice = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
  return (
    <g style={{ cursor: 'pointer' }}>
      <text x={cx} y={cy} dy={4} textAnchor="middle" className="fill-slate-700 text-xs font-semibold">
        {payload?.name}
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

const parseDateSafe = (value: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isBetweenInclusive = (value: Date, start: Date, end: Date) => {
  const t = value.getTime();
  return t >= start.getTime() && t <= end.getTime();
};

const statusBadgeClass = (status: number) =>
  status === ORDER_STATUS.SETTLED
    ? 'bg-green-100 text-green-600'
    : status === ORDER_STATUS.CANCELLED
      ? 'bg-red-100 text-red-600'
      : status === ORDER_STATUS.CONFIRMED
        ? 'bg-blue-100 text-blue-600'
        : 'bg-orange-100 text-orange-600';

const orderTypeLabel = (t: any, orderType: string | null | undefined) => {
  if (!orderType) return '—';
  const normalized = orderType.trim().toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'DINE_IN') return t('orders.dine_in');
  if (normalized === 'TAKE_OUT') return t('orders.take_out');
  if (normalized === 'DELIVERY') return t('orders.delivery');
  return orderType;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const StatCard = ({
  icon: Icon,
  label,
  value,
  trend,
  trendType,
}: {
  icon: any;
  label: string;
  value: string;
  trend: string;
  trendType: 'up' | 'down';
}) => (
  <div className="bg-white p-5 rounded-2xl shadow-sm flex items-center gap-4 flex-1 min-w-[200px]">
    <div className="w-12 h-12 rounded-xl bg-brand-primary flex items-center justify-center text-white">
      <Icon size={24} />
    </div>
    <div>
      <p className="text-brand-muted text-sm font-medium mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <h3 className="text-2xl font-bold">{value}</h3>
      </div>
    </div>
  </div>
);

const TrendingMenuItem = ({
  menu,
  netSalesLabel = 'Net sales',
}: {
  menu: TrendingMenuRow;
  netSalesLabel?: string;
  key?: React.Key;
}) => (
  <div className="group cursor-pointer">
    <div className="relative mb-3 overflow-hidden rounded-2xl">
      <img
        src={menu.image || DEFAULT_TRENDING_IMAGE}
        alt={menu.name}
        className="w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform duration-500"
        referrerPolicy="no-referrer"
      />
      <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
        <Star size={10} className="text-yellow-500 fill-yellow-500" />
        <span className="text-[10px] font-bold">{formatCurrency(menu.netSales)}</span>
      </div>
    </div>
    <div className="flex items-start justify-between">
      <div>
        <h5 className="text-base font-bold group-hover:text-brand-primary transition-colors">
          {menu.name}
        </h5>
        <p className="text-xs text-brand-muted font-medium mb-2">{menu.category}</p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-brand-muted">
            <Star size={12} />
            <span className="text-xs font-bold">{netSalesLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-brand-muted">
            <ClipboardList size={12} />
            <span className="text-xs font-bold">{menu.totalQty.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const VerticalCarousel = ({
  items,
  netSalesLabel = 'Net sales',
}: {
  items: any[];
  netSalesLabel?: string;
}) => {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [items.length]);

  return (
    <div className="relative h-full overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={index}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            opacity: { duration: 0.2 },
          }}
          className="space-y-6"
        >
          {[...items, ...items, ...items]
            .slice(index, index + 3)
            .map((menu, i) => (
              <TrendingMenuItem
                key={`${menu.name}-${index}-${i}`}
                menu={menu}
                netSalesLabel={netSalesLabel}
              />
            ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ selectedBranch, dateRange }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const topCategoriesReqSeq = React.useRef(0);
  const trendingReqSeq = React.useRef(0);
  const [dashboardData, setDashboardData] = React.useState<{
    stats: DashboardStats;
    revenueData: RevenuePoint[];
    ordersOverview: { name: string; orders: number }[];
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [topCategories, setTopCategories] = React.useState<
    { name: string; value: number; color: string }[]
  >([]);
  const [loadingTopCategories, setLoadingTopCategories] = React.useState(false);
  const [activeCategoryIndex, setActiveCategoryIndex] = React.useState<number | null>(null);
  const [recentOrders, setRecentOrders] = React.useState<OrderRecord[]>([]);
  const [loadingRecentOrders, setLoadingRecentOrders] = React.useState(false);
  const [recentOrderItemsMeta, setRecentOrderItemsMeta] = React.useState<
    Record<string, { lineCount: number; totalQty: number }>
  >({});
  const [trendingMenusData, setTrendingMenusData] = React.useState<TrendingMenuRow[]>([]);
  const [loadingTrendingMenus, setLoadingTrendingMenus] = React.useState(false);
  const [menuImageByName, setMenuImageByName] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const loadBranchDashboard = async () => {
      if (!selectedBranch) {
        setDashboardData(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const fallback = getCurrentMonthRange();
        const start = dateRange.start || fallback.start;
        const end = dateRange.end || fallback.end;

        const baseParams = new URLSearchParams();
        baseParams.set('branch_id', String(selectedBranch.id));
        baseParams.set('start_date', start);
        baseParams.set('end_date', end);

        const [dailySales, dailyOrders, dailyExpenses, expenseSummary, branchSales]: [
          ApiDailySalesItem[],
          ApiDailyOrdersItem[],
          ApiDailyExpenseItem[],
          ApiExpenseSummary,
          ApiBranchSalesItem[],
        ] = await Promise.all([
          fetchDailySalesApi(new URLSearchParams(baseParams)),
          fetchDailyOrdersApi(new URLSearchParams(baseParams)),
          fetchDailyExpensesApi(new URLSearchParams(baseParams)),
          fetchExpenseSummaryApi(new URLSearchParams(baseParams)),
          fetchBranchSalesApi(new URLSearchParams(baseParams)),
        ]);

        const totalSales = dailySales.reduce(
          (sum, item) => sum + Number(item.total_sales || 0),
          0,
        );

        const totalExpenses = expenseSummary.total_expense ?? 0;
        const totalProfit = totalSales - totalExpenses;

        const branchItem = branchSales.find(
          (b) => String(b.branch_id) === String(selectedBranch.id),
        );
        const totalOrders = branchItem?.order_count ?? 0;

        // Build a map of daily expenses by date to align with daily sales
        const expenseByDate = new Map<string, number>();
        dailyExpenses.forEach((e) => {
          expenseByDate.set(e.expense_date, Number(e.total_expense || 0));
        });

        let revenueData: RevenuePoint[] = [];
        if (dailySales.length > 0) {
          revenueData = dailySales.map((item) => {
            const key = item.sale_date;
            const dailyExpense = expenseByDate.get(key) ?? 0;
            return {
              name: new Date(item.sale_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              }),
              income: item.total_sales,
              expense: dailyExpense,
            };
          });
        } else if (totalExpenses > 0) {
          // No sales data but we have expenses: show a single point using the start date as label
          revenueData = [
            {
              name: formatDateLabel(start),
              income: 0,
              expense: totalExpenses,
            },
          ];
        }

        const last7Days = dailyOrders.slice(-7);
        const ordersOverview = last7Days.map((item) => ({
          name: new Date(item.sale_date).toLocaleDateString('en-US', {
            weekday: 'short',
          }),
          orders: item.order_count,
        }));

        setDashboardData({
          stats: {
            totalOrders,
            totalSales,
            totalExpenses,
            totalProfit,
          },
          revenueData,
          ordersOverview,
        });
      } catch (error) {
        console.error('Failed to load branch dashboard data:', error);
        setDashboardData(null);
      } finally {
        setLoading(false);
      }
    };

    void loadBranchDashboard();
  }, [selectedBranch, dateRange.start, dateRange.end]);

  React.useEffect(() => {
    let cancelled = false;
    const loadMenuImages = async () => {
      if (!selectedBranch) {
        setMenuImageByName({});
        return;
      }
      try {
        const branchId = String(selectedBranch.id);
        const menus: MenuRecord[] = await getMenus(branchId);
        if (cancelled) return;
        const map: Record<string, string> = {};
        (Array.isArray(menus) ? menus : []).forEach((m) => {
          const key = (m.name || '').trim().toLowerCase();
          const resolved = resolveImageUrl(m.imageUrl);
          if (key && resolved) map[key] = resolved;
        });
        setMenuImageByName(map);
      } catch {
        if (!cancelled) setMenuImageByName({});
      }
    };
    void loadMenuImages();
    return () => {
      cancelled = true;
    };
  }, [selectedBranch?.id]);

  React.useEffect(() => {
    const loadRecentOrders = async () => {
      if (!selectedBranch) {
        setRecentOrders([]);
        return;
      }

      const fallback = getCurrentMonthRange();
      const startStr = dateRange.start || fallback.start;
      const endStr = dateRange.end || fallback.end;
      const start = new Date(`${startStr}T00:00:00`);
      const end = new Date(`${endStr}T23:59:59`);

      setLoadingRecentOrders(true);
      try {
        const branchId = String(selectedBranch.id);
        const all = await getOrders(branchId);
        const filtered = (Array.isArray(all) ? all : [])
          .filter((o) => {
            const d = parseDateSafe(o.ENCODED_DT);
            return d ? isBetweenInclusive(d, start, end) : false;
          })
          .sort((a, b) => {
            const ad = parseDateSafe(a.ENCODED_DT)?.getTime() ?? 0;
            const bd = parseDateSafe(b.ENCODED_DT)?.getTime() ?? 0;
            return bd - ad;
          })
          .slice(0, 5);
        setRecentOrders(filtered);
      } catch (err) {
        console.error('Failed to load recent orders:', err);
        setRecentOrders([]);
      } finally {
        setLoadingRecentOrders(false);
      }
    };

    void loadRecentOrders();
  }, [selectedBranch, dateRange.start, dateRange.end]);

  React.useEffect(() => {
    let cancelled = false;
    const loadRecentOrderItemCounts = async () => {
      if (!recentOrders.length) {
        setRecentOrderItemsMeta({});
        return;
      }
      try {
        const results = await Promise.all(
          recentOrders.map(async (o) => {
            try {
              const items: OrderItemRecord[] = await getOrderItems(String(o.IDNo));
              const totalQty = (Array.isArray(items) ? items : []).reduce(
                (sum, it) => sum + Number(it.QTY || 0),
                0
              );
              return [String(o.IDNo), { lineCount: Array.isArray(items) ? items.length : 0, totalQty }] as const;
            } catch {
              return [String(o.IDNo), { lineCount: 0, totalQty: 0 }] as const;
            }
          })
        );
        if (cancelled) return;
        setRecentOrderItemsMeta(Object.fromEntries(results));
      } catch {
        if (!cancelled) setRecentOrderItemsMeta({});
      }
    };
    void loadRecentOrderItemCounts();
    return () => {
      cancelled = true;
    };
  }, [recentOrders]);

  React.useEffect(() => {
    const loadTopCategories = async () => {
      const reqId = ++topCategoriesReqSeq.current;
      if (!selectedBranch) {
        setTopCategories([]);
        return;
      }

      const fallback = getCurrentMonthRange();
      const start = dateRange.start || fallback.start;
      const end = dateRange.end || fallback.end;

      const params = new URLSearchParams();
      params.set('start_date', start);
      params.set('end_date', end);
      if (String(selectedBranch.id) !== 'all') {
        params.set('branch_id', String(selectedBranch.id));
      }

      // Keep previous categories while loading to avoid "No data" flicker on fast date changes.
      setLoadingTopCategories(true);
      try {
        // Retry once on transient backend slowness (PyServer sometimes returns empty during warm-up).
        let rows: ApiCategoryReportRow[] = [];
        for (let attempt = 0; attempt < 2; attempt++) {
          rows = await fetchCategoryReportApi(params);
          if (rows && rows.length > 0) break;
          // Wait a bit before retrying (but bail if a newer request started).
          if (reqId !== topCategoriesReqSeq.current) return;
          if (attempt === 0) await sleep(450);
        }
        if (reqId !== topCategoriesReqSeq.current) return; // ignore stale response
        // API is already ordered by totalSales DESC; show Top 5 only.
        const mapped = rows.slice(0, 5).map((row, i) => ({
          name: row.category || 'Uncategorized',
          value: row.netSales ?? 0,
          color: TOP_CATEGORY_COLORS[i % TOP_CATEGORY_COLORS.length],
        }));
        setTopCategories(mapped);
      } catch (err) {
        if (reqId !== topCategoriesReqSeq.current) return;
        console.error('Failed to load top categories:', err);
        // Do not force-clear; keep previous data if any.
        setTopCategories((prev) => prev);
      } finally {
        if (reqId === topCategoriesReqSeq.current) setLoadingTopCategories(false);
      }
    };

    void loadTopCategories();
  }, [selectedBranch, dateRange.start, dateRange.end]);

  React.useEffect(() => {
    const loadTrendingMenus = async () => {
      const reqId = ++trendingReqSeq.current;
      if (!selectedBranch) {
        setTrendingMenusData([]);
        return;
      }

      const fallback = getCurrentMonthRange();
      const start = dateRange.start || fallback.start;
      const end = dateRange.end || fallback.end;

      const params = new URLSearchParams();
      params.set('start_date', start);
      params.set('end_date', end);
      if (String(selectedBranch.id) !== 'all') {
        params.set('branch_id', String(selectedBranch.id));
      }
      params.set('limit', '5');

      setLoadingTrendingMenus(true);
      try {
        // Same source as Sales Report -> Menu Top 5 Products
        let rows: ApiTopSellingItem[] = [];
        for (let attempt = 0; attempt < 2; attempt++) {
          rows = await fetchTopSellingApi(params);
          if (rows && rows.length > 0) break;
          if (reqId !== trendingReqSeq.current) return;
          if (attempt === 0) await sleep(450);
        }
        if (reqId !== trendingReqSeq.current) return;

        setTrendingMenusData(
          (Array.isArray(rows) ? rows : []).slice(0, 5).map((r, idx) => {
            const name = r.MENU_NAME || '';
            const img = menuImageByName[name.trim().toLowerCase()] || DEFAULT_TRENDING_IMAGE;
            return {
              key: String(r.IDNo ?? idx),
              name,
              category: r.category || 'Uncategorized',
              totalQty: Number(r.total_quantity ?? 0),
              netSales: Number(r.total_revenue ?? 0),
              image: img,
            };
          })
        );
      } catch (err) {
        if (reqId !== trendingReqSeq.current) return;
        console.error('Failed to load trending menus:', err);
        setTrendingMenusData((prev) => prev);
      } finally {
        if (reqId === trendingReqSeq.current) setLoadingTrendingMenus(false);
      }
    };

    void loadTrendingMenus();
  }, [selectedBranch, dateRange.start, dateRange.end, menuImageByName]);

  const orderTypes = [
    {
      label: t('dashboard.dine_in'),
      value: 900,
      percentage: 45,
      icon: UtensilsCrossed,
      color: 'bg-orange-100 text-orange-600',
    },
    {
      label: t('dashboard.takeaway'),
      value: 600,
      percentage: 30,
      icon: Package,
      color: 'bg-slate-200 text-slate-700',
    },
    {
      label: t('dashboard.online'),
      value: 500,
      percentage: 25,
      icon: MessageSquare,
      color: 'bg-orange-50 text-orange-700',
    },
  ];

  return (
    <AnimatePresence mode="wait">
      {loading || !dashboardData ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex gap-8 pt-6"
        >
          <div className="flex-1 space-y-8">
            <SkeletonStatCards count={3} />
            <div className="grid grid-cols-3 gap-6">
              <SkeletonChart className="col-span-2" />
              <SkeletonChart />
            </div>
            <div className="grid grid-cols-3 gap-6">
              <SkeletonChart className="col-span-2" />
              <SkeletonChart />
            </div>
            <SkeletonTable columns={7} rows={5} showToolbar={false} />
          </div>
          <div className="w-80 space-y-8">
            <SkeletonChart />
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex gap-8 pt-6"
        >
          <div className="flex-1 space-y-8">
            <div className="flex gap-6">
              <StatCard
                icon={ClipboardList}
                label={t('dashboard.total_orders')}
                value={dashboardData
                  ? dashboardData.stats.totalOrders.toLocaleString()
                  : '0'}
                trend=""
                trendType="up"
              />
              <StatCard
                icon={Package}
                label="Total Expenses"
                value={
                  dashboardData
                    ? formatCurrency(dashboardData.stats.totalExpenses)
                    : formatCurrency(0)
                }
                trend=""
                trendType="down"
              />
              <StatCard
                icon={TrendingUp}
                label="Total Profit"
                value={
                  dashboardData
                    ? formatCurrency(dashboardData.stats.totalProfit)
                    : formatCurrency(0)
                }
                trend=""
                trendType="up"
              />
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 bg-white p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h4 className="text-base text-brand-muted font-medium">{t('dashboard.total_revenue')}</h4>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-brand-primary" />
                      <span className="text-sm font-medium">{t('dashboard.income')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-brand-text" />
                      <span className="text-sm font-medium">{t('dashboard.expense')}</span>
                    </div>
                  </div>
                </div>
                <div className="h-64 w-full">
                  {dashboardData.revenueData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-brand-muted border border-dashed border-slate-200 rounded-2xl">
                      No data
                    </div>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <ComposedChart data={dashboardData.revenueData}>
                      <defs>
                        <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0f172a" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        tickFormatter={(value: number) =>
                          value === 0 ? '' : formatCurrency(value as number)
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '12px',
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                        labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                        formatter={(value: number, _name: string, props: any) => [
                          formatCurrency(value as number),
                          props.dataKey === 'income'
                            ? t('dashboard.income')
                            : t('dashboard.expense'),
                        ]}
                        labelFormatter={(label: string) => label}
                      />
                      <Area
                        type="monotone"
                        dataKey="income"
                        name={t('dashboard.income')}
                        fill="url(#incomeGradient)"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#4f46e5', strokeWidth: 0 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="expense"
                        name={t('dashboard.expense')}
                        fill="url(#expenseGradient)"
                        stroke="#0f172a"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#0f172a', strokeWidth: 0 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-base font-bold">{t('dashboard.top_categories')}</h4>
                </div>
                <div className="h-48 w-full relative">
                  {loadingTopCategories ? (
                    <div className="h-full flex items-center justify-center text-sm text-brand-muted border border-dashed border-slate-200 rounded-2xl">
                      {t('common.loading')}
                    </div>
                  ) : topCategories.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-brand-muted border border-dashed border-slate-200 rounded-2xl">
                      No data
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                      <PieChart>
                        <Tooltip
                          content={({ active, payload }) => (
                            <PieTooltip
                              active={active}
                              payload={payload}
                              total={topCategories.reduce((s, it) => s + Number(it.value || 0), 0)}
                            />
                          )}
                          contentStyle={{
                            borderRadius: '12px',
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          }}
                        />
                      {/*
                        Recharts Pie supports activeIndex/activeShape at runtime,
                        but some type versions omit these props. Cast for TS.
                      */}
                      {(Pie as any)(
                        {
                          data: topCategories,
                          cx: '50%',
                          cy: '50%',
                          innerRadius: 60,
                          outerRadius: 80,
                          paddingAngle: 5,
                          dataKey: 'value',
                          activeIndex: activeCategoryIndex ?? undefined,
                          activeShape: renderActiveCategorySlice,
                          onMouseLeave: () => setActiveCategoryIndex(null),
                          children: topCategories.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color}
                              style={{ cursor: 'pointer', transition: 'opacity 150ms ease' }}
                              onMouseEnter={() => setActiveCategoryIndex(index)}
                            />
                          )),
                        },
                        null
                      )}
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-y-3 mt-4">
                  {topCategories.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs font-medium text-brand-muted">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 bg-white p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h4 className="text-base font-bold">{t('dashboard.orders_overview')}</h4>
                </div>
                <div className="h-64 w-full">
                  {dashboardData.ordersOverview.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-brand-muted border border-dashed border-slate-200 rounded-2xl">
                      No data
                    </div>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <BarChart data={dashboardData.ordersOverview}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#64748b' }}
                      />
                      <Tooltip
                        cursor={{ fill: '#4f46e5', opacity: 0.1 }}
                        contentStyle={{
                          borderRadius: '12px',
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                        labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                        itemStyle={{ color: '#4f46e5'}}
                        formatter={(value: number) => [
                          value,
                          t('dashboard.total_orders'),
                        ]}
                        labelFormatter={(label: string) => label}
                      />
                      <Bar
                        dataKey="orders"
                        name={t('dashboard.total_orders')}
                        fill="#c7d2fe"
                        radius={[6, 6, 0, 0]}
                        activeBar={<Rectangle fill="#4f46e5" />}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h4 className="text-base font-bold">{t('dashboard.order_types')}</h4>
                </div>
                <div className="space-y-6">
                  {orderTypes.map((type) => (
                    <div key={type.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center',
                            type.color,
                          )}
                        >
                          <type.icon size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{type.label}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-base font-bold">{t('dashboard.recent_orders')}</h4>
                <button
                  type="button"
                  onClick={() => navigate(`/orders${location.search || ''}`)}
                  className="text-xs font-bold bg-brand-bg px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  {t('dashboard.see_all_orders')}
                </button>
              </div>
              {loadingRecentOrders ? (
                <div className="flex items-center justify-center border border-dashed border-slate-200 rounded-2xl py-12 text-sm font-medium text-brand-muted">
                  {t('common.loading')}
                </div>
              ) : recentOrders.length === 0 ? (
                <div className="flex items-center justify-center border border-dashed border-slate-200 rounded-2xl py-12 text-sm font-medium text-brand-muted">
                  No data
                </div>
              ) : (
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 grid grid-cols-[minmax(0,1fr)_110px_120px_140px_110px] items-center gap-3">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Order #</div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide text-center">Type</div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide text-center">Order Items</div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide text-right">Total Amount</div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide text-right">Status</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {recentOrders.map((o) => {
                      const dt = parseDateSafe(o.ENCODED_DT);
                      const dateLabel = dt
                        ? dt.toLocaleString(undefined, {
                            month: 'short',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : o.ENCODED_DT;

                      const meta = recentOrderItemsMeta[String(o.IDNo)];
                      const totalQty = meta?.totalQty ?? 0;

                      return (
                        <div
                          key={o.IDNo}
                          className="px-4 py-3 grid grid-cols-[minmax(0,1fr)_110px_120px_140px_110px] items-center gap-3 hover:bg-slate-50 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-extrabold text-slate-900 truncate">{o.ORDER_NO}</div>
                            </div>
                            <div className="text-xs text-brand-muted font-medium truncate">{dateLabel}</div>
                          </div>

                          <div className="flex items-center justify-center">
                            {o.ORDER_TYPE ? (
                              <span className="text-[10px] font-bold bg-gray-100 px-2 py-1 rounded-lg whitespace-nowrap">
                                {orderTypeLabel(t, o.ORDER_TYPE)}
                              </span>
                            ) : (
                              <span className="text-brand-muted text-sm">—</span>
                            )}
                          </div>

                          <div className="flex items-center justify-center">
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                              {totalQty ? totalQty : '—'}
                            </span>
                          </div>

                          <div className="text-sm font-extrabold text-slate-900 whitespace-nowrap text-right">
                            {formatCurrency(Number(o.GRAND_TOTAL || 0))}
                          </div>

                          <div className="flex items-center justify-end">
                            <span
                              className={cn(
                                'text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap',
                                statusBadgeClass(Number(o.STATUS))
                              )}
                            >
                              {Number(o.STATUS) === ORDER_STATUS.PENDING
                                ? t('orders.pending')
                                : Number(o.STATUS) === ORDER_STATUS.CONFIRMED
                                  ? t('orders.confirmed')
                                  : Number(o.STATUS) === ORDER_STATUS.SETTLED
                                    ? t('orders.settled')
                                    : Number(o.STATUS) === ORDER_STATUS.CANCELLED
                                      ? t('orders.cancelled')
                                      : t('orders.unknown')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-80 space-y-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm h-full flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-base font-bold">{t('dashboard.trending_menus')}</h4>
              </div>
              <div className="flex-1 overflow-hidden">
                {loadingTrendingMenus ? (
                  <div className="h-full flex items-center justify-center text-sm text-brand-muted border border-dashed border-slate-200 rounded-2xl py-8">
                    <span className="animate-pulse">{t('common.loading')}</span>
                  </div>
                ) : trendingMenusData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-brand-muted border border-dashed border-slate-200 rounded-2xl py-8">
                    No data
                  </div>
                ) : (
                  <VerticalCarousel
                    items={trendingMenusData}
                    netSalesLabel={t('sales_analytics.net_sales') || 'Net sales'}
                  />
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

