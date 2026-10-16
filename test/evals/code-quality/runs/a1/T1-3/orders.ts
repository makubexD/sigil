/**
 * Order summarization over a paginated order source, with per-page retry and backoff.
 *
 * @module
 */

/** A single order as returned by the order source. */
export type Order = {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: 'paid' | 'refunded' | 'pending';
};

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches a page of orders. Pages are 1-based. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export interface SummarizeOptions {
  /** Retries per page after the first failed attempt. Defaults to 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Defaults to 100. */
  readonly baseDelayMs?: number;
}

/** Net settled amount for one customer. */
export interface CustomerTotal {
  readonly customerId: string;
  readonly totalCents: number;
}

/** Result of {@link summarizeOrders}. */
export interface OrderSummary {
  /** Sorted by `totalCents` descending, then `customerId` ascending. */
  readonly totals: CustomerTotal[];
  /** Number of pending orders, which are excluded from `totals`. */
  readonly skippedPending: number;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
  throw new Error(`Failed to fetch page ${page} after ${retries + 1} attempts`, { cause: lastError });
}

function signedAmount(order: Order): number {
  switch (order.status) {
    case 'paid':
      return order.amountCents;
    case 'refunded':
      return -order.amountCents;
    case 'pending':
      return 0;
    default: {
      const unhandled: never = order.status;
      throw new Error(`Unhandled order status: ${String(unhandled)}`);
    }
  }
}

function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  // Code-unit comparison rather than localeCompare: deterministic across locales and much faster.
  if (a.customerId < b.customerId) return -1;
  return a.customerId > b.customerId ? 1 : 0;
}

/**
 * Fetches every page starting at page 1 and nets paid minus refunded cents per customer.
 *
 * Pages are consumed one at a time and folded into a per-customer map, so memory scales with
 * the number of distinct customers rather than the number of orders.
 *
 * @param fetchPage - Page source; each failing call is retried with exponential backoff
 *   (`baseDelayMs`, `2 * baseDelayMs`, `4 * baseDelayMs`, ...).
 * @param opts - Retry tuning; see {@link SummarizeOptions}.
 * @returns Per-customer totals and the count of skipped pending orders.
 * @throws {RangeError} If `retries` is not a non-negative integer or `baseDelayMs` is negative.
 * @throws {Error} If a page still fails after all retries; `cause` holds the last failure.
 */
export async function summarizeOrders(fetchPage: FetchPage, opts: SummarizeOptions = {}): Promise<OrderSummary> {
  const { retries = DEFAULT_RETRIES, baseDelayMs = DEFAULT_BASE_DELAY_MS } = opts;
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!(baseDelayMs >= 0)) {
    throw new RangeError(`baseDelayMs must be non-negative, got ${baseDelayMs}`);
  }

  const totalsByCustomer = new Map<string, number>();
  let skippedPending = 0;

  // Pages are inherently sequential: each response names the next page to fetch.
  let page: number | null = 1;
  while (page !== null) {
    const { items, nextPage }: OrderPage = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of items) {
      if (order.status === 'pending') {
        skippedPending++;
        continue;
      }
      totalsByCustomer.set(order.customerId, (totalsByCustomer.get(order.customerId) ?? 0) + signedAmount(order));
    }
    page = nextPage;
  }

  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  totals.sort(compareTotals);
  return { totals, skippedPending };
}
