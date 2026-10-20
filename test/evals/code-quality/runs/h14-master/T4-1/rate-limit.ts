/**
 * Per-key sliding-window rate limiter that evicts idle keys as time advances,
 * so memory is bounded by the keys active within the last window.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window; a positive integer. */
  readonly limit: number;
  /** Window length in milliseconds; a positive finite number. */
  readonly windowMs: number;
  /** Clock returning milliseconds; must not go backwards. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A rate limiter tracking calls independently per key. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it is under the limit.
   *
   * @returns `true` if the call was allowed and recorded, `false` if `key` has already made
   *   `limit` calls in the last `windowMs` milliseconds. Rejected calls are not recorded.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter. A call made at time `t` counts against its key
 * while `now() < t + windowMs`.
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

  // Each key's recorded call times, ascending. The Map is kept ordered by each key's most
  // recent call (re-inserted on every record), so idle keys collect at the front and can be
  // evicted without scanning the whole map.
  const callTimesByKey = new Map<string, number[]>();

  function evictIdleKeys(windowStart: number): void {
    for (const [key, callTimes] of callTimesByKey) {
      const lastCallTime = callTimes[callTimes.length - 1];
      if (lastCallTime === undefined || lastCallTime > windowStart) return;
      callTimesByKey.delete(key);
    }
  }

  function tryAcquire(key: string): boolean {
    const currentTime = now();
    const windowStart = currentTime - windowMs;
    evictIdleKeys(windowStart);

    const callTimes = callTimesByKey.get(key) ?? [];
    const firstLiveIndex = callTimes.findIndex((callTime) => callTime > windowStart);
    const liveCallTimes = firstLiveIndex === -1 ? [] : callTimes.slice(firstLiveIndex);
    if (liveCallTimes.length >= limit) return false;

    liveCallTimes.push(currentTime);
    callTimesByKey.delete(key);
    callTimesByKey.set(key, liveCallTimes);
    return true;
  }

  return { tryAcquire };
}
