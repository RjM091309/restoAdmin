import React, { useState, useEffect } from 'react';
import { type Branch } from '../partials/Header';
import { Skeleton } from '../ui/Skeleton';
import { BranchPerformanceCard, type BranchPerformanceData } from './BranchPerformanceCard';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
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
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-5">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
      <Icon size={24} />
    </div>
    <div>
      <p className="text-sm text-brand-muted font-medium">{title}</p>
      <p className="text-2xl font-bold text-brand-text">{value}</p>
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              <SummaryCard 
                title="Total Revenue"
                value={`₱${summaryData.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={DollarSign}
                color="bg-indigo-100 text-indigo-600"
              />
              <SummaryCard 
                title="Total Sales"
                value={`₱${summaryData.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={TrendingUp}
                color="bg-brand-orange/10 text-brand-orange"
              />
              <SummaryCard 
                title="Total Expenses"
                value={`₱${summaryData.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={TrendingDown}
                color="bg-slate-100 text-slate-600"
              />
              </div>
            )}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-brand-text mb-4">Overall Performance Trend (12 Months)</h3>
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
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar 
                      dataKey="totalSales" 
                      name="Total Sales" 
                      fill="#4f46e5" 
                      radius={[6, 6, 0, 0]}
                      barSize={32}
                      stackId="stack"
                    />
                    <Bar 
                      dataKey="negativeExpenses" 
                      name="Total Expenses" 
                      fill="#64748b" 
                      radius={[6, 6, 0, 0]}
                      barSize={32}
                      stackId="stack"
                    />
                  </BarChart>
                </ResponsiveContainer>
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
