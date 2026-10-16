/**
 * Sliding-window rate limiter keyed by string, with memory bounded to keys
 * that have recorded a call within the current window.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any `windowMs` span. Positive integer. */
  readonly limit: number;
  /** Window length in milliseconds. Positive and finite. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds; must be non-decreasing. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A per-key rate limiter. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it is under the limit.
   *
   * @returns `true` if the call was allowed and recorded, `false` if `key`
   *   already made `limit` calls in the last `windowMs` milliseconds.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter. A call at time `t` counts against its
 * key while `now() - t < windowMs`.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not
 *   a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  // Insertion order tracks each key's most recent recorded call (keys are
  // re-inserted on record), so idle keys always sit at the front of the map.
  const callsByKey = new Map<string, number[]>();

  return {
    tryAcquire(key: string): boolean {
      const timestamp = now();
      const cutoff = timestamp - windowMs;
      evictIdleKeys(callsByKey, cutoff);
      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, cutoff);
      if (calls.length >= limit) return false;
      calls.push(timestamp);
      callsByKey.delete(key);
      callsByKey.set(key, calls);
      return true;
    },
  };
}

function validateOptions({ limit, windowMs }: RateLimiterOptions): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Removes keys from the front of the map whose newest call is outside the window. */
function evictIdleKeys(callsByKey: Map<string, number[]>, cutoff: number): void {
  for (const [key, calls] of callsByKey) {
    const newest = calls[calls.length - 1];
    if (newest === undefined || newest > cutoff) return;
    callsByKey.delete(key);
  }
}

/** Removes timestamps at or before `cutoff`; `calls` is sorted ascending. */
function dropExpired(calls: number[], cutoff: number): void {
  let expired = 0;
  while (expired < calls.length && (calls[expired] as number) <= cutoff) expired++;
  calls.splice(0, expired);
}
