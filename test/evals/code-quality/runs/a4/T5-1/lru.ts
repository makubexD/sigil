/**
 * A fixed-capacity cache that evicts the least recently used entry.
 *
 * Both `get` and `set` count as a use. All operations run in O(1) time.
 */
export interface LruCache<K, V> {
  /** Returns the cached value and marks `key` as most recently used, or `undefined` on a miss. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the LRU entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently cached; never exceeds the capacity. */
  readonly size: number;
}

interface Node<K, V> {
  readonly key: K;
  value: V;
  prev: Node<K, V> | undefined;
  next: Node<K, V> | undefined;
}

/**
 * Doubly linked list ordered from least (`head`) to most (`tail`) recently used.
 * A plain Map's insertion order would also work, but finding its oldest key is only
 * amortized O(1); the list keeps every step strictly constant time.
 */
interface RecencyList<K, V> {
  head: Node<K, V> | undefined;
  tail: Node<K, V> | undefined;
}

function unlink<K, V>(list: RecencyList<K, V>, node: Node<K, V>): void {
  if (node.prev) node.prev.next = node.next;
  else list.head = node.next;
  if (node.next) node.next.prev = node.prev;
  else list.tail = node.prev;
  node.prev = undefined;
  node.next = undefined;
}

function append<K, V>(list: RecencyList<K, V>, node: Node<K, V>): void {
  node.prev = list.tail;
  if (list.tail) list.tail.next = node;
  else list.head = node;
  list.tail = node;
}

function moveToTail<K, V>(list: RecencyList<K, V>, node: Node<K, V>): void {
  if (list.tail === node) return;
  unlink(list, node);
  append(list, node);
}

/**
 * Creates an empty LRU cache holding at most `capacity` entries.
 *
 * Keys are compared with SameValueZero, as in `Map`.
 *
 * @param capacity - Maximum number of entries; must be a positive integer.
 * @returns A new, empty cache.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
  const nodes = new Map<K, Node<K, V>>();
  const list: RecencyList<K, V> = { head: undefined, tail: undefined };

  function evictLeastRecent(): void {
    const oldest = list.head;
    if (!oldest) return;
    unlink(list, oldest);
    nodes.delete(oldest.key);
  }

  return {
    get(key) {
      const node = nodes.get(key);
      if (!node) return undefined;
      moveToTail(list, node);
      return node.value;
    },
    set(key, value) {
      const existing = nodes.get(key);
      if (existing) {
        existing.value = value;
        moveToTail(list, existing);
        return;
      }
      const node: Node<K, V> = { key, value, prev: undefined, next: undefined };
      nodes.set(key, node);
      append(list, node);
      if (nodes.size > capacity) evictLeastRecent();
    },
    get size() {
      return nodes.size;
    },
  };
}
