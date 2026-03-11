import React from 'react';
import { useTranslation } from 'react-i18next';
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
  Search,
} from 'lucide-react';
import {
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
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
import {
  fetchDailySalesApi,
  fetchDailyOrdersApi,
  fetchExpenseSummaryApi,
  fetchBranchSalesApi,
  type ApiDailySalesItem,
  type ApiDailyOrdersItem,
  type ApiExpenseSummary,
  type ApiBranchSalesItem,
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

const categoryData = [
  { name: 'Seafood', value: 30, color: '#0f172a' },
  { name: 'Beverages', value: 25, color: '#4f46e5' },
  { name: 'Dessert', value: 25, color: '#e2e8f0' },
  { name: 'Pasta', value: 20, color: '#c7d2fe' },
];

const trendingMenus = [
  {
    name: 'Grilled Chicken Delight',
    category: 'Chicken',
    rating: 4.9,
    orders: 350,
    price: 18.0,
    image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?q=80&w=600&auto=format&fit=crop', // Grilled chicken
  },
  {
    name: 'Sunny Citrus Cake',
    category: 'Dessert',
    rating: 4.8,
    orders: 400,
    price: 8.5,
    image: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?q=80&w=600&auto=format&fit=crop', // Cake
  },
  {
    name: 'Fiery Shrimp Salad',
    category: 'Seafood',
    rating: 4.7,
    orders: 270,
    price: 12.0,
    image: 'https://images.unsplash.com/photo-1551248429-40975aa4de74?q=80&w=600&auto=format&fit=crop', // Shrimp salad
  },
];

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
}: {
  menu: (typeof trendingMenus)[number];
  key?: React.Key;
}) => (
  <div className="group cursor-pointer">
    <div className="relative mb-3 overflow-hidden rounded-2xl">
      <img
        src={menu.image}
        alt={menu.name}
        className="w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform duration-500"
        referrerPolicy="no-referrer"
      />
      <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
        <Star size={10} className="text-yellow-500 fill-yellow-500" />
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
          </div>
          <div className="flex items-center gap-1.5 text-brand-muted">
            <ClipboardList size={12} />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const VerticalCarousel = ({ items }: { items: any[] }) => {
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
              />
            ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ selectedBranch, dateRange }) => {
  const { t } = useTranslation();
  const [dashboardData, setDashboardData] = React.useState<{
    stats: DashboardStats;
    revenueData: RevenuePoint[];
    ordersOverview: { name: string; orders: number }[];
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

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

        const [dailySales, dailyOrders, expenseSummary, branchSales]: [
          ApiDailySalesItem[],
          ApiDailyOrdersItem[],
          ApiExpenseSummary,
          ApiBranchSalesItem[],
        ] = await Promise.all([
          fetchDailySalesApi(new URLSearchParams(baseParams)),
          fetchDailyOrdersApi(new URLSearchParams(baseParams)),
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

        const revenueData: RevenuePoint[] = dailySales.map((item) => ({
          name: new Date(item.sale_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          income: item.total_sales,
          // We only have a total expense summary for the period,
          // so keep per-day expenses as 0 for now.
          expense: 0,
        }));

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
                  <select className="bg-brand-bg border-none text-xs font-bold px-2 py-1 rounded-lg outline-none cursor-pointer">
                    <option>{t('dashboard.this_month')}</option>
                  </select>
                </div>
                <div className="h-48 w-full relative">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-y-3 mt-4">
                  {categoryData.map((item) => (
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
                  <select className="bg-brand-bg border-none text-xs font-bold px-2 py-1 rounded-lg outline-none cursor-pointer">
                    <option>{t('dashboard.this_week')}</option>
                  </select>
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
                  <select className="bg-brand-bg border-none text-xs font-bold px-2 py-1 rounded-lg outline-none cursor-pointer">
                    <option>{t('dashboard.this_month')}</option>
                  </select>
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
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted"
                    />
                    <input
                      type="text"
                      placeholder={t('dashboard.search_placeholder')}
                      className="bg-brand-bg border-none rounded-lg pl-8 pr-3 py-1.5 text-xs w-48 outline-none"
                    />
                  </div>
                  <select className="bg-brand-bg border-none text-xs font-bold px-2 py-1.5 rounded-lg outline-none cursor-pointer">
                    <option>{t('dashboard.this_week')}</option>
                  </select>
                  <button className="text-xs font-bold bg-brand-bg px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    {t('dashboard.see_all_orders')}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-center border border-dashed border-slate-200 rounded-2xl py-12 text-sm font-medium text-brand-muted">
                No data
              </div>
            </div>
          </div>

          <div className="w-80 space-y-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm h-full flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-base font-bold">{t('dashboard.trending_menus')}</h4>
                <select className="bg-brand-bg border-none text-xs font-bold px-2 py-1 rounded-lg outline-none cursor-pointer">
                  <option>{t('dashboard.this_week')}</option>
                </select>
              </div>
              <div className="flex-1 overflow-hidden">
                <VerticalCarousel items={trendingMenus} />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

