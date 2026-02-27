// ---- Types ----

export interface MenuCategory {
    id: string;
    name: string;
    branchId: string | null;
}

export interface MenuRecord {
    id: string;
    branchId: string;
    branchName: string;
    branchCode: string;
    branchLabel?: string;
    categoryId: string | null;
    categoryName: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    price: number;
    isAvailable: boolean;
    active: boolean;
    encodedBy: string;
    encodedAt: string;
    editedBy: string | null;
    editedAt: string | null;
    inventoryTracked?: boolean;
    inventoryAvailable?: boolean;
    inventoryStock?: number | null;
    effectiveAvailable?: boolean;
}

// ---- API internals ----

type ApiResponse<T> = {
    success: boolean;
    data: T;
    message?: string;
    error?: string;
};

type MenuApiRecord = {
    IDNo: number;
    BRANCH_ID: number;
    BRANCH_NAME?: string;
    BRANCH_CODE?: string;
    BRANCH_LABEL?: string;
    CATEGORY_ID?: number | null;
    CATEGORY_NAME?: string;
    MENU_NAME?: string;
    MENU_DESCRIPTION?: string | null;
    MENU_IMG?: string | null;
    MENU_PRICE?: number | string;
    IS_AVAILABLE?: number | boolean;
    ACTIVE?: number | boolean;
    ENCODED_BY?: string;
    ENCODED_DT?: string;
    EDITED_BY?: string | null;
    EDITED_DT?: string | null;
    INVENTORY_TRACKED?: number | boolean;
    INVENTORY_AVAILABLE?: number | boolean;
    INVENTORY_STOCK?: number | string | null;
    EFFECTIVE_AVAILABLE?: number | boolean;
};

type CategoryApiRecord = {
    IDNo: number;
    CATEGORY_NAME?: string;
    BRANCH_ID?: number | null;
};

// Menu API calls use /data-api prefix to avoid conflict with SPA /menu route
// Vite proxy rewrites /data-api/menus → /menus on the backend
const API_BASE = '/data-api';

const buildUrl = (path: string, params?: Record<string, string>) => {
    const url = new URL(`${window.location.origin}${API_BASE}${path}`);
    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value) url.searchParams.set(key, value);
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

const mapMenuRecord = (row: MenuApiRecord): MenuRecord => ({
    id: String(row.IDNo),
    branchId: String(row.BRANCH_ID ?? ''),
    branchName: row.BRANCH_NAME || '',
    branchCode: row.BRANCH_CODE || '',
    branchLabel: row.BRANCH_LABEL,
    categoryId: row.CATEGORY_ID !== null && row.CATEGORY_ID !== undefined ? String(row.CATEGORY_ID) : null,
    categoryName: row.CATEGORY_NAME || 'Uncategorized',
    name: row.MENU_NAME || '',
    description: row.MENU_DESCRIPTION ?? null,
    imageUrl: row.MENU_IMG ?? null,
    price: Number(row.MENU_PRICE ?? 0),
    isAvailable:
        row.EFFECTIVE_AVAILABLE === undefined ? Boolean(row.IS_AVAILABLE) : Boolean(row.EFFECTIVE_AVAILABLE),
    active: Boolean(row.ACTIVE),
    encodedBy: row.ENCODED_BY || '',
    encodedAt: row.ENCODED_DT || '',
    editedBy: row.EDITED_BY ?? null,
    editedAt: row.EDITED_DT ?? null,
    inventoryTracked: row.INVENTORY_TRACKED === undefined ? undefined : Boolean(row.INVENTORY_TRACKED),
    inventoryAvailable: row.INVENTORY_AVAILABLE === undefined ? undefined : Boolean(row.INVENTORY_AVAILABLE),
    inventoryStock:
        row.INVENTORY_STOCK === undefined || row.INVENTORY_STOCK === null
            ? null
            : Number(row.INVENTORY_STOCK),
    effectiveAvailable:
        row.EFFECTIVE_AVAILABLE === undefined ? Boolean(row.IS_AVAILABLE) : Boolean(row.EFFECTIVE_AVAILABLE),
});

const mapCategoryRecord = (row: CategoryApiRecord): MenuCategory => ({
    id: String(row.IDNo),
    name: row.CATEGORY_NAME || 'Uncategorized',
    branchId: row.BRANCH_ID !== undefined && row.BRANCH_ID !== null ? String(row.BRANCH_ID) : null,
});

// ---- Public API ----

export const getMenus = async (branchId?: string): Promise<MenuRecord[]> => {
    // Always send branch_id so the backend doesn't fall back to session branch
    const params: Record<string, string> = {
        branch_id: branchId && branchId !== 'all' ? branchId : 'all',
    };
    const response = await fetch(buildUrl('/menus', params), {
        credentials: 'include',
        headers: authHeaders(),
    });
    const data = await handleResponse<MenuApiRecord[]>(response);
    return data.map(mapMenuRecord);
};

export const getMenuCategories = async (branchId?: string): Promise<MenuCategory[]> => {
    // Always send branch_id so the backend doesn't fall back to session branch
    const params: Record<string, string> = {
        branch_id: branchId && branchId !== 'all' ? branchId : 'all',
    };
    const response = await fetch(buildUrl('/categories', params), {
        credentials: 'include',
        headers: authHeaders(),
    });
    const data = await handleResponse<CategoryApiRecord[]>(response);
    return data.map(mapCategoryRecord);
};

// --- Create / Update / Delete ---

export type CreateMenuPayload = {
    branchId: string;
    categoryId: string | null;
    name: string;
    description: string | null;
    price: number;
    isAvailable: boolean;
    imageFile?: File | null;
};

export type UpdateMenuPayload = {
    categoryId: string | null;
    name: string;
    description: string | null;
    price: number;
    isAvailable: boolean;
    existingImagePath?: string | null;
    imageFile?: File | null;
};

function buildFormData(
    body: Record<string, string | number | boolean | null>,
    file?: File | null,
    fileFieldName: string = 'MENU_IMG'
): FormData {
    const form = new FormData();
    Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            form.append(key, String(value));
        }
    });
    if (file) {
        form.append(fileFieldName, file);
    }
    return form;
}

export async function createMenu(payload: CreateMenuPayload): Promise<number> {
    const body: Record<string, string | number | boolean | null> = {
        BRANCH_ID: payload.branchId,
        CATEGORY_ID: payload.categoryId || '',
        MENU_NAME: payload.name,
        MENU_DESCRIPTION: payload.description || '',
        MENU_PRICE: payload.price,
        IS_AVAILABLE: payload.isAvailable ? 1 : 0,
    };
    const form = buildFormData(body, payload.imageFile ?? null);
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(buildUrl('/menu'), {
        method: 'POST',
        credentials: 'include',
        headers,
        body: form,
    });
    const json = (await response.json()) as ApiResponse<{ id: number }>;
    if (!response.ok || !json.success) {
        throw new Error(json.error || 'Failed to create menu');
    }
    return json.data?.id ?? 0;
}

function toRelativeImagePath(urlOrPath: string | null | undefined): string {
    if (!urlOrPath) return '';
    if (urlOrPath.startsWith('http')) {
        try {
            return new URL(urlOrPath).pathname;
        } catch {
            return urlOrPath;
        }
    }
    return urlOrPath;
}

export async function updateMenu(id: string, payload: UpdateMenuPayload): Promise<void> {
    const body: Record<string, string | number | boolean | null> = {
        CATEGORY_ID: payload.categoryId || '',
        MENU_NAME: payload.name,
        MENU_DESCRIPTION: payload.description || '',
        MENU_PRICE: payload.price,
        IS_AVAILABLE: payload.isAvailable ? 1 : 0,
        MENU_IMG: toRelativeImagePath(payload.existingImagePath) || '',
    };
    const form = buildFormData(body, payload.imageFile ?? null);
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(buildUrl(`/menu/${id}`), {
        method: 'PUT',
        credentials: 'include',
        headers,
        body: form,
    });
    const json = (await response.json()) as ApiResponse<null>;
    if (!response.ok || !json.success) {
        throw new Error(json.error || 'Failed to update menu');
    }
}

export async function deleteMenu(id: string): Promise<void> {
    const response = await fetch(buildUrl(`/menu/${id}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
    });
    const json = (await response.json()) as ApiResponse<null> & { error?: string };
    if (!response.ok || !json.success) {
        throw new Error(json.error || 'Failed to delete menu');
    }
}


/** Resolve a menu image URL for display. Uses relative path so requests go through the same origin (Vite proxy forwards /uploads to backend). */
export function resolveImageUrl(imageUrl: string | null): string | null {
    if (!imageUrl) return null;
    if (imageUrl.startsWith('http')) return imageUrl;
    // Use relative path - browser requests from same origin, proxy forwards to backend
    return imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
}
