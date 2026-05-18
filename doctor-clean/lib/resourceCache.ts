type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

export function getCachedResource<T>(key: string, maxAgeMs: number): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > maxAgeMs) return null;
  return hit.data as T;
}

/** Returns cached data even when stale (for stale-while-revalidate UI). */
export function peekCachedResource<T>(key: string): T | null {
  const hit = store.get(key);
  return hit ? (hit.data as T) : null;
}

export function setCachedResource<T>(key: string, data: T): void {
  store.set(key, { data, fetchedAt: Date.now() });
}

export function cacheAgeMs(key: string): number | null {
  const hit = store.get(key);
  return hit ? Date.now() - hit.fetchedAt : null;
}
