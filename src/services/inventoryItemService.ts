type ApiResponse<T> = {
	success: boolean;
	data: T;
	message?: string;
	error?: string;
};

type InventoryItemApiRecord = {
	IDNo: number;
	BRANCH_ID: number;
	ITEM_CODE: string;
	ITEM_NAME: string;
	CATEGORY_ID: number | null;
	CATEGORY_NAME: string | null;
	STOCK_QTY: number | string;
	UNIT: string;
	UNIT_COST: number | string;
	REORDER_LEVEL: number | string;
	STATUS_FLAG: string;
	ACTIVE: number | boolean;
};

export type InventoryItem = {
	id: string;
	branchId: string;
	itemCode: string;
	itemName: string;
	categoryId: string | null;
	categoryName: string | null;
	stockQty: number;
	unit: string;
	unitCost: number;
	reorderLevel: number;
	statusFlag: string;
	active: boolean;
};

export type SaveInventoryItemPayload = {
	branchId?: string;
	itemName: string;
	categoryId?: string | null;
	categoryName?: string | null;
	stockQty: number;
	unit: string;
	unitCost: number;
	reorderLevel: number;
	statusFlag: string;
};

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
	const headers: Record<string, string> = {
		Accept: 'application/json',
		'Content-Type': 'application/json',
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
};

const toNumber = (value: number | string | null | undefined) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

const mapItemRecord = (row: InventoryItemApiRecord): InventoryItem => ({
	id: String(row.IDNo),
	branchId: String(row.BRANCH_ID),
	itemCode: row.ITEM_CODE,
	itemName: row.ITEM_NAME,
	categoryId: row.CATEGORY_ID !== null && row.CATEGORY_ID !== undefined ? String(row.CATEGORY_ID) : null,
	categoryName: row.CATEGORY_NAME || null,
	stockQty: toNumber(row.STOCK_QTY),
	unit: row.UNIT || 'pcs',
	unitCost: toNumber(row.UNIT_COST),
	reorderLevel: toNumber(row.REORDER_LEVEL),
	statusFlag: row.STATUS_FLAG || 'In Stock',
	active: Boolean(row.ACTIVE),
});

const handleResponse = async <T>(response: Response): Promise<T> => {
	const json = (await response.json()) as ApiResponse<T>;
	if (!response.ok || !json.success) {
		throw new Error(json.error || 'Request failed');
	}
	return json.data;
};

export async function getInventoryItems(branchId?: string): Promise<InventoryItem[]> {
	const params: Record<string, string> = {
		branch_id: branchId && branchId !== 'all' ? branchId : '',
	};
	const response = await fetch(buildUrl('/inventory/items', params), {
		credentials: 'include',
		headers: authHeaders(),
	});
	const data = await handleResponse<InventoryItemApiRecord[]>(response);
	return data.map(mapItemRecord);
}

export async function createInventoryItem(payload: SaveInventoryItemPayload): Promise<number> {
	const response = await fetch(buildUrl('/inventory/items'), {
		method: 'POST',
		credentials: 'include',
		headers: authHeaders(),
		body: JSON.stringify({
			BRANCH_ID: payload.branchId,
			ITEM_NAME: payload.itemName,
			CATEGORY_ID: payload.categoryId,
			CATEGORY_NAME: payload.categoryName,
			STOCK_QTY: payload.stockQty,
			UNIT: payload.unit,
			UNIT_COST: payload.unitCost,
			REORDER_LEVEL: payload.reorderLevel,
			STATUS_FLAG: payload.statusFlag,
		}),
	});
	const json = (await response.json()) as ApiResponse<{ id: number }>;
	if (!response.ok || !json.success) {
		throw new Error(json.error || 'Failed to create inventory item');
	}
	return json.data?.id ?? 0;
}

export async function updateInventoryItem(id: string, payload: SaveInventoryItemPayload): Promise<void> {
	const response = await fetch(buildUrl(`/inventory/items/${id}`), {
		method: 'PUT',
		credentials: 'include',
		headers: authHeaders(),
		body: JSON.stringify({
			ITEM_NAME: payload.itemName,
			CATEGORY_ID: payload.categoryId,
			CATEGORY_NAME: payload.categoryName,
			STOCK_QTY: payload.stockQty,
			UNIT: payload.unit,
			UNIT_COST: payload.unitCost,
			REORDER_LEVEL: payload.reorderLevel,
			STATUS_FLAG: payload.statusFlag,
		}),
	});
	const json = (await response.json()) as ApiResponse<null>;
	if (!response.ok || !json.success) {
		throw new Error(json.error || 'Failed to update inventory item');
	}
}

export async function deleteInventoryItem(id: string): Promise<void> {
	const response = await fetch(buildUrl(`/inventory/items/${id}`), {
		method: 'DELETE',
		credentials: 'include',
		headers: authHeaders(),
	});
	const json = (await response.json()) as ApiResponse<null>;
	if (!response.ok || !json.success) {
		throw new Error(json.error || 'Failed to delete inventory item');
	}
}
