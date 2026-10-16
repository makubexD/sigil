/**
 * Sliding-window rate limiter keyed by string, with idle-key eviction so memory
 * tracks only keys that have been active within the last window.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Must be a positive integer. */
  readonly limit: number;
  /** Sliding window length in milliseconds. Must be a positive finite number. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A per-key rate limiter. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it is under the limit.
   *
   * @returns `true` if the call was allowed and recorded, `false` if `key` has
   *   already made `limit` calls in the last `windowMs` milliseconds.
   */
  tryAcquire(key: string): boolean;
  /**
   * Number of keys currently holding state. Keys idle for a full window are
   * evicted on a later `tryAcquire`, so this does not grow with idle keys.
   */
  readonly trackedKeyCount: number;
}

/**
 * Creates a sliding-window rate limiter. Each key is limited independently.
 *
 * A call made at time `t` counts against the limit while `now() - t < windowMs`.
 * Rejected calls are not recorded.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not
 *   a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // Ascending call timestamps per key; never longer than `limit`.
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  function dropExpired(calls: number[], currentTime: number): void {
    const firstLive = calls.findIndex((t) => currentTime - t < windowMs);
    calls.splice(0, firstLive === -1 ? calls.length : firstLive);
  }

  // Full sweeps run at most once per window, so their O(keys) cost is amortized
  // across all calls in that window while still evicting every idle key.
  function evictIdleKeys(currentTime: number): void {
    if (currentTime - lastSweepAt < windowMs) return;
    lastSweepAt = currentTime;
    for (const [key, calls] of callsByKey) {
      dropExpired(calls, currentTime);
      if (calls.length === 0) callsByKey.delete(key);
    }
  }

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      evictIdleKeys(currentTime);

      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, currentTime);
      if (calls.length >= limit) return false;

      calls.push(currentTime);
      callsByKey.set(key, calls);
      return true;
    },
    get trackedKeyCount(): number {
      return callsByKey.size;
    },
  };
}
