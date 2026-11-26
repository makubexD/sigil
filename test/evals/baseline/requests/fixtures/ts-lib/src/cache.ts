/** A cache that drops its least recently used entry once it holds more than `capacity`. */
export class LruCache<K, V> {
  private readonly items = new Map<K, V>();
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) throw new RangeError('capacity must be at least 1');
    this.capacity = capacity;
  }

  get size(): number {
    return this.items.size;
  }

  /** Reading an entry makes it the most recently used. */
  get(key: K): V | undefined {
    if (!this.items.has(key)) return undefined;
    const value = this.items.get(key) as V;
    this.touch(key, value);
    return value;
  }

  /** Writing an entry, new or not, makes it the most recently used. */
  set(key: K, value: V): void {
    if (this.items.has(key)) this.items.delete(key);
    this.items.set(key, value);
    if (this.items.size > this.capacity) {
      const oldest = this.items.keys().next().value as K;
      this.items.delete(oldest);
    }
  }

  private touch(key: K, value: V): void {
    this.items.delete(key);
    this.items.set(key, value);
  }
}
