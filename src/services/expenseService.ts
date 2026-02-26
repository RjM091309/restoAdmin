// ---- Types ----

export interface ExpenseRecord {
  id: string;
  branchId: string;
  branchName: string | null;
  masterCatId: string | null;
  expCat: string;
  expName: string;
  expDesc: string | null;
  expAmount: number;
  expSource: string | null;
  encodedBy: string | null;
  encodedDt: string | null;
  active: boolean;
}

// ---- API internals ----

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
};

type ExpenseApiRecord = {
  IDNo: number;
  BRANCH_ID: number;
  BRANCH_NAME?: string | null;
  MASTER_CAT_ID?: number | null;
  EXP_CAT: string;
  EXP_NAME: string;
  EXP_DESC?: string | null;
  EXP_AMOUNT: number | string;
  EXP_SOURCE?: string | null;
  ACTIVE: number | boolean;
  ENCODED_BY?: string | null;
  ENCODED_DT?: string | null;
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

const mapExpense = (row: ExpenseApiRecord): ExpenseRecord => ({
  id: String(row.IDNo),
  branchId: String(row.BRANCH_ID),
  branchName: row.BRANCH_NAME ?? null,
  masterCatId: row.MASTER_CAT_ID !== undefined && row.MASTER_CAT_ID !== null ? String(row.MASTER_CAT_ID) : null,
  expCat: row.EXP_CAT,
  expName: row.EXP_NAME,
  expDesc: row.EXP_DESC ?? null,
  expAmount: typeof row.EXP_AMOUNT === 'string' ? Number(row.EXP_AMOUNT) : Number(row.EXP_AMOUNT || 0),
  expSource: row.EXP_SOURCE ?? null,
  encodedBy: row.ENCODED_BY ?? null,
  encodedDt: row.ENCODED_DT ?? null,
  active: Boolean(row.ACTIVE),
});

// ---- Public API ----

export const getExpenses = async (branchId?: string): Promise<ExpenseRecord[]> => {
  const params: Record<string, string> = {
    branch_id: branchId && branchId !== 'all' ? branchId : '',
  };
  const response = await fetch(buildUrl('/expenses', params), {
    credentials: 'include',
    headers: authHeaders(),
  });
  const rows = await handleResponse<ExpenseApiRecord[]>(response);
  return rows.map(mapExpense);
};

export type CreateExpensePayload = {
  branchId: string;
  masterCatId: string;
  expDesc: string | null;
  expAmount: number;
  expSource: string | null;
};

export async function createExpense(payload: CreateExpensePayload): Promise<number> {
  const response = await fetch(buildUrl('/expenses'), {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
    body: JSON.stringify({
      BRANCH_ID: payload.branchId,
      MASTER_CAT_ID: payload.masterCatId,
      EXP_DESC: payload.expDesc,
      EXP_AMOUNT: payload.expAmount,
      EXP_SOURCE: payload.expSource,
    }),
  });
  const json = (await response.json()) as ApiResponse<{ id: number }>;
  if (!response.ok || !json.success) {
    throw new Error(json.error || 'Failed to create expense');
  }
  return json.data?.id ?? 0;
}

export type UpdateExpensePayload = {
  masterCatId: string;
  expDesc: string | null;
  expAmount: number;
  expSource: string | null;
};

export async function updateExpense(id: string, payload: UpdateExpensePayload): Promise<void> {
  const response = await fetch(buildUrl(`/expenses/${id}`), {
    method: 'PUT',
    credentials: 'include',
    headers: authHeaders(),
    body: JSON.stringify({
      MASTER_CAT_ID: payload.masterCatId,
      EXP_DESC: payload.expDesc,
      EXP_AMOUNT: payload.expAmount,
      EXP_SOURCE: payload.expSource,
    }),
  });
  const json = (await response.json()) as ApiResponse<null>;
  if (!response.ok || !json.success) {
    throw new Error(json.error || 'Failed to update expense');
  }
}

export async function deleteExpense(id: string): Promise<void> {
  const response = await fetch(buildUrl(`/expenses/${id}`), {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  });
  const json = (await response.json()) as ApiResponse<null>;
  if (!response.ok || !json.success) {
    throw new Error(json.error || 'Failed to delete expense');
  }
}

