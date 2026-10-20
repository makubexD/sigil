/**
 * Fixed-capacity least-recently-used cache.
 *
 * @module
 */

/** A key-value cache that evicts its least recently used entry once full. */
export interface LruCache<K, V> {
  /**
   * Looks up `key` and, if present, marks it as most recently used.
   *
   * @returns The cached value, or `undefined` when `key` is absent.
   */
  get(key: K): V | undefined;
  /**
   * Inserts or updates `key` and marks it as most recently used. Evicts the
   * least recently used entry when the insert pushes the size past capacity.
   */
  set(key: K, value: V): void;
  /** Number of entries currently held; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an empty LRU cache. `get` and `set` run in amortized O(1) time.
 *
 * @param capacity - Maximum number of entries to retain; a positive integer.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // A Map iterates in insertion order, so re-inserting a key moves it to the
  // most-recent end and the first key is always the least recently used.
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
