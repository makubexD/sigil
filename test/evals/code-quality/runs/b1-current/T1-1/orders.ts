/**
 * Order summarization — walks a paginated order source with retrying fetches and
 * aggregates net paid cents per customer in a single streaming pass.
 *
 * @module
 */

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order as returned by the order source. Amounts are integer cents. */
export type Order = {
  id: string;
  customerId: string;
  amountCents: number;
  status: OrderStatus;
};

/** One page of orders; `nextPage` is `null` on the last page. */
export type OrderPage = { items: Order[]; nextPage: number | null };

/** Fetches a page of orders by 1-based page number. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for page fetches. */
export type SummarizeOptions = {
  /** Retries after the first failed attempt (default 3). */
  retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry (default 100). */
  baseDelayMs?: number;
};

/** Net cents for one customer: paid minus refunded. */
export type CustomerTotal = { customerId: string; totalCents: number };

/** Result of {@link summarizeOrders}. */
export type OrderSummary = { totals: CustomerTotal[]; skippedPending: number };

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const BACKOFF_FACTOR = 2;

type RetryPolicy = { retries: number; baseDelayMs: number };

type Tally = { totals: Map<string, number>; skippedPending: number };

/**
 * Fetches every page from `fetchPage` and summarizes the orders per customer.
 *
 * Pages are processed as they arrive and only per-customer totals are retained, so
 * memory scales with the number of customers rather than the number of orders.
 * Customers whose orders are all pending do not appear in `totals`.
 *
 * @param fetchPage - Page source; called with 1 first, then each `nextPage` until `null`.
 * @param opts - Retry tuning; a failed fetch is retried up to `retries` times, waiting
 *   `baseDelayMs * 2^n` before retry `n` (0-based).
 * @returns Totals sorted by `totalCents` descending, then `customerId` ascending, plus
 *   the count of pending orders skipped.
 * @throws {RangeError} If `retries` or `baseDelayMs` is not a non-negative integer.
 * @throws {TypeError} If an order has an unknown status or a non-integer amount.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const policy = resolvePolicy(opts);
  const tally: Tally = { totals: new Map(), skippedPending: 0 };
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    // Pages are inherently sequential: each response names the next page.
    const result: OrderPage = await fetchWithRetry(fetchPage, page, policy);
    for (const order of result.items) {
      tallyOrder(tally, order);
    }
    page = result.nextPage;
  }
  return { totals: sortTotals(tally.totals), skippedPending: tally.skippedPending };
}

function resolvePolicy(opts: SummarizeOptions): RetryPolicy {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  assertNonNegativeInteger('retries', retries);
  assertNonNegativeInteger('baseDelayMs', baseDelayMs);
  return { retries, baseDelayMs };
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

async function fetchWithRetry(
  fetchPage: FetchPage,
  page: number,
  policy: RetryPolicy,
): Promise<OrderPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= policy.retries; attempt++) {
    if (attempt > 0) {
      await delay(policy.baseDelayMs * BACKOFF_FACTOR ** (attempt - 1));
    }
    try {
      return await fetchPage(page);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Failed to fetch page ${page} after ${policy.retries + 1} attempts`, {
    cause: lastError,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tallyOrder(tally: Tally, order: Order): void {
  if (!Number.isSafeInteger(order.amountCents)) {
    throw new TypeError(`Order ${order.id} has non-integer amountCents: ${order.amountCents}`);
  }
  switch (order.status) {
    case 'pending':
      tally.skippedPending++;
      return;
    case 'paid':
      addCents(tally.totals, order.customerId, order.amountCents);
      return;
    case 'refunded':
      addCents(tally.totals, order.customerId, -order.amountCents);
      return;
    default: {
      // Unreachable for well-typed input, but fetched data is only typed by assertion.
      const unknownStatus: never = order.status;
      throw new TypeError(`Order ${order.id} has unknown status: ${String(unknownStatus)}`);
    }
  }
}

function addCents(totals: Map<string, number>, customerId: string, cents: number): void {
  totals.set(customerId, (totals.get(customerId) ?? 0) + cents);
}

function sortTotals(totals: Map<string, number>): CustomerTotal[] {
  const rows = Array.from(totals, ([customerId, totalCents]) => ({ customerId, totalCents }));
  // Code-unit comparison keeps ordering deterministic regardless of locale.
  return rows.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
