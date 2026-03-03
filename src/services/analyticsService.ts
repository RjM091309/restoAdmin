const ENV_BASE_URL = (import.meta as any)?.env?.VITE_ANALYTICS_BASE_URL as string | undefined;

// Resolve analytics API base URL:
// - Prefer VITE_ANALYTICS_BASE_URL when set (e.g. http://45.32.119.62:2100)
// - Otherwise use current host + :2100 (Python uvicorn)
// - Fallback to localhost:2100 for non-browser environments
const getAnalyticsBaseUrl = () => {
  if (ENV_BASE_URL) {
    return ENV_BASE_URL;
  }
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:2100`;
  }
  return 'http://localhost:2100';
};

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
  gross_profit: number;
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

export async function fetchBranchSalesApi(params: URLSearchParams): Promise<ApiBranchSalesItem[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/branch-sales?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics branch-sales failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data?.data) {
    return json.data.data as ApiBranchSalesItem[];
  }
  throw new Error(json.message || 'Failed to load branch sales');
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
  const res = await fetch(`${baseUrl}/api/analytics/daily-sales?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics daily-sales failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data?.data) {
    return json.data.data as ApiDailySalesItem[];
  }
  return [];
}

export async function fetchMenuReportApi(params: URLSearchParams): Promise<ApiMenuReportRow[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/menu-report?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics menu-report failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data?.data) {
    return json.data.data as ApiMenuReportRow[];
  }
  return [];
}

export async function fetchCategoryReportApi(params: URLSearchParams): Promise<ApiCategoryReportRow[]> {
  const baseUrl = getAnalyticsBaseUrl();
  const res = await fetch(`${baseUrl}/api/analytics/category-report?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Analytics category-report failed with status ${res.status}`);
  }
  const json = await res.json();
  if (json.success && json.data?.data) {
    return json.data.data as ApiCategoryReportRow[];
  }
  return [];
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

