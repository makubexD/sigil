/**
 * Sliding-window rate limiter keyed by an arbitrary string (e.g. account or API key).
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Must be a positive integer. */
  readonly limit: number;
  /** Window length in milliseconds. Must be a positive finite number. */
  readonly windowMs: number;
  /** Clock returning the current time in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A per-key rate limiter. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it is under the limit.
   *
   * @returns `true` if the call was allowed and recorded; `false` if `key` already made
   *   `limit` calls in the last `windowMs` milliseconds (the rejected call is not recorded).
   */
  tryAcquire(key: string): boolean;
  /** Number of keys currently holding state. Idle keys are evicted, so this stays bounded. */
  readonly trackedKeyCount: number;
}

/**
 * Creates a sliding-window rate limiter. Each key is limited independently.
 *
 * A call at time `t` counts against its key while `now() - t < windowMs`.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not a positive
 *   finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // Each key is re-inserted on every recorded call, so Map order is by most recent call and
  // idle keys collect at the front, where eviction can stop at the first active key.
  // shortcut: assumes `now` never goes backwards; if it does, some idle keys may linger until
  // the keys ahead of them in the Map also go idle.
  const callTimesByKey = new Map<string, number[]>();

  function evictIdleKeys(windowStart: number): void {
    for (const [key, callTimes] of callTimesByKey) {
      const latestCallTime = callTimes[callTimes.length - 1];
      if (latestCallTime > windowStart) return;
      callTimesByKey.delete(key);
    }
  }

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      const windowStart = currentTime - windowMs;
      evictIdleKeys(windowStart);

      const callTimes = callTimesByKey.get(key) ?? [];
      while (callTimes.length > 0 && callTimes[0] <= windowStart) callTimes.shift();
      if (callTimes.length >= limit) return false;

      callTimes.push(currentTime);
      callTimesByKey.delete(key);
      callTimesByKey.set(key, callTimes);
      return true;
    },
    get trackedKeyCount(): number {
      return callTimesByKey.size;
    },
  };
}
