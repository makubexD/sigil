export interface Response {
  status: number;
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  delay?: (ms: number) => Promise<void>;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends one request, retrying transient failures (5xx responses and rejected sends) with
 * exponential backoff. A 4xx response will never succeed, so it fails immediately; so does any
 * other non-2xx status, since it isn't known to be transient.
 */
export async function sendWithRetry<R extends Response>(
  send: () => Promise<R>,
  opts: RetryOptions = {},
): Promise<R> {
  const { retries = 3, baseDelayMs = 100, delay = wait } = opts;
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }

  for (let attempt = 0; ; attempt++) {
    if (attempt > 0) await delay(baseDelayMs * 2 ** (attempt - 1));

    let failure: unknown;
    let transient: boolean;
    try {
      const response = await send();
      if (response.status >= 200 && response.status <= 299) return response;
      failure = response;
      transient = response.status >= 500 && response.status <= 599;
    } catch (err) {
      failure = err;
      transient = true;
    }

    if (!transient || attempt >= retries) {
      const reason = transient ? `after ${attempt + 1} attempts` : 'with a non-retryable failure';
      throw new Error(`Billing API request failed ${reason}`, { cause: failure });
    }
  }
}
