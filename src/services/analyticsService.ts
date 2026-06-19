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

/** Client timeout — must exceed server PyServer timeout (15s) + Node SQL fallback. */
const ANALYTICS_FETCH_MS = 35000;

export function isAnalyticsFetchTimeout(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && /aborted|timeout/i.test(err.message)) return true;
  return false;
}

async function fetchJson(url: string, timeoutMs = ANALYTICS_FETCH_MS): Promise<{ res: Response; json: any }> {
  const headers = isSameOriginUrl(url) ? getAuthHeaders() : {};
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const json = await res.json().catch(() => null);
    return { res, json };
  } finally {
    window.clearTimeout(timer);
  }
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
  branch: string;
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
  branch: string;
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
  const url = baseUrl
    ? `${baseUrl}/api/analytics/daily-sales?${params.toString()}`
    : `/api/analytics/daily-sales?${params.toString()}`;

  // Node proxy already falls back to SQL when PyServer is slow/unreachable.
  const { res, json } = await fetchJson(url);
  if (!res.ok) throw new Error(`Analytics daily-sales failed with status ${res.status}`);
  if (json.success && json.data?.data) {
    return json.data.data as ApiDailySalesItem[];
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

export async function fetchTopProfitDriversApi(params: URLSearchParams): Promise<Array<ApiMenuReportRow & { branch_id?: number | null }>> {
  const baseUrl = getAnalyticsBaseUrl();
  if (!params.has('limit')) params.set('limit', '20');
  const url = baseUrl
    ? `${baseUrl}/api/analytics/top-profit-drivers?${params.toString()}`
    : `/api/analytics/top-profit-drivers?${params.toString()}`;
  const { res, json } = await fetchJson(url);
  if (!res.ok) throw new Error(`Analytics top-profit-drivers failed with status ${res.status}`);
  if (json.success && json.data?.data) {
    return json.data.data as Array<ApiMenuReportRow & { branch_id?: number | null }>;
  }
  return [];
}

export async function fetchMenuReportApi(params: URLSearchParams): Promise<ApiMenuReportRow[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const url = baseUrl
    ? `${baseUrl}/api/analytics/menu-report?${params.toString()}`
    : `/api/analytics/menu-report?${params.toString()}`;
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
    : `/api/analytics/category-report?${params.toString()}`;
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

export type SalesDashboardBundlePayload = {
  dailySalesCurrent: ApiDailySalesItem[];
  dailySalesPrevious: ApiDailySalesItem[];
  branchSalesData: ApiBranchSalesItem[];
  profitDriversData: Array<{
    row: ApiMenuReportRow;
    profit: number;
    branchId: number | null;
    branchName: string;
  }>;
  reconAdjustCurrent: { byDate: Record<string, number>; total: number };
  reconAdjustPreviousTotal: number;
};

export type BranchDashboardBundlePayload = {
  dashboardData: {
    stats: {
      totalOrders: number;
      totalSales: number;
      totalExpenses: number;
      totalProfit: number;
    };
    revenueData: Array<{ name: string; date?: string; income: number; expense: number }>;
    ordersOverview: Array<{ name: string; orders: number; date?: string }>;
  } | null;
  topCategories: Array<{ name: string; value: number; color: string }>;
  trendingMenusData: Array<{
    key: string;
    name: string;
    category: string;
    totalQty: number;
    netSales: number;
    image: string;
  }>;
  recentOrders: Array<Record<string, unknown>>;
  recentOrderItemsMeta: Record<string, { lineCount: number; totalQty: number }>;
};

/** Single backend round-trip for Sales Analytics (replaces 6 frontend API calls). */
export async function fetchSalesDashboardBundleApi(params: {
  start: string;
  end: string;
  branchId?: string | null;
  profitBranchId?: string | null;
}): Promise<SalesDashboardBundlePayload> {
  const qs = new URLSearchParams();
  qs.set('start_date', params.start);
  qs.set('end_date', params.end);
  if (params.branchId === null || params.branchId === 'all') {
    qs.set('branch_id', 'all');
  } else if (params.branchId) {
    qs.set('branch_id', params.branchId);
  }
  if (params.profitBranchId) qs.set('profit_branch_id', params.profitBranchId);

  const url = `/api/analytics/sales-dashboard-bundle?${qs.toString()}`;
  const { res, json } = await fetchJson(url, 15000);
  if (!res.ok) {
    throw new Error(`Analytics sales-dashboard-bundle failed with status ${res.status}`);
  }
  if (!json?.success || !json?.data) {
    throw new Error(json?.message || 'Analytics sales-dashboard-bundle returned an error');
  }

  const data = json.data;
  return {
    dailySalesCurrent: (data.dailySalesCurrent || []) as ApiDailySalesItem[],
    dailySalesPrevious: (data.dailySalesPrevious || []) as ApiDailySalesItem[],
    branchSalesData: (data.branchSalesData || []) as ApiBranchSalesItem[],
    profitDriversData: (data.profitDriversData || []) as SalesDashboardBundlePayload['profitDriversData'],
    reconAdjustCurrent: data.reconAdjustCurrent || { byDate: {}, total: 0 },
    reconAdjustPreviousTotal: Number(data.reconAdjustPreviousTotal) || 0,
  };
}

/** Fast SQL probe (~100–300ms) — decides skeleton vs empty shell before full bundle. */
export async function fetchBranchDashboardProbeApi(params: {
  branchId: string;
  start: string;
  end: string;
}): Promise<{ hasActivity: boolean }> {
  const qs = new URLSearchParams();
  qs.set('branch_id', params.branchId);
  qs.set('start_date', params.start);
  qs.set('end_date', params.end);

  const url = `/api/analytics/branch-dashboard-probe?${qs.toString()}`;
  const { res, json } = await fetchJson(url, 8000);
  if (!res.ok) {
    throw new Error(`Analytics branch-dashboard-probe failed with status ${res.status}`);
  }
  if (!json?.success || !json?.data) {
    throw new Error(json?.message || 'Analytics branch-dashboard-probe returned an error');
  }
  return { hasActivity: Boolean(json.data.hasActivity) };
}

/** Single backend round-trip for branch Dashboard (replaces ~10 frontend API calls). */
export async function fetchBranchDashboardBundleApi(params: {
  branchId: string;
  start: string;
  end: string;
}): Promise<BranchDashboardBundlePayload> {
  const qs = new URLSearchParams();
  qs.set('branch_id', params.branchId);
  qs.set('start_date', params.start);
  qs.set('end_date', params.end);

  const url = `/api/analytics/branch-dashboard-bundle?${qs.toString()}`;
  const { res, json } = await fetchJson(url, 12000);
  if (!res.ok) {
    throw new Error(`Analytics branch-dashboard-bundle failed with status ${res.status}`);
  }
  if (!json?.success || !json?.data) {
    throw new Error(json?.message || 'Analytics branch-dashboard-bundle returned an error');
  }

  const data = json.data;
  return {
    dashboardData: data.dashboardData ?? null,
    topCategories: data.topCategories || [],
    trendingMenusData: data.trendingMenusData || [],
    recentOrders: data.recentOrders || [],
    recentOrderItemsMeta: data.recentOrderItemsMeta || {},
  };
}

