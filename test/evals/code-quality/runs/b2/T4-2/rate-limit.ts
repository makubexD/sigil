/**
 * Per-key sliding-window rate limiter. Keeps an exact log of accepted call times per key and
 * evicts keys that have gone idle, so memory tracks only recently active keys.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum accepted calls per key within any window. Positive integer. */
  readonly limit: number;
  /** Window length in milliseconds. Positive and finite. */
  readonly windowMs: number;
  /** Clock returning the current time in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A rate limiter whose keys are throttled independently. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it is under its limit.
   *
   * @returns `true` if the call was accepted and recorded; `false` if `key` already made
   *   `limit` accepted calls in the last `windowMs` milliseconds (rejected calls are not recorded).
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * A call accepted at time `t` counts against its key while `now() - t < windowMs`.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // Accepted-call times per key, oldest first; never longer than `limit`.
  const callTimesByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  const isExpired = (callTime: number, at: number): boolean => at - callTime >= windowMs;

  // A key whose newest call has expired holds no live state. Sweeping at most once per window
  // keeps the cost amortized O(1) per call while bounding idle keys to roughly one window's worth.
  function evictIdleKeys(at: number): void {
    if (at - lastSweepAt < windowMs) return;
    lastSweepAt = at;
    for (const [key, callTimes] of callTimesByKey) {
      const newest = callTimes[callTimes.length - 1];
      if (newest === undefined || isExpired(newest, at)) callTimesByKey.delete(key);
    }
  }

  function tryAcquire(key: string): boolean {
    const at = now();
    evictIdleKeys(at);

    const callTimes = callTimesByKey.get(key) ?? [];
    while (callTimes.length > 0 && isExpired(callTimes[0], at)) callTimes.shift();

    if (callTimes.length >= limit) return false;
    callTimes.push(at);
    callTimesByKey.set(key, callTimes);
    return true;
  }

  return { tryAcquire };
}
