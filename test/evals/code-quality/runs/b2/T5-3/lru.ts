/**
 * Fixed-capacity least-recently-used cache.
 *
 * @module
 */

/** A key-value cache that evicts its least recently used entry once it exceeds capacity. */
export interface LruCache<K, V> {
  /**
   * Looks up a key and marks it most recently used when present.
   *
   * @returns The cached value, or `undefined` when the key is absent.
   */
  get(key: K): V | undefined;
  /**
   * Inserts or updates a key and marks it most recently used, evicting the least recently used
   * entry if the cache now exceeds its capacity.
   */
  set(key: K, value: V): void;
  /** Number of entries currently cached; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an empty LRU cache. Every operation runs in O(1).
 *
 * @param capacity - Maximum number of entries to retain; must be a positive integer.
 * @returns A new, empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // A Map iterates in insertion order, so re-inserting a key moves it to the most recently used
  // end and the first key is always the least recently used.
  const entries = new Map<K, V>();

  return {
    get(key: K): V | undefined {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as V;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key: K, value: V): void {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size <= capacity) return;
      const leastRecentlyUsed = entries.keys().next();
      if (!leastRecentlyUsed.done) entries.delete(leastRecentlyUsed.value);
    },
    get size(): number {
      return entries.size;
    },
  };
}
