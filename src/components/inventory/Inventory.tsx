import React, { useEffect, useMemo, useState } from 'react';
import { Filter, Search, Plus, AlertTriangle, ArrowLeft, Edit2, Trash2, Package } from 'lucide-react';
import { DataTable, ColumnDef } from '../ui/DataTable';
import { cn } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { motion, AnimatePresence } from 'framer-motion';
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '../ui/Skeleton';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  createInventoryItem,
  deleteInventoryItem,
  getInventoryItems,
  updateInventoryItem,
  type InventoryItem,
} from '../../services/inventoryItemService';
import { getInventoryCategories, type InventoryCategory } from '../../services/inventoryService';
import { type Branch } from '../partials/Header';

interface InventoryProps {
  onBack?: () => void;
  selectedBranch?: Branch | null;
}

type ItemStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

const UNIT_OPTIONS = ['kg', 'g', 'L', 'mL', 'pcs'] as const;
type UnitOption = (typeof UNIT_OPTIONS)[number];

const normalizeStatus = (status: string): ItemStatus => {
  if (status === 'Low Stock' || status === 'Out of Stock') return status;
  return 'In Stock';
};

const computeStatus = (stockQty: number, reorderLevel: number): ItemStatus => {
  if (stockQty <= 0) return 'Out of Stock';
  if (stockQty <= reorderLevel) return 'Low Stock';
  return 'In Stock';
};

const toItemCode = (id: string) => `INV-${String(Number(id) || 0).padStart(3, '0')}`;

const convertQuantityByUnit = (value: number, fromUnit: string, toUnit: string) => {
  const from = String(fromUnit || '').toLowerCase();
  const to = String(toUnit || '').toLowerCase();
  if (from === to) return value;

  if (from === 'kg' && to === 'g') return value * 1000;
  if (from === 'g' && to === 'kg') return value / 1000;
  if (from === 'l' && to === 'ml') return value * 1000;
  if (from === 'ml' && to === 'l') return value / 1000;

  return value;
};

const normalizeSegment = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

export const Inventory: React.FC<InventoryProps> = ({ onBack, selectedBranch = null }) => {
  const { categoryName } = useParams<{ categoryName: string }>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRestockMode, setIsRestockMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [restockQtyInput, setRestockQtyInput] = useState('');
  const [restockUnitCostInput, setRestockUnitCostInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [formData, setFormData] = useState({
    itemName: '',
    stockQty: 0,
    unit: 'kg',
    unitCost: 0,
    reorderLevel: 5,
    statusFlag: 'In Stock' as ItemStatus,
  });

  const categoryParam = (categoryName || '').toLowerCase();
  const currentCategory = useMemo(
    () =>
      categories.find(
        (category) =>
          category.name.toLowerCase() === categoryParam ||
          normalizeSegment(category.name) === normalizeSegment(categoryParam)
      ) || null,
    [categories, categoryParam]
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      const branchId = String(selectedBranch?.id || '');
      const [itemRows, categoryRows] = await Promise.all([
        getInventoryItems(branchId),
        getInventoryCategories(branchId),
      ]);
      setItems(itemRows);
      setCategories(categoryRows);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch inventory items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedBranch) return;
    fetchData();
  }, [selectedBranch?.id]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const itemCategory = String(item.categoryName || '').toLowerCase();
      const categoryMatch =
        !categoryParam ||
        itemCategory === categoryParam ||
        normalizeSegment(itemCategory) === normalizeSegment(categoryParam);

      if (!categoryMatch) return false;
      if (!q) return true;

      return (
        item.id.toLowerCase().includes(q) ||
        item.itemName.toLowerCase().includes(q) ||
        itemCategory.includes(q)
      );
    });
  }, [items, searchQuery, categoryParam]);

  const stats = useMemo(() => {
    const total = filteredItems.length;
    const low = filteredItems.filter((item) => computeStatus(item.stockQty, item.reorderLevel) === 'Low Stock').length;
    const out = filteredItems.filter((item) => computeStatus(item.stockQty, item.reorderLevel) === 'Out of Stock').length;
    const totalValue = filteredItems.reduce((sum, item) => sum + Number(item.stockQty || 0) * Number(item.unitCost || 0), 0);
    return { total, low, out, totalValue };
  }, [filteredItems]);

  const resetForm = () => {
    setEditingId(null);
    setIsRestockMode(false);
    setRestockQtyInput('');
    setRestockUnitCostInput('');
    setFormData({
      itemName: '',
      stockQty: 0,
      unit: 'kg',
      unitCost: 0,
      reorderLevel: 5,
      statusFlag: 'In Stock',
    });
  };

  const openEdit = (item: InventoryItem) => {
    setIsRestockMode(false);
    setEditingId(item.id);
    setFormData({
      itemName: item.itemName,
      stockQty: item.stockQty,
      unit: item.unit || 'kg',
      unitCost: item.unitCost || 0,
      reorderLevel: item.reorderLevel || 0,
      statusFlag: normalizeStatus(item.statusFlag || computeStatus(item.stockQty, item.reorderLevel)),
    });
    setIsModalOpen(true);
  };

  const openRestock = (item: InventoryItem) => {
    setIsRestockMode(true);
    setRestockQtyInput('');
    setRestockUnitCostInput('');
    setEditingId(item.id);
    setFormData({
      itemName: item.itemName,
      stockQty: item.stockQty,
      unit: item.unit || 'kg',
      unitCost: item.unitCost || 0,
      reorderLevel: item.reorderLevel || 0,
      statusFlag: normalizeStatus(item.statusFlag || computeStatus(item.stockQty, item.reorderLevel)),
    });
    setIsModalOpen(true);
  };

  const handleUnitChange = (nextUnit: string) => {
    setFormData((prev) => ({
      ...prev,
      unit: nextUnit as UnitOption,
      stockQty: convertQuantityByUnit(Number(prev.stockQty || 0), prev.unit, nextUnit),
      reorderLevel: convertQuantityByUnit(Number(prev.reorderLevel || 0), prev.unit, nextUnit),
    }));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    try {
      await deleteInventoryItem(id);
      toast.success('Inventory item deleted successfully');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete inventory item');
    }
  };

  const handleSave = async () => {
    if (!formData.itemName.trim()) {
      toast.error('Item name is required');
      return;
    }

    const editingItem = editingId ? items.find((item) => item.id === editingId) : null;
    const resolvedCategoryId = currentCategory?.id || editingItem?.categoryId || null;
    const resolvedCategoryName = currentCategory?.name || editingItem?.categoryName || null;
    if (!resolvedCategoryName) {
      toast.error('No inventory category selected for this page');
      return;
    }

    const payload = {
      branchId: selectedBranch && selectedBranch.id !== 'all' ? String(selectedBranch.id) : undefined,
      itemName: formData.itemName.trim(),
      categoryId: resolvedCategoryId,
      categoryName: resolvedCategoryName,
      stockQty: Number(formData.stockQty || 0),
      unit: formData.unit,
      unitCost: Number(formData.unitCost || 0),
      reorderLevel: Number(formData.reorderLevel || 0),
      statusFlag: formData.statusFlag,
    };

    if (isRestockMode) {
      const additionalQty = Number(restockQtyInput);
      if (!Number.isFinite(additionalQty) || additionalQty <= 0) {
        toast.error('Enter a valid stock quantity to add');
        return;
      }
      payload.stockQty = Number(editingItem?.stockQty || 0) + additionalQty;

      const nextUnitCostRaw = String(restockUnitCostInput || '').trim();
      if (nextUnitCostRaw !== '') {
        const nextUnitCost = Number(nextUnitCostRaw);
        if (!Number.isFinite(nextUnitCost) || nextUnitCost < 0) {
          toast.error('Enter a valid new unit cost');
          return;
        }
        payload.unitCost = nextUnitCost;
      } else {
        payload.unitCost = Number(editingItem?.unitCost || 0);
      }
    }

    try {
      if (editingId) {
        await updateInventoryItem(editingId, payload);
        toast.success('Inventory item updated successfully');
      } else {
        await createInventoryItem(payload);
        toast.success('Inventory item created successfully');
      }
      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save inventory item');
    }
  };

  const columns: ColumnDef<InventoryItem>[] = [
    {
      header: 'Item Code',
      render: (item) => <span className="text-sm font-bold text-brand-muted">{toItemCode(item.id)}</span>,
    },
    {
      header: 'Name',
      render: (item) => (
        <div>
          <span className="text-sm font-bold">{item.itemName}</span>
          <p className="text-xs text-brand-muted">{item.categoryName || 'Uncategorized'}</p>
        </div>
      ),
    },
    {
      header: 'Stock Level',
      render: (item) => {
        const status = computeStatus(item.stockQty, item.reorderLevel);
        const denominator = Math.max(item.reorderLevel * 2, item.stockQty, 1);
        const widthPercent = Math.min((item.stockQty / denominator) * 100, 100);
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">
              {item.stockQty} {item.unit}
            </span>
            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  status === 'In Stock' ? 'bg-green-500' : status === 'Low Stock' ? 'bg-orange-500' : 'bg-red-500'
                )}
                style={{ width: `${widthPercent}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      header: 'Reorder Stock',
      render: (item) => (
        <span className="text-sm font-bold text-brand-text">
          {item.reorderLevel} {item.unit}
        </span>
      ),
    },
    {
      header: 'Unit Cost',
      render: (item) => (
        <span className="text-sm font-bold text-brand-text">
          {Number(item.unitCost || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      header: 'Status',
      render: (item) => {
        const status = computeStatus(item.stockQty, item.reorderLevel);
        return (
          <span
            className={cn(
              'text-xs font-bold px-2 py-1 rounded-lg',
              status === 'In Stock'
                ? 'bg-green-100 text-green-600'
                : status === 'Low Stock'
                  ? 'bg-orange-100 text-orange-600'
                  : 'bg-red-100 text-red-600'
            )}
          >
            {status}
          </span>
        );
      },
    },
    {
      header: 'Actions',
      className: 'text-right',
      render: (item) => (
        <div className="flex justify-end items-center gap-2">
          <button
            className="p-2 text-brand-muted hover:text-emerald-600 hover:bg-emerald-50 transition-colors rounded-lg"
            title="Restock Item"
            onClick={() => openRestock(item)}
          >
            <Package size={16} />
          </button>
          <button
            className="p-2 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors rounded-lg"
            title="Edit Item"
            onClick={() => openEdit(item)}
          >
            <Edit2 size={16} />
          </button>
          <button
            className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
            title="Delete Item"
            onClick={() => handleDelete(item.id)}
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
              <SkeletonTable columns={7} rows={10} />
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
                Add New Item
              </button>
            </div>

            <div className="grid grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Total Items</p>
                <h3 className="text-3xl font-bold">{stats.total}</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Low Stock</p>
                <div className="flex items-center gap-2">
                  <h3 className="text-3xl font-bold text-orange-500">{stats.low}</h3>
                  <AlertTriangle size={18} className="text-orange-500" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Out of Stock</p>
                <h3 className="text-3xl font-bold text-red-500">{stats.out}</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <p className="text-brand-muted text-sm font-medium mb-1">Total Value</p>
                <h3 className="text-3xl font-bold">
                  ₱{stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
            </div>

            <DataTable
              data={filteredItems}
              columns={columns}
              keyExtractor={(item) => item.id}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add New Item Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={isRestockMode ? 'Restock Item' : editingId ? 'Edit Inventory Item' : 'Add New Inventory Item'}
        maxWidth="3xl"
        footer={
          <div className="flex items-center justify-end gap-2 sm:gap-3">
            <button
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
              className="px-4 sm:px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 sm:px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98]"
            >
              {isRestockMode ? 'Save Restock' : editingId ? 'Update Item' : 'Save Item'}
            </button>
          </div>
        }
      >
        {isRestockMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <div>
              <label className="block text-sm font-bold text-brand-text mb-2">Add Stock Quantity</label>
              <input
                type="number"
                placeholder="Enter quantity to add"
                value={restockQtyInput}
                onChange={(e) => setRestockQtyInput(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
              />
              <p className="mt-2 text-xs text-brand-muted">Current stock: {formData.stockQty} {formData.unit}</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-brand-text mb-2">New Unit Cost (Optional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Leave blank to keep current cost"
                value={restockUnitCostInput}
                onChange={(e) => setRestockUnitCostInput(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
              />
              <p className="mt-2 text-xs text-brand-muted">
                Current cost: {Number(formData.unitCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-7">
            <div>
              <label className="block text-sm font-bold text-brand-text mb-2">Item Name</label>
              <input
                type="text"
                placeholder="e.g. Fresh Salmon"
                value={formData.itemName}
                onChange={(e) => setFormData((prev) => ({ ...prev, itemName: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
              <div>
                <label className="block text-sm font-bold text-brand-text mb-2">Stock Level & Unit</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="0"
                    value={formData.stockQty}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        stockQty: Number(e.target.value || 0),
                      }))
                    }
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
                  />
                  <select
                    value={formData.unit}
                    onChange={(e) => handleUnitChange(e.target.value)}
                    className="w-24 sm:w-28 bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all text-brand-text cursor-pointer appearance-none shrink-0"
                  >
                    {UNIT_OPTIONS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-brand-text mb-2">Unit Cost</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.unitCost}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      unitCost: Number(e.target.value || 0),
                    }))
                  }
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-brand-text mb-2">Reorder Level</label>
                <input
                  type="number"
                  placeholder="e.g. 5"
                  value={formData.reorderLevel}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      reorderLevel: Number(e.target.value || 0),
                    }))
                  }
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-brand-text mb-2">Status Flag</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <label className={cn(
                  "flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2",
                  formData.statusFlag === 'In Stock' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
                )}>
                  <input
                    type="radio"
                    name="status"
                    checked={formData.statusFlag === 'In Stock'}
                    onChange={() => setFormData((prev) => ({ ...prev, statusFlag: 'In Stock' }))}
                    className="w-4 h-4 text-green-500 focus:ring-green-500/20 cursor-pointer"
                  />
                  <span className="text-sm font-bold text-brand-text">In Stock</span>
                </label>
                <label className={cn(
                  "flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2",
                  formData.statusFlag === 'Low Stock' ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'
                )}>
                  <input
                    type="radio"
                    name="status"
                    checked={formData.statusFlag === 'Low Stock'}
                    onChange={() => setFormData((prev) => ({ ...prev, statusFlag: 'Low Stock' }))}
                    className="w-4 h-4 text-orange-500 focus:ring-orange-500/20 cursor-pointer"
                  />
                  <span className="text-sm font-bold text-brand-text">Low Stock</span>
                </label>
                <label className={cn(
                  "flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2",
                  formData.statusFlag === 'Out of Stock' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
                )}>
                  <input
                    type="radio"
                    name="status"
                    checked={formData.statusFlag === 'Out of Stock'}
                    onChange={() => setFormData((prev) => ({ ...prev, statusFlag: 'Out of Stock' }))}
                    className="w-4 h-4 text-red-500 focus:ring-red-500/20 cursor-pointer"
                  />
                  <span className="text-sm font-bold text-brand-text">Out of Stock</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
