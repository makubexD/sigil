/**
 * Per-key sliding-window rate limiter with bounded memory for idle keys.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum allowed calls per key within any window. Non-negative integer. */
  readonly limit: number;
  /** Window length in milliseconds. Positive and finite. */
  readonly windowMs: number;
  /** Clock returning milliseconds; defaults to `Date.now`. Injectable for tests. */
  readonly now?: () => number;
}

/** A rate limiter whose keys are tracked independently. */
export interface RateLimiter {
  /**
   * Records a call for `key` and returns `true` if `key` has made fewer than
   * `limit` allowed calls in the last `windowMs` milliseconds; otherwise
   * returns `false` and records nothing.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter. A call at time `t` counts against
 * every later call made before `t + windowMs`.
 *
 * Keys idle for a full window are evicted by a sweep that runs at most once
 * per `windowMs` (inside `tryAcquire`; no timers), so memory is bounded by the
 * keys active in roughly the last two windows.
 *
 * @throws {RangeError} If `limit` is not a non-negative integer or `windowMs`
 *   is not a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  // Per key: timestamps of allowed calls, oldest first, at most `limit` long.
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  return {
    tryAcquire(key: string): boolean {
      const t = now();
      const cutoff = t - windowMs;
      if (t - lastSweepAt >= windowMs) {
        evictIdleKeys(callsByKey, cutoff);
        lastSweepAt = t;
      }
      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, cutoff);
      if (calls.length >= limit) return false;
      calls.push(t);
      callsByKey.set(key, calls);
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

/** Removes timestamps at or before `cutoff` from the front of a sorted list. */
function dropExpired(calls: number[], cutoff: number): void {
  let expired = 0;
  while (expired < calls.length && calls[expired] <= cutoff) expired++;
  if (expired > 0) calls.splice(0, expired);
}

function evictIdleKeys(callsByKey: Map<string, number[]>, cutoff: number): void {
  for (const [key, calls] of callsByKey) {
    // Newest timestamp is last; once it has expired, the key holds no live calls.
    const newest = calls[calls.length - 1];
    if (newest === undefined || newest <= cutoff) callsByKey.delete(key);
  }
}
