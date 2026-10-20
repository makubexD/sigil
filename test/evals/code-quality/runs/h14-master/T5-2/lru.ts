/**
 * Fixed-capacity least-recently-used cache with O(1) `get` and `set`.
 *
 * @module
 */

/** A bounded key/value cache that evicts its least recently used entry when full. */
export interface LruCache<K, V> {
  /** Returns the cached value and marks `key` as most recently used; `undefined` on a miss. */
  get(key: K): V | undefined;
  /**
   * Inserts or updates `key`, marks it as most recently used, then evicts the least recently
   * used entry if the cache now holds more than its capacity.
   */
  set(key: K, value: V): void;
  /** Number of entries currently held; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an empty LRU cache.
 *
 * @param capacity - Maximum number of entries retained; must be a positive integer.
 * @returns A new cache; instances share no state.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // Map iterates in insertion order, so re-inserting a key moves it to the most recently used
  // end and the first key is always the least recently used. Every operation is O(1).
  const entries = new Map<K, V>();

  function touch(key: K, value: V): void {
    entries.delete(key);
    entries.set(key, value);
  }

  return {
    get(key: K): V | undefined {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as V;
      touch(key, value);
      return value;
    },

    set(key: K, value: V): void {
      touch(key, value);
      if (entries.size <= capacity) return;
      const leastRecent = entries.keys().next();
      if (!leastRecent.done) entries.delete(leastRecent.value);
    },

    get size(): number {
      return entries.size;
    },
  };
}
