export interface RateLimiterOptions {
  readonly limit: number;
  readonly windowMs: number;
  readonly now?: () => number;
}

export interface RateLimiter {
  tryAcquire(key: string): boolean;
}

/**
 * Sliding-window-log rate limiter. Each key keeps the timestamps of its accepted calls
 * inside the current window (at most `limit` entries). Keys whose calls have all aged out
 * are swept at most once per window, so idle keys do not accumulate.
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

/** Removes timestamps at or before `cutoff` from the front of an ascending list. */
function dropExpired(calls: number[], cutoff: number): void {
  let expiredCount = 0;
  while (expiredCount < calls.length && calls[expiredCount] <= cutoff) expiredCount++;
  if (expiredCount > 0) calls.splice(0, expiredCount);
}

function sweepIdleKeys(callsByKey: Map<string, number[]>, cutoff: number): void {
  for (const [key, calls] of callsByKey) {
    const newest = calls[calls.length - 1];
    if (newest === undefined || newest <= cutoff) callsByKey.delete(key);
  }
}
