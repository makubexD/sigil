/**
 * Fixed-capacity least-recently-used cache with O(1) `get` and `set`.
 *
 * @module
 */

/** A bounded key/value cache that evicts the least recently used entry when full. */
export interface LruCache<K, V> {
  /**
   * Looks up `key` and, if present, marks it as the most recently used entry.
   *
   * @returns The cached value, or `undefined` when `key` is absent.
   */
  get(key: K): V | undefined;

  /**
   * Inserts or updates `key` and marks it as the most recently used entry. If the cache then
   * holds more than its capacity, the least recently used entry is evicted.
   */
  set(key: K, value: V): void;

  /** Number of entries currently held; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an empty LRU cache.
 *
 * @param capacity - Maximum number of entries to retain; must be a positive integer.
 * @returns A new cache holding at most `capacity` entries.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // A Map iterates in insertion order, so re-inserting a key moves it to the most recently used
  // end and the first key is always the least recently used — every step is O(1).
  const entries = new Map<K, V>();

  function touch(key: K, value: V): void {
    entries.delete(key);
    entries.set(key, value);
  }

  function evictLeastRecentlyUsed(): void {
    const oldest = entries.keys().next();
    if (!oldest.done) entries.delete(oldest.value);
  }

  return {
    get(key: K): V | undefined {
      // Check membership explicitly: a stored `undefined` value must still count as a hit.
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as V;
      touch(key, value);
      return value;
    },
    set(key: K, value: V): void {
      touch(key, value);
      if (entries.size > capacity) evictLeastRecentlyUsed();
    },
    get size(): number {
      return entries.size;
    },
  };
}
