export interface RetryOptions {
  /** Total calls allowed, the first one included. */
  attempts: number;
  /** Wait before the second call; doubles for each call after it. */
  delayMs: number;
  /** Replaced in tests so nothing really waits. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Calls `fn` until it resolves or `attempts` calls have failed, then rejects with the last error. */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { attempts, delayMs, sleep = realSleep } = options;
  if (attempts < 1) throw new RangeError('attempts must be at least 1');
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}
