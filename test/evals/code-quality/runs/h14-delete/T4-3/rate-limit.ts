/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Non-negative integer. */
  limit: number;
  /** Window length in milliseconds. Positive and finite. */
  windowMs: number;
  /** Clock in milliseconds; defaults to `Date.now`. */
  now?: () => number;
}

/** A per-key rate limiter. */
export interface RateLimiter {
  /**
   * Records a call for `key` and returns `true` if `key` has made fewer than
   * `limit` calls in the last `windowMs` milliseconds; otherwise returns `false`
   * and records nothing.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window-log rate limiter. A call at time `t` counts against
 * its key while `now() - t < windowMs`.
 *
 * Idle keys are reclaimed by a lazy sweep that runs at most once per window
 * from inside `tryAcquire`, so there are no timers to keep the process alive,
 * and memory is bounded by the keys active within roughly the last two windows.
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

  // Per key: timestamps of accepted calls, oldest first. Never holds an empty array.
  // shortcut: assumes `now` is non-decreasing; a clock that steps backwards can
  // leave timestamps out of order, so some expire later than they should.
  const callTimes = new Map<string, number[]>();
  let lastSweepAt = now();

  function dropExpired(times: number[], cutoff: number): void {
    let expiredCount = 0;
    while (expiredCount < times.length && times[expiredCount] <= cutoff) expiredCount++;
    if (expiredCount > 0) times.splice(0, expiredCount);
  }

  function sweepIdleKeys(cutoff: number): void {
    for (const [key, times] of callTimes) {
      // The newest timestamp is last; if it has expired, they all have.
      if (times[times.length - 1] <= cutoff) callTimes.delete(key);
    }
  }

  return {
    tryAcquire(key: string): boolean {
      const t = now();
      const cutoff = t - windowMs;

      if (t - lastSweepAt >= windowMs) {
        sweepIdleKeys(cutoff);
        lastSweepAt = t;
      }

      const times = callTimes.get(key);
      if (times === undefined) {
        if (limit === 0) return false;
        callTimes.set(key, [t]);
        return true;
      }

      dropExpired(times, cutoff);
      if (times.length >= limit) return false;
      times.push(t);
      return true;
    },
  };
}
