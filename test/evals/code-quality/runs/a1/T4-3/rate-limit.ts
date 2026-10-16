/**
 * Per-key sliding-window rate limiter. Idle keys are evicted lazily, so memory stays proportional
 * to the keys active within the last window.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any `windowMs` span. Non-negative integer. */
  readonly limit: number;
  /** Window length in milliseconds. Must be positive and finite. */
  readonly windowMs: number;
  /** Clock returning the current time in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A rate limiter tracking each key independently. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it has made fewer than `limit` calls in the last `windowMs`
   * milliseconds.
   *
   * @returns `true` if the call was allowed and recorded, `false` if it was rejected.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * A call at time `t` counts against its key while `now() - t < windowMs`. Rejected calls are not
 * recorded, so they do not extend the time a caller must wait.
 *
 * @throws {RangeError} If `limit` is not a non-negative integer or `windowMs` is not a positive
 *   finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`limit must be a non-negative integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // Each key's call timestamps, oldest first; never longer than `limit`.
  const calls = new Map<string, number[]>();
  let lastSweep = now();

  function dropExpired(timestamps: number[], cutoff: number): void {
    let expired = 0;
    while (expired < timestamps.length && (timestamps[expired] as number) <= cutoff) expired++;
    if (expired > 0) timestamps.splice(0, expired);
  }

  // Keys that stop calling are never revisited by tryAcquire, so sweep the whole map at most
  // once per window. Each sweep's cost is bounded by entries recorded since the previous one.
  function sweepIdleKeys(cutoff: number): void {
    for (const [key, timestamps] of calls) {
      dropExpired(timestamps, cutoff);
      if (timestamps.length === 0) calls.delete(key);
    }
  }

  return {
    tryAcquire(key: string): boolean {
      const t = now();
      const cutoff = t - windowMs;
      if (t - lastSweep >= windowMs) {
        sweepIdleKeys(cutoff);
        lastSweep = t;
      }

      const timestamps = calls.get(key) ?? [];
      dropExpired(timestamps, cutoff);
      if (timestamps.length >= limit) {
        if (timestamps.length === 0) calls.delete(key);
        return false;
      }

      timestamps.push(t);
      calls.set(key, timestamps);
      return true;
    },
  };
}
