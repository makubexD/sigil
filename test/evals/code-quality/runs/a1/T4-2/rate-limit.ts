/**
 * Per-key sliding-window rate limiter.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Non-negative integer. */
  readonly limit: number;
  /** Window length in milliseconds. Positive and finite. */
  readonly windowMs: number;
  /** Clock returning the current time in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A rate limiter whose keys are tracked independently. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it has made fewer than `limit` calls in the
   * last `windowMs` milliseconds.
   *
   * @returns `true` if the call was allowed and recorded, `false` otherwise.
   */
  tryAcquire(key: string): boolean;
  /**
   * Number of keys currently holding state. Idle keys may linger for up to
   * one extra window before eviction.
   */
  readonly size: number;
}

/**
 * Creates a sliding-window rate limiter. A call made at time `t` counts against
 * its key until `now() >= t + windowMs`. Denied calls are not recorded.
 *
 * Each key stores at most `limit` timestamps, and keys whose calls have all
 * expired are evicted by a sweep that runs at most once per window, so memory
 * stays bounded by the keys active in roughly the last two windows.
 *
 * @throws {RangeError} If `limit` is not a non-negative integer or `windowMs`
 *   is not a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`limit must be a non-negative integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // Recorded call times per key, oldest first; never empty while in the map.
  const calls = new Map<string, number[]>();
  let lastSweep = now();

  function evictIdleKeys(cutoff: number): void {
    for (const [key, times] of calls) {
      if (times[times.length - 1] <= cutoff) calls.delete(key);
    }
  }

  return {
    tryAcquire(key: string): boolean {
      const t = now();
      const cutoff = t - windowMs;

      if (t - lastSweep >= windowMs) {
        evictIdleKeys(cutoff);
        lastSweep = t;
      }

      const times = calls.get(key) ?? [];
      let expired = 0;
      while (expired < times.length && times[expired] <= cutoff) expired++;
      times.splice(0, expired);

      if (times.length >= limit) return false;

      times.push(t);
      calls.set(key, times);
      return true;
    },
    get size(): number {
      return calls.size;
    },
  };
}
