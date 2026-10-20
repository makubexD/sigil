/**
 * Order summarization — walks a paginated order source and reduces it to per-customer
 * net revenue, streaming page by page so memory scales with customers, not orders.
 *
 * @module
 */

const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const FIRST_PAGE = 1;

/** A single order as returned by the order source. */
export type Order = {
  id: string;
  customerId: string;
  amountCents: number;
  status: 'paid' | 'refunded' | 'pending';
};

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches a single page of orders. Pages are 1-based. */
export type FetchOrderPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export interface SummarizeOptions {
  /** Retries per page after the first failed attempt. Non-negative integer; default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Default 100. */
  readonly baseDelayMs?: number;
}

/** Net revenue for one customer. */
export interface CustomerTotal {
  readonly customerId: string;
  readonly totalCents: number;
}

/** Result of {@link summarizeOrders}. */
export interface OrderSummary {
  /** Sorted by `totalCents` descending, then `customerId` ascending. */
  readonly totals: CustomerTotal[];
  /** Number of pending orders, which are excluded from totals. */
  readonly skippedPending: number;
}

/**
 * Fetches every page of orders and computes paid-minus-refunded cents per customer.
 *
 * Pages are fetched sequentially, starting at page 1 and following `nextPage`. Each page is
 * aggregated and discarded before the next is fetched. Customers whose only orders are pending
 * do not appear in `totals`.
 *
 * @param fetchPage - Source of order pages.
 * @param opts - Retry settings; a failing page is retried `retries` times with delays of
 *   `baseDelayMs`, `2 * baseDelayMs`, `4 * baseDelayMs`, ...
 * @returns Per-customer totals and the count of skipped pending orders.
 * @throws {RangeError} If `retries` or `baseDelayMs` is invalid.
 * @throws {Error} If a page still fails after all retries (`cause` is the last failure), if the
 *   source revisits a page, or if an order has a non-integer amount or unknown status.
 */
export async function summarizeOrders(
  fetchPage: FetchOrderPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isSafeInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative finite number, got ${baseDelayMs}`);
  }

  const totalsByCustomer = new Map<string, number>();
  const visitedPages = new Set<number>();
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;

  // Sequential by necessity: each page's number comes from the previous response.
  while (page !== null) {
    // A source that loops back would otherwise spin forever and double-count orders.
    if (visitedPages.has(page)) {
      throw new Error(`Order source revisited page ${page}`);
    }
    visitedPages.add(page);

    const { items, nextPage } = await fetchPageWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of items) {
      skippedPending += applyOrder(totalsByCustomer, order);
    }
    page = nextPage;
  }

  return { totals: sortTotals(totalsByCustomer), skippedPending };
}

/** Folds one order into the running totals; returns 1 if it was pending, else 0. */
function applyOrder(totalsByCustomer: Map<string, number>, order: Order): number {
  if (!Number.isSafeInteger(order.amountCents)) {
    throw new Error(`Order ${order.id} has non-integer amountCents ${order.amountCents}`);
  }
  const current = totalsByCustomer.get(order.customerId) ?? 0;
  switch (order.status) {
    case 'paid':
      totalsByCustomer.set(order.customerId, current + order.amountCents);
      return 0;
    case 'refunded':
      totalsByCustomer.set(order.customerId, current - order.amountCents);
      return 0;
    case 'pending':
      return 1;
    default: {
      const unknownStatus: never = order.status;
      throw new Error(`Order ${order.id} has unknown status ${String(unknownStatus)}`);
    }
  }
}

async function fetchPageWithRetry(
  fetchPage: FetchOrderPage,
  page: number,
  retries: number,
  baseDelayMs: number,
): Promise<OrderPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await delay(baseDelayMs * 2 ** (attempt - 1));
    }
    try {
      return await fetchPage(page);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Failed to fetch order page ${page} after ${retries + 1} attempts`, {
    cause: lastError,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sortTotals(totalsByCustomer: Map<string, number>): CustomerTotal[] {
  const totals: CustomerTotal[] = [];
  for (const [customerId, totalCents] of totalsByCustomer) {
    totals.push({ customerId, totalCents });
  }
  // Code-unit comparison rather than localeCompare: deterministic across locales and much
  // faster when there are hundreds of thousands of customers.
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
