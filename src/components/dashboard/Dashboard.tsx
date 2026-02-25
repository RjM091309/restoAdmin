import React from 'react';
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

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const categoryData = [
  { name: 'Seafood', value: 30, color: '#0f172a' },
  { name: 'Beverages', value: 25, color: '#4f46e5' },
  { name: 'Dessert', value: 25, color: '#e2e8f0' },
  { name: 'Pasta', value: 20, color: '#c7d2fe' },
];

const ordersOverviewData = [
  { name: 'Mon', orders: 120 },
  { name: 'Tue', orders: 130 },
  { name: 'Wed', orders: 140 },
  { name: 'Thu', orders: 185 },
  { name: 'Fri', orders: 150 },
  { name: 'Sat', orders: 145 },
  { name: 'Sun', orders: 140 },
];

const recentOrders = [
  {
    id: 'ORD1025',
    menu: 'Salmon Sushi Roll',
    category: 'Seafood',
    qty: 3,
    amount: 30.0,
    customer: 'Dana White',
    status: 'On Process',
    image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?q=80&w=200&auto=format&fit=crop', // Sushi
  },
  {
    id: 'ORD1026',
    menu: 'Grilled Chicken',
    category: 'Chicken',
    qty: 1,
    amount: 18.0,
    customer: 'John Doe',
    status: 'Completed',
    image: 'https://images.unsplash.com/photo-1598514982205-f36b96d1e8d4?q=80&w=200&auto=format&fit=crop', // Chicken
  },
  {
    id: 'ORD1027',
    menu: 'Pasta Carbonara',
    category: 'Pasta',
    qty: 2,
    amount: 24.0,
    customer: 'Jane Smith',
    status: 'Pending',
    image: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?q=80&w=200&auto=format&fit=crop', // Pasta
  },
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
  orders: string;
  customers: string;
  revenue: string;
};

type RevenuePoint = {
  name: string;
  income: number;
  expense: number;
};

type DashboardProps = {
  selectedBranch: Branch | null;
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
        <span
          className={cn(
            'text-xs font-bold flex items-center gap-0.5',
            trendType === 'up' ? 'text-green-500' : 'text-red-500',
          )}
        >
          {trendType === 'up' ? (
            <TrendingUp size={12} />
          ) : (
            <TrendingUp size={12} />
          )}
          {trend}
        </span>
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
        <span className="text-xs font-bold">{menu.rating}</span>
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
            <span className="text-xs font-bold">{menu.rating}</span>
          </div>
          <div className="flex items-center gap-1.5 text-brand-muted">
            <ClipboardList size={12} />
            <span className="text-xs font-bold">{menu.orders}</span>
          </div>
        </div>
      </div>
      <p className="text-xl font-bold text-brand-primary">${menu.price.toFixed(2)}</p>
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

export const Dashboard: React.FC<DashboardProps> = ({ selectedBranch }) => {
  const [dashboardData, setDashboardData] = React.useState<{
    dynamicStats: DashboardStats;
    dynamicRevenueData: RevenuePoint[];
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (selectedBranch) {
      const fetchData = async () => {
        setLoading(true);
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`/api/dashboard-data?branchId=${selectedBranch.id}`, {
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          const json = await res.json();
          if (json.success) {
            setDashboardData(json.data);
          }
        } catch (error) {
          console.error("Failed to fetch dashboard data:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [selectedBranch]);

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
                label="Total Orders"
                value={dashboardData.dynamicStats.orders}
                trend="1.58%"
                trendType="up"
              />
              <StatCard
                icon={Package}
                label="Total Customer"
                value={dashboardData.dynamicStats.customers}
                trend="0.42%"
                trendType="down"
              />
              <StatCard
                icon={TrendingUp}
                label="Total Revenue"
                value={dashboardData.dynamicStats.revenue}
                trend="2.36%"
                trendType="up"
              />
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 bg-white p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h4 className="text-base text-brand-muted font-medium">Total Revenue</h4>
                    <p className="text-3xl font-bold">{dashboardData.dynamicStats.revenue}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-brand-primary" />
                        <span className="text-sm font-medium">Income</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-brand-text" />
                        <span className="text-sm font-medium">Expense</span>
                      </div>
                    </div>
                    <select className="bg-brand-bg border-none text-xs font-bold px-2 py-1 rounded-lg outline-none cursor-pointer">
                      <option>Last 8 Months</option>
                    </select>
                  </div>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <ComposedChart data={dashboardData.dynamicRevenueData}>
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
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '12px',
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                        labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="income"
                        fill="url(#incomeGradient)"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#4f46e5', strokeWidth: 0 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="expense"
                        fill="url(#expenseGradient)"
                        stroke="#0f172a"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#0f172a', strokeWidth: 0 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-base font-bold">Top Categories</h4>
                  <select className="bg-brand-bg border-none text-xs font-bold px-2 py-1 rounded-lg outline-none cursor-pointer">
                    <option>This Month</option>
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
                      <span className="text-xs font-bold">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 bg-white p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h4 className="text-base font-bold">Orders Overview</h4>
                  <select className="bg-brand-bg border-none text-xs font-bold px-2 py-1 rounded-lg outline-none cursor-pointer">
                    <option>This Week</option>
                  </select>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <BarChart data={ordersOverviewData}>
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
                      />
                      <Bar
                        dataKey="orders"
                        fill="#c7d2fe"
                        radius={[6, 6, 0, 0]}
                        activeBar={<Rectangle fill="#4f46e5" />}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h4 className="text-base font-bold">Order Types</h4>
                  <select className="bg-brand-bg border-none text-xs font-bold px-2 py-1 rounded-lg outline-none cursor-pointer">
                    <option>This Month</option>
                  </select>
                </div>
                <div className="space-y-6">
                  {[
                    {
                      label: 'Dine-In',
                      value: 900,
                      percentage: 45,
                      icon: UtensilsCrossed,
                      color: 'bg-orange-100 text-orange-600',
                    },
                    {
                      label: 'Takeaway',
                      value: 600,
                      percentage: 30,
                      icon: Package,
                      color: 'bg-slate-200 text-slate-700',
                    },
                    {
                      label: 'Online',
                      value: 500,
                      percentage: 25,
                      icon: MessageSquare,
                      color: 'bg-orange-50 text-orange-700',
                    },
                  ].map((type) => (
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
                          <p className="text-xs text-brand-muted font-medium">
                            {type.percentage}%
                          </p>
                        </div>
                      </div>
                      <p className="text-base font-bold">{type.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-base font-bold">Recent Orders</h4>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted"
                    />
                    <input
                      type="text"
                      placeholder="Search placeholder"
                      className="bg-brand-bg border-none rounded-lg pl-8 pr-3 py-1.5 text-xs w-48 outline-none"
                    />
                  </div>
                  <select className="bg-brand-bg border-none text-xs font-bold px-2 py-1.5 rounded-lg outline-none cursor-pointer">
                    <option>This Week</option>
                  </select>
                  <button className="text-xs font-bold bg-brand-bg px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    See All Orders
                  </button>
                </div>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-brand-muted font-bold uppercase tracking-wider border-b border-gray-50">
                    <th className="pb-4 font-bold">
                      Order ID <ChevronDown size={10} className="inline" />
                    </th>
                    <th className="pb-4 font-bold">
                      Photo <ChevronDown size={10} className="inline" />
                    </th>
                    <th className="pb-4 font-bold">
                      Menu <ChevronDown size={10} className="inline" />
                    </th>
                    <th className="pb-4 font-bold">
                      Qty <ChevronDown size={10} className="inline" />
                    </th>
                    <th className="pb-4 font-bold">
                      Amount <ChevronDown size={10} className="inline" />
                    </th>
                    <th className="pb-4 font-bold">
                      Customer <ChevronDown size={10} className="inline" />
                    </th>
                    <th className="pb-4 font-bold">
                      Status <ChevronDown size={10} className="inline" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="group hover:bg-brand-bg/50 transition-colors">
                      <td className="py-4 text-sm font-bold text-brand-muted">{order.id}</td>
                      <td className="py-4">
                        <img
                          src={order.image}
                          alt={order.menu}
                          className="w-10 h-10 rounded-lg object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </td>
                      <td className="py-4">
                        <p className="text-sm font-bold">{order.menu}</p>
                        <p className="text-xs text-brand-muted font-medium">{order.category}</p>
                      </td>
                      <td className="py-4 text-sm font-bold">{order.qty}</td>
                      <td className="py-4 text-sm font-bold">${order.amount.toFixed(2)}</td>
                      <td className="py-4 text-sm font-bold">{order.customer}</td>
                      <td className="py-4">
                        <span
                          className={cn(
                            'text-xs font-bold px-2 py-1 rounded-lg',
                            order.status === 'On Process'
                              ? 'bg-orange-100 text-orange-600'
                              : order.status === 'Completed'
                              ? 'bg-green-100 text-green-600'
                              : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="w-80 space-y-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm h-full flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-base font-bold">Trending Menus</h4>
                <select className="bg-brand-bg border-none text-xs font-bold px-2 py-1 rounded-lg outline-none cursor-pointer">
                  <option>This Week</option>
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

