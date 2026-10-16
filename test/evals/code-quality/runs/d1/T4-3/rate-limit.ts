/**
 * Per-key sliding-window rate limiter. Each key keeps a log of its recent call timestamps; keys
 * whose log has fully expired are evicted so idle keys do not hold memory.
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

/** A rate limiter whose keys are throttled independently. */
export interface RateLimiter {
  /**
   * Records a call for `key` if it is under its limit.
   *
   * @returns `true` if the call was allowed and recorded; `false` if `key` already made `limit`
   *   calls in the last `windowMs` milliseconds (the rejected call is not recorded).
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * A call counts against its key for `windowMs` milliseconds after it was recorded. Memory is
 * bounded by the keys active within roughly the last two windows.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not a positive
 *   finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  assertValidOptions(limit, windowMs);

  const callLogs = new Map<string, number[]>();
  let lastSweepAt = now();

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      const expiredBefore = currentTime - windowMs;

      // Sweeping at most once per window keeps eviction amortized O(1) per call.
      if (currentTime - lastSweepAt >= windowMs) {
        evictIdleKeys(callLogs, expiredBefore);
        lastSweepAt = currentTime;
      }

      const log = callLogs.get(key);
      if (log === undefined) {
        callLogs.set(key, [currentTime]);
        return true;
      }
      dropExpired(log, expiredBefore);
      if (log.length >= limit) {
        return false;
      }
      log.push(currentTime);
      return true;
    },
  };
}

function assertValidOptions(limit: number, windowMs: number): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Removes timestamps at or before `expiredBefore` from the front of an ascending log. */
function dropExpired(log: number[], expiredBefore: number): void {
  let firstLive = 0;
  while (firstLive < log.length && (log[firstLive] as number) <= expiredBefore) {
    firstLive++;
  }
  log.splice(0, firstLive);
}

/** Deletes every key whose most recent call has expired. */
function evictIdleKeys(callLogs: Map<string, number[]>, expiredBefore: number): void {
  for (const [key, log] of callLogs) {
    const newest = log.at(-1);
    if (newest === undefined || newest <= expiredBefore) {
      callLogs.delete(key);
    }
  }
}
