import React from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Package,
  LogIn,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type SidebarProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
};

type SidebarItemProps = {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
};

const SidebarItem: React.FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'w-full flex items-center justify-between px-6 py-3 cursor-pointer transition-colors group text-left',
      active
        ? 'text-brand-orange border-r-4 border-brand-orange bg-brand-orange/5'
        : 'text-brand-muted hover:text-brand-text',
    )}
  >
    <div className="flex items-center gap-3">
      <Icon
        size={20}
        className={cn(active ? 'text-brand-orange' : 'group-hover:text-brand-text')}
      />
      <span className="font-medium text-base">{label}</span>
    </div>
    {badge && (
      <span className="bg-brand-orange text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
        {badge}
      </span>
    )}
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col py-8 shrink-0">
      <div className="px-8 mb-10 flex items-center gap-2">
        <div className="w-8 h-8 bg-brand-orange rounded-lg flex items-center justify-center">
          <UtensilsCrossed size={18} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">3CORE</h1>
      </div>

      <nav className="flex-1 space-y-1">
        <SidebarItem
          icon={LayoutDashboard}
          label="Dashboard"
          active={activeTab === 'Dashboard'}
          onClick={() => onTabChange('Dashboard')}
        />
        <SidebarItem
          icon={ClipboardList}
          label="Orders"
          active={activeTab === 'Orders'}
          onClick={() => onTabChange('Orders')}
        />
        <SidebarItem
          icon={UtensilsCrossed}
          label="Menu"
          active={activeTab === 'Menu'}
          onClick={() => onTabChange('Menu')}
        />
        <SidebarItem
          icon={Package}
          label="Inventory"
          active={activeTab === 'Inventory'}
          onClick={() => onTabChange('Inventory')}
        />
      </nav>

      <div className="mt-auto pt-4 border-t border-gray-100">
        <SidebarItem
          icon={LogIn}
          label="Login Page"
          active={activeTab === 'Login'}
          onClick={() => onTabChange('Login')}
        />
      </div>
    </aside>
  );
};

