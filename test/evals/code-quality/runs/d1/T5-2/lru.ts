/**
 * Fixed-capacity least-recently-used cache.
 *
 * @module
 */

/** A key-value cache that evicts its least recently used entry once full. */
export interface LruCache<K, V> {
  /** Returns the value for `key` and marks it most recently used, or `undefined` if absent. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the LRU entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently held; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an LRU cache whose `get`, `set`, and `size` all run in O(1).
 *
 * @param capacity - Maximum number of entries to retain.
 * @returns An empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // A Map iterates in insertion order, so re-inserting a key moves it to the
  // most-recent end and the first key is always the least recently used.
  const entries = new Map<K, V>();

  function markMostRecent(key: K, value: V): void {
    entries.delete(key);
    entries.set(key, value);
  }

  function evictLeastRecent(): void {
    const oldest = entries.keys().next();
    if (!oldest.done) entries.delete(oldest.value);
  }

  return {
    get(key) {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as V;
      markMostRecent(key, value);
      return value;
    },
    set(key, value) {
      markMostRecent(key, value);
      if (entries.size > capacity) evictLeastRecent();
    },
    get size() {
      return entries.size;
    },
  };
}
