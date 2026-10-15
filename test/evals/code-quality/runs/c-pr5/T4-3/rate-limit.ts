/**
 * Sliding-window rate limiter keyed by an arbitrary string (e.g. account or client id).
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window; a positive integer. */
  readonly limit: number;
  /** Window length in milliseconds; a positive finite number. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A per-key rate limiter. */
export interface RateLimiter {
  /**
   * Records a call for `key` and returns `true` if `key` has made fewer than `limit` calls in
   * the last `windowMs` milliseconds; otherwise returns `false` and records nothing.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter. Each key is limited independently.
 *
 * A call made at time `t` counts against its key while `now() - t < windowMs`. State for keys
 * with no calls in the current window is evicted, at most once per `windowMs`, so memory is
 * bounded by the keys active in roughly the last two windows.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not a positive
 *   finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  // Timestamps per key, oldest first; never longer than `limit`.
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  function evictIdleKeys(currentTime: number): void {
    if (currentTime - lastSweepAt < windowMs) return;
    lastSweepAt = currentTime;
    for (const [key, calls] of callsByKey) {
      const newest = calls[calls.length - 1];
      if (newest === undefined || currentTime - newest >= windowMs) callsByKey.delete(key);
    }
  }

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      evictIdleKeys(currentTime);
      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, currentTime - windowMs);
      if (calls.length >= limit) return false;
      calls.push(currentTime);
      callsByKey.set(key, calls);
      return true;
    },
  };
}

/** Removes timestamps at or before `cutoff` from the front of an ascending list. */
function dropExpired(calls: number[], cutoff: number): void {
  let expiredCount = 0;
  while (expiredCount < calls.length && calls[expiredCount] <= cutoff) expiredCount++;
  if (expiredCount > 0) calls.splice(0, expiredCount);
}

function validateOptions({ limit, windowMs }: RateLimiterOptions): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}
