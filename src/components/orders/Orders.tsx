import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
    Pencil,
    Check,
    ChevronLeft,
    ChevronRight,
    ScanLine,
    Camera,
    Upload,
    RefreshCw,
    History,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { Select2 } from '../ui/Select2';
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '../ui/Skeleton';
import { toast } from 'sonner';
import {
    getOrders,
    getOrderItems,
    getOrderById,
    createOrder,
    createManualSettledOrder,
    updateOrderStatus,
    deleteOrderItem,
    updateOrderItemQuantity,
    addItemsToOrder,
    InventoryInsufficientError,
    ORDER_STATUS,
    type OrderRecord,
    type OrderItemRecord,
    type CreateOrderItemPayload,
} from '../../services/orderService';
import { getMenus, type MenuRecord } from '../../services/menuService';
import { compressReceiptImage, fetchReceiptScannerGeminiKey } from '../../services/receiptScannerService';
import { extractOrderLinesFromReceiptImage, type ReceiptOrderExtractionResult } from '../../services/receiptOrderExtraction';
import { ReceiptOrderBlockCard } from './ReceiptOrderBlockCard';
import { bestMenuMatchForReceiptLine } from '../../services/receiptOrderMenuMatch';
import { type Branch } from '../partials/Header';
import { useCrudPermissions } from '../../hooks/useCrudPermissions';
import { useUser } from '../../context/UserContext';
import {
    fetchReceiptScanHistoryList,
    fetchReceiptScanHistoryById,
    saveReceiptScanHistory,
    type ReceiptScanHistoryListRow,
    type ReceiptScanHistoryDetail,
} from '../../services/receiptScanHistoryService';

// ---- Props & types ----
interface OrdersProps {
    selectedBranch: Branch | null;
    dateRange: {
        start: string;
        end: string;
    };
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

export const Orders: React.FC<OrdersProps> = ({ selectedBranch, dateRange }) => {
    const { t } = useTranslation();
    const { user } = useUser();
    const isAdmin = user?.permissions === 1;

    // Prefer URL branchId to stay consistent with Header behavior (opens new tab with ?branchId=...).
    // Fallback to selectedBranch, then 'all'.
    const branchIdFromUrl = new URLSearchParams(window.location.search).get('branchId');
    const branchId = selectedBranch ? String(selectedBranch.id) : (branchIdFromUrl ? String(branchIdFromUrl) : 'all');

    // Only admin can operate in "all branches" mode; non-admins should never see branch chooser here.
    const isAllBranches = isAdmin && branchId === 'all';

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
    const [detailRoomChargeUnit, setDetailRoomChargeUnit] = useState<number>(0);

    // ----- Status update & item actions -----
    const [statusSubmitting, setStatusSubmitting] = useState(false);
    const [itemRemoving, setItemRemoving] = useState(false);
    const [itemUpdating, setItemUpdating] = useState(false);
    const [editingItemId, setEditingItemId] = useState<number | null>(null);
    const [editingQty, setEditingQty] = useState<number>(1);
    const [swal, setSwal] = useState<SwalState>(null);

    // ----- New order modal -----
    const [newOrderOpen, setNewOrderOpen] = useState(false);
    const [newOrderSubmitting, setNewOrderSubmitting] = useState(false);
    const [newOrderMenus, setNewOrderMenus] = useState<MenuRecord[]>([]);
    const [newOrderLoadingRefs, setNewOrderLoadingRefs] = useState(false);
    const [newOrderNo, setNewOrderNo] = useState('');
    const [newOrderType, setNewOrderType] = useState<'DINE_IN' | 'TAKE_OUT' | 'DELIVERY'>('DINE_IN');
    const [newOrderTableId, setNewOrderTableId] = useState<string>('');
    const [branchTables, setBranchTables] = useState<{ value: string; label: string }[]>([]);
    const [newOrderItems, setNewOrderItems] = useState<NewOrderItem[]>([]);
    const [newOrderSelectedMenuId, setNewOrderSelectedMenuId] = useState<string>('');
    const [newOrderQty, setNewOrderQty] = useState<number>(1);

    // ----- Manual order modal (settled immediately) -----
    const [manualOrderOpen, setManualOrderOpen] = useState(false);
    const [manualOrderSubmitting, setManualOrderSubmitting] = useState(false);
    const [manualOrderMenus, setManualOrderMenus] = useState<MenuRecord[]>([]);
    const [manualOrderLoadingRefs, setManualOrderLoadingRefs] = useState(false);
    const [manualOrderNo, setManualOrderNo] = useState('');
    const [manualOrderBranchId, setManualOrderBranchId] = useState<string>('');
    const [manualBranchOptions, setManualBranchOptions] = useState<{ value: string; label: string }[]>([]);
    const [manualOrderType, setManualOrderType] = useState<'DINE_IN' | 'TAKE_OUT' | 'DELIVERY'>('DINE_IN');
    const [manualOrderTableId, setManualOrderTableId] = useState<string>('');
    const [manualBranchTables, setManualBranchTables] = useState<{ value: string; label: string }[]>([]);
    const [manualBranchTablesRoomChargeById, setManualBranchTablesRoomChargeById] = useState<Record<string, number>>({});
    const [manualRoomChargeQty, setManualRoomChargeQty] = useState<number>(1);
    const [manualOrderItems, setManualOrderItems] = useState<NewOrderItem[]>([]);
    const [manualMenuQuery, setManualMenuQuery] = useState('');
    const [manualRowFlash, setManualRowFlash] = useState<{ menuId: string; nonce: number } | null>(null);
    const [manualPaymentMethod, setManualPaymentMethod] = useState<'CASH' | 'CARD' | 'GCASH' | 'BANK'>('CASH');
    const [manualPaymentRef, setManualPaymentRef] = useState<string>('');
    const [manualDiscountAmount, setManualDiscountAmount] = useState<string>('0');
    const [manualMenuPage, setManualMenuPage] = useState(1);
    const [manualOrderDate, setManualOrderDate] = useState<string>('');

    // ----- Receipt scan → new order -----
    const [receiptOrderOpen, setReceiptOrderOpen] = useState(false);
    const [receiptOrderNo, setReceiptOrderNo] = useState('');
    const [receiptOrderType, setReceiptOrderType] = useState<'DINE_IN' | 'TAKE_OUT' | 'DELIVERY'>('DINE_IN');
    const [receiptOrderTableId, setReceiptOrderTableId] = useState('');
    const [receiptOrderBranchId, setReceiptOrderBranchId] = useState('');
    const [receiptOrderDate, setReceiptOrderDate] = useState<string>('');
    const [receiptOrderMenus, setReceiptOrderMenus] = useState<MenuRecord[]>([]);
    const [receiptOrderMenusLoading, setReceiptOrderMenusLoading] = useState(false);
    const [receiptBranchTables, setReceiptBranchTables] = useState<{ value: string; label: string }[]>([]);
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
    const [receiptExtracting, setReceiptExtracting] = useState(false);
    const [receiptError, setReceiptError] = useState<string | null>(null);
    const [receiptExtractResult, setReceiptExtractResult] = useState<ReceiptOrderExtractionResult | null>(null);
    const [receiptRows, setReceiptRows] = useState<
        {
            id: string;
            extractedName: string;
            menuSelection: string;
            qty: number;
            receiptLineTotal: number;
            menuId: string | null;
            orderId: number;
        }[]
    >([]);
    const [receiptSubmitting, setReceiptSubmitting] = useState(false);
    const receiptFileInputRef = useRef<HTMLInputElement>(null);
    const receiptCameraInputRef = useRef<HTMLInputElement>(null);

    const [receiptHistoryOpen, setReceiptHistoryOpen] = useState(false);
    const [receiptHistoryRows, setReceiptHistoryRows] = useState<ReceiptScanHistoryListRow[]>([]);
    const [receiptHistoryLoading, setReceiptHistoryLoading] = useState(false);
    const [receiptHistoryDetailOpen, setReceiptHistoryDetailOpen] = useState(false);
    const [receiptHistoryDetail, setReceiptHistoryDetail] = useState<ReceiptScanHistoryDetail | null>(null);
    const [receiptHistoryDetailLoading, setReceiptHistoryDetailLoading] = useState(false);

    // ----- Add items to existing order (detail modal) -----
    const [detailMenus, setDetailMenus] = useState<MenuRecord[]>([]);
    const [detailMenusLoading, setDetailMenusLoading] = useState(false);
    const [detailSelectedMenuId, setDetailSelectedMenuId] = useState<string>('');
    const [detailAddQty, setDetailAddQty] = useState<number>(1);
    const [detailAdding, setDetailAdding] = useState(false);

  const { canCreate, canUpdate, canDelete } = useCrudPermissions();

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
            const raw = Array.isArray(data) ? data : [];
            // Defensive: backend list must be 1 row per order ID. If billing JOIN ever duplicates again,
            // dedupe by IDNo so React keys stay unique and detail rows stay sane.
            const seen = new Map<number, OrderRecord>();
            for (const o of raw) {
                const id = Number(o.IDNo);
                if (!Number.isFinite(id)) continue;
                if (!seen.has(id)) seen.set(id, o);
            }
            setOrders([...seen.values()]);
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

    // ==================== Tables for this branch (for new order) ====================
    useEffect(() => {
        let cancelled = false;
        const fetchTablesForBranch = async () => {
            try {
                const params = new URLSearchParams();
                if (branchId && branchId !== 'all') {
                    params.set('branch_id', branchId);
                }
                const qs = params.toString();
                const res = await fetch(`/data-api/restaurant_tables${qs ? `?${qs}` : ''}`, {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
                const json = await res.json();
                if (!res.ok) {
                    throw new Error(json.error || json.message || 'Failed to load tables');
                }
                const raw = json.data ?? json;
                const mapped: { value: string; label: string }[] = (Array.isArray(raw) ? raw : [])
                    .filter((t: any) => t.STATUS === 1) // available only
                    .map((t: any) => ({
                        value: String(t.IDNo),
                        label: `Table ${t.TABLE_NUMBER}`,
                    }));
                if (!cancelled) {
                    setBranchTables(mapped);
                }
            } catch (e) {
                if (!cancelled) {
                    console.error('Failed to load tables for new order', e);
                    setBranchTables([]);
                }
            }
        };
        fetchTablesForBranch();
        return () => {
            cancelled = true;
        };
    }, [branchId]);

    // ==================== Filtering ====================
    const MANILA_TIMEZONE = 'Asia/Manila';
    const MANILA_UTC_OFFSET_HOURS = 8; // Asia/Manila is UTC+8 (no DST)

    const parseManilaLocalDateTimeToUtcMs = (value: string): number | null => {
        // Supports:
        // - 'YYYY-MM-DD HH:mm:ss'
        // - 'YYYY-MM-DD HH:mm:ss.SSS' (fractional seconds)
        const m = value.match(
            /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d+)?$/,
        );
        if (!m) return null;

        const year = Number(m[1]);
        const monthIndex = Number(m[2]) - 1;
        const day = Number(m[3]);
        const hour = Number(m[4]);
        const minute = Number(m[5]);
        const second = Number(m[6]);
        const ms = m[7] ? Number(m[7].slice(1).padEnd(3, '0').slice(0, 3)) : 0;

        // Convert Manila local -> UTC instant (UTC = local - offset)
        return Date.UTC(
            year,
            monthIndex,
            day,
            hour - MANILA_UTC_OFFSET_HOURS,
            minute,
            second,
            ms,
        );
    };

    const parseEncodedDtToUtcMs = (encoded: string): number | null => {
        if (!encoded) return null;

        // If timezone info is present, rely on JS Date parsing.
        // Examples:
        // - '...Z'
        // - '...+08:00'
        // - '...-05:30'
        if (/[zZ]$/.test(encoded) || /[+-]\d{2}:?\d{2}$/.test(encoded)) {
            const d = new Date(encoded);
            return Number.isNaN(d.getTime()) ? null : d.getTime();
        }

        // If backend returns MySQL-style without timezone (space) or ISO without timezone (T):
        // - 'YYYY-MM-DD HH:mm:ss'
        // - 'YYYY-MM-DDTHH:mm:ss'
        if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(encoded)) {
            const manilaMs = parseManilaLocalDateTimeToUtcMs(encoded);
            if (manilaMs != null) return manilaMs;
        }

        // Fallback: try to parse as ISO by replacing the space with 'T'
        const d = new Date(encoded.replace(' ', 'T'));
        return Number.isNaN(d.getTime()) ? null : d.getTime();
    };

    const formatEncodedDt = (encoded: string | null | undefined) => {
        if (!encoded) return '—';
        const utcMs = parseEncodedDtToUtcMs(encoded);
        if (utcMs == null) return '—';

        return new Intl.DateTimeFormat(undefined, {
            timeZone: MANILA_TIMEZONE,
            dateStyle: 'short',
            timeStyle: 'short',
        }).format(new Date(utcMs));
    };

    const isWithinDateRange = useCallback((encoded: string | null | undefined) => {
        if (!encoded) return true;
        if (!dateRange.start || !dateRange.end) return true;

        const startMatch = dateRange.start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const endMatch = dateRange.end.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!startMatch || !endMatch) return true;

        // Robust fallback: compare by the date portion only (YYYY-MM-DD).
        // This avoids edge-case exclusions when ENCODED_DT timezone interpretation differs.
        const encodedDateMatch = String(encoded).match(/^(\d{4}-\d{2}-\d{2})[ T]?/);
        if (encodedDateMatch?.[1]) {
            const encodedYmd = encodedDateMatch[1];
            if (encodedYmd >= dateRange.start && encodedYmd <= dateRange.end) return true;
        }

        const encodedMs = parseEncodedDtToUtcMs(encoded);
        if (encodedMs == null) return true;

        const sy = Number(startMatch[1]);
        const sm = Number(startMatch[2]) - 1;
        const sd = Number(startMatch[3]);

        const ey = Number(endMatch[1]);
        const em = Number(endMatch[2]) - 1;
        const ed = Number(endMatch[3]);

        // Manila local -> UTC instants
        const startUtcMs = Date.UTC(sy, sm, sd, 0 - MANILA_UTC_OFFSET_HOURS, 0, 0, 0);
        const endUtcMs = Date.UTC(ey, em, ed, 23 - MANILA_UTC_OFFSET_HOURS, 59, 59, 999);

        return encodedMs >= startUtcMs && encodedMs <= endUtcMs;
    }, [dateRange.start, dateRange.end]);

    const filteredOrders = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();

        const parseOrderNoToMs = (orderNo: string | null | undefined): number | null => {
            // Expected: ORD-YYYYMMDD-HHMMSS (example: ORD-20260330-155527)
            const m = String(orderNo ?? '').match(/^ORD-(\d{8})-(\d{6})/);
            if (!m) return null;

            const ymd = m[1];
            const hhmmss = m[2];
            const year = Number(ymd.slice(0, 4));
            const month = Number(ymd.slice(4, 6)) - 1;
            const day = Number(ymd.slice(6, 8));

            const hour = Number(hhmmss.slice(0, 2));
            const minute = Number(hhmmss.slice(2, 4));
            const second = Number(hhmmss.slice(4, 6));

            // Use Date.UTC so any timezone assumption becomes a constant offset for ordering.
            return Date.UTC(year, month, day, hour, minute, second);
        };

        const filtered = orders.filter((order) => {
            const matchStatus = statusFilter === 'all' || String(order.STATUS) === statusFilter;
            const matchSearch = !term || order.ORDER_NO.toLowerCase().includes(term) || (order.TABLE_NUMBER && order.TABLE_NUMBER.toString().includes(term));
            const matchDate = isWithinDateRange(order.ENCODED_DT);
            return matchStatus && matchSearch && matchDate;
        });

        // Precompute sort keys once (avoids recomputation inside sort comparator).
        const keyed = filtered.map((order) => {
            const orderNoMs = parseOrderNoToMs(order.ORDER_NO);
            const encodedMs = order.ENCODED_DT ? parseEncodedDtToUtcMs(order.ENCODED_DT) : null;
            return {
                order,
                primaryMs: orderNoMs ?? encodedMs,
                encodedMs,
                dbId: Number(order.IDNo),
            };
        });

        keyed.sort((a, b) => {
            const aPrimary = a.primaryMs ?? Number.NEGATIVE_INFINITY;
            const bPrimary = b.primaryMs ?? Number.NEGATIVE_INFINITY;
            if (bPrimary !== aPrimary) return bPrimary - aPrimary;

            // Tie-break by encoded timestamp only when both parse successfully.
            if (a.encodedMs != null && b.encodedMs != null && b.encodedMs !== a.encodedMs) {
                return b.encodedMs - a.encodedMs;
            }

            return b.dbId - a.dbId;
        });

        return keyed.map((k) => k.order);
    }, [orders, searchTerm, statusFilter, isWithinDateRange]);

    // ==================== Stats ====================
    const stats = useMemo(() => {
        const scoped = orders.filter((o) => isWithinDateRange(o.ENCODED_DT));
        const pending = scoped.filter((o) => o.STATUS === ORDER_STATUS.PENDING).length;
        const confirmed = scoped.filter((o) => o.STATUS === ORDER_STATUS.CONFIRMED).length;
        const settled = scoped.filter((o) => o.STATUS === ORDER_STATUS.SETTLED).length;
        const cancelled = scoped.filter((o) => o.STATUS === ORDER_STATUS.CANCELLED).length;
        const totalRevenue = scoped
            .filter((o) => o.STATUS === ORDER_STATUS.SETTLED)
            .reduce((s, o) => s + Number(o.GRAND_TOTAL || 0), 0);
        return { total: scoped.length, pending, confirmed, settled, cancelled, totalRevenue };
    }, [orders, isWithinDateRange]);

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

    // Load ROOM_CHARGE for the selected table so we can render "Room charge"
    // row (derived from SERVICE_CHARGE) with correct qty/unit/line_total.
    useEffect(() => {
        if (!detailOrder) {
            setDetailRoomChargeUnit(0);
            return;
        }

        const status = Number(detailOrder.STATUS);
        const isSettledLike = status === ORDER_STATUS.SETTLED || status === ORDER_STATUS.CANCELLED;
        if (!isSettledLike) {
            setDetailRoomChargeUnit(0);
            return;
        }

        const tableId = detailOrder.TABLE_ID != null ? Number(detailOrder.TABLE_ID) : NaN;
        if (!Number.isFinite(tableId) || tableId <= 0) {
            setDetailRoomChargeUnit(0);
            return;
        }

        let cancelled = false;
        const fetchRoomCharge = async () => {
            try {
                const branchId = detailOrder.BRANCH_ID != null ? String(detailOrder.BRANCH_ID) : '';
                const qs = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';

                const res = await fetch(`/data-api/restaurant_tables${qs}`, {
                    headers: { 'Content-Type': 'application/json' },
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || json?.message || 'Failed to load tables');

                const raw = json.data ?? json;
                const tables = Array.isArray(raw) ? raw : [];
                const table = tables.find((t: any) => Number(t?.IDNo) === tableId);
                const rcRaw = table?.ROOM_CHARGE;
                const rc = rcRaw != null && rcRaw !== '' ? Number(rcRaw) : 0;
                if (!cancelled) setDetailRoomChargeUnit(Number.isFinite(rc) ? rc : 0);
            } catch (e) {
                if (!cancelled) setDetailRoomChargeUnit(0);
            }
        };

        fetchRoomCharge();
        return () => {
            cancelled = true;
        };
    }, [detailOrder?.IDNo, detailOrder?.TABLE_ID, detailOrder?.BRANCH_ID, detailOrder?.STATUS]);

    const detailServiceCharge = detailOrder ? Number(detailOrder.SERVICE_CHARGE ?? 0) : 0;
    const detailIsRoomCharge = detailRoomChargeUnit > 0;
    const detailRoomChargeUnitForRow = detailRoomChargeUnit > 0 ? detailRoomChargeUnit : detailServiceCharge;
    const detailRoomChargeQtyForRow =
        detailRoomChargeUnitForRow > 0 ? Math.max(0.5, Math.round((detailServiceCharge / detailRoomChargeUnitForRow) * 2) / 2) : 0.5;

    // ==================== Remove order item ====================
    const confirmRemoveItem = (item: OrderItemRecord) => {
        if (!detailOrder) return;
        if (itemUpdating) return;
        setSwal({
            type: 'question',
            title: t('orders.swal.remove_item_title'),
            text: t('orders.swal.remove_item_text', { itemName: item.MENU_NAME ?? `Item #${item.MENU_ID}` }),
            showCancel: true,
            confirmText: t('orders.swal.remove_item_confirm'),
            onConfirm: async () => {
                setSwal(null);
                setItemRemoving(true);
                try {
                    await deleteOrderItem(String(item.IDNo));
                    const [refreshed, updatedOrder] = await Promise.all([
                        getOrderItems(String(detailOrder.IDNo)),
                        getOrderById(String(detailOrder.IDNo)),
                    ]);
                    setDetailItems(refreshed);
                    if (updatedOrder) setDetailOrder(updatedOrder);
                    await loadOrders();
                    toast.success(t('orders.swal.remove_item_success'));
                } catch (e) {
                    toast.error(e instanceof Error ? e.message : t('orders.swal.remove_item_failed'));
                } finally {
                    setItemRemoving(false);
                }
            },
            onCancel: () => setSwal(null),
        });
    };

    const startEditItem = (item: OrderItemRecord) => {
        if (itemRemoving || itemUpdating) return;
        setEditingItemId(item.IDNo);
        setEditingQty(Number(item.QTY) || 1);
    };

    const cancelEditItem = () => {
        if (itemUpdating) return;
        setEditingItemId(null);
    };

    const submitEditItem = async (item: OrderItemRecord) => {
        if (!detailOrder) return;
        const qty = Number(editingQty);
        if (!Number.isFinite(qty) || qty <= 0) {
            setSwal({
                type: 'warning',
                title: t('orders.swal.invalid_qty_title'),
                text: t('orders.swal.invalid_qty_text'),
                onConfirm: () => setSwal(null),
            });
            return;
        }
        setItemUpdating(true);
        try {
            await updateOrderItemQuantity(String(item.IDNo), qty);
            const [refreshed, updatedOrder] = await Promise.all([
                getOrderItems(String(detailOrder.IDNo)),
                getOrderById(String(detailOrder.IDNo)),
            ]);
            setDetailItems(refreshed);
            if (updatedOrder) setDetailOrder(updatedOrder);
            await loadOrders();
            toast.success(t('orders.updated_item_qty_success', { itemName: item.MENU_NAME ?? `Item #${item.MENU_ID}` }));
            setEditingItemId(null);
        } catch (e) {
            if (e instanceof InventoryInsufficientError && e.insufficient?.length) {
                const list = e.insufficient.map((i) => t('orders.swal.insufficient_inventory_item', {
                    name: i.ingredientName,
                    required: i.required,
                    available: i.available,
                    unit: i.unit,
                })).join('\n');
                setSwal({
                    type: 'warning',
                    title: t('orders.swal.insufficient_inventory_title'),
                    text: `${t('orders.swal.insufficient_inventory_text')}\n\n${list}`,
                    onConfirm: () => setSwal(null),
                });
            } else {
                toast.error(e instanceof Error ? e.message : t('orders.swal.update_failed'));
            }
        } finally {
            setItemUpdating(false);
        }
    };

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
                    toast.success(t('orders.swal.updated_text', { orderNo: order.ORDER_NO, status: label }));
                } catch (e) {
                    toast.error(e instanceof Error ? e.message : t('orders.swal.update_failed'));
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

    const openManualOrder = () => {
        setManualOrderNo(generateOrderNo());
        setManualOrderType('DINE_IN');
        setManualOrderItems([]);
        setManualMenuQuery('');
        setManualOrderTableId('');
        setManualRoomChargeQty(1);
        setManualPaymentMethod('CASH');
        setManualPaymentRef('');
        // Default: present date only (YYYY-MM-DD), time will be current timestamp.
        // Preserve user's previously selected date across multiple manual orders.
        if (!manualOrderDate) {
            // Use Asia/Manila for consistency with ENCODED_DT generation and filtering.
            const now = new Date();
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Manila',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).formatToParts(now);
            const get = (type: string) => String(parts.find((p) => p.type === type)?.value ?? '0');
            const y = get('year');
            const m = get('month');
            const d = get('day');
            setManualOrderDate(`${y}-${m}-${d}`);
        }
        setManualDiscountAmount('0');
        setManualOrderBranchId('');
        setManualBranchTables([]);
        setManualOrderOpen(true);
    };

    const closeManualOrder = () => { if (manualOrderSubmitting) return; setManualOrderOpen(false); };

    // Branch options for manual order + receipt order (only when viewing ALL branches)
    useEffect(() => {
        if (!manualOrderOpen && !receiptOrderOpen) return;
        if (!isAllBranches) return;
        let cancelled = false;
        const fetchBranches = async () => {
            try {
                const res = await fetch('/branch/', {
                    headers: {
                        'Content-Type': 'application/json',
                        ...(localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {}),
                    },
                });
                const json = await res.json();
                if (!res.ok || json?.success === false) {
                    throw new Error(json?.error || json?.message || 'Failed to load branches');
                }
                const raw = json.data ?? json;
                const mapped = (Array.isArray(raw) ? raw : [])
                    .filter((b: any) => (b.ACTIVE ?? b.active ?? 1) === 1)
                    .map((b: any) => ({
                        value: String(b.IDNo ?? b.id),
                        label: String(b.BRANCH_LABEL ?? b.BRANCH_NAME ?? b.name ?? `Branch ${b.IDNo ?? ''}`),
                    }));
                if (!cancelled) setManualBranchOptions(mapped);
            } catch (e) {
                if (!cancelled) setManualBranchOptions([]);
                console.error('Failed to load branches for manual order', e);
            }
        };
        fetchBranches();
        return () => { cancelled = true; };
    }, [manualOrderOpen, receiptOrderOpen, isAllBranches]);

    const effectiveManualBranchId = isAllBranches ? manualOrderBranchId : branchId;
    const effectiveReceiptBranchId = isAllBranches ? receiptOrderBranchId : branchId;

    // Tables for selected branch (manual order)
    useEffect(() => {
        if (!manualOrderOpen) return;
        if (!effectiveManualBranchId) {
            setManualBranchTables([]);
            setManualBranchTablesRoomChargeById({});
            return;
        }
        let cancelled = false;
        const fetchTablesForManualBranch = async () => {
            try {
                const params = new URLSearchParams();
                if (effectiveManualBranchId && effectiveManualBranchId !== 'all') {
                    params.set('branch_id', effectiveManualBranchId);
                }
                const qs = params.toString();
                const res = await fetch(`/data-api/restaurant_tables${qs ? `?${qs}` : ''}`, {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
                const json = await res.json();
                if (!res.ok) {
                    throw new Error(json.error || json.message || 'Failed to load tables');
                }
                const raw = json.data ?? json;
                const mapped: { value: string; label: string }[] = (Array.isArray(raw) ? raw : [])
                    .filter((t: any) => t.STATUS === 1) // available only
                    .map((t: any) => ({
                        value: String(t.IDNo),
                        label: `Table ${t.TABLE_NUMBER}`,
                    }));
                const roomChargeById: Record<string, number> = {};
                for (const t of (Array.isArray(raw) ? raw : [])) {
                    if (t?.STATUS !== 1) continue;
                    const id = String(t?.IDNo);
                    if (!id) continue;
                    const rcRaw = t?.ROOM_CHARGE;
                    const rc =
                        rcRaw != null && rcRaw !== '' && !Number.isNaN(Number(rcRaw))
                            ? Number(rcRaw)
                            : 0;
                    roomChargeById[id] = rc;
                }

                if (!cancelled) {
                    setManualBranchTables(mapped);
                    setManualBranchTablesRoomChargeById(roomChargeById);
                }
            } catch (e) {
                if (!cancelled) setManualBranchTables([]);
                if (!cancelled) setManualBranchTablesRoomChargeById({});
                console.error('Failed to load tables for manual order', e);
            }
        };
        fetchTablesForManualBranch();
        return () => { cancelled = true; };
    }, [manualOrderOpen, effectiveManualBranchId]);

    // Menus for receipt → order (selected branch)
    useEffect(() => {
        if (!receiptOrderOpen) return;
        if (isAllBranches && !receiptOrderBranchId) {
            setReceiptOrderMenus([]);
            return;
        }
        let cancelled = false;
        setReceiptOrderMenusLoading(true);
        const bid = isAllBranches ? receiptOrderBranchId : branchId;
        getMenus(bid)
            .then((menus) => {
                if (cancelled) return;
                setReceiptOrderMenus((Array.isArray(menus) ? menus : []).filter((m) => m.active && (m.effectiveAvailable ?? m.isAvailable)));
            })
            .catch(() => { if (!cancelled) setReceiptOrderMenus([]); })
            .finally(() => { if (!cancelled) setReceiptOrderMenusLoading(false); });
        return () => { cancelled = true; };
    }, [receiptOrderOpen, isAllBranches, receiptOrderBranchId, branchId]);

    // Tables for receipt order modal
    useEffect(() => {
        if (!receiptOrderOpen) return;
        if (!effectiveReceiptBranchId || effectiveReceiptBranchId === 'all') {
            setReceiptBranchTables([]);
            return;
        }
        let cancelled = false;
        const fetchTables = async () => {
            try {
                const params = new URLSearchParams();
                params.set('branch_id', effectiveReceiptBranchId);
                const res = await fetch(`/data-api/restaurant_tables?${params}`, {
                    headers: { 'Content-Type': 'application/json' },
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || json.message || 'Failed to load tables');
                const raw = json.data ?? json;
                const mapped: { value: string; label: string }[] = (Array.isArray(raw) ? raw : [])
                    .filter((t: any) => t.STATUS === 1)
                    .map((t: any) => ({
                        value: String(t.IDNo),
                        label: `Table ${t.TABLE_NUMBER}`,
                    }));
                if (!cancelled) setReceiptBranchTables(mapped);
            } catch (e) {
                if (!cancelled) setReceiptBranchTables([]);
                console.error('Failed to load tables for receipt order', e);
            }
        };
        fetchTables();
        return () => { cancelled = true; };
    }, [receiptOrderOpen, effectiveReceiptBranchId]);

    // Default room charge qty is always 1 when user selects a table.
    useEffect(() => {
        if (!manualOrderOpen) return;
        setManualRoomChargeQty(1);
    }, [manualOrderTableId, manualOrderOpen]);

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
                TABLE_ID: newOrderTableId ? Number(newOrderTableId) : null,
                ORDER_TYPE: newOrderType, order_type: newOrderType,
                STATUS: ORDER_STATUS.PENDING, SUBTOTAL: newOrderSubtotal,
                TAX_AMOUNT: 0, SERVICE_CHARGE: 0, DISCOUNT_AMOUNT: 0, GRAND_TOTAL: newOrderSubtotal,
                ORDER_ITEMS: items, items,
            });
            setNewOrderOpen(false);
            setNewOrderTableId('');
            await loadOrders();
            toast.success(t('orders.swal.created_text', { orderNo: newOrderNo.trim() }));
        } catch (e) {
            if (e instanceof InventoryInsufficientError && e.insufficient?.length) {
                const list = e.insufficient.map((i) => t('orders.swal.insufficient_inventory_item', {
                    name: i.ingredientName,
                    required: i.required,
                    available: i.available,
                    unit: i.unit,
                })).join('\n');
                setSwal({
                    type: 'warning',
                    title: t('orders.swal.insufficient_inventory_title'),
                    text: `${t('orders.swal.insufficient_inventory_text')}\n\n${list}`,
                    onConfirm: () => setSwal(null),
                });
            } else {
                toast.error(e instanceof Error ? e.message : t('orders.swal.create_failed'));
            }
        } finally {
            setNewOrderSubmitting(false);
        }
    };

    const openReceiptOrder = () => {
        setReceiptOrderNo(generateOrderNo());
        setReceiptOrderType('DINE_IN');
        setReceiptOrderTableId('');
        setReceiptOrderBranchId('');
        setReceiptImage(null);
        setReceiptError(null);
        setReceiptRows([]);
        setReceiptExtractResult(null);
        // Default: present date only (YYYY-MM-DD), time will be current timestamp.
        // Preserve user's previously selected date across multiple receipt orders.
        if (!receiptOrderDate) {
            const now = new Date();
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Manila',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).formatToParts(now);
            const get = (type: string) => String(parts.find((p) => p.type === type)?.value ?? '0');
            const y = get('year');
            const m = get('month');
            const d = get('day');
            setReceiptOrderDate(`${y}-${m}-${d}`);
        }
        setReceiptOrderOpen(true);
    };

    const closeReceiptOrder = () => {
        if (receiptSubmitting || receiptExtracting) return;
        setReceiptOrderOpen(false);
    };

    const runReceiptExtractionOnImage = async (compressedDataUrl: string) => {
        if (isAllBranches && !receiptOrderBranchId) {
            toast.error(t('orders.receipt_select_branch_first'));
            return;
        }
        setReceiptExtracting(true);
        setReceiptError(null);
        try {
            const key = await fetchReceiptScannerGeminiKey();
            const result = await extractOrderLinesFromReceiptImage(compressedDataUrl, key);
            setReceiptExtractResult(result);
            const bid = isAllBranches ? receiptOrderBranchId : branchId;
            const menus = await getMenus(bid).then((m) =>
                (Array.isArray(m) ? m : []).filter((x) => x.active && (x.effectiveAvailable ?? x.isAvailable))
            );
            const rows = result.items.map((item, i) => {
                const match = bestMenuMatchForReceiptLine(item.item_name, menus);
                const qty = Number(item.quantity);
                return {
                    id: `rec-${Date.now()}-${i}`,
                    extractedName: item.item_name,
                    menuSelection: item.menu_selection || '',
                    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
                    receiptLineTotal: Number(item.line_price) || 0,
                    menuId: match ? match.id : null,
                    orderId: Number(item.order_id) > 0 ? Math.floor(Number(item.order_id)) : 1,
                };
            });
            setReceiptRows(rows);
        } catch (e) {
            setReceiptError(e instanceof Error ? e.message : t('orders.receipt_extract_failed'));
            setReceiptRows([]);
            setReceiptExtractResult(null);
        } finally {
            setReceiptExtracting(false);
        }
    };

    const processReceiptFile = (file: File | undefined) => {
        if (!file || !file.type.startsWith('image/')) {
            toast.error(t('orders.receipt_invalid_image'));
            return;
        }
        if (isAllBranches && !receiptOrderBranchId) {
            toast.error(t('orders.receipt_select_branch_first'));
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = reader.result as string;
            setReceiptRows([]);
            setReceiptExtractResult(null);
            let compressed = dataUrl;
            try {
                compressed = await compressReceiptImage(dataUrl);
            } catch {
                /* use original */
            }
            setReceiptImage(compressed);
            await runReceiptExtractionOnImage(compressed);
        };
        reader.readAsDataURL(file);
    };

    const updateReceiptRowMenu = (rowId: string, menuId: string | null) => {
        setReceiptRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, menuId } : r)));
    };

    const updateReceiptRowQty = (rowId: string, qty: number) => {
        setReceiptRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, qty } : r)));
    };

    const receiptTableSelectOptions = isAllBranches ? receiptBranchTables : branchTables;

    const receiptPreviewSubtotal = useMemo(() => {
        return receiptRows.reduce((sum, row) => {
            if (!row.menuId) return sum;
            const menu = receiptOrderMenus.find((m) => m.id === row.menuId);
            if (!menu) return sum;
            return sum + Number(row.qty) * Number(menu.price || 0);
        }, 0);
    }, [receiptRows, receiptOrderMenus]);

    const receiptRowsByOrder = useMemo(() => {
        const grouped = new Map<number, typeof receiptRows>();
        for (const row of receiptRows) {
            const key = Number.isFinite(row.orderId) && row.orderId > 0 ? Math.floor(row.orderId) : 1;
            const bucket = grouped.get(key);
            if (bucket) bucket.push(row);
            else grouped.set(key, [row]);
        }
        return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
    }, [receiptRows]);

    const loadReceiptHistory = useCallback(async () => {
        setReceiptHistoryLoading(true);
        try {
            const bid = isAllBranches ? 'all' : branchId;
            const rows = await fetchReceiptScanHistoryList(bid, 250);
            setReceiptHistoryRows(Array.isArray(rows) ? rows : []);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t('orders.failed_to_load'));
            setReceiptHistoryRows([]);
        } finally {
            setReceiptHistoryLoading(false);
        }
    }, [branchId, isAllBranches, t]);

    const openReceiptHistoryPanel = () => {
        setReceiptHistoryOpen(true);
        void loadReceiptHistory();
    };

    const openReceiptHistoryDetail = async (id: number) => {
        setReceiptHistoryDetailOpen(true);
        setReceiptHistoryDetailLoading(true);
        setReceiptHistoryDetail(null);
        try {
            const row = await fetchReceiptScanHistoryById(id);
            setReceiptHistoryDetail(row);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t('orders.failed_to_load'));
            setReceiptHistoryDetailOpen(false);
        } finally {
            setReceiptHistoryDetailLoading(false);
        }
    };

    const filteredReceiptHistory = useMemo(() => {
        return receiptHistoryRows.filter((r) => {
            if (!dateRange.start || !dateRange.end) return true;
            const ymd = String(r.ENCODED_DT ?? '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
            if (!ymd) return true;
            return ymd >= dateRange.start && ymd <= dateRange.end;
        });
    }, [receiptHistoryRows, dateRange.start, dateRange.end]);

    const submitReceiptOrder = async () => {
        if (!receiptOrderNo.trim()) {
            setSwal({
                type: 'warning',
                title: t('orders.swal.order_no_required_title'),
                text: t('orders.swal.order_no_required_text'),
                onConfirm: () => setSwal(null),
            });
            return;
        }
        if (isAllBranches && !receiptOrderBranchId) {
            toast.error(t('orders.receipt_select_branch_first'));
            return;
        }
        const resolvedBranch = isAllBranches ? receiptOrderBranchId : branchId;
        setReceiptSubmitting(true);
        try {
            const now = new Date();
            const pad2 = (n: number) => String(n).padStart(2, '0');
            // Use Asia/Manila time consistently so ENCODED_DT matches backend timestamps.
            const getManilaParts = (d: Date) => {
                const parts = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Manila',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                }).formatToParts(d);
                const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
                return {
                    year: get('year'),
                    month: get('month'),
                    day: get('day'),
                    hour: get('hour'),
                    minute: get('minute'),
                    second: get('second'),
                };
            };
            const manilaNow = getManilaParts(now);
            const todayStr = `${manilaNow.year}-${pad2(manilaNow.month)}-${pad2(manilaNow.day)}`;
            const selectedDate = (receiptOrderDate && receiptOrderDate.trim()) ? receiptOrderDate : todayStr;
            const [yy, mm, dd] = selectedDate.split('-').map((x) => Number(x));
            const timePart = `${pad2(manilaNow.hour)}:${pad2(manilaNow.minute)}:${pad2(manilaNow.second)}`;
            const encodedDt = `${yy}-${pad2(mm)}-${pad2(dd)} ${timePart}`;

            // Fresh menu list — avoids empty/stale state if user saves before useEffect finishes loading menus.
            const menuList = await getMenus(resolvedBranch).then((m) =>
                (Array.isArray(m) ? m : []).filter((x) => x.active && (x.effectiveAvailable ?? x.isAvailable))
            );
            const merged = new Map<string, NewOrderItem>();
            for (const row of receiptRows) {
                if (!row.menuId) continue;
                const menu = menuList.find((m) => String(m.id) === String(row.menuId));
                if (!menu) continue;
                const qty = Number(row.qty);
                if (!Number.isFinite(qty) || qty <= 0) continue;
                const unitPrice = Number(menu.price || 0);
                const prev = merged.get(String(row.menuId));
                if (prev) merged.set(String(row.menuId), { ...prev, qty: prev.qty + qty });
                else merged.set(String(row.menuId), { menuId: String(row.menuId), name: menu.name, unitPrice, qty });
            }
            if (merged.size === 0) {
                setSwal({
                    type: 'warning',
                    title: t('orders.receipt_no_menu_mapped_title'),
                    text: t('orders.receipt_no_menu_mapped_text'),
                    onConfirm: () => setSwal(null),
                });
                return;
            }
            const builtItems = Array.from(merged.values());
            const subtotal = builtItems.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
            const items = builtItems.map((it) => ({
                menu_id: Number(it.menuId),
                qty: Number(it.qty),
                unit_price: Number(it.unitPrice),
                line_total: Number(it.qty) * Number(it.unitPrice),
                status: ORDER_STATUS.PENDING,
            }));
            const created = await createManualSettledOrder({
                ORDER_NO: receiptOrderNo.trim(),
                order_no: receiptOrderNo.trim(),
                BRANCH_ID: resolvedBranch,
                branch_id: resolvedBranch,
                TABLE_ID: receiptOrderTableId ? Number(receiptOrderTableId) : null,
                ORDER_TYPE: receiptOrderType,
                order_type: receiptOrderType,
                ENCODED_DT: encodedDt,
                STATUS: ORDER_STATUS.SETTLED,
                SUBTOTAL: subtotal,
                TAX_AMOUNT: 0,
                SERVICE_CHARGE: 0,
                DISCOUNT_AMOUNT: 0,
                GRAND_TOTAL: subtotal,
                ORDER_ITEMS: items,
                items,
                payment_method: 'CASH',
                payment_ref: 'Receipt scan auto-settled',
                PAYMENT_METHOD: 'CASH',
                PAYMENT_REF: 'Receipt scan auto-settled',
            });
            const savedOrderNo = receiptOrderNo.trim();
            const snapImage = receiptImage;
            const snapExtract = receiptExtractResult;
            const snapRows = receiptRows;
            const snapMenuSub = receiptPreviewSubtotal;
            void saveReceiptScanHistory({
                branch_id: String(resolvedBranch),
                source: 'resto_admin',
                order_id: created?.id != null ? Number(created.id) : null,
                encoded_dt: encodedDt,
                receipt_grand_total: snapExtract?.receipt_grand_total ?? null,
                receipt_image_data_url: snapImage,
            }).catch(() => {
                toast.warning(t('orders.receipt_history_save_failed'));
            });
            setReceiptOrderOpen(false);
            setReceiptOrderTableId('');
            setReceiptImage(null);
            setReceiptRows([]);
            setReceiptExtractResult(null);
            await loadOrders();
            toast.success(t('orders.swal.created_text', { orderNo: savedOrderNo }));
        } catch (e) {
            if (e instanceof InventoryInsufficientError && e.insufficient?.length) {
                const list = e.insufficient
                    .map((i) =>
                        t('orders.swal.insufficient_inventory_item', {
                            name: i.ingredientName,
                            required: i.required,
                            available: i.available,
                            unit: i.unit,
                        })
                    )
                    .join('\n');
                setSwal({
                    type: 'warning',
                    title: t('orders.swal.insufficient_inventory_title'),
                    text: `${t('orders.swal.insufficient_inventory_text')}\n\n${list}`,
                    onConfirm: () => setSwal(null),
                });
            } else {
                toast.error(e instanceof Error ? e.message : t('orders.swal.create_failed'));
            }
        } finally {
            setReceiptSubmitting(false);
        }
    };

    useEffect(() => {
        if (!manualOrderOpen) return;
        if (!effectiveManualBranchId) {
            setManualOrderMenus([]);
            return;
        }
        let cancelled = false;
        setManualOrderLoadingRefs(true);
        getMenus(effectiveManualBranchId)
            .then((menus) => {
                if (cancelled) return;
                setManualOrderMenus((Array.isArray(menus) ? menus : []).filter((m) => m.active && (m.effectiveAvailable ?? m.isAvailable)));
            })
            .catch(() => { if (!cancelled) setManualOrderMenus([]); })
            .finally(() => { if (!cancelled) setManualOrderLoadingRefs(false); });
        return () => { cancelled = true; };
    }, [manualOrderOpen, effectiveManualBranchId]);

    const manualOrderSubtotal = manualOrderItems.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);

    const MANUAL_ROOM_CHARGE_ITEM_ID = '__ROOM_CHARGE__';
    const roundToHalf = (v: number) => Math.round(v * 2) / 2;
    const manualRoomCharge = !!manualOrderTableId && Object.prototype.hasOwnProperty.call(manualBranchTablesRoomChargeById, manualOrderTableId)
        ? Number(manualBranchTablesRoomChargeById[manualOrderTableId])
        : 0;
    const hasManualRoomChargeRow = !!manualOrderTableId && Number.isFinite(manualRoomCharge) && manualRoomCharge > 0;
    const manualDisplayOrderItems: NewOrderItem[] = hasManualRoomChargeRow
        ? [
            {
                menuId: MANUAL_ROOM_CHARGE_ITEM_ID,
                name: t('table.room_charge'),
                unitPrice: manualRoomCharge,
                qty: manualRoomChargeQty,
            },
            ...manualOrderItems,
        ]
        : manualOrderItems;
    const manualGrandTotalBase = manualOrderSubtotal + (hasManualRoomChargeRow ? manualRoomChargeQty * manualRoomCharge : 0);
    const manualDiscountNumber = (() => {
        const n = parseFloat(String(manualDiscountAmount ?? '').trim());
        return Number.isFinite(n) ? n : 0;
    })();
    const manualDiscountApplied = Math.max(0, manualDiscountNumber);
    const manualGrandTotalPreview = Math.max(0, manualGrandTotalBase - manualDiscountApplied);

    const addManualMenuById = (menuId: string, qtyToAdd = 1) => {
        const menu = manualOrderMenus.find((m) => m.id === menuId);
        if (!menu) return;
        const qty = Number(qtyToAdd);
        if (!Number.isFinite(qty) || qty <= 0) return;
        setManualOrderItems((prev) => {
            const idx = prev.findIndex((p) => p.menuId === menuId);
            if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = { ...copy[idx], qty: Math.max(1, copy[idx].qty + qty) };
                return copy;
            }
            return [{ menuId, name: menu.name, unitPrice: Number(menu.price || 0), qty }, ...prev];
        });
        // Briefly highlight the affected row so users can track what was just added.
        setManualRowFlash({ menuId, nonce: Date.now() });
    };

    const removeManualOrderItem = (menuId: string) => setManualOrderItems((prev) => prev.filter((p) => p.menuId !== menuId));
    const decManualOrderItemQty = (menuId: string) =>
        setManualOrderItems((prev) => {
            const idx = prev.findIndex((p) => p.menuId === menuId);
            if (idx < 0) return prev;
            const nextQty = (prev[idx].qty || 1) - 1;
            if (nextQty <= 0) return prev.filter((p) => p.menuId !== menuId);
            const copy = [...prev];
            copy[idx] = { ...copy[idx], qty: nextQty };
            return copy;
        });

    const filteredManualMenus = useMemo(() => {
        const q = manualMenuQuery.trim().toLowerCase();
        const base = (Array.isArray(manualOrderMenus) ? manualOrderMenus : [])
            .filter((m) => m.active && (m.effectiveAvailable ?? m.isAvailable));
        if (!q) return base;
        return base.filter((m) => String(m.name || '').toLowerCase().includes(q));
    }, [manualMenuQuery, manualOrderMenus]);

    const MANUAL_MENU_PAGE_SIZE = 20;
    const manualMenuTotalPages = useMemo(
        () => Math.max(1, Math.ceil(filteredManualMenus.length / MANUAL_MENU_PAGE_SIZE)),
        [filteredManualMenus.length]
    );
    const paginatedManualMenus = useMemo(() => {
        const page = Math.min(Math.max(1, manualMenuPage), manualMenuTotalPages);
        const start = (page - 1) * MANUAL_MENU_PAGE_SIZE;
        return filteredManualMenus.slice(start, start + MANUAL_MENU_PAGE_SIZE);
    }, [filteredManualMenus, manualMenuPage, manualMenuTotalPages]);

    useEffect(() => {
        setManualMenuPage(1);
    }, [manualOrderOpen, manualMenuQuery, effectiveManualBranchId]);

    useEffect(() => {
        setManualMenuPage((prev) => Math.min(prev, manualMenuTotalPages));
    }, [manualMenuTotalPages]);

    useEffect(() => {
        if (!manualRowFlash) return;
        const timer = window.setTimeout(() => setManualRowFlash(null), 900);
        return () => window.clearTimeout(timer);
    }, [manualRowFlash]);

    const submitManualOrder = async () => {
        if (isAllBranches && !manualOrderBranchId) {
            setSwal({
                type: 'warning',
                title: t('header.select_branch'),
                text: t('categories.messages.select_branch'),
                onConfirm: () => setSwal(null)
            });
            return;
        }
        if (!manualOrderNo.trim()) {
            setSwal({
                type: 'warning',
                title: t('orders.swal.order_no_required_title'),
                text: t('orders.swal.order_no_required_text'),
                onConfirm: () => setSwal(null)
            });
            return;
        }
        // Allow creating the order when room charge exists (room charge is injected separately)
        // so the user can proceed even if the manual items list is empty — unless qty is 0 (waived).
        if (manualOrderItems.length === 0 && (!hasManualRoomChargeRow || manualRoomChargeQty <= 0)) {
            setSwal({
                type: 'warning',
                title: t('orders.swal.add_items_title'),
                text: t('orders.swal.add_items_text'),
                onConfirm: () => setSwal(null)
            });
            return;
        }
        setManualOrderSubmitting(true);
        try {
            const now = new Date();
            const pad2 = (n: number) => String(n).padStart(2, '0');

            // Use Asia/Manila time consistently so ENCODED_DT matches backend timestamps (EDITED_DT).
            const getManilaParts = (d: Date) => {
                const parts = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Manila',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                }).formatToParts(d);
                const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
                return {
                    year: get('year'),
                    month: get('month'),
                    day: get('day'),
                    hour: get('hour'),
                    minute: get('minute'),
                    second: get('second'),
                };
            };

            const manilaNow = getManilaParts(now);
            const todayStr = `${manilaNow.year}-${pad2(manilaNow.month)}-${pad2(manilaNow.day)}`;
            const selectedDate = (manualOrderDate && manualOrderDate.trim()) ? manualOrderDate : todayStr;
            const [yy, mm, dd] = selectedDate.split('-').map((x) => Number(x));

            // Date comes from the picker; time-of-day comes from current time in Asia/Manila.
            const timePart = `${pad2(manilaNow.hour)}:${pad2(manilaNow.minute)}:${pad2(manilaNow.second)}`;
            const encodedDt = `${yy}-${pad2(mm)}-${pad2(dd)} ${timePart}`;

            const items = manualOrderItems.map((it) => ({ menu_id: Number(it.menuId), qty: Number(it.qty), unit_price: Number(it.unitPrice), line_total: Number(it.qty) * Number(it.unitPrice), status: ORDER_STATUS.PENDING }));
            // Backend always adds table ROOM_CHARGE once.
            // To make qty > 1 work, we add extra service charge: (qty - 1) * roomCharge
            // so final becomes: roomCharge + extra = qty * roomCharge.
            const roomChargeAdditionalService =
                hasManualRoomChargeRow ? (manualRoomChargeQty - 1) * manualRoomCharge : 0;
            const manualGrandTotal = Math.max(0, manualGrandTotalPreview);
            const created = await createManualSettledOrder({
                ORDER_NO: manualOrderNo.trim(), order_no: manualOrderNo.trim(),
                BRANCH_ID: effectiveManualBranchId, branch_id: effectiveManualBranchId,
                TABLE_ID: manualOrderTableId ? Number(manualOrderTableId) : null,
                ORDER_TYPE: manualOrderType, order_type: manualOrderType,
                ENCODED_DT: encodedDt,
                STATUS: ORDER_STATUS.SETTLED,
                SUBTOTAL: manualOrderSubtotal,
                TAX_AMOUNT: 0,
                SERVICE_CHARGE: roomChargeAdditionalService,
                DISCOUNT_AMOUNT: manualDiscountApplied,
                GRAND_TOTAL: manualGrandTotal,
                ORDER_ITEMS: items, items,
                // Keep both lower/upper-case keys for compatibility with backend.
                payment_method: manualPaymentMethod,
                payment_ref: manualPaymentRef?.trim() ? manualPaymentRef.trim() : null,
                PAYMENT_METHOD: manualPaymentMethod,
                PAYMENT_REF: manualPaymentRef?.trim() ? manualPaymentRef.trim() : null,
            });
            setManualOrderOpen(false);
            setManualOrderTableId('');

            // After creating/settling, clear local filters so the new record is visible.
            // (If user is filtering by PENDING, a SETTLED manual order would be hidden.)
            setSearchTerm('');
            setStatusFilter('all');

            await loadOrders();

            // Workaround: if the list endpoint (`getOrders`) doesn't include
            // newly-created manual-settled orders yet, ensure the specific order
            // is inserted into the current table state.
            if (created?.id != null) {
                try {
                    const createdOrder = await getOrderById(String(created.id));
                    if (createdOrder) {
                        setOrders((prev) => {
                            if (prev.some((o) => Number(o.IDNo) === Number(createdOrder.IDNo))) return prev;
                            return [createdOrder, ...prev];
                        });
                    }
                } catch {
                    // Ignore; table will still update after `loadOrders()` in the common case.
                }
            }
            toast.success(t('orders.swal.manual_created_text', { orderNo: manualOrderNo.trim() }));
        } catch (e) {
            if (e instanceof InventoryInsufficientError && e.insufficient?.length) {
                const list = e.insufficient.map((i) => t('orders.swal.insufficient_inventory_item', {
                    name: i.ingredientName,
                    required: i.required,
                    available: i.available,
                    unit: i.unit,
                })).join('\n');
                setSwal({
                    type: 'warning',
                    title: t('orders.swal.insufficient_inventory_title'),
                    text: `${t('orders.swal.insufficient_inventory_text')}\n\n${list}`,
                    onConfirm: () => setSwal(null),
                });
            } else {
                toast.error(e instanceof Error ? e.message : t('orders.swal.create_failed'));
            }
        } finally {
            setManualOrderSubmitting(false);
        }
    };

    // Load menus for adding items to existing order (detail modal)
    useEffect(() => {
        if (!detailOrder) {
            setDetailMenus([]);
            setDetailSelectedMenuId('');
            setDetailAddQty(1);
            return;
        }
        // Allow adding items when order is PENDING or CONFIRMED (not settled/cancelled)
        if (detailOrder.STATUS === ORDER_STATUS.SETTLED || detailOrder.STATUS === ORDER_STATUS.CANCELLED) return;
        let cancelled = false;
        setDetailMenusLoading(true);
        getMenus(branchId)
            .then((menus) => {
                if (cancelled) return;
                setDetailMenus((Array.isArray(menus) ? menus : []).filter((m) => m.active && (m.effectiveAvailable ?? m.isAvailable)));
            })
            .catch(() => {
                if (!cancelled) setDetailMenus([]);
            })
            .finally(() => {
                if (!cancelled) setDetailMenusLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [detailOrder, branchId]);

    // Clear add-item selection if the selected menu is already in the order (use edit qty instead)
    useEffect(() => {
        if (detailSelectedMenuId && detailItems.some((it) => Number(it.MENU_ID) === Number(detailSelectedMenuId))) {
            setDetailSelectedMenuId('');
        }
    }, [detailItems, detailSelectedMenuId]);

    const addDetailOrderItem = async () => {
        if (!detailOrder) return;
        if (detailOrder.STATUS === ORDER_STATUS.SETTLED || detailOrder.STATUS === ORDER_STATUS.CANCELLED) {
            toast.error(t('orders.additional_items_not_allowed'));
            return;
        }
        if (!detailSelectedMenuId) {
            setSwal({
                type: 'warning',
                title: t('orders.swal.select_item_title'),
                text: t('orders.swal.select_item_text'),
                onConfirm: () => setSwal(null),
            });
            return;
        }
        const qty = Number(detailAddQty);
        if (!Number.isFinite(qty) || qty <= 0) {
            setSwal({
                type: 'warning',
                title: t('orders.swal.invalid_qty_title'),
                text: t('orders.swal.invalid_qty_text'),
                onConfirm: () => setSwal(null),
            });
            return;
        }
        const menu = detailMenus.find((m) => m.id === detailSelectedMenuId);
        if (!menu) return;
        const payloadItems: CreateOrderItemPayload[] = [
            {
                menu_id: Number(menu.id),
                qty,
                unit_price: Number(menu.price || 0),
                line_total: Number(qty) * Number(menu.price || 0),
                status: ORDER_STATUS.PENDING,
            },
        ];
        setDetailAdding(true);
        try {
            await addItemsToOrder(String(detailOrder.IDNo), payloadItems);
            const [refreshed, updatedOrder] = await Promise.all([
                getOrderItems(String(detailOrder.IDNo)),
                getOrderById(String(detailOrder.IDNo)),
            ]);
            setDetailItems(refreshed);
            if (updatedOrder) setDetailOrder(updatedOrder);
            await loadOrders();
            toast.success(t('orders.additional_items_added_success'));
            setDetailSelectedMenuId('');
            setDetailAddQty(1);
        } catch (e) {
            if (e instanceof InventoryInsufficientError && e.insufficient?.length) {
                const list = e.insufficient
                    .map((i) =>
                        t('orders.swal.insufficient_inventory_item', {
                            name: i.ingredientName,
                            required: i.required,
                            available: i.available,
                            unit: i.unit,
                        })
                    )
                    .join('\n');
                setSwal({
                    type: 'warning',
                    title: t('orders.swal.insufficient_inventory_title'),
                    text: `${t('orders.swal.insufficient_inventory_text')}\n\n${list}`,
                    onConfirm: () => setSwal(null),
                });
            } else {
                toast.error(e instanceof Error ? e.message : t('orders.swal.update_failed'));
            }
        } finally {
            setDetailAdding(false);
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
                            {formatEncodedDt(order.ENCODED_DT)}
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
                <span className="text-sm font-bold text-brand-text">₱{Number(order.GRAND_TOTAL).toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
            ),
        },
        {
            header: t('orders.actions'),
            className: 'text-right',
            render: (order) => (
                <div className="flex justify-end items-center gap-2">
                    <button
                        onClick={() => openDetail(order)}
                        className="p-2 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors rounded-lg"
                        title={t('orders.view_details')}
                    >
                        <Eye size={16} />
                    </button>
                    {/* Confirm / Cancel are treated as updates on the order */}
                    {canUpdate('orders') && order.STATUS === ORDER_STATUS.PENDING && (
                        <button
                            onClick={() => confirmUpdateStatus(order, ORDER_STATUS.CONFIRMED)}
                            disabled={statusSubmitting}
                            className="p-2 text-green-600 hover:bg-green-50 transition-colors rounded-lg disabled:opacity-50"
                            title={t('orders.confirmed')}
                        >
                            <CheckCircle2 size={16} />
                        </button>
                    )}
                    {canUpdate('orders') &&
                      order.STATUS !== ORDER_STATUS.SETTLED &&
                      order.STATUS !== ORDER_STATUS.CANCELLED && (
                        <button
                            onClick={() => confirmUpdateStatus(order, ORDER_STATUS.CANCELLED)}
                            disabled={statusSubmitting}
                            className="p-2 text-red-500 hover:bg-red-50 transition-colors rounded-lg disabled:opacity-50"
                            title={t('orders.cancel_order')}
                        >
                            <XCircle size={16} />
                        </button>
                    )}
                </div>
            ),
        },
    ], [statusSubmitting, t, canUpdate]);

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
                                        className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-primary/20 outline-none"
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
                            {canCreate('orders') && (
                              <div className="flex items-center gap-3">
                                <button
                                    onClick={openNewOrder}
                                    className="bg-brand-primary text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all"
                                >
                                    <Plus size={18} />
                                    {t('orders.new_order')}
                                </button>
                                <button
                                    type="button"
                                    onClick={openReceiptOrder}
                                    className="bg-violet-600 text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-violet-600/20 hover:bg-violet-700 transition-all"
                                    title={t('orders.upload_receipt_helper')}
                                >
                                    <ScanLine size={18} />
                                    {t('orders.upload_receipt')}
                                </button>
                                <button
                                    type="button"
                                    onClick={openReceiptHistoryPanel}
                                    className="bg-slate-700 text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-slate-700/20 hover:bg-slate-800 transition-all"
                                    title={t('orders.receipt_history_sub')}
                                >
                                    <History size={18} />
                                    {t('orders.receipt_history')}
                                </button>
                                <button
                                    onClick={openManualOrder}
                                    className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
                                    title={t('orders.manual_order_helper')}
                                >
                                    <CheckCircle2 size={18} />
                                    {t('orders.manual_order')}
                                </button>
                              </div>
                            )}
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
                        <div className="grid grid-cols-5 gap-6">
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
                                <p className="text-brand-muted text-sm font-medium mb-1">{t('orders.confirmed')}</p>
                                <h3 className="text-3xl font-bold text-blue-500">{stats.confirmed}</h3>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm">
                                <p className="text-brand-muted text-sm font-medium mb-1">{t('orders.settled')}</p>
                                <h3 className="text-3xl font-bold text-green-500">{stats.settled}</h3>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm">
                                <p className="text-brand-muted text-sm font-medium mb-1">{t('orders.cancelled')}</p>
                                <h3 className="text-3xl font-bold text-red-500">{stats.cancelled}</h3>
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

            <Modal
                isOpen={receiptHistoryOpen}
                onClose={() => setReceiptHistoryOpen(false)}
                title={t('orders.receipt_history')}
                maxWidth="5xl"
                footer={
                    <button
                        type="button"
                        onClick={() => setReceiptHistoryOpen(false)}
                        className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors"
                    >
                        {t('orders.cancel')}
                    </button>
                }
            >
                <p className="text-sm text-brand-muted mb-4">{t('orders.receipt_history_sub')}</p>
                {receiptHistoryLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 size={32} className="animate-spin text-brand-primary" />
                    </div>
                ) : filteredReceiptHistory.length === 0 ? (
                    <p className="text-center text-brand-muted py-8">{t('orders.receipt_history_empty')}</p>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-left">
                                <tr>
                                    <th className="px-3 py-2 font-bold">{t('orders.date')}</th>
                                    {isAllBranches ? (
                                        <th className="px-3 py-2 font-bold">{t('orders.receipt_history_branch')}</th>
                                    ) : null}
                                    <th className="px-3 py-2 font-bold">{t('orders.receipt_history_source')}</th>
                                    <th className="px-3 py-2 font-bold">{t('orders.order_no')}</th>
                                    <th className="px-3 py-2 font-bold text-right">{t('orders.receipt_history_grand_total')}</th>
                                    <th className="px-3 py-2 w-28" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredReceiptHistory.map((r) => (
                                    <tr key={r.IDNo} className="hover:bg-gray-50/80">
                                        <td className="px-3 py-2 whitespace-nowrap">{formatEncodedDt(r.ENCODED_DT)}</td>
                                        {isAllBranches ? (
                                            <td className="px-3 py-2">{r.BRANCH_NAME ?? r.BRANCH_ID}</td>
                                        ) : null}
                                        <td className="px-3 py-2 font-mono text-xs">{r.SOURCE}</td>
                                        <td className="px-3 py-2 font-mono">{r.ORDER_NO ?? '—'}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {r.RECEIPT_GRAND_TOTAL != null
                                                ? `₱${Number(r.RECEIPT_GRAND_TOTAL).toLocaleString(undefined, {
                                                      maximumFractionDigits: 0,
                                                  })}`
                                                : '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <button
                                                type="button"
                                                onClick={() => void openReceiptHistoryDetail(r.IDNo)}
                                                className="text-brand-primary font-bold hover:underline"
                                            >
                                                {t('orders.receipt_history_view')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={receiptHistoryDetailOpen}
                onClose={() => {
                    setReceiptHistoryDetailOpen(false);
                    setReceiptHistoryDetail(null);
                }}
                title={t('orders.receipt_history_detail_title')}
                maxWidth="6xl"
                footer={
                    <button
                        type="button"
                        onClick={() => {
                            setReceiptHistoryDetailOpen(false);
                            setReceiptHistoryDetail(null);
                        }}
                        className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors"
                    >
                        {t('orders.cancel')}
                    </button>
                }
            >
                {receiptHistoryDetailLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 size={32} className="animate-spin text-brand-primary" />
                    </div>
                ) : receiptHistoryDetail ? (
                    <div className="flex flex-col gap-3 h-full min-h-0">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                            <div className="min-w-0">
                                <span className="text-brand-muted">{t('orders.date')}</span>
                                <div className="font-semibold truncate">{formatEncodedDt(receiptHistoryDetail.ENCODED_DT)}</div>
                            </div>
                            <div className="min-w-0">
                                <span className="text-brand-muted">{t('orders.receipt_history_source')}</span>
                                <div className="font-mono truncate">{receiptHistoryDetail.SOURCE}</div>
                            </div>
                            <div className="min-w-0">
                                <span className="text-brand-muted">{t('orders.order_no')}</span>
                                <div className="font-mono truncate">
                                    {receiptHistoryDetail.ORDER_NO ?? (receiptHistoryDetail.ORDER_ID != null ? `#${receiptHistoryDetail.ORDER_ID}` : '—')}
                                </div>
                            </div>
                            <div className="min-w-0">
                                <span className="text-brand-muted">{t('orders.receipt_history_grand_total')}</span>
                                <div className="tabular-nums font-semibold truncate">
                                    {receiptHistoryDetail.RECEIPT_GRAND_TOTAL != null
                                        ? `₱${Number(receiptHistoryDetail.RECEIPT_GRAND_TOTAL).toLocaleString(undefined, {
                                              maximumFractionDigits: 0,
                                          })}`
                                        : '—'}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-50">
                            {receiptHistoryDetail.receipt_image_data_url ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const url = receiptHistoryDetail.receipt_image_data_url;
                                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="w-full p-2"
                                    title="Click to view full size"
                                >
                                    <img
                                        src={receiptHistoryDetail.receipt_image_data_url}
                                        alt="Receipt"
                                        className="block w-full h-auto max-h-[78vh] object-contain rounded-xl bg-white"
                                        draggable={false}
                                    />
                                </button>
                            ) : (
                                <div className="h-[40vh] flex items-center justify-center text-brand-muted">
                                    No receipt image
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-xs font-bold text-brand-muted uppercase tracking-widest">
                                        Order breakdown
                                    </div>
                                    <div className="text-[11px] text-brand-muted mt-0.5">
                                        Click image to view full size
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 space-y-4">
                                {(receiptHistoryDetail.orders || []).length === 0 ? (
                                    <div className="text-sm text-brand-muted">No order items found.</div>
                                ) : (
                                    (receiptHistoryDetail.orders || []).map((o) => {
                                        const items = o.items || [];
                                        return (
                                            <div key={String(o.ORDER_ID)} className="rounded-xl border border-gray-100 overflow-hidden">
                                                <div className="px-4 py-3 bg-gray-50 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-extrabold text-brand-text truncate">
                                                            {o.ORDER_NO ? o.ORDER_NO : `#${o.ORDER_ID}`}
                                                        </div>
                                                        <div className="text-[11px] text-brand-muted truncate">
                                                            {o.TABLE_NUMBER != null && String(o.TABLE_NUMBER).trim() !== ''
                                                                ? `Table ${o.TABLE_NUMBER}`
                                                                : o.ORDER_TYPE || '—'}
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <div className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                                                            Total
                                                        </div>
                                                        <div className="text-sm font-extrabold text-brand-primary tabular-nums">
                                                            ₱{Number(o.GRAND_TOTAL || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-3">
                                                    {items.length === 0 ? (
                                                        <div className="text-sm text-brand-muted">No items.</div>
                                                    ) : (
                                                        <div className="overflow-hidden rounded-lg border border-gray-100">
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-white">
                                                                    <tr className="text-brand-muted">
                                                                        <th className="px-3 py-2 text-left font-bold uppercase tracking-widest">Item</th>
                                                                        <th className="px-3 py-2 text-right font-bold uppercase tracking-widest w-[56px]">Qty</th>
                                                                        <th className="px-3 py-2 text-right font-bold uppercase tracking-widest w-[92px]">Total</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-50">
                                                                    {items.map((it) => (
                                                                        <tr key={String(it.ORDER_ITEM_ID)} className="text-brand-text">
                                                                            <td className="px-3 py-2">
                                                                                <div className="font-semibold leading-snug">
                                                                                    {it.MENU_NAME || `#${it.MENU_ID ?? ''}`}
                                                                                </div>
                                                                                {it.REMARKS ? (
                                                                                    <div className="text-[11px] text-brand-muted mt-0.5 break-words">
                                                                                        {it.REMARKS}
                                                                                    </div>
                                                                                ) : null}
                                                                            </td>
                                                                            <td className="px-3 py-2 text-right tabular-nums font-semibold">
                                                                                {Number(it.QTY || 0)}
                                                                            </td>
                                                                            <td className="px-3 py-2 text-right tabular-nums font-bold">
                                                                                ₱{Number(it.LINE_TOTAL || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}

                                                    {(o.SERVICE_CHARGE != null && Number(o.SERVICE_CHARGE) > 0) || (o.SUBTOTAL != null && o.GRAND_TOTAL != null) ? (
                                                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                                            <div className="rounded-lg bg-gray-50 px-3 py-2 flex items-center justify-between">
                                                                <span className="text-brand-muted font-bold uppercase tracking-widest">Subtotal</span>
                                                                <span className="font-extrabold tabular-nums">
                                                                    ₱{Number(o.SUBTOTAL || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                                </span>
                                                            </div>
                                                            <div className="rounded-lg bg-gray-50 px-3 py-2 flex items-center justify-between">
                                                                <span className="text-brand-muted font-bold uppercase tracking-widest">Service</span>
                                                                <span className="font-extrabold tabular-nums">
                                                                    ₱{Number(o.SERVICE_CHARGE || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}
            </Modal>

            {/* New Order Modal */}
            <Modal
                isOpen={newOrderOpen}
                onClose={closeNewOrder}
                title={t('orders.create_new_order')}
                maxWidth="2xl"
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
                <div className="space-y-6">
                    {/* Header / basic info */}
                    <div className="grid grid-cols-3 gap-5">
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-brand-muted uppercase tracking-widest">
                                {t('orders.order_no_label')}
                            </label>
                            <input
                                type="text"
                                value={newOrderNo}
                                onChange={(e) => setNewOrderNo(e.target.value)}
                                placeholder={t('orders.order_no_placeholder')}
                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-brand-muted uppercase tracking-widest">
                                {t('orders.order_type')}
                            </label>
                            <Select2
                                options={[
                                    { value: 'DINE_IN', label: t('orders.dine_in') },
                                    { value: 'TAKE_OUT', label: t('orders.take_out') },
                                    { value: 'DELIVERY', label: t('orders.delivery') },
                                ]}
                                value={newOrderType}
                                onChange={(v) =>
                                    setNewOrderType((v as typeof newOrderType) || 'DINE_IN')
                                }
                                placeholder={t('orders.select_type')}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-brand-muted uppercase tracking-widest">
                                {t('table.table_number')}
                            </label>
                            <Select2
                                options={branchTables}
                                value={newOrderTableId || null}
                                onChange={(v) => setNewOrderTableId(v ? String(v) : '')}
                                placeholder={t('table.table_number')}
                            />
                        </div>
                    </div>

                    {/* Items section */}
                    <div className="space-y-3">
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
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all" />
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
                                <div className="p-4 text-sm text-brand-muted text-center">
                                    {t('orders.no_items_added')}
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-bold text-brand-muted text-xs">
                                                {t('orders.item')}
                                            </th>
                                            <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">
                                                {t('orders.qty')}
                                            </th>
                                            <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">
                                                {t('orders.unit')}
                                            </th>
                                            <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">
                                                {t('orders.line_total')}
                                            </th>
                                            <th className="px-4 py-2 w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {newOrderItems.map((it) => (
                                            <tr key={it.menuId}>
                                                <td className="px-4 py-2 font-medium">{it.name}</td>
                                                <td className="px-4 py-2 text-right">{it.qty}</td>
                                                <td className="px-4 py-2 text-right">
                                                    ₱{Number(it.unitPrice).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2 text-right font-bold">
                                                    ₱{Number(it.qty * it.unitPrice).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    <button
                                                        onClick={() => removeNewOrderItem(it.menuId)}
                                                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {newOrderItems.length > 0 && (
                                        <tfoot className="bg-gray-50">
                                            <tr>
                                                <td
                                                    className="px-4 py-2 text-right font-bold text-brand-text"
                                                    colSpan={3}
                                                >
                                                    {t('orders.grand_total')}
                                                </td>
                                                <td className="px-4 py-2 text-right font-extrabold text-brand-primary">
                                                    ₱
                                                    {newOrderSubtotal.toLocaleString(undefined, {
                                                        minimumFractionDigits: 0,
                                                    })}
                                                </td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Receipt scan → new order */}
            <Modal
                isOpen={receiptOrderOpen}
                onClose={closeReceiptOrder}
                title={t('orders.receipt_order_title')}
                maxWidth="4xl"
                footer={
                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={closeReceiptOrder}
                            disabled={receiptSubmitting || receiptExtracting}
                            className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                            {t('orders.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={submitReceiptOrder}
                            disabled={receiptSubmitting || receiptExtracting || receiptOrderMenusLoading}
                            className="px-6 py-2.5 rounded-xl font-bold text-white bg-violet-600 shadow-lg shadow-violet-600/30 hover:bg-violet-700 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            {receiptSubmitting && <Loader2 size={16} className="animate-spin" />}
                            {t('orders.create_order_btn')}
                        </button>
                    </div>
                }
            >
                <div className="space-y-6">
                    {isAllBranches && (
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-brand-muted uppercase tracking-widest">
                                {t('header.select_branch')}
                            </label>
                            <Select2
                                options={manualBranchOptions}
                                value={receiptOrderBranchId || null}
                                onChange={(v) => {
                                    setReceiptOrderBranchId(v ? String(v) : '');
                                    setReceiptOrderTableId('');
                                    setReceiptImage(null);
                                    setReceiptRows([]);
                                    setReceiptExtractResult(null);
                                    setReceiptError(null);
                                }}
                                placeholder={t('header.select_branch')}
                            />
                            <p className="text-xs text-brand-muted">{t('orders.receipt_branch_hint')}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-brand-muted uppercase tracking-widest">
                                {t('orders.order_no_label')}
                            </label>
                            <input
                                type="text"
                                value={receiptOrderNo}
                                onChange={(e) => setReceiptOrderNo(e.target.value)}
                                placeholder={t('orders.order_no_placeholder')}
                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500/20 outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-brand-muted uppercase tracking-widest">
                                {t('orders.order_type')}
                            </label>
                            <Select2
                                options={[
                                    { value: 'DINE_IN', label: t('orders.dine_in') },
                                    { value: 'TAKE_OUT', label: t('orders.take_out') },
                                    { value: 'DELIVERY', label: t('orders.delivery') },
                                ]}
                                value={receiptOrderType}
                                onChange={(v) => setReceiptOrderType((v as typeof receiptOrderType) || 'DINE_IN')}
                                placeholder={t('orders.select_type')}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-brand-muted uppercase tracking-widest">
                                {t('table.table_number')}
                            </label>
                            <Select2
                                options={receiptTableSelectOptions}
                                value={receiptOrderTableId || null}
                                onChange={(v) => setReceiptOrderTableId(v ? String(v) : '')}
                                placeholder={t('table.table_number')}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-brand-muted uppercase tracking-widest">
                                {t('orders.date')}
                            </label>
                            <input
                                type="date"
                                value={receiptOrderDate}
                                onChange={(e) => setReceiptOrderDate(e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500/20 outline-none"
                            />
                        </div>
                    </div>

                    <input
                        ref={receiptFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                            processReceiptFile(e.target.files?.[0]);
                            e.target.value = '';
                        }}
                    />
                    <input
                        ref={receiptCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                            processReceiptFile(e.target.files?.[0]);
                            e.target.value = '';
                        }}
                    />

                    <div
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            processReceiptFile(e.dataTransfer.files[0]);
                        }}
                        className={cn(
                            'rounded-2xl border-2 border-dashed p-6 text-center transition-colors',
                            isAllBranches && !receiptOrderBranchId
                                ? 'border-gray-200 bg-gray-50 opacity-60 pointer-events-none'
                                : 'border-violet-200 bg-violet-50/40 hover:border-violet-300'
                        )}
                    >
                        {receiptExtracting ? (
                            <div className="flex flex-col items-center gap-3 py-6 text-brand-muted">
                                <Loader2 className="w-10 h-10 animate-spin text-violet-600" />
                                <p className="text-sm font-medium">{t('orders.receipt_scanning')}</p>
                            </div>
                        ) : (
                            <>
                                <Upload className="w-10 h-10 mx-auto text-violet-500 mb-3" />
                                <p className="text-sm font-bold text-brand-text mb-1">{t('orders.receipt_drop_hint')}</p>
                                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                                    <button
                                        type="button"
                                        disabled={isAllBranches && !receiptOrderBranchId}
                                        onClick={() => receiptFileInputRef.current?.click()}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-bold hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        <Upload size={16} />
                                        {t('orders.receipt_choose_file')}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isAllBranches && !receiptOrderBranchId}
                                        onClick={() => receiptCameraInputRef.current?.click()}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-bold hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        <Camera size={16} />
                                        {t('orders.receipt_take_photo')}
                                    </button>
                                    {receiptImage && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setReceiptImage(null);
                                                setReceiptRows([]);
                                                setReceiptExtractResult(null);
                                                setReceiptError(null);
                                            }}
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-brand-muted hover:bg-white/80"
                                        >
                                            <RefreshCw size={16} />
                                            {t('orders.receipt_clear')}
                                        </button>
                                    )}
                                </div>
                                {receiptImage && !receiptExtracting && (
                                    <div className="mt-4 flex justify-center">
                                        <img
                                            src={receiptImage}
                                            alt=""
                                            className="max-h-40 rounded-lg border border-gray-200 shadow-sm"
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {receiptError && (
                        <div className="flex items-start gap-3 bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl text-sm">
                            <AlertCircle size={18} className="mt-0.5 shrink-0" />
                            <span>{receiptError}</span>
                        </div>
                    )}

                    {receiptRows.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <label className="block text-sm font-bold text-brand-text">{t('orders.receipt_mapped_items')}</label>
                                <span className="text-xs font-mono text-brand-muted">
                                    {receiptRows.length} lines · {receiptRowsByOrder.length}{' '}
                                    {receiptRowsByOrder.length === 1 ? 'order' : 'orders'}
                                </span>
                                {receiptOrderMenusLoading && (
                                    <span className="text-xs text-brand-muted flex items-center gap-1">
                                        <Loader2 size={14} className="animate-spin" />
                                        {t('orders.loading_menu')}
                                    </span>
                                )}
                            </div>

                            <div className="space-y-6">
                                {receiptRowsByOrder.map(([orderId, blockRows]) => {
                                    const blockMeta = receiptExtractResult?.orders.find((o) => o.order_id === orderId);
                                    const blockTotal =
                                        blockMeta?.order_total_amount ??
                                        blockRows.reduce((s, r) => s + r.receiptLineTotal, 0);
                                    return (
                                        <React.Fragment key={`receipt-order-${orderId}`}>
                                            <ReceiptOrderBlockCard
                                                title={`ORDER ${orderId}`}
                                                blockTotalLabel={`TOTAL AMOUNT · ₱${blockTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                            >
                                                {blockRows.map((row) => {
                                                    const menu = row.menuId
                                                        ? receiptOrderMenus.find((m) => m.id === row.menuId)
                                                        : undefined;
                                                    const menuLine =
                                                        menu != null
                                                            ? Number(row.qty) * Number(menu.price || 0)
                                                            : 0;
                                                    return (
                                                        <div
                                                            key={row.id}
                                                            className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 shadow-sm"
                                                        >
                                                            <p className="text-sm font-medium text-brand-text leading-snug">{row.extractedName}</p>
                                                            {row.menuSelection ? (
                                                                <p className="text-xs text-brand-muted mt-1.5">{row.menuSelection}</p>
                                                            ) : null}
                                                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-[minmax(0,7rem)_1fr] gap-3 sm:items-end">
                                                                <div className="space-y-1">
                                                                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">
                                                                        {t('orders.qty')}
                                                                    </label>
                                                                    <input
                                                                        type="number"
                                                                        min={0.01}
                                                                        step={0.01}
                                                                        value={row.qty}
                                                                        onChange={(e) =>
                                                                            updateReceiptRowQty(row.id, Number(e.target.value))
                                                                        }
                                                                        className="w-full min-h-[44px] bg-white border border-gray-200 rounded-xl px-3 py-2 text-right text-sm font-mono"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1 min-w-0">
                                                                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">
                                                                        {t('orders.menu_item')}
                                                                    </label>
                                                                    <Select2
                                                                        options={receiptOrderMenus.map((m) => ({
                                                                            value: m.id,
                                                                            label: `${m.name} — ₱${Number(m.price).toLocaleString()}`,
                                                                        }))}
                                                                        value={row.menuId || null}
                                                                        onChange={(v) => updateReceiptRowMenu(row.id, v ? String(v) : null)}
                                                                        placeholder={t('orders.select_menu_item')}
                                                                        disabled={receiptOrderMenusLoading}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                                <span className="text-xs text-brand-muted">
                                                                    {t('orders.menu_item')} total:{' '}
                                                                    <span className="font-semibold text-brand-text tabular-nums">
                                                                        {menu ? `₱${menuLine.toLocaleString()}` : '—'}
                                                                    </span>
                                                                </span>
                                                                <span className="text-xs font-mono text-brand-muted text-right">
                                                                    Receipt line{' '}
                                                                    <span className="text-sm font-semibold text-brand-text tabular-nums">
                                                                        ₱{row.receiptLineTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                                    </span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </ReceiptOrderBlockCard>
                                        </React.Fragment>
                                    );
                                })}
                            </div>

                            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                                <span className="font-bold text-brand-text">{t('orders.grand_total')} (menu)</span>
                                <span className="font-extrabold text-violet-600 tabular-nums">
                                    ₱{receiptPreviewSubtotal.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                                </span>
                            </div>
                            <p className="text-xs text-brand-muted">{t('orders.receipt_price_note')}</p>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Manual Order Modal (Settled immediately) */}
            <Modal
                isOpen={manualOrderOpen}
                onClose={closeManualOrder}
                title={t('orders.create_manual_order')}
                maxWidth="6xl"
                footer={
                    <div className="flex items-center justify-end gap-3">
                        <button onClick={closeManualOrder} disabled={manualOrderSubmitting} className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
                            {t('orders.cancel')}
                        </button>
                        <button onClick={submitManualOrder} disabled={manualOrderSubmitting} className="px-6 py-2.5 rounded-xl font-bold text-white bg-emerald-600 shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed">
                            {manualOrderSubmitting && <Loader2 size={16} className="animate-spin" />}
                            {t('orders.create_manual_order_btn')}
                        </button>
                    </div>
                }
            >
                <div className="space-y-6">
                    {/* Items section */}
                    <div className="space-y-3">
                        <label className="block text-sm font-bold text-brand-text mb-2">{t('orders.order_items')}</label>
                        <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-5">
                                <div className="space-y-3 h-[680px] flex flex-col">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setManualMenuPage((prev) => Math.max(1, prev - 1))}
                                            disabled={manualMenuPage <= 1}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-brand-muted hover:bg-gray-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                                        >
                                            <ChevronLeft size={14} />
                                            Prev
                                        </button>
                                        <span className="text-[11px] font-bold text-brand-muted min-w-[72px] text-center">
                                            {manualMenuPage} / {manualMenuTotalPages}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setManualMenuPage((prev) => Math.min(manualMenuTotalPages, prev + 1))}
                                            disabled={manualMenuPage >= manualMenuTotalPages}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-brand-muted hover:bg-gray-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                                        >
                                            Next
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                                        <input
                                            type="text"
                                            value={manualMenuQuery}
                                            onChange={(e) => setManualMenuQuery(e.target.value)}
                                            placeholder={t('orders.search_placeholder')}
                                            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                                        />
                                    </div>
                                    <div className="border border-gray-100 rounded-2xl bg-white overflow-hidden flex-1 min-h-0">
                                        <div className="h-full p-3">
                                            {manualOrderLoadingRefs ? (
                                                <div className="flex items-center justify-center py-10 text-brand-muted text-sm">
                                                    <Loader2 size={18} className="animate-spin mr-2" />
                                                    {t('orders.loading_menu')}
                                                </div>
                                            ) : filteredManualMenus.length === 0 ? (
                                                <div className="py-10 text-center text-sm text-brand-muted">
                                                    {t('orders.no_items_added')}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {paginatedManualMenus.map((m) => (
                                                        <button
                                                            key={m.id}
                                                            type="button"
                                                            onClick={() => addManualMenuById(String(m.id), 1)}
                                                            className="w-full text-left p-3 rounded-xl border border-gray-100 hover:border-brand-primary/30 hover:bg-brand-primary/5 transition-colors cursor-pointer"
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-bold text-brand-text truncate">{m.name}</p>
                                                                </div>
                                                                <div className="shrink-0 text-xs font-bold text-brand-primary">
                                                                    ₱{Number(m.price || 0).toLocaleString()}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-brand-muted">
                                        Click item para auto-add. Click ulit para dagdag qty.
                                    </p>
                                </div>
                            </div>
                            <div className="col-span-7">
                                <div className="space-y-4">
                                    {/* Header / basic info */}
                                    <div className="grid grid-cols-12 gap-3">
                                        {isAllBranches && (
                                            <div className="space-y-1.5 col-span-3">
                                                <label className="block text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                                                    {t('header.select_branch')}
                                                </label>
                                                <Select2
                                                    options={manualBranchOptions}
                                                    value={manualOrderBranchId || null}
                                                    onChange={(v) => { setManualOrderBranchId(v ? String(v) : ''); setManualOrderTableId(''); }}
                                                    placeholder={t('header.select_branch')}
                                                />
                                            </div>
                                        )}
                                        <div className={cn("space-y-1.5", isAllBranches ? "col-span-3" : "col-span-4")}>
                                            <label className="block text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                                                {t('orders.order_no_label')}
                                            </label>
                                            <input
                                                type="text"
                                                value={manualOrderNo}
                                                onChange={(e) => setManualOrderNo(e.target.value)}
                                                placeholder={t('orders.order_no_placeholder')}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                                            />
                                        </div>
                                        <div className={cn("space-y-1.5", isAllBranches ? "col-span-3" : "col-span-4")}>
                                            <label className="block text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                                                {t('orders.order_type')}
                                            </label>
                                            <Select2
                                                options={[
                                                    { value: 'DINE_IN', label: t('orders.dine_in') },
                                                    { value: 'TAKE_OUT', label: t('orders.take_out') },
                                                    { value: 'DELIVERY', label: t('orders.delivery') },
                                                ]}
                                                value={manualOrderType}
                                                onChange={(v) =>
                                                    setManualOrderType((v as typeof manualOrderType) || 'DINE_IN')
                                                }
                                                placeholder={t('orders.select_type')}
                                            />
                                        </div>
                                        <div className={cn("space-y-1.5", isAllBranches ? "col-span-3" : "col-span-4")}>
                                            <label className="block text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                                                {t('table.table_number')}
                                            </label>
                                            <Select2
                                                options={isAllBranches ? manualBranchTables : branchTables}
                                                value={manualOrderTableId || null}
                                                onChange={(v) => setManualOrderTableId(v ? String(v) : '')}
                                                placeholder={t('table.table_number')}
                                            />
                                        </div>
                                        {/* Keep date on its own row for cleaner alignment */}
                                        <div className="space-y-1.5 col-span-12">
                                            <label className="block text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                                                {t('orders.date') ?? 'Date'}
                                            </label>
                                            <input
                                                type="date"
                                                value={manualOrderDate}
                                                onChange={(e) => setManualOrderDate(e.target.value)}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all"
                                            />
                                        </div>
                                    </div>

                                    {/* Payment */}
                                    <div className="grid grid-cols-12 gap-3">
                                        <div className="space-y-1.5 col-span-4">
                                            <label className="block text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                                                {t('billing.payment_method')}
                                            </label>
                                            <Select2
                                                options={[
                                                    { value: 'CASH', label: 'CASH' },
                                                    { value: 'CARD', label: 'CARD' },
                                                    { value: 'GCASH', label: 'GCASH' },
                                                    { value: 'BANK', label: 'BANK' },
                                                ]}
                                                value={manualPaymentMethod}
                                                onChange={(v) => setManualPaymentMethod((v as any) || 'CASH')}
                                                placeholder={t('billing.payment_method')}
                                            />
                                        </div>
                                        <div className="space-y-1.5 col-span-8">
                                            <label className="block text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                                                {t('billing.payment_reference')}
                                            </label>
                                            <input
                                                type="text"
                                                value={manualPaymentRef}
                                                onChange={(e) => setManualPaymentRef(e.target.value)}
                                                placeholder={t('billing.payment_reference_placeholder')}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                                            />
                                            <p className="text-[11px] text-brand-muted">
                                                {t('orders.manual_order_payment_helper')}
                                            </p>
                                        </div>
                                        <div className="space-y-1.5 col-span-12">
                                            <label className="block text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                                                {t('orders.discount')}
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                value={manualDiscountAmount}
                                                onChange={(e) => setManualDiscountAmount(e.target.value)}
                                                placeholder="0.00"
                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/50 outline-none transition-all placeholder:text-gray-400"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 border border-gray-100 rounded-xl overflow-hidden bg-white">
                                    {manualDisplayOrderItems.length === 0 ? (
                                        <div className="p-4 text-sm text-brand-muted text-center">
                                            {t('orders.no_items_added')}
                                        </div>
                                    ) : (
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-4 py-2 text-left font-bold text-brand-muted text-xs">
                                                        {t('orders.item')}
                                                    </th>
                                                    <th className="px-3 py-2 text-center font-bold text-brand-muted text-xs w-[120px]">
                                                        {t('orders.qty')}
                                                    </th>
                                                    <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">
                                                        {t('orders.unit')}
                                                    </th>
                                                    <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">
                                                        {t('orders.line_total')}
                                                    </th>
                                                    <th className="px-4 py-2 w-12"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {manualDisplayOrderItems.map((it) => {
                                                    const isRoomChargeRow = it.menuId === MANUAL_ROOM_CHARGE_ITEM_ID;
                                                    return (
                                                    <tr
                                                        key={it.menuId}
                                                        className={cn(
                                                            'transition-colors duration-700',
                                                            manualRowFlash?.menuId === it.menuId && 'bg-indigo-50'
                                                        )}
                                                    >
                                                        <td className="px-4 py-2 font-medium">{it.name}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            {isRoomChargeRow ? (
                                                                <div className="flex items-center justify-center gap-3">
                                                                    <button
                                                                        type="button"
                                                                            onClick={() => {
                                                                                setManualRoomChargeQty((prev) => roundToHalf(Math.max(0, prev - 0.5)));
                                                                                setManualRowFlash({ menuId: MANUAL_ROOM_CHARGE_ITEM_ID, nonce: Date.now() });
                                                                            }}
                                                                            disabled={it.qty <= 0}
                                                                        className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-brand-muted font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                                                        title="Decrease"
                                                                    >
                                                                        −
                                                                    </button>
                                                                    <span className="inline-block w-8 text-center font-bold">
                                                                        {it.qty}
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                            onClick={() => {
                                                                                setManualRoomChargeQty((prev) => roundToHalf(prev + 0.5));
                                                                                setManualRowFlash({ menuId: MANUAL_ROOM_CHARGE_ITEM_ID, nonce: Date.now() });
                                                                            }}
                                                                        className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-brand-muted font-bold cursor-pointer"
                                                                        title="Increase"
                                                                    >
                                                                        +
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center justify-center gap-3">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => decManualOrderItemQty(it.menuId)}
                                                                        className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-brand-muted font-bold cursor-pointer"
                                                                        title="Decrease"
                                                                    >
                                                                        −
                                                                    </button>
                                                                    <span className="inline-block w-8 text-center font-bold">
                                                                        {it.qty}
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => addManualMenuById(it.menuId, 1)}
                                                                        className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-brand-muted font-bold cursor-pointer"
                                                                        title="Increase"
                                                                    >
                                                                        +
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2 text-right">
                                                            ₱{Number(it.unitPrice).toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-2 text-right font-bold">
                                                            ₱{Number(it.qty * it.unitPrice).toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-2 text-right">
                                                            {isRoomChargeRow ? null : (
                                                                <button
                                                                    onClick={() => removeManualOrderItem(it.menuId)}
                                                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                    );
                                                })}
                                            </tbody>
                                            {manualDisplayOrderItems.length > 0 && (
                                                <tfoot className="bg-gray-50">
                                                    <tr>
                                                        <td
                                                            className="px-4 py-2 text-right font-bold text-brand-text"
                                                            colSpan={3}
                                                        >
                                                            {t('orders.grand_total')}
                                                        </td>
                                                        <td className="px-4 py-2 text-right font-extrabold text-emerald-700">
                                                            ₱
                                                            {manualGrandTotalPreview.toLocaleString(undefined, {
                                                                minimumFractionDigits: 0,
                                                            })}
                                                        </td>
                                                        <td></td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </Modal>

            {/* Detail Modal */}
            <Modal
                isOpen={!!detailOrder}
                onClose={closeDetail}
                title={detailOrder ? `${t('orders.order_no')} ${detailOrder.ORDER_NO}` : t('orders.view_details')}
                maxWidth="2xl"
            >
                {detailOrder && (
                    <div className="space-y-6">
                        {/* Summary header */}
                        <div className="grid grid-cols-4 gap-4 bg-gray-50 rounded-2xl p-5 border border-gray-100">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                                    {t('orders.status')}
                                </p>
                                <div>{statusBadge(detailOrder.STATUS)}</div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                                    {t('orders.type')}
                                </p>
                                <div>{orderTypeBadge(detailOrder.ORDER_TYPE)}</div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                                    {t('orders.table')}
                                </p>
                                <p className="text-sm font-bold mt-0.5">
                                    {detailOrder.TABLE_NUMBER ?? '—'}
                                </p>
                            </div>
                            <div className="space-y-1 text-right">
                                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                                    {t('orders.grand_total')}
                                </p>
                                <p className="text-2xl font-extrabold text-brand-primary mt-0.5">
                                    ₱
                                    {Number(detailOrder.GRAND_TOTAL).toLocaleString(undefined, {
                                        minimumFractionDigits: 0,
                                    })}
                                </p>
                            </div>
                        </div>

                        {/* Items table */}
                        <div className="space-y-4">
                            <label className="block text-sm font-bold text-brand-text mb-2">{t('orders.order_items')}</label>
                            {detailLoading ? (
                                <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-brand-primary" /></div>
                            ) : detailItems.length === 0 &&
                                !((detailOrder?.STATUS === ORDER_STATUS.SETTLED || detailOrder?.STATUS === ORDER_STATUS.CANCELLED) && Number(detailOrder?.SERVICE_CHARGE) > 0) ? (
                                <p className="text-sm text-brand-muted py-4">{t('orders.no_items_added')}</p>
                            ) : (
                                <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-2 text-left font-bold text-brand-muted text-xs">{t('orders.item')}</th>
                                                <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">{t('orders.qty')}</th>
                                                <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">{t('orders.unit')}</th>
                                                <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs">{t('orders.line_total')}</th>
                                                {detailOrder.STATUS !== ORDER_STATUS.SETTLED && detailOrder.STATUS !== ORDER_STATUS.CANCELLED && (
                                                    <th className="px-4 py-2 text-right font-bold text-brand-muted text-xs w-24">{t('orders.actions')}</th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {(detailOrder.STATUS === ORDER_STATUS.SETTLED || detailOrder.STATUS === ORDER_STATUS.CANCELLED) &&
                                                Number(detailOrder.SERVICE_CHARGE) > 0 && (
                                                    <tr key="__ROOM_CHARGE__">
                                                        <td className="px-4 py-2 font-medium">
                                                            {detailIsRoomCharge
                                                                ? (t('table.room_charge') ?? 'Room charge')
                                                                : (t('orders.service_charge') ?? 'Service charge')}
                                                        </td>
                                                        <td className="px-4 py-2 text-right">{detailRoomChargeQtyForRow}</td>
                                                        <td className="px-4 py-2 text-right">₱{Number(detailRoomChargeUnitForRow).toLocaleString()}</td>
                                                        <td className="px-4 py-2 text-right font-bold">₱{Number(detailServiceCharge).toLocaleString()}</td>
                                                        {detailOrder.STATUS !== ORDER_STATUS.SETTLED && detailOrder.STATUS !== ORDER_STATUS.CANCELLED && (
                                                            <td className="px-4 py-2 text-right"></td>
                                                        )}
                                                    </tr>
                                                )}
                                            {detailItems.map((item) => {
                                                const isEditing = editingItemId === item.IDNo;
                                                return (
                                                    <tr key={item.IDNo}>
                                                        <td className="px-4 py-2">{item.MENU_NAME ?? `Menu #${item.MENU_ID}`}</td>
                                                        <td className="px-4 py-2 text-right">
                                                            {isEditing ? (
                                                                <input
                                                                    type="number"
                                                                    min={1}
                                                                    value={editingQty}
                                                                    onChange={(e) => setEditingQty(Number(e.target.value))}
                                                                    className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-right text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
                                                                />
                                                            ) : (
                                                                item.QTY
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2 text-right">₱{Number(item.UNIT_PRICE).toLocaleString()}</td>
                                                        <td className="px-4 py-2 text-right font-bold">₱{Number(item.LINE_TOTAL).toLocaleString()}</td>
                                                        {detailOrder.STATUS !== ORDER_STATUS.SETTLED && detailOrder.STATUS !== ORDER_STATUS.CANCELLED && (
                                                            <td className="px-4 py-2 text-right">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    {isEditing ? (
                                                                        <>
                                                                            <button
                                                                                onClick={() => submitEditItem(item)}
                                                                                disabled={itemUpdating}
                                                                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50 transition-colors"
                                                                                title={t('orders.save_item')}
                                                                            >
                                                                                <Check size={16} />
                                                                            </button>
                                                                            <button
                                                                                onClick={cancelEditItem}
                                                                                disabled={itemUpdating}
                                                                                className="p-2 text-brand-muted hover:bg-gray-50 rounded-lg disabled:opacity-50 transition-colors"
                                                                                title={t('orders.cancel')}
                                                                            >
                                                                                <X size={16} />
                                                                            </button>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <button
                                                                                onClick={() => startEditItem(item)}
                                                                                disabled={itemRemoving || itemUpdating}
                                                                                className="p-2 text-brand-muted hover:bg-gray-50 rounded-lg disabled:opacity-50 transition-colors"
                                                                                title={t('orders.edit_item')}
                                                                            >
                                                                                <Pencil size={16} />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => confirmRemoveItem(item)}
                                                                                disabled={itemRemoving || itemUpdating}
                                                                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50 transition-colors"
                                                                                title={t('orders.remove_item')}
                                                                            >
                                                                                <Trash2 size={16} />
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Additional items (add menu to this order) */}
                        {canUpdate('orders') && detailOrder.STATUS !== ORDER_STATUS.SETTLED && detailOrder.STATUS !== ORDER_STATUS.CANCELLED && (
                            <div className="space-y-3 pt-2 border-t border-gray-100">
                                <p className="text-xs font-bold text-brand-muted uppercase tracking-widest">
                                    {t('orders.additional_items')}
                                </p>
                                <div className="grid grid-cols-12 gap-3 items-end">
                                    <div className="col-span-7">
                                        <Select2
                                            options={detailMenus
                                                .filter((m) => !detailItems.some((it) => Number(it.MENU_ID) === Number(m.id)))
                                                .map((m) => ({
                                                    value: m.id,
                                                    label: `${m.name} — ₱${Number(m.price).toLocaleString()}`,
                                                }))}
                                            value={detailSelectedMenuId || null}
                                            onChange={(v) => setDetailSelectedMenuId(v ? String(v) : '')}
                                            placeholder={
                                                detailMenusLoading
                                                    ? t('orders.loading_menu')
                                                    : t('orders.select_item')
                                            }
                                            disabled={detailMenusLoading || detailAdding}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <input
                                            type="number"
                                            min={1}
                                            value={detailAddQty}
                                            onChange={(e) => setDetailAddQty(Number(e.target.value))}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="col-span-3">
                                        <button
                                            type="button"
                                            onClick={addDetailOrderItem}
                                            disabled={detailMenusLoading || detailAdding}
                                            className="w-full px-3 py-3 rounded-xl bg-brand-primary text-white font-bold text-sm hover:bg-brand-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-1"
                                        >
                                            {detailAdding && <Loader2 size={14} className="animate-spin" />}
                                            {!detailAdding && <Plus size={14} />}
                                            {t('orders.add')}
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[11px] text-brand-muted">
                                    {t('orders.additional_items_helper')}
                                </p>
                            </div>
                        )}

                        {canUpdate('orders') && detailOrder.STATUS !== ORDER_STATUS.SETTLED && detailOrder.STATUS !== ORDER_STATUS.CANCELLED && (
                            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                                {detailOrder.STATUS === ORDER_STATUS.PENDING && (
                                    <button
                                        onClick={() => { closeDetail(); confirmUpdateStatus(detailOrder, ORDER_STATUS.CONFIRMED); }}
                                        disabled={statusSubmitting}
                                        className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle2 size={16} /> {t('orders.confirmed')}
                                    </button>
                                )}
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
                                        swal.type === 'error' ? 'bg-red-500 hover:bg-red-600' : swal.type === 'success' ? 'bg-green-500 hover:bg-green-600' : swal.type === 'question' ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-primary hover:opacity-90')}>
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
