/**
 * Fixed-capacity least-recently-used cache with O(1) `get`, `set`, and `size`.
 *
 * @module
 */

/** A key-value cache that evicts the least recently used entry once full. */
export interface LruCache<K, V> {
  /** Returns the cached value and marks `key` as most recently used; `undefined` if absent. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the LRU entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently cached; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an empty LRU cache.
 *
 * @param capacity - Maximum number of entries retained; must be a positive integer.
 * @returns A new cache instance.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
  // A Map iterates in insertion order, so re-inserting a key moves it to the
  // most-recent end and the first key is always the least recently used.
  const entries = new Map<K, V>();

  return {
    get(key) {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as V;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > capacity) {
        const leastRecent = entries.keys().next().value as K;
        entries.delete(leastRecent);
      }
    },
    get size() {
      return entries.size;
    },
  };
}
