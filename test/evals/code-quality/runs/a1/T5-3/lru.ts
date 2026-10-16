/**
 * Fixed-capacity least-recently-used cache with O(1) `get` and `set`.
 *
 * @module
 */

/** A key/value cache that evicts its least recently used entry once full. */
export interface LruCache<K, V> {
  /**
   * Looks up `key` and, if present, marks it as the most recently used entry.
   *
   * @returns The cached value, or `undefined` when `key` is absent.
   */
  get(key: K): V | undefined;

  /**
   * Inserts or updates `key`, marks it as the most recently used entry, and
   * evicts the least recently used entry if the cache now exceeds its capacity.
   */
  set(key: K, value: V): void;

  /** Number of entries currently held; never exceeds the capacity. */
  readonly size: number;
}

interface Node<K, V> {
  readonly key: K;
  value: V;
  prev: Node<K, V> | undefined;
  next: Node<K, V> | undefined;
}

/**
 * Creates an empty LRU cache.
 *
 * Recency is tracked with a doubly linked list indexed by a `Map`, rather than
 * relying on `Map` insertion order, so eviction stays O(1) even after many
 * deletions.
 *
 * @param capacity - Maximum number of entries to retain.
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

  function touch(node: Node<K, V>): void {
    if (node === head) return;
    unlink(node);
    pushFront(node);
  }

  return {
    get(key: K): V | undefined {
      const node = nodes.get(key);
      if (!node) return undefined;
      touch(node);
      return node.value;
    },

    set(key: K, value: V): void {
      const existing = nodes.get(key);
      if (existing) {
        existing.value = value;
        touch(existing);
        return;
      }

      const node: Node<K, V> = { key, value, prev: undefined, next: undefined };
      nodes.set(key, node);
      pushFront(node);

      if (nodes.size > capacity && tail) {
        const evicted = tail;
        unlink(evicted);
        nodes.delete(evicted.key);
      }
    },

    get size(): number {
      return nodes.size;
    },
  };
}
