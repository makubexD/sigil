/**
 * Fixed-capacity least-recently-used cache with O(1) get, set, and eviction.
 *
 * @module
 */

/** A bounded key/value cache that evicts the least recently used entry when full. */
export interface LruCache<K, V> {
  /** Returns the value for `key` and marks it most recently used, or `undefined` if absent. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the LRU entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently stored; never exceeds the capacity. */
  readonly size: number;
}

interface Node<K, V> {
  key: K;
  value: V;
  prev: Node<K, V>;
  next: Node<K, V>;
}

// Recency is a circular doubly linked list through a sentinel: head.next is the most recently
// used entry and head.prev the least. The Map gives O(1) lookup of a key's node; the list gives
// O(1) reordering and eviction, which Map insertion order alone cannot guarantee.
interface CacheState<K, V> {
  readonly capacity: number;
  readonly nodes: Map<K, Node<K, V>>;
  readonly head: Node<K, V>;
}

function createSentinel<K, V>(): Node<K, V> {
  // The sentinel never holds a real entry, so its key and value are never read.
  const sentinel = {} as Node<K, V>;
  sentinel.prev = sentinel;
  sentinel.next = sentinel;
  return sentinel;
}

function unlink<K, V>(node: Node<K, V>): void {
  node.prev.next = node.next;
  node.next.prev = node.prev;
}

function linkAfter<K, V>(anchor: Node<K, V>, node: Node<K, V>): void {
  node.prev = anchor;
  node.next = anchor.next;
  anchor.next.prev = node;
  anchor.next = node;
}

function markMostRecent<K, V>(state: CacheState<K, V>, node: Node<K, V>): void {
  unlink(node);
  linkAfter(state.head, node);
}

function getEntry<K, V>(state: CacheState<K, V>, key: K): V | undefined {
  const node = state.nodes.get(key);
  if (node === undefined) return undefined;
  markMostRecent(state, node);
  return node.value;
}

function setEntry<K, V>(state: CacheState<K, V>, key: K, value: V): void {
  const existing = state.nodes.get(key);
  if (existing !== undefined) {
    existing.value = value;
    markMostRecent(state, existing);
    return;
  }

  const node = { key, value } as Node<K, V>;
  linkAfter(state.head, node);
  state.nodes.set(key, node);
  if (state.nodes.size > state.capacity) evictLeastRecent(state);
}

function evictLeastRecent<K, V>(state: CacheState<K, V>): void {
  const leastRecent = state.head.prev;
  unlink(leastRecent);
  state.nodes.delete(leastRecent.key);
}

/**
 * Creates an empty LRU cache. Keys are compared with SameValueZero, as in `Map`.
 *
 * @param capacity - Maximum number of entries to retain.
 * @returns A cache whose `get`, `set`, and `size` all run in O(1).
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${String(capacity)}`);
  }

  const state: CacheState<K, V> = { capacity, nodes: new Map(), head: createSentinel() };
  return {
    get: (key) => getEntry(state, key),
    set: (key, value) => setEntry(state, key, value),
    get size() {
      return state.nodes.size;
    },
  };
}
