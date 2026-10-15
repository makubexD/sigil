/**
 * Fixed-capacity least-recently-used cache with O(1) `get` and `set`.
 *
 * @module
 */

/** A bounded key/value cache that evicts the least recently used entry when full. */
export interface LruCache<K, V> {
  /**
   * Looks up `key` and marks it as most recently used.
   *
   * @returns The cached value, or `undefined` when `key` is absent.
   */
  get(key: K): V | undefined;
  /**
   * Inserts or updates `key` and marks it as most recently used. Evicts the least
   * recently used entry when the insert pushes the size above capacity.
   */
  set(key: K, value: V): void;
  /** Number of entries currently held; never exceeds capacity. */
  readonly size: number;
}

/**
 * Creates an empty LRU cache.
 *
 * @param capacity - Maximum number of entries to retain; must be a positive integer.
 * @returns A new cache instance with no shared state.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
  // A Map iterates in insertion order, so delete-then-set moves a key to the
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
        const leastRecent = entries.keys().next().value as K;
        entries.delete(leastRecent);
      }
    },
    get size(): number {
      return entries.size;
    },
  };
}
