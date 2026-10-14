import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OrderFetchError, summarizeOrders } from "./orders.js";
import type { FetchOrders, Order, OrderPage } from "./orders.js";

const NO_SLEEP = (): Promise<void> => Promise.resolve();

function order(id: string, customerId: string, amountCents: number, status: Order["status"]): Order {
  return { id, customerId, amountCents, status };
}

function pagedSource(pages: readonly (readonly Order[])[]): FetchOrders {
  return (page: number): Promise<OrderPage> => {
    const items = pages[page - 1];
    if (items === undefined) return Promise.reject(new RangeError(`no page ${page}`));
    return Promise.resolve({ items, nextPage: page < pages.length ? page + 1 : null });
  };
}

describe("summarizeOrders", () => {
  it("nets paid minus refunded across pages and counts pending", async () => {
    const source = pagedSource([
      [order("1", "a", 500, "paid"), order("2", "b", 300, "paid")],
      [order("3", "a", 200, "refunded"), order("4", "c", 999, "pending")],
    ]);
    const summary = await summarizeOrders(source, { sleep: NO_SLEEP });
    assert.deepEqual(summary, {
      totals: [
        { customerId: "a", totalCents: 300 },
        { customerId: "b", totalCents: 300 },
      ],
      skippedPending: 1,
    });
  });

  it("sorts by total descending", async () => {
    const source = pagedSource([[order("1", "low", 10, "paid"), order("2", "high", 90, "paid")]]);
    const { totals } = await summarizeOrders(source, { sleep: NO_SLEEP });
    assert.deepEqual(
      totals.map((t) => t.customerId),
      ["high", "low"],
    );
  });

  it("returns empty totals for an empty source", async () => {
    const summary = await summarizeOrders(pagedSource([[]]), { sleep: NO_SLEEP });
    assert.deepEqual(summary, { totals: [], skippedPending: 0 });
  });

  it("retries a failing page with exponential backoff, then succeeds", async () => {
    let calls = 0;
    const delays: number[] = [];
    const flaky: FetchOrders = () => {
      calls++;
      if (calls < 3) return Promise.reject(new Error("transient"));
      return Promise.resolve({ items: [order("1", "a", 100, "paid")], nextPage: null });
    };
    const sleep = (ms: number): Promise<void> => {
      delays.push(ms);
      return Promise.resolve();
    };
    const summary = await summarizeOrders(flaky, { sleep, baseDelayMs: 10 });
    assert.equal(calls, 3);
    assert.deepEqual(delays, [10, 20]);
    assert.deepEqual(summary.totals, [{ customerId: "a", totalCents: 100 }]);
  });

  it("gives up after 3 retries with an OrderFetchError carrying the cause", async () => {
    let calls = 0;
    const cause = new Error("down");
    const broken: FetchOrders = () => {
      calls++;
      return Promise.reject(cause);
    };
    await assert.rejects(summarizeOrders(broken, { sleep: NO_SLEEP }), (err: unknown) => {
      assert.ok(err instanceof OrderFetchError);
      assert.equal(err.page, 1);
      assert.equal(err.attempts, 4);
      assert.equal(err.cause, cause);
      return true;
    });
    assert.equal(calls, 4);
  });

  it("rejects invalid options before fetching", async () => {
    await assert.rejects(summarizeOrders(pagedSource([[]]), { maxRetries: -1 }), RangeError);
  });

  it("stops when the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(summarizeOrders(pagedSource([[]]), { signal: controller.signal }));
  });

  it("aggregates 1M orders without retaining them", async () => {
    const pageSize = 10_000;
    const pageCount = 100;
    const items = Array.from({ length: pageSize }, (_, i) => order(String(i), `c${i % 1000}`, 1, "paid"));
    const source: FetchOrders = (page) =>
      Promise.resolve({ items, nextPage: page < pageCount ? page + 1 : null });
    const { totals } = await summarizeOrders(source, { sleep: NO_SLEEP });
    assert.equal(totals.length, 1000);
    assert.equal(totals[0]?.totalCents, pageSize * pageCount / 1000);
  });
});
