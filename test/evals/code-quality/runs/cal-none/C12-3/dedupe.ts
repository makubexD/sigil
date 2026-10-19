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
 * Memory stays bounded by the ids seen in the last `windowMs`: a Map iterates in
 * insertion order, and since an id is only (re)inserted at the current time and a
 * duplicate never refreshes its record, the oldest records are always at the front.
 * Expired records are evicted from the front on every call, amortised O(1).
 */
export function createDeduper(opts: DeduperOptions): Deduper {
  const { windowMs, now = Date.now } = opts;
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // id -> time it was recorded, oldest first.
  const seen = new Map<string, number>();

  function evictExpired(t: number): void {
    for (const [id, recordedAt] of seen) {
      // Stop at the first live record. If the clock ever steps backwards, order may be
      // slightly off and some expired ids linger until the ones ahead of them expire;
      // isDuplicate still checks each record's own age, so answers stay correct.
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
      // Delete first so a re-recorded id moves to the back of the insertion order.
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
