import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Calendar, Bell, Settings, ChevronDown, MapPin, Globe, ArrowLeft, Check } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { clsx } from 'clsx';

import { useUser } from '../../context/UserContext';
import { cn } from '../../lib/utils';

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

const localeForLanguage = (lng: string) => {
  const base = String(lng || 'en').split('-')[0];
  if (base === 'ja') return 'ja-JP';
  if (base === 'ko') return 'ko-KR';
  if (base === 'zh') return 'zh-CN';
  return 'en-US';
};

const formatDate = (dateStr: string, lng: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString(localeForLanguage(lng), {
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
  const { t, i18n } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLanguagePanelOpen, setIsLanguagePanelOpen] = useState(false);

  const labelForTab = (tab: string) => {
    const keyByTab: Record<string, string> = {
      Dashboard: 'sidebar.dashboard',
      Expenses: 'sidebar.expenses',
      'Sales Report': 'sidebar.sales_report',
      'Sales Analytics': 'sidebar.sales_analytics',
      Menu: 'sidebar.menu',
      Category: 'sidebar.category',
      'Payment type': 'sidebar.payment_type',
      Receipt: 'sidebar.receipt',
      Orders: 'sidebar.orders',
      Inventory: 'sidebar.inventory',
      'User Info': 'sidebar.user_info',
      'User Role': 'sidebar.user_role',
      'User Access': 'sidebar.user_access',
      'User Management': 'header.user_management',
    };

    if (tab.startsWith('User')) return t('header.user_management');
    const k = keyByTab[tab];
    return k ? t(k) : tab;
  };

  const subtitleForTab = (tab: string) => {
    if (tab === 'Dashboard') {
      return t('header.subtitle_dashboard', { name: user?.firstname || t('header.user') });
    }

    const keyByTab: Record<string, string> = {
      Orders: 'header.subtitle_orders',
      Menu: 'header.subtitle_menu',
      Inventory: 'header.subtitle_inventory',
      'User Info': 'header.subtitle_user_info',
      'User Role': 'header.subtitle_user_role',
      'User Access': 'header.subtitle_user_access',
      Expenses: 'header.subtitle_expenses',
      'Sales Report': 'header.subtitle_sales_report',
      'Sales Analytics': 'header.subtitle_sales_analytics',
      Category: 'header.subtitle_category',
      'Payment type': 'header.subtitle_payment_type',
      Receipt: 'header.subtitle_receipt',
      'User Management': 'header.subtitle_user_management',
    };

    if (tab.startsWith('User')) {
      return t('header.subtitle_user_management');
    }

    const key = keyByTab[tab];
    return key ? t(key) : t('header.subtitle_default', { tab: labelForTab(tab) });
  };

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ko', name: '한국어', flag: '🇰🇷' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
  ];

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
    document.cookie = `lang=${code}; path=/; max-age=${60 * 60 * 24 * 365}`;
    setIsLanguagePanelOpen(false);
  };

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
          const allBranches = [{ id: 'all', name: t('header.all_branches') }, ...data];
          setBranches(allBranches);
          if (!selectedBranch && allBranches.length > 0) {
            const params = new URLSearchParams(window.location.search);
            const branchIdFromUrl = params.get('branchId');
            if (!branchIdFromUrl) {
              const userBranchId = user?.branch_id ? String(user.branch_id) : '';
              const resolved =
                userBranchId && userBranchId !== 'all'
                  ? allBranches.find((b) => String(b.id) === userBranchId) || null
                  : null;
              const firstSpecific = allBranches.find((b) => String(b.id) !== 'all') || null;
              onBranchChange(resolved || firstSpecific || allBranches[0]);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch branches:", error);
      }
    };

    fetchBranches();
  }, [onBranchChange, selectedBranch, t, user?.branch_id]);

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
  const showDateRangePicker =
    activeTab === 'Dashboard' ||
    activeTab === 'Sales Analytics' ||
    activeTab === 'Menu' ||
    activeTab === 'Category' ||
    activeTab === 'Payment type' ||
    activeTab === 'Receipt';
  const openBranchInNewTab = (branch: Branch) => {
    const url = new URL(window.location.href);
    url.searchParams.set('branchId', String(branch.id));
    url.searchParams.set('branchName', branch.name);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <header className="relative z-40 h-20 bg-brand-bg px-8 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            {breadcrumbs.length > 0 ? (
              breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  <span className={idx === breadcrumbs.length - 1 ? "text-brand-text" : "text-brand-muted"}>
                    {labelForTab(crumb)}
                  </span>
                  {idx < breadcrumbs.length - 1 && (
                    <span className="text-brand-muted text-xl mx-1">/</span>
                  )}
                </React.Fragment>
              ))
            ) : (
              labelForTab(activeTab)
            )}
          </h2>
          <p className="text-brand-muted text-sm mt-1">
            {subtitleForTab(activeTab)}
          </p>
        </div>

        <div className="flex items-center gap-6">
          {showDateRangePicker && (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-xl shadow-sm border border-gray-100 hover:border-brand-primary/30 transition-all cursor-pointer"
              >
                <Calendar size={20} className="text-brand-muted" />
                <span className="text-sm text-brand-muted whitespace-nowrap">
                  {dateRange.start && dateRange.end
                    ? `${formatDate(dateRange.start, i18n.language)} - ${formatDate(dateRange.end, i18n.language)}`
                    : t('header.date_range')}
                </span>
                <ChevronDown
                  size={16}
                  className="text-brand-muted group-hover:text-brand-primary transition-colors"
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
              className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl shadow-sm border border-gray-100 hover:border-brand-primary/30 transition-all w-64 justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <MapPin size={20} className="text-brand-muted" />
                <span className="text-sm text-brand-muted">
                  {selectedBranch 
                    ? (selectedBranch.id === 'all' ? t('header.all_branches') : selectedBranch.name) 
                    : t('header.select_branch')}
                </span>
              </div>
              <ChevronDown
                size={16}
                className={clsx(
                  'text-brand-muted group-hover:text-brand-primary transition-all duration-200',
                  branchDropdownOpen && 'rotate-180 text-brand-primary'
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
                        openBranchInNewTab(branch);
                        setBranchDropdownOpen(false);
                      }}
                      className={clsx(
                        'w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-brand-primary/5 cursor-pointer',
                        selectedBranch?.id === branch.id
                          ? 'text-brand-muted bg-brand-primary/5'
                          : 'text-brand-text'
                      )}
                    >
                      {branch.id === 'all' ? t('header.all_branches') : branch.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsLanguagePanelOpen(true)}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-brand-muted hover:text-brand-text transition-colors cursor-pointer"
            >
              <Globe size={20} />
            </button>
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
              <p className="text-base font-bold group-hover:text-brand-primary transition-colors">
                {user ? `${user.firstname} ${user.lastname}` : t('header.user')}
              </p>
              <p className="text-xs text-brand-muted font-medium">
                {user?.permissions === 1 ? t('header.admin') : t('header.staff')}
              </p>
            </div>
            <img
              src={user?.avatar || 'https://picsum.photos/seed/user/100/100'}
              alt={t('header.profile')}
              className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-sm group-hover:border-brand-primary/20 transition-all"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isLanguagePanelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLanguagePanelOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-[70] flex flex-col"
            >
              <div className="flex flex-col h-full">
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setIsLanguagePanelOpen(false)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-brand-muted cursor-pointer"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <h3 className="text-lg font-bold">{t('header.select_language')}</h3>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={cn(
                        "w-full flex items-center justify-between p-4 rounded-2xl transition-all cursor-pointer border",
                        i18n.language === lang.code
                          ? "bg-brand-orange/5 border-brand-orange/20 text-brand-orange"
                          : "bg-transparent border-transparent hover:bg-gray-50 text-brand-text"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{lang.flag}</span>
                        <span className="font-bold text-sm">{lang.name}</span>
                      </div>
                      {i18n.language === lang.code && <Check size={18} />}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
