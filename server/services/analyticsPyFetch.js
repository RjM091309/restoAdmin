const { LRUCache } = require('lru-cache');

const PYSERVER_BASE_URL = process.env.PYSERVER_BASE_URL || 'http://127.0.0.1:2100';
const PYSERVER_TIMEOUT_MS = Number(process.env.ANALYTICS_PYSERVER_TIMEOUT_MS || 15000);
const CACHE_TTL_MS = Number(process.env.ANALYTICS_PY_CACHE_TTL_MS || 120000);
const CACHE_MAX = Number(process.env.ANALYTICS_PY_CACHE_MAX || 64);

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const pyCache = new LRUCache({ max: CACHE_MAX, ttl: CACHE_TTL_MS });

function cacheKey(path, params) {
  const sorted = Object.entries(params || {})
    .filter(([, v]) => v != null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${path}?${sorted}`;
}

/**
 * Cached PyServer fetch for analytics endpoints (short TTL, same period reuses data).
 */
async function fetchPyCached(path, params, opts = {}) {
  const key = cacheKey(path, params);
  const cached = pyCache.get(key);
  if (cached !== undefined) return cached;

  const url = new URL(path, PYSERVER_BASE_URL);
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? PYSERVER_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`PyServer ${path} failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = await res.json().catch(() => null);
    if (!json || json.success === false) {
      throw new Error(json?.message || `PyServer ${path} returned error`);
    }
    pyCache.set(key, json);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Like fetchPyCached but returns null on failure (timeouts, PyServer down).
 * Used by dashboard bundles so one slow endpoint does not fail the whole payload.
 */
async function fetchPyCachedOptional(path, params, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? PYSERVER_TIMEOUT_MS;
  try {
    return await fetchPyCached(path, params, { ...opts, timeoutMs });
  } catch (err) {
    const msg = err?.message || String(err);
    if (/aborted/i.test(msg)) {
      console.warn(`[analyticsPyFetch] PyServer slow (>${timeoutMs}ms): ${path}`);
    } else {
      console.warn(`[analyticsPyFetch] ${path}:`, msg);
    }
    return null;
  }
}

module.exports = { fetchPyCached, fetchPyCachedOptional, cacheKey };
