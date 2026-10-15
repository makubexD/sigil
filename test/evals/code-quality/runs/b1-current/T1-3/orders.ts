/**
 * Order summarization — walks a paginated order source and reduces it to net
 * cents per customer, holding only one page plus the per-customer totals in memory.
 *
 * @module
 */

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order as returned by the order source. */
export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly status: OrderStatus;
  /** Order amount in integer cents. */
  readonly amountCents: number;
}

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches a page of orders by 1-based page number. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for page fetches. */
export interface SummarizeOptions {
  /** Retries after the first failed attempt per page. Default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Default 100. */
  readonly baseDelayMs?: number;
}

/** Net cents for one customer. */
export interface CustomerTotal {
  readonly customerId: string;
  readonly totalCents: number;
}

/** Result of {@link summarizeOrders}. */
export interface OrderSummary {
  /** Sorted by `totalCents` descending, then `customerId` ascending. */
  readonly totals: CustomerTotal[];
  /** Number of `pending` orders seen; they do not contribute to totals. */
  readonly skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const BACKOFF_FACTOR = 2;

interface Accumulator {
  readonly totalsByCustomer: Map<string, number>;
  skippedPending: number;
}

/**
 * Reads every page from `fetchPage`, starting at page 1, and sums paid minus
 * refunded cents per customer.
 *
 * Pages are fetched sequentially because each page names the next one. A failed
 * fetch is retried up to `retries` times, waiting `baseDelayMs * 2^(n-1)` before
 * retry `n`.
 *
 * @param fetchPage - Source of order pages.
 * @param opts - Retry tuning; see {@link SummarizeOptions}.
 * @returns Per-customer totals and the count of skipped pending orders.
 * @throws {RangeError} If `retries` is not a non-negative integer or
 *   `baseDelayMs` is not a non-negative finite number.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 * @throws {TypeError} If an order has an unknown status.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  validateOptions(retries, baseDelayMs);

  const acc: Accumulator = { totalsByCustomer: new Map(), skippedPending: 0 };
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    const result: OrderPage = await fetchPageWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of result.items) addOrder(acc, order);
    page = result.nextPage;
  }
  return { totals: toSortedTotals(acc.totalsByCustomer), skippedPending: acc.skippedPending };
}

function validateOptions(retries: number, baseDelayMs: number): void {
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative finite number, got ${baseDelayMs}`);
  }
}

async function fetchPageWithRetry(
  fetchPage: FetchPage,
  page: number,
  retries: number,
  baseDelayMs: number,
): Promise<OrderPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(baseDelayMs * BACKOFF_FACTOR ** (attempt - 1));
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addOrder(acc: Accumulator, order: Order): void {
  const delta = signedAmount(order);
  if (delta === undefined) {
    acc.skippedPending++;
    return;
  }
  const current = acc.totalsByCustomer.get(order.customerId) ?? 0;
  acc.totalsByCustomer.set(order.customerId, current + delta);
}

/** Returns the order's contribution to its customer's total, or `undefined` if it is pending. */
function signedAmount(order: Order): number | undefined {
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

function toSortedTotals(totalsByCustomer: ReadonlyMap<string, number>): CustomerTotal[] {
  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({
    customerId,
    totalCents,
  }));
  // Code-unit comparison rather than localeCompare keeps ordering deterministic across locales.
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
