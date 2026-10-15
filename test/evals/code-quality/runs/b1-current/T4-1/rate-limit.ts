/**
 * Per-key sliding-window rate limiter. Each key may make at most `limit` calls in any trailing
 * `windowMs` interval; state for keys that go idle is reclaimed once per window.
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

/** A rate limiter whose keys are tracked independently of one another. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it has made fewer than `limit` calls in the last `windowMs`.
   *
   * @returns `true` if the call was allowed and recorded; `false` if it was rejected (rejected
   *   calls are not recorded and do not extend the wait).
   */
  tryAcquire(key: string): boolean;
  /** Number of keys currently holding state; idle keys drop out within two windows of activity. */
  activeKeyCount(): number;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not a positive
 *   finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  const callTimesByKey = new Map<string, number[]>();
  let lastSweepAt = Number.NEGATIVE_INFINITY;

  function tryAcquire(key: string): boolean {
    const currentTime = now();
    const windowStart = currentTime - windowMs;
    if (currentTime - lastSweepAt >= windowMs) {
      evictIdleKeys(callTimesByKey, windowStart);
      lastSweepAt = currentTime;
    }
    const callTimes = callTimesByKey.get(key) ?? [];
    dropExpired(callTimes, windowStart);
    if (callTimes.length >= limit) return false;
    callTimes.push(currentTime);
    callTimesByKey.set(key, callTimes);
    return true;
  }

  return { tryAcquire, activeKeyCount: () => callTimesByKey.size };
}

function validateOptions({ limit, windowMs }: RateLimiterOptions): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Removes, in place, call times at or before `windowStart` from an ascending list. */
function dropExpired(callTimes: number[], windowStart: number): void {
  const firstLive = callTimes.findIndex((time) => time > windowStart);
  callTimes.splice(0, firstLive === -1 ? callTimes.length : firstLive);
}

function evictIdleKeys(callTimesByKey: Map<string, number[]>, windowStart: number): void {
  for (const [key, callTimes] of callTimesByKey) {
    const latest = callTimes.at(-1);
    if (latest === undefined || latest <= windowStart) callTimesByKey.delete(key);
  }
}
