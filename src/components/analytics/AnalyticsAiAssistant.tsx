import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Area,
  AreaChart,
} from 'recharts';
import {
  Bot,
  BarChart3,
  FileText,
  Loader2,
  Send,
  Sparkles,
  AlertCircle,
  User,
  TrendingUp,
} from 'lucide-react';
import { type Branch } from '../partials/Header';
import { useUser } from '../../context/UserContext';
import {
  postAnalyticsAiChat,
  postManagementBrief,
  type AnalyticsAiChart,
  type AnalyticsAiChatResponse,
} from '../../services/analyticsAiService';
import { cn } from '../../lib/utils';

type AnalyticsAiAssistantProps = {
  selectedBranch: Branch | null;
  dateRange: { start: string; end: string };
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  response?: AnalyticsAiChatResponse;
  error?: string;
};

const BAR_PALETTE = ['#6366f1', '#818cf8', '#10b981', '#34d399', '#f59e0b', '#fbbf24', '#ec4899', '#8b5cf6'];
const LINE_COLOR = '#6366f1';

function formatMoney(value: number) {
  return `₱${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatCompact(value: number) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₱${(n / 1_000).toFixed(0)}K`;
  return formatMoney(n);
}

/** Adds thousands separators to large numbers in AI-generated prose. */
function formatNumbersInText(text: string): string {
  if (!text) return text;
  return text.replace(/(?<![\d,])(\d+)(\.\d{1,2})?(?![\d-])/g, (match, intPart, decPart) => {
    const intLen = intPart.length;
    const isCurrencyLike = intLen >= 4 || (decPart?.length === 3);
    if (!isCurrencyLike) return match;
    if (!decPart && intLen === 4) {
      const year = Number(intPart);
      if (year >= 1900 && year <= 2100) return match;
    }
    const num = Number(intPart + (decPart ?? ''));
    if (!Number.isFinite(num)) return match;
    const fracDigits = decPart ? decPart.length - 1 : 0;
    return num.toLocaleString(undefined, {
      minimumFractionDigits: fracDigits,
      maximumFractionDigits: fracDigits,
    });
  });
}

function truncateLabel(label: string, max = 14) {
  const s = String(label || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function chartToRechartsData(chart: AnalyticsAiChart) {
  const { labels, series } = chart;
  return labels.map((label, i) => {
    const row: Record<string, string | number> = { label, fullLabel: label };
    for (const s of series) {
      row[s.name] = Number(s.data[i]) || 0;
    }
    return row;
  });
}

function newMessageId(prefix: string) {
  if (typeof crypto?.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function resolveLocale(lang: string, text: string) {
  if (/[\uAC00-\uD7AF\u3131-\u318E]/.test(text)) return 'ko';
  const l = (lang || 'en').toLowerCase();
  if (l.startsWith('ko')) return 'ko';
  if (l.startsWith('fil') || l === 'tl') return 'fil';
  return 'en';
}

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

function logAiError(err: unknown) {
  if (err instanceof Error) {
    console.error('[AnalyticsAiAssistant]', err);
  }
}

function useChartSize(minHeight = 280) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: minHeight });
  const sizeRef = useRef(size);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = Math.max(minHeight, el.clientHeight);
      if (w > 0) {
        const prev = sizeRef.current;
        if (prev.width !== w || prev.height !== h) {
          const next = { width: w, height: h };
          sizeRef.current = next;
          setSize(next);
        }
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minHeight]);
  return { ref, size };
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-100 bg-white/95 backdrop-blur-sm px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-brand-text mb-1 max-w-[200px] truncate">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-brand-muted flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || LINE_COLOR }} />
          <span>{p.name}:</span>
          <span className="font-semibold text-brand-text">{formatMoney(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

function AiChartBlock({
  chart,
  index = 0,
  compact = false,
  gradientId,
}: {
  chart: AnalyticsAiChart;
  index?: number;
  compact?: boolean;
  gradientId?: string;
}) {
  const data = useMemo(() => chartToRechartsData(chart), [chart]);
  const seriesKey = chart.series[0]?.name;
  const isLine = chart.type === 'line';
  const useHorizontal = !isLine && (data.length <= 10 || data.some((d) => String(d.label).length > 10));
  const baseHeight = useHorizontal ? Math.max(compact ? 160 : 220, data.length * (compact ? 28 : 36) + 40) : compact ? 200 : 260;
  const chartHeight = compact ? Math.min(baseHeight, isLine ? 200 : 240) : baseHeight;
  const { ref, size } = useChartSize(chartHeight);
  const lineGradId = gradientId || `ai-line-grad-${index}`;

  if (data.length === 0 || !seriesKey) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: compact ? 8 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'rounded-xl border border-gray-100/80 bg-white shadow-sm',
        compact ? 'p-3' : 'rounded-2xl p-4',
      )}
    >
      <div className={cn('flex items-center gap-2', compact ? 'mb-2' : 'mb-4')}>
        <div className="w-6 h-6 rounded-md bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0">
          {isLine ? <TrendingUp size={12} /> : <BarChart3 size={12} />}
        </div>
        <p className={cn('font-semibold text-brand-text', compact ? 'text-xs' : 'text-sm')}>{chart.title}</p>
      </div>
      <div ref={ref} style={{ height: chartHeight }} className="w-full">
        {size.width > 0 && (
          <>
            {isLine ? (
              <AreaChart width={size.width} height={size.height} data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id={lineGradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v) => formatCompact(Number(v))}
                  width={52}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey={seriesKey}
                  stroke={LINE_COLOR}
                  strokeWidth={2.5}
                  fill={`url(#${lineGradId})`}
                  dot={{ r: 3, fill: LINE_COLOR, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: LINE_COLOR }}
                />
              </AreaChart>
            ) : useHorizontal ? (
              <BarChart
                layout="vertical"
                width={size.width}
                height={size.height}
                data={data}
                margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                barCategoryGap="18%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v) => formatCompact(Number(v))}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={Math.min(120, size.width * 0.32)}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => truncateLabel(String(v), 16)}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                <Bar dataKey={seriesKey} radius={[0, 8, 8, 0]} animationDuration={700} animationEasing="ease-out">
                  {data.map((_, i) => (
                    <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <BarChart width={size.width} height={size.height} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={(v) => truncateLabel(String(v), 8)}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={48}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v) => formatCompact(Number(v))}
                  width={52}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                <Bar dataKey={seriesKey} radius={[8, 8, 0, 0]} animationDuration={700} animationEasing="ease-out">
                  {data.map((_, i) => (
                    <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function BriefSection({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-bold uppercase tracking-wide text-brand-primary/80">{title}</p>
      <p className="text-[13px] leading-relaxed text-brand-text">{formatNumbersInText(body)}</p>
    </div>
  );
}

function AssistantReplyBody({
  response,
  loading,
  onSuggest,
  messageId,
}: {
  response: AnalyticsAiChatResponse;
  loading: boolean;
  onSuggest: (text: string) => void;
  messageId: string;
}) {
  const { t } = useTranslation();
  const charts = response.charts?.filter((c) => c.labels?.length > 0) ?? [];
  const hasCharts = charts.length > 0;
  const isBrief = response.mode === 'management_brief';

  const textColumn = isBrief ? (
    <div className="space-y-4 min-w-0">
      <BriefSection title={t('analytics_ai.section_executive')} body={response.executive_summary || ''} />
      <BriefSection title={t('analytics_ai.section_sales')} body={response.sales_analysis || ''} />
      <BriefSection title={t('analytics_ai.section_expenses')} body={response.expense_analysis || ''} />
      {(response.recommendations?.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-primary/80">
            {t('analytics_ai.section_recommendations')}
          </p>
          <ul className="space-y-1.5">
            {response.recommendations!.map((b, i) => (
              <li key={i} className="flex gap-2 text-brand-muted text-[13px] leading-relaxed">
                <span className="text-brand-primary mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0" />
                {formatNumbersInText(b)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  ) : (
    <div className="space-y-3 min-w-0">
      <p className="font-medium leading-relaxed text-brand-text">{formatNumbersInText(response.summary)}</p>
      {response.bullets?.length > 0 && (
        <ul className="space-y-1.5">
          {response.bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-brand-muted text-[13px] leading-relaxed">
              <span className="text-brand-primary mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0" />
              {formatNumbersInText(b)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div
        className={cn(
          hasCharts && 'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(260px,42%)] gap-4 md:gap-5 items-start',
        )}
      >
        {textColumn}

        {hasCharts && (
          <motion.div
            initial={{ opacity: 0, x: 28, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260, delay: 0.12 }}
            className="space-y-3 min-w-0 w-full"
          >
            {charts.map((chart, i) => (
              <AiChartBlock
                key={`${messageId}-chart-${i}`}
                chart={chart}
                index={i}
                compact
                gradientId={`${messageId}-grad-${i}`}
              />
            ))}
          </motion.div>
        )}
      </div>

      {response.suggestedReplies?.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100/80">
          {response.suggestedReplies.map((s) => (
            <button
              key={s}
              type="button"
              disabled={loading}
              onClick={() => onSuggest(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-brand-primary/25 bg-white text-brand-primary hover:bg-brand-primary/5 transition-all duration-200 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 pl-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-brand-primary/60"
          animate={{ opacity: [0.35, 1, 0.35], y: [0, -3, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export const AnalyticsAiAssistant: React.FC<AnalyticsAiAssistantProps> = ({
  selectedBranch,
  dateRange,
}) => {
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const isAdmin = user?.permissions === 1;
  const isAllBranches = !selectedBranch || String(selectedBranch.id) === 'all';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const prevMessageCountRef = useRef(0);

  const suggestions = useMemo(
    () => [
      t('analytics_ai.suggest_overview'),
      t('analytics_ai.suggest_top_menu'),
      t('analytics_ai.suggest_branches'),
      t('analytics_ai.suggest_trend'),
      t('analytics_ai.suggest_payment'),
      t('analytics_ai.suggest_category'),
    ],
    [t],
  );

  const beginRequest = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;
    return { controller, requestId };
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      if (!dateRange.start || !dateRange.end) return;

      const { controller, requestId } = beginRequest();

      setMessages((prev) => [
        ...prev,
        { id: newMessageId('u'), role: 'user', text: trimmed },
      ]);
      setInput('');
      setLoading(true);

      try {
        const data = await postAnalyticsAiChat(
          {
            message: trimmed,
            start_date: dateRange.start,
            end_date: dateRange.end,
            locale: resolveLocale(i18n.language, trimmed),
          },
          controller.signal,
        );
        if (requestId !== requestIdRef.current) return;
        setMessages((prev) => [
          ...prev,
          {
            id: newMessageId('a'),
            role: 'assistant',
            text: data.summary,
            response: data,
          },
        ]);
      } catch (err) {
        if (isAbortError(err) || requestId !== requestIdRef.current) return;
        logAiError(err);
        setMessages((prev) => [
          ...prev,
          {
            id: newMessageId('e'),
            role: 'assistant',
            text: '',
            error: t('analytics_ai.error_generic'),
          },
        ]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          inputRef.current?.focus();
        }
      }
    },
    [beginRequest, dateRange.end, dateRange.start, i18n.language, loading, t],
  );

  const generateManagementBrief = useCallback(async () => {
    if (loading || !dateRange.start || !dateRange.end) return;
    const locale = resolveLocale(i18n.language, '');
    const userLabel = t('analytics_ai.brief_user_message', {
      start: dateRange.start,
      end: dateRange.end,
    });

    const { controller, requestId } = beginRequest();

    setMessages((prev) => [
      ...prev,
      { id: newMessageId('u-brief'), role: 'user', text: userLabel },
    ]);
    setLoading(true);

    try {
      const data = await postManagementBrief(
        {
          start_date: dateRange.start,
          end_date: dateRange.end,
          locale,
        },
        controller.signal,
      );
      if (requestId !== requestIdRef.current) return;
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId('a-brief'),
          role: 'assistant',
          text: data.summary,
          response: data,
        },
      ]);
    } catch (err) {
      if (isAbortError(err) || requestId !== requestIdRef.current) return;
      logAiError(err);
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId('e-brief'),
          role: 'assistant',
          text: '',
          error: t('analytics_ai.error_generic'),
        },
      ]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [beginRequest, dateRange.end, dateRange.start, i18n.language, loading, t]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] text-brand-muted gap-3">
        <AlertCircle size={40} className="text-amber-500" />
        <p className="text-center max-w-md">{t('analytics_ai.admin_only')}</p>
      </div>
    );
  }

  if (!isAllBranches) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] text-brand-muted gap-3">
        <Sparkles size={40} className="text-brand-primary" />
        <p className="text-center max-w-md">{t('analytics_ai.all_branches_hint')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-11rem)] min-h-[520px]">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 rounded-2xl border border-brand-primary/10 bg-gradient-to-br from-brand-primary/[0.07] via-white to-white p-4 shadow-sm"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-primary to-indigo-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-brand-primary/20">
            <Sparkles size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-brand-text tracking-tight">{t('analytics_ai.title')}</h1>
            <p className="text-sm text-brand-muted mt-0.5 max-w-2xl">{t('analytics_ai.subtitle')}</p>
            <p className="text-xs text-brand-muted/80 mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1">
              {t('analytics_ai.period_label', { start: dateRange.start, end: dateRange.end })}
            </p>
          </div>
        </div>
        <motion.button
          type="button"
          disabled={loading}
          whileTap={{ scale: 0.98 }}
          onClick={generateManagementBrief}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-semibold shadow-md shadow-brand-primary/20 hover:opacity-95 disabled:opacity-50 transition-opacity"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          {t('analytics_ai.management_brief_btn')}
        </motion.button>
      </motion.div>

      <div
        className="flex-1 flex flex-col min-h-0 rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden"
        aria-busy={loading}
      >
          <div
            ref={scrollRef}
            role="log"
            aria-live="polite"
            aria-label={t('analytics_ai.title')}
            className={cn(
              'flex-1 overflow-y-auto p-5 custom-scrollbar',
              messages.length === 0 ? 'flex items-center justify-center' : 'space-y-5',
            )}
          >
            {messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center min-h-full py-10 px-6"
              >
                <div className="w-16 h-16 rounded-2xl bg-brand-primary/8 flex items-center justify-center mb-4">
                  <Bot size={32} className="text-brand-primary/50" />
                </div>
                <p className="text-brand-text font-semibold text-base mb-1">{t('analytics_ai.empty_hint')}</p>
                <p className="text-brand-muted text-sm mb-8">{t('analytics_ai.charts_empty')}</p>
                <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {suggestions.map((s, i) => (
                    <motion.button
                      key={s}
                      type="button"
                      disabled={loading}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 + i * 0.05, duration: 0.3 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => sendMessage(s)}
                      className="flex items-center gap-3 text-left px-5 py-4 rounded-2xl border border-gray-200/90 bg-white text-brand-text hover:border-brand-primary/40 hover:bg-brand-primary/[0.04] hover:text-brand-primary hover:shadow-md shadow-sm transition-all duration-200 disabled:opacity-50"
                    >
                      <span className="w-9 h-9 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0 text-brand-primary">
                        <Sparkles size={16} />
                      </span>
                      <span className="text-sm sm:text-base font-medium leading-snug">{s}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
            {messages.map((msg) => {
              const hasInlineCharts =
                msg.role === 'assistant' &&
                !msg.error &&
                ((msg.response?.charts?.filter((c) => c.labels?.length > 0).length ?? 0) > 0 ||
                  msg.response?.mode === 'management_brief');
              return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  'flex gap-3 w-full',
                  msg.role === 'user' ? 'flex-row-reverse' : 'pr-0',
                )}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm',
                    msg.role === 'user'
                      ? 'bg-gray-100 text-brand-text'
                      : 'bg-gradient-to-br from-brand-primary/15 to-indigo-50 text-brand-primary',
                  )}
                >
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div
                  className={cn(
                    'rounded-2xl px-4 py-3.5 text-sm shadow-sm min-w-0',
                    msg.role === 'user'
                      ? 'max-w-[min(85%,420px)] bg-brand-primary text-white rounded-tr-md'
                      : cn(
                          'flex-1 bg-gray-50/90 text-brand-text border border-gray-100 rounded-tl-md',
                          hasInlineCharts ? 'max-w-full' : 'max-w-[min(92%,640px)]',
                        ),
                  )}
                >
                  {msg.role === 'user' && <p className="leading-relaxed">{msg.text}</p>}
                  {msg.role === 'assistant' && msg.error && (
                    <p className="text-red-600 flex items-center gap-2">
                      <AlertCircle size={16} />
                      {msg.error}
                    </p>
                  )}
                  {msg.role === 'assistant' && !msg.error && msg.response && (
                    <AssistantReplyBody
                      response={msg.response}
                      loading={loading}
                      onSuggest={sendMessage}
                      messageId={msg.id}
                    />
                  )}
                </div>
              </motion.div>
            );
            })}
            {loading && (
              <motion.div
                role="status"
                aria-live="polite"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 text-brand-muted text-sm pl-12"
              >
                <Loader2 size={16} className="animate-spin text-brand-primary" />
                <span>{t('analytics_ai.thinking')}</span>
                <TypingIndicator />
              </motion.div>
            )}
          </div>

          <div className="border-t border-gray-100 p-4 space-y-3 bg-gradient-to-t from-gray-50/80 to-white">
            {messages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={loading}
                    onClick={() => sendMessage(s)}
                    className="text-xs px-3 py-1.5 rounded-full bg-white border border-gray-200/80 text-brand-text hover:border-brand-primary/40 hover:text-brand-primary hover:shadow-sm transition-all duration-200 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder={t('analytics_ai.input_placeholder')}
                aria-label={t('analytics_ai.input_placeholder')}
                className="flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/25 focus:border-brand-primary/30 transition-shadow"
                disabled={loading}
              />
              <motion.button
                type="button"
                disabled={loading || !input.trim()}
                whileTap={{ scale: 0.96 }}
                onClick={() => sendMessage(input)}
                aria-label={t('analytics_ai.send_btn')}
                className="shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-brand-primary to-indigo-500 text-white flex items-center justify-center shadow-md shadow-brand-primary/25 hover:shadow-lg disabled:opacity-40 disabled:shadow-none transition-shadow"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </motion.button>
            </div>
            <p className="text-[10px] text-brand-muted/70">{t('analytics_ai.disclaimer')}</p>
          </div>
      </div>
    </div>
  );
};
