// ---- Types ----

export type OrderRecord = {
    IDNo: number;
    BRANCH_ID: number;
    BRANCH_NAME?: string;
    BRANCH_CODE?: string;
    ORDER_NO: string;
    TABLE_ID: number | null;
    TABLE_NUMBER?: string | null;
    ORDER_TYPE?: string | null;
    STATUS: number;
    SUBTOTAL: number;
    TAX_AMOUNT: number;
    SERVICE_CHARGE: number;
    DISCOUNT_AMOUNT: number;
    GRAND_TOTAL: number;
    ENCODED_DT: string;
    ENCODED_BY?: number | null;
    ENCODED_BY_NAME?: string | null;
    payment_method?: string | null;
};

export type OrderItemRecord = {
    IDNo: number;
    ORDER_ID: number;
    MENU_ID: number;
    MENU_NAME?: string;
    QTY: number;
    UNIT_PRICE: number;
    LINE_TOTAL: number;
    STATUS: number;
    REMARKS?: string | null;
    PREPARED_BY?: string | null;
};

export type CreateOrderItemPayload = {
    menu_id: number;
    qty: number;
    unit_price: number;
    line_total: number;
    status?: number;
    remarks?: string | null;
};

export type CreateOrderPayload = {
    ORDER_NO: string;
    BRANCH_ID?: string | number;
    TABLE_ID?: number | null;
    ORDER_TYPE?: string | null;
    STATUS?: number;
    SUBTOTAL?: number;
    TAX_AMOUNT?: number;
    SERVICE_CHARGE?: number;
    DISCOUNT_AMOUNT?: number;
    GRAND_TOTAL?: number;
    ORDER_ITEMS?: CreateOrderItemPayload[];
    order_no?: string;
    branch_id?: string | number;
    table_id?: number | null;
    order_type?: string | null;
    items?: CreateOrderItemPayload[];
};

// ---- API internals ----

type ApiResponse<T> = {
    success: boolean;
    data: T;
    message?: string;
    error?: string;
};

// Use /data-api prefix — Vite proxy rewrites to root on backend
const API_BASE = '/data-api';

const buildUrl = (path: string, params?: Record<string, string>) => {
    const url = new URL(`${window.location.origin}${API_BASE}${path}`);
    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== '') {
                url.searchParams.set(key, value);
            }
        });
    }
    return url.toString();
};

const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
};

const handleResponse = async <T>(response: Response): Promise<T> => {
    const json = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !json.success) {
        throw new Error(json.error || 'Request failed');
    }
    return json.data;
};

// ---- Order status helpers ----

/** Order status: 3=PENDING, 2=CONFIRMED/PREPARING, 1=SETTLED, -1=CANCELLED */
export const ORDER_STATUS = {
    PENDING: 3,
    CONFIRMED: 2,
    SETTLED: 1,
    CANCELLED: -1,
} as const;

export function getOrderStatusLabel(status: number): string {
    switch (status) {
        case 3: return 'Pending';
        case 2: return 'Confirmed';
        case 1: return 'Settled';
        case -1: return 'Cancelled';
        default: return `Status ${status}`;
    }
}

// ---- Public API ----

export async function getOrders(branchId: string | null): Promise<OrderRecord[]> {
    const params: Record<string, string> = {
        branch_id: branchId && branchId !== 'all' ? branchId : 'all',
    };
    const response = await fetch(buildUrl('/orders/data', params), {
        credentials: 'include',
        headers: authHeaders(),
    });
    return handleResponse<OrderRecord[]>(response);
}

export async function getOrderById(id: string): Promise<OrderRecord | null> {
    const response = await fetch(buildUrl(`/orders/${id}`), {
        credentials: 'include',
        headers: authHeaders(),
    });
    if (response.status === 404) return null;
    return handleResponse<OrderRecord>(response);
}

export async function getOrderItems(orderId: string): Promise<OrderItemRecord[]> {
    const response = await fetch(buildUrl(`/orders/${orderId}/items`), {
        credentials: 'include',
        headers: authHeaders(),
    });
    return handleResponse<OrderItemRecord[]>(response);
}

export async function updateOrderStatus(orderId: string, status: number): Promise<void> {
    const response = await fetch(buildUrl(`/orders/${orderId}/status`), {
        method: 'PATCH',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
        },
        body: JSON.stringify({ status }),
    });
    await handleResponse<{ order_id: number; status: number }>(response);
}

export type InventoryInsufficientItem = {
    ingredientName: string;
    required: number;
    available: number;
    unit: string;
};

export class InventoryInsufficientError extends Error {
    insufficient: InventoryInsufficientItem[];
    constructor(message: string, insufficient: InventoryInsufficientItem[]) {
        super(message);
        this.name = 'InventoryInsufficientError';
        this.insufficient = insufficient;
    }
}

export async function createOrder(payload: CreateOrderPayload): Promise<{ id: number; order_no: string }> {
    const response = await fetch(buildUrl('/orders'), {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
        },
        body: JSON.stringify(payload),
    });
    const json = (await response.json()) as ApiResponse<{ id: number; order_no: string }> & { insufficient?: InventoryInsufficientItem[] };
    if (!response.ok || !json.success) {
        if (json.insufficient?.length) {
            throw new InventoryInsufficientError(json.error || 'Insufficient inventory', json.insufficient);
        }
        throw new Error(json.error || 'Request failed');
    }
    return json.data!;
}

export async function deleteOrderItem(orderItemId: string): Promise<void> {
    const response = await fetch(buildUrl(`/order_items/${orderItemId}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
    });
    await handleResponse<null>(response);
}

export async function updateOrderItemQuantity(orderItemId: string, qty: number): Promise<void> {
    const response = await fetch(buildUrl(`/order_items/${orderItemId}`), {
        method: 'PUT',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
        },
        body: JSON.stringify({ qty }),
    });
    const json = (await response.json()) as ApiResponse<{ item_id: number; new_subtotal: number; new_grand_total: number }> & { insufficient?: InventoryInsufficientItem[] };
    if (!response.ok || !json.success) {
        if (json.insufficient?.length) {
            throw new InventoryInsufficientError(json.error || 'Insufficient inventory', json.insufficient);
        }
        throw new Error(json.error || 'Request failed');
    }
}
