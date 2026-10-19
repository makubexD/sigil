export interface DeduperOptions {
  windowMs: number;
  now?: () => number;
}

export interface Deduper {
  isDuplicate(id: string): boolean;
  readonly size: number;
}

/**
 * Remembers ids for `windowMs` so at-least-once redeliveries can be dropped.
 *
 * Records are never refreshed, so a Map's insertion order is also time order:
 * expired records are always at the front and are evicted from there. This
 * keeps memory proportional to the ids seen within the last window rather
 * than every id ever seen.
 */
export function createDeduper(opts: DeduperOptions): Deduper {
  const { windowMs, now = Date.now } = opts;
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  const seenAt = new Map<string, number>();

  function evictExpired(t: number): void {
    for (const [id, recordedAt] of seenAt) {
      // If the clock stepped backwards, a later entry may be older than this
      // one; stopping here only delays its eviction until this one expires.
      if (t - recordedAt < windowMs) break;
      seenAt.delete(id);
    }
  }

  return {
    isDuplicate(id: string): boolean {
      const t = now();
      evictExpired(t);
      const recordedAt = seenAt.get(id);
      if (recordedAt !== undefined && t - recordedAt < windowMs) return true;
      // Delete first so a re-recorded id moves to the back of the order.
      seenAt.delete(id);
      seenAt.set(id, t);
      return false;
    },
    get size(): number {
      evictExpired(now());
      return seenAt.size;
    },
  };
}
