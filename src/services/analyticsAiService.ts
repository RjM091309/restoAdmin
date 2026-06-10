export type AnalyticsAiChart = {
  type: 'bar' | 'line';
  title: string;
  labels: string[];
  series: Array<{ name: string; data: number[] }>;
};

export type AnalyticsAiChatResponse = {
  mode?: 'chat' | 'management_brief';
  summary: string;
  bullets: string[];
  suggestedReplies: string[];
  charts: AnalyticsAiChart[];
  executive_summary?: string;
  sales_analysis?: string;
  expense_analysis?: string;
  recommendations?: string[];
  contextMeta?: {
    focus?: string;
    mode?: string;
    period?: { start: string; end: string };
    locale?: string;
    kpi?: Record<string, number>;
    comparisons?: Record<string, number>;
  };
};

export type ManagementBriefRequest = {
  start_date: string;
  end_date: string;
  locale?: string;
};

export type AnalyticsAiChatRequest = {
  message: string;
  start_date: string;
  end_date: string;
  locale?: string;
};

function getAuthHeaders(): Record<string, string> {
  try {
    const token = (localStorage.getItem('token') || '').trim();
    return token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
  }
  catch {
    return { 'Content-Type': 'application/json' };
  }
}

export async function postAnalyticsAiChat(
  body: AnalyticsAiChatRequest,
  signal?: AbortSignal,
): Promise<AnalyticsAiChatResponse> {
  const res = await fetch('/api/analytics/ai-chat', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const msg =
      (typeof json?.error === 'string' && json.error) ||
      (typeof json?.message === 'string' && json.message) ||
      `AI request failed (${res.status})`;
    throw new Error(msg);
  }
  return json.data as AnalyticsAiChatResponse;
}

export async function postManagementBrief(
  body: ManagementBriefRequest,
  signal?: AbortSignal,
): Promise<AnalyticsAiChatResponse> {
  const res = await fetch('/api/analytics/management-brief', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const msg =
      (typeof json?.error === 'string' && json.error) ||
      (typeof json?.message === 'string' && json.message) ||
      `Management brief failed (${res.status})`;
    throw new Error(msg);
  }
  return json.data as AnalyticsAiChatResponse;
}
