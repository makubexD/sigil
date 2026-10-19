export interface DeduperOptions {
  windowMs: number;
  now?: () => number;
}

export interface Deduper {
  isDuplicate(id: string): boolean;
  readonly size: number;
}

/**
 * Remembers ids for `windowMs` so an at-least-once consumer can drop redeliveries.
 *
 * Memory stays bounded by the number of ids seen within one window: records live in a Map whose
 * insertion order is also recording order, so expired records are evicted from the front on every
 * call. A record is only ever inserted at the current time (duplicates don't refresh it), which
 * keeps the Map sorted by timestamp and makes eviction amortized O(1).
 */
export function createDeduper(opts: DeduperOptions): Deduper {
  const { windowMs, now = Date.now } = opts;
  if (!Number.isFinite(windowMs) || windowMs < 0) {
    throw new RangeError(`windowMs must be a finite, non-negative number; got ${windowMs}`);
  }

  // id -> time it was recorded, in recording order.
  const seen = new Map<string, number>();

  function evictExpired(t: number): void {
    for (const [id, recordedAt] of seen) {
      // If the clock stepped backwards, a later entry may carry an earlier timestamp. Stopping at
      // the first live entry only delays eviction of what follows; it never evicts a live record.
      if (t - recordedAt < windowMs) break;
      seen.delete(id);
    }
  }

  return {
    isDuplicate(id: string): boolean {
      const t = now();
      evictExpired(t);
      const recordedAt = seen.get(id);
      if (recordedAt !== undefined && t - recordedAt < windowMs) return true;
      // Delete first so a stale record left behind by a backwards clock step moves to the end.
      seen.delete(id);
      seen.set(id, t);
      return false;
    },
    get size(): number {
      evictExpired(now());
      return seen.size;
    },
  };
}
