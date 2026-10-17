/**
 * Fixed-capacity least-recently-used cache.
 *
 * @module
 */

/** A cache that evicts its least recently used entry once it grows past its capacity. */
export interface LruCache<K, V> {
  /**
   * Looks up `key` and, on a hit, marks it as the most recently used entry.
   *
   * @returns The cached value, or `undefined` when `key` is absent.
   */
  get(key: K): V | undefined;
  /**
   * Inserts or updates `key` and marks it as the most recently used entry, then evicts the
   * least recently used entry if the cache now exceeds its capacity.
   */
  set(key: K, value: V): void;
  /** Number of entries currently held; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an empty LRU cache. Every operation runs in O(1) time.
 *
 * @param capacity - Maximum number of entries to retain.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // A Map iterates in insertion order, so re-inserting a key on access keeps the least recently
  // used entry first and the most recently used last; delete, set, and reading the first key
  // are all O(1).
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
      if (entries.size > capacity) {
        const leastRecentKey = entries.keys().next().value as K;
        entries.delete(leastRecentKey);
      }
    },

    get size(): number {
      return entries.size;
    },
  };
}
