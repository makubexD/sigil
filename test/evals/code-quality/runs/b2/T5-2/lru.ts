/**
 * Fixed-capacity cache that evicts the least recently used entry. Keys compare by `SameValueZero`,
 * like `Map`.
 */
export interface LruCache<K, V> {
  /** Returns the value for `key` and marks it most recently used; `undefined` if absent. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the LRU entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently stored; never exceeds the capacity. */
  readonly size: number;
}

interface Node<K, V> {
  key: K;
  value: V;
  prev: Node<K, V> | null;
  next: Node<K, V> | null;
}

/**
 * Creates a least-recently-used cache holding at most `capacity` entries.
 *
 * A Map indexes the nodes of a doubly linked list ordered from least (head) to most (tail)
 * recently used, so `get`, `set`, and eviction are all O(1).
 *
 * @param capacity - Maximum number of entries to retain.
 * @returns An empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${String(capacity)}`);
  }

  const nodes = new Map<K, Node<K, V>>();
  let head: Node<K, V> | null = null;
  let tail: Node<K, V> | null = null;

  function unlink(node: Node<K, V>): void {
    if (node.prev) node.prev.next = node.next;
    else head = node.next;
    if (node.next) node.next.prev = node.prev;
    else tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  function append(node: Node<K, V>): void {
    node.prev = tail;
    node.next = null;
    if (tail) tail.next = node;
    else head = node;
    tail = node;
  }

  function touch(node: Node<K, V>): void {
    if (node === tail) return;
    unlink(node);
    append(node);
  }

  return {
    get(key) {
      const node = nodes.get(key);
      if (!node) return undefined;
      touch(node);
      return node.value;
    },

    set(key, value) {
      const existing = nodes.get(key);
      if (existing) {
        existing.value = value;
        touch(existing);
        return;
      }

      const node: Node<K, V> = { key, value, prev: null, next: null };
      nodes.set(key, node);
      append(node);

      if (nodes.size > capacity && head) {
        const lru = head;
        unlink(lru);
        nodes.delete(lru.key);
      }
    },

    get size() {
      return nodes.size;
    },
  };
}
