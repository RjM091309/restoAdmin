import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Package,
  BarChart3,
  Users,
  LogOut,
  ChevronDown,
  ChevronRight,
  Circle,
  DollarSign,
  CreditCard,
  FlaskConical,
} from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { cn } from '../../lib/utils';
import { type Branch } from './Header';

type SidebarProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  selectedBranch: Branch | null;
  /** When set, only show sidebar items whose key is in this array (per-branch permissions from User Access). */
  allowedFeatures?: string[] | null;
};

type SidebarItemProps = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
  children?: React.ReactNode;
  isExpandable?: boolean;
  isExpanded?: boolean;
};

const SidebarItem: React.FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
  children,
  isExpandable,
  isExpanded,
}) => (
  <div className="w-full">
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between px-6 py-3 cursor-pointer transition-all group text-left relative',
        active
          ? 'text-brand-primary bg-brand-primary/5 after:content-[" "] after:absolute after:right-0 after:top-0 after:bottom-0 after:w-1 after:bg-brand-primary after:rounded-l-full'
          : 'text-brand-muted hover:text-brand-text hover:bg-gray-50/50',
      )}
    >
      <div className="flex items-center gap-3">
        <Icon
          size={20}
          className={cn(
            active ? 'text-brand-primary' : 'group-hover:text-brand-text transition-colors'
          )}
        />
        <span className={cn(
          "font-medium text-base",
          active ? "text-brand-primary" : "text-inherit"
        )}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {badge && (
          <span className="bg-brand-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
            {badge}
          </span>
        )}
        {isExpandable && (
          <ChevronDown
            size={16}
            className={cn(
              "transition-transform duration-300",
              isExpanded ? "rotate-0" : "-rotate-90 opacity-40"
            )}
          />
        )}
      </div>
    </button>
    {isExpandable && (
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out bg-gray-50/30",
        isExpanded ? "max-h-80 opacity-100 py-1" : "max-h-0 opacity-0"
      )}>
        {children}
      </div>
    )}
  </div>
);

const SubItem: React.FC<{ label: string; active?: boolean; onClick?: () => void }> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'w-full flex items-center gap-3 pl-14 pr-6 py-2 cursor-pointer transition-colors group text-left',
      active
        ? 'text-brand-primary'
        : 'text-brand-muted hover:text-brand-text',
    )}
  >
    <Circle
      size={6}
      className={cn(
        "fill-current transition-all",
        active ? "scale-125" : "opacity-30 group-hover:opacity-100"
      )}
    />
    <span className={cn(
      "text-sm font-medium",
      active ? "font-bold" : ""
    )}>{label}</span>
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, selectedBranch, allowedFeatures }) => {
  // Menu tab is only visible when a specific branch is selected (not 'all' or null)
  const isSpecificBranch = selectedBranch != null && String(selectedBranch.id) !== 'all';
  const { logout, user } = useUser();
  const isAdmin = user?.permissions === 1;
  const { t } = useTranslation();
  const [userMgmtExpanded, setUserMgmtExpanded] = useState(false);
  const [salesReportExpanded, setSalesReportExpanded] = useState(false);
  // When allowedFeatures is set (per-branch permissions), only show items in the list; otherwise show all for branch
  const hasFeature = (key: string) =>
    allowedFeatures == null ? true : allowedFeatures.includes(key);
  const isSalesReportActive =
    activeTab === 'Sales Analytics' ||
    activeTab === 'Menu' ||
    activeTab === 'Category' ||
    activeTab === 'Payment type' ||
    activeTab === 'Receipt';

  const isUserMgmtActive =
    activeTab.startsWith('User') ||
    activeTab === 'Branch Management';

  useEffect(() => {
    setUserMgmtExpanded(isUserMgmtActive);
  }, [isUserMgmtActive]);
  useEffect(() => {
    setSalesReportExpanded(isSalesReportActive);
  }, [isSalesReportActive]);

  const handleUserMgmtToggle = () => {
    setUserMgmtExpanded((prev) => {
      const next = !prev;
      if (next) setSalesReportExpanded(false);
      return next;
    });
  };
  const handleSalesReportToggle = () => {
    setSalesReportExpanded((prev) => {
      const next = !prev;
      if (next) setUserMgmtExpanded(false);
      return next;
    });
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col py-8 shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      <div className="px-8 mb-10 flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center shadow-lg shadow-brand-primary/20">
          <UtensilsCrossed size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-brand-text leading-none">3CORE</h1>
          <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mt-1">{t('sidebar.restaurant_pro')}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5">
        {hasFeature('dashboard') && (
        <SidebarItem
          icon={LayoutDashboard}
          label={t('sidebar.dashboard')}
          active={activeTab === 'Dashboard'}
          onClick={() => { onTabChange('Dashboard'); setUserMgmtExpanded(false); setSalesReportExpanded(false); }}
        />
        )}
        {(hasFeature('sales_report') || hasFeature('sales_analytics') || hasFeature('menu') || hasFeature('category') || hasFeature('payment_type') || hasFeature('receipt')) && (
        <SidebarItem
          icon={BarChart3}
          label={t('sidebar.sales_report')}
          active={isSalesReportActive}
          isExpandable
          isExpanded={salesReportExpanded}
          onClick={handleSalesReportToggle}
        >
          {hasFeature('sales_analytics') && (
            <SubItem
              label={t('sidebar.sales_analytics')}
              active={activeTab === 'Sales Analytics'}
              onClick={() => onTabChange('Sales Analytics')}
            />
          )}
          {hasFeature('menu') && (
            <SubItem
              label={t('sidebar.menu')}
              active={activeTab === 'Menu'}
              onClick={() => onTabChange('Menu')}
            />
          )}
          {hasFeature('category') && (
            <SubItem
              label={t('sidebar.category')}
              active={activeTab === 'Category'}
              onClick={() => onTabChange('Category')}
            />
          )}
          {hasFeature('payment_type') && (
            <SubItem
              label={t('sidebar.payment_type')}
              active={activeTab === 'Payment type'}
              onClick={() => onTabChange('Payment type')}
            />
          )}
          {hasFeature('receipt') && (
            <SubItem
              label={t('sidebar.receipt')}
              active={activeTab === 'Receipt'}
              onClick={() => onTabChange('Receipt')}
            />
          )}
        </SidebarItem>
        )}
        {isSpecificBranch && hasFeature('expenses') && (
          <SidebarItem
            icon={DollarSign}
            label={t('sidebar.expenses')}
            active={activeTab === 'Expenses'}
            onClick={() => { onTabChange('Expenses'); setUserMgmtExpanded(false); setSalesReportExpanded(false); }}
          />
        )}
        {isSpecificBranch && hasFeature('inventory') && (
          <SidebarItem
            icon={Package}
            label={t('sidebar.inventory')}
            active={activeTab === 'Inventory'}
            onClick={() => { onTabChange('Inventory'); setUserMgmtExpanded(false); setSalesReportExpanded(false); }}
          />
        )}
        {isSpecificBranch && hasFeature('orders') && (
          <SidebarItem
            icon={ClipboardList}
            label={t('sidebar.orders')}
            active={activeTab === 'Orders'}
            onClick={() => { onTabChange('Orders'); setUserMgmtExpanded(false); setSalesReportExpanded(false); }}
          />
        )}
        {isSpecificBranch && hasFeature('billing') && (
          <SidebarItem
            icon={CreditCard}
            label={t('Billing')}
            active={activeTab === 'Billing'}
            onClick={() => { onTabChange('Billing'); setUserMgmtExpanded(false); setSalesReportExpanded(false); }}
          />
        )}
        {isSpecificBranch && hasFeature('ingredients') && (
          <SidebarItem
            icon={FlaskConical}
            label="Ingredients"
            active={activeTab === 'Ingredients'}
            onClick={() => { onTabChange('Ingredients'); setUserMgmtExpanded(false); setSalesReportExpanded(false); }}
          />
        )}
        {isAdmin && !isSpecificBranch && (
          <SidebarItem
            icon={Users}
            label={t('sidebar.user_management')}
            active={isUserMgmtActive}
            isExpandable
            isExpanded={userMgmtExpanded}
            onClick={handleUserMgmtToggle}
          >
            <SubItem
              label={t('sidebar.user_info')}
              active={activeTab === 'User Info'}
              onClick={() => onTabChange('User Info')}
            />
            <SubItem
              label={t('sidebar.user_role')}
              active={activeTab === 'User Role'}
              onClick={() => onTabChange('User Role')}
            />
            <SubItem
              label={t('sidebar.control_panel_access', 'Control Panel')}
              active={activeTab === 'User Access'}
              onClick={() => onTabChange('User Access')}
            />
            <SubItem
              label={t('sidebar.branches')}
              active={activeTab === 'Branch Management'}
              onClick={() => onTabChange('Branches')}
            />
          </SidebarItem>
        )}
        {hasFeature('table_settings') && (
        <SidebarItem
          icon={ClipboardList}
          label="Table Settings"
          active={activeTab === 'Tables'}
          onClick={() => { onTabChange('Tables'); setUserMgmtExpanded(false); setSalesReportExpanded(false); }}
        />
        )}
      </nav>

      <div className="mt-auto px-4">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-6 py-4 text-brand-muted hover:text-red-500 hover:bg-red-50/50 rounded-2xl transition-all group border border-transparent hover:border-red-100"
        >
          <LogOut size={20} className="group-hover:rotate-12 transition-transform" />
          <span className="font-bold text-base">{t('sidebar.logout')}</span>
        </button>
      </div>
    </aside>
  );
};

