/**
 * Fixed-capacity least-recently-used cache with O(1) `get` and `set`.
 *
 * @module
 */

/** A bounded key-value cache that evicts the least recently used entry. */
export interface LruCache<K, V> {
  /** Returns the cached value, or `undefined` on a miss, and marks the key as most recently used. */
  get(key: K): V | undefined;
  /** Inserts or updates the entry, marks it most recently used, and evicts the oldest entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently cached; never exceeds the capacity. */
  readonly size: number;
}

interface Entry<K, V> {
  readonly key: K;
  value: V;
  older: Entry<K, V> | undefined;
  newer: Entry<K, V> | undefined;
}

// A doubly linked list gives O(1) reordering and eviction; a Map alone only
// gives amortized O(1) because deleted slots linger until it rehashes.
class RecencyList<K, V> {
  #oldest: Entry<K, V> | undefined;
  #newest: Entry<K, V> | undefined;

  get oldest(): Entry<K, V> | undefined {
    return this.#oldest;
  }

  append(entry: Entry<K, V>): void {
    entry.older = this.#newest;
    entry.newer = undefined;
    if (this.#newest) this.#newest.newer = entry;
    else this.#oldest = entry;
    this.#newest = entry;
  }

  remove(entry: Entry<K, V>): void {
    if (entry.older) entry.older.newer = entry.newer;
    else this.#oldest = entry.newer;
    if (entry.newer) entry.newer.older = entry.older;
    else this.#newest = entry.older;
    entry.older = undefined;
    entry.newer = undefined;
  }

  moveToNewest(entry: Entry<K, V>): void {
    if (entry === this.#newest) return;
    this.remove(entry);
    this.append(entry);
  }
}

class MapBackedLruCache<K, V> implements LruCache<K, V> {
  readonly #capacity: number;
  readonly #entries = new Map<K, Entry<K, V>>();
  readonly #recency = new RecencyList<K, V>();

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  get size(): number {
    return this.#entries.size;
  }

  get(key: K): V | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    this.#recency.moveToNewest(entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    const existing = this.#entries.get(key);
    if (existing) {
      existing.value = value;
      this.#recency.moveToNewest(existing);
      return;
    }
    const entry: Entry<K, V> = { key, value, older: undefined, newer: undefined };
    this.#entries.set(key, entry);
    this.#recency.append(entry);
    if (this.#entries.size > this.#capacity) this.#evictOldest();
  }

  #evictOldest(): void {
    const oldest = this.#recency.oldest;
    if (!oldest) return;
    this.#recency.remove(oldest);
    this.#entries.delete(oldest.key);
  }
}

/**
 * Creates an empty LRU cache holding at most `capacity` entries.
 *
 * Keys are compared with SameValueZero, as in `Map`.
 *
 * @param capacity - Maximum number of entries to retain.
 * @returns A cache whose `get` and `set` run in O(1).
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${String(capacity)}`);
  }
  return new MapBackedLruCache<K, V>(capacity);
}
