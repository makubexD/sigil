/**
 * Per-key sliding-window rate limiter. Keys that go idle for a full window are
 * evicted during periodic sweeps, so memory tracks only recently active keys.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum calls allowed per key within any `windowMs` span. Non-negative integer. */
  limit: number;
  /** Length of the sliding window in milliseconds. Positive and finite. */
  windowMs: number;
  /** Clock returning the current time in milliseconds. Defaults to `Date.now`. */
  now?: () => number;
}

/** A rate limiter tracking call counts independently per key. */
export interface RateLimiter {
  /**
   * Attempts to record a call for `key`.
   *
   * @returns `true` (and records the call) if `key` made fewer than `limit`
   *   calls in the last `windowMs` milliseconds; otherwise `false`, recording nothing.
   */
  tryAcquire(key: string): boolean;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * A call made at time `t` counts against its key until time `t + windowMs`.
 *
 * @throws {RangeError} If `limit` is not a non-negative integer or `windowMs`
 *   is not a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  // Oldest-first call timestamps per key; never empty for a stored key.
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      const windowStart = currentTime - windowMs;
      // Sweeping at most once per window keeps eviction cost amortized O(1) per call.
      if (currentTime - lastSweepAt >= windowMs) {
        evictIdleKeys(callsByKey, windowStart);
        lastSweepAt = currentTime;
      }
      return recordIfAllowed(callsByKey, key, { currentTime, windowStart, limit });
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

interface AcquireContext {
  currentTime: number;
  windowStart: number;
  limit: number;
}

function recordIfAllowed(
  callsByKey: Map<string, number[]>,
  key: string,
  { currentTime, windowStart, limit }: AcquireContext,
): boolean {
  const calls = callsByKey.get(key) ?? [];
  dropExpired(calls, windowStart);
  if (calls.length >= limit) {
    if (calls.length === 0) callsByKey.delete(key);
    return false;
  }
  calls.push(currentTime);
  callsByKey.set(key, calls);
  return true;
}

/** Removes timestamps at or before `windowStart` from the front of an oldest-first list. */
function dropExpired(calls: number[], windowStart: number): void {
  const firstLiveIndex = calls.findIndex((timestamp) => timestamp > windowStart);
  calls.splice(0, firstLiveIndex === -1 ? calls.length : firstLiveIndex);
}

function evictIdleKeys(callsByKey: Map<string, number[]>, windowStart: number): void {
  for (const [key, calls] of callsByKey) {
    const newestCall = calls[calls.length - 1];
    if (newestCall === undefined || newestCall <= windowStart) callsByKey.delete(key);
  }
}
