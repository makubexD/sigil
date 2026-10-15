/**
 * Order aggregation over a paginated source: per-customer net totals with retrying page fetches.
 *
 * @module
 */

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order as returned by the order source. */
export type Order = {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: OrderStatus;
};

/** One page of orders; `nextPage` is `null` on the last page. */
export type OrderPage = { items: readonly Order[]; nextPage: number | null };

/** Fetches a page of orders by 1-based page number. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for page fetches. */
export type SummarizeOptions = { retries?: number; baseDelayMs?: number };

/** Net cents for one customer. */
export type CustomerTotal = { customerId: string; totalCents: number };

/** Result of {@link summarizeOrders}. */
export type OrderSummary = { totals: CustomerTotal[]; skippedPending: number };

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Streams every page from `fetchPage` and sums paid minus refunded cents per customer.
 *
 * Pages are consumed one at a time and folded into a per-customer map, so memory scales with the
 * number of distinct customers, not the number of orders.
 *
 * @param fetchPage - Page source; called with 1, then each returned `nextPage` until `null`.
 * @param opts - `retries` (default 3) extra attempts per page, with delays of
 *   `baseDelayMs * 2^n` ms (default base 100) before retry n (0-based).
 * @returns Totals sorted by `totalCents` descending, then `customerId` ascending, plus the number
 *   of pending orders skipped.
 * @throws {RangeError} If `retries` is not a non-negative integer or `baseDelayMs` is not a
 *   non-negative finite number.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 * @throws {TypeError} If an order has an unknown status or a non-integer `amountCents`.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  validateOptions(retries, baseDelayMs);

  const netByCustomer = new Map<string, number>();
  let skippedPending = 0;
  // Pages are inherently sequential: each page number comes from the previous response.
  for (let page: number | null = FIRST_PAGE; page !== null; ) {
    const result: OrderPage = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    skippedPending += accumulatePage(result.items, netByCustomer);
    page = result.nextPage;
  }
  return { totals: sortTotals(netByCustomer), skippedPending };
}

function validateOptions(retries: number, baseDelayMs: number): void {
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative finite number, got ${baseDelayMs}`);
  }
}

async function fetchWithRetry(
  fetchPage: FetchPage,
  page: number,
  retries: number,
  baseDelayMs: number,
): Promise<OrderPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1));
    try {
      return await fetchPage(page);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Failed to fetch page ${page} after ${retries + 1} attempts`, {
    cause: lastError,
  });
}

// Global setTimeout (not node:timers/promises) so node:test mock.timers can control backoff.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Folds one page into `netByCustomer`; returns the number of pending orders on the page. */
function accumulatePage(items: readonly Order[], netByCustomer: Map<string, number>): number {
  let pending = 0;
  for (const order of items) {
    const signed = signedAmount(order);
    if (signed === undefined) {
      pending++;
      continue;
    }
    netByCustomer.set(order.customerId, (netByCustomer.get(order.customerId) ?? 0) + signed);
  }
  return pending;
}

/** Returns the order's contribution to its customer's total, or `undefined` if pending. */
function signedAmount(order: Order): number | undefined {
  if (!Number.isInteger(order.amountCents)) {
    throw new TypeError(`Order ${order.id} has non-integer amountCents: ${order.amountCents}`);
  }
  switch (order.status) {
    case 'paid':
      return order.amountCents;
    case 'refunded':
      return -order.amountCents;
    case 'pending':
      return undefined;
    default: {
      const unknownStatus: never = order.status;
      throw new TypeError(`Order ${order.id} has unknown status: ${String(unknownStatus)}`);
    }
  }
}

function sortTotals(netByCustomer: ReadonlyMap<string, number>): CustomerTotal[] {
  const totals = Array.from(netByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  // Code-unit comparison keeps the tie-break deterministic regardless of locale.
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
