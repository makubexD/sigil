/**
 * Fixed-capacity least-recently-used (LRU) cache.
 *
 * @module
 */

/** A key/value cache that evicts its least recently used entry once full. */
export interface LruCache<K, V> {
  /**
   * Returns the value stored for `key` and marks it as most recently used.
   *
   * @returns The stored value, or `undefined` when the key is absent.
   */
  get(key: K): V | undefined;
  /**
   * Inserts or updates `key` and marks it as most recently used. If the cache
   * then holds more than its capacity, the least recently used entry is evicted.
   */
  set(key: K, value: V): void;
  /** Number of entries currently stored; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an empty LRU cache. Every operation runs in O(1).
 *
 * @param capacity - Maximum number of entries retained.
 * @returns A new, empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // Map iterates in insertion order, so re-inserting a key moves it to the
  // most-recent end and the first key is always the least recently used.
  const entries = new Map<K, V>();

  return {
    get(key: K): V | undefined {
      // has() rather than an undefined check, so stored `undefined` values still refresh recency
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
