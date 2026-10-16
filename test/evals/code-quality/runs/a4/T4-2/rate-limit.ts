/**
 * Per-key sliding-window rate limiter. Idle keys are evicted by an amortized sweep, so memory
 * stays proportional to the number of keys active within the last window.
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

/** A rate limiter tracking independent per-key call budgets. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it has made fewer than `limit` calls in the last `windowMs`
   * milliseconds.
   *
   * @returns `true` if the call was allowed and recorded, `false` if the key is over its limit.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * A call made at time `t` counts against its key while `now() - t < windowMs`.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not a positive
 *   finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  // Timestamps per key, oldest first; each array holds at most `limit` entries.
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      const windowStart = currentTime - windowMs;
      // Sweeping at most once per window keeps eviction amortized O(1) per call.
      if (currentTime - lastSweepAt >= windowMs) {
        evictIdleKeys(callsByKey, windowStart);
        lastSweepAt = currentTime;
      }
      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, windowStart);
      if (calls.length >= limit) return false;
      calls.push(currentTime);
      callsByKey.set(key, calls);
      return true;
    },
  };
}

function validateOptions(opts: RateLimiterOptions): void {
  if (!Number.isInteger(opts.limit) || opts.limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${opts.limit}`);
  }
  if (!Number.isFinite(opts.windowMs) || opts.windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${opts.windowMs}`);
  }
}

/** Removes timestamps at or before `windowStart` from the front of the sorted array. */
function dropExpired(calls: number[], windowStart: number): void {
  let expiredCount = 0;
  while (expiredCount < calls.length && calls[expiredCount] <= windowStart) expiredCount++;
  calls.splice(0, expiredCount);
}

/** Deletes keys whose most recent call fell outside the window. */
function evictIdleKeys(callsByKey: Map<string, number[]>, windowStart: number): void {
  for (const [key, calls] of callsByKey) {
    const newest = calls.at(-1);
    if (newest === undefined || newest <= windowStart) callsByKey.delete(key);
  }
}
