/**
 * Fixed-capacity least-recently-used cache with O(1) `get` and `set`.
 *
 * @module
 */

/** A key-value cache that evicts the least recently used entry once full. */
export interface LruCache<K, V> {
  /** Returns the value for `key` and marks it most recently used, or `undefined` on a miss. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the oldest entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently stored; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an empty LRU cache.
 *
 * @param capacity - Maximum number of entries to retain.
 * @returns A new cache holding at most `capacity` entries.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
  // Map iterates in insertion order, so re-inserting a key moves it to the most-recent end
  // and the first key is always the least recently used.
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
      if (entries.size > capacity) evictOldest(entries);
    },
    get size(): number {
      return entries.size;
    },
  };
}

function evictOldest<K, V>(entries: Map<K, V>): void {
  const oldest = entries.keys().next();
  if (!oldest.done) entries.delete(oldest.value);
}
