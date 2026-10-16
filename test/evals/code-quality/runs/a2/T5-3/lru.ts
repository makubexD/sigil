/**
 * Fixed-capacity least-recently-used cache with O(1) `get`, `set`, and eviction.
 *
 * @module
 */

/** A bounded key/value cache that evicts the least recently used entry when full. */
export interface LruCache<K, V> {
  /** Returns the cached value, or `undefined` if absent, and marks the key most recently used. */
  get(key: K): V | undefined;
  /**
   * Inserts or updates `key` and marks it most recently used. Evicts the least recently
   * used entry if the insert pushes the size past capacity.
   */
  set(key: K, value: V): void;
  /** Number of entries currently held; never exceeds capacity. */
  readonly size: number;
}

interface Entry<K, V> {
  readonly key: K;
  value: V;
  older: Entry<K, V> | null;
  newer: Entry<K, V> | null;
}

/**
 * Doubly linked list ordered from least to most recently used. A Map alone would give
 * amortized O(1) via delete/re-insert, but the explicit list keeps every step worst-case O(1).
 */
class RecencyList<K, V> {
  oldest: Entry<K, V> | null = null;
  newest: Entry<K, V> | null = null;

  pushNewest(entry: Entry<K, V>): void {
    entry.older = this.newest;
    entry.newer = null;
    if (this.newest) this.newest.newer = entry;
    else this.oldest = entry;
    this.newest = entry;
  }

  remove(entry: Entry<K, V>): void {
    if (entry.older) entry.older.newer = entry.newer;
    else this.oldest = entry.newer;
    if (entry.newer) entry.newer.older = entry.older;
    else this.newest = entry.older;
    entry.older = null;
    entry.newer = null;
  }

  markNewest(entry: Entry<K, V>): void {
    if (entry === this.newest) return;
    this.remove(entry);
    this.pushNewest(entry);
  }
}

function assertPositiveInteger(capacity: number): void {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
}

/**
 * Creates an LRU cache holding at most `capacity` entries.
 *
 * Keys are compared with SameValueZero, as in `Map`.
 *
 * @param capacity - Maximum number of entries to retain.
 * @returns A new, empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  assertPositiveInteger(capacity);
  const index = new Map<K, Entry<K, V>>();
  const recency = new RecencyList<K, V>();

  const evictOldest = (): void => {
    const victim = recency.oldest;
    if (!victim) return;
    recency.remove(victim);
    index.delete(victim.key);
  };

  return {
    get(key) {
      const entry = index.get(key);
      if (!entry) return undefined;
      recency.markNewest(entry);
      return entry.value;
    },
    set(key, value) {
      const existing = index.get(key);
      if (existing) {
        existing.value = value;
        recency.markNewest(existing);
        return;
      }
      const entry: Entry<K, V> = { key, value, older: null, newer: null };
      index.set(key, entry);
      recency.pushNewest(entry);
      if (index.size > capacity) evictOldest();
    },
    get size() {
      return index.size;
    },
  };
}
