import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOrders, type Order } from '../src/orders.ts';

type Page = { items: Order[]; nextPage: number | null };

function pages(...chunks: Order[][]): (page: number) => Promise<Page> {
  return async page => {
    const items = chunks[page - 1];
    if (!items) throw new Error(`unexpected page ${page}`);
    return { items, nextPage: page < chunks.length ? page + 1 : null };
  };
}

const order = (id: string, customerId: string, amountCents: number, status: Order['status']): Order => ({
  id,
  customerId,
  amountCents,
  status,
});

test('nets paid minus refunded per customer across pages, sorted with ties by id', async () => {
  const fetchPage = pages(
    [order('1', 'b', 500, 'paid'), order('2', 'a', 700, 'paid'), order('3', 'c', 900, 'pending')],
    [order('4', 'a', 200, 'refunded'), order('5', 'c', 100, 'paid'), order('6', 'd', 500, 'paid')],
  );
  const result = await summarizeOrders(fetchPage);
  assert.deepEqual(result.totals, [
    { customerId: 'a', totalCents: 500 },
    { customerId: 'b', totalCents: 500 },
    { customerId: 'd', totalCents: 500 },
    { customerId: 'c', totalCents: 100 },
  ]);
  assert.equal(result.skippedPending, 1);
});

test('keeps a customer whose refunds exceed payments, with a negative total', async () => {
  const result = await summarizeOrders(pages([order('1', 'x', 100, 'paid'), order('2', 'x', 300, 'refunded')]));
  assert.deepEqual(result.totals, [{ customerId: 'x', totalCents: -200 }]);
});

test('starts at page 1 and follows nextPage', async () => {
  const seen: number[] = [];
  const fetchPage = async (page: number): Promise<Page> => {
    seen.push(page);
    return { items: [], nextPage: page === 1 ? 5 : null };
  };
  await summarizeOrders(fetchPage);
  assert.deepEqual(seen, [1, 5]);
});

test('retries a failing page and then succeeds', async () => {
  let calls = 0;
  const fetchPage = async (): Promise<Page> => {
    calls++;
    if (calls < 3) throw new Error(`flaky ${calls}`);
    return { items: [order('1', 'a', 10, 'paid')], nextPage: null };
  };
  const result = await summarizeOrders(fetchPage, { retries: 3, baseDelayMs: 0 });
  assert.equal(calls, 3);
  assert.deepEqual(result.totals, [{ customerId: 'a', totalCents: 10 }]);
});

test('gives up after the configured retries with the last failure as cause', async () => {
  let calls = 0;
  const last = new Error('down 3');
  const fetchPage = async (): Promise<Page> => {
    calls++;
    throw calls === 3 ? last : new Error(`down ${calls}`);
  };
  await assert.rejects(summarizeOrders(fetchPage, { retries: 2, baseDelayMs: 0 }), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal(err.cause, last);
    return true;
  });
  assert.equal(calls, 3);
});

test('makes a single attempt when retries is 0', async () => {
  let calls = 0;
  const fetchPage = async (): Promise<Page> => {
    calls++;
    throw new Error('down');
  };
  await assert.rejects(summarizeOrders(fetchPage, { retries: 0, baseDelayMs: 0 }));
  assert.equal(calls, 1);
});

test('handles 1M orders across 100 pages quickly', async () => {
  const perPage = 10_000;
  const chunk = (p: number): Order[] =>
    Array.from({ length: perPage }, (_, i) =>
      order(`${p}-${i}`, `c${(p * perPage + i) % 5000}`, 100, i % 10 === 0 ? 'refunded' : 'paid'),
    );
  const fetchPage = async (page: number): Promise<Page> => ({
    items: chunk(page),
    nextPage: page < 100 ? page + 1 : null,
  });
  const started = performance.now();
  const result = await summarizeOrders(fetchPage);
  assert.equal(result.totals.length, 5000);
  assert.ok(performance.now() - started < 5000, 'took longer than 5 s');
});
