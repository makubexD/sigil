import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOrders, OrderFetchError, type Order, type OrdersPage } from './orders.js';

const noSleep = async (): Promise<void> => {};
const o = (id: string, customerId: string, amountCents: number, status: Order['status']): Order => ({
  id,
  customerId,
  amountCents,
  status,
});

test('aggregates across pages, nets refunds, counts pending, sorts desc', async () => {
  const pages: OrdersPage[] = [
    { items: [o('1', 'a', 500, 'paid'), o('2', 'b', 900, 'paid'), o('3', 'a', 100, 'pending')], nextPage: 1 },
    { items: [o('4', 'b', 400, 'refunded'), o('5', 'c', 1000, 'paid')], nextPage: null },
  ];
  const r = await summarizeOrders(async (p) => pages[p]!, { sleep: noSleep });
  assert.deepEqual(r.totals, [
    { customerId: 'c', totalCents: 1000 },
    { customerId: 'a', totalCents: 500 },
    { customerId: 'b', totalCents: 500 },
  ]);
  assert.equal(r.skippedPending, 1);
});

test('retries a failing page then succeeds', async () => {
  let calls = 0;
  const r = await summarizeOrders(
    async () => {
      if (++calls < 3) throw new Error('flaky');
      return { items: [o('1', 'a', 1, 'paid')], nextPage: null };
    },
    { sleep: noSleep },
  );
  assert.equal(calls, 3);
  assert.equal(r.totals[0]!.totalCents, 1);
});

test('gives up after 3 retries with a clear error', async () => {
  let calls = 0;
  const delays: number[] = [];
  await assert.rejects(
    summarizeOrders(
      async () => {
        calls++;
        throw new Error('down');
      },
      { sleep: async (ms) => void delays.push(ms), baseDelayMs: 10 },
    ),
    (err: unknown) => err instanceof OrderFetchError && err.page === 0 && /after 4 attempts/.test(err.message),
  );
  assert.equal(calls, 4);
  assert.deepEqual(delays, [10, 20, 40]);
});

test('detects pagination cycles', async () => {
  await assert.rejects(summarizeOrders(async () => ({ items: [], nextPage: 0 })), /cycle/);
});

test('handles ~1M orders', async () => {
  const pageSize = 10_000;
  const pagesCount = 100;
  const r = await summarizeOrders(async (p) => ({
    items: Array.from({ length: pageSize }, (_, i) =>
      o(`${p}-${i}`, `c${i % 1000}`, 1, i % 10 === 0 ? 'pending' : 'paid'),
    ),
    nextPage: p + 1 < pagesCount ? p + 1 : null,
  }));
  assert.equal(r.totals.length, 1000);
  assert.equal(r.skippedPending, 100_000);
});
