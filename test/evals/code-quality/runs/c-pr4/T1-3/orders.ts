/**
 * Order summary — streams a paginated order source and nets paid against refunded cents per
 * customer, without holding every order in memory.
 *
 * @module
 */

/** Lifecycle state of an order. Only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order. `amountCents` is a non-negative safe integer for every status. */
export type Order = { id: string; customerId: string; amountCents: number; status: OrderStatus };

/** One page of orders; `nextPage` is `null` on the last page. */
export type OrderPage = { items: Order[]; nextPage: number | null };

/** Fetches a page of orders by 1-based page number. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry policy for page fetches. */
export type SummarizeOptions = {
  /** Retries after the first failed attempt per page. Non-negative integer; default 3. */
  retries?: number;
  /** Delay before the first retry; doubles for each further retry. Default 100. */
  baseDelayMs?: number;
};

/** Net cents for one customer: paid minus refunded. May be negative. */
export type CustomerTotal = { customerId: string; totalCents: number };

/** Result of {@link summarizeOrders}. */
export type OrderSummary = { totals: CustomerTotal[]; skippedPending: number };

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

type RetryPolicy = { retries: number; baseDelayMs: number };
type Accumulator = { totals: Map<string, number>; skippedPending: number };

/**
 * Walks every page from page 1 and summarizes orders per customer.
 *
 * Pages are fetched one at a time (each page names the next), and each page is folded into
 * running totals before the next fetch, so memory grows with distinct customers, not orders.
 *
 * @param fetchPage - Source of order pages, starting at page 1.
 * @param opts - Retry policy; a failed page fetch is retried with exponential backoff
 *   (`baseDelayMs`, `2×`, `4×`, …).
 * @returns Totals sorted by `totalCents` descending, then `customerId` ascending (code-unit
 *   order). Customers with only pending orders are omitted. `skippedPending` counts pending orders.
 * @throws {RangeError} If `retries` or `baseDelayMs` is invalid.
 * @throws {TypeError} If an order has an unknown status or an invalid `amountCents`.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const policy = toRetryPolicy(opts);
  const acc: Accumulator = { totals: new Map(), skippedPending: 0 };
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    // Sequential by necessity: the next page number comes from this response.
    const result = await fetchWithRetry(fetchPage, page, policy);
    for (const order of result.items) addOrder(acc, order);
    page = result.nextPage;
  }
  return { totals: sortTotals(acc.totals), skippedPending: acc.skippedPending };
}

function toRetryPolicy(opts: SummarizeOptions): RetryPolicy {
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
    } catch (err) {
      lastError = err;
    }
  }
  const attempts = policy.retries + 1;
  throw new Error(`Failed to fetch page ${page} after ${attempts} attempts`, { cause: lastError });
}

// Global setTimeout rather than node:timers/promises so callers' fake timers apply.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addOrder(acc: Accumulator, order: Order): void {
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    throw new TypeError(`Order ${order.id} has invalid amountCents: ${order.amountCents}`);
  }
  switch (order.status) {
    case 'paid':
      addCents(acc.totals, order.customerId, order.amountCents);
      return;
    case 'refunded':
      addCents(acc.totals, order.customerId, -order.amountCents);
      return;
    case 'pending':
      acc.skippedPending++;
      return;
    default: {
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
  // Plain comparison rather than localeCompare: deterministic across locales and much faster.
  return rows.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
