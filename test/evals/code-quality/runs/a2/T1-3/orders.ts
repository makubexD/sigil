/**
 * Order summarization — walks a paginated order source and reduces it to
 * per-customer net totals without holding all orders in memory.
 *
 * @module
 */

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order. `amountCents` is a non-negative integer number of cents. */
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

/** Retry tuning for {@link summarizeOrders}. */
export type SummarizeOptions = {
  /** Retries after the first failed attempt of a page. Default 3. */
  retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Default 100. */
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

/**
 * Fetches every page from `fetchPage` (starting at page 1) and summarizes the orders.
 *
 * Pages are fetched sequentially because each page names the next. Memory use is
 * proportional to the number of distinct customers, not the number of orders.
 *
 * @param fetchPage - Page source; a rejection triggers a retry with exponential backoff.
 * @param opts - Retry count and base backoff delay.
 * @returns Totals sorted by `totalCents` descending, then `customerId` ascending
 *   (UTF-16 code-unit order), plus the number of pending orders skipped.
 * @throws {RangeError} If `retries` or `baseDelayMs` is not a non-negative integer.
 * @throws {TypeError} If an order has an unknown status or a non-integer amount.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const policy = resolveRetryPolicy(opts);
  const netByCustomer = new Map<string, number>();
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    const { items, nextPage }: OrderPage = await fetchPageWithRetry(fetchPage, page, policy);
    skippedPending += accumulatePage(items, netByCustomer);
    page = nextPage;
  }

  return { totals: sortTotals(netByCustomer), skippedPending };
}

function resolveRetryPolicy(opts: SummarizeOptions): RetryPolicy {
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

async function fetchPageWithRetry(
  fetchPage: FetchPage,
  page: number,
  policy: RetryPolicy,
): Promise<OrderPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= policy.retries; attempt++) {
    if (attempt > 0) {
      await sleep(policy.baseDelayMs * BACKOFF_FACTOR ** (attempt - 1));
    }
    try {
      return await fetchPage(page);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Failed to fetch page ${page} after ${policy.retries + 1} attempts`, {
    cause: lastError,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Adds the page's paid/refunded amounts into `netByCustomer`; returns the pending count. */
function accumulatePage(items: Order[], netByCustomer: Map<string, number>): number {
  let pending = 0;
  for (const order of items) {
    const delta = netDelta(order);
    if (delta === null) {
      pending++;
      continue;
    }
    netByCustomer.set(order.customerId, (netByCustomer.get(order.customerId) ?? 0) + delta);
  }
  return pending;
}

/** Signed contribution of an order to its customer's total, or `null` if pending. */
function netDelta(order: Order): number | null {
  if (!Number.isSafeInteger(order.amountCents)) {
    throw new TypeError(`Order ${order.id} has non-integer amountCents ${order.amountCents}`);
  }
  switch (order.status) {
    case 'paid':
      return order.amountCents;
    case 'refunded':
      return -order.amountCents;
    case 'pending':
      return null;
    default:
      throw new TypeError(`Order ${order.id} has unknown status ${String(order.status)}`);
  }
}

function sortTotals(netByCustomer: Map<string, number>): CustomerTotal[] {
  const totals = Array.from(netByCustomer, ([customerId, totalCents]) => ({
    customerId,
    totalCents,
  }));
  return totals.sort(compareTotals);
}

function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  if (a.customerId === b.customerId) return 0;
  return a.customerId < b.customerId ? -1 : 1;
}
