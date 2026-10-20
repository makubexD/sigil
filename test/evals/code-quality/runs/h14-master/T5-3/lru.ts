/**
 * Fixed-capacity least-recently-used (LRU) cache.
 *
 * @module
 */

/** A bounded key-value cache that evicts the least recently used entry when full. */
export interface LruCache<K, V> {
  /**
   * Looks up `key` and, if present, marks it as the most recently used entry.
   *
   * @returns The cached value, or `undefined` if `key` is not cached.
   */
  get(key: K): V | undefined;
  /**
   * Inserts or updates `key` and marks it as the most recently used entry. If this pushes the
   * size past capacity, the least recently used entry is evicted.
   */
  set(key: K, value: V): void;
  /** Number of entries currently cached; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an empty LRU cache. `get`, `set`, and `size` all run in O(1).
 *
 * @param capacity - Maximum number of entries to hold; must be a positive integer.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // A Map iterates in insertion order, so re-inserting a key moves it to the most recently used
  // end and the first key is always the least recently used one.
  const entries = new Map<K, V>();

  function markMostRecentlyUsed(key: K, value: V): void {
    entries.delete(key);
    entries.set(key, value);
  }

  return {
    get(key: K): V | undefined {
      // `has` rather than an undefined check, since `undefined` is a valid cached value.
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as V;
      markMostRecentlyUsed(key, value);
      return value;
    },

    set(key: K, value: V): void {
      markMostRecentlyUsed(key, value);
      if (entries.size > capacity) {
        const leastRecentlyUsedKey = entries.keys().next().value as K;
        entries.delete(leastRecentlyUsedKey);
      }
    },

    get size(): number {
      return entries.size;
    },
  };
}
