/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Non-negative integer. */
  readonly limit: number;
  /** Window length in milliseconds. Positive and finite. */
  readonly windowMs: number;
  /** Clock in milliseconds; defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Per-key rate limiter. */
export interface RateLimiter {
  /**
   * Records a call for `key` and returns `true` if `key` has made fewer than
   * `limit` calls in the last `windowMs`; otherwise returns `false` and
   * records nothing.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window-log rate limiter: each key may make at most `limit`
 * calls in any `windowMs` span. A call at time `t` counts while
 * `now() - t < windowMs`.
 *
 * Idle keys are evicted lazily on later calls (no timers), so memory is bounded
 * by the keys active within the last window.
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

  // Timestamps per key, oldest first (at most `limit` each). Map iteration order
  // is least-recently-recorded first, so idle keys collect at the front and
  // eviction stops at the first live key: amortized O(1) per call.
  const calls = new Map<string, number[]>();

  function evictIdle(cutoff: number): void {
    for (const [key, times] of calls) {
      if (times[times.length - 1] > cutoff) break;
      calls.delete(key);
    }
  }

  return {
    tryAcquire(key: string): boolean {
      const t = now();
      const cutoff = t - windowMs;
      evictIdle(cutoff);

      const times = calls.get(key) ?? [];
      let expired = 0;
      while (expired < times.length && times[expired] <= cutoff) expired++;
      if (expired > 0) times.splice(0, expired);

      if (times.length >= limit) return false;

      times.push(t);
      // Re-insert to move the key to the back of the Map's iteration order.
      calls.delete(key);
      calls.set(key, times);
      return true;
    },
  };
}
