// The catalog service rejects any request beyond this many in flight per client.
const MAX_CONCURRENT_REQUESTS = 8;

/**
 * Fetches the detail for every id, keeping at most 8 requests in flight, and returns the
 * details in the same order as `ids`.
 *
 * If a fetch fails, no further fetches are started and the returned promise rejects with the
 * first error once the requests already in flight have settled, so a caller that retries right
 * away never pushes the client over the service's concurrency limit.
 */
export async function fetchDetails<T>(
  ids: string[],
  fetchDetail: (id: string) => Promise<T>,
): Promise<T[]> {
  const details = new Array<T>(ids.length);
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;

  async function worker(): Promise<void> {
    while (!failed && nextIndex < ids.length) {
      const index = nextIndex++;
      try {
        details[index] = await fetchDetail(ids[index]);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_REQUESTS, ids.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (failed) throw firstError;
  return details;
}
