export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

export interface RateLimiter {
  tryAcquire(key: string): boolean;
}

/**
 * Sliding-window-log rate limiter: a key may make at most `limit` calls in any
 * `windowMs` span. A call at time `t` stops counting once `now() - t >= windowMs`.
 *
 * Idle keys are evicted by a full sweep that runs at most once per window, so
 * memory is bounded by the keys active in roughly the last two windows.
 *
 * @throws RangeError if `limit` is not a positive integer or `windowMs` is not a positive finite number.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  validateOptions(opts);
  const { limit, windowMs, now = Date.now } = opts;
  const callsByKey = new Map<string, number[]>();
  let lastSweepAt = now();

  function tryAcquire(key: string): boolean {
    const currentTime = now();
    if (currentTime - lastSweepAt >= windowMs) {
      sweepIdleKeys(callsByKey, currentTime - windowMs);
      lastSweepAt = currentTime;
    }
    const calls = callsByKey.get(key) ?? [];
    dropExpired(calls, currentTime - windowMs);
    if (calls.length >= limit) {
      return false;
    }
    calls.push(currentTime);
    callsByKey.set(key, calls);
    return true;
  }

  return { tryAcquire };
}

function validateOptions({ limit, windowMs }: RateLimiterOptions): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`windowMs must be a positive finite number, got ${windowMs}`);
  }
}

/** Removes timestamps at or before `cutoff`; `calls` is in ascending order. */
function dropExpired(calls: number[], cutoff: number): void {
  let firstLive = 0;
  while (firstLive < calls.length && calls[firstLive] <= cutoff) {
    firstLive++;
  }
  calls.splice(0, firstLive);
}

function sweepIdleKeys(callsByKey: Map<string, number[]>, cutoff: number): void {
  for (const [key, calls] of callsByKey) {
    dropExpired(calls, cutoff);
    if (calls.length === 0) {
      callsByKey.delete(key);
    }
  }
}
