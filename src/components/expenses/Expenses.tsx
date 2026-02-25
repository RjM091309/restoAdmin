import React, { useState, useEffect } from 'react';
import { Search, Plus, Filter, DollarSign, Calendar, FileText, TrendingUp, TrendingDown, Edit2, Trash2, Tag } from 'lucide-react';
import { DataTable, ColumnDef } from '../ui/DataTable';
import { cn } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { motion, AnimatePresence } from 'framer-motion';
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '../ui/Skeleton';

// Mock data for expenses
const expenseData = [
  { id: 'EXP001', date: '2026-02-24', category: 'Inventory', description: 'Fresh produce restock', amount: 1250.00, branch: 'Main Branch', status: 'Approved' as const },
  { id: 'EXP002', date: '2026-02-23', category: 'Utilities', description: 'Electricity bill - Feb', amount: 450.50, branch: 'Main Branch', status: 'Pending' as const },
  { id: 'EXP003', date: '2026-02-22', category: 'Maintenance', description: 'Kitchen equipment repair', amount: 320.00, branch: 'Downtown', status: 'Approved' as const },
  { id: 'EXP004', date: '2026-02-21', category: 'Salaries', description: 'Weekly staff payout', amount: 5500.00, branch: 'All Branches', status: 'Approved' as const },
  { id: 'EXP005', date: '2026-02-20', category: 'Marketing', description: 'Social media ads', amount: 200.00, branch: 'Main Branch', status: 'Review' as const },
  { id: 'EXP006', date: '2026-02-19', category: 'Inventory', description: 'Beverage supply', amount: 890.25, branch: 'Downtown', status: 'Approved' as const },
  { id: 'EXP007', date: '2026-02-18', category: 'Supplies', description: 'Cleaning supplies', amount: 150.75, branch: 'Main Branch', status: 'Approved' as const },
  { id: 'EXP008', date: '2026-02-17', category: 'Rent', description: 'Monthly space rent', amount: 3000.00, branch: 'Downtown', status: 'Pending' as const },
];

export const Expenses: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const columns: ColumnDef<typeof expenseData[0]>[] = [
    {
      header: 'Date',
      className: 'w-[120px]',
      render: (expense) => (
        <div className="flex items-center gap-2 text-brand-text font-medium">
          <Calendar size={16} className="text-brand-muted" />
          {expense.date}
        </div>
      ),
    },
    {
      header: 'Description',
      className: 'flex-1',
      render: (expense) => (
        <div>
          <h3 className="text-base font-bold text-brand-text mb-0.5">
            {expense.description}
          </h3>
          <div className="flex items-center gap-2 text-xs text-brand-muted">
             <span className="flex items-center gap-1">
                <Tag size={12} />
                {expense.category}
             </span>
             <span>•</span>
             <span>{expense.branch}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Amount',
      className: 'text-right',
      render: (expense) => (
        <span className="text-base font-bold text-brand-text">
          ₱{expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      header: 'Status',
      className: 'text-center w-[120px]',
      render: (expense) => (
        <div className="flex justify-center">
          <span
            className={cn(
              "text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 w-fit",
              expense.status === 'Approved'
                ? "bg-green-100 text-green-600"
                : expense.status === 'Pending'
                ? "bg-orange-100 text-orange-600"
                : "bg-red-100 text-red-600"
            )}
          >
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              expense.status === 'Approved' ? "bg-green-500" :
              expense.status === 'Pending' ? "bg-orange-500" : "bg-red-500"
            )} />
            {expense.status}
          </span>
        </div>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right w-[100px]',
      render: () => (
        <div className="flex justify-end items-center gap-2">
          <button 
            className="p-2 text-brand-muted hover:text-brand-orange hover:bg-brand-orange/10 transition-colors rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              // Handle edit
            }}
            title="Edit Expense"
          >
            <Edit2 size={16} />
          </button>
          <button 
            className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              // Handle delete
            }}
            title="Delete Expense"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="pt-6">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div 
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            <SkeletonPageHeader />
            <SkeletonStatCards />
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <SkeletonTable columns={5} rows={8} />
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white p-3 rounded-xl shadow-sm">
                  <Filter size={18} className="text-brand-muted" />
                </div>
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                  <input
                    type="text"
                    placeholder="Search expenses..."
                    className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-orange/20 outline-none"
                  />
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-brand-orange text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-brand-orange/20 hover:bg-brand-orange/90 transition-all"
              >
                <Plus size={18} />
                New Expense
              </button>
            </div>

            <div className="grid grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Total Expenses</p>
                <h3 className="text-3xl font-bold text-brand-text">₱11,761.50</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Inventory</p>
                <h3 className="text-3xl font-bold text-brand-text">₱2,140.25</h3>
              </div>
               <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Maintenance</p>
                <h3 className="text-3xl font-bold text-brand-text">₱320.00</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Utilities</p>
                <h3 className="text-3xl font-bold text-brand-text">₱450.50</h3>
              </div>
            </div>

            <DataTable
              data={expenseData}
              columns={columns}
              keyExtractor={(item) => item.id}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Expense Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Expense"
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-orange shadow-lg shadow-brand-orange/30 hover:bg-brand-orange/90 transition-all active:scale-[0.98]"
            >
              Save Expense
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-bold text-brand-text mb-2">Date</label>
                <input 
                type="date" 
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
                />
            </div>
            <div>
                <label className="block text-sm font-bold text-brand-text mb-2">Amount</label>
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₱</span>
                    <input 
                    type="number" 
                    placeholder="0.00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
                    />
                </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">Category</label>
            <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all text-brand-text cursor-pointer appearance-none">
              <option value="">Select Category</option>
              <option value="inventory">Inventory</option>
              <option value="utilities">Utilities</option>
              <option value="rent">Rent</option>
              <option value="salaries">Salaries</option>
              <option value="marketing">Marketing</option>
              <option value="maintenance">Maintenance</option>
              <option value="supplies">Supplies</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">Description</label>
            <textarea 
              rows={3}
              placeholder="Details about the expense..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">Branch</label>
            <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all text-brand-text cursor-pointer appearance-none">
              <option value="main">Main Branch</option>
              <option value="downtown">Downtown</option>
              <option value="all">All Branches</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
};
