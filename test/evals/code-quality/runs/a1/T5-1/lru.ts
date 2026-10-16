/**
 * A fixed-capacity cache that evicts the least recently used entry. Keys are compared with
 * SameValueZero semantics, as in `Map`.
 */
export interface LruCache<K, V> {
  /** Returns the value for `key`, or `undefined` if absent, and marks `key` most recently used. */
  get(key: K): V | undefined;
  /**
   * Inserts or updates `key` and marks it most recently used, evicting the least recently used
   * entry if the cache is now over capacity.
   */
  set(key: K, value: V): void;
  /** Number of entries currently held; never exceeds the capacity. */
  readonly size: number;
}

interface Node<K, V> {
  key: K;
  value: V;
  prev: Node<K, V>;
  next: Node<K, V>;
}

/**
 * Creates a least-recently-used cache in which `get`, `set`, and `size` are all O(1).
 *
 * @param capacity - Maximum number of entries to hold.
 * @returns An empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }

  // A Map indexes nodes of a circular doubly linked list ordered from least recently used
  // (sentinel.next) to most recently used (sentinel.prev). Relinking a node is O(1) worst case,
  // unlike re-inserting into the Map to reorder it.
  const nodes = new Map<K, Node<K, V>>();
  // The sentinel's key and value are never read.
  const sentinel = {} as Node<K, V>;
  sentinel.prev = sentinel;
  sentinel.next = sentinel;

  function unlink(node: Node<K, V>): void {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  function append(node: Node<K, V>): void {
    node.prev = sentinel.prev;
    node.next = sentinel;
    sentinel.prev.next = node;
    sentinel.prev = node;
  }

  return {
    get(key) {
      const node = nodes.get(key);
      if (node === undefined) return undefined;
      unlink(node);
      append(node);
      return node.value;
    },

    set(key, value) {
      const existing = nodes.get(key);
      if (existing !== undefined) {
        existing.value = value;
        unlink(existing);
        append(existing);
        return;
      }

      const node = { key, value } as Node<K, V>;
      append(node);
      nodes.set(key, node);

      if (nodes.size > capacity) {
        const lru = sentinel.next;
        unlink(lru);
        nodes.delete(lru.key);
      }
    },

    get size() {
      return nodes.size;
    },
  };
}
