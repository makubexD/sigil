/**
 * Order summarization — walks a paginated order source and nets paid minus refunded cents per
 * customer, retrying failed page fetches with exponential backoff.
 *
 * @module
 */

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order as returned by the order source. */
export type Order = {
  readonly id: string;
  readonly customerId: string;
  /** Order amount in integer cents. */
  readonly amountCents: number;
  readonly status: OrderStatus;
};

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches a single page of orders by page number (first page is 1). */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for page fetches. */
export interface SummarizeOptions {
  /** Retries after the first failed attempt of a page; total attempts = retries + 1. Default 3. */
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
  /** Sorted by `totalCents` descending, then `customerId` ascending (code-unit order). */
  readonly totals: CustomerTotal[];
  /** Number of `pending` orders, which are excluded from totals. */
  readonly skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Fetches every page from `fetchPage` and summarizes the orders per customer.
 *
 * Pages are fetched sequentially because each page names its successor. Orders are folded into
 * running totals as each page arrives, so memory scales with the number of customers rather than
 * the number of orders. Customers with only pending orders do not appear in `totals`.
 *
 * @param fetchPage - Page source; called with 1 first, then with each returned `nextPage`.
 * @param opts - Retry settings; see {@link SummarizeOptions}.
 * @returns Per-customer net totals and the count of skipped pending orders.
 * @throws {RangeError} If `retries` or `baseDelayMs` is not a non-negative integer.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 * @throws {TypeError} If an order has an unknown status.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  assertNonNegativeInteger('retries', retries);
  assertNonNegativeInteger('baseDelayMs', baseDelayMs);

  const tally: Tally = { totalsByCustomer: new Map(), skippedPending: 0 };
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    const result: OrderPage = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of result.items) tallyOrder(tally, order);
    page = result.nextPage;
  }
  return { totals: sortTotals(tally.totalsByCustomer), skippedPending: tally.skippedPending };
}

/** Running aggregate, folded page by page so memory scales with customers, not orders. */
interface Tally {
  readonly totalsByCustomer: Map<string, number>;
  skippedPending: number;
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tallyOrder(tally: Tally, order: Order): void {
  switch (order.status) {
    case 'paid':
      addCents(tally.totalsByCustomer, order.customerId, order.amountCents);
      return;
    case 'refunded':
      addCents(tally.totalsByCustomer, order.customerId, -order.amountCents);
      return;
    case 'pending':
      tally.skippedPending++;
      return;
    default: {
      const unknownStatus: never = order.status;
      throw new TypeError(`Order ${order.id} has unknown status: ${String(unknownStatus)}`);
    }
  }
}

function addCents(totalsByCustomer: Map<string, number>, customerId: string, cents: number): void {
  totalsByCustomer.set(customerId, (totalsByCustomer.get(customerId) ?? 0) + cents);
}

function sortTotals(totalsByCustomer: Map<string, number>): CustomerTotal[] {
  const totals: CustomerTotal[] = [];
  for (const [customerId, totalCents] of totalsByCustomer) {
    totals.push({ customerId, totalCents });
  }
  // Plain code-unit comparison keeps ordering locale-independent and fast for large inputs.
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
