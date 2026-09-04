/**
 * Panda Secure Client Cache — SWR-style in-memory & session cache with strict user isolation.
 *
 * Security Principles:
 * 1. User Isolation: All cache entries are scoped to the active user ID. Switching or logging out purges all cache.
 * 2. Decryption Safety: Plaintext/decrypted vault secrets are NEVER written to disk/localStorage/sessionStorage.
 * 3. Memory Cleanup: All blob ObjectURLs are tracked and revoked upon logout or cache clearing to prevent leaks.
 */

let activeUserId = null;
const memoryStore = new Map(); // key → { data, expiresAt, userId }
const blobStore = new Map();   // mediaId → { blobUrl, userId }

const SESSION_PREFIX = 'panda_cache_';

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function getScopedKey(key) {
  return activeUserId ? `${activeUserId}:${key}` : `anon:${key}`;
}

export const pandaCache = {
  /**
   * Set active user ID. If user changed, purge cache to prevent cross-account leakage.
   */
  setUser(userId) {
    const nextId = userId ? String(userId) : null;
    if (activeUserId !== nextId) {
      this.clear();
      activeUserId = nextId;
    }
  },

  /**
   * Get cached data if present and not expired.
   */
  get(key) {
    const scopedKey = getScopedKey(key);
    const entry = memoryStore.get(scopedKey);

    if (entry) {
      if (Date.now() <= entry.expiresAt) {
        return entry.data;
      }
      memoryStore.delete(scopedKey);
    }

    // Try reading non-sensitive cached data from sessionStorage
    if (isBrowser() && !key.startsWith('vault:decrypted')) {
      try {
        const raw = window.sessionStorage.getItem(`${SESSION_PREFIX}${scopedKey}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Date.now() <= parsed.expiresAt) {
            // Restore to memory for faster access
            memoryStore.set(scopedKey, parsed);
            return parsed.data;
          }
          window.sessionStorage.removeItem(`${SESSION_PREFIX}${scopedKey}`);
        }
      } catch {}
    }

    return null;
  },

  /**
   * Set cache entry with TTL (default 60 seconds).
   * @param {string} key
   * @param {*} data
   * @param {number} ttlMs
   * @param {boolean} persistSession - whether to store in sessionStorage (default true, except for sensitive data)
   */
  set(key, data, ttlMs = 60_000, persistSession = true) {
    if (data === undefined || data === null) return;
    const scopedKey = getScopedKey(key);
    const expiresAt = Date.now() + ttlMs;
    const entry = { data, expiresAt, userId: activeUserId };

    memoryStore.set(scopedKey, entry);

    // Persist non-sensitive entries to sessionStorage for instant restoration
    if (persistSession && isBrowser() && !key.startsWith('vault:decrypted')) {
      try {
        window.sessionStorage.setItem(
          `${SESSION_PREFIX}${scopedKey}`,
          JSON.stringify({ data, expiresAt })
        );
      } catch {}
    }
  },

  /**
   * Invalidate a specific key.
   */
  invalidate(key) {
    const scopedKey = getScopedKey(key);
    memoryStore.delete(scopedKey);
    if (isBrowser()) {
      try {
        window.sessionStorage.removeItem(`${SESSION_PREFIX}${scopedKey}`);
      } catch {}
    }
  },

  /**
   * Invalidate all keys matching a prefix.
   */
  invalidatePrefix(prefix) {
    const scopedPrefix = activeUserId ? `${activeUserId}:${prefix}` : `anon:${prefix}`;
    for (const key of memoryStore.keys()) {
      if (key.startsWith(scopedPrefix)) {
        memoryStore.delete(key);
      }
    }
    if (isBrowser()) {
      try {
        const fullPrefix = `${SESSION_PREFIX}${scopedPrefix}`;
        const keysToRemove = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(fullPrefix)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
      } catch {}
    }
  },

  /**
   * Mutate a cached entry in-place with an updater function.
   */
  mutate(key, updaterFn) {
    const current = this.get(key);
    if (current && typeof updaterFn === 'function') {
      const updated = updaterFn(current);
      this.set(key, updated);
      return updated;
    }
    return null;
  },

  /**
   * Granularly remove a media item from all active cached lists.
   */
  removeMediaItem(mediaId) {
    if (!mediaId) return;
    for (const [key, entry] of memoryStore.entries()) {
      if (key.includes(':media:')) {
        if (entry.data?.items && Array.isArray(entry.data.items)) {
          entry.data.items = entry.data.items.filter((m) => m.id !== mediaId);
        }
      }
    }
    mediaBlobCache.delete(mediaId);
  },

  /**
   * Clear all cache entries securely (e.g. on logout or user switch).
   */
  clear() {
    memoryStore.clear();
    if (isBrowser()) {
      try {
        const keysToRemove = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(SESSION_PREFIX)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
      } catch {}
    }
  },
};

export const mediaBlobCache = {
  get(id) {
    if (!id) return null;
    const entry = blobStore.get(id);
    if (!entry) return null;
    // Security check: ensure blob belongs to currently active user
    if (activeUserId && entry.userId && entry.userId !== activeUserId) {
      this.delete(id);
      return null;
    }
    return entry.blobUrl;
  },

  set(id, blobUrl) {
    if (!id || !blobUrl) return;
    blobStore.set(id, { blobUrl, userId: activeUserId });
  },

  delete(id) {
    const entry = blobStore.get(id);
    if (entry?.blobUrl) {
      try {
        URL.revokeObjectURL(entry.blobUrl);
      } catch {}
      blobStore.delete(id);
    }
  },

  clear() {
    for (const entry of blobStore.values()) {
      if (entry?.blobUrl) {
        try {
          URL.revokeObjectURL(entry.blobUrl);
        } catch {}
      }
    }
    blobStore.clear();
  },
};


