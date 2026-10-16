/**
 * Sliding-window rate limiter keyed by caller-supplied strings, with
 * amortized eviction of keys that have gone idle.
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

/** A per-key rate limiter. */
export interface RateLimiter {
  /**
   * Records a call for `key` and returns `true` if it has made fewer than
   * `limit` calls in the last `windowMs` milliseconds; otherwise returns
   * `false` and records nothing.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter. Each key is limited independently.
 *
 * Memory is bounded by the number of keys active within the last window:
 * idle keys are swept at most once per `windowMs`, during `tryAcquire`.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is
 *   not a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  // Timestamps per key, oldest first; length never exceeds `limit`.
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  function evictIdleKeys(currentTime: number): void {
    const cutoff = currentTime - windowMs;
    for (const [key, calls] of callsByKey) {
      if (isExpired(calls[calls.length - 1], cutoff)) callsByKey.delete(key);
    }
    lastSweepAt = currentTime;
  }

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      if (currentTime - lastSweepAt >= windowMs) evictIdleKeys(currentTime);

      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, currentTime - windowMs);
      if (calls.length >= limit) return false;

      calls.push(currentTime);
      callsByKey.set(key, calls);
      return true;
    },
  };
}

function validateOptions({ limit, windowMs }: RateLimiterOptions): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** A call at `timestamp` falls outside the window once it is at or before `cutoff`. */
function isExpired(timestamp: number | undefined, cutoff: number): boolean {
  return timestamp === undefined || timestamp <= cutoff;
}

/** Removes leading expired timestamps from an oldest-first list, in place. */
function dropExpired(calls: number[], cutoff: number): void {
  let expiredCount = 0;
  while (expiredCount < calls.length && isExpired(calls[expiredCount], cutoff)) expiredCount++;
  calls.splice(0, expiredCount);
}
