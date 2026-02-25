import React, { useState, useEffect } from 'react';
import { Search, Plus, Filter, DollarSign, Calendar, FileText, TrendingUp, TrendingDown, Edit2, Trash2, Tag, X } from 'lucide-react';
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

const inventorySampleData = [
  { id: 'INV001', subCategory: 'Fresh produce restock', name: 'Fresh Produce - Tomatoes', quantity: 50, unit: 'kg', price: 25.00, supplier: 'Local Farms' },
  { id: 'INV002', subCategory: 'Fresh produce restock', name: 'Fresh Produce - Lettuce', quantity: 35, unit: 'kg', price: 22.50, supplier: 'Green Valley' },
  { id: 'INV003', subCategory: 'Fresh produce restock', name: 'Fresh Produce - Onions', quantity: 40, unit: 'kg', price: 18.75, supplier: 'Farm Direct' },

  { id: 'INV004', subCategory: 'Beverage supply', name: 'Beverages - Bottled Water', quantity: 120, unit: 'bottles', price: 5.00, supplier: 'Drink Co.' },
  { id: 'INV005', subCategory: 'Beverage supply', name: 'Beverages - Iced Tea Mix', quantity: 80, unit: 'packs', price: 12.00, supplier: 'Brew Hub' },
  { id: 'INV006', subCategory: 'Beverage supply', name: 'Beverages - Softdrinks', quantity: 90, unit: 'cans', price: 18.00, supplier: 'Fizz Traders' },

  { id: 'INV007', subCategory: 'Meat Products', name: 'Meat Products - Chicken Breast', quantity: 30, unit: 'kg', price: 150.00, supplier: 'Butcher Shop' },
  { id: 'INV008', subCategory: 'Meat Products', name: 'Meat Products - Pork Belly', quantity: 25, unit: 'kg', price: 210.00, supplier: 'Prime Cuts' },
  { id: 'INV009', subCategory: 'Meat Products', name: 'Meat Products - Ground Beef', quantity: 20, unit: 'kg', price: 260.00, supplier: 'Meat Central' },
];

const maintenanceSampleData = [
  { id: 'MNT001', subCategory: 'Kitchen equipment repair', item: 'Kitchen Equipment', description: 'Oven repair', cost: 1500.00, date: '2026-02-22', technician: 'FixIt Co.' },
  { id: 'MNT002', subCategory: 'Kitchen equipment repair', item: 'Kitchen Equipment', description: 'Grill thermostat replacement', cost: 950.00, date: '2026-02-18', technician: 'HeatTech' },
  { id: 'MNT003', subCategory: 'Kitchen equipment repair', item: 'Kitchen Equipment', description: 'Exhaust fan motor service', cost: 780.00, date: '2026-02-16', technician: 'FixIt Co.' },

  { id: 'MNT004', subCategory: 'Plumbing', item: 'Plumbing', description: 'Leaky faucet fix', cost: 300.00, date: '2026-02-15', technician: 'WaterWorks' },
  { id: 'MNT005', subCategory: 'Plumbing', item: 'Plumbing', description: 'Drain pipe unclogging', cost: 550.00, date: '2026-02-12', technician: 'FlowPro' },
  { id: 'MNT006', subCategory: 'Plumbing', item: 'Plumbing', description: 'Water pressure valve replacement', cost: 720.00, date: '2026-02-10', technician: 'Pipe Masters' },
];

const utilitiesSampleData = [
  { id: 'UTL001', subCategory: 'Electricty', type: 'Main Branch electric bill for Feb', bill_amount: 450.50, due_date: '2026-03-01', provider: 'PowerGen' },
  { id: 'UTL002', subCategory: 'Electricty', type: 'Downtown electric bill for Feb', bill_amount: 520.00, due_date: '2026-03-02', provider: 'PowerGen' },
  { id: 'UTL003', subCategory: 'Electricty', type: 'Kitchen equipment electric usage charge', bill_amount: 310.25, due_date: '2026-03-03', provider: 'PowerGen' },

  { id: 'UTL004', subCategory: 'Water', type: 'Main Branch water bill for Feb', bill_amount: 120.00, due_date: '2026-03-05', provider: 'AquaCorp' },
  { id: 'UTL005', subCategory: 'Water', type: 'Downtown water bill for Feb', bill_amount: 98.75, due_date: '2026-03-06', provider: 'AquaCorp' },
  { id: 'UTL006', subCategory: 'Water', type: 'Water refilling station service fee', bill_amount: 75.50, due_date: '2026-03-07', provider: 'ClearFlow' },

  { id: 'UTL007', subCategory: 'Internet', type: 'Plan PLDT subscription for Feb', bill_amount: 1699.00, due_date: '2026-03-08', provider: 'PLDT' },
  { id: 'UTL008', subCategory: 'Internet', type: 'Backup Globe Fiber subscription for Feb', bill_amount: 1299.00, due_date: '2026-03-09', provider: 'Globe' },
  { id: 'UTL009', subCategory: 'Internet', type: 'POS terminal internet add-on fee', bill_amount: 450.00, due_date: '2026-03-10', provider: 'Converge' },

  { id: 'UTL010', subCategory: 'Salaries', type: 'Cashier salary payout - Week 1', bill_amount: 3200.00, due_date: '2026-03-11', provider: 'Payroll Team' },
  { id: 'UTL011', subCategory: 'Salaries', type: 'Kitchen staff salary payout - Week 1', bill_amount: 4800.00, due_date: '2026-03-12', provider: 'Payroll Team' },
  { id: 'UTL012', subCategory: 'Salaries', type: 'Service crew salary payout - Week 1', bill_amount: 4100.00, due_date: '2026-03-13', provider: 'Payroll Team' },
];

// Columns for expense data
const columns: ColumnDef<typeof expenseData[0]>[] = [
  {
    header: 'Date',
    className: 'w-[18%] text-left',
    render: (expense) => (
      <div className="flex items-center gap-2 text-brand-text font-medium">
          <Calendar size={16} className="text-brand-muted" />
          {expense.date}
        </div>
    ),
  },
  {
    header: 'Description',
    className: 'w-[42%] text-left',
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
    className: 'w-[14%] text-left',
    render: (expense) => (
      <span className="text-base font-bold text-brand-text">
          ₱{expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
    ),
  },
  {
    header: 'Status',
    className: 'w-[14%] text-left',
    render: (expense) => (
      <div className="flex justify-start">
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
    className: 'w-[12%] text-left',
    render: () => (
      <div className="flex justify-start items-center gap-2">
          <button 
            className="p-2 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors rounded-lg"
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


// Columns for inventory sample data
const inventoryColumns: ColumnDef<typeof inventorySampleData[0]>[] = [
  {
    header: 'ID',
    className: 'w-[120px] text-left',
    render: (item) => <span className="font-medium text-brand-text">{item.id}</span>,
  },
  {
    header: 'Item Name',
    className: 'flex-1 text-left min-w-[250px]',
    render: (item) => <span className="text-brand-text">{item.name}</span>,
  },
  {
    header: 'Quantity',
    className: 'text-right w-[150px]',
    render: (item) => <span className="text-brand-text">{item.quantity} {item.unit}</span>,
  },
  {
    header: 'Unit Price',
    className: 'text-right w-[160px]',
    render: (item) => <span className="text-brand-text">₱{item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>,
  },
  {
    header: 'Supplier',
    className: 'w-[180px] text-left',
    render: (item) => <span className="text-brand-text">{item.supplier}</span>,
  },
];

const maintenanceColumns: ColumnDef<typeof maintenanceSampleData[0]>[] = [
  {
    header: 'ID',
    className: 'w-[120px] text-left',
    render: (item) => <span className="font-medium text-brand-text">{item.id}</span>,
  },
  {
    header: 'Item',
    className: 'w-[180px] text-left',
    render: (item) => <span className="text-brand-text">{item.item}</span>,
  },
  {
    header: 'Description',
    className: 'flex-1 text-left min-w-[250px]',
    render: (item) => <span className="text-brand-text">{item.description}</span>,
  },
  {
    header: 'Cost',
    className: 'text-right w-[150px]',
    render: (item) => <span className="text-brand-text">₱{item.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>,
  },
  {
    header: 'Date',
    className: 'w-[140px] text-left',
    render: (item) => <span className="text-brand-text">{item.date}</span>,
  },
  {
    header: 'Technician',
    className: 'w-[180px] text-left',
    render: (item) => <span className="text-brand-text">{item.technician}</span>,
  },
];

const utilitiesColumns: ColumnDef<typeof utilitiesSampleData[0]>[] = [
  {
    header: 'ID',
    className: 'w-[120px] text-left',
    render: (item) => <span className="font-medium text-brand-text">{item.id}</span>,
  },
  {
    header: 'Type',
    className: 'flex-1 text-left min-w-[200px]',
    render: (item) => <span className="text-brand-text">{item.type}</span>,
  },
  {
    header: 'Bill Amount',
    className: 'text-right w-[160px]',
    render: (item) => <span className="text-brand-text">₱{item.bill_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>,
  },
  {
    header: 'Due Date',
    className: 'w-[150px] text-left',
    render: (item) => <span className="text-brand-text">{item.due_date}</span>,
  },
  {
    header: 'Provider',
    className: 'w-[180px] text-left',
    render: (item) => <span className="text-brand-text">{item.provider}</span>,
  },
];

export const Expenses: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [displayedData, setDisplayedData] = useState<any[]>([]);
  const [displayedColumns, setDisplayedColumns] = useState<ColumnDef<any>[]>([]);
  const [activeParentCategory, setActiveParentCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);

  const subCategoryConfig: { [key: string]: { [key: string]: { data: any[]; columns: ColumnDef<any>[]; } | null } } = {
    Inventory: {
      'All Data': { data: inventorySampleData, columns: inventoryColumns },
      'Fresh produce restock': { data: inventorySampleData.filter(item => item.subCategory === 'Fresh produce restock'), columns: inventoryColumns },
      'Beverage supply': { data: inventorySampleData.filter(item => item.subCategory === 'Beverage supply'), columns: inventoryColumns },
      'Meat Products': { data: inventorySampleData.filter(item => item.subCategory === 'Meat Products'), columns: inventoryColumns },
    },
    Maintenance: {
      'All Data': { data: maintenanceSampleData, columns: maintenanceColumns },
      'Kitchen equipment repair': { data: maintenanceSampleData.filter(item => item.subCategory === 'Kitchen equipment repair'), columns: maintenanceColumns },
      'Plumbing': { data: maintenanceSampleData.filter(item => item.subCategory === 'Plumbing'), columns: maintenanceColumns },
    },
    Utilities: {
      'All Data': { data: utilitiesSampleData, columns: utilitiesColumns },
      'Electricty': { data: utilitiesSampleData.filter(item => item.subCategory === 'Electricty'), columns: utilitiesColumns },
      'Water': { data: utilitiesSampleData.filter(item => item.subCategory === 'Water'), columns: utilitiesColumns },
      'Internet': { data: utilitiesSampleData.filter(item => item.subCategory === 'Internet'), columns: utilitiesColumns },
      'Salaries': { data: utilitiesSampleData.filter(item => item.subCategory === 'Salaries'), columns: utilitiesColumns },
    },
  };

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => {
      setLoading(false);
      // Initialize with all expense data and columns
      setDisplayedData(expenseData);
      setDisplayedColumns(columns);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let currentData: any[] = expenseData;
    let currentColumns: ColumnDef<any>[] = columns;

    if (activeParentCategory) {
      if (selectedSubCategory && subCategoryConfig[activeParentCategory]?.[selectedSubCategory]) {
        const config = subCategoryConfig[activeParentCategory][selectedSubCategory];
        if (config) {
          currentData = config.data;
          currentColumns = config.columns;
        }
      } else {
        // If "All Data" or no specific sub-category selected under a parent category
        currentData = expenseData.filter(e => e.category === activeParentCategory);
        currentColumns = columns;
      }
    }
    setDisplayedData(currentData);
    setDisplayedColumns(currentColumns);
  }, [activeParentCategory, selectedSubCategory]);

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
                    className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                  />
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-brand-primary text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all"
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
              <div
                className="bg-white p-6 rounded-2xl shadow-sm cursor-pointer hover:ring-2 hover:ring-brand-primary/20 transition-all"
                onClick={() => {setActiveParentCategory('Inventory'); setSelectedSubCategory('All Data');}}
              >
                <p className="text-brand-muted text-sm font-medium mb-1">Inventory</p>
                <h3 className="text-3xl font-bold text-brand-text">₱2,140.25</h3>
              </div>
              <div
                className="bg-white p-6 rounded-2xl shadow-sm cursor-pointer hover:ring-2 hover:ring-brand-maintenance/30 transition-all"
                onClick={() => {setActiveParentCategory('Maintenance'); setSelectedSubCategory('All Data');}}
              >
                <p className="text-brand-muted text-sm font-medium mb-1">Maintenance</p>
                <h3 className="text-3xl font-bold text-brand-text">₱320.00</h3>
              </div>
              <div 
                className="bg-white p-6 rounded-2xl shadow-sm cursor-pointer hover:ring-2 hover:ring-brand-utilities/30 transition-all"
                onClick={() => {setActiveParentCategory('Utilities'); setSelectedSubCategory('All Data');}}
              >
                <p className="text-brand-muted text-sm font-medium mb-1">Utilities</p>
                <h3 className="text-3xl font-bold text-brand-text">₱450.50</h3>
              </div>
            </div>

            {activeParentCategory && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {Object.keys(subCategoryConfig[activeParentCategory] || {}).map((subCat) => (
                    <button
                      key={subCat}
                      onClick={() => setSelectedSubCategory(subCat)}
                      className={cn(
                        "text-sm font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all",
                        activeParentCategory === 'Maintenance'
                          ? selectedSubCategory === subCat
                            ? "bg-brand-maintenance text-white shadow-lg shadow-brand-maintenance/20"
                            : "bg-brand-maintenance-soft text-brand-maintenance hover:bg-brand-maintenance-soft/70"
                          : activeParentCategory === 'Utilities'
                          ? selectedSubCategory === subCat
                            ? "bg-brand-utilities text-white shadow-lg shadow-brand-utilities/20"
                            : "bg-brand-utilities-soft text-brand-utilities hover:bg-brand-utilities-soft/70"
                          : selectedSubCategory === subCat
                          ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/20"
                          : "bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20"
                      )}
                    >
                      {subCat}
                    </button>
                  ))}
                  <button
                    onClick={() => {setActiveParentCategory(null); setSelectedSubCategory(null);}}
                    className="ml-auto p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
                    title="Clear Filter"
                  >
                    <X size={16} />
                  </button>
                </div>
              </motion.div>
            )}
            <DataTable
              data={displayedData}
              columns={displayedColumns}
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
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98]"
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
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                />
            </div>
            <div>
                <label className="block text-sm font-bold text-brand-text mb-2">Amount</label>
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₱</span>
                    <input 
                    type="number" 
                    placeholder="0.00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                    />
                </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">Category</label>
            <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all text-brand-text cursor-pointer appearance-none">
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
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">Branch</label>
            <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all text-brand-text cursor-pointer appearance-none">
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
