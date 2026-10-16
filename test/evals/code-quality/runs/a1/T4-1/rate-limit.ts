export interface RateLimiterOptions {
  readonly limit: number;
  readonly windowMs: number;
  readonly now?: () => number;
}

export interface RateLimiter {
  /** Records a call for `key` and returns `true` if it is within the limit; otherwise returns `false`. */
  tryAcquire(key: string): boolean;
  /** Number of keys currently holding state. Exposed so callers can monitor memory use. */
  readonly size: number;
}

/**
 * Sliding-window-log rate limiter. Each key keeps the timestamps of its accepted calls within the
 * window (at most `limit` of them). Keys idle for a full window are swept lazily, at most once per
 * window, so memory tracks only keys that are active and no timers keep the process alive.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // Timestamps per key, oldest first.
  const calls = new Map<string, number[]>();
  let lastSweep = now();

  function sweepIdleKeys(cutoff: number): void {
    for (const [key, timestamps] of calls) {
      const newest = timestamps[timestamps.length - 1];
      if (newest === undefined || newest <= cutoff) calls.delete(key);
    }
  }

  return {
    tryAcquire(key: string): boolean {
      const current = now();
      const cutoff = current - windowMs;

      if (current - lastSweep >= windowMs) {
        sweepIdleKeys(cutoff);
        lastSweep = current;
      }

      const timestamps = calls.get(key) ?? [];
      let expired = 0;
      while (expired < timestamps.length && (timestamps[expired] as number) <= cutoff) expired++;
      if (expired > 0) timestamps.splice(0, expired);

      if (timestamps.length >= limit) {
        calls.set(key, timestamps);
        return false;
      }

      timestamps.push(current);
      calls.set(key, timestamps);
      return true;
    },
    get size(): number {
      return calls.size;
    },
  };
}
