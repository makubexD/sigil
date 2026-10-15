/**
 * Order summarization — walks a paginated order source and reduces it to per-customer net totals
 * without holding the full order list in memory.
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
export type SummarizeOptions = { retries?: number; baseDelayMs?: number };

/** Net total for one customer. */
export type CustomerTotal = { customerId: string; totalCents: number };

/** Result of {@link summarizeOrders}. */
export type OrderSummary = { totals: CustomerTotal[]; skippedPending: number };

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Summarizes every order reachable from `fetchPage`, starting at page 1 and following `nextPage`.
 *
 * Each failing page fetch is retried up to `retries` times, waiting `baseDelayMs * 2^n` before
 * retry `n` (0-based). Pages are aggregated as they arrive, so memory grows with the number of
 * customers, not orders.
 *
 * @param fetchPage - Source of order pages.
 * @param opts - `retries` (default 3) and `baseDelayMs` (default 100).
 * @returns Paid minus refunded cents per customer, sorted by `totalCents` descending then
 *   `customerId` ascending (code-unit order), plus the count of pending orders. Customers with
 *   only pending orders are not listed.
 * @throws {RangeError} If `retries` is not a non-negative integer or `baseDelayMs` is negative.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 * @throws {TypeError} If an order has an unrecognized status.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  validateOptions(retries, baseDelayMs);

  const totals = new Map<string, number>();
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    const result = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    skippedPending += accumulate(totals, result.items);
    page = result.nextPage;
  }
  return { totals: sortTotals(totals), skippedPending };
}

function validateOptions(retries: number, baseDelayMs: number): void {
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!(baseDelayMs >= 0)) {
    throw new RangeError(`baseDelayMs must be non-negative, got ${baseDelayMs}`);
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
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Failed to fetch order page ${page} after ${retries + 1} attempts`, {
    cause: lastError,
  });
}

/** Adds each order's signed amount into `totals`; returns how many pending orders were skipped. */
function accumulate(totals: Map<string, number>, orders: readonly Order[]): number {
  let pending = 0;
  for (const order of orders) {
    switch (order.status) {
      case 'pending':
        pending++;
        break;
      case 'paid':
      case 'refunded': {
        const signed = order.status === 'paid' ? order.amountCents : -order.amountCents;
        totals.set(order.customerId, (totals.get(order.customerId) ?? 0) + signed);
        break;
      }
      default: {
        // Fetched data is not type-checked at runtime; fail rather than silently miscount money
        const unknownStatus: never = order.status;
        throw new TypeError(`Order ${order.id} has unknown status ${String(unknownStatus)}`);
      }
    }
  }
  return pending;
}

function sortTotals(totals: Map<string, number>): CustomerTotal[] {
  const rows = Array.from(totals, ([customerId, totalCents]) => ({ customerId, totalCents }));
  // Plain code-unit comparison keeps ordering deterministic regardless of the host locale
  return rows.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
