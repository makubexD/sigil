/**
 * Per-key sliding-window rate limiter with bounded memory for idle keys.
 *
 * @module
 */

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum accepted calls per key within any window. Non-negative integer. */
  limit: number;
  /** Window length in milliseconds. Positive and finite. */
  windowMs: number;
  /** Clock in milliseconds; defaults to `Date.now`. Expected to be non-decreasing. */
  now?: () => number;
}

/** A rate limiter whose keys are tracked independently. */
export interface RateLimiter {
  /**
   * Records a call for `key` and returns `true` if `key` has made fewer than `limit` accepted
   * calls in the last `windowMs`; otherwise records nothing and returns `false`.
   */
  tryAcquire(key: string): boolean;
  /** Number of keys currently holding state. Exposed so callers and tests can observe eviction. */
  readonly size: number;
}

/**
 * Creates a sliding-window-log rate limiter. An accepted call at time `t` counts against its key
 * while `now() - t < windowMs`.
 *
 * Idle keys are evicted by an amortized sweep rather than a timer, so the limiter never holds the
 * event loop open and needs no dispose step, while per-call cost stays O(1) amortized.
 *
 * @throws {RangeError} If `limit` is not a non-negative integer or `windowMs` is not a positive
 *   finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`limit must be a non-negative integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }

  // Accepted-call timestamps per key, oldest first. Never longer than `limit`, never empty.
  const callsByKey = new Map<string, number[]>();
  let callsSinceSweep = 0;
  let callsUntilSweep = 1;

  function dropExpired(stamps: number[], cutoff: number): void {
    let expired = 0;
    while (expired < stamps.length && stamps[expired] <= cutoff) expired++;
    if (expired > 0) stamps.splice(0, expired);
  }

  // The next sweep is due after as many calls as there were keys left by the last one. That
  // caps the map at twice the keys still active, and a sweep (at most 2N entries) is paid for
  // by the N calls before it, so cost stays O(1) amortized. The threshold is fixed at sweep
  // time: comparing against the live size would never trigger when every call adds a new key.
  function sweepIfDue(cutoff: number): void {
    if (++callsSinceSweep < callsUntilSweep) return;
    for (const [key, stamps] of callsByKey) {
      // Stamps are ordered, so a key is idle iff its newest stamp has expired.
      if (stamps[stamps.length - 1] <= cutoff) callsByKey.delete(key);
    }
    callsSinceSweep = 0;
    callsUntilSweep = Math.max(callsByKey.size, 1);
  }

  return {
    tryAcquire(key: string): boolean {
      const timestamp = now();
      const cutoff = timestamp - windowMs;
      sweepIfDue(cutoff);

      const stamps = callsByKey.get(key);
      if (!stamps) {
        if (limit === 0) return false;
        callsByKey.set(key, [timestamp]);
        return true;
      }

      dropExpired(stamps, cutoff);
      if (stamps.length >= limit) return false;
      stamps.push(timestamp);
      return true;
    },
    get size(): number {
      return callsByKey.size;
    },
  };
}
