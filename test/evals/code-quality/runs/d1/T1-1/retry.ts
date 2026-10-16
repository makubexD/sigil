import { setTimeout as delay } from 'node:timers/promises';

export type RetryOptions = {
  /** Retries after the first attempt; total attempts are `retries + 1`. Non-negative integer. */
  retries: number;
  /** Delay before the first retry; each later retry doubles it. Non-negative, in milliseconds. */
  baseDelayMs: number;
  /** Waits `ms` milliseconds. Defaults to a real timer; inject a fake in tests. */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Runs `operation`, retrying failures with exponential backoff
 * (`baseDelayMs`, `2 * baseDelayMs`, `4 * baseDelayMs`, ...).
 *
 * @param label - Names the operation in the exhaustion error message.
 * @throws {Error} When every attempt fails; `cause` is the last failure.
 * @throws {RangeError} When `retries` or `baseDelayMs` is invalid.
 */
export async function withRetry<T>(
  label: string,
  operation: () => Promise<T>,
  { retries, baseDelayMs, sleep = delay }: RetryOptions,
): Promise<T> {
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative number, got ${baseDelayMs}`);
  }

  let lastFailure: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
    try {
      return await operation();
    } catch (error) {
      lastFailure = error;
    }
  }
  throw new Error(`${label} failed after ${retries + 1} attempts`, { cause: lastFailure });
}
