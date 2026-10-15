/**
 * Per-key sliding-window rate limiter. Keys that go idle for a full window are
 * evicted, so memory stays proportional to the keys active in recent windows.
 *
 * @module
 */

/** Configuration for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Non-negative integer. */
  readonly limit: number;
  /** Window length in milliseconds. Positive, finite. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A rate limiter whose keys are counted independently of each other. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it has made fewer than `limit` calls in the last
   * `windowMs` milliseconds.
   *
   * @returns `true` if the call was allowed and recorded, `false` if it was rejected.
   */
  tryAcquire(key: string): boolean;
  /** Number of keys currently holding state; idle keys are evicted lazily. */
  readonly size: number;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * @throws {RangeError} If `limit` is not a non-negative integer or `windowMs` is
 *   not a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  validateOptions(limit, windowMs);

  // Timestamps per key, oldest first; each list holds at most `limit` entries.
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
    get size(): number {
      return callsByKey.size;
    },
  };
}

function validateOptions(limit: number, windowMs: number): void {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`limit must be a non-negative integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Removes leading timestamps at or before `windowStart` (they fall outside the window). */
function dropExpired(calls: number[], windowStart: number): void {
  let expired = 0;
  while (expired < calls.length && calls[expired] <= windowStart) expired++;
  if (expired > 0) calls.splice(0, expired);
}

function evictIdleKeys(callsByKey: Map<string, number[]>, windowStart: number): void {
  for (const [key, calls] of callsByKey) {
    const newest = calls[calls.length - 1];
    if (newest === undefined || newest <= windowStart) callsByKey.delete(key);
  }
}
