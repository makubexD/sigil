export interface LoadingCache<V> {
  get(key: string): Promise<V>;
}

/**
 * Caches the result of `load` per key. Concurrent `get` calls for a key that is
 * still loading share the same in-flight load, so `load` runs at most once per
 * key at a time. Failed loads are evicted so the next `get` retries.
 */
export function createLoadingCache<V>(
  load: (key: string) => Promise<V>,
): LoadingCache<V> {
  // Holds both in-flight and settled loads; a Map avoids prototype-key collisions.
  const entries = new Map<string, Promise<V>>();

  return {
    get(key: string): Promise<V> {
      const existing = entries.get(key);
      if (existing) return existing;

      // The async wrapper turns a synchronous throw from `load` into a rejection.
      const pending = (async () => load(key))();
      entries.set(key, pending);
      // Registered before any caller's handler, so the entry is already gone
      // when callers observe the rejection and may retry immediately.
      pending.catch(() => {
        if (entries.get(key) === pending) entries.delete(key);
      });
      return pending;
    },
  };
}
