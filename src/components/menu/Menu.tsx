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
    CheckCircle2,
    X,
    AlertCircle,
    Loader2,
    ImageIcon,
    ListChecks,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { type ColumnDef } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { Select2 } from '../ui/Select2';
import { SkeletonTransition, SkeletonCard, SkeletonTable } from '../ui/Skeleton';
import {
    getMenus,
    getMenuById,
    getMenuCategories,
    createMenu,
    createMenuCategory,
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

// ---- Props & types ----
interface MenuProps {
    selectedBranch: Branch | null;
}

type SwalState = {
    type: 'question' | 'success' | 'error' | 'warning';
    title: string;
    text: string;
    showCancel?: boolean;
    confirmText?: string;
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
} | null;

export const Menu: React.FC<MenuProps> = ({ selectedBranch }) => {
    const { t } = useTranslation();
    const branchId = selectedBranch ? String(selectedBranch.id) : 'all';
    const isSpecificBranch = selectedBranch != null && String(selectedBranch.id) !== 'all';

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
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<MenuRecord | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [swal, setSwal] = useState<SwalState>(null);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [categoryName, setCategoryName] = useState('');
    const [categoryDesc, setCategoryDesc] = useState('');
    const [categorySubmitting, setCategorySubmitting] = useState(false);

    // ----- Ingredients modal -----
    const [ingredientsForMenu, setIngredientsForMenu] = useState<MenuRecord | null>(null);
    const [menuIngredients, setMenuIngredients] = useState<MenuIngredientRecord[]>([]);
    const [ingredientsLoading, setIngredientsLoading] = useState(false);
    const [ingredientsSubmitting, setIngredientsSubmitting] = useState(false);
    const [allIngredients, setAllIngredients] = useState<{ id: string; name: string; unit: string }[]>([]);
    const [addIngredientId, setAddIngredientId] = useState('');
    const [addQty, setAddQty] = useState('');
    const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
    const [editingQty, setEditingQty] = useState('');
    const [editingUnit, setEditingUnit] = useState('');

    // ----- Form -----
    const [formName, setFormName] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formCategory, setFormCategory] = useState('');
    const [formPrice, setFormPrice] = useState('');
    const [formAvailable, setFormAvailable] = useState(true);
    const [formImage, setFormImage] = useState<File | null>(null);
    const [formImagePreview, setFormImagePreview] = useState<string | null>(null);

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
        setIsCreateOpen(true);
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

        // Menu list fetch intentionally omits description; load it on-demand for editing
        try {
            const full = await getMenuById(item.id);
            setFormDesc(full.description || '');
        } catch {
            // Leave description empty if it fails to load
        }
    };

    const closeModal = () => {
        if (submitting) return;
        setIsCreateOpen(false);
        setEditingItem(null);
        resetForm();
    };

    const openCategoryModal = () => {
        setCategoryName('');
        setCategoryDesc('');
        setIsCategoryModalOpen(true);
    };

    const closeCategoryModal = () => {
        if (categorySubmitting) return;
        setIsCategoryModalOpen(false);
        setCategoryName('');
        setCategoryDesc('');
    };

    const handleCreateCategory = async () => {
        const name = categoryName.trim();
        if (!name) {
            setSwal({ type: 'warning', title: t('category.manage_category'), text: t('categories.messages.name_required'), onConfirm: () => setSwal(null) });
            return;
        }
        if (branchId === 'all') {
            setSwal({ type: 'warning', title: t('category.manage_category'), text: t('categories.messages.select_branch'), onConfirm: () => setSwal(null) });
            return;
        }
        setCategorySubmitting(true);
        try {
            await createMenuCategory(branchId, { name, description: categoryDesc.trim() || null });
            setSwal({ type: 'success', title: t('category.category_created_successfully'), text: '', onConfirm: () => { setSwal(null); closeCategoryModal(); refreshData(); } });
        } catch (e) {
            setSwal({ type: 'error', title: t('category.failed_to_create_category'), text: e instanceof Error ? e.message : 'Failed to create category', onConfirm: () => setSwal(null) });
        } finally {
            setCategorySubmitting(false);
        }
    };

    // ==================== Ingredients modal ====================
    const openIngredientsModal = async (item: MenuRecord) => {
        setIngredientsForMenu(item);
        setMenuIngredients([]);
        setAddIngredientId('');
        setAddQty('');
        setEditingIngredientId(null);
        setIngredientsLoading(true);
        try {
            const [ingredients, list] = await Promise.all([
                getMenuIngredients(item.id),
                getIngredients(item.branchId, undefined),
            ]);
            setMenuIngredients(ingredients);
            setAllIngredients(list.map((i) => ({ id: i.id, name: i.name, unit: i.unit || 'pcs' })));
        } catch (e) {
            setSwal({ type: 'error', title: t('menu_page.messages.error_title'), text: e instanceof Error ? e.message : 'Failed to load ingredients', onConfirm: () => setSwal(null) });
        } finally {
            setIngredientsLoading(false);
        }
    };

    const closeIngredientsModal = () => {
        if (!ingredientsSubmitting) {
            setIngredientsForMenu(null);
            setMenuIngredients([]);
            setAddIngredientId('');
            setAddQty('');
            setEditingIngredientId(null);
        }
    };

    const handleAddIngredient = async () => {
        if (!ingredientsForMenu || !addIngredientId.trim()) return;
        const qty = Number(addQty);
        if (!Number.isFinite(qty) || qty <= 0) {
            setSwal({ type: 'warning', title: t('menu_page.ingredients.invalid_qty'), text: t('menu_page.ingredients.invalid_qty_msg'), onConfirm: () => setSwal(null) });
            return;
        }
        if (menuIngredients.some((mi) => mi.ingredientId === addIngredientId)) {
            setSwal({ type: 'warning', title: t('menu_page.ingredients.already_added'), text: t('menu_page.ingredients.already_added_msg'), onConfirm: () => setSwal(null) });
            return;
        }
        const selectedIng = allIngredients.find((i) => i.id === addIngredientId);
        const unit = selectedIng?.unit || 'pcs';
        setIngredientsSubmitting(true);
        try {
            await createMenuIngredient({
                menuId: ingredientsForMenu.id,
                ingredientId: addIngredientId,
                qtyPerServe: qty,
                unit,
            });
            const refreshed = await getMenuIngredients(ingredientsForMenu.id);
            setMenuIngredients(refreshed);
            setAddIngredientId('');
            setAddQty('');
        } catch (e) {
            setSwal({ type: 'error', title: t('menu_page.messages.error_title'), text: e instanceof Error ? e.message : 'Failed to add', onConfirm: () => setSwal(null) });
        } finally {
            setIngredientsSubmitting(false);
        }
    };

    const handleUpdateIngredient = async (id: string) => {
        const qty = Number(editingQty);
        if (!Number.isFinite(qty) || qty <= 0) return;
        setIngredientsSubmitting(true);
        try {
            await updateMenuIngredient(id, { qtyPerServe: qty, unit: editingUnit });
            if (ingredientsForMenu) {
                const refreshed = await getMenuIngredients(ingredientsForMenu.id);
                setMenuIngredients(refreshed);
            }
            setEditingIngredientId(null);
        } catch (e) {
            setSwal({ type: 'error', title: t('menu_page.messages.error_title'), text: e instanceof Error ? e.message : 'Failed to update', onConfirm: () => setSwal(null) });
        } finally {
            setIngredientsSubmitting(false);
        }
    };

    const handleRemoveIngredient = async (rec: MenuIngredientRecord) => {
        setSwal({
            type: 'question',
            title: t('menu_page.ingredients.remove_title'),
            text: t('menu_page.ingredients.remove_confirm', { name: rec.ingredientName }),
            showCancel: true,
            confirmText: t('menu_page.messages.delete_confirm_btn'),
            onConfirm: async () => {
                setSwal(null);
                setIngredientsSubmitting(true);
                try {
                    await deleteMenuIngredient(rec.id);
                    if (ingredientsForMenu) {
                        const refreshed = await getMenuIngredients(ingredientsForMenu.id);
                        setMenuIngredients(refreshed);
                    }
                } catch (e) {
                    setSwal({ type: 'error', title: t('menu_page.messages.error_title'), text: e instanceof Error ? e.message : 'Failed to remove', onConfirm: () => setSwal(null) });
                } finally {
                    setIngredientsSubmitting(false);
                }
            },
            onCancel: () => setSwal(null),
        });
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
            setSwal({ type: 'warning', title: t('menu_page.messages.name_required'), text: t('menu_page.messages.name_required_msg'), onConfirm: () => setSwal(null) });
            return;
        }
        if (!formPrice || Number(formPrice) <= 0) {
            setSwal({ type: 'warning', title: t('menu_page.messages.price_required'), text: t('menu_page.messages.price_required_msg'), onConfirm: () => setSwal(null) });
            return;
        }

        setSubmitting(true);
        try {
            if (editingItem) {
                const payload: UpdateMenuPayload = {
                    categoryId: formCategory || null,
                    name: formName.trim(),
                    description: formDesc.trim() || null,
                    price: Number(formPrice),
                    isAvailable: formAvailable,
                    existingImagePath: editingItem.imageUrl,
                    imageFile: formImage,
                };
                await updateMenu(editingItem.id, payload);
                setSwal({ type: 'success', title: t('menu_page.messages.updated_title'), text: t('menu_page.messages.updated_msg', { name: formName.trim() }), onConfirm: () => setSwal(null) });
            } else {
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
                setSwal({ type: 'success', title: t('menu_page.messages.created_title'), text: t('menu_page.messages.created_msg', { name: formName.trim() }), onConfirm: () => setSwal(null) });
            }
            closeModal();
            await refreshData();
        } catch (e) {
            setSwal({ type: 'error', title: t('menu_page.messages.error_title'), text: e instanceof Error ? e.message : t('menu_page.messages.operation_failed'), onConfirm: () => setSwal(null) });
        } finally {
            setSubmitting(false);
        }
    };

    // ==================== Delete ====================
    const confirmDelete = (item: MenuRecord) => {
        setSwal({
            type: 'question',
            title: t('menu_page.messages.delete_title'),
            text: t('menu_page.messages.delete_confirm', { name: item.name }),
            showCancel: true,
            confirmText: t('menu_page.messages.delete_confirm_btn'),
            onConfirm: async () => {
                setSwal(null);
                try {
                    await deleteMenu(item.id);
                    await refreshData();
                    setSwal({ type: 'success', title: t('menu_page.messages.deleted_title'), text: t('menu_page.messages.deleted_msg', { name: item.name }), onConfirm: () => setSwal(null) });
                } catch (e) {
                    setSwal({ type: 'error', title: t('menu_page.messages.error_title'), text: e instanceof Error ? e.message : t('menu_page.messages.delete_failed'), onConfirm: () => setSwal(null) });
                }
            },
            onCancel: () => setSwal(null),
        });
    };

    // ==================== Table columns ====================
    const columns: ColumnDef<MenuRecord>[] = useMemo(() => [
        {
            header: t('menu_page.table.menu_item'),
            render: (item) => (
                <div className="flex items-center gap-3 min-w-[200px]">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                        {item.imageUrl ? (
                            <img src={resolveImageUrl(item.imageUrl) || ''} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                            <UtensilsCrossed size={16} className="text-brand-muted" />
                        )}
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
                <span className="text-sm font-bold text-brand-text">{t('common.currency_symbol')}{Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
    ], [t, canUpdate, canDelete]);

    // ==================== Modal form content ====================
    const modalContent = (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
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
            </div>

            <div className="grid grid-cols-2 gap-5">
                <div>
                    <label className="block text-sm font-bold text-brand-text mb-2">{t('menu_page.modal.category')}</label>
                    <Select2
                        options={[{ value: '', label: t('menu_page.modal.uncategorized') }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                        value={formCategory || ''}
                        onChange={(v) => setFormCategory(v ? String(v) : '')}
                        placeholder={t('menu_page.modal.select_category')}
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-brand-text mb-2">{t('menu_page.modal.availability')}</label>
                    <div className="flex gap-4 mt-1">
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
                            <section className="w-[280px] shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
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
                                    {categories.map((cat) => {
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
                                                                'text-[11px] px-2 py-0.5 rounded-full shrink-0 transition-colors',
                                                                active
                                                                    ? 'bg-brand-primary/15 text-brand-primary'
                                                                    : 'bg-gray-100 text-brand-muted group-hover:bg-gray-200',
                                                            )}
                                                        >
                                                            {count}
                                                        </span>
                                                    </div>
                                                </button>
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

            {/* Create / Edit Modal */}
            <Modal
                isOpen={isCreateOpen || !!editingItem}
                onClose={closeModal}
                title={editingItem ? t('menu_page.modal.edit_title') : t('menu_page.modal.add_title')}
                maxWidth="lg"
                footer={
                    <div className="flex items-center justify-end gap-3">
                        <button
                            onClick={closeModal}
                            disabled={submitting}
                            className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                            {t('menu_page.modal.cancel')}
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                        >
                            {submitting && <Loader2 size={16} className="animate-spin" />}
                            {editingItem ? t('menu_page.modal.save_changes') : t('menu_page.modal.save_item')}
                        </button>
                    </div>
                }
            >
                {modalContent}
            </Modal>

            {/* Add New Category Modal */}
            <Modal
                isOpen={isCategoryModalOpen}
                onClose={closeCategoryModal}
                title={t('categories.add_new_category')}
                maxWidth="md"
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
                            onClick={handleCreateCategory}
                            disabled={categorySubmitting}
                            className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                        >
                            {categorySubmitting && <Loader2 size={16} className="animate-spin" />}
                            {t('categories.save_category')}
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
            </Modal>

            {/* Ingredients Modal */}
            <Modal
                isOpen={!!ingredientsForMenu}
                onClose={closeIngredientsModal}
                title={ingredientsForMenu ? t('menu_page.ingredients.modal_title', { name: ingredientsForMenu.name }) : t('menu_page.ingredients.title')}
                maxWidth="lg"
                footer={
                    <div className="flex justify-end">
                        <button
                            onClick={closeIngredientsModal}
                            disabled={ingredientsSubmitting}
                            className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                            {t('common.close')}
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
                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="text-left px-4 py-3 font-bold text-brand-text">{t('menu_page.ingredients.ingredient')}</th>
                                            <th className="text-left px-4 py-3 font-bold text-brand-text">{t('menu_page.ingredients.qty_per_serve')}</th>
                                            <th className="text-left px-4 py-3 font-bold text-brand-text">{t('menu_page.ingredients.unit')}</th>
                                            <th className="text-right px-4 py-3 font-bold text-brand-text w-24">{t('menu_page.table.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {menuIngredients.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-8 text-center text-brand-muted">
                                                    {t('menu_page.ingredients.no_ingredients')}
                                                </td>
                                            </tr>
                                        ) : (
                                            menuIngredients.map((rec) => (
                                                <tr key={rec.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                                                    <td className="px-4 py-3 font-medium text-brand-text">{rec.ingredientName}</td>
                                                    <td className="px-4 py-3">
                                                        {editingIngredientId === rec.id ? (
                                                            <input
                                                                type="number"
                                                                value={editingQty}
                                                                onChange={(e) => setEditingQty(e.target.value)}
                                                                min={getQtyInputStep(rec.unit) || 0.01}
                                                                step={getQtyInputStep(rec.unit) || 0.01}
                                                                className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                                                            />
                                                        ) : (
                                                            <span className="text-brand-text">{formatQty(rec.qtyPerServe, rec.unit)}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {editingIngredientId === rec.id ? (
                                                            <select
                                                                value={editingUnit}
                                                                onChange={(e) => setEditingUnit(e.target.value)}
                                                                className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                                                            >
                                                                {UOM_OPTIONS.map((o) => (
                                                                    <option key={o} value={o}>{getUnitLabel(o)}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <span className="text-brand-muted">{getUnitLabel(rec.unit)}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {editingIngredientId === rec.id ? (
                                                            <div className="flex justify-end gap-1">
                                                                <button
                                                                    onClick={() => handleUpdateIngredient(rec.id)}
                                                                    disabled={ingredientsSubmitting}
                                                                    className="px-2 py-1 text-xs font-bold text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                                                                >
                                                                    {ingredientsSubmitting ? <Loader2 size={14} className="animate-spin inline" /> : t('menu_page.ingredients.save')}
                                                                </button>
                                                                <button
                                                                    onClick={() => setEditingIngredientId(null)}
                                                                    disabled={ingredientsSubmitting}
                                                                    className="px-2 py-1 text-xs font-bold text-brand-muted hover:bg-gray-100 rounded-lg"
                                                                >
                                                                    {t('menu_page.modal.cancel')}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex justify-end gap-1">
                                                                <button
                                                                    onClick={() => { setEditingIngredientId(rec.id); setEditingQty(String(rec.qtyPerServe)); setEditingUnit(rec.unit || 'pcs'); }}
                                                                    disabled={ingredientsSubmitting}
                                                                    className="p-1.5 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-colors"
                                                                    title={t('menu_page.modal.edit_title')}
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRemoveIngredient(rec)}
                                                                    disabled={ingredientsSubmitting}
                                                                    className="p-1.5 text-brand-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title={t('menu_page.ingredients.remove')}
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

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
                        </>
                    )}
                </div>
            </Modal>

            {/* SweetAlert-style popup */}
            <AnimatePresence>
                {swal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-[100] p-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
                        >
                            <div className="flex justify-center mb-4">
                                {swal.type === 'question' && <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center"><AlertCircle size={40} className="text-blue-500" /></div>}
                                {swal.type === 'success' && <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle2 size={40} className="text-green-500" /></div>}
                                {swal.type === 'error' && <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center"><X size={40} className="text-red-500" /></div>}
                                {swal.type === 'warning' && <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center"><AlertTriangle size={40} className="text-yellow-500" /></div>}
                            </div>
                            <h3 className="text-2xl font-bold text-brand-text text-center mb-2">{swal.title}</h3>
                            <p className="text-brand-muted text-center mb-6">{swal.text}</p>
                            <div className="flex justify-center gap-3">
                                {swal.showCancel && (
                                    <button onClick={() => { swal.onCancel?.(); setSwal(null); }} className="px-6 py-2.5 bg-gray-100 text-brand-muted rounded-xl font-bold hover:bg-gray-200 transition-all">
                                        {t('menu_page.modal.cancel')}
                                    </button>
                                )}
                                <button
                                    onClick={async () => { if (swal.onConfirm) await swal.onConfirm(); }}
                                    className={cn(
                                        'px-6 py-2.5 text-white rounded-xl font-bold transition-all',
                                        swal.type === 'error' ? 'bg-red-500 hover:bg-red-600'
                                            : swal.type === 'success' ? 'bg-green-500 hover:bg-green-600'
                                                : swal.type === 'question' ? 'bg-red-500 hover:bg-red-600'
                                                    : 'bg-brand-orange hover:opacity-90'
                                    )}
                                >
                                    {swal.confirmText || t('common.ok')}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </SkeletonTransition>
    );
};
