/**
 * Per-key sliding-window rate limiter. Each key may make at most `limit` calls in any
 * `windowMs`-long window; keys that go idle are evicted so memory tracks only active keys.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within one window. Must be a positive integer. */
  readonly limit: number;
  /** Window length in milliseconds. Must be a positive finite number. */
  readonly windowMs: number;
  /** Clock returning the current time in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A rate limiter whose keys are tracked independently. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it is under its limit.
   *
   * @returns `true` if the call was allowed and recorded; `false` if `key` already made
   *   `limit` calls in the last `windowMs` milliseconds (the rejected call is not recorded).
   */
  tryAcquire(key: string): boolean;
  /** Number of keys currently held in memory; idle keys drop out over time. */
  trackedKeyCount(): number;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * A call made at time `t` counts against its key while `now() - t < windowMs`.
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

  // Per key: accepted call times in ascending order, never more than `limit` entries.
  const callTimesByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  const isExpired = (callTime: number, currentTime: number): boolean =>
    currentTime - callTime >= windowMs;

  // Sweeping at most once per window keeps the cost amortized O(1) per call while bounding
  // idle keys to those last seen within roughly two windows.
  function evictIdleKeys(currentTime: number): void {
    if (currentTime - lastSweepAt < windowMs) return;
    lastSweepAt = currentTime;
    for (const [key, callTimes] of callTimesByKey) {
      const newestCallTime = callTimes[callTimes.length - 1];
      if (newestCallTime === undefined || isExpired(newestCallTime, currentTime)) {
        callTimesByKey.delete(key);
      }
    }
  }

  function tryAcquire(key: string): boolean {
    const currentTime = now();
    evictIdleKeys(currentTime);

    const callTimes = callTimesByKey.get(key) ?? [];
    let firstLiveIndex = 0;
    while (firstLiveIndex < callTimes.length && isExpired(callTimes[firstLiveIndex], currentTime)) {
      firstLiveIndex++;
    }
    const liveCallTimes = firstLiveIndex === 0 ? callTimes : callTimes.slice(firstLiveIndex);

    if (liveCallTimes.length >= limit) {
      callTimesByKey.set(key, liveCallTimes);
      return false;
    }
    liveCallTimes.push(currentTime);
    callTimesByKey.set(key, liveCallTimes);
    return true;
  }

  return {
    tryAcquire,
    trackedKeyCount: () => callTimesByKey.size,
  };
}
