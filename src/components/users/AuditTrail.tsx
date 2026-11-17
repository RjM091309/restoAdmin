import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Trash2,
} from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { cn } from '../../lib/utils';
import { getManilaTodayYmd } from '../../utils/manilaDateTime';

type AuditAction = 'encoded_dt_updated' | 'soft_deleted';

interface AuditEntry {
  id: number;
  branch_id: number | null;
  branch_name: string | null;
  order_id: number | null;
  order_no: string | null;
  action: AuditAction | string;
  summary: string;
  details: {
    encoded_dt?: { from: string | null; to: string } | string | null;
    order_no?: { from: string; to: string } | null;
    order_status?: number;
    previous_status?: number;
    grand_total?: number;
    payment_method?: string | null;
    order_type?: string | null;
  } | null;
  amount: number | null;
  role: string | null;
  is_admin: boolean;
  current_status: number | null;
  created_at: string;
}

interface AuditResponse {
  rows: AuditEntry[];
  total: number;
  counts: Record<AuditAction, number>;
}

interface BranchOption {
  id: number;
  name: string;
}

const PAGE_SIZE = 50;

const ACTION_META: Record<AuditAction, { label: string; icon: React.ElementType; badge: string }> = {
  encoded_dt_updated: {
    label: 'Encoded date updated',
    icon: CalendarClock,
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  soft_deleted: {
    label: 'Order soft-deleted',
    icon: Trash2,
    badge: 'bg-red-50 text-red-600 border-red-200',
  },
};

const STATUS_LABELS: Record<string, string> = {
  '3': 'Pending',
  '2': 'Confirmed',
  '1': 'Settled',
  '-1': 'Cancelled',
  '-2': 'Deleted',
};
const statusLabel = (s: number | null | undefined) =>
  s == null ? '—' : STATUS_LABELS[String(s)] ?? `Status ${s}`;

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

/** 'YYYY-MM-DD HH:MM:SS' wall-clock (Manila) → { date: 'Nov 17, 2026', time: '1:05 PM' } without TZ shifts. */
function splitWallClock(value: string | null | undefined): { date: string; time: string } | null {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }),
  };
}

const wallClockText = (value: string | null | undefined) => {
  const p = splitWallClock(value);
  return p ? `${p.date}, ${p.time}` : value || '—';
};

/** Whole calendar days between two wall-clock values (to − from). */
function dayShift(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = String(from ?? '').slice(0, 10);
  const b = String(to ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

const peso = (n: number | null | undefined) =>
  n == null
    ? '—'
    : `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ChangeCell: React.FC<{ entry: AuditEntry }> = ({ entry }) => {
  const details = entry.details || {};
  if (entry.action === 'encoded_dt_updated') {
    const enc = typeof details.encoded_dt === 'object' && details.encoded_dt ? details.encoded_dt : null;
    const shift = dayShift(enc?.from, enc?.to);
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-brand-muted line-through decoration-gray-300">{wallClockText(enc?.from)}</span>
          <ArrowRight className="w-3.5 h-3.5 text-brand-muted shrink-0" />
          <span className="font-semibold text-brand-text">{wallClockText(enc?.to)}</span>
          {shift != null && shift !== 0 && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold">
              {shift > 0 ? `+${shift}` : shift} day{Math.abs(shift) === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {details.order_no && (
          <div className="text-[11px] text-brand-muted">
            Order no. {details.order_no.from} → {details.order_no.to}
          </div>
        )}
      </div>
    );
  }
  if (entry.action === 'soft_deleted') {
    const encodedAt = typeof details.encoded_dt === 'string' ? details.encoded_dt : null;
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-brand-text">{statusLabel(details.previous_status)}</span>
          <ArrowRight className="w-3.5 h-3.5 text-brand-muted shrink-0" />
          <span className="font-semibold text-red-600">Deleted</span>
        </div>
        <div className="text-[11px] text-brand-muted">
          Order dated {wallClockText(encodedAt)}
          {details.payment_method ? ` · ${details.payment_method}` : ''}
        </div>
      </div>
    );
  }
  return <span className="text-[13px] text-brand-text">{entry.summary}</span>;
};

export const AuditTrail: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useUser();
  // Audit trail is restricted to the 3coredev developer account (server: require3core).
  const isAdmin = (user?.username || '').trim().toLowerCase() === '3coredev';

  const today = getManilaTodayYmd();
  const [startDate, setStartDate] = useState(() => shiftYmd(today, -29));
  const [endDate, setEndDate] = useState(today);
  const [branchId, setBranchId] = useState<string>('all');
  const [action, setAction] = useState<'all' | AuditAction>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the order-number search.
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
  }, [startDate, endDate, branchId, action, search]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/branch/sidebar-permissions/all', { headers: authHeaders() })
      .then((r) => r.json())
      .then((json) => {
        const list = (json?.data?.branches || []) as Array<{ IDNo: number; BRANCH_NAME: string }>;
        setBranches(list.map((b) => ({ id: b.IDNo, name: b.BRANCH_NAME })));
      })
      .catch(() => setBranches([]));
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (branchId !== 'all') params.set('branch_id', branchId);
      if (action !== 'all') params.set('action', action);
      if (search) params.set('search', search);
      const res = await fetch(`/audit-logs/order-trail?${params.toString()}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok || json?.success === false) {
        throw new Error(json?.message || json?.error || `Failed to load (${res.status})`);
      }
      setData(json.data as AuditResponse);
    } catch (e: any) {
      setError(e?.message || 'Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, branchId, action, search, page]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const counts = data?.counts ?? { encoded_dt_updated: 0, soft_deleted: 0 };
  const allCount = counts.encoded_dt_updated + counts.soft_deleted;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.rows ?? [];

  const summaryCards = useMemo(
    () => [
      { key: 'all' as const, label: 'All actions', value: allCount, hint: 'In the selected range', accent: 'brand-primary' },
      {
        key: 'encoded_dt_updated' as const,
        label: 'Encoded date updates',
        value: counts.encoded_dt_updated,
        hint: 'Orders moved to another date/time',
        accent: 'amber',
      },
      {
        key: 'soft_deleted' as const,
        label: 'Soft deletes',
        value: counts.soft_deleted,
        hint: 'Orders removed from lists & reports',
        accent: 'red',
      },
    ],
    [allCount, counts.encoded_dt_updated, counts.soft_deleted],
  );

  if (!isAdmin) {
    return <Navigate to="/users/info" replace />;
  }

  return (
    <div className="pt-6 space-y-6 overflow-x-hidden">
      <div>
        <h2 className="text-xl font-bold text-brand-text flex items-center gap-2">
          <History className="w-5 h-5 text-brand-primary" />
          {t('audit_trail.title', 'Audit Trail')}
        </h2>
        <p className="text-sm text-brand-muted mt-1">
          {t(
            'audit_trail.subtitle',
            'Order corrections made from the admin: encoded date changes and soft deletes, newest first.',
          )}
        </p>
      </div>

      {/* Summary cards double as action filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summaryCards.map((card) => {
          const active = action === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setAction(card.key)}
              className={cn(
                'text-left bg-white rounded-2xl shadow-sm border px-6 py-5 transition-all cursor-pointer',
                active
                  ? card.accent === 'amber'
                    ? 'border-amber-300 shadow-amber-200/40 shadow-lg'
                    : card.accent === 'red'
                      ? 'border-red-300 shadow-red-200/40 shadow-lg'
                      : 'border-brand-primary/40 shadow-brand-primary/20 shadow-lg'
                  : 'border-gray-100 hover:border-brand-primary/20',
              )}
            >
              <div className="text-[12px] font-black tracking-wide text-brand-muted uppercase">{card.label}</div>
              <div className="text-2xl font-black tracking-tight text-brand-text mt-1 tabular-nums">
                {loading && !data ? '—' : card.value.toLocaleString()}
              </div>
              <div className="text-xs text-brand-muted mt-1">{card.hint}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand-muted">From</span>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => e.target.value && setStartDate(e.target.value)}
            className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand-muted">To</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={today}
            onChange={(e) => e.target.value && setEndDate(e.target.value)}
            className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </label>
        <label className="flex flex-col gap-1 min-w-[180px]">
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand-muted">Branch</span>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-brand-text bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          >
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-[190px]">
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand-muted">Action</span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as 'all' | AuditAction)}
            className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-brand-text bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          >
            <option value="all">All actions</option>
            <option value="encoded_dt_updated">Encoded date updated</option>
            <option value="soft_deleted">Order soft-deleted</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand-muted">Order no.</span>
          <div className="relative">
            <Search className="w-4 h-4 text-brand-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search order number"
              className="h-10 w-full pl-9 pr-3 rounded-xl border border-gray-200 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="h-10 px-4 rounded-xl border border-gray-200 text-sm font-bold text-brand-text hover:bg-brand-bg flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {error ? (
          <div className="px-6 py-10 text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Date & time', 'Branch', 'Order', 'Action', 'Change', 'Order total', 'Done by'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-4 text-[12px] font-medium whitespace-nowrap text-brand-muted uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-brand-muted">
                      <Loader2 className="w-5 h-5 animate-spin inline-block mr-2 align-middle" />
                      Loading audit trail…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-brand-muted">
                      No order corrections in this range.
                    </td>
                  </tr>
                ) : (
                  rows.map((entry) => {
                    const meta = ACTION_META[entry.action as AuditAction];
                    const Icon = meta?.icon ?? History;
                    const when = splitWallClock(entry.created_at);
                    return (
                      <tr key={entry.id} className={cn('hover:bg-brand-bg/40 transition-colors', loading && 'opacity-60')}>
                        <td className="px-5 py-3.5 whitespace-nowrap align-top">
                          <div className="text-[13px] font-semibold text-brand-text">{when?.date ?? entry.created_at}</div>
                          <div className="text-[11px] text-brand-muted">{when?.time}</div>
                        </td>
                        <td className="px-5 py-3.5 text-[13px] text-brand-text whitespace-nowrap align-top">
                          {entry.branch_name || '—'}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap align-top">
                          <div className="text-[13px] font-mono text-brand-text">{entry.order_no || '—'}</div>
                          {entry.action === 'encoded_dt_updated' && entry.current_status === -2 && (
                            <div className="text-[11px] text-red-500">Later deleted</div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap align-top">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-semibold',
                              meta?.badge ?? 'bg-gray-50 text-brand-text border-gray-200',
                            )}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {meta?.label ?? entry.action}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 align-top min-w-[260px]">
                          <ChangeCell entry={entry} />
                        </td>
                        <td className="px-5 py-3.5 text-[13px] font-semibold text-brand-text tabular-nums whitespace-nowrap align-top">
                          {peso(entry.amount)}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap align-top">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold',
                              entry.is_admin ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-brand-muted',
                            )}
                            title={entry.is_admin ? 'Administrator' : 'Branch user (allowed by Control Panel toggle)'}
                          >
                            {entry.is_admin && <Shield className="w-3 h-3" />}
                            {entry.is_admin ? 'Admin' : entry.role || 'Branch user'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {!error && total > 0 && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 text-xs text-brand-muted">
            <span>
              Showing {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="p-1.5 rounded-lg hover:bg-brand-bg disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 tabular-nums">
                {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1 || loading}
                className="p-1.5 rounded-lg hover:bg-brand-bg disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-brand-muted flex items-center gap-1.5">
        <Shield className="w-3.5 h-3.5" />
        {t(
          'audit_trail.admin_only',
          'Only the 3coredev account can view the audit trail. Branch users can perform these actions only when allowed in Control Panel → Branches.',
        )}
      </p>
    </div>
  );
};
