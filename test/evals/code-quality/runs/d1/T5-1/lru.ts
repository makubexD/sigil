/**
 * Fixed-capacity least-recently-used cache.
 *
 * @module
 */

/** A key-value cache that evicts the least recently used entry once it exceeds its capacity. */
export interface LruCache<K, V> {
  /** Returns the value for `key` and marks it most recently used, or `undefined` if absent. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the oldest entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently stored; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an LRU cache where `get`, `set`, and `size` are all O(1).
 *
 * @param capacity - Maximum number of entries retained; must be a positive integer.
 * @returns An empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // A Map iterates in insertion order, so re-inserting a key moves it to the most recently used
  // end and the first key is always the least recently used.
  const entries = new Map<K, V>();

  function markMostRecentlyUsed(key: K, value: V): void {
    entries.delete(key);
    entries.set(key, value);
  }

  function evictLeastRecentlyUsed(): void {
    const oldest = entries.keys().next();
    if (!oldest.done) entries.delete(oldest.value);
  }

  return {
    get(key: K): V | undefined {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as V;
      markMostRecentlyUsed(key, value);
      return value;
    },
    set(key: K, value: V): void {
      markMostRecentlyUsed(key, value);
      if (entries.size > capacity) evictLeastRecentlyUsed();
    },
    get size(): number {
      return entries.size;
    },
  };
}
