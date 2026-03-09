import React, { useMemo, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { type ColumnDef } from '../ui/DataTable';
import { cn } from '../../lib/utils';
import { type Branch } from '../partials/Header';
import { toast } from 'sonner';
import { getOperationCategories, createOperationCategory, updateOperationCategory, deleteOperationCategory } from '../../services/operationCategoryService';
import {
  getAllMasterCategories,
  type InventoryCategory,
  createInventoryCategory,
  updateInventoryCategory,
  deleteInventoryCategory,
  type CreateInventoryCategoryPayload,
} from '../../services/inventoryService';
import { getExpenses, type ExpenseRecord, createExpense, updateExpense, deleteExpense } from '../../services/expenseService';
import { SidePanel } from '../ui/SidePanel';
import { Modal } from '../ui/Modal';
import { Edit2, Trash2, Plus, Loader2, Check, X } from 'lucide-react';

type ExpensesMockProps = {
  selectedBranch: Branch | null;
  dateRange: {
    start: string;
    end: string;
  };
};

type Operation = {
  id: string;
  name: string;
  description?: string | null;
};

type Category = {
  id: string;
  operationId: string;
  name: string;
  masterCategoryId?: string;
};

type ExpenseItem = {
  id: string;
  categoryId: string;
  date: string; // YYYY-MM-DD
  item: string;
  amount: number;
  category: string;
};

const ITEMS_PER_PAGE = 50;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0,
  );

// Operations are loaded dynamically from operation_category table (by BRANCH_ID)

const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-ops-fixed', operationId: 'op-ops', name: 'Fixed Costs / Tax' },
  { id: 'cat-ops-indirect', operationId: 'op-ops', name: 'Indirect Expenses' },
  { id: 'cat-ops-supplies', operationId: 'op-ops', name: 'Supplies' },
  { id: 'cat-ops-labor', operationId: 'op-ops', name: 'Labor/Benefits' },
  { id: 'cat-ops-vehicle', operationId: 'op-ops', name: 'Vehicle & Gas' },
  { id: 'cat-food-groc', operationId: 'op-food', name: 'Groceries & Condiments' },
  { id: 'cat-food-fresh', operationId: 'op-food', name: 'Fresh Food' },
  { id: 'cat-food-meat', operationId: 'op-food', name: 'Meat & Poultry' },
  { id: 'cat-food-rice', operationId: 'op-food', name: 'Rice & Grains' },
  { id: 'cat-food-veg', operationId: 'op-food', name: 'Vegetables & Fruits' },
  { id: 'cat-food-bev', operationId: 'op-food', name: 'Beverages & Liquor' },
  { id: 'cat-food-sea', operationId: 'op-food', name: 'Seafood' },
];

const MOCK_ITEMS: ExpenseItem[] = [
  { id: 'it-1', categoryId: 'Fixed Costs / Tax', date: '2026-03-01', item: 'Business Tax', amount: 5500, category: 'Fixed Costs / Tax' },
  { id: 'it-2', categoryId: 'Fixed Costs / Tax', date: '2026-03-04', item: 'Rent', amount: 35000, category: 'Fixed Costs / Tax' },
  { id: 'it-3', categoryId: 'Indirect Expenses', date: '2026-03-02', item: 'Internet Subscription', amount: 1899, category: 'Indirect Expenses' },
  { id: 'it-4', categoryId: 'Indirect Expenses', date: '2026-03-05', item: 'Water Bill', amount: 3120, category: 'Indirect Expenses' },
  { id: 'it-5', categoryId: 'Supplies', date: '2026-03-03', item: 'Dishwashing Liquid', amount: 420, category: 'Supplies' },
  { id: 'it-6', categoryId: 'Supplies', date: '2026-03-06', item: 'Tissue & Paper Towels', amount: 610, category: 'Supplies' },
  { id: 'it-7', categoryId: 'Labor/Benefits', date: '2026-03-01', item: 'Staff Meal Allowance', amount: 1200, category: 'Labor/Benefits' },
  { id: 'it-8', categoryId: 'Labor/Benefits', date: '2026-03-05', item: 'SSS/PhilHealth', amount: 2800, category: 'Labor/Benefits' },
  { id: 'it-9', categoryId: 'Vehicle & Gas', date: '2026-03-04', item: 'Delivery Gas', amount: 1200, category: 'Vehicle & Gas' },
  { id: 'it-10', categoryId: 'Vehicle & Gas', date: '2026-03-06', item: 'Motorcycle Maintenance', amount: 900, category: 'Vehicle & Gas' },

  { id: 'it-11', categoryId: 'Groceries & Condiments', date: '2026-03-01', item: 'Soy Sauce, Vinegar, Spices', amount: 760, category: 'Groceries & Condiments' },
  { id: 'it-12', categoryId: 'Groceries & Condiments', date: '2026-03-04', item: 'Cooking Oil (4L)', amount: 580, category: 'Groceries & Condiments' },
  { id: 'it-13', categoryId: 'Fresh Food', date: '2026-03-02', item: 'Eggs (tray)', amount: 260, category: 'Fresh Food' },
  { id: 'it-14', categoryId: 'Fresh Food', date: '2026-03-05', item: 'Fresh Milk', amount: 310, category: 'Fresh Food' },
  { id: 'it-15', categoryId: 'Meat & Poultry', date: '2026-03-01', item: 'Chicken (10kg)', amount: 1850, category: 'Meat & Poultry' },
  { id: 'it-16', categoryId: 'Meat & Poultry', date: '2026-03-03', item: 'Pork (5kg)', amount: 1320, category: 'Meat & Poultry' },
  { id: 'it-17', categoryId: 'Rice & Grains', date: '2026-03-02', item: 'Rice (25kg)', amount: 1450, category: 'Rice & Grains' },
  { id: 'it-18', categoryId: 'Rice & Grains', date: '2026-03-06', item: 'Flour (10kg)', amount: 820, category: 'Rice & Grains' },
  { id: 'it-19', categoryId: 'Vegetables & Fruits', date: '2026-03-03', item: 'Onions, Garlic, Ginger', amount: 390, category: 'Vegetables & Fruits' },
  { id: 'it-20', categoryId: 'Vegetables & Fruits', date: '2026-03-05', item: 'Bananas, Calamansi', amount: 260, category: 'Vegetables & Fruits' },
  { id: 'it-21', categoryId: 'Beverages & Liquor', date: '2026-03-02', item: 'Softdrinks', amount: 540, category: 'Beverages & Liquor' },
  { id: 'it-22', categoryId: 'Beverages & Liquor', date: '2026-03-06', item: 'Beer (case)', amount: 1890, category: 'Beverages & Liquor' },
  { id: 'it-23', categoryId: 'Seafood', date: '2026-03-01', item: 'Squid', amount: 740, category: 'Seafood' },
  { id: 'it-24', categoryId: 'Seafood', date: '2026-03-04', item: 'Tilapia', amount: 680, category: 'Seafood' },
];

export const ExpensesMock: React.FC<ExpensesMockProps> = ({ selectedBranch }) => {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [masterCategories, setMasterCategories] = useState<InventoryCategory[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);

  const [isOperationPanelOpen, setIsOperationPanelOpen] = useState(false);
  const [isCategoryPanelOpen, setIsCategoryPanelOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingOperation, setEditingOperation] = useState<Operation | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [operationToDelete, setOperationToDelete] = useState<Operation | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [isExpensePanelOpen, setIsExpensePanelOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<ExpenseRecord | null>(null);
  const [expenseForm, setExpenseForm] = useState({ expDesc: '', expAmount: '', expSource: '' });
  const [addingAmountForId, setAddingAmountForId] = useState<string | null>(null);
  const [addingAmountValue, setAddingAmountValue] = useState('');

  const [operationForm, setOperationForm] = useState<{ name: string; description: string }>({
    name: '',
    description: '',
  });

  const [categoryForm, setCategoryForm] = useState<{ name: string; description: string }>({
    name: '',
    description: '',
  });

  const isSpecificBranch = selectedBranch != null && String(selectedBranch.id) !== 'all';

  const grandTotalExpenses = useMemo(
    () => expenses.reduce((sum, row) => sum + row.expAmount, 0),
    [expenses],
  );

  // Load operations from operation_category table and categories from master_categories (by BRANCH_ID)
  useEffect(() => {
    let isMounted = true;

    const loadOperations = async () => {
      try {
        if (!isSpecificBranch) {
          setOperations([]);
          setMasterCategories([]);
          setExpenses([]);
          return;
        }
        const resolvedBranchId =
          !selectedBranch || String(selectedBranch.id) === 'all' ? '' : String(selectedBranch.id);

        if (!resolvedBranchId) {
          setOperations([]);
          setMasterCategories([]);
          setExpenses([]);
          return;
        }

        if (isMounted) {
          setBranchId(resolvedBranchId);
        }

        const [apiOps, apiCats, apiExpenses] = await Promise.all([
          getOperationCategories(resolvedBranchId),
          getAllMasterCategories(resolvedBranchId),
          getExpenses(resolvedBranchId),
        ]);
        if (!isMounted) return;

        // Ensure data is strictly scoped to the currently selected branch.
        // Include operations that match the branch OR have no branch (global/shared).
        const filteredOps = apiOps.filter(
          (row) =>
            row.branchId == null || String(row.branchId) === resolvedBranchId,
        );
        const mapped: Operation[] = filteredOps.map((row) => ({
          id: String(row.id),
          name: row.name,
          description: row.description ?? null,
        }));

        const filteredCategories = apiCats.filter(
          (cat) => String(cat.branchId) === resolvedBranchId,
        );
        const filteredExpenses = apiExpenses.filter(
          (exp) => String(exp.branchId) === resolvedBranchId,
        );

        setOperations(mapped);
        setMasterCategories(filteredCategories);
        setExpenses(filteredExpenses);
        setSelectedOperationId((prev) => prev && mapped.some((op) => op.id === prev) ? prev : null);
      } catch (error) {
        console.error('Failed to load operation categories:', error);
        setOperations([]);
        setMasterCategories([]);
        setExpenses([]);
      }
    };

    loadOperations();

    return () => {
      isMounted = false;
    };
  }, [isSpecificBranch, selectedBranch?.id]);

  const selectedOperation = useMemo(() => {
    if (!selectedOperationId) return null;
    return operations.find((op) => op.id === selectedOperationId) ?? null;
  }, [operations, selectedOperationId]);

  const categoriesForOperation = useMemo(() => {
    if (!selectedOperationId) return [];
    // Derive categories from master_categories table using OP_CAT_ID mapping
    const cats = masterCategories.filter(
      (cat) => cat.opCategoryId != null && cat.opCategoryId === selectedOperationId,
    );
    const byType = new Map<string, { id: string; label: string; masterCategoryId: string }>();

    cats.forEach((cat) => {
      const typeLabel = (cat.categoryType || cat.name || '').trim();
      if (!typeLabel) return;
      if (!byType.has(typeLabel)) {
        byType.set(typeLabel, {
          id: typeLabel,
          label: typeLabel,
          masterCategoryId: cat.id,
        });
      }
    });

    return Array.from(byType.values()).map<Category>((entry) => ({
      id: entry.id,
      operationId: selectedOperationId,
      name: entry.label,
      masterCategoryId: entry.masterCategoryId,
    }));
  }, [masterCategories, selectedOperationId]);

  const selectedCategory = useMemo(() => {
    if (!selectedCategoryId) return null;
    const op = selectedOperationId;
    const fromDerived = op
      ? categoriesForOperation.find((c) => c.id === selectedCategoryId) ?? null
      : null;
    return fromDerived;
  }, [categoriesForOperation, selectedCategoryId, selectedOperationId]);

  const itemsForCategory = useMemo(() => {
    if (!selectedCategory) return [];

    // Selected category represents CATEGORY_TYPE; gather all master category IDs for this type + operation
    const relevantMasterIds = new Set(
      masterCategories
        .filter(
          (cat) =>
            cat.opCategoryId != null &&
            cat.opCategoryId === selectedOperationId &&
            (cat.categoryType || cat.name || '').trim() === selectedCategory.name,
        )
        .map((cat) => cat.id),
    );

    if (relevantMasterIds.size === 0) return [];

    return expenses
      .filter((exp) => exp.masterCatId != null && relevantMasterIds.has(exp.masterCatId))
      .slice()
      .sort((a, b) => {
        const ad = a.encodedDt || '';
        const bd = b.encodedDt || '';
        return ad < bd ? 1 : -1;
      });
  }, [expenses, masterCategories, selectedCategory, selectedOperationId]);

  const totalForView = useMemo(() => {
    if (selectedCategoryId && selectedCategory) {
      return itemsForCategory.reduce((sum, row) => sum + row.expAmount, 0);
    }
    if (selectedOperationId) {
      // Sum all expenses whose master category belongs to this operation (any type)
      const opMasterIds = new Set(
        masterCategories
          .filter((cat) => cat.opCategoryId != null && cat.opCategoryId === selectedOperationId)
          .map((cat) => cat.id),
      );
      return expenses.reduce(
        (sum, row) => (row.masterCatId != null && opMasterIds.has(row.masterCatId) ? sum + row.expAmount : sum),
        0,
      );
    }
    // Nothing selected → selected total is 0
    return 0;
  }, [expenses, itemsForCategory, masterCategories, selectedCategory, selectedCategoryId, selectedOperationId]);

  const columns: ColumnDef<ExpenseRecord>[] = useMemo(
    () => [
      {
        header: 'Date',
        render: (row) => <span>{row.encodedDt ? new Date(row.encodedDt).toISOString().slice(0, 10) : ''}</span>,
      },
      {
        header: 'Item',
        render: (row) => <span>{row.expDesc || row.expName}</span>,
      },
      {
        header: 'Amount',
        render: (row) => <span>{new Intl.NumberFormat('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number.isFinite(row.expAmount) ? row.expAmount : 0)}</span>,
        className: 'text-right',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
      },
      {
        header: 'Action',
        className: 'text-right',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        render: (row) => {
          const isAdding = addingAmountForId === row.id;
          return (
            <div className="flex items-center justify-end gap-3">
              {isAdding ? (
                <>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={addingAmountValue}
                    onChange={(e) => setAddingAmountValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveSameItemAmount(row);
                      if (e.key === 'Escape') handleCancelAddSameItemAmount();
                    }}
                    className="w-28 px-2 py-1 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                    placeholder="Amount"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveSameItemAmount(row)}
                    disabled={isSubmitting || addingAmountValue.trim() === '' || !Number.isFinite(Number(addingAmountValue))}
                    className="p-1.5 rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    aria-label="Save"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelAddSameItemAmount}
                    disabled={isSubmitting}
                    className="p-1.5 rounded-lg text-brand-muted hover:bg-gray-100 cursor-pointer disabled:cursor-not-allowed"
                    aria-label="Cancel"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleStartAddSameItemAmount(row); }}
                    className="p-1.5 rounded-lg text-brand-muted hover:text-green-600 hover:bg-green-50 transition-colors cursor-pointer"
                    aria-label="Add same item with new amount"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleOpenEditExpense(row); }}
                    className="p-1.5 rounded-lg text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors cursor-pointer"
                    aria-label="Edit expense"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExpenseToDelete(row); }}
                    className="p-1.5 rounded-lg text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                    aria-label="Delete expense"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [masterCategories, addingAmountForId, addingAmountValue, isSubmitting],
  );

  const handleSelectOperation = (opId: string) => {
    setSelectedOperationId(opId);
    setSelectedCategoryId(null);
  };

  const handleSelectCategory = (catId: string) => {
    setSelectedCategoryId(catId);
  };

  const handleOpenAddOperation = () => {
    setEditingOperation(null);
    setOperationForm({ name: '', description: '' });
    setIsOperationPanelOpen(true);
  };

  const handleOpenEditOperation = (e: React.MouseEvent, op: Operation) => {
    e.stopPropagation();
    setEditingOperation(op);
    setOperationForm({ name: op.name, description: op.description ?? '' });
    setIsOperationPanelOpen(true);
  };

  const handleOpenAddCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ name: '', description: '' });
    setIsCategoryPanelOpen(true);
  };

  const handleOpenEditCategory = (e: React.MouseEvent, cat: Category) => {
    e.stopPropagation();
    if (!cat.masterCategoryId) return;
    const mc = masterCategories.find((m) => m.id === cat.masterCategoryId);
    setEditingCategory(cat);
    setCategoryForm({
      name: mc ? (mc.categoryType || mc.name || cat.name) : cat.name,
      description: mc?.description ?? '',
    });
    setIsCategoryPanelOpen(true);
  };

  const handleCloseOperationPanel = () => {
    if (!isSubmitting) {
      setIsOperationPanelOpen(false);
      setEditingOperation(null);
      setOperationForm({ name: '', description: '' });
    }
  };

  const handleCloseCategoryPanel = () => {
    if (!isSubmitting) {
      setIsCategoryPanelOpen(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '' });
    }
  };

  const handleOpenAddExpense = () => {
    setEditingExpense(null);
    setExpenseForm({ expDesc: '', expAmount: '', expSource: '' });
    setIsExpensePanelOpen(true);
  };

  const handleOpenEditExpense = (row: ExpenseRecord) => {
    setEditingExpense(row);
    setExpenseForm({
      expDesc: row.expDesc ?? '',
      expAmount: row.expAmount ? String(row.expAmount) : '',
      expSource: row.expSource ?? '',
    });
    setIsExpensePanelOpen(true);
  };

  const handleCloseExpensePanel = () => {
    if (!isSubmitting) {
      setIsExpensePanelOpen(false);
      setEditingExpense(null);
      setExpenseForm({ expDesc: '', expAmount: '', expSource: '' });
    }
  };

  const handleSubmitExpense = async () => {
    if (!branchId || !selectedCategory?.masterCategoryId) return;
    const amount = Number(expenseForm.expAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, {
          masterCatId: editingExpense.masterCatId ?? selectedCategory.masterCategoryId,
          expDesc: expenseForm.expDesc.trim() || null,
          expAmount: amount,
          expSource: expenseForm.expSource.trim() || null,
        });
        const list = await getExpenses(branchId);
        const filtered = list.filter((e) => String(e.branchId) === branchId);
        setExpenses(filtered);
        handleCloseExpensePanel();
        toast.success('Expense updated');
      } else {
        await createExpense({
          branchId,
          masterCatId: selectedCategory.masterCategoryId,
          expDesc: expenseForm.expDesc.trim() || null,
          expAmount: amount,
          expSource: expenseForm.expSource.trim() || null,
        });
        const list = await getExpenses(branchId);
        const filtered = list.filter((e) => String(e.branchId) === branchId);
        setExpenses(filtered);
        handleCloseExpensePanel();
        toast.success('Expense added');
      }
    } catch (error) {
      console.error('Failed to save expense:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteExpense = async () => {
    if (!expenseToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteExpense(expenseToDelete.id);
      const list = await getExpenses(branchId || undefined);
      const filtered = branchId ? list.filter((e) => String(e.branchId) === branchId) : list;
      setExpenses(filtered);
      setExpenseToDelete(null);
      toast.success('Expense deleted');
    } catch (error) {
      console.error('Failed to delete expense:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartAddSameItemAmount = (row: ExpenseRecord) => {
    setAddingAmountForId(row.id);
    setAddingAmountValue(String(row.expAmount ?? ''));
  };

  const handleCancelAddSameItemAmount = () => {
    setAddingAmountForId(null);
    setAddingAmountValue('');
  };

  const handleSaveSameItemAmount = async (row: ExpenseRecord) => {
    const amount = Number(addingAmountValue);
    if (!branchId || !selectedCategory?.masterCategoryId || !Number.isFinite(amount) || amount < 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setIsSubmitting(true);
    try {
      await createExpense({
        branchId,
        masterCatId: row.masterCatId ?? selectedCategory.masterCategoryId,
        expDesc: row.expDesc ?? row.expName ?? null,
        expAmount: amount,
        expSource: row.expSource ?? null,
      });
      const list = await getExpenses(branchId);
      const filtered = list.filter((e) => String(e.branchId) === branchId);
      setExpenses(filtered);
      setAddingAmountForId(null);
      setAddingAmountValue('');
      toast.success('Amount added');
    } catch (error) {
      console.error('Failed to add amount:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitOperation = async () => {
    if (!operationForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      if (editingOperation) {
        await updateOperationCategory(editingOperation.id, {
          name: operationForm.name.trim(),
          description: operationForm.description.trim() || null,
        });
        setOperations((prev) =>
          prev.map((op) =>
            op.id === editingOperation.id
              ? { ...op, name: operationForm.name.trim(), description: operationForm.description.trim() || null }
              : op,
          ),
        );
        handleCloseOperationPanel();
        toast.success('Operation updated');
      } else {
        const newId = await createOperationCategory({
          branchId,
          name: operationForm.name.trim(),
          description: operationForm.description.trim() || null,
          active: true,
        });
        setOperations((prev) => [
          ...prev,
          {
            id: String(newId),
            name: operationForm.name.trim(),
            description: operationForm.description.trim() || null,
          },
        ]);
        handleCloseOperationPanel();
        toast.success('Operation created');
      }
    } catch (error) {
      console.error('Failed to save operation category:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitCategory = async () => {
    if (!categoryForm.name.trim() || !branchId) return;

    setIsSubmitting(true);
    try {
      if (editingCategory?.masterCategoryId) {
        await updateInventoryCategory(editingCategory.masterCategoryId, {
          name: categoryForm.name.trim(),
          categoryType: categoryForm.name.trim(),
          description: categoryForm.description.trim() || null,
          icon: null,
          opCategoryId: selectedOperationId ?? undefined,
        });
        // Refresh data so categories list updates
        const [apiCats] = await Promise.all([getAllMasterCategories(branchId)]);
        const filtered = apiCats.filter((c) => String(c.branchId) === branchId);
        setMasterCategories(filtered);
        handleCloseCategoryPanel();
        toast.success('Category updated');
      } else {
        const payload: CreateInventoryCategoryPayload = {
          branchId,
          name: categoryForm.name.trim(),
          categoryType: categoryForm.name.trim(),
          description: categoryForm.description.trim() || null,
          icon: null,
          opCategoryId: selectedOperationId ?? undefined,
        };
        await createInventoryCategory(payload);
        const [apiCats] = await Promise.all([getAllMasterCategories(branchId)]);
        const filtered = apiCats.filter((c) => String(c.branchId) === branchId);
        setMasterCategories(filtered);
        handleCloseCategoryPanel();
        toast.success('Category created');
      }
    } catch (error) {
      console.error('Failed to save category:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteOperation = async () => {
    if (!operationToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteOperationCategory(operationToDelete.id);
      setOperations((prev) => prev.filter((op) => op.id !== operationToDelete.id));
      if (selectedOperationId === operationToDelete.id) {
        setSelectedOperationId(null);
        setSelectedCategoryId(null);
      }
      setOperationToDelete(null);
      toast.success('Operation deleted');
    } catch (error) {
      console.error('Failed to delete operation:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete?.masterCategoryId) return;
    setIsSubmitting(true);
    try {
      await deleteInventoryCategory(categoryToDelete.masterCategoryId);
      const [apiCats] = await Promise.all([getAllMasterCategories(branchId || undefined)]);
      const filtered = branchId ? apiCats.filter((c) => String(c.branchId) === branchId) : apiCats;
      setMasterCategories(filtered);
      if (selectedCategoryId === categoryToDelete.id) setSelectedCategoryId(null);
      setCategoryToDelete(null);
      toast.success('Category deleted');
    } catch (error) {
      console.error('Failed to delete category:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    } finally {
      setIsSubmitting(false);
    }
  };

  const shouldPaginate = itemsForCategory.length > ITEMS_PER_PAGE;
  const [currentPage, setCurrentPage] = useState(1);

  const pagedItems = useMemo(() => {
    if (!shouldPaginate) return itemsForCategory;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return itemsForCategory.slice(startIndex, endIndex);
  }, [currentPage, itemsForCategory, shouldPaginate]);

  const totalPages = useMemo(() => {
    if (!shouldPaginate) return 1;
    return Math.max(1, Math.ceil(itemsForCategory.length / ITEMS_PER_PAGE));
  }, [itemsForCategory.length, shouldPaginate]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategoryId]);

  if (!isSpecificBranch) {
    return (
      <div className="pt-6">
        <div className="bg-white rounded-2xl shadow-sm p-6 text-brand-muted font-bold">
          Please select a specific branch (not “All Branches”) to manage expenses.
        </div>
      </div>
    );
  }

  return (
    <div className="pt-6 overflow-x-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[12px] font-black tracking-wide text-brand-muted uppercase">Grand Total Expenses</div>
              <div className="text-2xl font-black tracking-tight text-brand-text mt-1">
                {formatCurrency(grandTotalExpenses)}
              </div>
              <div className="text-xs text-brand-muted mt-1">
                All operations
              </div>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-brand-primary/10 border border-brand-primary/10 flex items-center justify-center">
              <div className="h-5 w-5 rounded-full bg-brand-primary/70" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[12px] font-black tracking-wide text-brand-muted uppercase">Selected Total</div>
              <div className="text-2xl font-black tracking-tight text-brand-text mt-1">
                {formatCurrency(totalForView)}
              </div>
              <div className="text-xs text-brand-muted mt-1">
                {selectedCategory ? (
                  <>
                    Category: <span className="font-bold text-brand-text">{selectedCategory.name}</span>
                  </>
                ) : selectedOperation ? (
                  <>
                    Operation: <span className="font-bold text-brand-text">{selectedOperation.name}</span>
                  </>
                ) : (
                  'Select an operation or category'
                )}
              </div>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-brand-orange/10 border border-brand-orange/10 flex items-center justify-center">
              <div className="h-5 w-5 rounded-full bg-brand-orange/70" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-6 items-stretch min-h-[560px]">
        <section className="w-[280px] shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black tracking-wide text-brand-text uppercase">Operation</div>
              <div className="text-xs text-brand-muted mt-1">Operation first, then categories.</div>
            </div>
            <button
              type="button"
              onClick={handleOpenAddOperation}
              className="h-8 w-8 rounded-full border border-gray-200 flex items-center justify-center text-brand-primary text-lg leading-none hover:bg-brand-primary/5 transition-colors cursor-pointer"
              aria-label="Add operation"
            >
              +
            </button>
          </div>
        </div>

        <div className="p-2 flex-1 min-h-0 overflow-auto custom-scrollbar">
          {operations.map((op) => {
            const active = op.id === selectedOperationId;
            const categoryCount = masterCategories.filter(
              (cat) => cat.opCategoryId != null && cat.opCategoryId === op.id,
            ).length;
            return (
              <div
                key={op.id}
                className={cn(
                  'group flex items-center rounded-xl transition-colors relative',
                  active ? 'bg-brand-primary/10' : 'hover:bg-brand-bg',
                )}
              >
                <button
                  type="button"
                  onClick={() => handleSelectOperation(op.id)}
                  className={cn(
                    'flex-1 text-left px-4 py-3 min-w-0 cursor-pointer',
                    active ? 'text-brand-primary' : 'text-brand-text',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn('font-bold truncate', active ? '' : 'font-semibold')}>{op.name}</span>
                    <span
                      className={cn(
                        'text-[11px] px-2 py-0.5 rounded-full shrink-0 transition-opacity group-hover:opacity-0',
                        active ? 'bg-brand-primary/15 text-brand-primary' : 'bg-gray-100 text-brand-muted',
                      )}
                    >
                      {categoryCount}
                    </span>
                  </div>
                </button>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                  <button
                    type="button"
                    onClick={(e) => handleOpenEditOperation(e, op)}
                    className="p-1.5 rounded-lg text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors cursor-pointer"
                    aria-label="Edit operation"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOperationToDelete(op);
                    }}
                    className="p-1.5 rounded-lg text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                    aria-label="Delete operation"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="w-[320px] shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black tracking-wide text-brand-text uppercase">Category</div>
              <div className="text-xs text-brand-muted mt-1">Select a category to show its items.</div>
            </div>
            <button
              type="button"
              onClick={handleOpenAddCategory}
              className="h-8 w-8 rounded-full border border-gray-200 flex items-center justify-center text-brand-primary text-lg leading-none hover:bg-brand-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              aria-label="Add category"
              disabled={!selectedOperationId}
            >
              +
            </button>
          </div>
        </div>

        <div className="p-2 flex-1 min-h-0 overflow-auto overflow-x-hidden custom-scrollbar relative">
          <AnimatePresence mode="wait">
            {!selectedOperationId ? (
              <motion.div
                key="category-empty"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="px-4 py-6 text-sm text-brand-muted"
              >
                Select an operation first.
              </motion.div>
            ) : (
              <motion.div
                key={`category-${selectedOperationId}`}
                initial={{ opacity: 0, x: 32 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -32 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="space-y-1"
              >
                {categoriesForOperation.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-brand-muted">No categories.</div>
                ) : (
                  categoriesForOperation.map((cat) => {
                    const active = cat.id === selectedCategoryId;
                    const relatedMasterIds = new Set(
                      masterCategories
                        .filter(
                          (m) =>
                            m.opCategoryId != null &&
                            m.opCategoryId === selectedOperationId &&
                            (m.categoryType || m.name || '').trim() === cat.name,
                        )
                        .map((m) => m.id),
                    );
                    const expenseCount = expenses.filter(
                      (exp) => exp.masterCatId != null && relatedMasterIds.has(exp.masterCatId),
                    ).length;
                    return (
                      <div
                        key={cat.id}
                        className={cn(
                          'group flex items-center rounded-xl transition-colors relative',
                          active ? 'bg-brand-orange/10' : 'hover:bg-brand-bg',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectCategory(cat.id)}
                          className={cn(
                            'flex-1 text-left px-4 py-3 min-w-0 cursor-pointer',
                            active ? 'text-brand-utilities' : 'text-brand-text',
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className={cn('truncate', active ? 'font-semibold' : 'font-normal')}>{cat.name}</span>
                            <span
                              className={cn(
                                'text-[11px] px-2 py-0.5 rounded-full shrink-0 transition-opacity group-hover:opacity-0',
                                active ? 'bg-brand-orange/15 text-brand-utilities' : 'bg-gray-100 text-brand-muted',
                              )}
                            >
                              {expenseCount}
                            </span>
                          </div>
                        </button>
                        {cat.masterCategoryId && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                            <button
                              type="button"
                              onClick={(e) => handleOpenEditCategory(e, cat)}
                              className="p-1.5 rounded-lg text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors cursor-pointer"
                              aria-label="Edit category"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCategoryToDelete(cat);
                              }}
                              className="p-1.5 rounded-lg text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                              aria-label="Delete category"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <section className="flex-1 min-w-0">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-sm font-black tracking-wide text-brand-text uppercase">Datatable Items</div>
                <div className="text-xs text-brand-muted mt-1">
                  {selectedCategory ? (
                    <>
                      Showing items for <span className="font-bold text-brand-text">{selectedCategory.name}</span>.
                    </>
                  ) : (
                    'Select a category to display items.'
                  )}
                </div>
              </div>
              {selectedCategoryId && (
                <button
                  type="button"
                  onClick={handleOpenAddExpense}
                  className="bg-brand-primary text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all cursor-pointer"
                >
                  <Plus size={16} />
                  New Item
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="h-full overflow-auto overflow-x-hidden custom-scrollbar">
              <AnimatePresence mode="wait">
                {!selectedCategoryId ? (
                  <motion.div
                    key="table-empty"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="px-6 py-10 text-sm text-brand-muted"
                  >
                    Choose a category to load table items.
                  </motion.div>
                ) : (
                  <motion.div
                    key={`table-${selectedCategoryId}`}
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.24, ease: 'easeOut' }}
                    className="p-0"
                  >
                    <div className="w-full">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-white border-b border-gray-100">
                              {columns.map((col, i) => (
                                <th
                                  key={col.header}
                                  className={cn(
                                    'px-6 py-4 text-[13px] font-medium whitespace-nowrap',
                                    i === 0
                                      ? 'bg-violet-50 text-brand-text uppercase tracking-wider'
                                      : 'text-brand-muted uppercase tracking-wider',
                                    col.className,
                                    col.headerClassName,
                                    i === 0 && 'border-r-[3px] border-white',
                                  )}
                                >
                                  {col.header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {pagedItems.map((row) => (
                              <tr key={row.id} className="group transition-colors">
                                {columns.map((col, i) => (
                                  <td
                                    key={i}
                                    className={cn(
                                      'px-6 py-4 text-sm text-brand-text',
                                      i === 0
                                        ? 'bg-violet-50 font-medium group-hover:bg-violet-100'
                                        : 'bg-white group-hover:bg-brand-bg/50',
                                      col.className,
                                      col.cellClassName,
                                      i === 0 && 'border-r-[3px] border-white',
                                    )}
                                  >
                                    {col.render
                                      ? col.render(row)
                                      : col.accessorKey
                                        ? (row[col.accessorKey] as React.ReactNode)
                                        : null}
                                  </td>
                                ))}
                              </tr>
                            ))}
                            {pagedItems.length === 0 && (
                              <tr>
                                <td colSpan={columns.length} className="px-6 py-8 text-center text-brand-muted">
                                  No data
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {shouldPaginate && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-white">
                          <div className="text-sm text-brand-muted">
                            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                            {Math.min(currentPage * ITEMS_PER_PAGE, itemsForCategory.length)} of {itemsForCategory.length}{' '}
                            entries
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                              disabled={currentPage === 1}
                              className="px-3 py-2 rounded-lg text-sm font-bold text-brand-muted hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                              Prev
                            </button>
                            <div className="px-3 py-2 rounded-lg text-sm font-black bg-brand-primary text-white">
                              {currentPage}
                            </div>
                            <button
                              type="button"
                              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                              disabled={currentPage === totalPages}
                              className="px-3 py-2 rounded-lg text-sm font-bold text-brand-muted hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>
      </div>

      {/* Add/Edit Operation Side Panel */}
      <SidePanel
        isOpen={isOperationPanelOpen}
        onClose={handleCloseOperationPanel}
        title={editingOperation ? 'Edit Operation' : 'Add Operation'}
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseOperationPanel}
              className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitOperation}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              disabled={isSubmitting || !operationForm.name.trim()}
            >
              {isSubmitting ? 'Saving...' : editingOperation ? 'Update' : 'Save'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Name</label>
            <input
              type="text"
              value={operationForm.name}
              onChange={(e) => setOperationForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all"
              placeholder="Operation name"
            />
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Description</label>
            <textarea
              value={operationForm.description}
              onChange={(e) => setOperationForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all min-h-[80px]"
              placeholder="Optional description"
            />
          </div>
        </div>
      </SidePanel>

      {/* Add/Edit Category Side Panel */}
      <SidePanel
        isOpen={isCategoryPanelOpen}
        onClose={handleCloseCategoryPanel}
        title={editingCategory ? 'Edit Category' : 'Add Category'}
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseCategoryPanel}
              className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitCategory}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              disabled={isSubmitting || !categoryForm.name.trim() || !branchId}
            >
              {isSubmitting ? 'Saving...' : editingCategory ? 'Update' : 'Save'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Category name</label>
            <input
              type="text"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all"
              placeholder="Category name"
            />
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Description</label>
            <textarea
              value={categoryForm.description}
              onChange={(e) => setCategoryForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all min-h-[80px]"
              placeholder="Optional description"
            />
          </div>
        </div>
      </SidePanel>

      {/* Delete Operation Confirmation */}
      <Modal
        isOpen={!!operationToDelete}
        onClose={() => !isSubmitting && setOperationToDelete(null)}
        title="Delete Operation"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setOperationToDelete(null)}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteOperation}
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-red-500 shadow-lg shadow-red-500/30 hover:bg-red-600 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-brand-muted text-sm">
            Are you sure you want to delete the operation <span className="font-bold text-brand-text">{operationToDelete?.name}</span>?
            This will not delete its categories or expense records.
          </p>
        </div>
      </Modal>

      {/* Delete Category Confirmation */}
      <Modal
        isOpen={!!categoryToDelete}
        onClose={() => !isSubmitting && setCategoryToDelete(null)}
        title="Delete Category"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setCategoryToDelete(null)}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteCategory}
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-red-500 shadow-lg shadow-red-500/30 hover:bg-red-600 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-brand-muted text-sm">
            Are you sure you want to delete the category <span className="font-bold text-brand-text">{categoryToDelete?.name}</span>?
            Expense entries under this category will remain but may show as uncategorized.
          </p>
        </div>
      </Modal>

      {/* Add/Edit Expense Side Panel */}
      <SidePanel
        isOpen={isExpensePanelOpen}
        onClose={handleCloseExpensePanel}
        title={editingExpense ? 'Edit Expense' : 'Add Expense'}
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseExpensePanel}
              className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitExpense}
              disabled={isSubmitting || expenseForm.expAmount.trim() === '' || !Number.isFinite(Number(expenseForm.expAmount))}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {editingExpense ? 'Update' : 'Save'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Item / Description</label>
            <input
              type="text"
              value={expenseForm.expDesc}
              onChange={(e) => setExpenseForm((prev) => ({ ...prev, expDesc: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all"
              placeholder="Item or description"
            />
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Amount *</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={expenseForm.expAmount}
              onChange={(e) => setExpenseForm((prev) => ({ ...prev, expAmount: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all"
              placeholder="0.00"
            />
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Source (optional)</label>
            <input
              type="text"
              value={expenseForm.expSource}
              onChange={(e) => setExpenseForm((prev) => ({ ...prev, expSource: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all"
              placeholder="e.g. receipt, vendor"
            />
          </div>
        </div>
      </SidePanel>

      {/* Delete Expense Confirmation */}
      <Modal
        isOpen={!!expenseToDelete}
        onClose={() => !isSubmitting && setExpenseToDelete(null)}
        title="Delete Expense"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setExpenseToDelete(null)}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteExpense}
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-red-500 shadow-lg shadow-red-500/30 hover:bg-red-600 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-brand-muted text-sm">
            Are you sure you want to delete this expense?
            {expenseToDelete && (
              <>
                {' '}
                <span className="font-bold text-brand-text">{expenseToDelete.expDesc || expenseToDelete.expName}</span>
                {' '}
                ({formatCurrency(expenseToDelete.expAmount)})
              </>
            )}
          </p>
        </div>
      </Modal>
    </div>
  );
};

