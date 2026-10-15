/**
 * Fixed-capacity least-recently-used (LRU) cache.
 *
 * @module
 */

/** A bounded key/value cache that evicts the least recently used entry when full. */
export interface LruCache<K, V> {
  /** Returns the value for `key` and marks it most recently used, or `undefined` if absent. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the LRU entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently stored; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an LRU cache where `get` and `set` run in O(1).
 *
 * @param capacity - Maximum number of entries to retain.
 * @returns An empty cache bounded by `capacity`.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
  // Map iterates in insertion order, so re-inserting a key moves it to the
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
