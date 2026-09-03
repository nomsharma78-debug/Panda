/**
 * Panda Client Cache — simple in-memory SWR-style cache.
 *
 * Data persists for the lifetime of the browser tab (module-level singleton).
 * Each key has a TTL. On hit: returns cached data instantly.
 * On miss or stale: caller fetches fresh, stores result.
 *
 * Usage:
 *   const cached = pandaCache.get('storage');           // null if miss
 *   pandaCache.set('storage', data, 60_000);            // 60s TTL
 *   pandaCache.invalidate('storage');                   // force refetch next time
 */

const store = new Map(); // key → { data, expiresAt }

export const pandaCache = {
  get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.data;
  },

  set(key, data, ttlMs = 30_000) {
    store.set(key, { data, expiresAt: Date.now() + ttlMs });
  },

  invalidate(key) {
    store.delete(key);
  },

  invalidatePrefix(prefix) {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  },
};
