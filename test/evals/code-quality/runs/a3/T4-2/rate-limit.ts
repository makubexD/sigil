export interface RateLimiterOptions {
  readonly limit: number;
  readonly windowMs: number;
  readonly now?: () => number;
}

export interface RateLimiter {
  /**
   * Returns `true` and records the call when `key` has made fewer than `limit` calls in the
   * last `windowMs` milliseconds; returns `false` (recording nothing) otherwise.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter with independent per-key budgets.
 *
 * A call made at time `t` counts against its key while `now() - t < windowMs`.
 * Keys whose calls have all expired are evicted by a sweep that runs at most once per
 * `windowMs`, so memory is bounded by the keys active within roughly the last two windows
 * rather than by every key ever seen.
 *
 * @throws {RangeError} if `limit` is not a non-negative integer or `windowMs` is not a
 *   positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  const callTimesByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      const cutoff = currentTime - windowMs;
      if (currentTime - lastSweepAt >= windowMs) {
        evictIdleKeys(callTimesByKey, cutoff);
        lastSweepAt = currentTime;
      }
      const callTimes = callTimesByKey.get(key) ?? [];
      dropExpired(callTimes, cutoff);
      if (callTimes.length >= limit) return false;
      callTimes.push(currentTime);
      callTimesByKey.set(key, callTimes);
      return true;
    },
  };
}

function validateOptions({ limit, windowMs }: RateLimiterOptions): void {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`limit must be a non-negative integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Removes timestamps at or before `cutoff` from the front of the ascending `callTimes`. */
function dropExpired(callTimes: number[], cutoff: number): void {
  const firstLiveIndex = callTimes.findIndex((callTime) => callTime > cutoff);
  callTimes.splice(0, firstLiveIndex === -1 ? callTimes.length : firstLiveIndex);
}

/** Deletes every key whose most recent call is at or before `cutoff`. */
function evictIdleKeys(callTimesByKey: Map<string, number[]>, cutoff: number): void {
  for (const [key, callTimes] of callTimesByKey) {
    const newestCall = callTimes.at(-1);
    if (newestCall === undefined || newestCall <= cutoff) callTimesByKey.delete(key);
  }
}
