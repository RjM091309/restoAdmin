import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  User,
  Lock,
  Bell,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Globe,
  ArrowLeft,
  Camera,
  Mail,
  Phone
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useUser } from '../../context/UserContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type SettingsItemProps = {
  icon: React.ElementType;
  label: string;
  description?: string;
  onClick?: () => void;
  danger?: boolean;
};

const SettingsItem: React.FC<SettingsItemProps> = ({
  icon: Icon,
  label,
  description,
  onClick,
  danger
}) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center justify-between p-4 rounded-2xl transition-all cursor-pointer group border border-transparent",
      danger
        ? "hover:bg-red-50 hover:border-red-100"
        : "hover:bg-brand-orange/5 hover:border-brand-orange/10"
    )}
  >
    <div className="flex items-center gap-4">
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
        danger
          ? "bg-red-100 text-red-600"
          : "bg-gray-100 text-brand-muted group-hover:bg-brand-orange/10 group-hover:text-brand-orange"
      )}>
        <Icon size={18} />
      </div>
      <div className="text-left">
        <p className={cn(
          "text-sm font-bold",
          danger ? "text-red-600" : "text-brand-text"
        )}>{label}</p>
        {description && (
          <p className="text-xs text-brand-muted font-medium">{description}</p>
        )}
      </div>
    </div>
    <ChevronRight
      size={16}
      className={cn(
        "transition-transform group-hover:translate-x-0.5",
        danger ? "text-red-300" : "text-brand-muted/40"
      )}
    />
  </button>
);

type AccountSettingsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const AccountSettingsPanel: React.FC<AccountSettingsPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const [view, setView] = useState<'main' | 'edit-profile'>('main');
  const { user, updateUser } = useUser();

  // Form State
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);

  const handleClose = () => {
    onClose();
    // Reset view after animation finishes
    setTimeout(() => setView('main'), 300);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
          />

          {/* Side Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-[70] flex flex-col"
          >
            <AnimatePresence mode="wait">
              {view === 'main' ? (
                <motion.div
                  key="main"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col h-full"
                >
                  {/* Header */}
                  <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-lg font-bold">Account Settings</h3>
                      <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-brand-muted cursor-pointer"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    {/* Profile Overview */}
                    <div className="flex items-center gap-4 p-4 bg-brand-bg rounded-2xl border border-gray-100">
                      <div className="relative">
                        <img
                          src={user.avatar}
                          alt="Profile"
                          className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow-sm"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-2 border-white rounded-full" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold">{user.name}</h4>
                        <p className="text-sm text-brand-muted font-medium">{user.role}</p>
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 bg-green-100 text-green-700 rounded-md text-[10px] font-bold uppercase tracking-wider">
                          <ShieldCheck size={10} />
                          Verified
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Settings Options */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                    <div className="px-4 py-2">
                      <h5 className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Personal</h5>
                    </div>
                    <SettingsItem
                      icon={User}
                      label="Edit Profile"
                      description="Update your name and photo"
                      onClick={() => setView('edit-profile')}
                    />
                    <SettingsItem
                      icon={Lock}
                      label="Security"
                      description="Change password and 2FA"
                    />

                    <div className="px-4 py-2 mt-4">
                      <h5 className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Preferences</h5>
                    </div>
                    <SettingsItem
                      icon={Bell}
                      label="Notifications"
                      description="Configure alerts & emails"
                    />
                    <SettingsItem
                      icon={Globe}
                      label="Language"
                      description="English (United States)"
                    />
                  </div>

                  {/* Logout Footer */}
                  <div className="p-6 border-t border-gray-100">
                    <SettingsItem
                      icon={LogOut}
                      label="Sign Out"
                      danger
                      onClick={() => {
                        // Handle logout
                        window.location.href = '/login';
                      }}
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="edit-profile"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col h-full"
                >
                  {/* Edit Profile Header */}
                  <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center gap-4 mb-8">
                      <button
                        onClick={() => setView('main')}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-brand-muted cursor-pointer"
                      >
                        <ArrowLeft size={20} />
                      </button>
                      <h3 className="text-lg font-bold">Edit Profile</h3>
                    </div>

                    {/* Profile Picture Upload */}
                    <div className="flex flex-col items-center">
                      <div className="relative group cursor-pointer">
                        <img
                          src={user.avatar}
                          alt="Profile"
                          className="w-24 h-24 rounded-3xl object-cover border-4 border-white shadow-md group-hover:opacity-90 transition-opacity"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-black/40 p-2 rounded-full text-white backdrop-blur-sm">
                            <Camera size={20} />
                          </div>
                        </div>
                        <input type="file" className="hidden" />
                      </div>
                      <p className="mt-3 text-xs font-bold text-brand-orange hover:underline cursor-pointer">
                        Change Photo
                      </p>
                    </div>
                  </div>

                  {/* Edit Form */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-brand-muted ml-1">
                        Full Name
                      </label>
                      <div className="relative">
                        <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3.5 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-brand-muted ml-1">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3.5 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-brand-muted ml-1">
                        Phone Number
                      </label>
                      <div className="relative">
                        <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3.5 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-brand-muted ml-1">
                        Role
                      </label>
                      <input
                        type="text"
                        value={user.role}
                        disabled
                        className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-brand-muted cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-6 border-t border-gray-100 flex gap-3">
                    <button
                      onClick={() => setView('main')}
                      className="flex-1 py-3 bg-gray-100 text-brand-text rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 py-3 bg-brand-orange text-white rounded-xl font-bold text-sm shadow-lg shadow-brand-orange/20 hover:opacity-90 transition-opacity cursor-pointer"
                      onClick={() => {
                        updateUser({ name, email, phone });
                        setView('main');
                      }}
                    >
                      Save Changes
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
