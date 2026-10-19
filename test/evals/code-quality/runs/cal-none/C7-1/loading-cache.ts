export interface LoadingCache<V> {
  get(key: string): Promise<V>;
}

/**
 * Caches the result of `load` per key. Concurrent `get`s for a key that is
 * still loading share the one in-flight load. A failed load is evicted so the
 * next `get` retries it.
 */
export function createLoadingCache<V>(load: (key: string) => Promise<V>): LoadingCache<V> {
  // Holds both in-flight and settled loads, so concurrent callers dedupe.
  const entries = new Map<string, Promise<V>>();

  return {
    get(key: string): Promise<V> {
      const cached = entries.get(key);
      if (cached) return cached;

      // The async wrapper turns a synchronous throw from `load` into a rejection.
      const pending = (async () => load(key))();
      entries.set(key, pending);
      pending.catch(() => {
        // Only evict our own entry; never one a later load put in its place.
        if (entries.get(key) === pending) entries.delete(key);
      });
      return pending;
    },
  };
}
