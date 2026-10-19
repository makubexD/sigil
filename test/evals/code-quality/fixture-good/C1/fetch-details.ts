// The catalog service rejects a client's requests beyond this many at once.
const MAX_CONCURRENT = 8;

export async function fetchDetails<T>(
  ids: string[],
  fetchDetail: (id: string) => Promise<T>,
): Promise<T[]> {
  const details: T[] = new Array(ids.length);
  let next = 0;
  // Each worker keeps one request in flight and takes the next id when it finishes.
  async function worker(): Promise<void> {
    while (next < ids.length) {
      const index = next++;
      details[index] = await fetchDetail(ids[index]);
    }
  }
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, ids.length) }, worker);
  await Promise.all(workers);
  return details;
}
