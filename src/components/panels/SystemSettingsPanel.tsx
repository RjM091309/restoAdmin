import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    Settings,
    Globe,
    Bell,
    Database,
    Laptop,
    Shield,
    Info,
    ChevronRight,
    Store,
    Layout,
    Smartphone
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

type SettingsItemProps = {
    icon: React.ElementType;
    label: string;
    description?: string;
    onClick?: () => void;
    badge?: string;
};

const SettingsItem: React.FC<SettingsItemProps> = ({
    icon: Icon,
    label,
    description,
    onClick,
    badge
}) => (
    <button
        onClick={onClick}
        className="w-full flex items-center justify-between p-4 rounded-2xl transition-all cursor-pointer group border border-transparent hover:bg-brand-orange/5 hover:border-brand-orange/10"
    >
        <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gray-100 text-brand-muted group-hover:bg-brand-orange/10 group-hover:text-brand-orange transition-colors">
                <Icon size={18} />
            </div>
            <div className="text-left">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-brand-text">{label}</p>
                    {badge && (
                        <span className="px-1.5 py-0.5 bg-brand-orange/10 text-brand-orange text-[10px] font-bold rounded uppercase tracking-wider">
                            {badge}
                        </span>
                    )}
                </div>
                {description && (
                    <p className="text-xs text-brand-muted font-medium">{description}</p>
                )}
            </div>
        </div>
        <ChevronRight
            size={16}
            className="text-brand-muted/40 transition-transform group-hover:translate-x-0.5"
        />
    </button>
);

type SystemSettingsPanelProps = {
    isOpen: boolean;
    onClose: () => void;
};

export const SystemSettingsPanel: React.FC<SystemSettingsPanelProps> = ({
    isOpen,
    onClose,
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
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
                        {/* Header */}
                        <div className="p-6 border-b border-gray-100">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-brand-orange/10 text-brand-orange rounded-xl flex items-center justify-center">
                                        <Settings size={20} />
                                    </div>
                                    <h3 className="text-lg font-bold text-brand-text">System Settings</h3>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-brand-muted cursor-pointer"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                            <div className="px-4 py-2">
                                <h5 className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">General Settings</h5>
                            </div>
                            <SettingsItem
                                icon={Store}
                                label="Branch Management"
                                description="Configure store locations and details"
                            />
                            <SettingsItem
                                icon={Globe}
                                label="Localization"
                                description="Timezone, currency, and language"
                            />
                            <SettingsItem
                                icon={Layout}
                                label="Dashboard Layout"
                                description="Customize widget visibility"
                                badge="New"
                            />

                            <div className="px-4 py-2 mt-4">
                                <h5 className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Connect & Sync</h5>
                            </div>
                            <SettingsItem
                                icon={Database}
                                label="Data Sync"
                                description="Auto-backup to cloud storage"
                            />
                            <SettingsItem
                                icon={Smartphone}
                                label="Mobile App App"
                                description="Connect with waiter & chef apps"
                            />

                            <div className="px-4 py-2 mt-4">
                                <h5 className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">System Info</h5>
                            </div>
                            <SettingsItem
                                icon={Shield}
                                label="Security Audit"
                                description="Last check: 2 hours ago"
                            />
                            <SettingsItem
                                icon={Info}
                                label="Version Info"
                                description="v1.4.2-stable (Latest)"
                            />
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-gray-100">
                            <div className="bg-brand-bg rounded-2xl p-4 border border-gray-100">
                                <p className="text-xs text-brand-muted font-medium mb-3">
                                    System Health: <span className="text-green-600 font-bold uppercase tracking-wider ml-1">Optimal</span>
                                </p>
                                <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: '94%' }}
                                        className="bg-green-500 h-full"
                                    />
                                </div>
                                <p className="mt-3 text-[10px] text-brand-muted leading-relaxed">
                                    Last system-wide update: Feb 24, 2026 at 09:12 AM
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
