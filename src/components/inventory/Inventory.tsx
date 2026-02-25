import React, { useState, useEffect } from 'react';
import { Filter, Search, Plus, AlertTriangle, ArrowLeft, Edit2, Trash2 } from 'lucide-react';
import { DataTable, ColumnDef } from '../ui/DataTable';
import { cn } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { motion, AnimatePresence } from 'framer-motion';
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '../ui/Skeleton';


const inventoryData = [
  { id: 'INV001', name: 'Fresh Salmon', category: 'Seafood', stock: 15, unit: 'kg', status: 'In Stock' as const },
  { id: 'INV002', name: 'Chicken Breast', category: 'Meat', stock: 5, unit: 'kg', status: 'Low Stock' as const },
  { id: 'INV003', name: 'Basmati Rice', category: 'Grains', stock: 50, unit: 'kg', status: 'In Stock' as const },
  { id: 'INV004', name: 'Olive Oil', category: 'Oils', stock: 2, unit: 'L', status: 'Out of Stock' as const },
  { id: 'INV005', name: 'Tomatoes', category: 'Vegetables', stock: 12, unit: 'kg', status: 'In Stock' as const },
  { id: 'INV006', name: 'Pasta Penne', category: 'Pasta', stock: 20, unit: 'kg', status: 'In Stock' as const },
  { id: 'INV007', name: 'Heavy Cream', category: 'Dairy', stock: 4, unit: 'L', status: 'Low Stock' as const },
  { id: 'INV008', name: 'Wagyu Beef', category: 'Meat', stock: 0, unit: 'kg', status: 'Out of Stock' as const },
  { id: 'INV009', name: 'Parmesan Cheese', category: 'Dairy', stock: 8, unit: 'kg', status: 'In Stock' as const },
  { id: 'INV010', name: 'Soy Sauce', category: 'Sauces', stock: 15, unit: 'L', status: 'In Stock' as const },
  { id: 'INV011', name: 'Black Pepper', category: 'Spices', stock: 3, unit: 'kg', status: 'Low Stock' as const },
  { id: 'INV012', name: 'Onions', category: 'Vegetables', stock: 25, unit: 'kg', status: 'In Stock' as const },
  { id: 'INV013', name: 'Garlic', category: 'Vegetables', stock: 10, unit: 'kg', status: 'In Stock' as const },
  { id: 'INV014', name: 'Balsamic Vinegar', category: 'Sauces', stock: 5, unit: 'L', status: 'Low Stock' as const },
  { id: 'INV015', name: 'Truffle Oil', category: 'Oils', stock: 1, unit: 'L', status: 'Low Stock' as const },
  { id: 'INV016', name: 'Salmon Roe', category: 'Seafood', stock: 2, unit: 'kg', status: 'Low Stock' as const },
];

const columns: ColumnDef<typeof inventoryData[0]>[] = [
  {
    header: 'Item ID',
    render: (item) => <span className="text-sm font-bold text-brand-muted">{item.id}</span>,
  },
  {
    header: 'Name',
    render: (item) => <span className="text-sm font-bold">{item.name}</span>,
  },
  {
    header: 'Category',
    render: (item) => <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded-lg">{item.category}</span>,
  },
  {
    header: 'Stock Level',
    render: (item) => (
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">{item.stock} {item.unit}</span>
        <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full",
              item.status === 'In Stock' ? "bg-green-500" :
              item.status === 'Low Stock' ? "bg-orange-500" : "bg-red-500"
            )}
            style={{ width: `${Math.min((item.stock / 50) * 100, 100)}%` }}
          />
        </div>
      </div>
    ),
  },
  {
    header: 'Status',
    render: (item) => (
      <span className={cn(
        "text-xs font-bold px-2 py-1 rounded-lg",
        item.status === 'In Stock' ? "bg-green-100 text-green-600" :
        item.status === 'Low Stock' ? "bg-orange-100 text-orange-600" :
        "bg-red-100 text-red-600"
      )}>
        {item.status}
      </span>
    ),
  },
  {
    header: 'Actions',
    className: 'text-right',
    render: () => (
      <div className="flex justify-end items-center gap-2">
        <button 
          className="p-2 text-brand-muted hover:text-brand-orange hover:bg-brand-orange/10 transition-colors rounded-lg"
          title="Edit Item"
        >
          <Edit2 size={16} />
        </button>
        <button 
          className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
          title="Delete Item"
        >
          <Trash2 size={16} />
        </button>
      </div>
    ),
  },
];

interface InventoryProps {
  onBack?: () => void;
}

export const Inventory: React.FC<InventoryProps> = ({ onBack }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

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
              <SkeletonTable columns={6} rows={10} />
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
                {onBack && (
                  <button 
                    onClick={onBack}
                    className="bg-white p-3 rounded-xl shadow-sm border border-transparent hover:border-brand-orange/30 transition-all group"
                    title="Back to Categories"
                  >
                    <ArrowLeft size={18} className="text-brand-muted group-hover:text-brand-orange transition-colors" />
                  </button>
                )}
                <div className="bg-white p-3 rounded-xl shadow-sm">
                  <Filter size={18} className="text-brand-muted" />
                </div>
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                  <input
                    type="text"
                    placeholder="Search inventory..."
                    className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-orange/20 outline-none"
                  />
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-brand-orange text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-brand-orange/20 hover:bg-brand-orange/90 transition-all"
              >
                <Plus size={18} />
                Add New Item
              </button>
            </div>

            <div className="grid grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Total Items</p>
                <h3 className="text-3xl font-bold">156</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Low Stock</p>
                <div className="flex items-center gap-2">
                  <h3 className="text-3xl font-bold text-orange-500">12</h3>
                  <AlertTriangle size={18} className="text-orange-500" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Out of Stock</p>
                <h3 className="text-3xl font-bold text-red-500">3</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Categories</p>
                <h3 className="text-3xl font-bold">8</h3>
              </div>
            </div>

            <DataTable
              data={inventoryData}
              columns={columns}
              keyExtractor={(item) => item.id}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add New Item Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Inventory Item"
        maxWidth="lg"
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
              Save Item
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-bold text-brand-text mb-2">Item Name</label>
              <input 
                type="text" 
                placeholder="e.g. Fresh Salmon"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-brand-text mb-2">Item ID Code</label>
              <input 
                type="text" 
                placeholder="e.g. INV017"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-bold text-brand-text mb-2">Category</label>
              <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all text-brand-text cursor-pointer appearance-none">
                <option value="Seafood">Seafood</option>
                <option value="Meat">Meat</option>
                <option value="Vegetables">Vegetables</option>
                <option value="Dairy">Dairy</option>
                <option value="Grains">Grains</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-brand-text mb-2">Stock Level & Unit</label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  placeholder="0"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
                />
                <select className="w-24 bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all text-brand-text cursor-pointer appearance-none shrink-0">
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="L">L</option>
                  <option value="pcs">pcs</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">Status Flag</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="status" defaultChecked className="w-4 h-4 text-green-500 focus:ring-green-500/20 cursor-pointer" />
                <span className="text-sm font-bold text-brand-text">In Stock</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="status" className="w-4 h-4 text-orange-500 focus:ring-orange-500/20 cursor-pointer" />
                <span className="text-sm font-bold text-brand-text">Low Stock</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="status" className="w-4 h-4 text-red-500 focus:ring-red-500/20 cursor-pointer" />
                <span className="text-sm font-bold text-brand-text">Out of Stock</span>
              </label>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
