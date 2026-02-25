import React, { useState, useEffect } from 'react';
import { type Branch } from '../partials/Header';
import { Skeleton } from '../ui/Skeleton';
import { BranchPerformanceCard, type BranchPerformanceData } from './BranchPerformanceCard';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

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
        className={`z-20 w-20 h-20 absolute left-0 shadow-lg shadow-slate-200/50 rounded-2xl flex items-center justify-center ${color} text-white border-4 border-white transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}
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

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ selectedBranch }) => {
  const [loading, setLoading] = useState(true);
  const [performanceData, setPerformanceData] = useState<BranchPerformanceData[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<number | null>(null);

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

  return (
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
                title="Total Revenue"
                value={`₱${summaryData.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={DollarSign}
                color="bg-green-500"
              />
              <SummaryCard 
                title="Total Sales"
                value={`₱${summaryData.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={TrendingUp}
                color="bg-indigo-500"
              />
              <SummaryCard 
                title="Total Expenses"
                value={`₱${summaryData.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={TrendingDown}
                color="bg-red-500"
              />
              </div>
            )}
            
            <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Overall Performance Trend (12 Months)</h3>
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
                        if (name === 'totalSales') return [originalValue, 'Total Sales'];
                        if (name === 'negativeExpenses') return [originalValue, 'Total Expenses'];
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
                      formatter={(value) => <span className="ml-2 mr-8 text-sm font-medium text-slate-600">{value}</span>}
                    />
                    <Bar 
                      dataKey="totalSales" 
                      name="Total Sales" 
                      fill="#6366f1" 
                      radius={[6, 6, 0, 0]}
                      barSize={32}
                      stackId="stack"
                    />
                    <Bar 
                      dataKey="negativeExpenses" 
                      name="Total Expenses" 
                      fill="#ef4444" 
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
                <h3 className="text-lg font-bold text-slate-800 mb-4">Revenue Distribution</h3>
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
                <h3 className="text-lg font-bold text-slate-800 mb-4">Top Selling Products</h3>
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
          <div className="lg:col-span-1 space-y-6">
            {performanceData
              .sort((a, b) => (b.totalSales - b.totalExpenses) - (a.totalSales - a.totalExpenses))
              .map((branch) => (
                <BranchPerformanceCard 
                  key={branch.id} 
                  branch={branch} 
                  onClick={() => setActiveBranchId(prev => prev === branch.id ? null : branch.id)}
                  isSelected={branch.id === activeBranchId}
                />
              ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
