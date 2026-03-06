import React, { useMemo, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { type ColumnDef } from '../ui/DataTable';
import { cn } from '../../lib/utils';
import { type Branch } from '../partials/Header';
import { getOperationCategories } from '../../services/operationCategoryService';
import { getAllMasterCategories, type InventoryCategory } from '../../services/inventoryService';
import { getExpenses, type ExpenseRecord } from '../../services/expenseService';

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
};

type Category = {
  id: string;
  operationId: string;
  name: string;
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
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
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

export const ExpensesMock: React.FC<ExpensesMockProps> = () => {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [masterCategories, setMasterCategories] = useState<InventoryCategory[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);

  const grandTotalExpenses = useMemo(
    () => expenses.reduce((sum, row) => sum + row.expAmount, 0),
    [expenses],
  );

  // Load operations from operation_category table and categories from master_categories (by BRANCH_ID)
  useEffect(() => {
    let isMounted = true;

    const loadOperations = async () => {
      try {
        // Branch comes from URL via Header; for now rely on backend _resolveBranchId to read from session/query
        const params = new URLSearchParams(window.location.search);
        const branchIdFromUrl = params.get('branchId') || null;

        const [apiOps, apiCats, apiExpenses] = await Promise.all([
          getOperationCategories(branchIdFromUrl),
          getAllMasterCategories(branchIdFromUrl || undefined),
          getExpenses(branchIdFromUrl || undefined),
        ]);
        if (!isMounted) return;

        // Directly use values from operation_category table
        const mapped: Operation[] = apiOps.map((row) => ({
          id: String(row.id),
          name: row.name,
        }));

        setOperations(mapped);
        setMasterCategories(apiCats);
        setExpenses(apiExpenses);
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
  }, []);

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
    const byType = new Map<string, { id: string; label: string }>();

    cats.forEach((cat) => {
      const typeLabel = (cat.categoryType || cat.name || '').trim();
      if (!typeLabel) return;
      if (!byType.has(typeLabel)) {
        byType.set(typeLabel, {
          id: typeLabel,
          label: typeLabel,
        });
      }
    });

    return Array.from(byType.values()).map<Category>((entry) => ({
      id: entry.id,
      operationId: selectedOperationId,
      name: entry.label,
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
    return expenses.reduce((sum, row) => sum + row.expAmount, 0);
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
        render: (row) => <span className="font-semibold">{formatCurrency(row.expAmount)}</span>,
        className: 'text-right',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
      },
      {
        header: 'Category',
        render: (row) => {
          const cat = masterCategories.find((m) => m.id === row.masterCatId);
          return <span>{cat ? (cat.categoryType || cat.name) : ''}</span>;
        },
      },
    ],
    [masterCategories],
  );

  const handleSelectOperation = (opId: string) => {
    setSelectedOperationId(opId);
    setSelectedCategoryId(null);
  };

  const handleSelectCategory = (catId: string) => {
    setSelectedCategoryId(catId);
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
                All operations (static)
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
                  'All operations'
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
          <div className="text-sm font-black tracking-wide text-brand-text uppercase">Operation</div>
          <div className="text-xs text-brand-muted mt-1">Operation first, then categories.</div>
        </div>

        <div className="p-2 flex-1 min-h-0 overflow-auto custom-scrollbar">
          {operations.map((op) => {
            const active = op.id === selectedOperationId;
            const categoryCount = masterCategories.filter(
              (cat) => cat.opCategoryId != null && cat.opCategoryId === op.id,
            ).length;
            return (
              <button
                key={op.id}
                type="button"
                onClick={() => handleSelectOperation(op.id)}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-xl transition-colors',
                  active
                    ? 'bg-brand-primary/10 text-brand-primary'
                    : 'hover:bg-brand-bg text-brand-text',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={cn('font-bold', active ? '' : 'font-semibold')}>{op.name}</span>
                  <span
                    className={cn(
                      'text-[11px] px-2 py-0.5 rounded-full',
                      active ? 'bg-brand-primary/15 text-brand-primary' : 'bg-gray-100 text-brand-muted',
                    )}
                  >
                    {categoryCount}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="w-[320px] shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-sm font-black tracking-wide text-brand-text uppercase">Category</div>
          <div className="text-xs text-brand-muted mt-1">Select a category to show its items.</div>
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
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleSelectCategory(cat.id)}
                        className={cn(
                          'w-full text-left px-4 py-3 rounded-xl transition-colors',
                          active
                            ? 'bg-brand-orange/10 text-brand-utilities'
                            : 'hover:bg-brand-bg text-brand-text',
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className={cn('font-semibold', active ? 'font-bold' : '')}>{cat.name}</span>
                          <span
                            className={cn(
                              'text-[11px] px-2 py-0.5 rounded-full',
                              active ? 'bg-brand-orange/15 text-brand-utilities' : 'bg-gray-100 text-brand-muted',
                            )}
                          >
                            {expenseCount}
                          </span>
                        </div>
                      </button>
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
                              className="px-3 py-2 rounded-lg text-sm font-bold text-brand-muted hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
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
                              className="px-3 py-2 rounded-lg text-sm font-bold text-brand-muted hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
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
    </div>
  );
};

