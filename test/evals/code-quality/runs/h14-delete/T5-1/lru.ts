/**
 * A fixed-capacity cache that evicts the least recently used entry when full.
 *
 * Both `get` (on a hit) and `set` count as a use. Every operation is O(1).
 */
export interface LruCache<K, V> {
  /** Returns the cached value and marks `key` as most recently used, or `undefined` on a miss. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the LRU entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently cached; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an empty LRU cache holding at most `capacity` entries.
 *
 * @param capacity - Maximum number of entries to retain.
 * @returns A new, empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${String(capacity)}`);
  }

  // A Map iterates in insertion order, so delete-then-set moves a key to the most recently used
  // end and the first key is always the least recently used — O(1) without a separate linked list.
  const entries = new Map<K, V>();

  return {
    get(key: K): V | undefined {
      // has() rather than an undefined check, so a stored `undefined` value still counts as a hit.
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as V;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },

    set(key: K, value: V): void {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > capacity) {
        const leastRecentlyUsedKey = entries.keys().next().value as K;
        entries.delete(leastRecentlyUsedKey);
      }
    },

    get size(): number {
      return entries.size;
    },
  };
}
