export interface LruCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  readonly size: number;
}

/**
 * Creates a fixed-capacity cache that evicts the least recently used entry.
 * `get` and `set` both mark the key as most recently used; all operations are O(1).
 *
 * @throws {RangeError} when `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${String(capacity)}`);
  }

  // A Map iterates in insertion order, so the first key is the least recently
  // used. Deleting and re-inserting a key moves it to the end in O(1).
  const entries = new Map<K, V>();

  return {
    get(key) {
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
        const oldest = entries.keys().next().value as K;
        entries.delete(oldest);
      }
    },
    get size() {
      return entries.size;
    },
  };
}
