/**
 * A fixed-capacity cache that evicts the least recently used entry on overflow.
 *
 * Both `get` (on a hit) and `set` mark the key as most recently used. All
 * operations run in O(1).
 */
export interface LruCache<K, V> {
  /** Returns the value for `key` and marks it most recently used, or `undefined` on a miss. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the LRU entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently stored; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an empty LRU cache.
 *
 * @param capacity - Maximum number of entries to keep; must be a positive integer.
 * @returns A new cache with no entries.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // Map iterates in insertion order, so delete + set moves a key to the
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
        const leastRecentKey = entries.keys().next().value as K;
        entries.delete(leastRecentKey);
      }
    },
    get size() {
      return entries.size;
    },
  };
}
