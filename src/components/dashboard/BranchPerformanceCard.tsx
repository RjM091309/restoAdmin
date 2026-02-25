import React from 'react';
import { TrendingUp, TrendingDown, MapPin } from 'lucide-react';
import { cn } from '../../lib/utils';

export type BranchPerformanceData = {
  id: number;
  name: string;
  totalSales: number;
  totalExpenses: number;
  totalOrders: number;
};

type BranchPerformanceCardProps = {
  branch: BranchPerformanceData;
  onClick?: () => void;
  isSelected?: boolean;
};

export const BranchPerformanceCard: React.FC<BranchPerformanceCardProps> = ({ branch, onClick, isSelected }) => {
  const netRevenue = branch.totalSales - branch.totalExpenses;
  const profitMargin = branch.totalSales > 0 ? (netRevenue / branch.totalSales) * 100 : 0;
  
  const trendType = profitMargin >= 15 ? 'up' : 'down';
  const trendColor = trendType === 'up' ? 'text-green-500' : 'text-red-500';
  const trendIcon = trendType === 'up' ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />;

  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col group transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer",
        isSelected ? "border-brand-primary ring-1 ring-brand-primary shadow-md" : "hover:border-brand-primary/50"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary">
            <MapPin size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-brand-text group-hover:text-brand-primary transition-colors">{branch.name}</h3>
            <p className="text-xs text-brand-muted">Branch overview</p>
          </div>
        </div>
        <div className={cn("flex items-center text-xs font-bold", trendColor)}>
          {trendIcon}
          <span>{profitMargin.toFixed(1)}%</span>
        </div>
      </div>
      
      {/* Main Metric */}
      <div className="my-5 text-center">
        <p className="text-xs text-brand-muted font-medium">Net Revenue</p>
        <p className="text-3xl font-bold text-brand-text">₱{netRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      </div>
      
      {/* Footer Stats */}
      <div className="mt-auto pt-4 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-green-100 text-green-600 flex items-center justify-center">
            <TrendingUp size={14} />
          </div>
          <div>
            <p className="text-xs text-brand-muted">Total Sales</p>
            <p className="font-bold text-xs">₱{branch.totalSales.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-red-100 text-red-600 flex items-center justify-center">
            <TrendingDown size={14} />
          </div>
          <div>
            <p className="text-xs text-brand-muted">Total Expenses</p>
            <p className="font-bold text-xs">₱{branch.totalExpenses.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
