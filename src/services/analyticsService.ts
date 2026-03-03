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

export type ApiDailySalesItem = {
  sale_date: string;
  total_sales: number;
  refund: number;
  discount: number;
  net_sales: number;
  gross_profit: number;
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

