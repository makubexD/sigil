/**
 * Per-key sliding-window rate limiter with an injectable clock.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Positive integer. */
  readonly limit: number;
  /** Window length in milliseconds. Positive and finite. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A rate limiter that tracks calls independently per key. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it is under the limit.
   *
   * @returns `true` if the call was allowed and recorded, `false` if `key` has already made
   *   `limit` calls in the last `windowMs` milliseconds.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * A call at time `t` counts against its key while `now() - t < windowMs`. Keys with no calls
 * inside the window are evicted, so memory stays proportional to recently active keys.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not a positive
 *   finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  validateOptions(limit, windowMs);
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      // Sweeping every key at most once per window keeps eviction amortized O(1) per call
      // while still bounding memory for keys that never call again.
      if (currentTime - lastSweepAt >= windowMs) {
        evictIdleKeys(callsByKey, currentTime - windowMs);
        lastSweepAt = currentTime;
      }
      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, currentTime - windowMs);
      if (calls.length >= limit) return false;
      calls.push(currentTime);
      callsByKey.set(key, calls);
      return true;
    },
  };
}

function validateOptions(limit: number, windowMs: number): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Removes timestamps at or before `cutoff` from the front of an ascending list. */
function dropExpired(calls: number[], cutoff: number): void {
  let expiredCount = 0;
  while (expiredCount < calls.length && calls[expiredCount] <= cutoff) expiredCount++;
  calls.splice(0, expiredCount);
}

function evictIdleKeys(callsByKey: Map<string, number[]>, cutoff: number): void {
  for (const [key, calls] of callsByKey) {
    dropExpired(calls, cutoff);
    if (calls.length === 0) callsByKey.delete(key);
  }
}
