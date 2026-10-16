/**
 * Order summarization — walks a paginated order source and aggregates net cents per customer
 * without holding more than one page of orders in memory.
 *
 * @module
 */

/** Lifecycle state of an order. Only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order as returned by the order source. */
export type Order = {
  id: string;
  customerId: string;
  /** Order amount in integer cents; always positive, the status decides its sign. */
  amountCents: number;
  status: OrderStatus;
};

/** One page of orders; `nextPage` is `null` on the last page. */
export type OrderPage = { items: Order[]; nextPage: number | null };

/** Fetches a single page of orders. Pages are 1-based. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for page fetches. */
export type SummarizeOptions = {
  /** Retries after the first failed attempt (not total attempts). Default 3. */
  retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Default 100. */
  baseDelayMs?: number;
};

/** Net cents for one customer. */
export type CustomerTotal = { customerId: string; totalCents: number };

/** Result of {@link summarizeOrders}. */
export type OrderSummary = {
  /** Sorted by `totalCents` descending, then `customerId` ascending. */
  totals: CustomerTotal[];
  /** Number of pending orders, which are excluded from `totals`. */
  skippedPending: number;
};

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

type RetryPolicy = { retries: number; baseDelayMs: number };

/**
 * Fetches every page from `fetchPage` and sums paid minus refunded cents per customer.
 *
 * Pages are fetched sequentially because each page's number comes from the previous response.
 * Customers whose only orders are pending do not appear in `totals`.
 *
 * @param fetchPage - Page source, called starting at page 1 and following `nextPage`.
 * @param opts - Retry count and base backoff delay for failed page fetches.
 * @returns Per-customer totals and the count of skipped pending orders.
 * @throws {RangeError} If `retries` is not a non-negative integer or `baseDelayMs` is negative.
 * @throws {Error} If a page still fails after all retries; `cause` holds the last failure.
 * @throws {TypeError} If an order has an unknown status.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const policy = resolvePolicy(opts);
  const netByCustomer = new Map<string, number>();
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    const result = await fetchWithRetry(fetchPage, page, policy);
    skippedPending += accumulate(result.items, netByCustomer);
    page = result.nextPage;
  }

  return { totals: sortTotals(netByCustomer), skippedPending };
}

function resolvePolicy(opts: SummarizeOptions): RetryPolicy {
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
  policy: RetryPolicy,
): Promise<OrderPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= policy.retries; attempt++) {
    if (attempt > 0) await sleep(policy.baseDelayMs * 2 ** (attempt - 1));
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

/** Adds each order's signed amount into `netByCustomer`; returns how many were pending. */
function accumulate(orders: readonly Order[], netByCustomer: Map<string, number>): number {
  let pending = 0;
  for (const order of orders) {
    const signed = signedCents(order);
    if (signed === null) {
      pending++;
      continue;
    }
    netByCustomer.set(order.customerId, (netByCustomer.get(order.customerId) ?? 0) + signed);
  }
  return pending;
}

/** Returns the order's contribution to its customer's total, or `null` if it is pending. */
function signedCents(order: Order): number | null {
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

// Code-unit comparison rather than localeCompare so ordering is stable across locales.
function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  if (a.customerId === b.customerId) return 0;
  return a.customerId < b.customerId ? -1 : 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
