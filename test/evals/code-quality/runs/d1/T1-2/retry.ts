/**
 * Generic retry-with-exponential-backoff for async operations.
 *
 * @module
 */

/** Options controlling {@link withRetry}. */
export interface RetryOptions {
  /** Number of retries after the first attempt; total attempts = `retries + 1`. */
  readonly retries: number;
  /** Delay before the first retry; each later retry doubles it. */
  readonly baseDelayMs: number;
  /** Waits for the given milliseconds; injectable so tests need no real timers. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Thrown by {@link withRetry} once every attempt has failed; `cause` is the last failure. */
export class RetryExhaustedError extends Error {
  readonly attempts: number;

  constructor(message: string, attempts: number, options: { cause: unknown }) {
    super(message, options);
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
  }
}

const BACKOFF_FACTOR = 2;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `operation`, retrying failures with exponential backoff
 * (`baseDelayMs`, `2 * baseDelayMs`, `4 * baseDelayMs`, ...).
 *
 * @param operation - The async work to attempt; called once per attempt.
 * @param description - Names the operation in the exhaustion error message.
 * @returns The first successful result.
 * @throws {RangeError} If `retries` is not a non-negative integer or `baseDelayMs` is not a
 *   non-negative finite number.
 * @throws {RetryExhaustedError} If every attempt fails; `cause` is the last failure.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  description: string,
  options: RetryOptions,
): Promise<T> {
  const { retries, baseDelayMs, sleep = defaultSleep } = options;
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative finite number, got ${baseDelayMs}`);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(baseDelayMs * BACKOFF_FACTOR ** (attempt - 1));
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  const attempts = retries + 1;
  throw new RetryExhaustedError(`${description} failed after ${attempts} attempts`, attempts, {
    cause: lastError,
  });
}
