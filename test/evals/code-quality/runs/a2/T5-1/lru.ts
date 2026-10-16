/**
 * Fixed-capacity least-recently-used cache.
 *
 * @module
 */

/** A key-value cache that evicts its least recently used entry once full. */
export interface LruCache<K, V> {
  /**
   * Returns the value for `key` and marks it most recently used.
   *
   * @returns The cached value, or `undefined` when `key` is absent.
   */
  get(key: K): V | undefined;
  /**
   * Inserts or updates `key` and marks it most recently used, evicting the
   * least recently used entry if the cache then exceeds its capacity.
   */
  set(key: K, value: V): void;
  /** Number of entries currently held; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an LRU cache whose `get` and `set` run in O(1) time.
 *
 * @param capacity - Maximum number of entries to retain.
 * @returns An empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  assertPositiveInteger(capacity);
  // Map iterates in insertion order, so re-inserting a key moves it to the
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

function assertPositiveInteger(capacity: number): void {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
}
