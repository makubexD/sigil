/**
 * Sliding-window rate limiter keyed by string, with idle keys evicted so memory tracks only keys
 * active in the recent past.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Must be a positive integer. */
  readonly limit: number;
  /** Window length in milliseconds. Must be a positive finite number. */
  readonly windowMs: number;
  /**
   * Clock returning the current time in milliseconds. Must never go backwards.
   * Defaults to `Date.now`.
   */
  readonly now?: () => number;
}

/** A per-key rate limiter. */
export interface RateLimiter {
  /**
   * Records a call for `key` and returns `true` if `key` has made fewer than `limit` calls in the
   * last `windowMs` milliseconds; otherwise records nothing and returns `false`.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter. Each key is limited independently.
 *
 * A call made at time `t` counts against its key until `now() - t >= windowMs`. Keys with no
 * calls in the current window are evicted at most one window after going idle, so memory is
 * bounded by the number of keys active in roughly the last two windows.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not a positive
 *   finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  // Each array holds call timestamps in ascending order, never more than `limit`, never empty.
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  return {
    tryAcquire(key: string): boolean {
      const at = now();
      const cutoff = at - windowMs;
      // Sweeping once per window keeps eviction amortized O(1) per call.
      if (at - lastSweepAt >= windowMs) {
        evictIdleKeys(callsByKey, cutoff);
        lastSweepAt = at;
      }
      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, cutoff);
      if (calls.length >= limit) return false;
      calls.push(at);
      callsByKey.set(key, calls);
      return true;
    },
  };
}

function validateOptions({ limit, windowMs }: RateLimiterOptions): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Removes timestamps at or before `cutoff` from the front of the ascending `calls` array. */
function dropExpired(calls: number[], cutoff: number): void {
  const firstLive = calls.findIndex((t) => t > cutoff);
  calls.splice(0, firstLive === -1 ? calls.length : firstLive);
}

/** Deletes every key whose most recent call is at or before `cutoff`. */
function evictIdleKeys(callsByKey: Map<string, number[]>, cutoff: number): void {
  for (const [key, calls] of callsByKey) {
    const newest = calls.at(-1);
    if (newest === undefined || newest <= cutoff) callsByKey.delete(key);
  }
}
