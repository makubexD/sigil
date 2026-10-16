/** Options for {@link withRetry}. */
export interface RetryOptions {
  /** Retries after the first attempt; total attempts are `retries + 1`. */
  readonly retries: number;
  /** Delay before the first retry; doubles on each subsequent retry. */
  readonly baseDelayMs: number;
  /** Waits `ms` milliseconds. Injected so tests can observe backoff without real waits. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Thrown by {@link withRetry} once every attempt has failed; `cause` is the last failure. */
export class RetryExhaustedError extends Error {
  constructor(message: string, options: { cause: unknown }) {
    super(message, options);
    this.name = "RetryExhaustedError";
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `operation`, retrying failures with exponential backoff
 * (`baseDelayMs`, `2 * baseDelayMs`, `4 * baseDelayMs`, ...).
 *
 * @throws {RangeError} when `retries` is not a non-negative integer or `baseDelayMs` is not a
 *   non-negative finite number.
 * @throws {RetryExhaustedError} when all attempts fail, with the last failure as `cause`.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  description: string,
  { retries, baseDelayMs, sleep = defaultSleep }: RetryOptions,
): Promise<T> {
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative finite number, got ${baseDelayMs}`);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw new RetryExhaustedError(`${description} failed after ${retries + 1} attempts`, {
    cause: lastError,
  });
}
