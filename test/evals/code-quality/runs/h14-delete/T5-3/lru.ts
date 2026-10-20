/**
 * Fixed-capacity least-recently-used cache with O(1) `get` and `set`.
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
 * @param capacity - Maximum number of entries; must be a positive integer.
 * @returns A new, empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // A Map alone would rely on re-insertion order, and V8's iteration past deleted slots makes
  // finding the oldest key only amortized O(1); an explicit list keeps every step constant-time.
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

  function touch(entry: Entry<K, V>): void {
    if (entry === newest) return;
    unlink(entry);
    pushNewest(entry);
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

      if (entries.size > capacity && oldest) {
        const evicted = oldest;
        unlink(evicted);
        entries.delete(evicted.key);
      }
    },

    get size(): number {
      return entries.size;
    },
  };
}
