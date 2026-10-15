/**
 * Order summarization — walks a paginated order source page by page and folds
 * it into per-customer net totals without holding all orders in memory.
 *
 * @module
 */

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order. `amountCents` is a non-negative integer number of cents. */
export type Order = {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: OrderStatus;
};

/** One page of orders. `nextPage` is `null` on the last page. */
export type OrderPage = {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
};

/** Fetches a page of orders by 1-based page number. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for page fetches. */
export type SummarizeOptions = {
  /** Retries after the first failed attempt per page. Default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each later retry. Default 100. */
  readonly baseDelayMs?: number;
};

/** Net cents for one customer: paid minus refunded. */
export type CustomerTotal = {
  readonly customerId: string;
  readonly totalCents: number;
};

/** Result of {@link summarizeOrders}. */
export type OrderSummary = {
  /** Sorted by `totalCents` descending, then `customerId` ascending. */
  readonly totals: CustomerTotal[];
  readonly skippedPending: number;
};

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

type Accumulator = {
  readonly netByCustomer: Map<string, number>;
  skippedPending: number;
};

/**
 * Fetches every page from `fetchPage` and sums paid minus refunded cents per customer.
 *
 * Pages are fetched sequentially because each page names the next one. Each page is
 * folded into the running totals and then discarded, so memory scales with the number
 * of distinct customers, not orders. Customers whose only orders are pending are
 * absent from `totals`.
 *
 * @param fetchPage - Page source; the first page requested is 1.
 * @param opts - Retry count and base backoff delay for failed page fetches.
 * @returns Per-customer net totals and the count of skipped pending orders.
 * @throws {RangeError} If `opts` holds a negative or non-integer value, or an order
 *   has an invalid `amountCents`.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retryPolicy = resolveRetryPolicy(opts);
  const acc: Accumulator = { netByCustomer: new Map(), skippedPending: 0 };
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    // Sequential by necessity: the next page number comes from this response.
    const { items, nextPage }: OrderPage = await fetchWithRetry(fetchPage, page, retryPolicy);
    for (const order of items) applyOrder(acc, order);
    page = nextPage;
  }
  return { totals: toSortedTotals(acc.netByCustomer), skippedPending: acc.skippedPending };
}

type RetryPolicy = { readonly retries: number; readonly baseDelayMs: number };

function resolveRetryPolicy(opts: SummarizeOptions): RetryPolicy {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative finite number, got ${baseDelayMs}`);
  }
  return { retries, baseDelayMs };
}

async function fetchWithRetry(
  fetchPage: FetchPage,
  page: number,
  { retries, baseDelayMs }: RetryPolicy,
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

function applyOrder(acc: Accumulator, order: Order): void {
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    throw new RangeError(`Order ${order.id} has invalid amountCents: ${order.amountCents}`);
  }
  switch (order.status) {
    case 'paid':
      addNet(acc.netByCustomer, order.customerId, order.amountCents);
      return;
    case 'refunded':
      addNet(acc.netByCustomer, order.customerId, -order.amountCents);
      return;
    case 'pending':
      acc.skippedPending++;
      return;
    default: {
      const unhandled: never = order.status;
      throw new Error(`Order ${order.id} has unknown status: ${String(unhandled)}`);
    }
  }
}

function addNet(netByCustomer: Map<string, number>, customerId: string, deltaCents: number): void {
  netByCustomer.set(customerId, (netByCustomer.get(customerId) ?? 0) + deltaCents);
}

function toSortedTotals(netByCustomer: ReadonlyMap<string, number>): CustomerTotal[] {
  const totals = Array.from(netByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
