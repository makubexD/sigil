/**
 * Per-key sliding-window rate limiter. Keys idle for a full window are swept so memory
 * tracks only recently active keys.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any window. Positive integer. */
  readonly limit: number;
  /** Window length in milliseconds. Positive and finite. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A rate limiter whose keys are counted independently. */
export interface RateLimiter {
  /**
   * Records a call for `key` and returns `true` if it has made fewer than `limit` calls in the
   * last `windowMs` milliseconds; otherwise returns `false` and records nothing.
   */
  tryAcquire(key: string): boolean;
  /** Number of keys currently holding state. Idle keys are dropped within two windows. */
  readonly size: number;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not a positive
 *   finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  assertValidOptions(limit, windowMs);
  // Timestamps per key, ascending; never longer than `limit` because rejected calls aren't stored.
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      if (currentTime - lastSweepAt >= windowMs) {
        sweepIdleKeys(callsByKey, currentTime - windowMs);
        lastSweepAt = currentTime;
      }
      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, currentTime - windowMs);
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

function assertValidOptions(limit: number, windowMs: number): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Removes leading timestamps at or before `cutoff` from an ascending list, in place. */
function dropExpired(calls: number[], cutoff: number): void {
  const firstLive = calls.findIndex((t) => t > cutoff);
  calls.splice(0, firstLive === -1 ? calls.length : firstLive);
}

/** Deletes keys whose most recent call is at or before `cutoff`. */
function sweepIdleKeys(callsByKey: Map<string, number[]>, cutoff: number): void {
  for (const [key, calls] of callsByKey) {
    const newest = calls.at(-1);
    if (newest === undefined || newest <= cutoff) callsByKey.delete(key);
  }
}
