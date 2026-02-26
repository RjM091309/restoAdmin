import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    Filter,
    Plus,
    Receipt,
    Eye,
    CheckCircle2,
    XCircle,
    X,
    AlertTriangle,
    AlertCircle,
    Loader2,
    Trash2,
    Clock,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { Select2 } from '../ui/Select2';
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '../ui/Skeleton';
import {
    getOrders,
    getOrderItems,
    createOrder,
    updateOrderStatus,
    ORDER_STATUS,
    type OrderRecord,
    type OrderItemRecord,
} from '../../services/orderService';
import { getMenus, type MenuRecord } from '../../services/menuService';
import { type Branch } from '../partials/Header';

// ---- Props & types ----
interface OrdersProps {
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

type NewOrderItem = {
    menuId: string;
    name: string;
    unitPrice: number;
    qty: number;
};

export const Orders: React.FC<OrdersProps> = ({ selectedBranch }) => {
    const { t } = useTranslation();
    const branchId = selectedBranch ? String(selectedBranch.id) : 'all';

    // ----- Data -----
    const [orders, setOrders] = useState<OrderRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ----- Filters -----
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // ----- Detail modal -----
    const [detailOrder, setDetailOrder] = useState<OrderRecord | null>(null);
    const [detailItems, setDetailItems] = useState<OrderItemRecord[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    // ----- Status update -----
    const [statusSubmitting, setStatusSubmitting] = useState(false);
    const [swal, setSwal] = useState<SwalState>(null);

    // ----- New order modal -----
    const [newOrderOpen, setNewOrderOpen] = useState(false);
    const [newOrderSubmitting, setNewOrderSubmitting] = useState(false);
    const [newOrderMenus, setNewOrderMenus] = useState<MenuRecord[]>([]);
    const [newOrderLoadingRefs, setNewOrderLoadingRefs] = useState(false);
    const [newOrderNo, setNewOrderNo] = useState('');
    const [newOrderType, setNewOrderType] = useState<'DINE_IN' | 'TAKE_OUT' | 'DELIVERY'>('DINE_IN');
    const [newOrderItems, setNewOrderItems] = useState<NewOrderItem[]>([]);
    const [newOrderSelectedMenuId, setNewOrderSelectedMenuId] = useState<string>('');
    const [newOrderQty, setNewOrderQty] = useState<number>(1);

    // ==================== Helper ====================
    const getStatusLabel = (status: number) => {
        switch (Number(status)) {
            case ORDER_STATUS.PENDING: return t('orders.pending');
            case ORDER_STATUS.CONFIRMED: return t('orders.confirmed');
            case ORDER_STATUS.SETTLED: return t('orders.settled');
            case ORDER_STATUS.CANCELLED: return t('orders.cancelled');
            default: return t('orders.unknown');
        }
    };

    // ==================== Data fetching ====================
    const loadOrders = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getOrders(branchId);
            setOrders(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : t('orders.failed_to_load'));
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, [branchId, t]);

    useEffect(() => {
        loadOrders();
        setSearchTerm('');
        setStatusFilter('all');
    }, [loadOrders]);

    // ==================== Filtering ====================
    const filteredOrders = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return orders.filter((order) => {
            const matchStatus = statusFilter === 'all' || String(order.STATUS) === statusFilter;
            const matchSearch = !term || order.ORDER_NO.toLowerCase().includes(term) || (order.TABLE_NUMBER && order.TABLE_NUMBER.toString().includes(term));
            return matchStatus && matchSearch;
        });
    }, [orders, searchTerm, statusFilter]);

    // ==================== Stats ====================
    const stats = useMemo(() => {
        const pending = orders.filter((o) => o.STATUS === ORDER_STATUS.PENDING).length;
        const settled = orders.filter((o) => o.STATUS === ORDER_STATUS.SETTLED).length;
        const totalRevenue = orders.filter((o) => o.STATUS === ORDER_STATUS.SETTLED).reduce((s, o) => s + Number(o.GRAND_TOTAL || 0), 0);
        return { total: orders.length, pending, settled, totalRevenue };
    }, [orders]);

    // ==================== Detail ====================
    const openDetail = async (order: OrderRecord) => {
        setDetailOrder(order);
        setDetailLoading(true);
        setDetailItems([]);
        try {
            const items = await getOrderItems(String(order.IDNo));
            setDetailItems(items);
        } catch {
            setDetailItems([]);
        } finally {
            setDetailLoading(false);
        }
    };

    const closeDetail = () => { setDetailOrder(null); setDetailItems([]); };

    // ==================== Status update ====================
    const confirmUpdateStatus = (order: OrderRecord, newStatus: number) => {
        const label = getStatusLabel(newStatus);
        setSwal({
            type: 'question',
            title: t('orders.swal.update_status_title'),
            text: t('orders.swal.update_status_text', { orderNo: order.ORDER_NO, status: label }),
            showCancel: true,
            confirmText: t('orders.swal.confirm_update'),
            onConfirm: async () => {
                setSwal(null);
                setStatusSubmitting(true);
                try {
                    await updateOrderStatus(String(order.IDNo), newStatus);
                    await loadOrders();
                    if (detailOrder?.IDNo === order.IDNo) setDetailOrder({ ...order, STATUS: newStatus });
                    setSwal({ 
                        type: 'success', 
                        title: t('orders.swal.updated_title'), 
                        text: t('orders.swal.updated_text', { orderNo: order.ORDER_NO, status: label }), 
                        onConfirm: () => setSwal(null) 
                    });
                } catch (e) {
                    setSwal({ 
                        type: 'error', 
                        title: t('orders.swal.error_title'), 
                        text: e instanceof Error ? e.message : t('orders.swal.update_failed'), 
                        onConfirm: () => setSwal(null) 
                    });
                } finally {
                    setStatusSubmitting(false);
                }
            },
            onCancel: () => setSwal(null),
        });
    };

    // ==================== New order ====================
    const generateOrderNo = () => {
        const pad2 = (n: number) => String(n).padStart(2, '0');
        const d = new Date();
        return `ORD-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
    };

    const openNewOrder = () => {
        setNewOrderNo(generateOrderNo());
        setNewOrderType('DINE_IN');
        setNewOrderItems([]);
        setNewOrderSelectedMenuId('');
        setNewOrderQty(1);
        setNewOrderOpen(true);
    };

    const closeNewOrder = () => { if (newOrderSubmitting) return; setNewOrderOpen(false); };

    useEffect(() => {
        if (!newOrderOpen) return;
        let cancelled = false;
        setNewOrderLoadingRefs(true);
        getMenus(branchId)
            .then((menus) => {
                if (cancelled) return;
                setNewOrderMenus((Array.isArray(menus) ? menus : []).filter((m) => m.active && (m.effectiveAvailable ?? m.isAvailable)));
            })
            .catch(() => { if (!cancelled) setNewOrderMenus([]); })
            .finally(() => { if (!cancelled) setNewOrderLoadingRefs(false); });
        return () => { cancelled = true; };
    }, [newOrderOpen, branchId]);

    const newOrderSubtotal = newOrderItems.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);

    const addNewOrderItem = () => {
        if (!newOrderSelectedMenuId) { 
            setSwal({ 
                type: 'warning', 
                title: t('orders.swal.select_item_title'), 
                text: t('orders.swal.select_item_text'), 
                onConfirm: () => setSwal(null) 
            }); 
            return; 
        }
        const qty = Number(newOrderQty);
        if (!Number.isFinite(qty) || qty <= 0) { 
            setSwal({ 
                type: 'warning', 
                title: t('orders.swal.invalid_qty_title'), 
                text: t('orders.swal.invalid_qty_text'), 
                onConfirm: () => setSwal(null) 
            }); 
            return; 
        }
        const menu = newOrderMenus.find((m) => m.id === newOrderSelectedMenuId);
        if (!menu) return;
        setNewOrderItems((prev) => {
            const idx = prev.findIndex((p) => p.menuId === newOrderSelectedMenuId);
            if (idx >= 0) { const copy = [...prev]; copy[idx] = { ...copy[idx], qty: copy[idx].qty + qty }; return copy; }
            return [...prev, { menuId: newOrderSelectedMenuId, name: menu.name, unitPrice: Number(menu.price || 0), qty }];
        });
        setNewOrderSelectedMenuId(''); setNewOrderQty(1);
    };

    const removeNewOrderItem = (menuId: string) => setNewOrderItems((prev) => prev.filter((p) => p.menuId !== menuId));

    const submitNewOrder = async () => {
        if (!newOrderNo.trim()) { 
            setSwal({ 
                type: 'warning', 
                title: t('orders.swal.order_no_required_title'), 
                text: t('orders.swal.order_no_required_text'), 
                onConfirm: () => setSwal(null) 
            }); 
            return; 
        }
        if (newOrderItems.length === 0) { 
            setSwal({ 
                type: 'warning', 
                title: t('orders.swal.add_items_title'), 
                text: t('orders.swal.add_items_text'), 
                onConfirm: () => setSwal(null) 
            }); 
            return; 
        }
        setNewOrderSubmitting(true);
        try {
            const items = newOrderItems.map((it) => ({ menu_id: Number(it.menuId), qty: Number(it.qty), unit_price: Number(it.unitPrice), line_total: Number(it.qty) * Number(it.unitPrice), status: ORDER_STATUS.PENDING }));
            await createOrder({
                ORDER_NO: newOrderNo.trim(), order_no: newOrderNo.trim(),
                BRANCH_ID: branchId, branch_id: branchId,
                TABLE_ID: null, ORDER_TYPE: newOrderType, order_type: newOrderType,
                STATUS: ORDER_STATUS.PENDING, SUBTOTAL: newOrderSubtotal,
                TAX_AMOUNT: 0, SERVICE_CHARGE: 0, DISCOUNT_AMOUNT: 0, GRAND_TOTAL: newOrderSubtotal,
                ORDER_ITEMS: items, items,
            });
            setNewOrderOpen(false);
            await loadOrders();
            setSwal({ 
                type: 'success', 
                title: t('orders.swal.created_title'), 
                text: t('orders.swal.created_text', { orderNo: newOrderNo.trim() }), 
                onConfirm: () => setSwal(null) 
            });
        } catch (e) {
            setSwal({ 
                type: 'error', 
                title: t('orders.swal.error_title'), 
                text: e instanceof Error ? e.message : t('orders.swal.create_failed'), 
                onConfirm: () => setSwal(null) 
            });
        } finally {
            setNewOrderSubmitting(false);
        }
    };

    // ==================== Badges ====================
    const statusBadge = (status: number) => {
        const label = getStatusLabel(status);
        const style = status === ORDER_STATUS.SETTLED ? 'bg-green-100 text-green-600' : status === ORDER_STATUS.CANCELLED ? 'bg-red-100 text-red-600' : status === ORDER_STATUS.CONFIRMED ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600';
        return <span className={cn('text-xs font-bold px-2 py-1 rounded-lg', style)}>{label}</span>;
    };

    const orderTypeBadge = (orderType: string | null | undefined) => {
        if (!orderType) return <span className="text-brand-muted text-sm">—</span>;
        const normalized = orderType.trim().toUpperCase().replace(/\s+/g, '_');
        const label = normalized === 'DINE_IN' ? t('orders.dine_in') : normalized === 'TAKE_OUT' ? t('orders.take_out') : normalized === 'DELIVERY' ? t('orders.delivery') : orderType;
        return <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded-lg">{label}</span>;
    };

    // ==================== Table columns ====================
    const columns: ColumnDef<OrderRecord>[] = useMemo(() => [
        {
            header: t('orders.order_no'),
            render: (order) => (
                <div className="flex items-center gap-3 min-w-[160px]">
                    <Receipt size={16} className="text-brand-muted shrink-0" />
                    <div className="min-w-0">
                        <p className="text-sm font-bold">{order.ORDER_NO}</p>
                        <p className="text-[10px] text-brand-muted">
                            {order.ENCODED_DT ? new Date(order.ENCODED_DT).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </p>
                    </div>
                </div>
            ),
        },
        {
            header: t('orders.table'),
            render: (order) => <span className="text-sm font-bold">{order.TABLE_NUMBER ?? '—'}</span>,
        },
        {
            header: t('orders.type'),
            render: (order) => orderTypeBadge(order.ORDER_TYPE),
        },
        {
            header: t('orders.status'),
            render: (order) => statusBadge(order.STATUS),
        },
        {
            header: t('orders.grand_total'),
            render: (order) => (
                <span className="text-sm font-bold text-brand-text">₱{Number(order.GRAND_TOTAL).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            ),
        },
        {
            header: t('orders.actions'),
            className: 'text-right',
            render: (order) => (
                <div className="flex justify-end items-center gap-2">
                    <button onClick={() => openDetail(order)} className="p-2 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors rounded-lg" title={t('orders.view_details')}>
                        <Eye size={16} />
                    </button>
                    {order.STATUS !== ORDER_STATUS.SETTLED && order.STATUS !== ORDER_STATUS.CANCELLED && (
                        <>
                            <button onClick={() => confirmUpdateStatus(order, ORDER_STATUS.SETTLED)} disabled={statusSubmitting} className="p-2 text-green-600 hover:bg-green-50 transition-colors rounded-lg disabled:opacity-50" title={t('orders.mark_as_settled')}>
                                <CheckCircle2 size={16} />
                            </button>
                            <button onClick={() => confirmUpdateStatus(order, ORDER_STATUS.CANCELLED)} disabled={statusSubmitting} className="p-2 text-red-500 hover:bg-red-50 transition-colors rounded-lg disabled:opacity-50" title={t('orders.cancel_order')}>
                                <XCircle size={16} />
                            </button>
                        </>
                    )}
                </div>
            ),
        },
    ], [statusSubmitting, t]);

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
                            <SkeletonTable columns={6} rows={10} />
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
                                        placeholder={t('orders.search_placeholder')}
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-orange/20 outline-none"
                                    />
                                </div>
                                <Select2
                                    options={[
                                        { value: 'all', label: t('orders.all_statuses') },
                                        { value: String(ORDER_STATUS.PENDING), label: t('orders.pending') },
                                        { value: String(ORDER_STATUS.CONFIRMED), label: t('orders.confirmed') },
                                        { value: String(ORDER_STATUS.SETTLED), label: t('orders.settled') },
                                        { value: String(ORDER_STATUS.CANCELLED), label: t('orders.cancelled') },
                                    ]}
                                    value={statusFilter}
                                    onChange={(v) => setStatusFilter(v ? String(v) : 'all')}
                                    placeholder={t('orders.all_statuses')}
                                    className="w-48"
                                />
                            </div>
                            <button
                                onClick={openNewOrder}
                                className="bg-brand-primary text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all"
                            >
                                <Plus size={18} />
                                {t('orders.new_order')}
                            </button>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-3 bg-red-50 border border-red-100 text-red-700 p-4 rounded-2xl">
                                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                                <div className="text-sm">
                                    <p className="font-bold">{t('orders.unable_to_load')}</p>
                                    <p className="text-xs text-red-600 mt-0.5">{error}</p>
                                </div>
                            </div>
                        )}

                        {/* Stat Cards */}
                        <div className="grid grid-cols-4 gap-6">
                            <div className="bg-white p-6 rounded-2xl shadow-sm">
                                <p className="text-brand-muted text-sm font-medium mb-1">{t('orders.total_orders')}</p>
                                <h3 className="text-3xl font-bold">{stats.total}</h3>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm">
                                <p className="text-brand-muted text-sm font-medium mb-1">{t('orders.pending')}</p>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-3xl font-bold text-orange-500">{stats.pending}</h3>
                                    {stats.pending > 0 && <Clock size={18} className="text-orange-500" />}
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm">
                                <p className="text-brand-muted text-sm font-medium mb-1">{t('orders.settled')}</p>
                                <h3 className="text-3xl font-bold text-green-500">{stats.settled}</h3>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm">
                                <p className="text-brand-muted text-sm font-medium mb-1">{t('orders.revenue')}</p>
                                <h3 className="text-3xl font-bold">₱{stats.totalRevenue.toLocaleString()}</h3>
                            </div>
                        </div>

                        {/* Data Table */}
                        <DataTable
                            data={filteredOrders}
                            columns={columns}
                            keyExtractor={(item) => String(item.IDNo)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* New Order Modal */}
            <Modal
                isOpen={newOrderOpen}
                onClose={closeNewOrder}
                title={t('orders.create_new_order')}
                maxWidth="lg"
                footer={
                    <div className="flex items-center justify-end gap-3">
                        <button onClick={closeNewOrder} disabled={newOrderSubmitting} className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50">
                            {t('orders.cancel')}
                        </button>
                        <button onClick={submitNewOrder} disabled={newOrderSubmitting} className="px-6 py-2.5 rounded-xl font-bold text-white bg-green-600 shadow-lg shadow-green-600/30 hover:bg-green-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2">
                            {newOrderSubmitting && <Loader2 size={16} className="animate-spin" />}
                            {t('orders.create_order_btn')}
                        </button>
                    </div>
                }
            >
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-bold text-brand-text mb-2">{t('orders.order_no_label')}</label>
                            <input type="text" value={newOrderNo} onChange={(e) => setNewOrderNo(e.target.value)} placeholder={t('orders.order_no_placeholder')}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/50 outline-none transition-all placeholder:text-gray-400" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-brand-text mb-2">{t('orders.order_type')}</label>
                            <Select2
                                options={[
                                    { value: 'DINE_IN', label: t('orders.dine_in') },
                                    { value: 'TAKE_OUT', label: t('orders.take_out') },
                                    { value: 'DELIVERY', label: t('orders.delivery') },
                                ]}
                                value={newOrderType}
                                onChange={(v) => setNewOrderType((v as typeof newOrderType) || 'DINE_IN')}
                                placeholder={t('orders.select_type')}
                            />
                        </div>
                    </div>

                    {/* Items section */}
                    <div>
                        <label className="block text-sm font-bold text-brand-text mb-2">{t('orders.order_items')}</label>
                        <div className="grid grid-cols-12 gap-3 items-end">
                            <div className="col-span-7">
                                <Select2
                                    options={newOrderMenus.map((m) => ({ value: m.id, label: `${m.name} — ₱${Number(m.price).toLocaleString()}` }))}
                                    value={newOrderSelectedMenuId || null}
                                    onChange={(v) => setNewOrderSelectedMenuId(v ? String(v) : '')}
                                    placeholder={newOrderLoadingRefs ? t('orders.loading_menu') : t('orders.select_item')}
                                    disabled={newOrderLoadingRefs}
                                />
                            </div>
                            <div className="col-span-2">
                                <input type="number" min={1} value={newOrderQty} onChange={(e) => setNewOrderQty(Number(e.target.value))}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-orange/20 outline-none transition-all" />
                            </div>
                            <div className="col-span-3">
                                <button type="button" onClick={addNewOrderItem} disabled={newOrderLoadingRefs}
                                    className="w-full px-3 py-3 rounded-xl bg-brand-primary text-white font-bold text-sm hover:bg-brand-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-1">
                                    <Plus size={14} /> {t('orders.add')}
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 border border-gray-100 rounded-xl overflow-hidden bg-white">
                            {newOrderItems.length === 0 ? (
                                <div className="p-4 text-sm text-brand-muted text-center">{t('orders.no_items_added')}</div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-bold text-brand-muted text-xs">{t('orders.item')}</th>
                                            <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">{t('orders.qty')}</th>
                                            <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">{t('orders.unit')}</th>
                                            <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">{t('orders.line_total')}</th>
                                            <th className="px-4 py-2 w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {newOrderItems.map((it) => (
                                            <tr key={it.menuId}>
                                                <td className="px-4 py-2 font-medium">{it.name}</td>
                                                <td className="px-4 py-2 text-right">{it.qty}</td>
                                                <td className="px-4 py-2 text-right">₱{Number(it.unitPrice).toLocaleString()}</td>
                                                <td className="px-4 py-2 text-right font-bold">₱{Number(it.qty * it.unitPrice).toLocaleString()}</td>
                                                <td className="px-4 py-2 text-right">
                                                    <button onClick={() => removeNewOrderItem(it.menuId)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {newOrderItems.length > 0 && (
                            <div className="mt-3 flex justify-end text-sm text-brand-text">
                                {t('orders.grand_total')}: <span className="font-bold text-brand-orange text-lg ml-2">₱{newOrderSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            {/* Detail Modal */}
            <Modal isOpen={!!detailOrder} onClose={closeDetail} title={detailOrder ? `${t('orders.order_no')} ${detailOrder.ORDER_NO}` : t('orders.view_details')} maxWidth="lg">
                {detailOrder && (
                    <div className="space-y-5">
                        <div className="flex flex-wrap gap-6">
                            <div>
                                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">{t('orders.status')}</p>
                                <div className="mt-1">{statusBadge(detailOrder.STATUS)}</div>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">{t('orders.type')}</p>
                                <div className="mt-1">{orderTypeBadge(detailOrder.ORDER_TYPE)}</div>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">{t('orders.table')}</p>
                                <p className="text-sm font-bold mt-1">{detailOrder.TABLE_NUMBER ?? '—'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">{t('orders.grand_total')}</p>
                                <p className="text-lg font-bold text-brand-orange mt-1">₱{Number(detailOrder.GRAND_TOTAL).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-brand-text mb-2">{t('orders.order_items')}</label>
                            {detailLoading ? (
                                <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-brand-orange" /></div>
                            ) : detailItems.length === 0 ? (
                                <p className="text-sm text-brand-muted py-4">{t('orders.no_items_added')}</p>
                            ) : (
                                <div className="border border-gray-100 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-2 text-left font-bold text-brand-muted text-xs">{t('orders.item')}</th>
                                                <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">{t('orders.qty')}</th>
                                                <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">{t('orders.unit')}</th>
                                                <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">{t('orders.line_total')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {detailItems.map((item) => (
                                                <tr key={item.IDNo}>
                                                    <td className="px-4 py-2">{item.MENU_NAME ?? `Menu #${item.MENU_ID}`}</td>
                                                    <td className="px-4 py-2 text-right">{item.QTY}</td>
                                                    <td className="px-4 py-2 text-right">₱{Number(item.UNIT_PRICE).toLocaleString()}</td>
                                                    <td className="px-4 py-2 text-right font-bold">₱{Number(item.LINE_TOTAL).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {detailOrder.STATUS !== ORDER_STATUS.SETTLED && detailOrder.STATUS !== ORDER_STATUS.CANCELLED && (
                            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                                <button onClick={() => { closeDetail(); confirmUpdateStatus(detailOrder, ORDER_STATUS.SETTLED); }} disabled={statusSubmitting}
                                    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                    <CheckCircle2 size={16} /> {t('orders.mark_as_settled')}
                                </button>
                                <button onClick={() => { closeDetail(); confirmUpdateStatus(detailOrder, ORDER_STATUS.CANCELLED); }} disabled={statusSubmitting}
                                    className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-bold text-sm hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                    <XCircle size={16} /> {t('orders.cancel_order')}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* SweetAlert-style popup */}
            <AnimatePresence>
                {swal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-[100] p-4">
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
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
                                    <button onClick={() => { swal.onCancel?.(); setSwal(null); }} className="px-6 py-2.5 bg-gray-100 text-brand-muted rounded-xl font-bold hover:bg-gray-200 transition-all">{t('orders.cancel')}</button>
                                )}
                                <button onClick={async () => { if (swal.onConfirm) await swal.onConfirm(); }}
                                    className={cn('px-6 py-2.5 text-white rounded-xl font-bold transition-all',
                                        swal.type === 'error' ? 'bg-red-500 hover:bg-red-600' : swal.type === 'success' ? 'bg-green-500 hover:bg-green-600' : swal.type === 'question' ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-orange hover:opacity-90')}>
                                    {swal.confirmText || t('orders.swal.ok')}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
