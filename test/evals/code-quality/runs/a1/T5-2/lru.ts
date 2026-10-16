/**
 * A fixed-capacity cache that evicts the least recently used entry.
 *
 * Both `get` (on a hit) and `set` mark the key as most recently used.
 */
export interface LruCache<K, V> {
  /** Returns the cached value, or `undefined` when the key is absent. */
  get(key: K): V | undefined;
  /** Inserts or updates the key, evicting the least recently used entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently held; never exceeds the capacity. */
  readonly size: number;
}

/**
 * Creates an LRU cache where every operation is O(1).
 *
 * @param capacity - Maximum number of entries to hold.
 * @returns An empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // Map iterates in insertion order, so re-inserting a key on use keeps the
  // least recently used entry first.
  const entries = new Map<K, V>();

  return {
    get(key) {
      // `has` rather than an undefined check, so stored `undefined` values still refresh.
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
        const leastRecent = entries.keys().next().value as K;
        entries.delete(leastRecent);
      }
    },
    get size() {
      return entries.size;
    },
  };
}
