/**
 * Sliding-window rate limiter keyed by string, with idle keys evicted so memory stays bounded by
 * the number of keys active within the last window.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Must be a positive integer. */
  readonly limit: number;
  /** Window length in milliseconds. Must be a positive finite number. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A per-key rate limiter. */
export interface RateLimiter {
  /**
   * Records a call for `key` and returns `true` if `key` has made fewer than `limit` calls in the
   * last `windowMs` milliseconds; otherwise records nothing and returns `false`.
   */
  tryAcquire(key: string): boolean;
  /** Number of keys currently holding state; exposed so callers can observe idle-key eviction. */
  readonly size: number;
}

/**
 * Creates a sliding-window rate limiter. Keys are independent of each other.
 *
 * A call at time `t` counts against its key while `now() - t < windowMs`.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // Per-key call timestamps, oldest first; never longer than `limit`. The Map is kept ordered by
  // each key's most recent call (keys are re-inserted on every recorded call), so idle keys collect
  // at the front and can be evicted without scanning the whole map.
  const callsByKey = new Map<string, number[]>();

  function evictIdleKeys(windowStart: number): void {
    for (const [key, calls] of callsByKey) {
      const newestCall = calls[calls.length - 1];
      if (newestCall === undefined || newestCall > windowStart) return;
      callsByKey.delete(key);
    }
  }

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      const windowStart = currentTime - windowMs;
      evictIdleKeys(windowStart);

      const calls = callsByKey.get(key) ?? [];
      while (calls.length > 0 && calls[0]! <= windowStart) calls.shift();
      if (calls.length >= limit) return false;

      calls.push(currentTime);
      callsByKey.delete(key);
      callsByKey.set(key, calls);
      return true;
    },
    get size(): number {
      return callsByKey.size;
    },
  };
}
