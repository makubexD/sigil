/**
 * Order summarization — walks a paginated order source and aggregates net cents per customer
 * without holding all orders in memory.
 *
 * @module
 */

/** A single order as returned by the order source. */
export type Order = {
  readonly id: string;
  readonly customerId: string;
  /** Order amount in integer cents. */
  readonly amountCents: number;
  readonly status: 'paid' | 'refunded' | 'pending';
};

/** One page of orders; `nextPage` is `null` on the last page. */
export type OrderPage = {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
};

/** Fetches a single page of orders. Pages are 1-based. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export type SummarizeOptions = {
  /** Retries per page after the first failed attempt. Default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Default 100. */
  readonly baseDelayMs?: number;
};

/** Net cents for one customer. */
export type CustomerTotal = {
  readonly customerId: string;
  readonly totalCents: number;
};

/** Result of {@link summarizeOrders}. */
export type OrderSummary = {
  /** Sorted by `totalCents` descending, then `customerId` ascending. */
  readonly totals: CustomerTotal[];
  /** Number of orders with status `pending`; they do not affect totals. */
  readonly skippedPending: number;
};

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Fetches every page from `fetchPage` and sums paid minus refunded cents per customer.
 *
 * Pages are fetched sequentially because each page's `nextPage` is only known once it arrives.
 * Orders are folded into a per-customer map as they stream in, so memory scales with the number
 * of customers rather than the number of orders.
 *
 * @param fetchPage - Page source; called with 1, then each returned `nextPage` until `null`.
 * @param opts - Retry count and base backoff delay.
 * @returns Per-customer net totals and the count of skipped pending orders.
 * @throws {RangeError} If `retries` or `baseDelayMs` is negative or not finite.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative finite number, got ${baseDelayMs}`);
  }

  const totalsByCustomer = new Map<string, number>();
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    const result = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of result.items) {
      const delta = signedCents(order);
      if (delta === undefined) {
        skippedPending++;
        continue;
      }
      totalsByCustomer.set(order.customerId, (totalsByCustomer.get(order.customerId) ?? 0) + delta);
    }
    page = result.nextPage;
  }

  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  totals.sort(compareTotals);
  return { totals, skippedPending };
}

/** Contribution of an order to its customer's total, or `undefined` for pending orders. */
function signedCents(order: Order): number | undefined {
  switch (order.status) {
    case 'paid':
      return order.amountCents;
    case 'refunded':
      return -order.amountCents;
    case 'pending':
      return undefined;
    default: {
      const exhaustive: never = order.status;
      throw new Error(`Unhandled order status: ${String(exhaustive)}`);
    }
  }
}

function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  // Code-unit comparison rather than localeCompare so ordering is locale-independent
  if (a.customerId < b.customerId) return -1;
  if (a.customerId > b.customerId) return 1;
  return 0;
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
  throw new Error(`Failed to fetch order page ${page} after ${retries + 1} attempts`, { cause: lastError });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
