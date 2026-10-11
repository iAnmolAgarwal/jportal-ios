// offline-first cache and settings, all in the portal origin's localStorage under jp:*

const P = 'jp:cache:';

function read(key) {
  try { return JSON.parse(localStorage.getItem(P + key) || 'null'); } catch { return null; }
}
function write(key, data) {
  try { localStorage.setItem(P + key, JSON.stringify({ at: Date.now(), data })); } catch {}
}

/**
 * stale-while-revalidate. calls onData(data, {at, fresh}) up to twice: once
 * from cache (if any) right away, then with the network answer. resolves
 * once the network answers; rejects only when there's no cache to fall back on.
 * maxAge (ms) skips the network when the cached copy is younger.
 */
export async function cached(key, load, onData, { maxAge = 0 } = {}) {
  const hit = read(key);
  if (hit) onData(hit.data, { at: hit.at, fresh: false });
  if (hit && maxAge && Date.now() - hit.at < maxAge) return hit.data;
  try {
    const data = await load();
    write(key, data);
    onData(data, { at: Date.now(), fresh: true });
    return data;
  } catch (e) {
    if (hit) { e.stale = true; e.at = hit.at; }
    throw e;
  }
}

/** just the cached copy, or null */
export const peek = (key) => read(key)?.data ?? null;

/** plain promise version: cache if younger than maxAge, else network (falling back to cache) */
export async function load(key, fn, maxAge = 10 * 60 * 1000) {
  const hit = read(key);
  if (hit && Date.now() - hit.at < maxAge) return hit.data;
  try {
    const data = await fn();
    write(key, data);
    return data;
  } catch (e) {
    if (hit) return hit.data;
    throw e;
  }
}

export function clearCache() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(P)).forEach((k) => localStorage.removeItem(k));
  } catch {}
}

const DEFAULTS = { target: 75, theme: 'system', amoled: false };
const listeners = new Set();

/** settings: target (attendance %), theme ('system'|'light'|'dark'), amoled */
export const prefs = {
  get(k) {
    try {
      const v = JSON.parse(localStorage.getItem('jp:pref:' + k));
      return v ?? DEFAULTS[k];
    } catch { return DEFAULTS[k]; }
  },
  set(k, v) {
    try { localStorage.setItem('jp:pref:' + k, JSON.stringify(v)); } catch {}
    listeners.forEach((f) => f(k, v));
  },
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },
};

/** "Updated 5m ago" */
export function ago(at) {
  if (!at) return '';
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return 'Updated just now';
  if (s < 3600) return `Updated ${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `Updated ${Math.floor(s / 3600)}h ago`;
  return `Updated ${Math.floor(s / 86400)}d ago`;
}

/** the current time in ms. the preview pins it (?now=2026-09-24) so fixture dates look current */
export const now = () => globalThis.__JP_PREVIEW__?.now ?? Date.now();
