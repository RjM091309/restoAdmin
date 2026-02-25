import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    Filter,
    Plus,
    Edit2,
    Trash2,
    UtensilsCrossed,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    X,
    AlertCircle,
    Loader2,
    ImageIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { Select2 } from '../ui/Select2';
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '../ui/Skeleton';
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
import { type Branch } from '../partials/Header';

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
    const branchId = selectedBranch ? String(selectedBranch.id) : 'all';

    // ----- Data -----
    const [menus, setMenus] = useState<MenuRecord[]>([]);
    const [categories, setCategories] = useState<MenuCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ----- Filters -----
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [availFilter, setAvailFilter] = useState<string>('all');

    // ----- Modals -----
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<MenuRecord | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [swal, setSwal] = useState<SwalState>(null);

    // ----- Form -----
    const [formName, setFormName] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formCategory, setFormCategory] = useState('');
    const [formPrice, setFormPrice] = useState('');
    const [formAvailable, setFormAvailable] = useState(true);
    const [formImage, setFormImage] = useState<File | null>(null);
    const [formImagePreview, setFormImagePreview] = useState<string | null>(null);

    // ==================== Data fetching ====================
    const refreshData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [menuData, catData] = await Promise.all([
                getMenus(branchId),
                getMenuCategories(branchId),
            ]);
            setMenus(Array.isArray(menuData) ? menuData : []);
            setCategories(Array.isArray(catData) ? catData : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load menu data');
            setMenus([]);
        } finally {
            setLoading(false);
        }
    }, [branchId]);

    useEffect(() => {
        refreshData();
        setSearchTerm('');
        setSelectedCategory('all');
        setAvailFilter('all');
    }, [refreshData]);

    // ==================== Filtering ====================
    const filteredMenus = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return menus.filter((m) => {
            const matchSearch = !term || m.name.toLowerCase().includes(term) || (m.description && m.description.toLowerCase().includes(term)) || m.categoryName.toLowerCase().includes(term);
            const matchCat = selectedCategory === 'all' || m.categoryId === selectedCategory;
            const matchAvail = availFilter === 'all' || (availFilter === 'available' ? m.isAvailable : !m.isAvailable);
            return matchSearch && matchCat && matchAvail;
        });
    }, [menus, searchTerm, selectedCategory, availFilter]);

    // ==================== Stats ====================
    const stats = useMemo(() => ({
        total: menus.length,
        available: menus.filter((m) => m.isAvailable).length,
        unavailable: menus.filter((m) => !m.isAvailable).length,
        categories: new Set(menus.map((m) => m.categoryId).filter(Boolean)).size,
    }), [menus]);

    // ==================== Form helpers ====================
    const resetForm = () => {
        setFormName(''); setFormDesc(''); setFormCategory(''); setFormPrice('');
        setFormAvailable(true); setFormImage(null); setFormImagePreview(null);
    };

    const openCreate = () => {
        resetForm();
        setIsCreateOpen(true);
    };

    const openEdit = (item: MenuRecord) => {
        setFormName(item.name);
        setFormDesc(item.description || '');
        setFormCategory(item.categoryId || '');
        setFormPrice(String(item.price));
        setFormAvailable(item.isAvailable);
        setFormImage(null);
        setFormImagePreview(item.imageUrl ? resolveImageUrl(item.imageUrl) : null);
        setEditingItem(item);
    };

    const closeModal = () => {
        if (submitting) return;
        setIsCreateOpen(false);
        setEditingItem(null);
        resetForm();
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
            setSwal({ type: 'warning', title: 'Name Required', text: 'Please provide a menu item name.', onConfirm: () => setSwal(null) });
            return;
        }
        if (!formPrice || Number(formPrice) <= 0) {
            setSwal({ type: 'warning', title: 'Price Required', text: 'Please provide a valid price.', onConfirm: () => setSwal(null) });
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
                setSwal({ type: 'success', title: 'Updated!', text: `"${formName.trim()}" has been updated.`, onConfirm: () => setSwal(null) });
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
                setSwal({ type: 'success', title: 'Created!', text: `"${formName.trim()}" has been added.`, onConfirm: () => setSwal(null) });
            }
            closeModal();
            await refreshData();
        } catch (e) {
            setSwal({ type: 'error', title: 'Error', text: e instanceof Error ? e.message : 'Operation failed', onConfirm: () => setSwal(null) });
        } finally {
            setSubmitting(false);
        }
    };

    // ==================== Delete ====================
    const confirmDelete = (item: MenuRecord) => {
        setSwal({
            type: 'question',
            title: 'Delete Menu Item?',
            text: `Are you sure you want to delete "${item.name}"? This cannot be undone.`,
            showCancel: true,
            confirmText: 'Yes, Delete',
            onConfirm: async () => {
                setSwal(null);
                try {
                    await deleteMenu(item.id);
                    await refreshData();
                    setSwal({ type: 'success', title: 'Deleted!', text: `"${item.name}" has been removed.`, onConfirm: () => setSwal(null) });
                } catch (e) {
                    setSwal({ type: 'error', title: 'Error', text: e instanceof Error ? e.message : 'Delete failed', onConfirm: () => setSwal(null) });
                }
            },
            onCancel: () => setSwal(null),
        });
    };

    // ==================== Table columns ====================
    const columns: ColumnDef<MenuRecord>[] = useMemo(() => [
        {
            header: 'Menu Item',
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
                        {item.description && <p className="text-[10px] text-brand-muted truncate max-w-[200px]">{item.description}</p>}
                    </div>
                </div>
            ),
        },
        {
            header: 'Category',
            render: (item) => (
                <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded-lg">{item.categoryName}</span>
            ),
        },
        {
            header: 'Price',
            render: (item) => (
                <span className="text-sm font-bold text-brand-text">₱{Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            ),
        },
        {
            header: 'Status',
            render: (item) => (
                <span className={cn(
                    "text-xs font-bold px-2 py-1 rounded-lg",
                    item.isAvailable ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                )}>
                    {item.isAvailable ? 'Available' : 'Unavailable'}
                </span>
            ),
        },
        {
            header: 'Actions',
            className: 'text-right',
            render: (item) => (
                <div className="flex justify-end items-center gap-2">
                    <button
                        onClick={() => openEdit(item)}
                        className="p-2 text-brand-muted hover:text-brand-orange hover:bg-brand-orange/10 transition-colors rounded-lg"
                        title="Edit Item"
                    >
                        <Edit2 size={16} />
                    </button>
                    <button
                        onClick={() => confirmDelete(item)}
                        className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
                        title="Delete Item"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            ),
        },
    ], []);

    // ==================== Modal form content ====================
    const modalContent = (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
                <div>
                    <label className="block text-sm font-bold text-brand-text mb-2">Item Name *</label>
                    <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="e.g. Chicken Adobo"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-brand-text mb-2">Price *</label>
                    <input
                        type="number"
                        value={formPrice}
                        onChange={(e) => setFormPrice(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-5">
                <div>
                    <label className="block text-sm font-bold text-brand-text mb-2">Category</label>
                    <Select2
                        options={[{ value: '', label: 'Uncategorized' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                        value={formCategory || ''}
                        onChange={(v) => setFormCategory(v ? String(v) : '')}
                        placeholder="Select category"
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-brand-text mb-2">Availability</label>
                    <div className="flex gap-4 mt-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="avail" checked={formAvailable} onChange={() => setFormAvailable(true)} className="w-4 h-4 text-green-500 focus:ring-green-500/20 cursor-pointer" />
                            <span className="text-sm font-bold text-brand-text">Available</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="avail" checked={!formAvailable} onChange={() => setFormAvailable(false)} className="w-4 h-4 text-red-500 focus:ring-red-500/20 cursor-pointer" />
                            <span className="text-sm font-bold text-brand-text">Unavailable</span>
                        </label>
                    </div>
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-brand-text mb-2">Description</label>
                <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="Short description..."
                    rows={2}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400 resize-none"
                />
            </div>

            <div>
                <label className="block text-sm font-bold text-brand-text mb-2">Image</label>
                <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-200 shrink-0">
                        {formImagePreview ? (
                            <img src={formImagePreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <ImageIcon size={24} className="text-brand-muted" />
                        )}
                    </div>
                    <div>
                        <input type="file" accept="image/*" onChange={handleImageChange} className="text-sm text-brand-muted file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-brand-orange/10 file:text-brand-orange hover:file:bg-brand-orange/20 file:cursor-pointer cursor-pointer" />
                        <p className="text-[10px] text-brand-muted mt-1">Max 5MB. JPG, PNG or WebP.</p>
                    </div>
                </div>
            </div>
        </div>
    );

    // ==================== RENDER ====================
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
                            <SkeletonTable columns={5} rows={10} />
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
                        {/* Top bar: Filter + Search + Action */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="bg-white p-3 rounded-xl shadow-sm">
                                    <Filter size={18} className="text-brand-muted" />
                                </div>
                                <div className="relative">
                                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                                    <input
                                        type="text"
                                        placeholder="Search menu..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-orange/20 outline-none"
                                    />
                                </div>
                                <Select2
                                    options={[{ value: 'all', label: 'All Categories' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                                    value={selectedCategory}
                                    onChange={(v) => setSelectedCategory(v ? String(v) : 'all')}
                                    placeholder="All Categories"
                                    className="w-48"
                                />
                                <Select2
                                    options={[
                                        { value: 'all', label: 'All Status' },
                                        { value: 'available', label: 'Available' },
                                        { value: 'unavailable', label: 'Unavailable' },
                                    ]}
                                    value={availFilter}
                                    onChange={(v) => setAvailFilter(v ? String(v) : 'all')}
                                    placeholder="All Status"
                                    className="w-44"
                                />
                            </div>
                            <button
                                onClick={openCreate}
                                className="bg-brand-orange text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-brand-orange/20 hover:bg-brand-orange/90 transition-all"
                            >
                                <Plus size={18} />
                                Add New Item
                            </button>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-3 bg-red-50 border border-red-100 text-red-700 p-4 rounded-2xl">
                                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                                <div className="text-sm">
                                    <p className="font-bold">Unable to load menu</p>
                                    <p className="text-xs text-red-600 mt-0.5">{error}</p>
                                </div>
                            </div>
                        )}

                        {/* Stat Cards */}
                        <div className="grid grid-cols-4 gap-6">
                            <div className="bg-white p-6 rounded-2xl shadow-sm">
                                <p className="text-brand-muted text-sm font-medium mb-1">Total Items</p>
                                <h3 className="text-3xl font-bold">{stats.total}</h3>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm">
                                <p className="text-brand-muted text-sm font-medium mb-1">Available</p>
                                <h3 className="text-3xl font-bold text-green-500">{stats.available}</h3>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm">
                                <p className="text-brand-muted text-sm font-medium mb-1">Unavailable</p>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-3xl font-bold text-red-500">{stats.unavailable}</h3>
                                    {stats.unavailable > 0 && <AlertTriangle size={18} className="text-red-500" />}
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm">
                                <p className="text-brand-muted text-sm font-medium mb-1">Categories</p>
                                <h3 className="text-3xl font-bold">{stats.categories}</h3>
                            </div>
                        </div>

                        {/* Data Table */}
                        <DataTable
                            data={filteredMenus}
                            columns={columns}
                            keyExtractor={(item) => item.id}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create / Edit Modal */}
            <Modal
                isOpen={isCreateOpen || !!editingItem}
                onClose={closeModal}
                title={editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
                maxWidth="lg"
                footer={
                    <div className="flex items-center justify-end gap-3">
                        <button
                            onClick={closeModal}
                            disabled={submitting}
                            className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-orange shadow-lg shadow-brand-orange/30 hover:bg-brand-orange/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                        >
                            {submitting && <Loader2 size={16} className="animate-spin" />}
                            {editingItem ? 'Save Changes' : 'Save Item'}
                        </button>
                    </div>
                }
            >
                {modalContent}
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
                                        Cancel
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
                                    {swal.confirmText || 'OK'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
