/**
 * Fixed-capacity least-recently-used cache with O(1) `get` and `set`.
 *
 * @module
 */

/** A bounded key-value cache that evicts the least recently used entry when full. */
export interface LruCache<K, V> {
  /** Returns the value for `key` and marks it most recently used, or `undefined` if absent. */
  get(key: K): V | undefined;
  /** Inserts or updates `key`, marks it most recently used, and evicts the LRU entry if over capacity. */
  set(key: K, value: V): void;
  /** Number of entries currently stored; never exceeds the capacity. */
  readonly size: number;
}

interface Node<K, V> {
  readonly key: K;
  value: V;
  prev: Node<K, V> | undefined;
  next: Node<K, V> | undefined;
}

// A Map alone keeps insertion order, but reading its oldest key is not guaranteed O(1) after
// many deletions, so recency is tracked with an explicit doubly linked list instead.
class RecencyList<K, V> {
  #head: Node<K, V> | undefined;
  #tail: Node<K, V> | undefined;

  get leastRecent(): Node<K, V> | undefined {
    return this.#tail;
  }

  pushFront(node: Node<K, V>): void {
    node.prev = undefined;
    node.next = this.#head;
    if (this.#head) this.#head.prev = node;
    this.#head = node;
    this.#tail ??= node;
  }

  remove(node: Node<K, V>): void {
    if (node.prev) node.prev.next = node.next;
    else this.#head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.#tail = node.prev;
    node.prev = undefined;
    node.next = undefined;
  }

  moveToFront(node: Node<K, V>): void {
    this.remove(node);
    this.pushFront(node);
  }
}

/**
 * Creates an empty LRU cache.
 *
 * Keys are compared with SameValueZero, as in `Map`.
 *
 * @param capacity - Maximum number of entries retained; must be a positive integer.
 * @returns A new cache holding at most `capacity` entries.
 * @throws {RangeError} If `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
  const nodes = new Map<K, Node<K, V>>();
  const recency = new RecencyList<K, V>();

  return {
    get(key: K): V | undefined {
      const node = nodes.get(key);
      if (!node) return undefined;
      recency.moveToFront(node);
      return node.value;
    },
    set(key: K, value: V): void {
      const existing = nodes.get(key);
      if (existing) {
        existing.value = value;
        recency.moveToFront(existing);
        return;
      }
      const node: Node<K, V> = { key, value, prev: undefined, next: undefined };
      nodes.set(key, node);
      recency.pushFront(node);
      if (nodes.size > capacity) evictLeastRecent(nodes, recency);
    },
    get size(): number {
      return nodes.size;
    },
  };
}

function evictLeastRecent<K, V>(nodes: Map<K, Node<K, V>>, recency: RecencyList<K, V>): void {
  const victim = recency.leastRecent;
  if (!victim) return;
  recency.remove(victim);
  nodes.delete(victim.key);
}
