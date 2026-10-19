export interface LoadingCache<V> {
  get(key: string): Promise<V>;
}

/**
 * Caches the result of `load` per key. Concurrent `get` calls for the same key share a single
 * in-flight load. Successful values stay cached; a failed load is evicted so the next `get` retries.
 */
export function createLoadingCache<V>(load: (key: string) => Promise<V>): LoadingCache<V> {
  // Holds both in-flight and settled loads, so concurrent callers share one promise.
  const entries = new Map<string, Promise<V>>();

  return {
    get(key: string): Promise<V> {
      const existing = entries.get(key);
      if (existing) return existing;

      // The async wrapper turns a synchronous throw from `load` into a rejection.
      const pending = (async () => load(key))();
      entries.set(key, pending);
      pending.catch(() => {
        // Only evict our own entry; never remove a newer load for the same key.
        if (entries.get(key) === pending) entries.delete(key);
      });
      return pending;
    },
  };
}
