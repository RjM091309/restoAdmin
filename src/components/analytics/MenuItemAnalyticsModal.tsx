import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, BarChart3 } from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Modal } from '../ui/Modal';
import { fetchMenuItemTrendApi } from '../../services/analyticsService';

type DateRange = { start: string; end: string };

export type MenuItemAnalyticsTarget = {
  goods: string;
  branchId: number | null;
  branchName: string;
  amount: number;
  qty: number;
};

type MetricPair = { amount: number; qty: number };

type CompareRow = {
  id: string;
  label: string;
  current: MetricPair;
  previous: MetricPair;
};

type MenuItemAnalyticsPanelProps = {
  target: MenuItemAnalyticsTarget | null;
  dateRange: DateRange;
  /** When false, skip fetching (e.g. panel hidden). Default true. */
  active?: boolean;
  className?: string;
  /** Hide card chrome/header — used inside Modal which already has a title. */
  bare?: boolean;
};

type MenuItemAnalyticsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  target: MenuItemAnalyticsTarget | null;
  dateRange: DateRange;
};

const CHART_COLOR_QTY = 'rgb(139, 92, 246)';
const CHART_COLOR_AMOUNT = 'rgb(16, 185, 129)';

const toYYYYMMDD = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseLocalYmd = (s: string): Date | null => {
  const match = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const addDaysLocal = (d: Date, days: number): Date => {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + days);
  return next;
};

const shiftMonthClamped = (d: Date, deltaMonths: number): Date => {
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + deltaMonths, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
};

const getSamePeriodWindows = (
  start: string,
  end: string,
  lookbackDays = 3,
): { current: DateRange; previous: DateRange } | null => {
  const s = parseLocalYmd(start);
  const e = parseLocalYmd(end);
  if (!s || !e || s > e) return null;

  let currentEnd = addDaysLocal(e, -lookbackDays);
  if (currentEnd < s) currentEnd = new Date(s.getFullYear(), s.getMonth(), s.getDate());

  return {
    current: { start: toYYYYMMDD(s), end: toYYYYMMDD(currentEnd) },
    previous: {
      start: toYYYYMMDD(shiftMonthClamped(s, -1)),
      end: toYYYYMMDD(shiftMonthClamped(currentEnd, -1)),
    },
  };
};

const getMtdVsFullPreviousMonth = (end: string): { current: DateRange; previous: DateRange } | null => {
  const e = parseLocalYmd(end);
  if (!e) return null;
  const currentStart = new Date(e.getFullYear(), e.getMonth(), 1);
  const previousStart = new Date(e.getFullYear(), e.getMonth() - 1, 1);
  const previousEnd = new Date(e.getFullYear(), e.getMonth(), 0);
  return {
    current: { start: toYYYYMMDD(currentStart), end: toYYYYMMDD(e) },
    previous: { start: toYYYYMMDD(previousStart), end: toYYYYMMDD(previousEnd) },
  };
};

const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const money = (n: number): string =>
  `₱${Math.trunc(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** Compact Y-axis tick: ₱1.2M / ₱450k / ₱0 */
const axisMoney = (v: number): string => {
  const n = Number(v) || 0;
  if (n === 0) return '₱0';
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000;
    return `₱${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (Math.abs(n) >= 1_000) return `₱${Math.round(n / 1_000)}k`;
  return money(n);
};

const pctChange = (current: number, previous: number): number | null => {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (Math.abs(prev) < 1) return null;
  return ((cur - prev) / prev) * 100;
};

/** Branch Comparison index: 100 = flat, 104.4 = +4.4%. */
const monthIndexFromPct = (percentChange: number): number => 100 + (Number(percentChange) || 0);

const sumDailyInRange = (
  daily: Array<{ sale_date: string; qty: number; amount: number }>,
  range: DateRange | null,
): MetricPair => {
  if (!range) return { amount: 0, qty: 0 };
  let amount = 0;
  let qty = 0;
  for (const row of daily) {
    const d = String(row.sale_date || '').slice(0, 10);
    if (d < range.start || d > range.end) continue;
    amount += Number(row.amount) || 0;
    qty += Number(row.qty) || 0;
  }
  return { amount, qty };
};

function useMenuItemAnalytics(
  target: MenuItemAnalyticsTarget | null,
  dateRange: DateRange,
  active: boolean,
) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareRows, setCompareRows] = useState<CompareRow[]>([]);
  const [monthly, setMonthly] = useState<Array<{ label: string; amount: number; qty: number }>>([]);

  useEffect(() => {
    if (!active || !target) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const same = getSamePeriodWindows(dateRange.start, dateRange.end);
        const mtd = getMtdVsFullPreviousMonth(dateRange.end);
        const endDate = parseLocalYmd(dateRange.end) || new Date();

        // Cover 6 calendar months + same-period previous window in one fetch.
        const chartStart = new Date(endDate.getFullYear(), endDate.getMonth() - 5, 1);
        const fetchStartCandidates = [toYYYYMMDD(chartStart)];
        if (same?.previous.start) fetchStartCandidates.push(same.previous.start);
        if (mtd?.previous.start) fetchStartCandidates.push(mtd.previous.start);
        const fetchStart = fetchStartCandidates.sort()[0];
        const fetchEnd = toYYYYMMDD(endDate);

        const daily = await fetchMenuItemTrendApi({
          goods: target.goods,
          start: fetchStart,
          end: fetchEnd,
          branchId: target.branchId,
        });

        if (cancelled) return;

        const sameCur = sumDailyInRange(daily, same?.current ?? null);
        const samePrev = sumDailyInRange(daily, same?.previous ?? null);
        const mtdCur = sumDailyInRange(daily, mtd?.current ?? null);
        const mtdPrev = sumDailyInRange(daily, mtd?.previous ?? null);

        const last3Full: DateRange[] = [];
        for (let i = 1; i <= 3; i += 1) {
          const start = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
          const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
          last3Full.push({ start: toYYYYMMDD(start), end: toYYYYMMDD(end) });
        }
        const avgParts = last3Full.map((r) => sumDailyInRange(daily, r));
        const avg: MetricPair = {
          amount: avgParts.reduce((s, p) => s + p.amount, 0) / Math.max(avgParts.length, 1),
          qty: avgParts.reduce((s, p) => s + p.qty, 0) / Math.max(avgParts.length, 1),
        };

        setCompareRows([
          {
            id: 'same_period',
            label: t('sales_analytics.item_analytics_vs_same_period'),
            current: sameCur,
            previous: samePrev,
          },
          {
            id: 'vs_last_month',
            label: t('sales_analytics.item_analytics_vs_last_month'),
            current: mtdCur,
            previous: mtdPrev,
          },
          {
            id: 'vs_average',
            label: t('sales_analytics.item_analytics_vs_average'),
            current: mtdCur,
            previous: avg,
          },
        ]);

        const monthRows: Array<{ label: string; amount: number; qty: number }> = [];
        for (let i = 5; i >= 0; i -= 1) {
          const start = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
          const isCurrent =
            start.getFullYear() === endDate.getFullYear() && start.getMonth() === endDate.getMonth();
          const end = isCurrent
            ? endDate
            : new Date(start.getFullYear(), start.getMonth() + 1, 0);
          const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
          const totals = sumDailyInRange(daily, {
            start: toYYYYMMDD(start),
            end: toYYYYMMDD(end),
          });
          monthRows.push({
            label: monthLabel(key),
            amount: totals.amount,
            qty: totals.qty,
          });
        }
        setMonthly(monthRows);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError(t('sales_analytics.network_error'));
        setCompareRows([]);
        setMonthly([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [active, target?.goods, target?.branchId, target?.branchName, dateRange.start, dateRange.end, t]);

  return { loading, error, compareRows, monthly, t };
}

const CompareValue: React.FC<{
  current: number;
  previous: number;
  asMoney: boolean;
}> = ({ current, previous, asMoney }) => {
  const pct = pctChange(current, previous);
  const index = pct != null ? monthIndexFromPct(pct) : null;
  const up = index != null && index >= 100;
  // Match Branch Comparison: baseline amount + index % (e.g. 104.4%).
  const display = asMoney
    ? money(previous)
    : `${Math.round(previous).toLocaleString()}`;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-sm font-semibold text-slate-700 tabular-nums">{display}</span>
      {index == null ? (
        <span className="text-[11px] font-medium text-slate-400">—</span>
      ) : (
        <span
          className={`text-[11px] font-medium ${
            up ? 'text-emerald-600' : 'text-red-500'
          }`}
        >
          ({index.toFixed(1)}%)
        </span>
      )}
    </div>
  );
};

/** Inline analytics card — used beside Top Revenue Items on single-branch view. */
export const MenuItemAnalyticsPanel: React.FC<MenuItemAnalyticsPanelProps> = ({
  target,
  dateRange,
  active = true,
  className = '',
  bare = false,
}) => {
  const { loading, error, compareRows, monthly, t } = useMenuItemAnalytics(target, dateRange, active);

  const emptyMonthly = monthly.every((m) => m.amount === 0 && m.qty === 0);

  const body = (
      <div className={`flex-1 min-h-0 overflow-y-auto space-y-4 ${bare ? 'px-5 py-4' : 'px-4 py-3'}`}>
        {!target ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center text-sm text-slate-400">
            <BarChart3 size={36} className="mb-2 text-slate-300" />
            {t('sales_analytics.item_analytics_pick_item')}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-violet-500" />
          </div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-red-500 font-medium">{error}</div>
        ) : (
          <>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {t('sales_analytics.item_analytics_comparison')}
              </p>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-2.5 py-1.5">{t('sales_analytics.item_analytics_metric')}</th>
                      <th className="px-2 py-1.5 text-right">{t('sales_analytics.item_analytics_sold_qty')}</th>
                      <th className="px-2 py-1.5 text-right">{t('sales_analytics.item_analytics_amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-2.5 py-2 text-[12px] text-slate-700 font-medium leading-snug">
                          {row.label}
                        </td>
                        <td className="px-2 py-2">
                          <CompareValue
                            current={row.current.qty}
                            previous={row.previous.qty}
                            asMoney={false}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <CompareValue
                            current={row.current.amount}
                            previous={row.previous.amount}
                            asMoney
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {t('sales_analytics.item_analytics_monthly_trend')}
              </p>
              {emptyMonthly ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  {t('sales_analytics.no_data_available')}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Qty sold — bars */}
                  <div className="rounded-xl border border-violet-100 bg-gradient-to-b from-violet-50/80 to-white p-2.5">
                    <div className="flex items-center justify-between mb-1 px-0.5">
                      <span className="text-[11px] font-semibold text-violet-800">
                        {t('sales_analytics.item_analytics_sold_qty')}
                      </span>
                      <span className="text-[10px] font-medium text-violet-500 tabular-nums">
                        {Math.round(
                          monthly.reduce((s, m) => s + m.qty, 0) / Math.max(monthly.length, 1),
                        ).toLocaleString()}{' '}
                        avg
                      </span>
                    </div>
                    <div className="h-44 w-full min-w-0 px-0.5">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                          <CartesianGrid stroke="#ede9fe" vertical={false} strokeDasharray="3 3" />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: '#64748b', fontSize: 9 }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            height={28}
                            tickMargin={4}
                          />
                          <YAxis
                            tick={{ fill: '#7c3aed', fontSize: 9 }}
                            axisLine={false}
                            tickLine={false}
                            width={36}
                          />
                          <Tooltip
                            formatter={(value: number) => [
                              Math.round(Number(value) || 0).toLocaleString(),
                              t('sales_analytics.item_analytics_sold_qty'),
                            ]}
                            contentStyle={{
                              borderRadius: 10,
                              border: '1px solid #e2e8f0',
                              fontSize: 12,
                            }}
                          />
                          <Bar
                            dataKey="qty"
                            fill={CHART_COLOR_QTY}
                            radius={[5, 5, 0, 0]}
                            barSize={16}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Total sales — soft area */}
                  <div className="rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/80 to-white p-2.5">
                    <div className="flex items-center justify-between mb-1 px-0.5">
                      <span className="text-[11px] font-semibold text-emerald-800">
                        {t('sales_analytics.item_analytics_amount')}
                      </span>
                      <span className="text-[10px] font-medium text-emerald-600 tabular-nums">
                        {money(
                          monthly.reduce((s, m) => s + m.amount, 0) / Math.max(monthly.length, 1),
                        )}{' '}
                        avg
                      </span>
                    </div>
                    <div className="h-44 w-full min-w-0 px-0.5">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={monthly} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <defs>
                            <linearGradient id="itemSalesFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={CHART_COLOR_AMOUNT} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={CHART_COLOR_AMOUNT} stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#d1fae5" vertical={false} strokeDasharray="3 3" />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: '#64748b', fontSize: 9 }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            height={28}
                            tickMargin={4}
                          />
                          <YAxis
                            tick={{ fill: '#059669', fontSize: 9 }}
                            tickFormatter={(v) => axisMoney(Number(v))}
                            axisLine={false}
                            tickLine={false}
                            width={44}
                          />
                          <Tooltip
                            formatter={(value: number) => [
                              money(value),
                              t('sales_analytics.item_analytics_amount'),
                            ]}
                            contentStyle={{
                              borderRadius: 10,
                              border: '1px solid #e2e8f0',
                              fontSize: 12,
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="amount"
                            stroke={CHART_COLOR_AMOUNT}
                            strokeWidth={2.25}
                            fill="url(#itemSalesFill)"
                            dot={{ r: 3, fill: CHART_COLOR_AMOUNT, strokeWidth: 0 }}
                            activeDot={{ r: 5 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
  );

  if (bare) return body;

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full ${className}`}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50/70 via-white to-emerald-50/40 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-violet-600 shrink-0">
              <BarChart3 size={15} />
            </span>
            <h4 className="text-sm font-semibold text-slate-900 truncate">
              {target?.goods || t('sales_analytics.item_analytics_title')}
            </h4>
          </div>
          {target ? (
            <p className="text-[11px] font-medium text-slate-500 pl-9">
              {t('sales_analytics.high_revenue')} · {target.branchName}
            </p>
          ) : (
            <p className="text-[11px] font-medium text-slate-400 pl-9">
              {t('sales_analytics.item_analytics_pick_item')}
            </p>
          )}
        </div>
      </div>
      {body}
    </div>
  );
};

/** Modal wrapper — used on All Branches view. */
export const MenuItemAnalyticsModal: React.FC<MenuItemAnalyticsModalProps> = ({
  isOpen,
  onClose,
  target,
  dateRange,
}) => {
  const { t } = useTranslation();
  const subtitle = useMemo(() => {
    if (!target) return null;
    return (
      <span className="text-xs text-slate-500">
        {t('sales_analytics.high_revenue')} · {target.branchName}
      </span>
    );
  }, [target, t]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={target?.goods || t('sales_analytics.item_analytics_title')}
      subtitle={subtitle}
      maxWidth="3xl"
      bodyClassName="p-0"
    >
      <MenuItemAnalyticsPanel
        target={target}
        dateRange={dateRange}
        active={isOpen}
        bare
      />
    </Modal>
  );
};
