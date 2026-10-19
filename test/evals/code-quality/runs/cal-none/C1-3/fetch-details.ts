// The catalog service rejects any request beyond 8 concurrent per client.
const MAX_CONCURRENCY = 8;

/**
 * Fetches the detail for every id, keeping at most 8 requests in flight, and resolves with the
 * details in the same order as `ids`.
 *
 * If any fetch fails, no further fetches are started and the returned promise rejects with the
 * first error once the requests already in flight have settled, so the caller never has requests
 * still running against the service after this function settles.
 */
export async function fetchDetails<T>(
  ids: string[],
  fetchDetail: (id: string) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(ids.length);
  let next = 0;
  let failure: { error: unknown } | undefined;

  async function worker(): Promise<void> {
    while (failure === undefined && next < ids.length) {
      const index = next++;
      try {
        results[index] = await fetchDetail(ids[index]);
      } catch (error) {
        failure ??= { error };
      }
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, ids.length) }, worker);
  await Promise.all(workers);

  if (failure !== undefined) throw failure.error;
  return results;
}
