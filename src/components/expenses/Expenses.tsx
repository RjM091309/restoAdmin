import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Filter, Calendar, Tag, Edit2, Trash2, X, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '../ui/Skeleton';
import { type Branch } from '../partials/Header';
import { cn } from '../../lib/utils';
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  type ExpenseRecord,
} from '../../services/expenseService';
import {
  getInventoryCategories,
  createInventoryCategory,
  updateInventoryCategory,
  deleteInventoryCategory,
  type InventoryCategory,
} from '../../services/inventoryService';

type ExpensesProps = {
  selectedBranch: Branch | null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    Number.isFinite(value) ? value : 0,
  );

const formatDateLabel = (value: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).formatToParts(d);
  const month = (parts.find((p) => p.type === 'month')?.value || '').toUpperCase();
  const day = parts.find((p) => p.type === 'day')?.value || '';
  const year = parts.find((p) => p.type === 'year')?.value || '';
  if (!month || !day || !year) return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(d);
  return `${month} ${day}, ${year}`;
};

const formatTimeLabel = (value: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(d);
};

const stripAmountFormatting = (value: string) => String(value || '').replace(/,/g, '').trim();

const formatAmountInput = (value: string) => {
  const cleaned = String(value || '').replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  if (cleaned === '.') return '0.';

  const dotIndex = cleaned.indexOf('.');
  let intPart = cleaned;
  let decPart = '';

  if (dotIndex !== -1) {
    intPart = cleaned.slice(0, dotIndex);
    decPart = cleaned.slice(dotIndex + 1).replace(/\./g, '');
  }

  intPart = intPart.replace(/^0+(?=\d)/, '');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const intDisplay = withCommas || '0';

  if (dotIndex !== -1) {
    return `${intDisplay}.${decPart.slice(0, 2)}`;
  }
  return withCommas;
};

const normalizeForMatch = (value: string | null | undefined) => String(value || '').trim().toLowerCase();

const EXCLUDED_EXPENSE_TYPES = new Set(['Inventory']);
const isExcludedExpenseType = (value: string | null | undefined) =>
  EXCLUDED_EXPENSE_TYPES.has(String(value || '').trim()) || normalizeForMatch(value) === 'inventory';

export const Expenses: React.FC<ExpensesProps> = ({ selectedBranch }) => {
  const { t } = useTranslation();

  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [masterCategories, setMasterCategories] = useState<InventoryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeParentCategory, setActiveParentCategory] = useState<string | null>(null);
  const [selectedCategoryNameFilter, setSelectedCategoryNameFilter] = useState<string>('All Data');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    expCat: '',
    expName: '',
    masterCatId: '',
    expDesc: '',
    expAmount: '',
    expSource: '',
  });
  const [isCategoryTypeMenuOpen, setIsCategoryTypeMenuOpen] = useState(false);
  const [isCategoryNameMenuOpen, setIsCategoryNameMenuOpen] = useState(false);

  const [isCategoryMaintenanceOpen, setIsCategoryMaintenanceOpen] = useState(false);
  const [categoryEditingId, setCategoryEditingId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
  });
  const [quickAddExpenseId, setQuickAddExpenseId] = useState<string | null>(null);
  const [quickAddAmount, setQuickAddAmount] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  const canManage = Boolean(selectedBranch && String(selectedBranch.id) !== 'all');
  const branchId = canManage ? String(selectedBranch?.id) : '';

  const fetchData = async () => {
    if (!canManage) return;
    try {
      setLoading(true);
      const [expenseRows, categoryRows] = await Promise.all([
        getExpenses(branchId),
        getInventoryCategories(branchId),
      ]);
      setExpenses(expenseRows);
      setMasterCategories(categoryRows);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch expenses');
    } finally {
      setLoading(false);
    }
  };

  const refreshCategories = async () => {
    if (!canManage) return;
    const rows = await getInventoryCategories(branchId);
    setMasterCategories(rows);
  };

  const refreshExpenses = async () => {
    if (!canManage) return;
    const rows = await getExpenses(branchId);
    setExpenses(rows);
  };

  useEffect(() => {
    if (!canManage) {
      setExpenses([]);
      setMasterCategories([]);
      setLoading(false);
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch?.id]);

  const categoryTypes = useMemo(() => {
    const types = Array.from(
      new Set(masterCategories.map((c) => String(c.categoryType || '').trim()).filter(Boolean)),
    );
    return types
      .filter((type) => !EXCLUDED_EXPENSE_TYPES.has(type))
      .sort((a, b) => a.localeCompare(b));
  }, [masterCategories]);

  const categoryNamesForSelectedType = useMemo(() => {
    const currentType = String(formData.expCat || '').trim();
    if (!currentType) return [];
    if (isExcludedExpenseType(currentType)) return [];
    const rows = masterCategories
      .filter((c) => String(c.categoryType || '').trim() === currentType)
      .map((c) => ({ id: String(c.id), name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return rows.filter((row, index, arr) => arr.findIndex((item) => item.name === row.name) === index);
  }, [masterCategories, formData.expCat]);

  const filteredCategoryTypes = useMemo(() => {
    const needle = String(formData.expCat || '').trim().toLowerCase();
    if (!needle) return categoryTypes;
    return categoryTypes.filter((type) => type.toLowerCase().includes(needle));
  }, [categoryTypes, formData.expCat]);

  const filteredCategoryNames = useMemo(() => {
    const needle = String(formData.expName || '').trim().toLowerCase();
    if (!needle) return categoryNamesForSelectedType;
    return categoryNamesForSelectedType.filter((opt) => String(opt.name).toLowerCase().includes(needle));
  }, [categoryNamesForSelectedType, formData.expName]);

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return expenses.filter((e) => {
      if (activeParentCategory && String(e.expCat) !== String(activeParentCategory)) return false;
      if (activeParentCategory && selectedCategoryNameFilter && selectedCategoryNameFilter !== 'All Data') {
        if (String(e.expName) !== String(selectedCategoryNameFilter)) return false;
      }
      if (!q) return true;
      const hay = [e.expCat, e.expName, e.expDesc || '', e.expSource || '', e.branchName || '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [expenses, searchQuery, activeParentCategory, selectedCategoryNameFilter]);

  const summaryByType = useMemo(() => {
    const totals = new Map<string, number>();
    expenses.forEach((e) => {
      const key = String(e.expCat || '').trim();
      if (!key) return;
      totals.set(key, (totals.get(key) || 0) + Number(e.expAmount || 0));
    });
    const totalAmount = expenses.reduce((sum, e) => sum + Number(e.expAmount || 0), 0);
    return { totalAmount, totals };
  }, [expenses]);

  const inventoryTotal = useMemo(
    () =>
      expenses
        .filter((e) => isExcludedExpenseType(e.expCat))
        .reduce((sum, e) => sum + Number(e.expAmount || 0), 0),
    [expenses],
  );

  const filterChips = useMemo(() => {
    if (!activeParentCategory) return [];
    const names = masterCategories
      .filter((c) => String(c.categoryType || '').trim() === String(activeParentCategory))
      .map((c) => c.name);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [masterCategories, activeParentCategory]);

  const typeCards = useMemo(() => {
    const preferredOrder = ['Inventory', 'Maintenance', 'Utilities / Bills', 'Salary & Rent', 'Others'];
    const orderIndex = (value: string) => {
      const idx = preferredOrder.indexOf(value);
      return idx === -1 ? Number.POSITIVE_INFINITY : idx;
    };
    const displayLabel = (value: string) => (value === 'Utilities / Bills' ? 'Utilities' : value);

    const set = new Set<string>();
    masterCategories.forEach((c) => {
      const v = String(c.categoryType || '').trim();
      if (v) set.add(v);
    });
    expenses.forEach((e) => {
      const v = String(e.expCat || '').trim();
      if (v) set.add(v);
    });

    return Array.from(set)
      .filter((typeValue) => !isExcludedExpenseType(typeValue))
      .sort((a, b) => {
        const ao = orderIndex(a);
        const bo = orderIndex(b);
        if (ao !== bo) return ao - bo;
        return a.localeCompare(b);
      })
      .map((typeValue) => ({
        typeValue,
        label: displayLabel(typeValue),
        amount: summaryByType.totals.get(typeValue) || 0,
      }));
  }, [masterCategories, expenses, summaryByType.totals]);

  const ringClassesForType = (typeValue: string) => {
    if (typeValue === 'Maintenance') {
      return { active: 'ring-2 ring-brand-maintenance/30', hover: 'hover:ring-2 hover:ring-brand-maintenance/30' };
    }
    if (typeValue === 'Utilities / Bills') {
      return { active: 'ring-2 ring-brand-utilities/30', hover: 'hover:ring-2 hover:ring-brand-utilities/30' };
    }
    return { active: 'ring-2 ring-brand-primary/20', hover: 'hover:ring-2 hover:ring-brand-primary/20' };
  };

  const buildNextMonthDescription = (expense: ExpenseRecord) => {
    const base = expense.encodedDt ? new Date(expense.encodedDt) : new Date();
    const baseDate = Number.isNaN(base.getTime()) ? new Date() : base;
    const next = new Date(baseDate);
    next.setMonth(next.getMonth() + 1);
    const nextLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(next);

    const seed = String(expense.expDesc || expense.expName || 'Expense').trim() || 'Expense';
    if (/\bfor\s+[A-Za-z]+\s+\d{4}\b/i.test(seed)) {
      return seed.replace(/\bfor\s+[A-Za-z]+\s+\d{4}\b/i, `for ${nextLabel}`);
    }
    return `${seed} for ${nextLabel}`;
  };

  const openQuickAdd = (expense: ExpenseRecord) => {
    setQuickAddExpenseId(expense.id);
    setQuickAddAmount(formatAmountInput(String(expense.expAmount || '')));
  };

  const closeQuickAdd = () => {
    setQuickAddExpenseId(null);
    setQuickAddAmount('');
    setQuickAddSaving(false);
  };

  const saveQuickAdd = async (expense: ExpenseRecord) => {
    if (!canManage || !selectedBranch) return;
    if (quickAddSaving) return;

    const amountText = stripAmountFormatting(quickAddAmount);
    const amount = Number(amountText);
    if (!amountText || !Number.isFinite(amount) || amount < 0) {
      toast.error('Amount must be a valid non-negative number');
      return;
    }

    const matchedCategory = masterCategories.find(
      (c) =>
        normalizeForMatch(c.categoryType) === normalizeForMatch(expense.expCat) &&
        normalizeForMatch(c.name) === normalizeForMatch(expense.expName),
    );
    const resolvedMasterCatId = String(expense.masterCatId || matchedCategory?.id || '').trim();
    if (!resolvedMasterCatId) {
      toast.error('Category reference is missing for this expense');
      return;
    }

    try {
      setQuickAddSaving(true);
      await createExpense({
        branchId: String(selectedBranch.id),
        masterCatId: resolvedMasterCatId,
        expDesc: buildNextMonthDescription(expense),
        expAmount: amount,
        expSource: expense.expSource || null,
      });
      toast.success('Next month expense added');
      closeQuickAdd();
      await refreshExpenses();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add quick expense');
      setQuickAddSaving(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      expCat: '',
      expName: '',
      masterCatId: '',
      expDesc: '',
      expAmount: '',
      expSource: '',
    });
    setIsCategoryTypeMenuOpen(false);
    setIsCategoryNameMenuOpen(false);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (expense: ExpenseRecord) => {
    setEditingId(expense.id);
    setFormData({
      expCat: expense.expCat || '',
      expName: expense.expName || '',
      masterCatId: expense.masterCatId || '',
      expDesc: expense.expDesc || '',
      expAmount: formatAmountInput(String(expense.expAmount ?? '')),
      expSource: expense.expSource || '',
    });
    setIsModalOpen(true);
  };

  const resetCategoryForm = () => {
    setCategoryEditingId(null);
    setCategoryForm({ name: '', description: '' });
  };

  const openCategoryMaintenance = () => {
    if (String(activeParentCategory || '').trim() === 'Inventory') {
      toast.error('Category Maintenance is not available for Inventory');
      return;
    }
    resetCategoryForm();
    setIsCategoryMaintenanceOpen(true);
  };

  const activeTypeCategories = useMemo(() => {
    if (!activeParentCategory) return [];
    return masterCategories
      .filter((c) => String(c.categoryType || '').trim() === String(activeParentCategory))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [masterCategories, activeParentCategory]);

  const saveCategory = async () => {
    if (!canManage) return;
    if (!activeParentCategory) {
      toast.error('Please select a category type first');
      return;
    }
    if (String(activeParentCategory || '').trim() === 'Inventory') {
      toast.error('Category Maintenance is not available for Inventory');
      return;
    }
    const name = String(categoryForm.name || '').trim();
    if (!name) {
      toast.error('Category name is required');
      return;
    }

    try {
      if (categoryEditingId) {
        await updateInventoryCategory(categoryEditingId, {
          name,
          categoryType: activeParentCategory,
          description: String(categoryForm.description || '').trim() || null,
          icon: null,
        });
        toast.success('Category updated');
      } else {
        await createInventoryCategory({
          branchId,
          name,
          categoryType: activeParentCategory,
          description: String(categoryForm.description || '').trim() || null,
          icon: null,
        });
        toast.success('Category created');
      }

      resetCategoryForm();
      await Promise.all([refreshCategories(), refreshExpenses()]);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save category');
    }
  };

  const editCategory = (row: InventoryCategory) => {
    setCategoryEditingId(row.id);
    setCategoryForm({
      name: row.name || '',
      description: row.description || '',
    });
  };

  const removeCategory = async (id: string) => {
    const result = await Swal.fire({
      title: 'Delete this category?',
      text: 'This will remove it from the selectable list. Existing expenses may still reference it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel',
      focusCancel: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
    });
    if (!result.isConfirmed) return;

    try {
      await deleteInventoryCategory(id);
      toast.success('Category deleted');
      if (categoryEditingId === id) resetCategoryForm();
      await Promise.all([refreshCategories(), refreshExpenses()]);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete category');
    }
  };

  const handleSave = async () => {
    if (!canManage || !selectedBranch) {
      toast.error('Please select a specific branch first');
      return;
    }
    const expCat = formData.expCat.trim();
    const expName = formData.expName.trim();

    if (!expCat) {
      toast.error('Category Type is required');
      return;
    }
    if (isExcludedExpenseType(expCat)) {
      toast.error('Inventory is not available for expense category type');
      return;
    }
    if (!expName) {
      toast.error('Category Name is required');
      return;
    }
    const amountText = stripAmountFormatting(formData.expAmount);
    if (!amountText) {
      toast.error('Amount must be a valid non-negative number');
      return;
    }
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Amount must be a valid non-negative number');
      return;
    }

    try {
      let resolvedMasterCatId = String(formData.masterCatId || '').trim();
      if (!resolvedMasterCatId) {
        const existingMatch = masterCategories.find(
          (c) =>
            normalizeForMatch(c.categoryType) === normalizeForMatch(expCat) &&
            normalizeForMatch(c.name) === normalizeForMatch(expName),
        );

        if (existingMatch) {
          resolvedMasterCatId = String(existingMatch.id);
        } else {
          const createdCategoryId = await createInventoryCategory({
            branchId,
            name: expName,
            categoryType: expCat,
            description: null,
            icon: null,
          });
          resolvedMasterCatId = String(createdCategoryId);
        }
      }

      if (!resolvedMasterCatId) {
        toast.error('Please select a valid category');
        return;
      }

      if (editingId) {
        await updateExpense(editingId, {
          masterCatId: resolvedMasterCatId,
          expDesc: formData.expDesc.trim() ? formData.expDesc.trim() : null,
          expAmount: amount,
          expSource: formData.expSource.trim() ? formData.expSource.trim() : null,
        });
        toast.success('Expense updated successfully');
      } else {
        await createExpense({
          branchId: String(selectedBranch.id),
          masterCatId: resolvedMasterCatId,
          expDesc: formData.expDesc.trim() ? formData.expDesc.trim() : null,
          expAmount: amount,
          expSource: formData.expSource.trim() ? formData.expSource.trim() : null,
        });
        toast.success('Expense created successfully');
      }

      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save expense');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'Delete this expense?',
      text: 'Are you sure you want to delete this expense?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel',
      customClass: {
        actions: 'swal-actions-confirm-left',
      },
      focusCancel: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b',
    });
    if (!result.isConfirmed) return;
    try {
      await deleteExpense(id);
      toast.success('Expense deleted successfully');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete expense');
    }
  };

  const categoryColumns: ColumnDef<InventoryCategory>[] = [
    {
      header: 'Name',
      className: 'w-[40%] text-left',
      render: (row) => <span className="font-bold text-brand-text">{row.name}</span>,
    },
    {
      header: 'Description',
      className: 'w-[50%] text-left',
      render: (row) => <span className="text-brand-muted">{row.description || '-'}</span>,
    },
    {
      header: 'Actions',
      className: 'w-[10%] text-left',
      render: (row) => (
        <div className="flex justify-start items-center gap-2">
          <button
            className="p-2 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              editCategory(row);
            }}
            title="Edit Category"
          >
            <Edit2 size={16} />
          </button>
          <button
            className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              removeCategory(row.id);
            }}
            title="Delete Category"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  const columns: ColumnDef<ExpenseRecord>[] = [
    {
      header: 'Date',
      className: 'w-[18%] text-left',
      render: (expense) => (
        <div className="flex items-center gap-2 text-brand-text font-medium">
          <Calendar size={16} className="text-brand-muted" />
          <div className="leading-tight">
            <div className="text-xs font-bold text-brand-muted uppercase tracking-wider">
              {formatDateLabel(expense.encodedDt)}
            </div>
            <div className="text-xs text-brand-muted font-medium">{formatTimeLabel(expense.encodedDt)}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Description',
      className: 'w-[52%] text-left',
      render: (expense) => (
        <div>
          <h3 className="text-base font-bold text-brand-text mb-0.5">{expense.expDesc || expense.expName}</h3>
          <div className="flex items-center gap-2 text-xs text-brand-muted">
            <span className="flex items-center gap-1">
              <Tag size={12} />
              {expense.expCat}
            </span>
            <span>•</span>
            <span>{expense.expName}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Amount',
      className: 'w-[18%] text-left',
      render: (expense) => (
        <span className="text-base font-bold text-brand-text">{formatCurrency(expense.expAmount)}</span>
      ),
    },
    {
      header: 'Actions',
      className: 'w-[12%] text-right',
      render: (expense) => (
        <div className="flex flex-col items-end gap-2">
          <div className="flex justify-end items-center gap-2">
            <button
              className="p-2 text-brand-muted hover:text-emerald-600 hover:bg-emerald-50 transition-colors rounded-lg"
              onClick={(e) => {
                e.stopPropagation();
                if (quickAddExpenseId === expense.id) {
                  closeQuickAdd();
                } else {
                  openQuickAdd(expense);
                }
              }}
              title="Add next month"
            >
              <Plus size={16} />
            </button>
            <button
              className="p-2 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors rounded-lg"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(expense);
              }}
              title="Edit Expense"
            >
              <Edit2 size={16} />
            </button>
            <button
              className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(expense.id);
              }}
              title="Delete Expense"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {quickAddExpenseId === expense.id && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={quickAddAmount}
                onChange={(e) => setQuickAddAmount(formatAmountInput(e.target.value))}
                placeholder="Amount"
                className="w-28 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  saveQuickAdd(expense);
                }}
                disabled={quickAddSaving}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary/90 transition-colors disabled:opacity-60"
                title="Save"
              >
                {quickAddSaving ? '...' : 'Add'}
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];

  if (!canManage) {
    return (
      <div className="pt-6">
        <div className="bg-white rounded-2xl shadow-sm p-6 text-brand-muted font-bold">
          Please select a specific branch (not “All Branches”) to manage expenses.
        </div>
      </div>
    );
  }

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
              <SkeletonTable columns={6} rows={8} />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
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
                    placeholder={t('expenses_page.search_placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
                  />
                </div>
              </div>
              <button
                onClick={openCreate}
                className="bg-brand-primary text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all"
              >
                <Plus size={18} />
                {t('expenses_page.new_expense')}
              </button>
            </div>

            <div className="grid grid-flow-col auto-cols-[minmax(0,1fr)] gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm min-w-0">
                <p className="text-brand-muted text-xs sm:text-sm font-medium mb-1 truncate">{t('expenses_page.total_expenses')}</p>
                <h3 className="text-xl sm:text-2xl xl:text-3xl font-bold text-brand-text truncate">{formatCurrency(summaryByType.totalAmount)}</h3>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm min-w-0">
                <p className="text-brand-muted text-xs sm:text-sm font-medium mb-1 truncate">Inventory</p>
                <h3 className="text-xl sm:text-2xl xl:text-3xl font-bold text-brand-text truncate">{formatCurrency(inventoryTotal)}</h3>
              </div>

              {typeCards.map((card) => {
                const ring = ringClassesForType(card.typeValue);
                const isActive = activeParentCategory === card.typeValue;
                return (
                  <div
                    key={card.typeValue}
                    className={cn(
                      'bg-white p-5 rounded-2xl shadow-sm cursor-pointer transition-all min-w-0',
                      isActive ? ring.active : ring.hover,
                    )}
                    onClick={() => {
                      setActiveParentCategory((prev) => (prev === card.typeValue ? null : card.typeValue));
                      setSelectedCategoryNameFilter('All Data');
                    }}
                  >
                    <p className="text-brand-muted text-xs sm:text-sm font-medium mb-1 truncate">{card.label}</p>
                    <h3 className="text-xl sm:text-2xl xl:text-3xl font-bold text-brand-text truncate">{formatCurrency(card.amount)}</h3>
                  </div>
                );
              })}
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
                  {['All Data', ...filterChips].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => setSelectedCategoryNameFilter(chip)}
                      className={cn(
                        'text-sm font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all',
                        activeParentCategory === 'Maintenance'
                          ? selectedCategoryNameFilter === chip
                            ? 'bg-brand-maintenance text-white shadow-lg shadow-brand-maintenance/20'
                            : 'bg-brand-maintenance-soft text-brand-maintenance hover:bg-brand-maintenance-soft/70'
                          : activeParentCategory === 'Utilities / Bills'
                            ? selectedCategoryNameFilter === chip
                              ? 'bg-brand-utilities text-white shadow-lg shadow-brand-utilities/20'
                              : 'bg-brand-utilities-soft text-brand-utilities hover:bg-brand-utilities-soft/70'
                            : selectedCategoryNameFilter === chip
                              ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20'
                              : 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20',
                      )}
                    >
                      {chip}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-2">
                    {String(activeParentCategory || '').trim() !== 'Inventory' && (
                      <button
                        onClick={openCategoryMaintenance}
                        className="p-2 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors rounded-lg"
                        title="Category Maintenance"
                      >
                        <Settings size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setActiveParentCategory(null);
                        setSelectedCategoryNameFilter('All Data');
                      }}
                      className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
                      title={t('expenses_page.clear_filter')}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            <DataTable data={filteredExpenses} columns={columns} keyExtractor={(item) => item.id} />
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={editingId ? 'Edit Expense' : t('expenses_page.add_new_expense')}
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
              {t('expenses_page.cancel')}
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98]"
            >
              {editingId ? 'Update Expense' : t('expenses_page.save_expense')}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-brand-text mb-2">Category Type</label>
              <div className="relative">
                <input
                  type="text"
                value={formData.expCat}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setFormData((prev) => ({ ...prev, expCat: nextType, expName: '', masterCatId: '' }));
                  setIsCategoryTypeMenuOpen(true);
                }}
                  onFocus={() => setIsCategoryTypeMenuOpen(true)}
                  onBlur={() => setTimeout(() => setIsCategoryTypeMenuOpen(false), 120)}
                  placeholder="Select Type"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all text-brand-text"
                />
                {isCategoryTypeMenuOpen && filteredCategoryTypes.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-52 overflow-auto">
                    {filteredCategoryTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setFormData((prev) => ({ ...prev, expCat: type, expName: '', masterCatId: '' }));
                          setIsCategoryTypeMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-brand-text hover:bg-brand-primary/5 transition-colors"
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-brand-text mb-2">Category Name</label>
              <div className="relative">
                <input
                  type="text"
                value={formData.expName}
                onChange={(e) => {
                    const nextName = e.target.value;
                  const match =
                    masterCategories.find(
                      (c) =>
                        normalizeForMatch(c.categoryType) === normalizeForMatch(formData.expCat) &&
                        normalizeForMatch(c.name) === normalizeForMatch(nextName),
                    ) || null;
                  setFormData((prev) => ({
                    ...prev,
                    expName: nextName,
                    masterCatId: match ? String(match.id) : '',
                    expCat: match?.categoryType || prev.expCat,
                  }));
                    setIsCategoryNameMenuOpen(true);
                }}
                disabled={!formData.expCat}
                  onFocus={() => setIsCategoryNameMenuOpen(true)}
                  onBlur={() => setTimeout(() => setIsCategoryNameMenuOpen(false), 120)}
                  placeholder="Select Name"
                className={cn(
                    'w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all text-brand-text',
                  !formData.expCat ? 'opacity-60 cursor-not-allowed' : '',
                )}
                />
                {formData.expCat && isCategoryNameMenuOpen && filteredCategoryNames.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-52 overflow-auto">
                    {filteredCategoryNames.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const match =
                            masterCategories.find(
                              (c) =>
                                normalizeForMatch(c.categoryType) === normalizeForMatch(formData.expCat) &&
                                normalizeForMatch(c.name) === normalizeForMatch(opt.name),
                            ) || null;
                          setFormData((prev) => ({
                            ...prev,
                            expName: opt.name,
                            masterCatId: match ? String(match.id) : '',
                            expCat: match?.categoryType || prev.expCat,
                          }));
                          setIsCategoryNameMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-brand-text hover:bg-brand-primary/5 transition-colors"
                      >
                        {opt.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">Description</label>
            <input
              type="text"
              placeholder="e.g. Electric bill - Feb"
              value={formData.expDesc}
              onChange={(e) => setFormData((prev) => ({ ...prev, expDesc: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-brand-text mb-2">Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₱</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={formData.expAmount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      expAmount: formatAmountInput(e.target.value),
                    }))
                  }
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-brand-text mb-2">Source</label>
              <input
                type="text"
                placeholder="e.g. Cash, Bank, GCash"
                value={formData.expSource}
                onChange={(e) => setFormData((prev) => ({ ...prev, expSource: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* <div className="bg-brand-bg rounded-xl p-4 text-sm text-brand-muted font-medium">
            Saving to branch: <span className="font-bold text-brand-text">{selectedBranch?.name}</span>
          </div> */}
        </div>
      </Modal>

      <Modal
        isOpen={isCategoryMaintenanceOpen}
        onClose={() => {
          setIsCategoryMaintenanceOpen(false);
          resetCategoryForm();
        }}
        title={`Category Maintenance${activeParentCategory ? ` — ${activeParentCategory}` : ''}`}
        maxWidth="3xl"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => {
                setIsCategoryMaintenanceOpen(false);
                resetCategoryForm();
              }}
              className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
            <button
              onClick={saveCategory}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98]"
            >
              {categoryEditingId ? 'Update Category' : 'Add Category'}
            </button>
          </div>
        }
      >
        {!activeParentCategory ? (
          <div className="bg-white rounded-2xl p-6 text-brand-muted font-bold">
            Select a Category Type card first (Inventory / Maintenance / Utilities / etc.).
          </div>
        ) : (
          <div className="space-y-5">
            <div className="bg-brand-bg rounded-xl p-4 text-sm text-brand-muted font-medium">
              Branch: <span className="font-bold text-brand-text">{selectedBranch?.name}</span> • Type:{' '}
              <span className="font-bold text-brand-text">{activeParentCategory}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-brand-text mb-2">Category Name</label>
                <input
                  type="text"
                  placeholder="e.g. Kitchen Equipment"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-brand-text mb-2">Description</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                />
              </div>
            </div>

            <DataTable data={activeTypeCategories} columns={categoryColumns} keyExtractor={(item) => item.id} />
          </div>
        )}
      </Modal>
    </div>
  );
};

