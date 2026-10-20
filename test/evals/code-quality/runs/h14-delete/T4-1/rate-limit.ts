/**
 * Per-key sliding-window rate limiter with bounded memory: keys that go idle
 * for a full window are evicted during later calls.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any `windowMs` span. Positive integer. */
  readonly limit: number;
  /** Length of the sliding window in milliseconds. Positive, finite. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A per-key rate limiter. */
export interface RateLimiter {
  /**
   * Records a call for `key` and returns `true` if `key` has made fewer than
   * `limit` calls in the last `windowMs` milliseconds; otherwise returns
   * `false` and records nothing.
   */
  tryAcquire(key: string): boolean;
  /** Number of keys currently holding state; exposed for monitoring memory use. */
  readonly trackedKeyCount: number;
}

/**
 * Creates a sliding-window rate limiter. Keys are tracked independently.
 *
 * A call at time `t` counts against its key while `now() - t < windowMs`.
 * Idle keys are swept at most once per window, so memory is bounded by the
 * keys active in roughly the last two windows.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is
 *   not a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // Timestamps of accepted calls per key, oldest first; length never exceeds `limit`.
  const callTimesByKey = new Map<string, number[]>();
  let lastSweepMs = now();

  function isExpired(callTimeMs: number, currentMs: number): boolean {
    return currentMs - callTimeMs >= windowMs;
  }

  function sweepIdleKeys(currentMs: number): void {
    for (const [key, callTimes] of callTimesByKey) {
      const newestCallMs = callTimes[callTimes.length - 1];
      if (newestCallMs === undefined || isExpired(newestCallMs, currentMs)) {
        callTimesByKey.delete(key);
      }
    }
    lastSweepMs = currentMs;
  }

  return {
    tryAcquire(key: string): boolean {
      const currentMs = now();
      // Amortized: a full scan once per window keeps per-call cost O(limit).
      if (currentMs - lastSweepMs >= windowMs) {
        sweepIdleKeys(currentMs);
      }

      const callTimes = callTimesByKey.get(key) ?? [];
      const firstLiveIndex = callTimes.findIndex((callTimeMs) => !isExpired(callTimeMs, currentMs));
      callTimes.splice(0, firstLiveIndex === -1 ? callTimes.length : firstLiveIndex);

      if (callTimes.length >= limit) {
        return false;
      }
      callTimes.push(currentMs);
      callTimesByKey.set(key, callTimes);
      return true;
    },
    get trackedKeyCount(): number {
      return callTimesByKey.size;
    },
  };
}
