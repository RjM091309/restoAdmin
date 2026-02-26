import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Filter, Package, Droplets, Leaf, Beef, Wheat, Fish, Flame, Shell, Coffee, Edit2, Trash2 } from 'lucide-react';
import { DataTable, ColumnDef } from '../ui/DataTable';
import { cn } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { motion, AnimatePresence } from 'framer-motion';
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '../ui/Skeleton';
import { type Branch } from '../partials/Header';
import { 
  getInventoryCategories, 
  createInventoryCategory, 
  updateInventoryCategory, 
  deleteInventoryCategory,
  type InventoryCategory 
} from '../../services/inventoryService';
import { getInventoryItems, type InventoryItem } from '../../services/inventoryItemService';
import { toast } from 'sonner';


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

const getIconFromKey = (icon: string | null | undefined) => {
  const map: Record<string, any> = {
    package: Package,
    beef: Beef,
    fish: Fish,
    leaf: Leaf,
    droplets: Droplets,
    wheat: Wheat,
    shell: Shell,
    coffee: Coffee,
    flame: Flame,
  };
  return map[String(icon || '').toLowerCase()] || null;
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

const CATEGORY_TYPE_OPTIONS = [
  'Inventory',
  'Maintenance',
  'Utilities / Bills',
  'Salary & Rent',
  'Others',
] as const;

interface CategoriesProps {
  onCategoryClick: (category: string) => void;
  selectedBranch: Branch | null;
}

export const Categories: React.FC<CategoriesProps> = ({ onCategoryClick, selectedBranch }) => {
  const { t, i18n } = useTranslation();
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    categoryType: 'Inventory',
    description: '',
    icon: 'package'
  });

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const branchId = String(selectedBranch?.id || '');
      const [categoryRows, inventoryRows] = await Promise.all([
        getInventoryCategories(branchId),
        getInventoryItems(branchId),
      ]);
      setCategories(categoryRows);
      setInventoryItems(inventoryRows);
    } catch (error: any) {
      toast.error(error.message || t('categories.messages.fetch_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedBranch) return;
    fetchCategories();
  }, [selectedBranch?.id]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error(t('categories.messages.name_required'));
      return;
    }

    try {
      if (editingId) {
        await updateInventoryCategory(editingId, {
          name: formData.name,
          categoryType: formData.categoryType,
          description: formData.description,
          icon: formData.icon,
        });
        toast.success(t('categories.messages.update_success'));
      } else {
        if (!selectedBranch || selectedBranch.id === 'all') {
          toast.error(t('categories.messages.select_branch'));
          return;
        }
        await createInventoryCategory({
          branchId: String(selectedBranch.id),
          name: formData.name,
          categoryType: formData.categoryType,
          description: formData.description,
          icon: formData.icon,
        });
        toast.success(t('categories.messages.create_success'));
      }
      setIsModalOpen(false);
      resetForm();
      fetchCategories();
    } catch (error: any) {
      toast.error(error.message || t('categories.messages.save_failed'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('categories.delete_confirm'))) return;
    
    try {
      await deleteInventoryCategory(id);
      toast.success(t('categories.messages.delete_success'));
      fetchCategories();
    } catch (error: any) {
      toast.error(error.message || t('categories.messages.delete_failed'));
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({ name: '', categoryType: 'Inventory', description: '', icon: 'package' });
  };

  const openEdit = (category: InventoryCategory) => {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      categoryType: category.categoryType || 'Inventory',
      description: category.description || '',
      icon: category.icon || 'package',
    });
    setIsModalOpen(true);
  };

  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categoryMetrics = useMemo(() => {
    const metrics = new Map<string, { totalItems: number; totalValue: number }>();
    const keyForName = (value: string) => String(value || '').trim().toLowerCase();

    categories.forEach((category) => {
      metrics.set(category.id, { totalItems: 0, totalValue: 0 });
      metrics.set(`name:${keyForName(category.name)}`, { totalItems: 0, totalValue: 0 });
    });

    inventoryItems.forEach((item) => {
      const idKey = item.categoryId || '';
      const nameKey = `name:${keyForName(item.categoryName || '')}`;
      const target =
        (idKey && metrics.get(idKey)) ||
        metrics.get(nameKey);

      if (!target) return;
      target.totalItems += 1;
      target.totalValue += Number(item.stockQty || 0) * Number(item.unitCost || 0);
    });

    return metrics;
  }, [categories, inventoryItems]);

  const dashboardMetrics = useMemo(() => {
    const totalItems = inventoryItems.length;
    const totalValue = inventoryItems.reduce(
      (sum, item) => sum + Number(item.stockQty || 0) * Number(item.unitCost || 0),
      0
    );
    const needsAttention = inventoryItems.filter((item) => Number(item.stockQty || 0) <= Number(item.reorderLevel || 0)).length;
    return { totalItems, totalValue, needsAttention };
  }, [inventoryItems]);

  const localeForLanguage = (lng: string) => {
    const base = String(lng || 'en').split('-')[0];
    if (base === 'ja') return 'ja-JP';
    if (base === 'ko') return 'ko-KR';
    if (base === 'zh') return 'zh-CN';
    return 'en-US';
  };

  const formatValue = (value: number) =>
    `${t('common.currency_symbol')}${Number(value || 0).toLocaleString(localeForLanguage(i18n.language), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const columns: ColumnDef<InventoryCategory>[] = [
    {
      header: t('categories.category_name'),
      className: 'w-1/3',
      render: (category) => {
        const IconFromKey = getIconFromKey(category.icon);
        const IconComponent = IconFromKey || getIconForCategory(category.name);
        return (
          <div 
            className="flex items-center gap-4 cursor-pointer group"
            onClick={() => onCategoryClick(category.name)}
          >
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-brand-muted group-hover:bg-brand-primary group-hover:text-white transition-colors shrink-0">
              <IconComponent size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-brand-text mb-0.5 group-hover:text-brand-primary transition-colors">
                {category.name}
              </h3>
              <p className="text-xs text-brand-muted font-medium truncate max-w-[200px] xl:max-w-[300px]">
                {category.description || t('categories.no_description')}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      header: t('categories.total_items'),
      className: 'text-center',
      render: (category) => {
        const metric =
          categoryMetrics.get(category.id) ||
          categoryMetrics.get(`name:${String(category.name).trim().toLowerCase()}`) ||
          { totalItems: 0, totalValue: 0 };
        return (
        <div className="flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-brand-text">{metric.totalItems}</span>
          <span className="text-xs text-brand-muted">{t('categories.products')}</span>
        </div>
        );
      },
    },
    {
      header: t('categories.total_value'),
      className: 'text-center',
      render: (category) => {
        const metric =
          categoryMetrics.get(category.id) ||
          categoryMetrics.get(`name:${String(category.name).trim().toLowerCase()}`) ||
          { totalItems: 0, totalValue: 0 };
        return (
        <div className="flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-brand-text">{formatValue(metric.totalValue)}</span>
          <span className="text-xs text-brand-muted">{t('categories.asset_value')}</span>
        </div>
        );
      },
    },
    {
      header: t('categories.status'),
      className: 'text-center',
      render: (category) => (
        <div className="flex justify-center">
          <span
            className={cn(
              "text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 w-fit",
              category.active
                ? "bg-green-100 text-green-600"
                : "bg-red-100 text-red-600"
            )}
          >
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              category.active ? "bg-green-500" : "bg-red-500"
            )} />
            {category.active ? t('categories.active') : t('categories.inactive')}
          </span>
        </div>
      ),
    },
    {
      header: t('categories.actions'),
      className: 'text-right',
      render: (category) => (
        <div className="flex justify-end items-center gap-2">
          <button 
            className="p-2 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(category);
            }}
            title={t('categories.edit_category')}
          >
            <Edit2 size={16} />
          </button>
          <button 
            className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(category.id);
            }}
            title={t('categories.delete_category')}
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
                    placeholder={t('categories.search_placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-orange/20 outline-none"
                  />
                </div>
              </div>
              <button 
                onClick={() => {
                  resetForm();
                  setIsModalOpen(true);
                }}
                className="bg-brand-primary text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all"
              >
                <Plus size={18} />
                {t('categories.new_category')}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">{t('categories.total_categories')}</p>
                <h3 className="text-3xl font-bold">{categories.length}</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">{t('categories.total_items')}</p>
                <h3 className="text-3xl font-bold">{dashboardMetrics.totalItems}</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">{t('categories.total_value')}</p>
                <h3 className="text-3xl font-bold text-green-600">{formatValue(dashboardMetrics.totalValue)}</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">{t('categories.needs_attention')}</p>
                <h3 className="text-3xl font-bold text-orange-500">{dashboardMetrics.needsAttention}</h3>
              </div>
            </div>

            <DataTable
              data={filteredCategories}
              columns={columns}
              keyExtractor={(item) => item.id}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* New/Edit Category Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={editingId ? t('categories.edit_category') : t('categories.add_new_category')}
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
              className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors"
            >
              {t('categories.cancel')}
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98]"
            >
              {editingId ? t('categories.update_category') : t('categories.save_category')}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">{t('categories.form_name')}</label>
            <input 
              type="text" 
              placeholder={t('categories.form_name_placeholder')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">{t('categories.form_type')}</label>
            <select
              value={formData.categoryType}
              onChange={(e) => setFormData({ ...formData, categoryType: e.target.value })}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all text-brand-text cursor-pointer appearance-none"
            >
              {CATEGORY_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type === 'Inventory' ? t('categories.types.inventory') :
                   type === 'Maintenance' ? t('categories.types.maintenance') :
                   type === 'Utilities / Bills' ? t('categories.types.utilities_bills') :
                   type === 'Salary & Rent' ? t('categories.types.salary_rent') :
                   t('categories.types.others')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">{t('categories.form_description')}</label>
            <textarea 
              rows={3}
              placeholder={t('categories.form_description_placeholder')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">{t('categories.form_icon')}</label>
            <select 
              value={formData.icon}
              onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all text-brand-text cursor-pointer appearance-none"
            >
              <option value="package">{t('categories.icons.default_box')}</option>
              <option value="beef">{t('categories.icons.beef_meat')}</option>
              <option value="fish">{t('categories.icons.fish_seafood')}</option>
              <option value="leaf">{t('categories.icons.vegetables_produce')}</option>
              <option value="droplets">{t('categories.icons.dairy')}</option>
              <option value="wheat">{t('categories.icons.grains')}</option>
              <option value="coffee">{t('categories.icons.beverages')}</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
};
