// ---- Types ----

export interface OperationCategory {
  id: string;
  branchId: string | null;
  name: string;
  description: string | null;
  active: boolean;
}

// ---- API internals ----

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
};

type OperationCategoryApiRecord = {
  IDNo: number;
  BRANCH_ID: number | null;
  NAME: string;
  DESCRIPTION: string | null;
  ACTIVE: number | boolean;
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

const handleResponse = async <T,>(response: Response): Promise<T> => {
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.success) {
    throw new Error(json.error || 'Request failed');
  }
  return json.data;
};

const mapOperationCategory = (row: OperationCategoryApiRecord): OperationCategory => ({
  id: String(row.IDNo),
  branchId: row.BRANCH_ID != null ? String(row.BRANCH_ID) : null,
  name: row.NAME,
  description: row.DESCRIPTION,
  active: Boolean(row.ACTIVE),
});

// ---- Public API ----

export const getOperationCategories = async (branchId?: string | null): Promise<OperationCategory[]> => {
  const params: Record<string, string> = {
    branch_id: branchId && branchId !== 'all' ? String(branchId) : '',
  };

  const response = await fetch(buildUrl('/operation-category', params), {
    credentials: 'include',
    headers: authHeaders(),
  });

  const rows = await handleResponse<OperationCategoryApiRecord[]>(response);
  return rows.map(mapOperationCategory);
};

