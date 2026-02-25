import React, { useState, useEffect } from 'react';
import { Search, Plus, Filter, Package, Droplets, Leaf, Beef, Wheat, Fish, Flame, Shell, Coffee, Edit2, Trash2 } from 'lucide-react';
import { DataTable, ColumnDef } from '../ui/DataTable';
import { cn } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { motion, AnimatePresence } from 'framer-motion';
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '../ui/Skeleton';


// Icon mapping based on category name
const getIconForCategory = (name: string) => {
  const map: Record<string, any> = {
    'Meat': Beef,
    'Seafood': Fish,
    'Vegetables': Leaf,
    'Dairy': Droplets,
    'Grains': Wheat,
    'Oils': Flame,
    'Pasta': Shell,
    'Beverages': Coffee,
  };
  return map[name] || Package;
};

const categoryData = [
  { id: 'CAT001', name: 'Meat', description: 'Fresh cuts, poultry, and processed meats', items: 24, value: 4500, status: 'Healthy' as const },
  { id: 'CAT002', name: 'Seafood', description: 'Fish, shellfish, and frozen seafood', items: 15, value: 3200, status: 'Low Stock' as const },
  { id: 'CAT003', name: 'Vegetables', description: 'Fresh produce, roots, and leafy greens', items: 45, value: 1200, status: 'Healthy' as const },
  { id: 'CAT004', name: 'Dairy', description: 'Milk, cheese, butter, and cream', items: 18, value: 2100, status: 'Healthy' as const },
  { id: 'CAT005', name: 'Grains', description: 'Rice, quinoa, oats, and cereals', items: 12, value: 850, status: 'Healthy' as const },
  { id: 'CAT006', name: 'Oils', description: 'Cooking oils, vinegar, and dressings', items: 8, value: 950, status: 'Critical' as const },
  { id: 'CAT007', name: 'Pasta', description: 'Dried pasta, noodles, and wrappers', items: 20, value: 640, status: 'Healthy' as const },
  { id: 'CAT008', name: 'Beverages', description: 'Coffee, tea, sodas, and juices', items: 35, value: 1850, status: 'Healthy' as const },
];

interface CategoriesProps {
  onCategoryClick: (category: string) => void;
}

export const Categories: React.FC<CategoriesProps> = ({ onCategoryClick }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const columns: ColumnDef<typeof categoryData[0]>[] = [
    {
      header: 'Category Name',
      className: 'w-1/3',
      render: (category) => {
        const IconComponent = getIconForCategory(category.name);
        return (
          <div 
            className="flex items-center gap-4 cursor-pointer group"
            onClick={() => onCategoryClick(category.name)}
          >
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-brand-muted group-hover:bg-brand-orange group-hover:text-white transition-colors shrink-0">
              <IconComponent size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-brand-text mb-0.5 group-hover:text-brand-orange transition-colors">
                {category.name}
              </h3>
              <p className="text-xs text-brand-muted font-medium truncate max-w-[200px] xl:max-w-[300px]">
                {category.description}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Total Items',
      className: 'text-center',
      render: (category) => (
        <div className="flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-brand-text">{category.items}</span>
          <span className="text-xs text-brand-muted">Products</span>
        </div>
      ),
    },
    {
      header: 'Total Value',
      className: 'text-center',
      render: (category) => (
        <div className="flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-brand-text">${category.value.toLocaleString()}</span>
          <span className="text-xs text-brand-muted">Asset Value</span>
        </div>
      ),
    },
    {
      header: 'Status',
      className: 'text-center',
      render: (category) => (
        <div className="flex justify-center">
          <span
            className={cn(
              "text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 w-fit",
              category.status === 'Healthy'
                ? "bg-green-100 text-green-600"
                : category.status === 'Low Stock'
                ? "bg-orange-100 text-orange-600"
                : "bg-red-100 text-red-600"
            )}
          >
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              category.status === 'Healthy' ? "bg-green-500" :
              category.status === 'Low Stock' ? "bg-orange-500" : "bg-red-500"
            )} />
            {category.status}
          </span>
        </div>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      render: () => (
        <div className="flex justify-end items-center gap-2">
          <button 
            className="p-2 text-brand-muted hover:text-brand-orange hover:bg-brand-orange/10 transition-colors rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              // Handle edit
            }}
            title="Edit Category"
          >
            <Edit2 size={16} />
          </button>
          <button 
            className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              // Handle delete
            }}
            title="Delete Category"
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
                    placeholder="Search categories..."
                    className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-orange/20 outline-none"
                  />
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-brand-orange text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-brand-orange/20 hover:bg-brand-orange/90 transition-all"
              >
                <Plus size={18} />
                New Category
              </button>
            </div>

            <div className="grid grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Total Categories</p>
                <h3 className="text-3xl font-bold">{categoryData.length}</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Total Items</p>
                <h3 className="text-3xl font-bold">177</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Total Value</p>
                <h3 className="text-3xl font-bold text-green-600">$15,290</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Needs Attention</p>
                <h3 className="text-3xl font-bold text-orange-500">2</h3>
              </div>
            </div>

            <DataTable
              data={categoryData}
              columns={columns}
              keyExtractor={(item) => item.id}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Category Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Category"
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
              Save Category
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">Category Name</label>
            <input 
              type="text" 
              placeholder="e.g. Seafood, Vegetables..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">Description</label>
            <textarea 
              rows={3}
              placeholder="Brief description of items in this category"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">Icon Setup</label>
            <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all text-brand-text cursor-pointer appearance-none">
              <option value="beef">Beef / Meat</option>
              <option value="fish">Fish / Seafood</option>
              <option value="leaf">Vegetables / Produce</option>
              <option value="droplets">Dairy</option>
              <option value="wheat">Grains</option>
              <option value="coffee">Beverages</option>
              <option value="package">Default Box</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
};
