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
 * Sends one request, retrying transient failures (5xx, other non-2xx statuses, network errors)
 * with exponential backoff. A 4xx response fails immediately without retrying.
 * Throws an Error whose `cause` is the last failing response or rejection reason.
 */
export async function sendWithRetry<R extends Response>(
  send: () => Promise<R>,
  opts: RetryOptions = {},
): Promise<R> {
  const { retries = 3, baseDelayMs = 100, delay = wait } = opts;

  for (let attempt = 0; ; attempt++) {
    if (attempt > 0) await delay(baseDelayMs * 2 ** (attempt - 1));

    let response: R;
    try {
      response = await send();
    } catch (error) {
      if (attempt >= retries) {
        throw new Error(`Request failed after ${attempt + 1} attempt(s)`, { cause: error });
      }
      continue;
    }

    if (isSuccess(response.status)) return response;
    if (isPermanent(response.status)) {
      throw new Error(`Request failed with status ${response.status}`, { cause: response });
    }
    if (attempt >= retries) {
      throw new Error(`Request failed after ${attempt + 1} attempt(s)`, { cause: response });
    }
  }
}
