/**
 * Per-key sliding-window rate limiter that keeps memory bounded by evicting idle keys.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Non-negative integer; `0` rejects every call. */
  readonly limit: number;
  /** Sliding window length in milliseconds. Positive and finite. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A rate limiter tracking each key independently. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it has made fewer than `limit` calls in the last `windowMs`
   * milliseconds.
   *
   * @returns `true` if the call was allowed and recorded; `false` if it was rejected (rejected
   * calls are not recorded).
   */
  tryAcquire(key: string): boolean;
  /** Number of keys currently held in memory. Read-only; useful for monitoring and tests. */
  trackedKeyCount(): number;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * A call made at time `t` counts against its key while `now() - t < windowMs`. Keys with no
 * calls in the window are evicted, so memory is bounded by the keys active in roughly the last
 * two windows rather than by every key ever seen.
 *
 * @throws {RangeError} If `limit` is not a non-negative integer or `windowMs` is not a positive
 * finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`limit must be a non-negative integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // Map rather than a plain object: keys are caller-supplied and may be "__proto__" etc.
  // Each value holds the key's recorded call times in ascending order.
  const callTimesByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  function isExpired(callTime: number, currentTime: number): boolean {
    return currentTime - callTime >= windowMs;
  }

  // Keys that are never touched again would otherwise linger forever. A full scan at most once
  // per window keeps the amortized cost per call constant.
  function sweepIdleKeys(currentTime: number): void {
    if (currentTime - lastSweepAt < windowMs) return;
    lastSweepAt = currentTime;
    for (const [key, callTimes] of callTimesByKey) {
      const newest = callTimes[callTimes.length - 1];
      if (newest === undefined || isExpired(newest, currentTime)) callTimesByKey.delete(key);
    }
  }

  function tryAcquire(key: string): boolean {
    const currentTime = now();
    sweepIdleKeys(currentTime);

    const callTimes = callTimesByKey.get(key) ?? [];
    const firstLive = callTimes.findIndex((t) => !isExpired(t, currentTime));
    callTimes.splice(0, firstLive === -1 ? callTimes.length : firstLive);

    if (callTimes.length >= limit) {
      if (callTimes.length === 0) callTimesByKey.delete(key);
      return false;
    }
    callTimes.push(currentTime);
    callTimesByKey.set(key, callTimes);
    return true;
  }

  return { tryAcquire, trackedKeyCount: () => callTimesByKey.size };
}
