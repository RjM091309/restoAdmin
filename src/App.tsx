/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  MessageSquare,
  Calendar,
  UtensilsCrossed,
  Package,
  Star,
  Search,
  Bell,
  Settings,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './components/partials/Sidebar';
import { Header } from './components/partials/Header';
import { Footer } from './components/partials/Footer';
import { Dashboard } from './components/dashboard/Dashboard';
import { AdminDashboard } from './components/dashboard/AdminDashboard';
import { Inventory } from './components/inventory/Inventory';
import { Categories } from './components/categories/Categories';
import { Expenses } from './components/expenses/Expenses';
import { Users } from './components/users/Users';
import { UserRole } from './components/users/UserRole';
import { Menu } from './components/menu/Menu';
import { Orders } from './components/orders/Orders';
import { cn } from './lib/utils';

// Panels
import { NotificationPanel } from './components/panels/NotificationPanel';
import { SystemSettingsPanel } from './components/panels/SystemSettingsPanel';
import { AccountSettingsPanel } from './components/panels/AccountSettingsPanel';

// Types
import { type Branch } from './components/partials/Header';


// --- Mock Data ---

const revenueData = [
  { name: 'Mar', income: 8000, expense: 5000 },
  { name: 'Apr', income: 10000, expense: 6000 },
  { name: 'May', income: 9000, expense: 7000 },
  { name: 'Jun', income: 12000, expense: 8000 },
  { name: 'Jul', income: 16580, expense: 9000 },
  { name: 'Aug', income: 11000, expense: 7000 },
  { name: 'Sep', income: 14000, expense: 8500 },
  { name: 'Oct', income: 13000, expense: 7500 },
];

// --- Components ---

const StatCard = ({ icon: Icon, label, value, trend, trendType }: { icon: any, label: string, value: string, trend: string, trendType: 'up' | 'down' }) => (
  <div className="bg-white p-5 rounded-2xl shadow-sm flex items-center gap-4 flex-1 min-w-[200px]">
    <div className="w-12 h-12 rounded-xl bg-brand-orange flex items-center justify-center text-white">
      <Icon size={24} />
    </div>
    <div>
      <p className="text-brand-muted text-sm font-medium mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <h3 className="text-2xl font-bold">{value}</h3>
        <span className={cn(
          "text-xs font-bold flex items-center gap-0.5",
          trendType === 'up' ? "text-green-500" : "text-red-500"
        )}>
          {trendType === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {trend}
        </span>
      </div>
    </div>
  </div>
);

const TrendingMenuItem = ({ menu }: { menu: any, key?: any }) => (
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
        <h5 className="text-base font-bold group-hover:text-brand-orange transition-colors">{menu.name}</h5>
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
      <p className="text-xl font-bold text-brand-orange">${menu.price.toFixed(2)}</p>
    </div>
  </div>
);

const VerticalCarousel = ({ items }: { items: any[] }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
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
            opacity: { duration: 0.2 }
          }}
          className="space-y-6"
        >
          {/* Show 3 items starting from index, wrapping around */}
          {[...items, ...items, ...items].slice(index, index + 3).map((menu, i) => (
            <TrendingMenuItem key={`${menu.name}-${index}-${i}`} menu={menu} />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

import { useUser } from './context/UserContext';
import { Toaster } from 'sonner';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isLoggedIn } = useUser();
  const location = useLocation();

  if (!isLoggedIn) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const LoginView = () => {
  const navigate = useNavigate();
  const { login } = useUser();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('123');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (result.success) {
        login(result.data, result.tokens.accessToken);
        navigate('/dashboard');
      } else {
        setError(result.error || 'Invalid username or password');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Connection failed. Please check if the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-brand-bg">
      {/* Background Image Side */}
      <div
        className="hidden lg:block lg:w-2/3 h-full bg-cover bg-center"
        style={{ backgroundImage: `url('/login-bg.jpg')` }}
      >
      </div>

      {/* Login Panel Side */}
      <div className="w-full lg:w-1/3 h-full bg-white flex flex-col justify-center px-12 py-10 shadow-[-10px_0_30px_rgba(0,0,0,0.1)] z-10">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm mx-auto"
        >
          <div className="flex flex-col items-start mb-10">
            <div className="w-16 h-16 bg-brand-orange rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-brand-orange/30">
              <UtensilsCrossed size={32} className="text-white" />
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-brand-text mb-2">Welcome Back</h2>
            <p className="text-brand-muted text-base">Please enter your details to sign in</p>
          </div>

          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-sm font-medium flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-muted ml-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                disabled={isLoading}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-base focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400 disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-muted ml-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-base focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400 disabled:opacity-50"
              />
            </div>

            <div className="flex items-center justify-between text-sm pt-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 text-brand-orange focus:ring-brand-orange/20" />
                <span className="text-brand-muted group-hover:text-brand-text transition-colors">Remember me</span>
              </label>
              <a href="#" className="text-brand-orange font-bold hover:underline transition-all">Forgot password?</a>
            </div>

            <button
              disabled={isLoading}
              className="w-full bg-brand-orange text-white text-base font-bold py-4 rounded-xl shadow-lg shadow-brand-orange/30 hover:shadow-brand-orange/40 hover:-translate-y-0.5 transition-all active:scale-[0.98] mt-4 disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-gray-100 text-center">
            <p className="text-sm text-brand-muted">
              Don't have an account? <a href="#" className="text-brand-orange font-bold hover:underline ml-1">Contact Support</a>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, login, logout } = useUser();

  // Initial session check
  useEffect(() => {
    const checkSession = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await fetch('/api/me', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          const result = await response.json();
          if (result.success && result.data) {
            // User is still logged in, result.data is the user object
            // Just refresh local state if needed
          } else {
            // Token invalid or expired
            logout();
          }
        } catch (err) {
          console.error('Session check failed:', err);
        }
      }
    };
    checkSession();
  }, [logout]);

  // Panel States
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  // Parse active tab from URL path
  const pathParts = location.pathname.split('/').filter(Boolean);
  const primaryPath = pathParts[0] || 'dashboard';

  // Create breadcrumb array
  const breadcrumbs = pathParts.map(part => {
    if (part === 'users') return 'User Management';
    if (part === 'info') return 'User Info';
    if (part === 'role') return 'User Role';
    if (part === 'access') return 'User Access';
    return part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' ');
  });
  if (breadcrumbs.length === 0) breadcrumbs.push('Dashboard');

  const activeTab = breadcrumbs[breadcrumbs.length - 1];
  const displayActiveTab = activeTab;

  const [dateRange, setDateRange] = useState({
    start: '2026-02-01',
    end: '2026-02-23'
  });

  // Dynamic data generation based on date range (simulated)
  // const getDynamicRevenueData = () => {
  //   const seed = dateRange.start.length + dateRange.end.length;
  //   return revenueData.map((item, idx) => ({
  //     ...item,
  //     income: Math.floor(item.income * (0.8 + (seed % 5) * 0.1) + (idx * 100)),
  //     expense: Math.floor(item.expense * (0.9 + (seed % 3) * 0.05))
  //   }));
  // };

  // const getDynamicStats = () => {
  //   const seed = dateRange.start.length + dateRange.end.length;
  //   return {
  //     orders: (48652 + (seed * 123)).toLocaleString(),
  //     customers: (1248 + (seed * 5)).toLocaleString(),
  //     revenue: `$${(215860 + (seed * 456)).toLocaleString()}`
  //   };
  // };

  // const dynamicStats = getDynamicStats();
  // const dynamicRevenueData = getDynamicRevenueData();

  const handleTabChange = (tab: string) => {
    switch (tab) {
      case 'User Info': navigate('/users/info'); break;
      case 'User Role': navigate('/users/role'); break;
      case 'User Access': navigate('/users/access'); break;
      case 'User Management': navigate('/users/info'); break;
      default: navigate(`/${tab.toLowerCase()}`);
    }
  };

  const isLoginPage = location.pathname === '/' || location.pathname === '/login';

  if (isLoginPage) {
    if (isLoggedIn && location.pathname === '/') {
      return <Navigate to="/dashboard" replace />;
    }
    return (
      <>
        <Toaster position="top-right" richColors />
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<LoginView />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
        </Routes>
      </>
    );
  }

  return (
    <ProtectedRoute>
      <Toaster position="top-right" richColors />
      <div className="flex h-screen overflow-hidden bg-brand-bg">
        <Sidebar activeTab={displayActiveTab} onTabChange={handleTabChange} selectedBranch={selectedBranch} />

        <main className="flex-1 flex flex-col overflow-hidden">
          <Header
            activeTab={displayActiveTab}
            breadcrumbs={breadcrumbs}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            onOpenNotifications={() => setIsNotificationOpen(true)}
            onOpenSystemSettings={() => setIsSystemSettingsOpen(true)}
            onOpenAccountSettings={() => setIsAccountSettingsOpen(true)}
            selectedBranch={selectedBranch}
            onBranchChange={setSelectedBranch}
          />

          <div className="flex-1 overflow-y-auto p-8 pt-0 custom-scrollbar">
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />

                <Route path="/dashboard" element={
                  <motion.div
                    key={selectedBranch ? selectedBranch.id : 'initial'}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    {selectedBranch && selectedBranch.id === 'all' ? (
                      <AdminDashboard selectedBranch={selectedBranch} />
                    ) : (
                      <Dashboard
                        selectedBranch={selectedBranch}
                      />
                    )}
                  </motion.div>
                } />

                <Route path="/orders" element={
                  selectedBranch && String(selectedBranch.id) !== 'all' ? (
                    <Orders
                      key={selectedBranch.id}
                      selectedBranch={selectedBranch}
                    />
                  ) : (
                    <Navigate to="/dashboard" replace />
                  )
                } />

                <Route path="/menu" element={
                  selectedBranch && String(selectedBranch.id) !== 'all' ? (
                    <Menu
                      key={selectedBranch.id}
                      selectedBranch={selectedBranch}
                    />
                  ) : (
                    <Navigate to="/dashboard" replace />
                  )
                } />

                <Route path="/inventory" element={
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Categories 
                      selectedBranch={selectedBranch}
                      onCategoryClick={(category) => navigate(`/inventory/${category.toLowerCase()}`)} 
                    />
                  </motion.div>
                } />

                <Route path="/users" element={<Navigate to="/users/info" replace />} />
                <Route path="/users/info" element={
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Users />
                  </motion.div>
                } />

                <Route path="/users/role" element={
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <UserRole />
                  </motion.div>
                } />

                <Route path="/users/access" element={
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center justify-center h-64 text-brand-muted font-bold"
                  >
                    User Access Management is coming soon...
                  </motion.div>
                } />

                <Route path="/inventory/:categoryName" element={
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Inventory onBack={() => navigate('/inventory')} />
                  </motion.div>
                } />

                <Route path="/expenses" element={
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Expenses />
                  </motion.div>
                } />

                <Route path="*" element={
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-center h-64 text-brand-muted"
                  >
                    {activeTab} content is coming soon...
                  </motion.div>
                } />
              </Routes>
            </AnimatePresence>
          </div>

          <Footer />
        </main>

        {/* Panels */}
        <NotificationPanel
          isOpen={isNotificationOpen}
          onClose={() => setIsNotificationOpen(false)}
        />
        <SystemSettingsPanel
          isOpen={isSystemSettingsOpen}
          onClose={() => setIsSystemSettingsOpen(false)}
        />
        <AccountSettingsPanel
          isOpen={isAccountSettingsOpen}
          onClose={() => setIsAccountSettingsOpen(false)}
        />
      </div>
    </ProtectedRoute>
  );
}
