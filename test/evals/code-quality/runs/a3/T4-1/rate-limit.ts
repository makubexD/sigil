export interface RateLimiterOptions {
  readonly limit: number;
  readonly windowMs: number;
  readonly now?: () => number;
}

export interface RateLimiter {
  /** Records a call and returns `true` if `key` is under its limit; otherwise returns `false`. */
  tryAcquire(key: string): boolean;
  /** Number of keys currently holding call history. Idle keys are dropped by periodic sweeps. */
  readonly size: number;
}

/**
 * Creates a sliding-window rate limiter: each key may make at most `limit` calls in any
 * `windowMs` span. Only accepted calls are recorded, so per-key history is capped at `limit`.
 * Expired keys are swept at most once per window, keeping cleanup amortised O(1) per call
 * without a background timer.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  return {
    tryAcquire(key: string): boolean {
      const currentTime = now();
      if (currentTime - lastSweepAt >= windowMs) {
        sweepExpired(callsByKey, currentTime, windowMs);
        lastSweepAt = currentTime;
      }
      const calls = callsByKey.get(key) ?? [];
      dropExpired(calls, currentTime, windowMs);
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

function validateOptions({ limit, windowMs }: RateLimiterOptions): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Removes timestamps that fell out of the window; `calls` is in ascending order. */
function dropExpired(calls: number[], currentTime: number, windowMs: number): void {
  const firstLive = calls.findIndex((t) => currentTime - t < windowMs);
  calls.splice(0, firstLive === -1 ? calls.length : firstLive);
}

function sweepExpired(callsByKey: Map<string, number[]>, currentTime: number, windowMs: number): void {
  for (const [key, calls] of callsByKey) {
    dropExpired(calls, currentTime, windowMs);
    if (calls.length === 0) callsByKey.delete(key);
  }
}
