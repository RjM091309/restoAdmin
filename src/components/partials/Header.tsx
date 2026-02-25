import React, { useState, useEffect } from 'react';
import { Calendar, Search, Bell, Settings, ChevronDown, MapPin } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { clsx } from 'clsx';

import { useUser } from '../../context/UserContext';

type DateRange = {
  start: string;
  end: string;
};

export type Branch = {
  id: string | number;
  name: string;
};

type HeaderProps = {
  activeTab: string;
  breadcrumbs?: string[];
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  onOpenNotifications: () => void;
  onOpenSystemSettings: () => void;
  onOpenAccountSettings: () => void;
  selectedBranch: Branch | null;
  onBranchChange: (branch: Branch) => void;
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};


const toDate = (s: string): Date | null =>
  s ? new Date(s) : null;

const toYYYYMMDD = (d: Date): string =>
  d.getFullYear() +
  '-' +
  String(d.getMonth() + 1).padStart(2, '0') +
  '-' +
  String(d.getDate()).padStart(2, '0');

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  breadcrumbs = [],
  dateRange,
  onDateRangeChange,
  onOpenNotifications,
  onOpenSystemSettings,
  onOpenAccountSettings,
  selectedBranch,
  onBranchChange,
}) => {
  const { user } = useUser();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/branch', {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          const json = await res.json();
          const data = (json.data ?? json).map((b: any) => ({
            id: b.IDNo,
            name: b.BRANCH_LABEL || b.BRANCH_NAME,
          }));
          const allBranches = [{ id: 'all', name: 'All Branches' }, ...data];
          setBranches(allBranches);
          if (!selectedBranch && allBranches.length > 0) {
            onBranchChange(allBranches[0]);
          }
        }
      } catch (error) {
        console.error("Failed to fetch branches:", error);
      }
    };

    fetchBranches();
  }, []);

  const startDate = toDate(dateRange.start);
  const endDate = toDate(dateRange.end);
  const pickerValue: [Date | null, Date | null] = [startDate, endDate];

  const handleDateRangeChange = (update: [Date | null, Date | null] | null) => {
    const [s, e] = update ?? [null, null];
    onDateRangeChange({
      start: s ? toYYYYMMDD(s) : '',
      end: e ? toYYYYMMDD(e) : '',
    });
    if (s && e) setDropdownOpen(false);
  };

  const handleClose = () => setDropdownOpen(false);

  return (
    <header className="relative z-20 h-20 bg-brand-bg px-8 flex items-center justify-between shrink-0">
      <div>
        <h2 className="text-3xl font-bold flex items-center gap-2">
          {breadcrumbs.length > 0 ? (
            breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                <span className={idx === breadcrumbs.length - 1 ? "text-brand-text" : "text-brand-muted"}>
                  {crumb}
                </span>
                {idx < breadcrumbs.length - 1 && (
                  <span className="text-brand-muted text-xl mx-1">/</span>
                )}
              </React.Fragment>
            ))
          ) : (
            activeTab.startsWith('User') ? 'User Management' : activeTab
          )}
        </h2>
        <p className="text-brand-muted text-sm mt-1">
          {activeTab === 'Dashboard'
            ? `Hello ${user?.firstname || 'User'}, welcome back!`
            : activeTab === 'Orders'
              ? 'View and manage restaurant orders.'
              : activeTab === 'Menu'
                ? 'Manage your restaurant menu items.'
                : activeTab === 'Inventory'
                  ? 'Manage your restaurant supplies and stock.'
                  : activeTab === 'User Info'
                    ? 'View and manage individual user accounts.'
                    : activeTab === 'User Role'
                      ? 'Configure user roles and their permissions.'
                      : activeTab === 'User Access'
                        ? 'Control user access levels to system features.'
                        : `View your ${activeTab.toLowerCase()}.`}
        </p>
      </div>

      <div className="flex items-center gap-6">
        {activeTab === 'Dashboard' && (
          <div className="relative">
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-xl shadow-sm border border-gray-100 hover:border-brand-orange/30 transition-all cursor-pointer"
            >
              <Calendar size={20} className="text-brand-muted" />
              <span className="text-sm text-brand-muted whitespace-nowrap">
                {dateRange.start && dateRange.end
                  ? `${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`
                  : 'Date range'}
              </span>
              <ChevronDown
                size={16}
                className="text-brand-muted group-hover:text-brand-orange transition-colors"
              />
            </button>

            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={handleClose}
                  aria-hidden
                />
                <div className="absolute top-full right-0 mt-2 z-50">
                  <DatePicker
                    inline
                    selectsRange
                    startDate={pickerValue[0]}
                    endDate={pickerValue[1]}
                    onChange={handleDateRangeChange}
                    dateFormat="MMM d, yyyy"
                    calendarClassName="react-datepicker-material"
                    isClearable
                  />
                </div>
              </>
            )}
          </div>
        )}

        <div className="relative">
          <button
            onClick={() => setBranchDropdownOpen((o) => !o)}
            className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl shadow-sm border border-gray-100 hover:border-brand-orange/30 transition-all w-64 justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <MapPin size={20} className="text-brand-muted" />
              <span className="text-sm text-brand-muted">
                {selectedBranch ? selectedBranch.name : 'Select Branch'}
              </span>
            </div>
            <ChevronDown
              size={16}
              className={clsx(
                'text-brand-muted group-hover:text-brand-orange transition-all duration-200',
                branchDropdownOpen && 'rotate-180 text-brand-orange'
              )}
            />
          </button>

          {branchDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setBranchDropdownOpen(false)}
                aria-hidden
              />
              <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden py-1">
                {branches.map((branch) => (
                  <button
                    key={branch.id}
                    onClick={() => {
                      onBranchChange(branch);
                      setBranchDropdownOpen(false);
                    }}
                    className={clsx(
                      'w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-brand-orange/5 cursor-pointer',
                      selectedBranch?.id === branch.id
                        ? 'text-brand-muted bg-brand-orange/5'
                        : 'text-brand-text'
                    )}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenNotifications}
            className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-brand-muted hover:text-brand-text transition-colors cursor-pointer"
          >
            <Bell size={20} />
          </button>
          <button
            onClick={onOpenSystemSettings}
            className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-brand-muted hover:text-brand-text transition-colors cursor-pointer"
          >
            <Settings size={20} />
          </button>
        </div>

        <div
          onClick={onOpenAccountSettings}
          className="flex items-center gap-3 pl-6 border-l border-gray-200 cursor-pointer group"
        >
          <div className="text-right">
            <p className="text-base font-bold group-hover:text-brand-orange transition-colors">
              {user ? `${user.firstname} ${user.lastname}` : 'User'}
            </p>
            <p className="text-xs text-brand-muted font-medium">
              {user?.permissions === 1 ? 'Admin' : 'Staff'}
            </p>
          </div>
          <img
            src={user?.avatar || 'https://picsum.photos/seed/user/100/100'}
            alt="Profile"
            className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-sm group-hover:border-brand-orange/20 transition-all"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </header>
  );
};
