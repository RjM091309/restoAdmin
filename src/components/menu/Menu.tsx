import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    RefreshCw,
    Plus,
    Edit3,
    Trash2,
    UtensilsCrossed,
    CheckCircle2,
    X,
    AlertTriangle,
    AlertCircle,
    Loader2,
    ImageIcon,
    Filter,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { Select2 } from '../ui/Select2';
import { SkeletonTransition, SkeletonPage } from '../ui/Skeleton';
import {
    getMenus,
    getMenuCategories,
    createMenu,
    updateMenu,
    deleteMenu,
    resolveImageUrl,
    type MenuRecord,
    type MenuCategory,
    type CreateMenuPayload,
    type UpdateMenuPayload,
} from '../../services/menuService';

// Branch type from Header
import { type Branch } from '../partials/Header';

interface MenuProps {
    selectedBranch: Branch | null;
}

// --- SweetAlert-style dialog state ---
type SwalState = {
    type: 'question' | 'success' | 'error' | 'warning';
    title: string;
    text: string;
    showCancel?: boolean;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
} | null;

// --- Form State ---
interface FormState {
    name: string;
    description: string;
    categoryId: string;
    price: string;
    isAvailable: boolean;
    imageUrl: string;
    branchId: string;
}

const defaultFormState = (branchId: string): FormState => ({
    name: '',
    description: '',
    categoryId: '',
    price: '',
    isAvailable: true,
    imageUrl: '',
    branchId,
});

export const Menu: React.FC<MenuProps> = ({ selectedBranch }) => {
    const branchId = selectedBranch ? String(selectedBranch.id) : 'all';

    // ----- Data State -----
    const [menus, setMenus] = useState<MenuRecord[]>([]);
    const [categories, setCategories] = useState<MenuCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ----- Filters -----
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | number | null>(null);
    const [availability, setAvailability] = useState<string | number | null>(null);

    // ----- Modals -----
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingMenu, setEditingMenu] = useState<MenuRecord | null>(null);
    const [formState, setFormState] = useState<FormState>(defaultFormState(branchId));
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // ----- Delete -----
    const [deleteTarget, setDeleteTarget] = useState<MenuRecord | null>(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    // ----- SweetAlert -----
    const [swal, setSwal] = useState<SwalState>(null);

    // ==================== Data fetching ====================
    const refreshData = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [menuData, categoryData] = await Promise.all([
                getMenus(branchId),
                getMenuCategories(branchId),
            ]);
            setMenus(menuData);
            setCategories(categoryData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load menu data');
            setMenus([]);
            setCategories([]);
        } finally {
            setLoading(false);
        }
    }, [branchId]);

    // Re-fetch when branch changes
    useEffect(() => {
        refreshData();
        // Reset filters when branch changes so stale category/filters don't persist
        setSearchTerm('');
        setSelectedCategory(null);
        setAvailability(null);
    }, [refreshData]);

    useEffect(() => {
        if (branchId !== 'all') {
            setFormState((prev) => ({ ...prev, branchId }));
        }
    }, [branchId]);

    // ==================== Filtering ====================
    const filteredMenus = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        return menus.filter((menu) => {
            const matchesSearch =
                !normalizedSearch ||
                [menu.name, menu.description || '', menu.categoryName, menu.branchName, menu.branchCode]
                    .join(' ')
                    .toLowerCase()
                    .includes(normalizedSearch);

            const matchesCategory =
                !selectedCategory || selectedCategory === 'all' || menu.categoryId === String(selectedCategory);

            const menuAvailable = menu.effectiveAvailable ?? menu.isAvailable;
            const matchesAvailability =
                !availability ||
                availability === 'all' ||
                (availability === 'available' && menuAvailable) ||
                (availability === 'unavailable' && !menuAvailable);

            return matchesSearch && matchesCategory && matchesAvailability;
        });
    }, [menus, searchTerm, selectedCategory, availability]);

    // ==================== Image preview ====================
    useEffect(() => {
        if (!imageFile) {
            setImagePreview(null);
            return;
        }
        const url = URL.createObjectURL(imageFile);
        setImagePreview(url);
        return () => URL.revokeObjectURL(url);
    }, [imageFile]);

    // ==================== Form handlers ====================
    const resetForm = () => {
        setFormState(defaultFormState(branchId !== 'all' ? branchId : ''));
        setImageFile(null);
        setImagePreview(null);
        setSubmitError(null);
    };

    const handleOpenAdd = () => {
        resetForm();
        setIsAddModalOpen(true);
    };

    const handleOpenEdit = (menu: MenuRecord) => {
        setEditingMenu(menu);
        setFormState({
            name: menu.name,
            description: menu.description || '',
            categoryId: menu.categoryId || '',
            price: menu.price ? String(menu.price) : '',
            isAvailable: menu.isAvailable,
            imageUrl: menu.imageUrl || '',
            branchId: menu.branchId,
        });
        setImageFile(null);
        setImagePreview(null);
        setSubmitError(null);
        setIsEditModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsAddModalOpen(false);
        setIsEditModalOpen(false);
        setEditingMenu(null);
        resetForm();
    };

    // ==================== Delete ====================
    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleteSubmitting(true);
        try {
            await deleteMenu(deleteTarget.id);
            await refreshData();
            setDeleteTarget(null);
            setSwal({
                type: 'success',
                title: 'Deleted!',
                text: `"${deleteTarget.name}" has been deleted successfully.`,
                onConfirm: () => setSwal(null),
            });
        } catch (err) {
            setSwal({
                type: 'error',
                title: 'Error',
                text: err instanceof Error ? err.message : 'Delete failed',
                onConfirm: () => {
                    setSwal(null);
                    setDeleteTarget(null);
                },
            });
        } finally {
            setDeleteSubmitting(false);
        }
    };

    const handleDelete = (menu: MenuRecord) => {
        setDeleteTarget(menu);
        setSwal({
            type: 'question',
            title: 'Delete Menu Item',
            text: `Are you sure you want to delete "${menu.name}"? This action cannot be undone.`,
            showCancel: true,
            confirmText: 'Yes, Delete',
            cancelText: 'Cancel',
            onConfirm: confirmDelete,
            onCancel: () => {
                setSwal(null);
                setDeleteTarget(null);
            },
        });
    };

    // ==================== Submit (Create / Update) ====================
    const handleSubmit = (mode: 'add' | 'edit') => {
        const resolvedBranchId = formState.branchId || (branchId === 'all' ? '' : branchId);
        if (mode === 'add' && !resolvedBranchId) {
            setSubmitError('Please select a branch.');
            return;
        }
        if (!formState.name.trim()) {
            setSubmitError('Menu name is required.');
            return;
        }

        const menuName = formState.name.trim() || 'Untitled';
        const actionTitle = mode === 'add' ? 'Create Menu Item' : 'Update Menu Item';
        const actionText =
            mode === 'add'
                ? `Create "${menuName}"?`
                : `Save changes to "${menuName}"?`;

        setSwal({
            type: 'question',
            title: actionTitle,
            text: actionText,
            showCancel: true,
            confirmText: 'Yes, Continue',
            cancelText: 'Cancel',
            onConfirm: async () => {
                setSwal(null);
                setSubmitting(true);
                setSubmitError(null);
                setError(null);
                try {
                    if (mode === 'add') {
                        await createMenu({
                            branchId: resolvedBranchId!,
                            categoryId: formState.categoryId || null,
                            name: formState.name.trim(),
                            description: formState.description.trim() || null,
                            price: Number(formState.price || 0),
                            isAvailable: formState.isAvailable,
                            imageFile: imageFile ?? undefined,
                        });
                        await refreshData();
                        setIsAddModalOpen(false);
                        resetForm();
                        setSwal({
                            type: 'success',
                            title: 'Success!',
                            text: `"${menuName}" has been created successfully.`,
                            onConfirm: () => setSwal(null),
                        });
                    } else if (editingMenu) {
                        await updateMenu(editingMenu.id, {
                            categoryId: formState.categoryId || null,
                            name: formState.name.trim(),
                            description: formState.description.trim() || null,
                            price: Number(formState.price || 0),
                            isAvailable: formState.isAvailable,
                            existingImagePath: formState.imageUrl || undefined,
                            imageFile: imageFile ?? undefined,
                        });
                        await refreshData();
                        setIsEditModalOpen(false);
                        setEditingMenu(null);
                        resetForm();
                        setSwal({
                            type: 'success',
                            title: 'Updated!',
                            text: `"${menuName}" has been updated successfully.`,
                            onConfirm: () => setSwal(null),
                        });
                    }
                } catch (err) {
                    setSwal({
                        type: 'error',
                        title: 'Error',
                        text: err instanceof Error ? err.message : 'Request failed',
                        onConfirm: () => setSwal(null),
                    });
                } finally {
                    setSubmitting(false);
                }
            },
            onCancel: () => setSwal(null),
        });
    };

    // ==================== Table columns ====================
    const columns: ColumnDef<MenuRecord>[] = useMemo(() => {
        const cols: ColumnDef<MenuRecord>[] = [
            {
                header: 'Menu Item',
                render: (menu) => {
                    const imgUrl = resolveImageUrl(menu.imageUrl);
                    return (
                        <div className="flex items-center gap-3 min-w-[200px]">
                            <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0 border border-gray-200/50">
                                {imgUrl ? (
                                    <img src={imgUrl} alt={menu.name} className="w-full h-full object-cover" />
                                ) : (
                                    <UtensilsCrossed size={18} className="text-gray-400" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="font-bold text-brand-text text-sm truncate">{menu.name}</p>
                                <p className="text-xs text-brand-muted truncate max-w-[200px]">
                                    {menu.description || 'No description'}
                                </p>
                            </div>
                        </div>
                    );
                },
            },
            {
                header: 'Category',
                render: (menu) => (
                    <span className="text-xs font-semibold text-brand-muted bg-gray-100 px-2.5 py-1 rounded-lg inline-block">
                        {menu.categoryName}
                    </span>
                ),
            },
            {
                header: 'Price',
                render: (menu) => (
                    <span className="text-sm font-bold text-brand-text">
                        ₱{menu.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                ),
            },
            {
                header: 'Stock',
                render: (menu) => {
                    if (!menu.inventoryTracked) {
                        return (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight bg-gray-100 text-gray-500">
                                N/A
                            </span>
                        );
                    }
                    const stock = Number(menu.inventoryStock || 0);
                    if (stock <= 0) {
                        return (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight bg-red-100 text-red-700">
                                Out: {stock.toLocaleString()}
                            </span>
                        );
                    }
                    if (stock < 20) {
                        return (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight bg-amber-100 text-amber-700">
                                Low: {stock.toLocaleString()}
                            </span>
                        );
                    }
                    return (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight bg-green-100 text-green-700">
                            Stock: {stock.toLocaleString()}
                        </span>
                    );
                },
            },
            {
                header: 'Availability',
                render: (menu) => {
                    const available = menu.effectiveAvailable ?? menu.isAvailable;
                    return (
                        <span
                            className={cn(
                                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight',
                                available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            )}
                        >
                            {available ? <CheckCircle2 size={12} /> : <X size={12} />}
                            {available ? 'Available' : 'Unavailable'}
                        </span>
                    );
                },
            },
        ];

        // Show branch column when viewing all branches
        if (branchId === 'all') {
            cols.push({
                header: 'Branch',
                render: (menu) => (
                    <div className="min-w-[120px]">
                        <p className="text-xs font-bold text-brand-text">{menu.branchName || menu.branchLabel || 'Unknown'}</p>
                        <p className="text-[10px] text-brand-muted uppercase">{menu.branchCode || 'N/A'}</p>
                    </div>
                ),
            });
        }

        cols.push({
            header: 'Actions',
            className: 'text-right',
            render: (menu) => (
                <div className="flex justify-end items-center gap-1">
                    <button
                        onClick={() => handleOpenEdit(menu)}
                        className="p-2 text-brand-muted hover:text-brand-orange hover:bg-brand-orange/5 rounded-lg transition-all"
                        title="Edit menu"
                    >
                        <Edit3 size={15} />
                    </button>
                    <button
                        onClick={() => handleDelete(menu)}
                        className="p-2 text-brand-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete menu"
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            ),
        });

        return cols;
    }, [branchId]);

    // ==================== Category + Availability options ====================
    const categoryOptions = useMemo(
        () => [
            { value: 'all', label: 'All Categories' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
        ],
        [categories]
    );

    const availabilityOptions = [
        { value: 'all', label: 'All Status' },
        { value: 'available', label: 'Available' },
        { value: 'unavailable', label: 'Unavailable' },
    ];

    const formCategoryOptions = useMemo(
        () => [
            { value: '', label: 'Uncategorized' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
        ],
        [categories]
    );

    // Stats summary
    const stats = useMemo(() => {
        const available = filteredMenus.filter((m) => m.effectiveAvailable ?? m.isAvailable).length;
        const unavailable = filteredMenus.length - available;
        return { total: filteredMenus.length, available, unavailable };
    }, [filteredMenus]);

    // ==================== FORM MODAL CONTENT ====================

    const formContent = (
        <div className="space-y-5">
            {/* Menu Name */}
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-brand-muted uppercase tracking-widest">Menu Name *</label>
                <input
                    required
                    type="text"
                    value={formState.name}
                    onChange={(e) => setFormState((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Chicken Adobo"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:outline-none focus:border-brand-orange/50 transition-all"
                />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-brand-muted uppercase tracking-widest">Description</label>
                <textarea
                    value={formState.description}
                    onChange={(e) => setFormState((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Brief description of the menu item..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:outline-none focus:border-brand-orange/50 transition-all resize-none"
                />
            </div>

            {/* Category & Price row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-brand-muted uppercase tracking-widest">Category</label>
                    <Select2
                        options={formCategoryOptions.map((o) => ({ value: o.value || '__NONE__', label: o.label }))}
                        value={formState.categoryId || '__NONE__'}
                        onChange={(v) => setFormState((p) => ({ ...p, categoryId: v === '__NONE__' ? '' : String(v ?? '') }))}
                        placeholder="Select category"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-brand-muted uppercase tracking-widest">Price (₱) *</label>
                    <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={formState.price}
                        onChange={(e) => setFormState((p) => ({ ...p, price: e.target.value }))}
                        placeholder="0.00"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:outline-none focus:border-brand-orange/50 transition-all"
                    />
                </div>
            </div>

            {/* Availability */}
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-brand-muted uppercase tracking-widest">Availability</label>
                <Select2
                    options={[
                        { value: 'yes', label: 'Available' },
                        { value: 'no', label: 'Unavailable' },
                    ]}
                    value={formState.isAvailable ? 'yes' : 'no'}
                    onChange={(v) => setFormState((p) => ({ ...p, isAvailable: v === 'yes' }))}
                    placeholder="Select status"
                />
            </div>

            {/* Image Upload */}
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-brand-muted uppercase tracking-widest">Image</label>
                <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden shrink-0">
                        {imagePreview ? (
                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : isEditModalOpen && formState.imageUrl ? (
                            <img src={resolveImageUrl(formState.imageUrl) || ''} alt="Current" className="w-full h-full object-cover" />
                        ) : (
                            <ImageIcon size={24} className="text-gray-400" />
                        )}
                    </div>
                    <div className="flex-1">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                            className="w-full text-sm text-brand-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-brand-orange/10 file:text-brand-orange file:text-sm file:font-bold file:cursor-pointer hover:file:bg-brand-orange/20 transition-all"
                        />
                        {isEditModalOpen && formState.imageUrl && !imageFile && (
                            <p className="text-[10px] text-brand-muted mt-1">Current image will be kept if no new file is uploaded.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Error */}
            {submitError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">
                    <AlertCircle size={16} className="shrink-0" />
                    {submitError}
                </div>
            )}
        </div>
    );

    const formFooter = (
        <div className="flex items-center gap-3">
            <button
                type="button"
                onClick={handleCloseModal}
                disabled={submitting}
                className="flex-1 px-4 py-3 bg-gray-100 text-brand-muted rounded-xl font-bold text-sm hover:bg-gray-200 transition-all disabled:opacity-50"
            >
                Cancel
            </button>
            <button
                type="button"
                onClick={() => handleSubmit(isEditModalOpen ? 'edit' : 'add')}
                disabled={submitting}
                className="flex-[2] px-4 py-3 bg-brand-orange text-white rounded-xl font-bold text-sm shadow-lg shadow-brand-orange/20 hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
                {submitting ? (
                    <>
                        <Loader2 size={16} className="animate-spin" />
                        Saving...
                    </>
                ) : isEditModalOpen ? (
                    'Update Menu'
                ) : (
                    'Save Menu'
                )}
            </button>
        </div>
    );

    // ==================== RENDER ====================

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
        >
            {/* Page Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-brand-text">Menu Management</h1>
                    <p className="text-brand-muted text-sm mt-1">
                        {selectedBranch
                            ? `Manage menu items for ${selectedBranch.name}`
                            : 'Manage your restaurant menu items'}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={refreshData}
                        disabled={loading}
                        className="bg-white border border-gray-200 text-brand-muted px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-gray-50 hover:border-brand-orange/30 transition-all shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={handleOpenAdd}
                        className="bg-brand-orange text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-brand-orange/20 hover:opacity-90 hover:-translate-y-0.5 transition-all active:scale-[0.98]"
                    >
                        <Plus size={16} />
                        Add Menu
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-brand-orange/10 flex items-center justify-center">
                        <UtensilsCrossed size={22} className="text-brand-orange" />
                    </div>
                    <div>
                        <p className="text-brand-muted text-xs font-bold uppercase tracking-wider">Total Items</p>
                        <p className="text-2xl font-bold text-brand-text">{stats.total}</p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                        <CheckCircle2 size={22} className="text-green-600" />
                    </div>
                    <div>
                        <p className="text-brand-muted text-xs font-bold uppercase tracking-wider">Available</p>
                        <p className="text-2xl font-bold text-green-600">{stats.available}</p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                        <X size={22} className="text-red-600" />
                    </div>
                    <div>
                        <p className="text-brand-muted text-xs font-bold uppercase tracking-wider">Unavailable</p>
                        <p className="text-2xl font-bold text-red-600">{stats.unavailable}</p>
                    </div>
                </div>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-100 text-red-700 p-4 rounded-2xl">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <div className="text-sm">
                        <p className="font-bold">Unable to load menu data</p>
                        <p className="text-xs text-red-600 mt-0.5">{error}</p>
                    </div>
                </div>
            )}

            {/* Filters + Table */}
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                {/* Search & Filters Bar */}
                <div className="p-5 border-b border-gray-100">
                    <div className="flex flex-col lg:flex-row gap-4 items-center">
                        {/* Search */}
                        <div className="relative w-full lg:w-96">
                            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-muted" />
                            <input
                                type="text"
                                placeholder="Search menu items..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-orange/20 focus:bg-white focus:border-brand-orange/50 transition-all text-sm"
                            />
                        </div>

                        {/* Category Filter */}
                        <div className="w-full lg:w-56">
                            <Select2
                                options={categoryOptions}
                                value={selectedCategory}
                                onChange={(v) => setSelectedCategory(v)}
                                placeholder="All Categories"
                                leftIcon={<Filter size={16} />}
                            />
                        </div>

                        {/* Availability Filter */}
                        <div className="w-full lg:w-48">
                            <Select2
                                options={availabilityOptions}
                                value={availability}
                                onChange={(v) => setAvailability(v)}
                                placeholder="All Status"
                            />
                        </div>
                    </div>
                </div>

                {/* Data Table */}
                <SkeletonTransition
                    loading={loading}
                    skeleton={<SkeletonPage tableRows={8} />}
                    className="p-6"
                >
                    <DataTable<MenuRecord>
                        data={filteredMenus}
                        columns={columns}
                        keyExtractor={(item) => item.id}
                    />
                </SkeletonTransition>
            </div>

            {/* Add/Edit Modal */}
            <Modal
                isOpen={isAddModalOpen || isEditModalOpen}
                onClose={handleCloseModal}
                title={isEditModalOpen ? 'Edit Menu Item' : 'Add New Menu'}
                maxWidth="lg"
                footer={formFooter}
            >
                {formContent}
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
                            className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
                        >
                            <div className="p-6">
                                {/* Icon */}
                                <div className="flex justify-center mb-4">
                                    {swal.type === 'question' && (
                                        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                                            <AlertCircle size={36} className="text-blue-500" />
                                        </div>
                                    )}
                                    {swal.type === 'success' && (
                                        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                                            <CheckCircle2 size={36} className="text-green-500" />
                                        </div>
                                    )}
                                    {swal.type === 'error' && (
                                        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                                            <X size={36} className="text-red-500" />
                                        </div>
                                    )}
                                    {swal.type === 'warning' && (
                                        <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center">
                                            <AlertTriangle size={36} className="text-yellow-500" />
                                        </div>
                                    )}
                                </div>

                                {/* Text */}
                                <h3 className="text-2xl font-bold text-brand-text text-center mb-2">{swal.title}</h3>
                                <p className="text-brand-muted text-center mb-6">{swal.text}</p>

                                {/* Buttons */}
                                <div className="flex justify-center gap-3">
                                    {swal.showCancel && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                swal.onCancel?.();
                                                setSwal(null);
                                            }}
                                            className="px-6 py-2.5 text-brand-muted bg-gray-100 hover:bg-gray-200 rounded-xl font-semibold transition-colors"
                                        >
                                            {swal.cancelText || 'Cancel'}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (swal.onConfirm) await swal.onConfirm();
                                        }}
                                        disabled={submitting || deleteSubmitting}
                                        className={cn(
                                            'px-6 py-2.5 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2',
                                            swal.type === 'error'
                                                ? 'bg-red-500 hover:bg-red-600'
                                                : swal.type === 'warning'
                                                    ? 'bg-yellow-500 hover:bg-yellow-600'
                                                    : swal.type === 'success'
                                                        ? 'bg-green-500 hover:bg-green-600'
                                                        : 'bg-brand-orange hover:opacity-90',
                                            'disabled:opacity-50'
                                        )}
                                    >
                                        {(submitting || deleteSubmitting) && <Loader2 size={16} className="animate-spin" />}
                                        {swal.confirmText || 'OK'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default Menu;
