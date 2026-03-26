import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    Plus,
    Edit2,
    Trash2,
    UtensilsCrossed,
    AlertTriangle,
    Loader2,
    ImageIcon,
    ListChecks,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { type ColumnDef } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { SidePanel } from '../ui/SidePanel';
import { Select2 } from '../ui/Select2';
import { SkeletonTransition, SkeletonCard, SkeletonTable } from '../ui/Skeleton';
import {
    getMenus,
    getMenuById,
    getMenuCategories,
    createMenu,
    createMenuCategory,
    updateMenuCategory,
    deleteMenuCategory,
    updateMenu,
    deleteMenu,
    resolveImageUrl,
    type MenuRecord,
    type MenuCategory,
    type CreateMenuPayload,
    type UpdateMenuPayload,
} from '../../services/menuService';
import {
    getMenuIngredients,
    createMenuIngredient,
    updateMenuIngredient,
    deleteMenuIngredient,
    type MenuIngredientRecord,
} from '../../services/menuIngredientService';
import { getIngredients } from '../../services/ingredientService';
import { formatQty, getQtyInputStep, getUnitLabel, UOM_OPTIONS } from '../../lib/uomUtils';
import { type Branch } from '../partials/Header';
import { useCrudPermissions } from '../../hooks/useCrudPermissions';
import { toast } from 'sonner';

// ---- Props & types ----
interface MenuProps {
    selectedBranch: Branch | null;
}

export const Menu: React.FC<MenuProps> = ({ selectedBranch }) => {
    const { t } = useTranslation();
    const branchId = selectedBranch ? String(selectedBranch.id) : 'all';
    const isSpecificBranch = selectedBranch != null && String(selectedBranch.id) !== 'all';

    const formatPriceNoDecimals = useCallback((value: unknown) => {
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(n)) return '0';
        return Math.trunc(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
    }, []);

    // ----- Data -----
    const [menus, setMenus] = useState<MenuRecord[]>([]);
    const [categories, setCategories] = useState<MenuCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ----- Filters -----
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [availFilter, setAvailFilter] = useState<string>('all');

    // ----- Modals -----
    const [editingItem, setEditingItem] = useState<MenuRecord | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [isCategoryPanelOpen, setIsCategoryPanelOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
    const [categoryName, setCategoryName] = useState('');
    const [categoryDesc, setCategoryDesc] = useState('');
    const [categorySubmitting, setCategorySubmitting] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState<MenuCategory | null>(null);
    const [categoryBaseline, setCategoryBaseline] = useState<{
        id: string | null;
        name: string;
        desc: string;
    }>({ id: null, name: '', desc: '' });

    // ----- Ingredients modal -----
    const [ingredientsForMenu, setIngredientsForMenu] = useState<MenuRecord | null>(null);
    const [menuIngredients, setMenuIngredients] = useState<MenuIngredientRecord[]>([]);
    const [menuIngredientsBaseline, setMenuIngredientsBaseline] = useState<MenuIngredientRecord[]>([]);
    const [ingredientsLoading, setIngredientsLoading] = useState(false);
    const [ingredientsSubmitting, setIngredientsSubmitting] = useState(false);
    const [allIngredients, setAllIngredients] = useState<{ id: string; name: string; unit: string }[]>([]);
    const [addIngredientId, setAddIngredientId] = useState('');
    const [addQty, setAddQty] = useState('');
    const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
    const [editingQty, setEditingQty] = useState('');
    const [editingUnit, setEditingUnit] = useState('');
    const [pendingIngredientEdits, setPendingIngredientEdits] = useState<Record<string, { qtyPerServe: number; unit: string }>>({});

    // ----- Form -----
    const [formName, setFormName] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formCategory, setFormCategory] = useState('');
    const [formPrice, setFormPrice] = useState('');
    const [formAvailable, setFormAvailable] = useState(true);
    const [formImage, setFormImage] = useState<File | null>(null);
    const [formImagePreview, setFormImagePreview] = useState<string | null>(null);
    const [hoverPreview, setHoverPreview] = useState<{ src: string; alt: string; top: number; left: number } | null>(null);

    const [isItemPanelOpen, setIsItemPanelOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<MenuRecord | null>(null);
    const [itemBaseline, setItemBaseline] = useState<{
        id: string | null;
        name: string;
        desc: string;
        categoryId: string;
        price: string;
        available: boolean;
        imagePreview: string | null;
    }>({
        id: null,
        name: '',
        desc: '',
        categoryId: '',
        price: '',
        available: true,
        imagePreview: null,
    });

  const { canCreate, canUpdate, canDelete } = useCrudPermissions();

    // ==================== Data fetching ====================
    const refreshData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [menuData, catData] = await Promise.all([
                getMenus(branchId, { includeDescription: false }),
                getMenuCategories(branchId),
            ]);
            setMenus(Array.isArray(menuData) ? menuData : []);
            setCategories(Array.isArray(catData) ? catData : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : t('menu_page.messages.load_error'));
            setMenus([]);
        } finally {
            setLoading(false);
        }
    }, [branchId]);

    useEffect(() => {
        refreshData();
        setSearchTerm('');
        setSelectedCategory(null);
        setAvailFilter('all');
    }, [refreshData]);

    // Auto-select first category (removes "All Categories" view)
    useEffect(() => {
        if (!isSpecificBranch) return;
        if (categories.length === 0) {
            setSelectedCategory(null);
            return;
        }
        setSelectedCategory((prev) => (prev && categories.some((c) => c.id === prev) ? prev : categories[0].id));
    }, [categories, isSpecificBranch]);

    // ==================== Filtering ====================
    const filteredMenus = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return menus.filter((m) => {
            const matchSearch =
                !term ||
                m.name.toLowerCase().includes(term) ||
                m.categoryName.toLowerCase().includes(term);
            const matchCat = selectedCategory ? m.categoryId === selectedCategory : false;
            const matchAvail = availFilter === 'all' || (availFilter === 'available' ? m.isAvailable : !m.isAvailable);
            return matchSearch && matchCat && matchAvail;
        });
    }, [menus, searchTerm, selectedCategory, availFilter]);

    // ==================== Stats ====================
    const stats = useMemo(() => {
        const total = menus.length;
        const selectedCount = filteredMenus.length;
        const available = menus.filter((m) => m.isAvailable).length;
        return { total, selectedCount, available };
    }, [menus, filteredMenus]);

    const selectedCategoryLabel = useMemo(() => {
        if (!selectedCategory) return '';
        return categories.find((c) => c.id === selectedCategory)?.name ?? '';
    }, [categories, selectedCategory, t]);

    const ITEMS_PER_PAGE = 50;
    const shouldPaginate = filteredMenus.length > ITEMS_PER_PAGE;
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedCategory, availFilter]);

    const pagedMenus = useMemo(() => {
        if (!shouldPaginate) return filteredMenus;
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        return filteredMenus.slice(startIndex, endIndex);
    }, [currentPage, filteredMenus, shouldPaginate]);

    const totalPages = useMemo(() => {
        if (!shouldPaginate) return 1;
        return Math.max(1, Math.ceil(filteredMenus.length / ITEMS_PER_PAGE));
    }, [filteredMenus.length, shouldPaginate]);

    // ==================== Form helpers ====================
    const resetForm = () => {
        setFormName(''); setFormDesc(''); setFormCategory(''); setFormPrice('');
        setFormAvailable(true); setFormImage(null); setFormImagePreview(null);
    };

    const openCreate = () => {
        resetForm();
        setEditingItem(null);
        setItemBaseline({
            id: null,
            name: '',
            desc: '',
            categoryId: '',
            price: '',
            available: true,
            imagePreview: null,
        });
        setIsItemPanelOpen(true);
    };

    const openEdit = async (item: MenuRecord) => {
        setFormName(item.name);
        setFormDesc('');
        setFormCategory(item.categoryId || '');
        setFormPrice(String(item.price));
        setFormAvailable(item.isAvailable);
        setFormImage(null);
        setFormImagePreview(item.imageUrl ? resolveImageUrl(item.imageUrl) : null);
        setEditingItem(item);
        setIsItemPanelOpen(true);
        setItemBaseline({
            id: String(item.id),
            name: item.name || '',
            desc: '',
            categoryId: item.categoryId || '',
            price: String(item.price ?? ''),
            available: !!item.isAvailable,
            imagePreview: item.imageUrl ? resolveImageUrl(item.imageUrl) : null,
        });

        // Menu list fetch intentionally omits description; load it on-demand for editing
        try {
            const full = await getMenuById(item.id);
            setFormDesc(full.description || '');
            setItemBaseline((prev) =>
                prev.id === String(item.id)
                    ? { ...prev, desc: full.description || '' }
                    : prev
            );
        } catch {
            // Leave description empty if it fails to load
        }
    };

    const closeItemPanel = () => {
        if (submitting) return;
        setIsItemPanelOpen(false);
        setEditingItem(null);
        resetForm();
    };

    const sortedCategories = useMemo(() => {
        const splitLeadingNumber = (name: string) => {
            const s = String(name || '').trim();
            const m = s.match(/^(\d+)\s*[\.\)\-]?\s*(.*)$/);
            if (!m) return { hasNum: false, num: Number.POSITIVE_INFINITY, rest: s };
            return { hasNum: true, num: Number(m[1]), rest: (m[2] || '').trim() };
        };

        return [...categories].sort((a, b) => {
            const A = splitLeadingNumber(String(a.name || ''));
            const B = splitLeadingNumber(String(b.name || ''));

            if (A.hasNum && B.hasNum && A.num !== B.num) return A.num - B.num;
            if (A.hasNum !== B.hasNum) return A.hasNum ? -1 : 1; // numbered first

            return A.rest.localeCompare(B.rest, undefined, { sensitivity: 'base', numeric: true });
        });
    }, [categories]);

    const canSubmitItem = useMemo(() => {
        const baselinePrice = Number(itemBaseline.price || 0);
        const effectivePrice = formPrice === '' ? baselinePrice : Number(formPrice);
        // For edit: allow saving other changes even if price is 0 (some items legitimately have 0).
        // For create: still require a valid price > 0.
        const valid = !!formName.trim() && Number.isFinite(effectivePrice) && (editingItem ? effectivePrice >= 0 : effectivePrice > 0);
        if (!valid) return false;
        const baselineMatch =
            formName === itemBaseline.name &&
            formDesc === itemBaseline.desc &&
            (formCategory || '') === (itemBaseline.categoryId || '') &&
            (formPrice === '' ? itemBaseline.price : formPrice) === itemBaseline.price &&
            formAvailable === itemBaseline.available &&
            formImagePreview === itemBaseline.imagePreview &&
            formImage == null;
        return !baselineMatch;
    }, [
        formName,
        formDesc,
        formCategory,
        formPrice,
        formAvailable,
        formImage,
        formImagePreview,
        itemBaseline,
        editingItem,
    ]);

    const openCategoryModal = () => {
        setEditingCategory(null);
        setCategoryName('');
        setCategoryDesc('');
        setCategoryBaseline({ id: null, name: '', desc: '' });
        setIsCategoryPanelOpen(true);
    };

    const closeCategoryModal = () => {
        if (categorySubmitting) return;
        setIsCategoryPanelOpen(false);
        setEditingCategory(null);
        setCategoryName('');
        setCategoryDesc('');
    };

    const handleOpenEditCategory = (e: React.MouseEvent, category: MenuCategory) => {
        e.stopPropagation();
        setEditingCategory(category);
        setCategoryName(category.name || '');
        setCategoryDesc('');
        setCategoryBaseline({ id: String(category.id), name: category.name || '', desc: '' });
        setIsCategoryPanelOpen(true);
    };

    const handleDeleteCategory = (e: React.MouseEvent, category: MenuCategory) => {
        e.stopPropagation();
        setCategoryToDelete(category);
    };

    const handleSaveCategory = async () => {
        const name = categoryName.trim();
        if (!name) {
            toast.error(t('categories.messages.name_required'));
            return;
        }
        if (branchId === 'all') {
            toast.error(t('categories.messages.select_branch'));
            return;
        }
        setCategorySubmitting(true);
        try {
            if (editingCategory) {
                await updateMenuCategory(editingCategory.id, { name, description: categoryDesc.trim() || null });
                toast.success('Category updated successfully');
                closeCategoryModal();
                refreshData();
            } else {
                await createMenuCategory(branchId, { name, description: categoryDesc.trim() || null });
                toast.success(t('category.category_created_successfully'));
                closeCategoryModal();
                refreshData();
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : (editingCategory ? 'Failed to update category' : 'Failed to create category'));
        } finally {
            setCategorySubmitting(false);
        }
    };

    const canSubmitCategory = useMemo(() => {
        const valid = !!categoryName.trim() && branchId !== 'all';
        if (!valid) return false;
        const baselineMatch =
            categoryName === categoryBaseline.name &&
            categoryDesc === categoryBaseline.desc;
        return !baselineMatch;
    }, [categoryName, categoryDesc, categoryBaseline, branchId]);

    // ==================== Ingredients modal ====================
    const openIngredientsModal = async (item: MenuRecord) => {
        setIngredientsForMenu(item);
        setMenuIngredients([]);
        setMenuIngredientsBaseline([]);
        setAddIngredientId('');
        setAddQty('');
        setEditingIngredientId(null);
        setPendingIngredientEdits({});
        setIngredientsLoading(true);
        try {
            const [ingredients, list] = await Promise.all([
                getMenuIngredients(item.id),
                getIngredients(item.branchId, undefined),
            ]);
            setMenuIngredients(ingredients);
            setMenuIngredientsBaseline(ingredients);
            setAllIngredients(list.map((i) => ({ id: i.id, name: i.name, unit: i.unit || 'pcs' })));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to load ingredients');
        } finally {
            setIngredientsLoading(false);
        }
    };

    const closeIngredientsModal = () => {
        if (!ingredientsSubmitting) {
            setIngredientsForMenu(null);
            setMenuIngredients([]);
            setMenuIngredientsBaseline([]);
            setAddIngredientId('');
            setAddQty('');
            setEditingIngredientId(null);
            setPendingIngredientEdits({});
        }
    };

    const handleAddIngredient = () => {
        if (!ingredientsForMenu || !addIngredientId.trim()) return;
        const qty = Number(addQty);
        if (!Number.isFinite(qty) || qty <= 0) {
            toast.error(t('menu_page.ingredients.invalid_qty_msg'));
            return;
        }
        if (menuIngredients.some((mi) => mi.ingredientId === addIngredientId)) {
            toast.error(t('menu_page.ingredients.already_added_msg'));
            return;
        }
        const selectedIng = allIngredients.find((i) => i.id === addIngredientId);
        const unit = selectedIng?.unit || 'pcs';
        // Add locally; persisted on final Update
        setMenuIngredients((prev) => [
            ...prev,
            {
                id: `new:${addIngredientId}`,
                menuId: ingredientsForMenu.id,
                ingredientId: addIngredientId,
                ingredientName: selectedIng?.name || '',
                qtyPerServe: qty,
                unit,
            } as unknown as MenuIngredientRecord,
        ]);
        setAddIngredientId('');
        setAddQty('');
    };

    const handleStartEditIngredient = (rec: MenuIngredientRecord) => {
        setEditingIngredientId(rec.id);
        const current = pendingIngredientEdits[rec.id] ?? { qtyPerServe: rec.qtyPerServe, unit: rec.unit || 'pcs' };
        setEditingQty(String(current.qtyPerServe));
        setEditingUnit(current.unit);
    };

    const handleCommitIngredientDraftEdit = (id: string) => {
        const qty = Number(editingQty);
        if (!Number.isFinite(qty) || qty <= 0) {
            toast.error(t('menu_page.ingredients.invalid_qty_msg'));
            return;
        }
        setPendingIngredientEdits((prev) => ({ ...prev, [id]: { qtyPerServe: qty, unit: editingUnit || 'pcs' } }));
        setEditingIngredientId(null);
    };

    const handleRemoveIngredient = (rec: MenuIngredientRecord) => {
        // Remove locally; persisted on final Update
        setMenuIngredients((prev) => prev.filter((x) => x.id !== rec.id));
        if (editingIngredientId === rec.id) {
            setEditingIngredientId(null);
        }
        setPendingIngredientEdits((prev) => {
            const next = { ...prev };
            delete next[rec.id];
            return next;
        });
    };

    const canSubmitIngredientsUpdate = useMemo(() => {
        // changed if added/removed or any pending edit differs from baseline
        if (menuIngredients.length !== menuIngredientsBaseline.length) return true;
        const baselineById = new Map(menuIngredientsBaseline.map((r) => [String(r.id), r]));
        for (const rec of menuIngredients) {
            const base = baselineById.get(String(rec.id));
            if (!base) return true;
            const draft = pendingIngredientEdits[String(rec.id)];
            if (draft) {
                if (Number(draft.qtyPerServe) !== Number(base.qtyPerServe) || String(draft.unit || '') !== String(base.unit || '')) {
                    return true;
                }
            }
        }
        return false;
    }, [menuIngredients, menuIngredientsBaseline, pendingIngredientEdits]);

    const handleSubmitIngredientsUpdate = async () => {
        if (!ingredientsForMenu) return;
        setIngredientsSubmitting(true);
        try {
            const baselineById = new Map(menuIngredientsBaseline.map((r) => [String(r.id), r]));
            const currentById = new Map(menuIngredients.map((r) => [String(r.id), r]));

            // Deletes: present in baseline, missing in current, and not "new:*"
            const deletes = menuIngredientsBaseline.filter((b) => !currentById.has(String(b.id)) && !String(b.id).startsWith('new:'));

            // Adds: id starts with new:
            const adds = menuIngredients.filter((c) => String(c.id).startsWith('new:'));

            // Updates: pending edits for existing ids
            const updates = Object.entries(pendingIngredientEdits)
                .filter(([id]) => baselineById.has(String(id)) && !String(id).startsWith('new:'))
                .filter(([id, draft]) => {
                    const base = baselineById.get(String(id))!;
                    return Number(draft.qtyPerServe) !== Number(base.qtyPerServe) || String(draft.unit || '') !== String(base.unit || '');
                });

            for (const d of deletes) {
                await deleteMenuIngredient(String(d.id));
            }
            for (const [id, draft] of updates) {
                await updateMenuIngredient(String(id), { qtyPerServe: draft.qtyPerServe, unit: draft.unit });
            }
            for (const a of adds) {
                await createMenuIngredient({
                    menuId: ingredientsForMenu.id,
                    ingredientId: a.ingredientId,
                    qtyPerServe: pendingIngredientEdits[String(a.id)]?.qtyPerServe ?? a.qtyPerServe,
                    unit: pendingIngredientEdits[String(a.id)]?.unit ?? a.unit,
                });
            }

            // Refresh from server and reset baselines
            const refreshed = await getMenuIngredients(ingredientsForMenu.id);
            setMenuIngredients(refreshed);
            setMenuIngredientsBaseline(refreshed);
            setPendingIngredientEdits({});
            setEditingIngredientId(null);
            closeIngredientsModal();
            toast.success(t('menu_page.messages.updated_title'));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t('menu_page.messages.operation_failed'));
        } finally {
            setIngredientsSubmitting(false);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        setFormImage(file);
        if (file) {
            const reader = new FileReader();
            reader.onload = () => setFormImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    // ==================== Submit create/edit ====================
    const handleSubmit = async () => {
        if (!formName.trim()) {
            toast.error(t('menu_page.messages.name_required_msg'));
            return;
        }

        setSubmitting(true);
        try {
            if (editingItem) {
                const baselinePrice = Number(itemBaseline.price || 0);
                const effectivePrice = formPrice === '' ? baselinePrice : Number(formPrice);
                const payload: UpdateMenuPayload = {
                    categoryId: formCategory || null,
                    name: formName.trim(),
                    description: formDesc.trim() || null,
                    price: effectivePrice,
                    isAvailable: formAvailable,
                    existingImagePath: editingItem.imageUrl,
                    imageFile: formImage,
                };
                await updateMenu(editingItem.id, payload);
                toast.success(t('menu_page.messages.updated_msg', { name: formName.trim() }));
            } else {
                if (!formPrice || Number(formPrice) <= 0) {
                    toast.error(t('menu_page.messages.price_required_msg'));
                    return;
                }
                const payload: CreateMenuPayload = {
                    branchId,
                    categoryId: formCategory || null,
                    name: formName.trim(),
                    description: formDesc.trim() || null,
                    price: Number(formPrice),
                    isAvailable: formAvailable,
                    imageFile: formImage,
                };
                await createMenu(payload);
                toast.success(t('menu_page.messages.created_msg', { name: formName.trim() }));
            }
            closeItemPanel();
            await refreshData();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t('menu_page.messages.operation_failed'));
        } finally {
            setSubmitting(false);
        }
    };

    // ==================== Delete ====================
    const confirmDelete = (item: MenuRecord) => {
        setItemToDelete(item);
    };

    const handleImageHoverEnter = useCallback((e: React.MouseEvent<HTMLDivElement>, item: MenuRecord) => {
        const src = item.imageUrl ? resolveImageUrl(item.imageUrl) : null;
        if (!src) return;

        const previewSize = 288;
        const viewportPadding = 16;
        const gap = 12;
        const rect = e.currentTarget.getBoundingClientRect();

        const top = Math.min(
            window.innerHeight - previewSize - viewportPadding,
            Math.max(viewportPadding, rect.top + rect.height / 2 - previewSize / 2),
        );
        const left = Math.min(
            window.innerWidth - previewSize - viewportPadding,
            rect.right + gap,
        );

        setHoverPreview({ src, alt: item.name, top, left });
    }, []);

    const handleImageHoverLeave = useCallback(() => {
        setHoverPreview(null);
    }, []);

    // ==================== Table columns ====================
    const columns: ColumnDef<MenuRecord>[] = useMemo(() => [
        {
            header: t('menu_page.table.menu_item'),
            render: (item) => (
                <div className="flex items-center gap-3 min-w-[200px]">
                    <div
                        className="relative shrink-0"
                        onMouseEnter={(e) => handleImageHoverEnter(e, item)}
                        onMouseLeave={handleImageHoverLeave}
                    >
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden">
                            {item.imageUrl ? (
                                <img src={resolveImageUrl(item.imageUrl) || ''} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                                <UtensilsCrossed size={16} className="text-brand-muted" />
                            )}
                        </div>
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-brand-text truncate">{item.name}</p>
                    </div>
                </div>
            ),
        },
        {
            header: t('menu_page.table.price'),
            render: (item) => (
                <span className="text-sm font-bold text-brand-text">
                    {t('common.currency_symbol')}
                    {formatPriceNoDecimals(item.price)}
                </span>
            ),
        },
        {
            header: t('menu_page.table.status'),
            render: (item) => (
                <span className={cn(
                    "text-xs font-bold px-2 py-1 rounded-lg",
                    item.isAvailable ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                )}>
                    {item.isAvailable ? t('menu_page.status.available') : t('menu_page.status.unavailable')}
                </span>
            ),
        },
        {
            header: t('menu_page.table.actions'),
            className: 'text-right',
            render: (item) => (
                <div className="flex justify-end items-center gap-2">
                    <button
                        onClick={() => openIngredientsModal(item)}
                        className="p-2 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors rounded-lg"
                        title={t('menu_page.ingredients.title')}
                    >
                        <ListChecks size={16} />
                    </button>
                    {canUpdate('menu_management') && (
                      <button
                          onClick={() => openEdit(item)}
                          className="p-2 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors rounded-lg"
                          title={t('menu_page.modal.edit_title')}
                      >
                          <Edit2 size={16} />
                      </button>
                    )}
                    {canDelete('menu_management') && (
                      <button
                          onClick={() => confirmDelete(item)}
                          className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
                          title={t('menu_page.messages.delete_title')}
                      >
                          <Trash2 size={16} />
                      </button>
                    )}
                </div>
            ),
        },
    ], [t, canUpdate, canDelete, handleImageHoverEnter, handleImageHoverLeave, formatPriceNoDecimals]);

    // ==================== Modal form content ====================
    const modalContent = (
        <div className="space-y-5">
            <div>
                <label className="block text-sm font-bold text-brand-text mb-2">{t('menu_page.modal.item_name')}</label>
                <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t('menu_page.modal.item_name_placeholder')}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                />
            </div>

            <div>
                <label className="block text-sm font-bold text-brand-text mb-2">{t('menu_page.modal.price')}</label>
                <input
                    type="number"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder={t('menu_page.modal.price_placeholder')}
                    min="0"
                    step="0.01"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                />
            </div>

            <div>
                <label className="block text-sm font-bold text-brand-text mb-2">{t('menu_page.modal.category')}</label>
                <Select2
                    options={[{ value: '', label: t('menu_page.modal.uncategorized') }, ...sortedCategories.map((c) => ({ value: c.id, label: c.name }))]}
                    value={formCategory || ''}
                    onChange={(v) => setFormCategory(v ? String(v) : '')}
                    placeholder={t('menu_page.modal.select_category')}
                />
            </div>

            <div>
                <label className="block text-sm font-bold text-brand-text mb-2">{t('menu_page.modal.availability')}</label>
                <div className="flex flex-wrap gap-4 mt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="avail" checked={formAvailable} onChange={() => setFormAvailable(true)} className="w-4 h-4 text-green-500 focus:ring-green-500/20 cursor-pointer" />
                        <span className="text-sm font-bold text-brand-text">{t('menu_page.status.available')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="avail" checked={!formAvailable} onChange={() => setFormAvailable(false)} className="w-4 h-4 text-red-500 focus:ring-red-500/20 cursor-pointer" />
                        <span className="text-sm font-bold text-brand-text">{t('menu_page.status.unavailable')}</span>
                    </label>
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-brand-text mb-2">{t('menu_page.modal.description')}</label>
                <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder={t('menu_page.modal.description_placeholder')}
                    rows={2}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400 resize-none"
                />
            </div>

            <div>
                <label className="block text-sm font-bold text-brand-text mb-2">{t('menu_page.modal.image')}</label>
                <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-200 shrink-0">
                        {formImagePreview ? (
                            <img src={formImagePreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <ImageIcon size={24} className="text-brand-muted" />
                        )}
                    </div>
                    <div>
                        <input type="file" accept="image/*" onChange={handleImageChange} className="text-sm text-brand-muted file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20 file:cursor-pointer cursor-pointer" />
                        <p className="text-[10px] text-brand-muted mt-1">{t('menu_page.modal.image_hint')}</p>
                    </div>
                </div>
            </div>
        </div>
    );

    // ==================== RENDER ====================
    const menuSkeleton = (
        <div className="pt-6 overflow-x-hidden space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SkeletonCard className="rounded-2xl" />
                <SkeletonCard className="rounded-2xl" />
            </div>
            <div className="flex gap-6 items-stretch min-h-[560px]">
                <section className="w-[280px] shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    <div className="px-5 py-4 border-b border-gray-100">
                        <div className="space-y-2">
                            <div className="h-4 w-28 bg-gray-100 rounded" />
                            <div className="h-3 w-40 bg-gray-100 rounded" />
                        </div>
                    </div>
                    <div className="p-4 space-y-2">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="h-12 w-full rounded-xl bg-gray-100" />
                        ))}
                    </div>
                </section>
                <section className="flex-1 min-w-0">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
                        <div className="px-6 py-5 border-b border-gray-100">
                            <div className="space-y-2">
                                <div className="h-4 w-32 bg-gray-100 rounded" />
                                <div className="h-3 w-56 bg-gray-100 rounded" />
                            </div>
                        </div>
                        <div className="p-6">
                            <SkeletonTable columns={4} rows={8} showToolbar={false} />
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );

    return (
        <SkeletonTransition
            loading={loading}
            minDelayMs={400}
            fadeOutMs={250}
            skeleton={menuSkeleton}
            className="block"
        >
            <>
                {!isSpecificBranch && (
                    <div className="pt-6">
                        <div className="bg-white rounded-2xl shadow-sm p-6 text-brand-muted font-bold">
                            Please select a specific branch (not “All Branches”) to manage menu items.
                        </div>
                    </div>
                )}

                {isSpecificBranch && (
                    <div className="pt-6 overflow-x-hidden">
                        {/* Error */}
                        {error && (
                            <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-100 text-red-700 p-4 rounded-2xl">
                                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                                <div className="text-sm">
                                    <p className="font-bold">{t('menu_page.messages.load_error')}</p>
                                    <p className="text-xs text-red-600 mt-0.5">{error}</p>
                                </div>
                            </div>
                        )}

                        {/* Stats (Expenses-style cards) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="text-[12px] font-black tracking-wide text-brand-muted uppercase">
                                            {t('menu_page.stats.total_items')}
                                        </div>
                                        <div className="text-2xl font-black tracking-tight text-brand-text mt-1">
                                            {stats.total}
                                        </div>
                                        <div className="text-xs text-brand-muted mt-1">
                                            {t('menu_page.stats.available')}: <span className="font-bold text-brand-text">{stats.available}</span>
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
                                        <div className="text-[12px] font-black tracking-wide text-brand-muted uppercase">
                                            Selected Items
                                        </div>
                                        <div className="text-2xl font-black tracking-tight text-brand-text mt-1">
                                            {stats.selectedCount}
                                        </div>
                                            <div className="text-xs text-brand-muted mt-1">
                                                {selectedCategory ? (
                                                    <>
                                                        Menu Category: <span className="font-bold text-brand-text">{selectedCategoryLabel}</span>
                                                    </>
                                                ) : (
                                                    <>Select a Menu Category</>
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
                            {/* Main Category (Categories list) */}
                            <section className="w-[320px] xl:w-[420px] shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                                <div className="px-5 py-4 border-b border-gray-100">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-black tracking-wide text-brand-text uppercase">
                                                Menu Category
                                            </div>
                                            <div className="text-xs text-brand-muted mt-1">
                                                Select a Menu Category to show items.
                                            </div>
                                        </div>
                                        {canCreate('menu_management') && (
                                            <button
                                                type="button"
                                                onClick={openCategoryModal}
                                                className="h-8 w-8 rounded-full border border-gray-200 flex items-center justify-center text-brand-primary text-lg leading-none hover:bg-brand-primary/5 transition-colors cursor-pointer"
                                                aria-label="Add category"
                                                disabled={branchId === 'all'}
                                            >
                                                +
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="p-2 flex-1 min-h-0 overflow-auto custom-scrollbar">
                                    {sortedCategories.map((cat) => {
                                        const active = cat.id === selectedCategory;
                                        const count = menus.filter((m) => m.categoryId === cat.id).length;
                                        return (
                                            <div
                                                key={cat.id}
                                                className={cn(
                                                    'group flex items-center rounded-xl transition-colors relative',
                                                    active ? 'bg-brand-primary/10' : 'hover:bg-brand-bg',
                                                )}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedCategory(cat.id)}
                                                    className={cn(
                                                        'flex-1 text-left px-4 py-3 min-w-0 cursor-pointer',
                                                        active ? 'text-brand-primary' : 'text-brand-text',
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className={cn('flex-1 font-bold break-words', active ? '' : 'font-semibold')}>
                                                            {cat.name}
                                                        </span>
                                                        <span
                                                            className={cn(
                                                                'text-[11px] px-2 py-0.5 rounded-full shrink-0 transition-opacity group-hover:opacity-0',
                                                                active
                                                                    ? 'bg-brand-primary/15 text-brand-primary'
                                                                    : 'bg-gray-100 text-brand-muted group-hover:bg-gray-200',
                                                            )}
                                                        >
                                                            {count}
                                                        </span>
                                                    </div>
                                                </button>
                                                {(canUpdate('menu_management') || canDelete('menu_management')) && (
                                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                                                        {canUpdate('menu_management') && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleOpenEditCategory(e, cat)}
                                                                className="p-1.5 rounded-lg text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors cursor-pointer"
                                                                aria-label="Edit menu category"
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                        )}
                                                        {canDelete('menu_management') && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleDeleteCategory(e, cat)}
                                                                className="p-1.5 rounded-lg text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                                                                aria-label="Delete menu category"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {categories.length === 0 && (
                                        <div className="px-4 py-6 text-sm text-brand-muted">
                                            No Menu Category.
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Table Items */}
                            <section className="flex-1 min-w-0">
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
                                    <div className="px-6 py-5 border-b border-gray-100">
                                        <div className="flex items-end justify-between gap-4">
                                            <div>
                                                <div className="text-sm font-black tracking-wide text-brand-text uppercase">Menu Items</div>
                                                <div className="text-xs text-brand-muted mt-1">
                                                    {selectedCategory ? (
                                                        <>
                                                            Showing items for <span className="font-bold text-brand-text">{selectedCategoryLabel}</span>.
                                                        </>
                                                    ) : (
                                                        <>Select a Menu Category to display menu items.</>
                                                    )}
                                                </div>
                                            </div>
                                            {selectedCategory && (
                                                <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <Search
                                                        size={14}
                                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={searchTerm}
                                                        onChange={(e) => setSearchTerm(e.target.value)}
                                                        placeholder="Search item..."
                                                        className="h-[38px] bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 text-xs w-52 outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50"
                                                    />
                                                </div>
                                                <Select2
                                                    options={[
                                                        { value: 'all', label: t('menu_page.all_status') },
                                                        { value: 'available', label: t('menu_page.status.available') },
                                                        { value: 'unavailable', label: t('menu_page.status.unavailable') },
                                                    ]}
                                                    value={availFilter}
                                                    onChange={(v) => setAvailFilter(v ? String(v) : 'all')}
                                                    placeholder={t('menu_page.all_status')}
                                                    className="w-44"
                                                    clearable={false}
                                                    variant="compact"
                                                />
                                                {canCreate('menu_management') && (
                                                    <button
                                                        type="button"
                                                        onClick={openCreate}
                                                        className="h-[38px] bg-brand-primary text-white px-4 rounded-xl text-xs font-black tracking-wide uppercase flex items-center gap-2 shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all cursor-pointer"
                                                    >
                                                        <Plus size={16} />
                                                        Add New Item
                                                    </button>
                                                )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 min-h-0 overflow-hidden">
                                        <div className="h-full overflow-auto overflow-x-hidden custom-scrollbar">
                                            <AnimatePresence mode="wait">
                                                <motion.div
                                                    key={`table-${selectedCategory ?? 'none'}-${availFilter}`}
                                                    initial={{ opacity: 0, x: 40 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -40 }}
                                                    transition={{ duration: 0.24, ease: 'easeOut' }}
                                                    className="w-full"
                                                >
                                                    {!selectedCategory ? (
                                                        <div className="px-6 py-10 text-sm text-brand-muted">
                                                            Select a Menu Category to load menu items.
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-left">
                                                                    <thead>
                                                                        <tr className="bg-white border-b border-gray-100">
                                                                            {columns.map((col, i) => (
                                                                                <th
                                                                                    key={String(col.header)}
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
                                                                        {pagedMenus.map((row) => (
                                                                            <tr key={row.id} className="group transition-colors">
                                                                                {columns.map((col, i) => (
                                                                                    <td
                                                                                        key={i}
                                                                                        className={cn(
                                                                                            'px-4 py-2 text-[11px] text-brand-text',
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

                                                                        {pagedMenus.length === 0 && (
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
                                                                        {Math.min(currentPage * ITEMS_PER_PAGE, filteredMenus.length)} of {filteredMenus.length}{' '}
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
                                                        </>
                                                    )}
                                                </motion.div>
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                )}
            </>

            {hoverPreview && (
                <div
                    className="pointer-events-none fixed z-50 rounded-xl overflow-hidden border border-gray-200 bg-white shadow-xl p-2"
                    style={{
                        top: hoverPreview.top,
                        left: hoverPreview.left,
                        width: '18rem',
                        height: '18rem',
                    }}
                >
                    <img
                        src={hoverPreview.src}
                        alt={hoverPreview.alt}
                        className="w-full h-full object-contain bg-white"
                    />
                </div>
            )}

            {/* Add / Edit Side Panel */}
            <SidePanel
                isOpen={isItemPanelOpen}
                onClose={closeItemPanel}
                title={editingItem ? t('menu_page.modal.edit_title') : t('menu_page.modal.add_title')}
                width="lg"
                footer={
                    <div className="flex items-center justify-end gap-3">
                        <button
                            onClick={closeItemPanel}
                            disabled={submitting}
                            className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                            {t('menu_page.modal.cancel')}
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || !canSubmitItem}
                            className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                        >
                            {submitting && <Loader2 size={16} className="animate-spin" />}
                            {editingItem ? t('menu_page.modal.save_changes') : t('menu_page.modal.save_item')}
                        </button>
                    </div>
                }
            >
                {modalContent}
            </SidePanel>

            {/* Delete confirmation modal (confirmation-only) */}
            <Modal
                isOpen={!!itemToDelete}
                onClose={() => {
                    if (!submitting) setItemToDelete(null);
                }}
                title={t('menu_page.messages.delete_title')}
                maxWidth="md"
                footer={
                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => setItemToDelete(null)}
                            disabled={submitting}
                            className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                            {t('menu_page.modal.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                if (!itemToDelete) return;
                                setSubmitting(true);
                                try {
                                    await deleteMenu(itemToDelete.id);
                                    await refreshData();
                                    setItemToDelete(null);
                                    toast.success(t('menu_page.messages.deleted_msg', { name: itemToDelete.name }));
                                } catch (e) {
                                    toast.error(e instanceof Error ? e.message : t('menu_page.messages.delete_failed'));
                                } finally {
                                    setSubmitting(false);
                                }
                            }}
                            disabled={submitting}
                            className="px-6 py-2.5 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            {submitting && <Loader2 size={16} className="animate-spin" />}
                            {t('menu_page.messages.delete_confirm_btn')}
                        </button>
                    </div>
                }
            >
                <div className="space-y-3">
                    <p className="text-sm text-brand-text font-bold">
                        {itemToDelete?.name}
                    </p>
                    <p className="text-sm text-brand-muted">
                        {itemToDelete ? t('menu_page.messages.delete_confirm', { name: itemToDelete.name }) : ''}
                    </p>
                </div>
            </Modal>

            {/* Add/Edit Category Side Panel */}
            <SidePanel
                isOpen={isCategoryPanelOpen}
                onClose={closeCategoryModal}
                title={editingCategory ? 'Edit Category' : t('categories.add_new_category')}
                width="md"
                footer={
                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={closeCategoryModal}
                            disabled={categorySubmitting}
                            className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                            {t('menu_page.modal.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveCategory}
                            disabled={categorySubmitting || !canSubmitCategory}
                            className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                        >
                            {categorySubmitting && <Loader2 size={16} className="animate-spin" />}
                            {editingCategory ? 'Update' : t('categories.save_category')}
                        </button>
                    </div>
                }
            >
                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-bold text-brand-text mb-2">{t('category.category_name')}</label>
                        <input
                            type="text"
                            value={categoryName}
                            onChange={(e) => setCategoryName(e.target.value)}
                            placeholder={t('category.category_name')}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-brand-text mb-2">{t('categories.form_description')}</label>
                        <textarea
                            value={categoryDesc}
                            onChange={(e) => setCategoryDesc(e.target.value)}
                            placeholder={t('categories.form_description_placeholder')}
                            rows={2}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400 resize-none"
                        />
                    </div>
                </div>
            </SidePanel>

            {/* Delete category confirmation modal (confirmation-only) */}
            <Modal
                isOpen={!!categoryToDelete}
                onClose={() => {
                    if (!categorySubmitting) setCategoryToDelete(null);
                }}
                title={t('menu_page.messages.delete_title')}
                maxWidth="md"
                footer={
                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => setCategoryToDelete(null)}
                            disabled={categorySubmitting}
                            className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                            {t('menu_page.modal.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                if (!categoryToDelete) return;
                                setCategorySubmitting(true);
                                try {
                                    await deleteMenuCategory(categoryToDelete.id);
                                    await refreshData();
                                    setCategoryToDelete(null);
                                    toast.success(`Category "${categoryToDelete.name}" deleted.`);
                                } catch (err) {
                                    toast.error(err instanceof Error ? err.message : 'Failed to delete category');
                                } finally {
                                    setCategorySubmitting(false);
                                }
                            }}
                            disabled={categorySubmitting}
                            className="px-6 py-2.5 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            {categorySubmitting && <Loader2 size={16} className="animate-spin" />}
                            {t('menu_page.messages.delete_confirm_btn')}
                        </button>
                    </div>
                }
            >
                <div className="space-y-3">
                    <p className="text-sm text-brand-text font-bold">
                        {categoryToDelete?.name}
                    </p>
                    <p className="text-sm text-brand-muted">
                        {categoryToDelete ? `Delete category "${categoryToDelete.name}"?` : ''}
                    </p>
                </div>
            </Modal>

            {/* Ingredients Side Panel */}
            <SidePanel
                isOpen={!!ingredientsForMenu}
                onClose={closeIngredientsModal}
                title={ingredientsForMenu ? t('menu_page.ingredients.modal_title', { name: ingredientsForMenu.name }) : t('menu_page.ingredients.title')}
                width="lg"
                footer={
                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={closeIngredientsModal}
                            disabled={ingredientsSubmitting}
                            className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                            {t('menu_page.modal.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmitIngredientsUpdate}
                            disabled={ingredientsSubmitting || !canSubmitIngredientsUpdate}
                            className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                        >
                            {ingredientsSubmitting && <Loader2 size={16} className="animate-spin" />}
                            Update
                        </button>
                    </div>
                }
            >
                <div className="space-y-5">
                    {ingredientsLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 size={32} className="animate-spin text-brand-primary" />
                        </div>
                    ) : (
                        <>
                            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                                {menuIngredients.length === 0 ? (
                                    <div className="px-4 py-10 text-center text-sm text-brand-muted">
                                        {t('menu_page.ingredients.no_ingredients')}
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {menuIngredients.map((rec) => {
                                            const isEditing = editingIngredientId === rec.id;
                                            const draft = pendingIngredientEdits[rec.id];
                                            const displayQty = draft ? draft.qtyPerServe : rec.qtyPerServe;
                                            const displayUnit = draft ? draft.unit : (rec.unit || 'pcs');
                                            return (
                                                <div
                                                    key={rec.id}
                                                    className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-gray-50/60"
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-bold text-brand-text truncate">
                                                            {rec.ingredientName}
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-brand-muted">
                                                            <span className="font-semibold text-brand-text">
                                                                {t('menu_page.ingredients.qty_per_serve')}:
                                                            </span>
                                                            {isEditing ? (
                                                                <input
                                                                    type="number"
                                                                    value={editingQty}
                                                                    onChange={(e) => setEditingQty(e.target.value)}
                                                                    min={getQtyInputStep(rec.unit) || 0.01}
                                                                    step={getQtyInputStep(rec.unit) || 0.01}
                                                                    className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary bg-white"
                                                                />
                                                            ) : (
                                                                <span className="tabular-nums text-brand-text">
                                                                    {formatQty(displayQty, displayUnit)}
                                                                </span>
                                                            )}
                                                            <span className="font-semibold text-brand-text">
                                                                {t('menu_page.ingredients.unit')}:
                                                            </span>
                                                            {isEditing ? (
                                                                <div className="w-28">
                                                                    <Select2
                                                                        options={UOM_OPTIONS.map((o) => ({ value: o, label: getUnitLabel(o) }))}
                                                                        value={editingUnit}
                                                                        onChange={(v) => setEditingUnit(v ? String(v) : '')}
                                                                        placeholder={t('menu_page.ingredients.unit')}
                                                                        clearable={false}
                                                                        variant="compact"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <span>{getUnitLabel(displayUnit)}</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 flex items-center gap-1.5">
                                                        {isEditing ? (
                                                            <>
                                                                <button
                                                                    onClick={() => handleCommitIngredientDraftEdit(rec.id)}
                                                                    disabled={ingredientsSubmitting}
                                                                    className="px-2 py-1.5 text-xs font-bold text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                                                                >
                                                                    {t('menu_page.ingredients.save')}
                                                                </button>
                                                                <button
                                                                    onClick={() => setEditingIngredientId(null)}
                                                                    disabled={ingredientsSubmitting}
                                                                    className="px-2 py-1.5 text-xs font-bold text-brand-muted hover:bg-gray-100 rounded-lg"
                                                                >
                                                                    {t('menu_page.modal.cancel')}
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => handleStartEditIngredient(rec)}
                                                                    disabled={ingredientsSubmitting}
                                                                    className="p-2 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-colors"
                                                                    title={t('menu_page.modal.edit_title')}
                                                                >
                                                                    <Edit2 size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRemoveIngredient(rec)}
                                                                    disabled={ingredientsSubmitting}
                                                                    className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title={t('menu_page.ingredients.remove')}
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="sticky bottom-0 -mx-6 px-6 pt-4 pb-6 bg-white border-t border-gray-100">
                                <div className="flex flex-wrap items-end gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="flex-1 min-w-[140px]">
                                    <label className="block text-xs font-bold text-brand-text mb-1">{t('menu_page.ingredients.ingredient')}</label>
                                    <Select2
                                        options={[{ value: '', label: t('menu_page.ingredients.select_ingredient') }, ...allIngredients.filter((i) => !menuIngredients.some((mi) => mi.ingredientId === i.id)).map((i) => ({ value: i.id, label: i.name }))]}
                                        value={addIngredientId}
                                        onChange={(v) => setAddIngredientId(v ? String(v) : '')}
                                        placeholder={t('menu_page.ingredients.select_ingredient')}
                                    />
                                </div>
                                <div className="w-24">
                                    <label className="block text-xs font-bold text-brand-text mb-1">{t('menu_page.ingredients.qty_per_serve')}</label>
                                    <input
                                        type="number"
                                        value={addQty}
                                        onChange={(e) => setAddQty(e.target.value)}
                                        min={0.01}
                                        step={0.01}
                                        placeholder="0"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                                    />
                                </div>
                                <div className="w-28">
                                    <label className="block text-xs font-bold text-brand-text mb-1">{t('menu_page.ingredients.unit')}</label>
                                    <div className="h-10 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-brand-muted flex items-center">
                                        {addIngredientId ? getUnitLabel(allIngredients.find((i) => i.id === addIngredientId)?.unit || 'pcs') : '—'}
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddIngredient}
                                    disabled={ingredientsSubmitting || !addIngredientId}
                                    className="px-4 py-2 rounded-lg font-bold text-white bg-brand-primary hover:bg-brand-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {ingredientsSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {t('menu_page.ingredients.add')}
                                </button>
                            </div>
                            </div>
                        </>
                    )}
                </div>
            </SidePanel>

        </SkeletonTransition>
    );
};
