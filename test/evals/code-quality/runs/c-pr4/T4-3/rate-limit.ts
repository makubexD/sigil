/**
 * Sliding-window rate limiter keyed by string, with lazy eviction of idle keys.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Positive integer. */
  readonly limit: number;
  /** Window length in milliseconds. Positive, finite. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A per-key rate limiter. */
export interface RateLimiter {
  /**
   * Records a call for `key` and returns `true` if it made fewer than `limit` calls in the
   * last `windowMs` milliseconds; otherwise returns `false` and records nothing.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter. Keys are independent.
 *
 * Idle keys are evicted by a sweep that runs at most once per window, triggered by calls, so
 * memory is bounded by the keys active in roughly the last two windows. No timers are used.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not positive and finite.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  // Accepted-call timestamps per key, oldest first; never longer than `limit`.
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      const cutoff = currentTime - windowMs;
      if (currentTime - lastSweepAt >= windowMs) {
        sweepIdleKeys(callsByKey, cutoff);
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

function sweepIdleKeys(callsByKey: Map<string, number[]>, cutoff: number): void {
  for (const [key, calls] of callsByKey) {
    const newest = calls.at(-1);
    if (newest === undefined || newest <= cutoff) callsByKey.delete(key);
  }
}

function dropExpired(calls: number[], cutoff: number): void {
  const firstLive = calls.findIndex((timestamp) => timestamp > cutoff);
  calls.splice(0, firstLive === -1 ? calls.length : firstLive);
}

function validateOptions({ limit, windowMs }: RateLimiterOptions): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}
