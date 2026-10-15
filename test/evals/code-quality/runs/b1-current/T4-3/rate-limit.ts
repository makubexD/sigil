/**
 * Sliding-window rate limiter keyed by an arbitrary string, with idle keys evicted so memory
 * tracks only recently active keys.
 *
 * @module
 */

/** Configuration for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Positive integer. */
  readonly limit: number;
  /** Window length in milliseconds. Positive finite number. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A per-key rate limiter. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it is under the limit.
   *
   * @returns `true` if the call was allowed and recorded, `false` if `key` already made `limit`
   *   calls in the last `windowMs` milliseconds. Rejected calls are not recorded.
   */
  tryAcquire(key: string): boolean;
  /** Number of keys currently holding state. Exposed so eviction of idle keys is observable. */
  readonly size: number;
}

/**
 * Creates a sliding-window rate limiter. Each key is limited independently.
 *
 * A call made at time `t` counts against its key while `now() - t < windowMs`. Each key stores at
 * most `limit` timestamps, and keys idle for a full window are evicted by a sweep that runs at
 * most once per window, so memory is bounded by the keys active in roughly the last two windows.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not a positive
 *   finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      const cutoff = currentTime - windowMs;
      if (currentTime - lastSweepAt >= windowMs) {
        evictIdleKeys(callsByKey, cutoff);
        lastSweepAt = currentTime;
      }
      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, cutoff);
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

function validateOptions({ limit, windowMs }: RateLimiterOptions): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Removes timestamps at or before `cutoff` from the front of an ascending list, in place. */
function dropExpired(calls: number[], cutoff: number): void {
  const firstLiveIndex = calls.findIndex((calledAt) => calledAt > cutoff);
  calls.splice(0, firstLiveIndex === -1 ? calls.length : firstLiveIndex);
}

function evictIdleKeys(callsByKey: Map<string, number[]>, cutoff: number): void {
  for (const [key, calls] of callsByKey) {
    dropExpired(calls, cutoff);
    if (calls.length === 0) callsByKey.delete(key);
  }
}
