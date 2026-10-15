/**
 * Fixed-capacity cache that evicts the least recently used entry.
 */
export interface LruCache<K, V> {
  /**
   * Returns the value for `key` and marks it most recently used.
   *
   * @returns The cached value, or `undefined` when `key` is absent.
   */
  get(key: K): V | undefined;
  /**
   * Inserts or updates `key` and marks it most recently used. Evicts the
   * least recently used entry if this pushes the size above capacity.
   */
  set(key: K, value: V): void;
  /** Number of entries currently cached; never exceeds capacity. */
  readonly size: number;
}

interface Entry<K, V> {
  readonly key: K;
  value: V;
  prev: Entry<K, V> | undefined;
  next: Entry<K, V> | undefined;
}

/**
 * Creates an LRU cache whose `get`, `set`, and `size` all run in O(1).
 *
 * A Map gives O(1) lookup; a doubly linked list ordered from least to most
 * recently used makes promotion and eviction O(1) without relying on Map
 * iteration order.
 *
 * @param capacity - Maximum number of entries to retain.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${String(capacity)}`);
  }

  const entries = new Map<K, Entry<K, V>>();
  let oldest: Entry<K, V> | undefined;
  let newest: Entry<K, V> | undefined;

  function unlink(entry: Entry<K, V>): void {
    if (entry.prev) entry.prev.next = entry.next;
    else oldest = entry.next;
    if (entry.next) entry.next.prev = entry.prev;
    else newest = entry.prev;
    entry.prev = undefined;
    entry.next = undefined;
  }

  function append(entry: Entry<K, V>): void {
    entry.prev = newest;
    if (newest) newest.next = entry;
    else oldest = entry;
    newest = entry;
  }

  function markMostRecent(entry: Entry<K, V>): void {
    if (entry === newest) return;
    unlink(entry);
    append(entry);
  }

  function evictOldest(): void {
    if (!oldest) return;
    entries.delete(oldest.key);
    unlink(oldest);
  }

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      markMostRecent(entry);
      return entry.value;
    },

    set(key, value) {
      const existing = entries.get(key);
      if (existing) {
        existing.value = value;
        markMostRecent(existing);
        return;
      }
      const entry: Entry<K, V> = { key, value, prev: undefined, next: undefined };
      entries.set(key, entry);
      append(entry);
      if (entries.size > capacity) evictOldest();
    },

    get size() {
      return entries.size;
    },
  };
}
