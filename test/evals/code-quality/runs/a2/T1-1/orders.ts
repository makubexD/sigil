/**
 * Order summarization — walks a paginated order source and nets paid minus refunded cents per
 * customer, retrying transient page failures with exponential backoff.
 *
 * @module
 */

/** A single order as returned by the paginated order source. */
export type Order = {
  id: string;
  customerId: string;
  /** Non-negative order amount in cents; the status decides whether it adds or subtracts. */
  amountCents: number;
  status: 'paid' | 'pending' | 'refunded';
};

/** One page of orders; `nextPage` is `null` on the last page. */
export type OrderPage = { items: Order[]; nextPage: number | null };

/** Fetches a 1-based page of orders. */
export type FetchOrderPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export type SummarizeOptions = {
  /** Retries after the first failed attempt of a page. Defaults to {@link DEFAULT_RETRIES}. */
  retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Defaults to {@link DEFAULT_BASE_DELAY_MS}. */
  baseDelayMs?: number;
};

/** Net cents for one customer. */
export type CustomerTotal = { customerId: string; totalCents: number };

/** Result of {@link summarizeOrders}. */
export type OrderSummary = { totals: CustomerTotal[]; skippedPending: number };

export const DEFAULT_RETRIES = 3;
export const DEFAULT_BASE_DELAY_MS = 100;
const FIRST_PAGE = 1;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function resolveOptions(opts: SummarizeOptions): Required<SummarizeOptions> {
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
  fetchPage: FetchOrderPage,
  page: number,
  { retries, baseDelayMs }: Required<SummarizeOptions>,
): Promise<OrderPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1));
    try {
      return await fetchPage(page);
    } catch (err) {
      // Every failure is treated as transient; the final one is surfaced as `cause` below.
      lastError = err;
    }
  }
  throw new Error(`Failed to fetch order page ${page} after ${retries + 1} attempts`, { cause: lastError });
}

function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  // Code-unit order rather than localeCompare, so results don't depend on the runtime locale.
  return a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0;
}

function toSortedTotals(totalsByCustomer: Map<string, number>): CustomerTotal[] {
  const totals: CustomerTotal[] = [];
  for (const [customerId, totalCents] of totalsByCustomer) totals.push({ customerId, totalCents });
  return totals.sort(compareTotals);
}

/**
 * Fetches every page starting at page 1 and summarizes orders per customer.
 *
 * Pages are folded into running totals as they arrive, so memory grows with the number of
 * distinct customers rather than the number of orders.
 *
 * @param fetchPage - Fetches a 1-based page; followed via `nextPage` until it is `null`.
 * @param opts - Retry tuning; each page gets `1 + retries` attempts with delays of
 *   `baseDelayMs * 2^n` between them.
 * @returns Paid minus refunded cents per customer, sorted by `totalCents` descending then
 *   `customerId` ascending, plus the number of pending orders that were skipped.
 * @throws {RangeError} If `retries` or `baseDelayMs` is invalid.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 */
export async function summarizeOrders(
  fetchPage: FetchOrderPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retryOptions = resolveOptions(opts);
  const totalsByCustomer = new Map<string, number>();
  let skippedPending = 0;

  for (let page: number | null = FIRST_PAGE; page !== null; ) {
    const { items, nextPage } = await fetchWithRetry(fetchPage, page, retryOptions);
    for (const order of items) {
      if (order.status === 'pending') {
        skippedPending++;
        continue;
      }
      const signedCents = order.status === 'refunded' ? -order.amountCents : order.amountCents;
      totalsByCustomer.set(order.customerId, (totalsByCustomer.get(order.customerId) ?? 0) + signedCents);
    }
    page = nextPage;
  }

  return { totals: toSortedTotals(totalsByCustomer), skippedPending };
}
