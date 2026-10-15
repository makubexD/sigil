/**
 * Fixed-capacity least-recently-used cache with O(1) `get`, `set`, and eviction.
 *
 * @module
 */

/** A bounded key-value cache that evicts the least recently used entry when full. */
export interface LruCache<K, V> {
  /** Returns the cached value and marks `key` as most recently used, or `undefined` on a miss. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the LRU entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently cached; never exceeds the capacity. */
  readonly size: number;
}

interface Entry<K, V> {
  readonly key: K;
  value: V;
  prev: Entry<K, V> | undefined;
  next: Entry<K, V> | undefined;
}

// Doubly linked list ordered from least (head) to most (tail) recently used; the Map gives O(1)
// lookup and the list gives O(1) reordering and eviction.
interface CacheState<K, V> {
  readonly capacity: number;
  readonly entries: Map<K, Entry<K, V>>;
  head: Entry<K, V> | undefined;
  tail: Entry<K, V> | undefined;
}

/**
 * Creates an empty LRU cache.
 *
 * @param capacity - Maximum number of entries to retain.
 * @returns A cache whose operations all run in O(1) time.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${String(capacity)}`);
  }
  const state: CacheState<K, V> = { capacity, entries: new Map(), head: undefined, tail: undefined };
  return {
    get: (key) => getValue(state, key),
    set: (key, value) => setValue(state, key, value),
    get size() {
      return state.entries.size;
    },
  };
}

function getValue<K, V>(state: CacheState<K, V>, key: K): V | undefined {
  const entry = state.entries.get(key);
  if (!entry) return undefined;
  moveToTail(state, entry);
  return entry.value;
}

function setValue<K, V>(state: CacheState<K, V>, key: K, value: V): void {
  const existing = state.entries.get(key);
  if (existing) {
    existing.value = value;
    moveToTail(state, existing);
    return;
  }
  const entry: Entry<K, V> = { key, value, prev: undefined, next: undefined };
  state.entries.set(key, entry);
  appendToTail(state, entry);
  if (state.entries.size > state.capacity) evictHead(state);
}

function evictHead<K, V>(state: CacheState<K, V>): void {
  const lru = state.head;
  if (!lru) return;
  unlink(state, lru);
  state.entries.delete(lru.key);
}

function moveToTail<K, V>(state: CacheState<K, V>, entry: Entry<K, V>): void {
  if (entry === state.tail) return;
  unlink(state, entry);
  appendToTail(state, entry);
}

function appendToTail<K, V>(state: CacheState<K, V>, entry: Entry<K, V>): void {
  entry.prev = state.tail;
  entry.next = undefined;
  if (state.tail) state.tail.next = entry;
  else state.head = entry;
  state.tail = entry;
}

function unlink<K, V>(state: CacheState<K, V>, entry: Entry<K, V>): void {
  if (entry.prev) entry.prev.next = entry.next;
  else state.head = entry.next;
  if (entry.next) entry.next.prev = entry.prev;
  else state.tail = entry.prev;
  entry.prev = undefined;
  entry.next = undefined;
}
