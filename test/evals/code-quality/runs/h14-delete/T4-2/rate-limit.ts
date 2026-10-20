/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any `windowMs` span. Non-negative integer. */
  readonly limit: number;
  /** Length of the sliding window in milliseconds. Must be positive. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

export interface RateLimiter {
  /**
   * Returns `true` and records the call if `key` has made fewer than `limit`
   * calls in the last `windowMs` milliseconds; otherwise returns `false`
   * without recording anything.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window-log rate limiter with independent per-key budgets.
 * A call at time `t` counts against its key while `now() - t < windowMs`.
 *
 * Memory stays bounded: each key holds at most `limit` timestamps, and keys
 * with no call inside the window are evicted by a sweep that runs at most once
 * per `windowMs`, so an idle key is dropped within about two windows. No timers
 * are used, so the limiter never keeps the process alive.
 *
 * @throws {RangeError} If `limit` is not a non-negative integer or `windowMs`
 *   is not a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs } = opts;
  const now = opts.now ?? Date.now;

  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`limit must be a non-negative integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // Accepted-call timestamps per key, oldest first. Never empty.
  const callsByKey = new Map<string, number[]>();
  let lastSweepMs = now();

  function evictIdleKeys(nowMs: number): void {
    for (const [key, stamps] of callsByKey) {
      if (nowMs - stamps[stamps.length - 1] >= windowMs) callsByKey.delete(key);
    }
    lastSweepMs = nowMs;
  }

  return {
    tryAcquire(key: string): boolean {
      const nowMs = now();
      if (nowMs - lastSweepMs >= windowMs) evictIdleKeys(nowMs);

      const stamps = callsByKey.get(key);
      if (!stamps) {
        if (limit === 0) return false;
        callsByKey.set(key, [nowMs]);
        return true;
      }

      let expiredCount = 0;
      while (expiredCount < stamps.length && nowMs - stamps[expiredCount] >= windowMs) {
        expiredCount++;
      }
      stamps.splice(0, expiredCount);

      if (stamps.length >= limit) return false;
      stamps.push(nowMs);
      return true;
    },
  };
}
