/**
 * Fixed-capacity least-recently-used cache with O(1) `get`, `set`, and eviction.
 *
 * @module
 */

/**
 * A bounded key/value cache that evicts the least recently used entry when full.
 *
 * Both `get` (on a hit) and `set` mark the key as most recently used.
 */
export interface LruCache<K, V> {
  /** Returns the cached value, or `undefined` on a miss. A miss does not affect recency. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, then evicts the least recently used entry if over capacity. */
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

// A Map alone gives O(1) lookup but not O(1) reordering, so recency is kept in a
// doubly linked list threaded through the entries.
interface RecencyList<K, V> {
  newest: Entry<K, V> | undefined;
  oldest: Entry<K, V> | undefined;
}

/**
 * Creates an empty LRU cache.
 *
 * @param capacity - Maximum number of entries to retain.
 * @returns A cache whose operations all run in O(1) time.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  assertPositiveInteger(capacity);
  const entries = new Map<K, Entry<K, V>>();
  const recency: RecencyList<K, V> = { newest: undefined, oldest: undefined };
  return {
    get: (key) => readEntry(entries, recency, key),
    set: (key, value) => {
      writeEntry(entries, recency, key, value);
      evictOverflow(entries, recency, capacity);
    },
    get size() {
      return entries.size;
    },
  };
}

function assertPositiveInteger(capacity: number): void {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${String(capacity)}`);
  }
}

function readEntry<K, V>(
  entries: Map<K, Entry<K, V>>,
  recency: RecencyList<K, V>,
  key: K,
): V | undefined {
  const entry = entries.get(key);
  if (entry === undefined) return undefined;
  markNewest(recency, entry);
  return entry.value;
}

function writeEntry<K, V>(
  entries: Map<K, Entry<K, V>>,
  recency: RecencyList<K, V>,
  key: K,
  value: V,
): void {
  const existing = entries.get(key);
  if (existing !== undefined) {
    existing.value = value;
    markNewest(recency, existing);
    return;
  }
  const entry: Entry<K, V> = { key, value, newer: undefined, older: undefined };
  entries.set(key, entry);
  pushNewest(recency, entry);
}

function evictOverflow<K, V>(
  entries: Map<K, Entry<K, V>>,
  recency: RecencyList<K, V>,
  capacity: number,
): void {
  const oldest = recency.oldest;
  if (entries.size <= capacity || oldest === undefined) return;
  unlink(recency, oldest);
  entries.delete(oldest.key);
}

function markNewest<K, V>(recency: RecencyList<K, V>, entry: Entry<K, V>): void {
  if (recency.newest === entry) return;
  unlink(recency, entry);
  pushNewest(recency, entry);
}

function pushNewest<K, V>(recency: RecencyList<K, V>, entry: Entry<K, V>): void {
  entry.older = recency.newest;
  if (recency.newest !== undefined) recency.newest.newer = entry;
  recency.newest = entry;
  recency.oldest ??= entry;
}

function unlink<K, V>(recency: RecencyList<K, V>, entry: Entry<K, V>): void {
  if (entry.newer !== undefined) entry.newer.older = entry.older;
  else recency.newest = entry.older;
  if (entry.older !== undefined) entry.older.newer = entry.newer;
  else recency.oldest = entry.newer;
  entry.newer = undefined;
  entry.older = undefined;
}
