/**
 * Order summarization — walks a paginated order source and nets paid minus refunded cents per
 * customer, aggregating page by page so memory scales with customers, not orders.
 *
 * @module
 */

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
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export interface SummarizeOptions {
  /** Retries per page after the first failed attempt. Non-negative integer; default 3. */
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
  /** Sorted by `totalCents` descending, then `customerId` ascending. */
  readonly totals: CustomerTotal[];
  readonly skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Fetches every page from `fetchPage` and summarizes net revenue per customer.
 *
 * Only customers with at least one paid or refunded order appear in `totals`; pending orders
 * are counted in `skippedPending` and otherwise ignored.
 *
 * @param fetchPage - Page source; called sequentially starting at page 1, following `nextPage`.
 * @param opts - Retry count and base backoff delay.
 * @returns Per-customer totals (paid minus refunded) and the number of pending orders.
 * @throws {RangeError} If `retries` is not a non-negative integer or `baseDelayMs` is not a
 *   non-negative finite number.
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

  // Sequential by necessity: each page number comes from the previous response.
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    const { items, nextPage } = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of items) {
      if (order.status === 'pending') {
        skippedPending++;
        continue;
      }
      const current = totalsByCustomer.get(order.customerId) ?? 0;
      totalsByCustomer.set(order.customerId, current + signedAmount(order));
    }
    page = nextPage;
  }

  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({
    customerId,
    totalCents,
  }));
  totals.sort(compareTotals);
  return { totals, skippedPending };
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
      const _exhaustive: never = order.status;
      throw new Error(`Unhandled order status: ${String(_exhaustive)}`);
    }
  }
}

function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  // Code-unit order, not localeCompare, so results don't depend on the host locale.
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
  throw new Error(`Failed to fetch page ${page} after ${retries + 1} attempts`, {
    cause: lastError,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
