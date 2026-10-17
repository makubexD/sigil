/**
 * Order summarization over a paginated order source: fetches every page (with retry and
 * exponential backoff) and folds orders into per-customer net totals without retaining them.
 *
 * @module
 */

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = "paid" | "refunded" | "pending";

/** A single order as returned by the order source. */
export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: OrderStatus;
}

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches a page of orders by 1-based page number. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for page fetches. */
export interface SummarizeOptions {
  /** Retries after the first failed attempt of a page. Default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Default 100. */
  readonly baseDelayMs?: number;
}

/** Net amount for one customer. */
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

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Fetches every page from `fetchPage` and sums paid minus refunded cents per customer.
 *
 * Pages are fetched sequentially because each page's number comes from the previous response.
 * Orders are aggregated as they arrive, so memory grows with the number of customers, not orders.
 * Customers whose only orders are pending do not appear in `totals`.
 *
 * @param fetchPage - Page source, called starting at page 1 until `nextPage` is `null`.
 * @param opts - Retry count and base backoff delay for failing page fetches.
 * @returns Per-customer net totals and the count of skipped pending orders.
 * @throws {RangeError} If `retries` or `baseDelayMs` is not a non-negative integer.
 * @throws {Error} If a page still fails after all retries (`cause` is the last failure), if the
 *   source revisits a page (which would loop forever), or if an order has an unknown status.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  assertNonNegativeInteger("retries", retries);
  assertNonNegativeInteger("baseDelayMs", baseDelayMs);

  const totalsByCustomer = new Map<string, number>();
  const visitedPages = new Set<number>();
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    if (visitedPages.has(page)) {
      throw new Error(`Order source revisited page ${page}`);
    }
    visitedPages.add(page);

    const { items, nextPage } = await fetchPageWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of items) {
      const signedCents = signedAmountCents(order);
      if (signedCents === undefined) {
        skippedPending++;
        continue;
      }
      totalsByCustomer.set(order.customerId, (totalsByCustomer.get(order.customerId) ?? 0) + signedCents);
    }
    page = nextPage;
  }

  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  totals.sort(compareTotals);
  return { totals, skippedPending };
}

/** Contribution of an order to its customer's total, or `undefined` for pending orders. */
function signedAmountCents(order: Order): number | undefined {
  switch (order.status) {
    case "paid":
      return order.amountCents;
    case "refunded":
      return -order.amountCents;
    case "pending":
      return undefined;
    default: {
      const unknownStatus: never = order.status;
      throw new Error(`Order ${order.id} has unknown status: ${String(unknownStatus)}`);
    }
  }
}

async function fetchPageWithRetry(
  fetchPage: FetchPage,
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
  throw new Error(`Failed to fetch page ${page} after ${retries + 1} attempts`, { cause: lastError });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Plain code-unit comparison: deterministic and locale-independent, unlike localeCompare.
function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  if (a.customerId === b.customerId) return 0;
  return a.customerId < b.customerId ? -1 : 1;
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}
