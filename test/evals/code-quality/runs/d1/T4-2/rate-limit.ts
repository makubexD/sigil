/**
 * Per-key sliding-window rate limiter. Each key may make at most `limit` calls
 * in any `windowMs` span; keys that go idle are evicted so memory tracks only
 * recently active keys.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within one window. Must be a positive integer. */
  readonly limit: number;
  /** Window length in milliseconds. Must be a positive finite number. */
  readonly windowMs: number;
  /** Clock returning the current time in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A rate limiter that tracks each key independently. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it is under its limit.
   *
   * @returns `true` if the call was allowed and recorded; `false` if `key`
   *   has already made `limit` calls in the last `windowMs` milliseconds.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is
 *   not a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // Ascending call timestamps per key; never longer than `limit` because only allowed calls are recorded.
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  function evictIdleKeys(cutoff: number): void {
    for (const [key, calls] of callsByKey) {
      const newest = calls[calls.length - 1];
      if (newest === undefined || newest <= cutoff) callsByKey.delete(key);
    }
  }

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      const cutoff = currentTime - windowMs;

      // Sweeping at most once per window keeps eviction amortized O(1) per call
      // while bounding idle-key retention to about two windows.
      if (currentTime - lastSweepAt >= windowMs) {
        evictIdleKeys(cutoff);
        lastSweepAt = currentTime;
      }

      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, cutoff);
      if (calls.length >= limit) return false;

      calls.push(currentTime);
      callsByKey.set(key, calls);
      return true;
    },
  };
}

/** Removes timestamps at or before `cutoff` from the front of an ascending list, in place. */
function dropExpired(calls: number[], cutoff: number): void {
  const firstLive = calls.findIndex((calledAt) => calledAt > cutoff);
  calls.splice(0, firstLive === -1 ? calls.length : firstLive);
}
