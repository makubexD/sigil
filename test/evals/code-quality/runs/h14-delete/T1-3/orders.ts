/**
 * Order summaries over a paginated order source: per-customer net revenue and a pending count.
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
export type OrderPage = { items: Order[]; nextPage: number | null };

/** Fetches one page of orders. Pages are numbered from 1. */
export type FetchOrderPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export type SummarizeOptions = {
  /** Retries per page after the first attempt fails. Default 3. */
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
  /** Number of pending orders, which do not contribute to any total. */
  skippedPending: number;
};

/**
 * Walks every page starting at page 1 and sums, per customer, paid minus refunded cents.
 *
 * Pages are fetched sequentially because each page names the next one. Each page is folded into
 * running totals and then dropped, so memory grows with the number of customers rather than the
 * number of orders. Customers whose only orders are pending do not appear in `totals`.
 *
 * @param fetchPage - Fetches one page; retried with exponential backoff when it rejects.
 * @param opts - Retry count and base backoff delay.
 * @returns Per-customer totals and the count of skipped pending orders.
 * @throws {RangeError} If `retries` is not a non-negative integer or `baseDelayMs` is negative.
 * @throws {Error} If a page still fails after all retries (`cause` is the last failure), if a page
 *   number repeats, or if an order has an unknown status or a non-integer/negative amount.
 */
export async function summarizeOrders(
  fetchPage: FetchOrderPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative number, got ${baseDelayMs}`);
  }

  const netCentsByCustomer = new Map<string, number>();
  let skippedPending = 0;
  // A source that loops back to an earlier page would otherwise make us fetch forever.
  const visitedPages = new Set<number>();
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    if (visitedPages.has(page)) throw new Error(`Page ${page} was requested twice`);
    visitedPages.add(page);

    const { items, nextPage } = await fetchPageWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of items) {
      const delta = netCentsOf(order);
      if (delta === undefined) {
        skippedPending++;
        continue;
      }
      netCentsByCustomer.set(order.customerId, (netCentsByCustomer.get(order.customerId) ?? 0) + delta);
    }
    page = nextPage;
  }

  const totals = Array.from(netCentsByCustomer, ([customerId, totalCents]) => ({
    customerId,
    totalCents,
  }));
  totals.sort((a, b) => b.totalCents - a.totalCents || compareCodeUnits(a.customerId, b.customerId));
  return { totals, skippedPending };
}

/** Signed contribution of an order to its customer's total, or `undefined` for pending orders. */
function netCentsOf(order: Order): number | undefined {
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    throw new Error(`Order ${order.id} has invalid amountCents ${order.amountCents}`);
  }
  switch (order.status) {
    case 'paid':
      return order.amountCents;
    case 'refunded':
      return -order.amountCents;
    case 'pending':
      return undefined;
    default: {
      const unknownStatus: never = order.status;
      throw new Error(`Order ${order.id} has unknown status ${String(unknownStatus)}`);
    }
  }
}

// Locale-independent ordering, so results are identical on every machine.
function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

async function fetchPageWithRetry(
  fetchPage: FetchOrderPage,
  page: number,
  retries: number,
  baseDelayMs: number,
): Promise<OrderPage> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchPage(page);
    } catch (err) {
      if (attempt >= retries) {
        throw new Error(`Failed to fetch page ${page} after ${attempt + 1} attempts`, { cause: err });
      }
    }
    await sleep(baseDelayMs * 2 ** attempt);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
