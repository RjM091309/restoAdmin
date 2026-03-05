import React from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, MapPin, Check } from 'lucide-react';
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
  onCompareToggle?: () => void;
  isSelected?: boolean;
  isActive?: boolean;
};

export const BranchPerformanceCard: React.FC<BranchPerformanceCardProps> = ({
  branch,
  onClick,
  onCompareToggle,
  isSelected,
  isActive,
}) => {
  const { t } = useTranslation();
  const netRevenue = branch.totalSales - branch.totalExpenses;
  const profitMargin = branch.totalSales > 0 ? (netRevenue / branch.totalSales) * 100 : 0;
  
  const trendType = profitMargin >= 15 ? 'up' : 'down';
  const trendColor = trendType === 'up' ? 'text-green-500' : 'text-red-500';
  const trendIcon = trendType === 'up' ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />;

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col group transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer',
        // Active (focused) branch gets strongest emphasis
        isActive
          ? 'border-brand-primary ring-2 ring-brand-primary/40 shadow-md bg-brand-primary/5'
          : isSelected
          ? 'border-brand-primary ring-1 ring-brand-primary shadow-md'
          : 'hover:border-brand-primary/50',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary">
            <MapPin size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-brand-text group-hover:text-brand-primary transition-colors">
              {branch.name}
            </h3>
            <p className="text-[11px] text-brand-muted">{t('admin_dashboard.branch_overview')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onCompareToggle) onCompareToggle();
            }}
            className={cn(
              'relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold shadow-sm transition-all duration-200 cursor-pointer',
              isSelected
                ? 'bg-brand-primary text-white shadow-brand-primary/40 shadow'
                : 'bg-slate-100 text-slate-600 hover:bg-brand-primary/10 hover:text-brand-primary',
            )}
            aria-pressed={isSelected}
          >
            <span
              className={cn(
                'flex items-center justify-center w-3.5 h-3.5 rounded-full border transition-colors duration-200',
                isSelected ? 'bg-white border-transparent' : 'border-slate-400 bg-white',
              )}
            >
              {isSelected && <Check size={10} className="text-brand-primary" />}
            </span>
            <span>Compare</span>
          </button>
        </div>
      </div>
      
      {/* Main Metric */}
      <div className="my-3 text-center">
        <p className="text-[11px] text-brand-muted font-medium">Total Profit</p>
        <p className="text-2xl font-bold text-brand-text">
          ₱
          {netRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
      
      {/* Footer Stats */}
      <div className="mt-auto pt-3 border-t border-gray-100 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-green-100 text-green-600 flex items-center justify-center">
            <TrendingUp size={12} />
          </div>
          <div>
            <p className="text-[10px] text-brand-muted">{t('admin_dashboard.total_sales')}</p>
            <p className="font-bold text-[11px]">
              ₱{branch.totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-red-100 text-red-600 flex items-center justify-center">
            <TrendingDown size={12} />
          </div>
          <div>
            <p className="text-[10px] text-brand-muted">{t('admin_dashboard.total_expenses')}</p>
            <p className="font-bold text-[11px]">
              ₱{branch.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
