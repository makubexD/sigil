export interface LruCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  readonly size: number;
}

interface Entry<K, V> {
  readonly key: K;
  value: V;
  prev: Entry<K, V> | undefined;
  next: Entry<K, V> | undefined;
}

/** Doubly linked list ordered from least (head) to most (tail) recently used. */
interface RecencyList<K, V> {
  head: Entry<K, V> | undefined;
  tail: Entry<K, V> | undefined;
}

function unlink<K, V>(list: RecencyList<K, V>, entry: Entry<K, V>): void {
  if (entry.prev) entry.prev.next = entry.next;
  else list.head = entry.next;
  if (entry.next) entry.next.prev = entry.prev;
  else list.tail = entry.prev;
  entry.prev = undefined;
  entry.next = undefined;
}

function append<K, V>(list: RecencyList<K, V>, entry: Entry<K, V>): void {
  entry.prev = list.tail;
  if (list.tail) list.tail.next = entry;
  else list.head = entry;
  list.tail = entry;
}

function moveToTail<K, V>(list: RecencyList<K, V>, entry: Entry<K, V>): void {
  if (entry === list.tail) return;
  unlink(list, entry);
  append(list, entry);
}

function assertPositiveInteger(capacity: number): void {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
}

/**
 * Creates a least-recently-used cache holding at most `capacity` entries.
 *
 * A Map indexes the nodes of a doubly linked list so that lookup, recency
 * update, and eviction are all O(1).
 *
 * @throws {RangeError} when `capacity` is not a positive integer.
 */
export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  assertPositiveInteger(capacity);
  const entries = new Map<K, Entry<K, V>>();
  const list: RecencyList<K, V> = { head: undefined, tail: undefined };

  function evictLeastRecent(): void {
    const oldest = list.head;
    if (!oldest) return;
    unlink(list, oldest);
    entries.delete(oldest.key);
  }

  function insert(key: K, value: V): void {
    const entry: Entry<K, V> = { key, value, prev: undefined, next: undefined };
    entries.set(key, entry);
    append(list, entry);
    if (entries.size > capacity) evictLeastRecent();
  }

  return {
    get(key: K): V | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      moveToTail(list, entry);
      return entry.value;
    },
    set(key: K, value: V): void {
      const existing = entries.get(key);
      if (!existing) return insert(key, value);
      existing.value = value;
      moveToTail(list, existing);
    },
    get size(): number {
      return entries.size;
    },
  };
}
