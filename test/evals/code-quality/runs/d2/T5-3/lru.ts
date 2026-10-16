/**
 * Fixed-capacity least-recently-used cache with O(1) `get`, `set`, and `size`.
 *
 * @module
 */

/** A bounded key-value cache that evicts the least recently used entry when full. */
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
  /** Number of entries currently cached; never exceeds the capacity. */
  readonly size: number;
}

interface Entry<K, V> {
  readonly key: K;
  value: V;
  newer: Entry<K, V> | undefined;
  older: Entry<K, V> | undefined;
}

/**
 * Creates an empty LRU cache.
 *
 * Keys are compared with SameValueZero, as in `Map`.
 *
 * @param capacity - Maximum number of entries to retain; must be a positive integer.
 * @returns A new, empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${String(capacity)}`);
  }

  // A Map gives O(1) lookup; the doubly linked list gives O(1) recency reordering and eviction
  // without relying on Map's insertion-order iteration cost.
  const entries = new Map<K, Entry<K, V>>();
  let newest: Entry<K, V> | undefined;
  let oldest: Entry<K, V> | undefined;

  function unlink(entry: Entry<K, V>): void {
    if (entry.newer) entry.newer.older = entry.older;
    else newest = entry.older;
    if (entry.older) entry.older.newer = entry.newer;
    else oldest = entry.newer;
    entry.newer = undefined;
    entry.older = undefined;
  }

  function pushNewest(entry: Entry<K, V>): void {
    entry.older = newest;
    if (newest) newest.newer = entry;
    newest = entry;
    oldest ??= entry;
  }

  function touch(entry: Entry<K, V>): void {
    if (entry === newest) return;
    unlink(entry);
    pushNewest(entry);
  }

  function evictOldest(): void {
    if (!oldest) return;
    entries.delete(oldest.key);
    unlink(oldest);
  }

  return {
    get(key: K): V | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      touch(entry);
      return entry.value;
    },

    set(key: K, value: V): void {
      const existing = entries.get(key);
      if (existing) {
        existing.value = value;
        touch(existing);
        return;
      }
      const entry: Entry<K, V> = { key, value, newer: undefined, older: undefined };
      entries.set(key, entry);
      pushNewest(entry);
      if (entries.size > capacity) evictOldest();
    },

    get size(): number {
      return entries.size;
    },
  };
}
