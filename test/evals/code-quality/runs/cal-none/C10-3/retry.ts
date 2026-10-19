export type Response = { status: number };

export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  delay?: (ms: number) => Promise<void>;
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isSuccess = (status: number): boolean => status >= 200 && status <= 299;

// 4xx means the request will never succeed, so retrying it is pointless.
const isPermanent = (status: number): boolean => status >= 400 && status <= 499;

/**
 * Sends one request, retrying transient failures (5xx, other non-2xx statuses,
 * and network errors) with exponential backoff. 4xx responses are not retried.
 * Throws an Error whose `cause` is the last failure (response or rejection).
 */
export async function sendWithRetry<R extends Response>(
  send: () => Promise<R>,
  opts: RetryOptions = {},
): Promise<R> {
  const { retries = 3, baseDelayMs = 100, delay = wait } = opts;

  let lastFailure: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await delay(baseDelayMs * 2 ** (attempt - 1));
    }

    let response: R;
    try {
      response = await send();
    } catch (err) {
      lastFailure = err;
      continue;
    }

    if (isSuccess(response.status)) {
      return response;
    }
    lastFailure = response;
    if (isPermanent(response.status)) {
      throw new Error(`Request failed with status ${response.status}`, { cause: response });
    }
  }

  throw new Error(`Request failed after ${retries} retries`, { cause: lastFailure });
}
