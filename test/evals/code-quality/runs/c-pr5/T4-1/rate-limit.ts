/**
 * Per-key sliding-window rate limiter that holds no state for keys idle longer than one window.
 *
 * @module
 */

/** Configuration for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum accepted calls per key within any window; a positive integer. */
  readonly limit: number;
  /** Window length in milliseconds; a positive finite number. */
  readonly windowMs: number;
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** A rate limiter whose keys are counted independently. */
export interface RateLimiter {
  /**
   * Accepts and records a call for `key` if it has made fewer than `limit` accepted calls in the
   * last `windowMs` milliseconds. Rejected calls are not recorded.
   *
   * @returns `true` if the call was accepted, `false` if `key` is at its limit.
   */
  tryAcquire(key: string): boolean;
  /** Number of keys currently holding state; keys idle for a full window are released. */
  readonly size: number;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * A call made at time `t` counts against its key while `now() - t < windowMs`.
 *
 * @throws {RangeError} If `limit` is not a positive integer or `windowMs` is not a positive
 * finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  // Each key is re-inserted on acceptance, so Map order is least-recently-accepted first and
  // idle keys can be evicted from the front without scanning active ones.
  const callsByKey = new Map<string, number[]>();

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      const windowStart = currentTime - windowMs;
      evictIdleKeys(callsByKey, windowStart);
      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, windowStart);
      if (calls.length >= limit) return false;

      calls.push(currentTime);
      callsByKey.delete(key);
      callsByKey.set(key, calls);
      return true;
    },
    get size(): number {
      return callsByKey.size;
    },
  };
}

function validateOptions({ limit, windowMs }: RateLimiterOptions): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Deletes keys from the front of the map whose newest call is outside the window. */
function evictIdleKeys(callsByKey: Map<string, number[]>, windowStart: number): void {
  for (const [key, calls] of callsByKey) {
    // Stored arrays are never empty: a key is only stored right after a push.
    if (calls[calls.length - 1] > windowStart) return;
    callsByKey.delete(key);
  }
}

/** Removes timestamps at or before `windowStart` from an ascending call log, in place. */
function dropExpired(calls: number[], windowStart: number): void {
  const firstLive = calls.findIndex((time) => time > windowStart);
  calls.splice(0, firstLive === -1 ? calls.length : firstLive);
}
