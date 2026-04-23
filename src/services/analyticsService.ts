// Analytics can be served either by the Python service (preferred when configured)
// or by the Node backend (fallback) for environments where PyServer isn't reachable.
const ENV_BASE_URL = (import.meta as any).env?.VITE_ANALYTICS_BASE_URL as string | undefined;

const getAnalyticsBaseUrl = () => {
  // If VITE_ANALYTICS_BASE_URL is missing, use same-origin Node backend.
  // This prevents "no data" screens when PyServer isn't deployed.
  return (ENV_BASE_URL || '').trim();
};

const getAuthHeaders = (): Record<string, string> => {
  try {
    const token = (localStorage.getItem('token') || '').trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const isSameOriginUrl = (url: string) => url.startsWith('/') && !url.startsWith('//');

async function fetchJson(url: string): Promise<{ res: Response; json: any }> {
  const headers = isSameOriginUrl(url) ? getAuthHeaders() : {};
  const res = await fetch(url, { headers });
  const json = await res.json().catch(() => null);
  return { res, json };
}

export type ApiBranchSalesItem = {
  branch_id: number;
  branch_name: string;
  branch_code: string;
  total_sales: number;
  order_count: number;
  avg_order_value: number;
};

export type ApiLeastSellingItem = {
  IDNo: number;
  MENU_NAME: string;
  MENU_PRICE: number;
  category: string;
  total_quantity: number;
  order_count: number;
  total_revenue: number;
};

// Top-selling items share the same shape as least-selling items
export type ApiTopSellingItem = ApiLeastSellingItem;

export type ApiDailySalesItem = {
  sale_date: string;
  total_sales: number;
  refund: number;
  discount: number;
  net_sales: number;
  /** Loyverse: daily SUM(LINE_COST) for "Product unit price" / gross profit (no recipe). */
  product_cost?: number;
  gross_profit: number;
};

export type ApiDailyOrdersItem = {
  sale_date: string;
  order_count: number;
};

export type ApiMenuReportRow = {
  id: number;
  goods: string;
  category: string;
  salesQty: number;
  totalSales: number;
  refundQty: number;
  refundAmount: number;
  discounts: number;
  netSales: number;
  unitCost: number;
  totalRevenue: number;
};

export type ApiCategoryReportRow = {
  id: number;
  category: string;
  salesQty: number;
  totalSales: number;
  refundQty: number;
  refundAmount: number;
  discounts: number;
  netSales: number;
  unitCost: number;
  totalRevenue: number;
};

/** Per-menu lines for one category (see PyServer /category-menu-breakdown). */
export type ApiCategoryMenuBreakdownRow = {
  id: number;
  menuName: string;
  salesQty: number;
  /** menu.MENU_PRICE from DB */
  unitPrice: number;
  netSales: number;
};

/** Per-table room charge rows use id below this (PyServer ROOM_CHARGE_TABLE_DETAIL_BASE - tableId). */
export const ROOM_CHARGE_TABLE_DETAIL_ID_THRESHOLD = -8_000_000_000;

export function isRoomChargeTableDetailId(id: number): boolean {
  return Number.isFinite(id) && id < ROOM_CHARGE_TABLE_DETAIL_ID_THRESHOLD;
}

export type ApiPaymentReportRow = {
  id: number;
  paymentMethod: string;
  paymentTransaction: number;
  paymentAmount: number;
  refundTransaction: number;
  refundAmount: number;
  netAmount: number;
};

export type ApiReceiptReportRow = {
  id: number;
  receiptNumber: string;
  date: string;
  employee: string;
  customer: string;
  type: string;
  total: number;
  discount: number;
};

export type ApiReceiptDetailItem = {
  name: string;
  qty: number;
  unitPrice: number;
  amount: number;
  note?: string | null;
};

export type ApiReceiptDetail = {
  orderLabel: string;
  staff: string;
  pos: string;
  serviceType: string;
  paymentMethod: string;
  transactionNo: string;
  items: ApiReceiptDetailItem[];
};

export type ApiExpenseSummary = {
  total_expense: number;
};

export type ApiExpenseCategoryRow = {
  branch_id: number;
  exp_cat: string;
  exp_name: string;
  entry_count: number;
  total_amount: number;
};

export type ApiDailyExpenseItem = {
  expense_date: string;
  total_expense: number;
};

export type ApiPerformanceTrendRow = {
  name: string;
  totalSales: number;
  totalExpenses: number;
  /** Present when period=weekly (calendar bars); yyyy-mm-dd */
  sale_date?: string | null;
};

export async function fetchBranchSalesApi(params: URLSearchParams): Promise<ApiBranchSalesItem[]> {
  const baseUrl = getAnalyticsBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/analytics/branch-sales?${params.toString()}`);
    if (!res.ok) {
      // Backend unreachable / HTTP error – treat as no data for UI stability.
      // eslint-disable-next-line no-console
      console.warn('[analyticsService] branch-sales HTTP error:', res.status);
      return [];
    }
    const json = await res.json();
    if (json.success && json.data?.data) {
      return json.data.data as ApiBranchSalesItem[];
    }
    // If Python analytics returns an error (e.g. missing legacy tables),
    // log and gracefully fall back to empty data instead of crashing dashboard.
    // eslint-disable-next-line no-console
    console.warn('[analyticsService] branch-sales backend error:', json?.message || json);
    return [];
  } catch (err) {
    // Network or parsing error – also degrade gracefully.
    // eslint-disable-next-line no-console
    console.warn('[analyticsService] branch-sales request failed:', err);
    return [];
  }
}

export async function fetchLeastSellingApi(params: URLSearchParams): Promise<ApiLeastSellingItem[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/least-selling?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics least-selling failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data?.data) {
    return json.data.data as ApiLeastSellingItem[];
  }
  return [];
}

export async function fetchTopSellingApi(params: URLSearchParams): Promise<ApiTopSellingItem[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/top-selling?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics top-selling failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data?.data) {
    return json.data.data as ApiTopSellingItem[];
  }
  return [];
}

export async function fetchDailySalesApi(params: URLSearchParams): Promise<ApiDailySalesItem[]> {
  const baseUrl = getAnalyticsBaseUrl();
  // PyServer path when configured, otherwise fall back to Node revenue report.
  const url = baseUrl
    ? `${baseUrl}/api/analytics/daily-sales?${params.toString()}`
    : `/api/reports/revenue?period=daily&${params.toString()}`;

  const { res, json } = await fetchJson(url);
  if (!res.ok) throw new Error(`Analytics daily-sales failed with status ${res.status}`);
  if (json.success && json.data?.data) {
    // PyServer returns { data: { data: [...] } }
    return json.data.data as ApiDailySalesItem[];
  }
  // Node revenue returns { data: { data: [{ date, revenue, ...}] } }
  if (json.success && Array.isArray(json.data?.data)) {
    return (json.data.data as any[]).map((row) => {
      const total = Number(row?.revenue ?? row?.total_sales ?? 0) || 0;
      return {
        sale_date: String(row?.date ?? row?.sale_date ?? ''),
        total_sales: total,
        refund: 0,
        discount: 0,
        net_sales: total,
        gross_profit: total,
      } satisfies ApiDailySalesItem;
    });
  }
  return [];
}

export async function fetchDailyOrdersApi(params: URLSearchParams): Promise<ApiDailyOrdersItem[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/daily-orders?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics daily-orders failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data?.data) {
    return json.data.data as ApiDailyOrdersItem[];
  }
  return [];
}

export async function fetchDailyExpensesApi(params: URLSearchParams): Promise<ApiDailyExpenseItem[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/daily-expenses?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics daily-expenses failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data?.data) {
    return json.data.data as ApiDailyExpenseItem[];
  }
  return [];
}

export async function fetchMenuReportApi(params: URLSearchParams): Promise<ApiMenuReportRow[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const url = baseUrl
    ? `${baseUrl}/api/analytics/menu-report?${params.toString()}`
    : `/api/reports/goods-sales?${params.toString()}`;
  const { res, json } = await fetchJson(url);
  if (!res.ok) throw new Error(`Analytics menu-report failed with status ${res.status}`);
  if (json.success && json.data?.data) {
    return json.data.data as ApiMenuReportRow[];
  }
  return [];
}

export async function fetchCategoryReportApi(params: URLSearchParams): Promise<ApiCategoryReportRow[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const url = baseUrl
    ? `${baseUrl}/api/analytics/category-report?${params.toString()}`
    : `/api/reports/sales-category?${params.toString()}`;
  const { res, json } = await fetchJson(url);
  if (!res.ok) throw new Error(`Analytics category-report failed with status ${res.status}`);
  if (json.success && json.data?.data) {
    return json.data.data as ApiCategoryReportRow[];
  }
  return [];
}

export async function fetchCategoryMenuBreakdownApi(
  params: URLSearchParams
): Promise<ApiCategoryMenuBreakdownRow[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/category-menu-breakdown?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics category-menu-breakdown failed with status ${res.status}`);
  }
  const json = await res.json();
  if (!json.success) {
    throw new Error(
      (typeof json.message === 'string' && json.message) ||
        (typeof json.error === 'string' && json.error) ||
        'Analytics category-menu-breakdown returned an error'
    );
  }
  const rows = json.data?.data;
  if (!Array.isArray(rows)) {
    throw new Error('Analytics category-menu-breakdown returned an invalid payload');
  }
  return rows as ApiCategoryMenuBreakdownRow[];
}

export async function fetchPaymentReportApi(params: URLSearchParams): Promise<ApiPaymentReportRow[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/payment-report?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics payment-report failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data?.data) {
    return json.data.data as ApiPaymentReportRow[];
  }
  return [];
}

export async function fetchReceiptReportApi(params: URLSearchParams): Promise<ApiReceiptReportRow[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/receipt-report?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics receipt-report failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data?.data) {
    return json.data.data as ApiReceiptReportRow[];
  }
  return [];
}

export async function fetchReceiptDetailApi(orderId: number | string): Promise<ApiReceiptDetail> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/receipt-detail?order_id=${encodeURIComponent(String(orderId))}`);
  if (!res.ok) {
    throw new Error(`Analytics receipt-detail failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data) {
    return json.data as ApiReceiptDetail;
  }
  throw new Error(json.message || 'Failed to load receipt detail');
}

export async function fetchExpenseSummaryApi(params: URLSearchParams): Promise<ApiExpenseSummary> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/expense-summary?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics expense-summary failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data) {
    return {
      total_expense: Number(json.data.total_expense ?? 0),
    };
  }
  return { total_expense: 0 };
}

export async function fetchExpenseCategoryBreakdownApi(
  params: URLSearchParams,
): Promise<ApiExpenseCategoryRow[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/expense-breakdown?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics expense-breakdown failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data?.data) {
    return json.data.data as ApiExpenseCategoryRow[];
  }
  return [];
}

export async function fetchPerformanceTrendApi(params: URLSearchParams): Promise<ApiPerformanceTrendRow[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/performance-trend?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics performance-trend failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data?.data) {
    return json.data.data as ApiPerformanceTrendRow[];
  }
  return [];
}

