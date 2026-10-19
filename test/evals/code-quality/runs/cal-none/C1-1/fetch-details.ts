/** The catalog service rejects every request beyond this many in flight per client. */
const MAX_CONCURRENT_REQUESTS = 8;

/**
 * Fetches the detail for every id, keeping exactly `MAX_CONCURRENT_REQUESTS` requests in flight
 * while work remains, and resolves with the details in the same order as `ids`.
 *
 * If a fetch fails, no further fetches are started; once the requests already in flight have
 * settled (so a retry by the caller can't exceed the service's limit), it rejects with the first
 * error.
 */
export async function fetchDetails<T>(
  ids: string[],
  fetchDetail: (id: string) => Promise<T>,
): Promise<T[]> {
  const results: T[] = new Array(ids.length);
  let next = 0;
  let failed = false;
  let firstError: unknown;

  async function worker(): Promise<void> {
    while (!failed && next < ids.length) {
      const index = next++;
      try {
        results[index] = await fetchDetail(ids[index]);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_REQUESTS, ids.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  if (failed) throw firstError;
  return results;
}
