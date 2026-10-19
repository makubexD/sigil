import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchDetails } from '../src/fetch-details.ts';

const LIMIT = 8;

const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

// A fake catalog service: rejects any request beyond LIMIT in flight, and finishes requests after
// 1-3 event-loop turns so they complete out of order.
function catalogService(failOn?: string) {
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  const seen: string[] = [];
  async function fetchDetail(id: string): Promise<{ id: string; name: string }> {
    calls++;
    seen.push(id);
    if (inFlight >= LIMIT) throw new Error(`429: more than ${LIMIT} concurrent requests`);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      for (let i = 0; i <= calls % 3; i++) await tick();
      if (id === failOn) throw new Error(`detail ${id} failed`);
      return { id, name: `item ${id}` };
    } finally {
      inFlight--;
    }
  }
  return { fetchDetail, stats: () => ({ maxInFlight, calls, seen }) };
}

const idList = (n: number): string[] => Array.from({ length: n }, (_, i) => `id-${i}`);

test('returns details in the order of ids', async () => {
  const service = catalogService();
  const ids = ['c', 'a', 'b'];
  assert.deepEqual(await fetchDetails(ids, service.fetchDetail), [
    { id: 'c', name: 'item c' },
    { id: 'a', name: 'item a' },
    { id: 'b', name: 'item b' },
  ]);
});

test('returns an empty list for no ids', async () => {
  const service = catalogService();
  assert.deepEqual(await fetchDetails([], service.fetchDetail), []);
  assert.equal(service.stats().calls, 0);
});

test('rejects with the error of a failed fetch', async () => {
  const service = catalogService('b');
  const failure = await fetchDetails(['a', 'b', 'c'], service.fetchDetail).then(
    () => assert.fail('expected a rejection'),
    (error: unknown) => error,
  );
  assert.ok(failure instanceof Error);
  assert.equal(failure.message, 'detail b failed');
});

test('stays within 8 concurrent requests for a large list', async () => {
  const service = catalogService();
  const ids = idList(10_000);
  const details = await fetchDetails(ids, service.fetchDetail);
  assert.equal(details.length, ids.length);
  assert.deepEqual(
    details.map(d => d.id),
    ids,
  );
  assert.ok(service.stats().maxInFlight <= LIMIT, `max in flight ${service.stats().maxInFlight}`);
});

test('fetches each id exactly once', async () => {
  const service = catalogService();
  const ids = idList(100);
  await fetchDetails(ids, service.fetchDetail);
  assert.deepEqual([...service.stats().seen].sort(), [...ids].sort());
});

test('uses all 8 concurrent requests the service allows', async () => {
  const service = catalogService();
  await fetchDetails(idList(100), service.fetchDetail);
  assert.equal(service.stats().maxInFlight, LIMIT);
});
