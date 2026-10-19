type Response = { status: number };

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sends a request, retrying transient failures (5xx, network errors) with exponential backoff.
 * A 4xx is permanent and fails at once.
 */
export async function sendWithRetry(
  send: () => Promise<Response>,
  opts: { retries?: number; baseDelayMs?: number; delay?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  const { retries = 3, baseDelayMs = 100, delay = sleep } = opts;
  let lastFailure: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await delay(baseDelayMs * 2 ** (attempt - 1));
    try {
      const response = await send();
      if (response.status >= 200 && response.status < 300) return response;
      lastFailure = response;
      if (response.status >= 400 && response.status < 500) break;
    } catch (error) {
      lastFailure = error;
    }
  }
  throw new Error('request failed', { cause: lastFailure });
}
