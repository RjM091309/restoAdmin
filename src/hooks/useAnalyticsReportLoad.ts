import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  buildAnalyticsReportCacheKey,
  readAnalyticsReportCache,
  writeAnalyticsReportCache,
} from '../utils/analyticsReportCache';

type ReportCacheId = 'menu' | 'category' | 'payment' | 'receipt';

type UseAnalyticsReportLoadOptions<T> = {
  report: ReportCacheId;
  dateRange: { start: string; end: string };
  branchId: string | null;
  cacheExtra?: string;
  hasCacheData: (cached: T | null) => boolean;
  fetchData: () => Promise<T>;
  onHydrate: (cached: T) => void;
  onClear: () => void;
};

export function useAnalyticsReportLoad<T>({
  report,
  dateRange,
  branchId,
  cacheExtra,
  hasCacheData,
  fetchData,
  onHydrate,
  onClear,
}: UseAnalyticsReportLoadOptions<T>) {
  const cacheKey = useMemo(
    () =>
      buildAnalyticsReportCacheKey(report, {
        start: dateRange.start,
        end: dateRange.end,
        branchId,
        extra: cacheExtra,
      }),
    [report, dateRange.start, dateRange.end, branchId, cacheExtra],
  );

  const initialCached = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return null;
    const cached = readAnalyticsReportCache<T>(report, cacheKey);
    return hasCacheData(cached) ? cached : null;
  }, [report, cacheKey, dateRange.start, dateRange.end, hasCacheData]);

  const [loading, setLoading] = useState(() => !initialCached);
  const reqIdRef = useRef(0);
  const loadedCacheKeyRef = useRef<string | null>(null);

  const onHydrateRef = useRef(onHydrate);
  const onClearRef = useRef(onClear);
  const fetchDataRef = useRef(fetchData);
  const hasCacheDataRef = useRef(hasCacheData);
  onHydrateRef.current = onHydrate;
  onClearRef.current = onClear;
  fetchDataRef.current = fetchData;
  hasCacheDataRef.current = hasCacheData;

  const load = useCallback(
    async (background: boolean) => {
      if (!dateRange.start || !dateRange.end) return;
      const reqId = ++reqIdRef.current;
      if (!background) setLoading(true);
      try {
        const data = await fetchDataRef.current();
        if (reqId !== reqIdRef.current) return;
        onHydrateRef.current(data);
        if (hasCacheDataRef.current(data)) {
          writeAnalyticsReportCache(report, cacheKey, data);
        }
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        console.error(`Failed to load ${report} report`, err);
        if (!background) onClearRef.current();
      } finally {
        if (!background && reqId === reqIdRef.current) setLoading(false);
      }
    },
    [report, cacheKey, dateRange.start, dateRange.end],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useLayoutEffect(() => {
    if (!initialCached) return;
    onHydrateRef.current(initialCached);
  }, [cacheKey, initialCached]);

  useEffect(() => {
    if (!dateRange.start || !dateRange.end) {
      loadedCacheKeyRef.current = null;
      setLoading(false);
      onClearRef.current();
      return;
    }

    const cacheKeyChanged = loadedCacheKeyRef.current !== cacheKey;
    loadedCacheKeyRef.current = cacheKey;

    const cached = readAnalyticsReportCache<T>(report, cacheKey);
    if (hasCacheDataRef.current(cached)) {
      onHydrateRef.current(cached as T);
      setLoading(false);
      void loadRef.current(true);
      return;
    }

    if (cacheKeyChanged) {
      onClearRef.current();
    }
    void loadRef.current(false);
  }, [report, cacheKey, dateRange.start, dateRange.end]);

  const reload = useCallback(() => {
    void load(false);
  }, [load]);

  return { loading, reload, cacheKey, initialCached };
}
