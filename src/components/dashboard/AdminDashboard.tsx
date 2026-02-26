import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { type Branch } from '../partials/Header';
import { Skeleton } from '../ui/Skeleton';
import { BranchPerformanceCard, type BranchPerformanceData } from './BranchPerformanceCard';
import { DollarSign, TrendingUp, TrendingDown, Calendar, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Mock Data for Pie Chart
const branchRevenueDistribution = [
  { name: 'Branch A', value: 40000 },
  { name: 'Branch B', value: 30000 },
  { name: 'Branch C', value: 20000 },
  { name: 'Branch D', value: 10000 },
];

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// Mock Data for Horizontal Bar Chart
const topProductsData = [
  { name: 'Product A', sales: 4000 },
  { name: 'Product B', sales: 3000 },
  { name: 'Product C', sales: 2000 },
  { name: 'Product D', sales: 2780 },
  { name: 'Product E', sales: 1890 },
];
import { motion, AnimatePresence } from 'framer-motion';

type AdminDashboardProps = {
  selectedBranch: Branch | null;
};

type SummaryData = {
  totalRevenue: number;
  totalSales: number;
  totalExpenses: number;
};

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
};

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

const getCurrentMonthRange = (): DateRange => {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    start: toYYYYMMDD(firstDayOfMonth),
    end: toYYYYMMDD(today),
  };
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ selectedBranch }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [performanceData, setPerformanceData] = useState<BranchPerformanceData[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<number | null>(null);
  const [compareBranchIds, setCompareBranchIds] = useState<number[]>([]);
  const [isComparePanelOpen, setIsComparePanelOpen] = useState(false);
  const [isComparePanelLoading, setIsComparePanelLoading] = useState(false);
  const [isCompareDateOpen, setIsCompareDateOpen] = useState(false);
  const [compareDateRange, setCompareDateRange] = useState<DateRange>(getCurrentMonthRange);

  // Sync selectedBranch prop to internal state
  useEffect(() => {
    if (selectedBranch && selectedBranch.id !== 'all') {
      setActiveBranchId(Number(selectedBranch.id));
    } else {
      setActiveBranchId(null);
    }
  }, [selectedBranch]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const monthlyUrl = activeBranchId 
          ? `/api/admin/monthly-performance?branchId=${activeBranchId}`
          : '/api/admin/monthly-performance';

        // Fetch in parallel
        const [perfRes, monthlyRes] = await Promise.all([
          fetch('/api/admin/branch-performance', {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          }),
          fetch(monthlyUrl, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          }),
        ]);

        const perfJson = await perfRes.json();
        if (perfJson.success) {
          setPerformanceData(perfJson.data.branches);
          setSummaryData(perfJson.data.summary);
        }

        const monthlyJson = await monthlyRes.json();
        if (monthlyJson.success) {
          setMonthlyData(monthlyJson.data);
        }

      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [activeBranchId]);

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

  const selectedCompareBranches = compareBranchIds
    .map((id) => performanceData.find((branch) => branch.id === id))
    .filter((branch): branch is BranchPerformanceData => Boolean(branch));
  const canCompare = selectedCompareBranches.length >= 2;

  const formatCurrency = (value: number) =>
    `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
      id: 'totalRevenue',
      label: t('admin_dashboard.total_revenue'),
      values: selectedCompareBranches.map((branch) => branch.totalSales - branch.totalExpenses),
      bestMode: 'max' as const,
    },
    {
      id: 'totalSales',
      label: t('admin_dashboard.total_sales'),
      values: selectedCompareBranches.map((branch) => branch.totalSales),
      bestMode: 'max' as const,
    },
    {
      id: 'totalExpenses',
      label: t('admin_dashboard.total_expenses'),
      values: selectedCompareBranches.map((branch) => branch.totalExpenses),
      bestMode: 'min' as const,
    },
  ];

  const unifiedComparisonRows: UnifiedComparisonRow[] = [
    ...benchmarkRows,
    { id: 'section-inventory', rowType: 'section', label: t('admin_dashboard.sections.inventory') },
    {
      id: 'fresh Produce',
      label: t('admin_dashboard.sections.fresh_produce'),
      values: selectedCompareBranches.map((branch) => branch.totalSales * 0.38 * 0.2),
      bestMode: 'min',
    },
    {
      id: 'inv-beverages',
      label: t('admin_dashboard.sections.beverages'),
      values: selectedCompareBranches.map((branch) => branch.totalSales * 0.38 * 0.14),
      bestMode: 'min',
    },
    {
      id: 'inv-meat',
      label: t('admin_dashboard.sections.meat'),
      values: selectedCompareBranches.map((branch) => branch.totalSales * 0.38 * 0.24),
      bestMode: 'min',
    },
    {
      id: 'inv-seafood',
      label: t('admin_dashboard.sections.seafood'),
      values: selectedCompareBranches.map((branch) => branch.totalSales * 0.38 * 0.17),
      bestMode: 'min',
    },
    {
      id: 'inv-dreammart',
      label: t('admin_dashboard.sections.dreammart'),
      values: selectedCompareBranches.map((branch) => branch.totalSales * 0.38 * 0.15),
      bestMode: 'min',
    },
    {
      id: 'inv-rice',
      label: t('admin_dashboard.sections.rice'),
      values: selectedCompareBranches.map((branch) => branch.totalSales * 0.38 * 0.1),
      bestMode: 'min',
    },
    { id: 'section-maintenance', rowType: 'section', label: t('admin_dashboard.sections.maintenance') },
    {
      id: 'maint-kitchen-equipment',
      label: t('admin_dashboard.sections.kitchen_equipment'),
      values: selectedCompareBranches.map((branch) => branch.totalExpenses * 0.06),
      bestMode: 'min',
    },
    {
      id: 'maint-supplies',
      label: t('admin_dashboard.sections.supplies'),
      values: selectedCompareBranches.map((branch) => branch.totalExpenses * 0.035),
      bestMode: 'min',
    },
    {
      id: 'maint-repair',
      label: t('admin_dashboard.sections.repair'),
      values: selectedCompareBranches.map((branch) => branch.totalExpenses * 0.025),
      bestMode: 'min',
    },
    { id: 'section-utilities-bills', rowType: 'section', label: t('admin_dashboard.sections.utilities_bills') },
    {
      id: 'util-electricty',
      label: t('admin_dashboard.sections.electricity'),
      values: selectedCompareBranches.map((branch) => branch.totalExpenses * 0.17),
      bestMode: 'min',
    },
    {
      id: 'util-water',
      label: t('admin_dashboard.sections.water'),
      values: selectedCompareBranches.map((branch) => branch.totalExpenses * 0.06),
      bestMode: 'min',
    },
    {
      id: 'util-internet',
      label: t('admin_dashboard.sections.internet'),
      values: selectedCompareBranches.map((branch) => branch.totalExpenses * 0.05),
      bestMode: 'min',
    },
    {
      id: 'util-gas',
      label: t('admin_dashboard.sections.gas'),
      values: selectedCompareBranches.map((branch) => branch.totalExpenses * 0.04),
      bestMode: 'min',
    },
    {
      id: 'util-logistic-air-sea',
      label: t('admin_dashboard.sections.logistic_air_sea'),
      values: selectedCompareBranches.map((branch) => branch.totalExpenses * 0.03),
      bestMode: 'min',
    },
    { id: 'section-salary-rent', rowType: 'section', label: t('admin_dashboard.sections.salary_rent') },
    {
      id: 'salary-rent-salary',
      label: t('admin_dashboard.sections.salary'),
      values: selectedCompareBranches.map((branch) => branch.totalExpenses * 0.42),
      bestMode: 'min',
    },
    {
      id: 'salary-rent-rent',
      label: t('admin_dashboard.sections.rent'),
      values: selectedCompareBranches.map((branch) => branch.totalExpenses * 0.2),
      bestMode: 'min',
    },
    { id: 'section-others', rowType: 'section', label: t('admin_dashboard.sections.others') },
    {
      id: 'others',
      label: t('admin_dashboard.sections.others'),
      values: selectedCompareBranches.map((branch) => branch.totalExpenses * 0.03),
      bestMode: 'min',
    },
  ];

  const handleCompareDateRangeChange = (update: [Date | null, Date | null] | null) => {
    const [s, e] = update ?? [null, null];
    setCompareDateRange({
      start: s ? toYYYYMMDD(s) : '',
      end: e ? toYYYYMMDD(e) : '',
    });
    if (s && e) setIsCompareDateOpen(false);
  };

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
          <div className="lg:col-span-1 space-y-4">
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
            {summaryData && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pt-4">
              <SummaryCard 
                title={t('admin_dashboard.total_revenue')}
                value={`₱${summaryData.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={DollarSign}
                color="bg-green-500"
              />
              <SummaryCard 
                title={t('admin_dashboard.total_sales')}
                value={`₱${summaryData.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={TrendingUp}
                color="bg-[rgb(139,92,246)]"
              />
              <SummaryCard 
                title={t('admin_dashboard.total_expenses')}
                value={`₱${summaryData.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={TrendingDown}
                color="bg-[rgb(245,158,11)]"
              />
              </div>
            )}
            
            <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 mb-4">{t('admin_dashboard.performance_trend')}</h3>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    key={activeBranchId || 'all'}
                    data={monthlyData.map(d => ({ ...d, negativeExpenses: -d.totalExpenses }))}
                    margin={{ top: 30, right: 20, left: 10, bottom: 5 }}
                    stackOffset="sign"
                  >
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 12, fill: '#94a3b8' }} 
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 12, fill: '#94a3b8' }} 
                      tickFormatter={(value) => `₱${Math.abs(value / 1000)}k`} 
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip 
                      formatter={(value, name) => {
                        const originalValue = `₱${Math.abs(Number(value)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                        if (name === 'totalSales') return [originalValue, t('admin_dashboard.total_sales')];
                        if (name === 'negativeExpenses') return [originalValue, t('admin_dashboard.total_expenses')];
                        return [originalValue, name];
                      }}
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
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
                      barSize={32}
                      stackId="stack"
                    />
                    <Bar 
                      dataKey="negativeExpenses" 
                      name="negativeExpenses" 
                      fill="rgb(245, 158, 11)" 
                      radius={[6, 6, 0, 0]}
                      barSize={32}
                      stackId="stack"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pie Chart: Revenue Distribution */}
              <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 mb-4">{t('admin_dashboard.revenue_distribution')}</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={branchRevenueDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {branchRevenueDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
                      <Legend iconType="circle" layout="horizontal" verticalAlign="bottom" align="center" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Horizontal Bar Chart: Top Selling Products */}
              <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 mb-4">{t('admin_dashboard.top_selling_products')}</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={topProductsData}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        tick={{ fontSize: 12, fill: '#64748b' }} 
                        width={100}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                         formatter={(value) => [`${value} Sales`, 'Sales']}
                         cursor={{ fill: 'transparent' }}
                         contentStyle={{
                           borderRadius: '12px',
                           border: 'none',
                           boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                         }}
                      />
                      <Bar dataKey="sales" fill="#8884d8" radius={[0, 6, 6, 0]} barSize={32}>
                        {topProductsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
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
                  className="w-full rounded-xl bg-brand-primary text-white font-semibold py-2.5 px-4 transition-all duration-200 hover:bg-brand-primary/90 disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  {t('admin_dashboard.compare')} ({selectedCompareBranches.length})
                </button>
                <p className="mt-2 text-[11px] text-slate-500 text-center">
                  {t('admin_dashboard.select_branches_to_compare')}
                </p>
              </div>
            )}
            {performanceData
              .sort((a, b) => (b.totalSales - b.totalExpenses) - (a.totalSales - a.totalExpenses))
              .map((branch) => (
                <BranchPerformanceCard 
                  key={branch.id} 
                  branch={branch} 
                  onClick={() => handleBranchCompareToggle(branch.id)}
                  isSelected={compareBranchIds.includes(branch.id)}
                />
              ))}
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
    </>
  );
};
