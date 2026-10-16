/**
 * Per-key sliding-window rate limiter. Idle keys are evicted lazily so memory
 * tracks only keys that were active within roughly the last two windows.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Non-negative integer. */
  limit: number;
  /** Window length in milliseconds. Positive and finite. */
  windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  now?: () => number;
}

/** A rate limiter whose keys are tracked independently. */
export interface RateLimiter {
  /**
   * Attempts to record a call for `key`.
   *
   * @returns `true` (and records the call) if `key` made fewer than `limit`
   *   calls in the last `windowMs` milliseconds; otherwise `false`, recording nothing.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * A call made at time `t` counts against its key while `now() - t < windowMs`.
 *
 * @throws {RangeError} If `limit` is not a non-negative integer or `windowMs`
 *   is not a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  // Timestamps per key, oldest first; never longer than `limit`.
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

function validateOptions({ limit, windowMs }: RateLimiterOptions): void {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`limit must be a non-negative integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Removes timestamps at or before `windowStart` from the front of `calls`. */
function dropExpired(calls: number[], windowStart: number): void {
  let expiredCount = 0;
  while (expiredCount < calls.length && calls[expiredCount]! <= windowStart) {
    expiredCount++;
  }
  if (expiredCount > 0) calls.splice(0, expiredCount);
}

function evictIdleKeys(callsByKey: Map<string, number[]>, windowStart: number): void {
  for (const [key, calls] of callsByKey) {
    dropExpired(calls, windowStart);
    if (calls.length === 0) callsByKey.delete(key);
  }
}
