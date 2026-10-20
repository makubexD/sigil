/**
 * Order summarization — walks a paginated order source and reduces it to net
 * per-customer totals without holding the full order list in memory.
 *
 * @module
 */

/** A single order as returned by the order source. Amounts are integer cents. */
export type Order = {
  id: string;
  customerId: string;
  amountCents: number;
  status: 'paid' | 'refunded' | 'pending';
};

/** One page of orders. `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches a page of orders by 1-based page number. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export interface SummarizeOptions {
  /** Extra attempts after the first failed fetch of a page. Non-negative integer, default 3. */
  readonly retries?: number;
  /** Delay before the first retry in ms; doubles on each later retry. Default 100. */
  readonly baseDelayMs?: number;
}

/** Net paid-minus-refunded total for one customer. */
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
const FIRST_PAGE = 1;

/**
 * Fetches every page of orders and sums paid minus refunded cents per customer.
 *
 * Pages are fetched sequentially because each page names the next. Only
 * per-customer running totals are retained, so memory scales with the number
 * of customers, not orders. A customer whose only orders are pending does not
 * appear in `totals`.
 *
 * @param fetchPage - Page source; the first page requested is 1.
 * @param opts - Retry count and base backoff delay.
 * @returns Per-customer totals and the count of skipped pending orders.
 * @throws {RangeError} If `retries` is not a non-negative integer or `baseDelayMs` is negative.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 * @throws {TypeError} If an order has a non-integer amount or an unknown status.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts?: SummarizeOptions,
): Promise<OrderSummary> {
  const retries = opts?.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative number, got ${baseDelayMs}`);
  }

  const totalsByCustomer = new Map<string, number>();
  let skippedPending = 0;
  // shortcut: no guard against a source whose nextPage chain cycles; it would loop forever
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    const { items, nextPage } = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of items) {
      if (!Number.isSafeInteger(order.amountCents)) {
        throw new TypeError(`Order ${order.id} has non-integer amountCents ${order.amountCents}`);
      }
      switch (order.status) {
        case 'paid':
          addToTotal(totalsByCustomer, order.customerId, order.amountCents);
          break;
        case 'refunded':
          addToTotal(totalsByCustomer, order.customerId, -order.amountCents);
          break;
        case 'pending':
          skippedPending++;
          break;
        default: {
          const unknownStatus: never = order.status;
          throw new TypeError(`Order ${order.id} has unknown status ${String(unknownStatus)}`);
        }
      }
    }
    page = nextPage;
  }

  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  totals.sort(compareTotals);
  return { totals, skippedPending };
}

// shortcut: totals are plain numbers, exact only while each stays within Number.MAX_SAFE_INTEGER cents
function addToTotal(totals: Map<string, number>, customerId: string, deltaCents: number): void {
  totals.set(customerId, (totals.get(customerId) ?? 0) + deltaCents);
}

// Code-unit comparison instead of localeCompare keeps the order locale-independent
function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
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
    if (attempt > 0) await delay(baseDelayMs * 2 ** (attempt - 1));
    try {
      return await fetchPage(page);
    } catch (err) {
      // Every failure is retryable here; the last one is surfaced as `cause` below
      lastError = err;
    }
  }
  throw new Error(`Failed to fetch order page ${page} after ${retries + 1} attempts`, {
    cause: lastError,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
