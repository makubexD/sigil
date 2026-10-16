/**
 * Fixed-capacity least-recently-used cache with O(1) `get`, `set`, and `size`.
 *
 * @module
 */

/** A bounded key-value cache that evicts its least recently used entry when full. */
export interface LruCache<K, V> {
  /** Returns the value for `key` and marks it most recently used, or `undefined` if absent. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the LRU entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently held; never exceeds the capacity. */
  readonly size: number;
}

interface Entry<K, V> {
  readonly key: K;
  value: V;
  newer: Entry<K, V> | undefined;
  older: Entry<K, V> | undefined;
}

/**
 * Creates an LRU cache holding at most `capacity` entries.
 *
 * A `Map` gives O(1) lookup; a doubly linked list ordered by recency gives O(1)
 * promotion and eviction without depending on engine-specific `Map` iteration costs.
 *
 * @param capacity - Maximum number of entries; must be a positive integer.
 * @returns An empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

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
    else oldest = entry;
    newest = entry;
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
      unlink(entry);
      pushNewest(entry);
      return entry.value;
    },

    set(key: K, value: V): void {
      const existing = entries.get(key);
      if (existing) {
        existing.value = value;
        unlink(existing);
        pushNewest(existing);
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
