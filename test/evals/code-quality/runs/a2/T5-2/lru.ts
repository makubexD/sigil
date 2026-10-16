/**
 * Fixed-capacity least-recently-used cache with O(1) `get`, `set`, and `size`.
 *
 * @module
 */

/** A key-value cache that evicts its least recently used entry when full. */
export interface LruCache<K, V> {
  /** Returns the value for `key` and marks it most recently used, or `undefined` if absent. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the LRU entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently held; never exceeds the cache's capacity. */
  readonly size: number;
}

interface Node<K, V> {
  key: K;
  value: V;
  prev: Node<K, V> | undefined;
  next: Node<K, V> | undefined;
}

/**
 * Creates an LRU cache holding at most `capacity` entries.
 *
 * A hash map gives O(1) lookup and a doubly linked list gives O(1) reordering and eviction;
 * relying on `Map` insertion order alone would make eviction depend on engine internals.
 *
 * @param capacity - Maximum number of entries; must be a positive integer.
 * @returns An empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  const nodes = new Map<K, Node<K, V>>();
  // head is the most recently used entry, tail the least.
  let head: Node<K, V> | undefined;
  let tail: Node<K, V> | undefined;

  function unlink(node: Node<K, V>): void {
    if (node.prev) node.prev.next = node.next;
    else head = node.next;
    if (node.next) node.next.prev = node.prev;
    else tail = node.prev;
    node.prev = undefined;
    node.next = undefined;
  }

  function pushFront(node: Node<K, V>): void {
    node.next = head;
    if (head) head.prev = node;
    head = node;
    tail ??= node;
  }

  function evictLeastRecent(): void {
    if (!tail) return;
    nodes.delete(tail.key);
    unlink(tail);
  }

  return {
    get(key) {
      const node = nodes.get(key);
      if (!node) return undefined;
      unlink(node);
      pushFront(node);
      return node.value;
    },
    set(key, value) {
      const existing = nodes.get(key);
      if (existing) {
        existing.value = value;
        unlink(existing);
        pushFront(existing);
        return;
      }
      const node: Node<K, V> = { key, value, prev: undefined, next: undefined };
      nodes.set(key, node);
      pushFront(node);
      if (nodes.size > capacity) evictLeastRecent();
    },
    get size() {
      return nodes.size;
    },
  };
}
